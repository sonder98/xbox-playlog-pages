/** Browser-only GitHub workflow dispatch. The user grants only Actions:write for this repository.
 * No access token is ever sent to Pages, stored in Git, or placed in a URL. */
export const githubRepo='https://github.com/sonder98/xbox-playlog-pages';
const api='https://api.github.com/repos/sonder98/xbox-playlog-pages';
export const tokenSetupUrl='https://github.com/settings/personal-access-tokens/new';
export type RunStatus='queued'|'in_progress'|'completed'|'waiting'|'pending'|'requested';
export type WorkflowRun={
 id:number;name:string;display_title:string;status:RunStatus;conclusion:string|null;
 html_url:string;created_at:string;updated_at:string;event:string;
};
type RunList={workflow_runs?:WorkflowRun[]};
const accept='application/vnd.github+json';
const apiVersion='2022-11-28';
export const newSyncRequestId=()=>crypto.randomUUID();
export async function dispatchXboxSync(token:string,requestId:string,request:typeof fetch=fetch):Promise<void>{
 if(!/^github_pat_[a-zA-Z0-9_]+$/.test(token))throw Error('请输入 GitHub fine-grained personal access token。');
 if(!/^[a-f0-9-]{36}$/.test(requestId))throw Error('同步请求 ID 无效。');
 let response:Response;
 try{
  response=await request(api+'/actions/workflows/sync.yml/dispatches',{
   method:'POST',
   headers:{'Accept':accept,'X-GitHub-Api-Version':apiVersion,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({ref:'main',inputs:{request_id:requestId}}),
   cache:'no-store'
  });
 }catch{throw Error('无法连接 GitHub API，请检查网络或在 GitHub Actions 中手动运行。');}
 if(!response.ok){
  if(response.status===401)throw Error('GitHub 令牌无效或已过期，请重新绑定。');
  if(response.status===403)throw Error('无法触发同步：令牌需对 xbox-playlog-pages 拥有 Actions: Read and write 权限；也可能达到 GitHub API 限流。');
  if(response.status===404)throw Error('找不到同步工作流，请确认令牌绑定的是 sonder98/xbox-playlog-pages。');
  if(response.status===422)throw Error('GitHub 拒绝调度请求，请检查 main 分支的同步工作流。');
  throw Error('GitHub 未接受同步请求（HTTP '+response.status+'）。');
 }
}
async function runs(path:string,request:typeof fetch):Promise<WorkflowRun[]>{
 let response:Response;
 try{response=await request(api+path,{headers:{Accept:accept,'X-GitHub-Api-Version':apiVersion},cache:'no-store'});}
 catch{throw Error('获取 GitHub 任务状态失败，请检查网络。');}
 if(!response.ok)throw Error('获取 GitHub 任务状态失败（HTTP '+response.status+'）。');
 const body=await response.json() as RunList;
 return Array.isArray(body.workflow_runs)?body.workflow_runs:[];
}
/** Request IDs travel through the workflow run name; no other user's run is mistaken for ours. */
export async function findWorkflowRun(kind:'sync'|'pages',requestId:string,request:typeof fetch=fetch):Promise<WorkflowRun|undefined>{
 const workflow=kind==='sync'?'sync.yml':'pages.yml';
 const all=await runs('/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&per_page=20',request);
 return all.find(run=>run.event==='workflow_dispatch'&&run.display_title?.includes(requestId));
}
export const githubRunUrl=(run:WorkflowRun)=>run.html_url.startsWith(githubRepo+'/actions/runs/')?run.html_url:githubRepo+'/actions/workflows/sync.yml';
