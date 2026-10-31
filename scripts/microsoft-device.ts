import {microsoftTokenUrl,xboxScopes} from './microsoft.ts';
export async function deviceAuthorization(clientId:string,challenge:(info:{userCode:string;verificationUri:string})=>void,request:typeof fetch=fetch,sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(clientId))throw Error('微软应用 Client ID 格式无效。');
 const post=async(url:string,body:URLSearchParams)=>{
  try{const response=await request(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30000)});const data=await response.json();return {response,data};}
  catch{throw Error('微软设备授权请求失败。');}
 };
 const first=await post('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',new URLSearchParams({client_id:clientId,scope:xboxScopes}));
 const errors=['invalid_request','invalid_client','invalid_scope','unauthorized_client','access_denied','invalid_grant','unsupported_grant_type'];
 const diagnostic=(response:Response,data:any)=>'HTTP '+response.status+(errors.includes(data.error)?' '+data.error:'')+(Array.isArray(data.error_codes)?' codes='+data.error_codes.filter((v:any)=>Number.isInteger(v)&&v>0&&v<1000000000).slice(0,4).join(','):'');
 if(!first.response.ok||typeof first.data.device_code!=='string'||!/^[-A-Z0-9]{6,20}$/.test(first.data.user_code)||!Number.isFinite(first.data.expires_in))throw Error('微软没有接受设备授权（'+diagnostic(first.response,first.data)+'），请检查应用类型、公共客户端流与 scope。');
 // The public user code is only a sign-in challenge; the private device code never leaves memory.
 challenge({userCode:first.data.user_code,verificationUri:'https://microsoft.com/devicelogin'});
 let interval=Math.max(5,Number(first.data.interval)||5),elapsed=0;
 const expiry=Math.min(600,first.data.expires_in);
 while(elapsed+interval<=expiry){
  await sleep(interval*1000);elapsed+=interval;
  const {response,data}=await post(microsoftTokenUrl,new URLSearchParams({client_id:clientId,grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:first.data.device_code}));
  if(response.ok&&typeof data.refresh_token==='string')return data.refresh_token as string;
  if(data.error==='authorization_pending')continue;
  if(data.error==='slow_down'){interval=Math.min(60,interval+5);continue;}
  const reason=data.error==='authorization_declined'?'用户取消授权':data.error==='expired_token'?'授权码已过期':'微软未接受设备登录';
  throw Error('微软设备授权失败：'+reason+'（'+diagnostic(response,data)+'）。');
 }
 throw Error('微软设备授权超时，请重新运行验证任务。');
}
