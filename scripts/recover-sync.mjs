import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function recoveryPlan(published,release,runs,now=Date.now(),deployFailed=false){
 const remote=Date.parse(release?.latestAt), live=Date.parse(published?.latestAt);
 if(!Number.isFinite(remote)||remote>now+300000)return null;
 const behind=!Number.isFinite(live)||remote>live||
  (remote===live&&release.vaultSha256!==published.vaultSha256);
 const workflow=behind?'pages':'sync';
 if(!behind&&(!Number.isFinite(live)||now-live<90*60000))return null;
 const group=runs[workflow];
 if(group.some(r=>r.status!=='completed'))return null;
 // A newly dispatched deploy may not be visible in Actions yet.
 if(behind&&!deployFailed&&now-remote<10*60000)return null;
 const id='recover-'+workflow+'-'+remote;
 const attempts=group.filter(r=>r.display_title?.endsWith(id+')'));
 if(attempts.length>=2||attempts.some(r=>now-Date.parse(r.created_at)<30*60000))return null;
 return {workflow,id};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8'});
 const repo=process.env.GITHUB_REPOSITORY;
 const published=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const release=JSON.parse(execFileSync(process.execPath,['scripts/live-assets.mjs','release-status'],{encoding:'utf8'}));
 const runs={};
 for(const workflow of ['sync','pages']){
  const pages=JSON.parse(gh('api','--paginate','--slurp',
   'repos/'+repo+'/actions/workflows/'+workflow+'.yml/runs?branch=main&per_page=100&created=%3E%3D'+
    new Date(Math.min(Date.now(),Date.parse(release.latestAt))-3600000).toISOString()));
  runs[workflow]=pages.flatMap(p=>p.workflow_runs);
 }
 const plan=recoveryPlan(published,release,runs,Date.now(),process.env.DEPLOY_FAILED==='true');
 if(plan){
  gh('workflow','run',plan.workflow+'.yml','--ref','main','-f','request_id='+plan.id,'-f',
   plan.workflow==='pages'?'data_only=true':'sync_mechanism=cloudflare');
  console.log('Dispatched bounded recovery for '+plan.workflow);
 }
}
