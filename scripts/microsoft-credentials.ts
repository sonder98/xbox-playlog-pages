import {microsoftProvider,type DirectConfig} from './microsoft.ts';
import {deviceAuthorization} from './microsoft-device.ts';
import {readState,writeState,validateAuth,type AuthState} from './microsoft-state.ts';
export async function credentials(env:NodeJS.ProcessEnv,allowLogin=false):Promise<{config:DirectConfig;state:AuthState;save:()=>void}>{
 const password=env.MICROSOFT_STATE_KEY||'';
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(password))throw Error('微软私有缓存缺少有效的 MICROSOFT_STATE_KEY。');
 const root=env.MICROSOFT_STATE_DIR||'.private/microsoft',file=root+'/auth.json';
 const clientId=env.XBOX_CLIENT_ID||'';
 let state:AuthState|undefined;
 try{state=readState(file,password);}catch(error){if(!(allowLogin&&env.XBOX_REAUTHORIZE==='true'))throw error;}
 if(state)state=validateAuth(state,clientId||undefined);
 if(!state&&env.XBOX_REFRESH_TOKEN&&clientId)state={version:1,clientId,refreshToken:env.XBOX_REFRESH_TOKEN,updatedAt:new Date().toISOString()};
 if(allowLogin&&clientId&&(env.XBOX_REAUTHORIZE==='true'||!state)){
  const refreshToken=await deviceAuthorization(clientId,info=>{
   console.log('Microsoft verification URL: '+info.verificationUri);console.log('Microsoft user code: '+info.userCode);console.log('请确认应用是 Playlog，使用自己的 Xbox 账号授权。登录码最多有效 10 分钟。');
  });state={version:1,clientId,refreshToken,updatedAt:new Date().toISOString()};
 }
 if(!state)throw Error('微软尚未持久授权。请手动运行 Microsoft shadow sync 并填写自己的 Client ID。');
 const auth=state;const save=()=>writeState(file,auth,password);
 save();
 return {state:auth,save,config:{clientId:auth.clientId,refreshToken:auth.refreshToken,clientSecret:env.XBOX_CLIENT_SECRET||undefined,onRefreshToken:token=>{auth.refreshToken=token;auth.updatedAt=new Date().toISOString();save();}}};
}
export async function confirmOwner(env:NodeJS.ProcessEnv,allowLogin=false){
 const session=await credentials(env,allowLogin),provider=await microsoftProvider(session.config);await provider.call('/account');
 if(session.state.owner&&session.state.owner!==provider.xuid)throw Error('微软续期账号发生变化；停止同步。');
 session.state.owner=provider.xuid;session.save();return session;
}
