// Run on the owner's own computer with Node.js 22+. Password entry stays on Microsoft.
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import readline from 'node:readline/promises';
import {spawn} from 'node:child_process';
const io=readline.createInterface({input:process.stdin,output:process.stdout});
const clientId=(await io.question('输入你自己注册的 Application (client) ID：')).trim();io.close();
if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(clientId))throw Error('Client ID 格式无效。');
const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
const challenge=createHash('sha256').update(verifier).digest('base64url');
let done=false;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 const url=new URL(req.url||'/','http://localhost');
 if(url.pathname!=='/'||req.method!=='GET'){res.writeHead(404);res.end();return;}
 if(done||url.searchParams.get('state')!==state){res.writeHead(403);res.end('State mismatch or authorization already completed.');return;}
 if(url.searchParams.has('error')){res.writeHead(400);res.end('Microsoft authorization was declined or failed. No credentials were saved.');return;}
 const code=url.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing authorization code.');return;}
 done=true;
 try{
  const response=await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier,scope:'XboxLive.signin XboxLive.offline_access'}),signal:AbortSignal.timeout(30000)});
  const token=await response.json();if(!response.ok||typeof token.refresh_token!=='string')throw Error('Microsoft token exchange failed');
  const nonce=randomBytes(16).toString('base64url');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>游迹：本机授权完成</title><body style="font:16px sans-serif;max-width:720px;margin:60px auto;line-height:1.8"><h1>微软授权完成</h1><p>将下面的刷新令牌保存到新展示仓库的 <b>XBOX_REFRESH_TOKEN</b> Secret。不要发到聊天、截图或提交进源码。</p><input id="token" type="password" readonly style="width:95%;padding:12px" value="${escape(token.refresh_token)}"><button id="copy" style="padding:10px;margin-top:12px">复制刷新令牌</button><p id="result"></p><p>另添加 <b>XBOX_CLIENT_ID</b>：${escape(clientId)}。保留已有 <b>APP_PASSWORD</b>。保存后关闭此页面和终端。</p><a href="https://github.com/sonder98/xbox-playlog-pages/settings/secrets/actions" rel="noreferrer" target="_blank">打开 GitHub Secrets</a><script nonce="${nonce}">history.replaceState(null,'','/');document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(document.getElementById('token').value);document.getElementById('result').textContent='已复制，请直接粘贴到 GitHub Secret。'}catch{document.getElementById('token').type='text';document.getElementById('token').select();document.getElementById('result').textContent='请按 Ctrl+C 复制，勿发送到聊天。'}};</script></body></html>`);
  console.log('授权完成。刷新令牌只显示在本机浏览器中，请复制到 GitHub Secret；本程序未写入令牌文件。');
  setTimeout(()=>server.close(),120000).unref();
 }catch{res.writeHead(502);res.end('Microsoft token exchange failed. Check your app registration and retry locally. No token was saved.');console.error('令牌交换失败，请检查原生应用注册和回调地址。');server.close();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const port=server.address().port;
const redirectUri=`http://localhost:${port}`;
const url=new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:'XboxLive.signin XboxLive.offline_access',state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
const args=process.platform==='win32'?['rundll32',['url.dll,FileProtocolHandler',url.href]]:process.platform==='darwin'?['open',[url.href]]:['xdg-open',[url.href]];
const child=spawn(args[0],args[1],{stdio:'ignore'});child.on('error',()=>console.error('无法自动打开浏览器，请换有桌面浏览器的本机环境运行。'));
console.log('已请求打开微软官方登录页。请在浏览器中登录并授权，程序等待本机回调。');
setTimeout(()=>{if(!done){console.error('等待授权超时，请重新运行。');server.close();}},600000).unref();
