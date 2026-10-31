import {appendFileSync,writeFileSync} from 'node:fs';
import {probeMicrosoft} from './microsoft-probe.ts';
import {deviceAuthorization} from './microsoft-device.ts';
const summary=(text:string)=>{console.log(text);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text+'\n');};
const clientId=process.env.XBOX_CLIENT_ID||'';let refreshToken=process.env.XBOX_REFRESH_TOKEN||'';
if(clientId&&!refreshToken&&process.env.XBOX_DEVICE_LOGIN==='true'){
 try{refreshToken=await deviceAuthorization(clientId,info=>{
  console.log('请在自己的浏览器打开 '+info.verificationUri+'，输入代码：'+info.userCode+'，确认应用是你自己注册的 Playlog 应用后，使用目标 Xbox 账号授权。代码最多有效 10 分钟。');
 });}catch{summary('微软设备授权未完成。未输出上游响应或凭据，未修改现有网站。');process.exitCode=2;}
}
if(!clientId||!refreshToken){
 summary('微软直连验证：BLOCKED。需要自己的 Client ID 和微软账号授权。可使用 Run workflow 填入 Client ID 完成设备登录，或配置 XBOX_CLIENT_ID / XBOX_REFRESH_TOKEN。当前 Exophase 同步未受影响。');
 process.exitCode=2;
}else{
 try{
  const report=await probeMicrosoft({clientId,refreshToken,clientSecret:process.env.XBOX_CLIENT_SECRET||undefined});
  summary('微软直连验证：已完成真实账号调用（只读）。');
  summary(JSON.stringify(report,null,2));
  if(process.env.PROBE_REPORT_PATH)writeFileSync(process.env.PROBE_REPORT_PATH,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(!report.sampledTitles||report.issues.length||report.achievementSamples.some(s=>!s.read||!s.complete))process.exitCode=1;
 }catch(error){
  // Upstream bodies and credentials are never printed; provider errors contain fixed stage labels.
  const message=error instanceof Error?error.message:'';
  const safe=/^(微软|Xbox|尚未确认|无法确认|续期后的账号|请先设置)/.test(message)?message:'验证程序未通过，未输出上游响应或凭据。';
  summary('微软直连验证：FAILED。'+safe);process.exitCode=1;
 }
}
