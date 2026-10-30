import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('scripts/exophase-page.ts','utf8');
const ast=ts.createSourceFile('reader.ts',source,ts.ScriptTarget.ES2022,true);
const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='readAchievementPage');
const reader=ts.transpileModule(node.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
async function exportCatalogs(readAchievementPage){
 if(location.protocol!=='https:'||location.hostname!=='www.exophase.com'){alert('请先打开 Exophase 的 SondrRope 公开主页，再点击此书签。');return;}
 if(document.getElementById('playlog-catalog-export')){alert('导出工具已经打开。');return;}
 let cancelled=false,skipCurrent=false,resume=null;
 const panel=document.createElement('section');panel.id='playlog-catalog-export';
 Object.assign(panel.style,{position:'fixed',top:'16px',right:'16px',zIndex:'2147483647',width:'340px',maxWidth:'calc(100vw - 32px)',padding:'20px',borderRadius:'18px',background:'#181818',color:'#fff',border:'1px solid #555',font:'14px/1.6 system-ui',boxShadow:'0 8px 40px #0008'});
 const title=document.createElement('strong');title.textContent='游迹 · 公开成就目录导出';panel.append(title);
 const status=document.createElement('p');status.textContent='准备读取公开游戏库…';panel.append(status);
 const controls=document.createElement('div');Object.assign(controls.style,{display:'flex',gap:'8px',flexWrap:'wrap'});panel.append(controls);document.body.append(panel);
 function button(text,action){const b=document.createElement('button');b.textContent=text;Object.assign(b.style,{padding:'8px 12px',borderRadius:'12px',border:'1px solid #666',background:'#282828',color:'#fff',cursor:'pointer'});b.onclick=action;controls.append(b);return b;}
 const proceed=button('继续读取',()=>{if(resume){const r=resume;resume=null;r();}});proceed.hidden=true;
 button('跳过当前游戏',()=>{skipCurrent=true;if(resume){const r=resume;resume=null;r();}});
 button('停止',()=>{cancelled=true;if(resume){const r=resume;resume=null;r();}});
 let popup=window.open('about:blank','playlog-public-catalog','width=1000,height=760');
 const bundle={kind:'exophase-achievement-catalogs',version:1,capturedAt:new Date().toISOString(),catalogs:[],errors:[]};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  if(!popup){status.textContent='请点击按钮打开读取窗口。';await new Promise(resolve=>button('打开读取窗口',()=>{popup=window.open('about:blank','playlog-public-catalog','width=1000,height=760');if(popup)resolve();}));}
  const games=new Map();
  for(let page=1;page<=50&&!cancelled;page++){
   const response=await fetch('https://api.exophase.com/public/player/4285437/games?page='+page+'&environment=xbox&sort=1&showHidden=0',{credentials:'omit'});
   if(!response.ok)throw Error('公开游戏库 HTTP '+response.status);
   const data=await response.json();if(!Array.isArray(data.games))throw Error('公开游戏库格式不符合预期。');
   for(const game of data.games){const raw=game.meta?.endpoint_awards;if(!raw)continue;const url=new URL(raw,'https://www.exophase.com');url.hash='';url.search='';if(url.protocol==='https:'&&url.hostname==='www.exophase.com'&&/^\/game\/[^/]+\/achievements\/?$/.test(url.pathname))games.set(url.href,{source:url.href,name:game.meta?.title||'',total:Number(game.total_awards)||0});}
   if(data.games.length<20)break;
  }
  let index=0;
  for(const game of games.values()){
   if(cancelled)break;if(!popup||popup.closed)throw Error('读取窗口已关闭；已取得的目录仍可保存。');
   index++;skipCurrent=false;status.textContent=index+'/'+games.size+' · '+game.name;popup.location.href=game.source;
   try{
    let ready=false;
    for(let elapsed=0;elapsed<30&&!cancelled&&!skipCurrent;elapsed++){
     await pause(1000);
     try{if(popup.location.href.split('#')[0]===game.source&&popup.document.querySelector('#awards ul.list-unordered-base li.award')){ready=true;break;}}catch{}
    }
    if(cancelled)break;
    if(!ready&&!skipCurrent){
     status.textContent=game.name+'：页面尚未就绪。如果窗口显示安全验证，请自行完成；完成后点击“继续读取”，或跳过当前游戏。';proceed.hidden=false;
     await new Promise(resolve=>{resume=resolve;});proceed.hidden=true;
     if(cancelled)break;
     try{ready=!!popup.document.querySelector('#awards ul.list-unordered-base li.award');}catch{}
    }
    if(skipCurrent||!ready)throw Error('未取得可读取的公开成就列表。');
    const data=readAchievementPage(popup.document.documentElement.outerHTML);
    if(data.achievements.length!==game.total)throw Error('成就总数与目录不一致。');
    bundle.catalogs.push({...game,data});
   }catch(error){bundle.errors.push({source:game.source,message:String(error.message||error)});}
   await pause(500);
  }
 }catch(error){status.textContent=String(error.message||error);}
 if(popup&&!popup.closed)popup.close();
 status.textContent='已取得 '+bundle.catalogs.length+' 个公开目录。'+(bundle.errors.length?' '+bundle.errors.length+' 个未完成。':'')+' 点击保存，把 JSON 文件发给我即可。';
 for(const el of controls.children)el.hidden=true;
 button('保存 JSON 文件',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='exophase-achievement-catalogs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 button('关闭',()=>panel.remove());
}
const bookmark='javascript:'+encodeURIComponent(`(async()=>{${reader};await (${exportCatalogs.toString()})(readAchievementPage);})()`);
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>游迹 · 补充成就分组目录</title><style>:root{color-scheme:dark;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;background:#0f0f0f;color:#fff}*{box-sizing:border-box}body{margin:0;padding:32px 16px}main{max-width:720px;margin:32px auto}h1{font-size:28px;line-height:1.3}p,li{line-height:1.8;color:#b3b3b3}li{margin:16px 0}.card{padding:24px;background:#181818;border-radius:24px;margin:24px 0}.bookmark{display:inline-block;padding:14px 20px;color:#0f0f0f;background:#c7ff2e;border-radius:99px;text-decoration:none;font-weight:600;cursor:grab}a{color:#c7ff2e}.note{font-size:12px;color:#808080}.tag{font-size:12px;letter-spacing:1px;color:#808080}code{color:#ddd}strong{color:white}</style></head><body><main><span class="tag">PLAYLOG · PUBLIC CATALOG</span><h1>补充一次目录，日常自动更新解锁状态。</h1><p>云端访问成就详情页会遇到 Exophase 安全验证。这个工具只在你正常访问该网站的电脑浏览器中读取公开目录，不会上传登录状态。</p><section class="card"><h2>在电脑浏览器操作</h2><ol><li>把下面的绿色按钮<strong>拖到浏览器书签栏</strong>，保存为书签。</li><li>打开 <a href="https://www.exophase.com/xbox/user/SondrRope/" target="_blank" rel="noreferrer">SondrRope 的 Exophase 公开主页</a>，在该页点击刚才保存的书签。</li><li>保留弹出的读取窗口；工具逐个读取公开游戏目录，可能需要几分钟。若遇到安全验证，由你在窗口内处理，或跳过该游戏。</li><li>完成后点击<strong>保存 JSON 文件</strong>，将文件发给我。我会校验并接入自动同步。</li></ol><a id="bookmark" class="bookmark" href="#">拖到书签栏：导出公开成就目录</a><p class="note">此按钮用于拖成书签；请在 Exophase 页面点击保存后的书签。</p></section><section class="card"><h2>导出的内容</h2><p>只包含游戏目录、本体／DLC／更新分组、成就名称、描述、图片、稀有度和公共成就编号。不读取 Cookie、应用密码或浏览器存储，不上传任何文件，不记录玩家解锁时间。</p><p class="note">普通解锁进度继续每天自动同步。新增游戏或 DLC 导致目录变化时，可能需要再次补充目录；未完成或总数不一致的游戏不会被猜填。</p></section></main><script>document.getElementById('bookmark').href=${JSON.stringify(bookmark)};</script></body></html>`;
fs.writeFileSync('public/catalog-export.html',html);
console.log('Generated public catalog exporter; bookmark bytes:',bookmark.length);
