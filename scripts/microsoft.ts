// Own-app Microsoft OAuth and read-only Xbox REST adapter. Never logs credentials.
export const microsoftTokenUrl='https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const xboxScopes='XboxLive.signin XboxLive.offline_access';
export type DirectConfig={clientId:string;refreshToken:string;clientSecret?:string;onRefreshToken?:(token:string)=>void|Promise<void>};
export async function microsoftProvider(config:DirectConfig,request:typeof fetch=fetch){
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(config.clientId)||!config.refreshToken)throw Error('请先设置自己的 XBOX_CLIENT_ID 和 XBOX_REFRESH_TOKEN。');
 async function json(url:string,init:RequestInit,label:string){
  let r:Response;
  try{r=await request(url,{...init,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error(label+'连接失败。');}
  if(!r.ok)throw Error(`${label} HTTP ${r.status}。`);
  try{const value=await r.json();if(!value||typeof value!=='object')throw Error();return value as any;}catch{throw Error(label+'返回无效 JSON。');}
 }
 const form=new URLSearchParams({client_id:config.clientId,refresh_token:config.refreshToken,grant_type:'refresh_token',scope:xboxScopes});if(config.clientSecret)form.set('client_secret',config.clientSecret);
 const oauth=await json(microsoftTokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form},'微软令牌刷新');
 if(typeof oauth.access_token!=='string')throw Error('微软没有返回访问令牌。');
 if(typeof oauth.refresh_token==='string'&&config.onRefreshToken)await config.onRefreshToken(oauth.refresh_token);
 const authHeaders={'Content-Type':'application/json','x-xbl-contract-version':'1'};
 const user=await json('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers:authHeaders,body:JSON.stringify({RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT',Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+oauth.access_token}})},'Xbox 用户认证');
 if(typeof user.Token!=='string')throw Error('Xbox 用户令牌缺失。');
 const xsts=await json('https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers:authHeaders,body:JSON.stringify({RelyingParty:'http://xboxlive.com',TokenType:'JWT',Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]}})},'Xbox XSTS 认证');
 const hash=xsts.DisplayClaims?.xui?.[0]?.uhs;if(typeof hash!=='string'||typeof xsts.Token!=='string')throw Error('Xbox 授权响应格式不受支持。');
 const authorization=`XBL3.0 x=${hash};${xsts.Token}`;let xuid='';
 return {source:'Xbox',get xuid(){return xuid;},async call(path:string,body?:unknown){
  const local=new URL(path,'https://local.invalid');
  if(local.origin!=='https://local.invalid')throw Error('不支持的 Xbox 只读接口。');
  let url:string,method='GET';
  const continuation=()=>{const params=new URLSearchParams({maxItems:'100'});const next=local.searchParams.get('continuationToken');if(next)params.set('continuationToken',next);return params;};
  if(local.pathname==='/account'&&!body){url='https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayPicRaw';}
  else{
   if(!xuid)throw Error('尚未确认 Xbox 账号身份。');
   if(local.pathname==='/player/titleHistory'&&!body)url=`https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/achievement,image,scid?${continuation()}`;
   else if(/^\/player\/achievements\/[0-9]{1,10}$/.test(local.pathname)&&!body){
    const titleId=local.pathname.split('/').pop()!;if(Number(titleId)<1||Number(titleId)>4294967295)throw Error('Title ID 格式无效。');
    const params=continuation();params.set('titleId',titleId);params.set('unlockedOnly','false');
    url=`https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?${params}`;
   }else if(local.pathname==='/player/stats'&&body){
    const data=body as {xuids?:unknown};
    if(!Array.isArray(data.xuids)||data.xuids.length!==1||data.xuids[0]!==xuid)throw Error('验证程序仅查询当前授权账号。');
    url='https://userstats.xboxlive.com/batch';method='POST';
   }else throw Error('不支持的 Xbox 只读接口。');
  }
  const result=await json(url,{method,headers:{Authorization:authorization,'x-xbl-contract-version':'2','Accept-Language':'zh-CN','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},'Xbox 数据读取');
  if(local.pathname==='/account'){const id=result.profileUsers?.[0]?.id;if(typeof id!=='string'||!/^\d{5,25}$/.test(id))throw Error('无法确认 Xbox 玩家身份。');xuid=id;}
  return result;
 }};
}
