// Cloudflare Workers Free: only sends a GitHub workflow_dispatch request.
// Existing Microsoft auth, Xbox reads, AES-GCM vault, and Pages publishing
// remain on GitHub Actions. Never put GitHub tokens in this source file.
const endpoint='https://api.github.com/repos/sonder98/xbox-playlog-pages/actions/workflows/sync.yml/dispatches';
export const CRON_RULES=Object.freeze([
 '17,47 0-14,16-23 * * *', // ordinary 30-minute cadence, except the UTC 15h checkpoint
 '42 15 * * *',           // Beijing 23:42: force end-of-day playtime sample
 '2 16 * * *'             // Beijing 00:02: force next-day baseline
]);
export function dispatchRequest(cron){
 if(!CRON_RULES.includes(cron))throw new Error('Unexpected Cron Trigger: '+cron);
 const forceSweep=cron==='42 15 * * *'||cron==='2 16 * * *';
 return {ref:'main',inputs:{force_sweep:forceSweep?'true':'false'}};
}
export async function sendScheduledDispatch(cron,token,request=fetch){
 if(typeof token!=='string'||!token.trim())throw new Error('Missing GITHUB_ACTIONS_TOKEN Worker Secret');
 const payload=dispatchRequest(cron);
 const result=await request(endpoint,{
  method:'POST',
  headers:{
   'Authorization':'Bearer '+token,
   'Accept':'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'XBOX-Playlog-Cloudflare-Cron',
   'Content-Type':'application/json'
  },
  body:JSON.stringify(payload)
 });
 // 204 for classic workflow_dispatch; 200 when the API returns run details.
 if(result.status!==200&&result.status!==204)throw new Error('GitHub workflow dispatch failed (HTTP '+result.status+')');
 return {cron,forceSweep:payload.inputs.force_sweep==='true',status:result.status};
}
export default {
 // No public endpoint to dispatch workflows: only the scheduled handler runs.
 fetch(){return new Response('This Worker accepts scheduled events only.',{status:404});},
 async scheduled(event,env){
  const outcome=await sendScheduledDispatch(event.cron,env.GITHUB_ACTIONS_TOKEN);
  console.log('Xbox sync dispatched',JSON.stringify(outcome));
 }
};
