// Microsoft OAuth and Xbox REST adapter. No third-party app identity or browser cookies.
export const microsoftTokenUrl='https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
export const xboxScopes='XboxLive.signin XboxLive.offline_access';
export type DirectConfig={clientId:string;refreshToken:string;clientSecret?:string};
export async function microsoftProvider(config:DirectConfig,request:typeof fetch=fetch){
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(config.clientId)||!config.refreshToken)throw Error('请先设置自己的 XBOX_CLIENT_ID 和 XBOX_REFRESH_TOKEN。');
 async function json(url:string,init:RequestInit,label:string){let r:Response;try{r=await request(url,{...init,signal:AbortSignal.timeout(30000)});}catch{throw Error(label+'连接失败；未覆盖已有记录。');}if(!r.ok)throw Error(`${label} HTTP ${r.status}；授权失效时请重新授权，未覆盖已有记录。`);return r.json() as Promise<any>;}
 const form=new URLSearchParams({client_id:config.clientId,refresh_token:config.refreshToken,grant_type:'refresh_token',scope:xboxScopes});if(config.clientSecret)form.set('client_secret',config.clientSecret);
 const oauth=await json(microsoftTokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form},'微软令牌刷新');
 if(typeof oauth.access_token!=='string')throw Error('微软没有返回访问令牌。');
 const authHeaders={'Content-Type':'application/json','x-xbl-contract-version':'1'};
 const user=await json('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers:authHeaders,body:JSON.stringify({RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT',Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+oauth.access_token}})},'Xbox 用户认证');
 if(typeof user.Token!=='string')throw Error('Xbox 用户令牌缺失。');
 const xsts=await json('https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers:authHeaders,body:JSON.stringify({RelyingParty:'http://xboxlive.com',TokenType:'JWT',Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]}})},'Xbox XSTS 认证');
 const hash=xsts.DisplayClaims?.xui?.[0]?.uhs;if(typeof hash!=='string'||typeof xsts.Token!=='string')throw Error('Xbox 授权响应格式不受支持。');
 const authorization=`XBL3.0 x=${hash};${xsts.Token}`;let xuid='';
 return {source:'Xbox',async call(path:string,body?:unknown){
 let url:string,version='2';
 if(path==='/account'){url='https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayPicRaw';}
 else if(path.startsWith('/player/titleHistory')){if(!/^\d{5,25}$/.test(xuid))throw Error('尚未确认 Xbox 账号身份。');const query=new URL('https://local.invalid'+path).searchParams;const params=new URLSearchParams({maxItems:'100'});const next=query.get('continuationToken');if(next)params.set('continuationToken',next);url=`https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/achievement,image,scid?${params}`;}
 else if(path==='/player/stats'){url='https://userstats.xboxlive.com/batch';}
 else throw Error('不支持的 Xbox 只读接口。');
 const result=await json(url,{method:body?'POST':'GET',headers:{Authorization:authorization,'x-xbl-contract-version':version,'Accept-Language':'zh-CN','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},'Xbox 数据读取');
 if(path==='/account'){const id=result.profileUsers?.[0]?.id;if(typeof id!=='string'||!/^\d{5,25}$/.test(id))throw Error('无法确认 Xbox 玩家身份。');xuid=id;}
 return result;
 }};
}
