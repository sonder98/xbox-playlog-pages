import {useEffect,useRef,useState} from 'react';
import {RefreshCw,ArrowUpRight,ShieldCheck} from 'lucide-react';
import {Modal} from './game';
import {manualSyncToken,saveManualSyncToken,clearManualSyncToken,refreshCloudRecords,workflow} from '../vault';
import {dispatchXboxSync,findWorkflowRun,newSyncRequestId,githubRunUrl,tokenSetupUrl} from '../manual-sync';
import type {RecordData} from '../data';

type Phase='queued'|'running'|'deploying'|'ready'|'error'|'idle';
type Job={id:string;requestedAt:number;phase:Phase;runUrl?:string;deployUrl?:string;detail?:string};
const pendingKey='playlog-manual-sync-session-v1';
const isActive=(job:Job|null)=>!!job&&['queued','running','deploying'].includes(job.phase);
const phaseLabel=(phase:Phase)=>({
 idle:'准备同步',queued:'已提交，等待 GitHub 排队',running:'正在读取 Xbox 数据',
 deploying:'正在发布网站数据',ready:'同步完成，数据已更新',error:'同步未完成'
})[phase];

export function ManualSyncDialog({onClose,onUpdated,onPhase,lastAt}:{
 onClose:()=>void;onUpdated:(records:RecordData[])=>void;onPhase:(phase:Phase)=>void;lastAt:string|null;
}){
 const [known,setKnown]=useState(false),[loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false);
 const [tokenInput,setTokenInput]=useState(''),[error,setError]=useState(''),[job,setJob]=useState<Job|null>(null);
 const token=useRef<string|null>(null),submittingRef=useRef(false);
 async function launch(secret:string){
  if(submittingRef.current||isActive(job))return;
  submittingRef.current=true;setSubmitting(true);setError('');
  try{
   const id=newSyncRequestId(),requestedAt=Date.now();
   await dispatchXboxSync(secret,id);
   const state:Job={id,requestedAt,phase:'queued'};
   sessionStorage.setItem(pendingKey,JSON.stringify(state));
   setJob(state);setTokenInput('');
  }catch(e){setError((e as Error).message);}
  finally{setSubmitting(false);submittingRef.current=false;}
 }
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   try{
    const secret=await manualSyncToken();
    if(cancelled)return;
    token.current=secret;setKnown(!!secret);
    const saved=sessionStorage.getItem(pendingKey);
    if(saved){
     try{
      const previous=JSON.parse(saved) as Job;
      if(typeof previous.id==='string'&&Number.isFinite(previous.requestedAt)){
       setJob({...previous,phase:'queued'});return;
      }
     }catch{sessionStorage.removeItem(pendingKey);}
    }
    if(secret)void launch(secret);
   }catch(e){if(!cancelled)setError((e as Error).message);}
   finally{if(!cancelled)setLoading(false);}
  })();
  return ()=>{cancelled=true;};
  // The dialog mounts once per opening; no effects need to restart on status changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{onPhase(job?.phase||'idle');},[job?.phase,onPhase]);
 useEffect(()=>{
  if(!isActive(job))return;
  const id=job!.id,requestedAt=job!.requestedAt;
  let cancelled=false,checking=false;
  const update=(phase:Phase,details:Partial<Job>={})=>{
   if(!cancelled)setJob(s=>s?.id===id?{...s,phase,...details}:s);
  };
  async function check(){
   if(checking||cancelled)return;
   checking=true;
   try{
    if(Date.now()-requestedAt>65*60_000){
     update('error',{detail:'等待超过 65 分钟，请查看 GitHub 运行日志。'});
     sessionStorage.removeItem(pendingKey);return;
    }
    const run=await findWorkflowRun('sync',id);
    if(!run){update('queued');return;}
    const runUrl=githubRunUrl(run);
    if(run.status!=='completed'){
     update(run.status==='in_progress'?'running':'queued',{runUrl});return;
    }
    if(run.conclusion!=='success'){
     update('error',{runUrl,detail:'GitHub 同步任务 '+(run.conclusion||'未成功')+'。'});
     sessionStorage.removeItem(pendingKey);return;
    }
    const deploy=await findWorkflowRun('pages',id);
    if(!deploy){update('deploying',{runUrl});return;}
    const deployUrl=githubRunUrl(deploy);
    if(deploy.status!=='completed'){update('deploying',{runUrl,deployUrl});return;}
    if(deploy.conclusion!=='success'){
     update('error',{runUrl,deployUrl,detail:'Xbox 同步已成功，但 Pages 发布 '+(deploy.conclusion||'失败')+'。'});
     sessionStorage.removeItem(pendingKey);return;
    }
    const next=await refreshCloudRecords();
    if(next)onUpdated(next);
    if(next||Date.parse(lastAt||'')>=requestedAt-30_000){
     update('ready',{runUrl,deployUrl});
     sessionStorage.removeItem(pendingKey);
    }else update('deploying',{runUrl,deployUrl});
   }catch(e){if(!cancelled)setError('状态查询暂时失败：'+(e as Error).message+'。将自动重试。');}
   finally{checking=false;}
  }
  void check();
  const timer=window.setInterval(()=>void check(),25_000);
  return ()=>{cancelled=true;window.clearInterval(timer);};
 },[job?.id,job?.phase==='ready'||job?.phase==='error',lastAt,onUpdated]);
 async function connect(){
  setSubmitting(true);setError('');
  try{
   const value=tokenInput.trim();
   await saveManualSyncToken(value);
   token.current=value;setKnown(true);
   setSubmitting(false);
   await launch(value);
  }catch(e){setError((e as Error).message);setSubmitting(false);}
 }
 function disconnect(){
  clearManualSyncToken();token.current=null;setKnown(false);setTokenInput('');
  setError('此设备的授权已清除。如需使令牌失效，请再到 GitHub 删除它。');
 }
 return <Modal title="手动同步 Xbox 游戏记录" onClose={onClose} className="manual-sync-dialog">
  <span className="eyebrow">XBOX LIVE SYNC</span>
  <h2>立即同步 Xbox 数据</h2>
  <p className="muted">通过官方 Microsoft Xbox 接口读取游戏、时长及成就，随后自动发布并在网页上更新。最近一次记录：{lastAt?new Date(lastAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'暂无'}。</p>
  {job&&<div className={'manual-sync-progress'+(job.phase==='error'?' is-error':'')} role="status"><span className="dot green"/><div>
   <strong>{phaseLabel(job.phase)}</strong>
   <p>{job.detail||({queued:'GitHub 已接受手动请求，正在等待任务启动。',running:'后台正在查询 Xbox 数据，网页可继续使用。',deploying:'Xbox 同步成功，等待加密快照部署完成。',ready:'最新记录已载入。',error:'请根据 GitHub Actions 日志排查。',idle:''})[job.phase]}</p>
   {job.runUrl&&<a href={job.runUrl} target="_blank" rel="noreferrer">查看同步任务 ↗</a>}{job.deployUrl&&<a href={job.deployUrl} target="_blank" rel="noreferrer">查看发布任务 ↗</a>}
  </div></div>}
  {!isActive(job)&&!loading&&(known?
   <button className="primary full" disabled={submitting} onClick={()=>token.current&&void launch(token.current)}><RefreshCw size={17} className={submitting?'spin':''}/>{submitting?'提交中…':job?.phase==='ready'?'再次同步':'立即同步'}</button>:
   <div className="manual-sync-connect">
    <h3>首次授权此设备</h3>
    <p>创建一个仅允许触发此仓库 GitHub Actions 的令牌。它会使用应用密码加密，存放在本机浏览器，不传给 Playlog 或其他服务。</p>
    <a href={tokenSetupUrl} target="_blank" rel="noreferrer">创建 GitHub fine-grained token <ArrowUpRight size={15}/></a>
    <p className="note">Repository access 选择 <strong>Only select repositories → xbox-playlog-pages</strong>；Repository permissions 仅将 <strong>Actions</strong> 设置为 <strong>Read and write</strong>。不要将令牌发送到聊天中。</p>
    <label className="field">GitHub 授权令牌<input type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" aria-label="GitHub fine-grained token" value={tokenInput} onChange={e=>setTokenInput(e.target.value)}/></label>
    <button className="primary full" disabled={submitting||!tokenInput.trim()} onClick={()=>void connect()}>{submitting?'授权并提交中…':'保存授权并立即同步'}</button>
   </div>
  )}
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <div className="manual-sync-links"><a href={workflow} target="_blank" rel="noreferrer">在 GitHub Actions 手动运行 <ArrowUpRight size={15}/></a>
   {known&&<button className="text-button" onClick={disconnect}>移除此设备授权</button>}</div>
  <p className="note"><ShieldCheck size={14} aria-hidden="true"/> 同步可能需要数分钟。关闭弹窗不会取消 GitHub 的任务，再次打开仍可检查进度。GitHub 定时同步独立运行。</p>
 </Modal>;
}
