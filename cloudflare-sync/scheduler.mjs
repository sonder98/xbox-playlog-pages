// Cloudflare Workers Free: only sends a GitHub workflow_dispatch request.
// Existing Microsoft auth, Xbox reads, AES-GCM vault, and Pages publishing
// remain on GitHub Actions. Never put GitHub tokens in this source file.
const endpoint='https://api.github.com/repos/sonder98/xbox-playlog-pages/actions/workflows/sync.yml/dispatches';
export const CRON_RULES=Object.freeze(['17 * * * *','42 15 * * *','2 16 * * *']);
const LEGACY_TWO_HOUR_CRON='17 */2 * * *';
const retryable=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function retryDelay(response,attempt){
 const raw=response?.headers.get('retry-after');
 if(raw){const seconds=Number(raw);if(Number.isFinite(seconds)&&seconds>=0)return Math.min(30000,Math.max(250,seconds*1000));const date=Date.parse(raw);if(Number.isFinite(date))return Math.min(30000,Math.max(250,date-Date.now()));}
 return [1000,2500,6000][Math.min(attempt-1,2)];
}
export function dispatchRequest(cron){
 if(!CRON_RULES.includes(cron)&&cron!==LEGACY_TWO_HOUR_CRON)throw new Error('Unexpected Cron Trigger: '+cron);
 const forceSweep=cron==='42 15 * * *'||cron==='2 16 * * *';
 return {ref:'main',inputs:{force_sweep:forceSweep?'true':'false',sync_mechanism:forceSweep?'day-boundary':'cloudflare'}};
}
export async function sendScheduledDispatch(cron,token,request=fetch,options={}){
 if(typeof token!=='string'||!token.trim())throw new Error('Missing GITHUB_ACTIONS_TOKEN Worker Secret');
 const payload=dispatchRequest(cron),pause=options.pause||sleep,maxAttempts=Math.max(1,Math.min(5,options.maxAttempts??4));
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  let response;
  try{response=await request(endpoint,{method:'POST',headers:{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'XBOX-Playlog-Cloudflare-Cron','Content-Type':'application/json'},body:JSON.stringify(payload)});}
  catch{if(attempt<maxAttempts){await pause(retryDelay(undefined,attempt));continue;}throw new Error('GitHub workflow dispatch connection failed after retries.');}
  if(response.status===200||response.status===204)return {cron,forceSweep:payload.inputs.force_sweep==='true',status:response.status};
  if(retryable.has(response.status)&&attempt<maxAttempts){await pause(retryDelay(response,attempt));continue;}
  throw new Error('GitHub workflow dispatch failed (HTTP '+response.status+')');
 }
 throw new Error('GitHub workflow dispatch failed after retries.');
}
export default {
 fetch(){return new Response('This Worker accepts scheduled events only.',{status:404});},
 async scheduled(event,env){const outcome=await sendScheduledDispatch(event.cron,env.GITHUB_ACTIONS_TOKEN);console.log('Xbox sync dispatched',JSON.stringify(outcome));}
};
