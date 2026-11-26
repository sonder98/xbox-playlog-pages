import {useEffect,useRef,useState} from 'react';
import {RefreshCw,ArrowUpRight,ShieldCheck} from 'lucide-react';
import {Modal} from './game';
import {manualSyncToken,saveManualSyncToken,clearManualSyncToken,refreshCloudRecords,workflow} from '../vault';
import {dispatchXboxSync,findWorkflowRun,newSyncRequestId,githubRunUrl,tokenSetupUrl,type ManualSyncMode} from '../manual-sync';
import type {RecordData,ArtworkRefresh} from '../data';

type Phase='queued'|'running'|'deploying'|'ready'|'error'|'idle';
type Job={mode?:ManualSyncMode;id:string;requestedAt:number;phase:Phase;runUrl?:string;deployUrl?:string;detail?:string};
const pendingKey='playlog-manual-sync-session-v1';
const isActive=(job:Job|null)=>!!job&&['queued','running','deploying'].includes(job.phase);
const phaseLabel=(phase:Phase)=>({
 idle:'准备同步',queued:'已提交，等待 GitHub 排队',running:'正在读取 Xbox 数据',
 deploying:'正在发布网站数据',ready:'同步完成，数据已更新',error:'同步未完成'
})[phase];

export function ManualSyncDialog({onClose,onUpdated,onPhase,lastAt,mode='sync',lastArtworkRefresh}:{
 onClose:()=>void;onUpdated:(records:RecordData[])=>void;onPhase:(phase:Phase)=>void;lastAt:string|null;mode?:ManualSyncMode;lastArtworkRefresh?:ArtworkRefresh;
}){
 const [known,setKnown]=useState(false),[loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false);
 const [tokenInput,setTokenInput]=useState(''),[error,setError]=useState(''),[job,setJob]=useState<Job|null>(null);
 const token=useRef<string|null>(null),submittingRef=useRef(false);
 async function launch(secret:string){
  if(submittingRef.current||isActive(job))return;
  submittingRef.current=true;setSubmitting(true);setError('');
  try{
   const id=newSyncRequestId(),requestedAt=Date.now();
   await dispatchXboxSync(secret,id,fetch,mode);
   const state:Job={id,requestedAt,phase:'queued',mode};
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
  const id=job!.id,requestedAt=job!.requestedAt,isArtwork=job!.mode==='artwork';
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
    const run=await findWorkflowRun('sync',id,fetch,token.current||undefined);
    // A transient query error should disappear as soon as status polling recovers.
    if(!cancelled)setError('');
    if(!run){update('queued');return;}
    const runUrl=githubRunUrl(run);
    if(run.status!=='completed'){
     update(run.status==='in_progress'?'running':'queued',{runUrl});return;
    }
    if(run.conclusion!=='success'){
     update('error',{runUrl,detail:'GitHub 同步任务 '+(run.conclusion||'未成功')+'。'});
     sessionStorage.removeItem(pendingKey);return;
    }
    const deploy=await findWorkflowRun('pages',id,fetch,token.current||undefined);
    if(!deploy){update('deploying',{runUrl});return;}
    const deployUrl=githubRunUrl(deploy);
    if(deploy.status!=='completed'){update('deploying',{runUrl,deployUrl});return;}
    if(deploy.conclusion!=='success'){
     update('error',{runUrl,deployUrl,detail:'Xbox 同步已成功，但 Pages 发布 '+(deploy.conclusion||'失败')+'。'});
     sessionStorage.removeItem(pendingKey);return;
    }
    const next=await refreshCloudRecords({force:true});
    if(next)onUpdated(next);
    const artwork=next?.find(r=>r.artworkRefresh?.requestId===id)?.artworkRefresh||(lastArtworkRefresh?.requestId===id?lastArtworkRefresh:undefined);
    if(isArtwork&&artwork){
     const partial=artwork.catalogResolved<artwork.catalogTotal||artwork.pendingImages!==0;
     const detail=(partial?'部分图片未能重新获取，已保留可用旧图或官方原图。':'方形封面、详情横图与 Mythic 背景已重新核对并更新缓存。')+' 官方目录 '+artwork.catalogResolved+'/'+artwork.catalogTotal+' 款；'+(artwork.pendingImages===null?'图片缓存结果暂不可用。':artwork.pendingImages+' 个图片源未完全更新。');
     update('ready',{runUrl,deployUrl,detail});sessionStorage.removeItem(pendingKey);
    }else if(!isArtwork&&(next||Date.parse(lastAt||'')>=requestedAt-30_000)){
     update('ready',{runUrl,deployUrl});
     sessionStorage.removeItem(pendingKey);
    }else update('deploying',{runUrl,deployUrl});
   }catch(e){if(!cancelled)setError('状态查询暂时失败：'+(e as Error).message+'。将自动重试。');}
   finally{checking=false;}
  }
  void check();
  const timer=window.setInterval(()=>void check(),25_000);
  return ()=>{cancelled=true;window.clearInterval(timer);};
 },[job?.id,job?.phase==='ready'||job?.phase==='error',lastAt,lastArtworkRefresh,onUpdated]);
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
 const artworkMode=job?job.mode==='artwork':mode==='artwork',requestArtwork=mode==='artwork';
 return <Modal title={artworkMode?'手动刷新游戏封面':'手动同步 Xbox 游戏记录'} onClose={()=>{if(!submittingRef.current)onClose();}} className="manual-sync-dialog">
  <span className="eyebrow">{artworkMode?'GAME ARTWORK':'XBOX LIVE SYNC'}</span>
  <h2>{artworkMode?'刷新游戏封面':'立即同步 Xbox 数据'}</h2>
  {artworkMode&&<p className="muted">重新检查微软澳区商店的方形封面、游戏详情横图和 Mythic 背景，更新图片缓存，同时同步 Xbox 数据。</p>}
  <p className="muted">最近记录：{lastAt?new Date(lastAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'暂无'}。</p>
  {job&&<div className={'manual-sync-progress'+(job.phase==='error'?' is-error':'')} role="status"><span className="dot green"/><div>
   <strong>{artworkMode&&job.phase==='running'?'正在刷新游戏图片':artworkMode&&job.phase==='ready'?'封面刷新任务已完成':phaseLabel(job.phase)}</strong>
   <p>{job.detail||({queued:'GitHub 已接受手动请求，正在等待任务启动。',running:artworkMode?'后台正在核对官方目录并重新获取游戏图片，网页可继续使用。':'后台正在查询 Xbox 数据，网页可继续使用。',deploying:'Xbox 同步成功，等待加密快照部署完成。',ready:'最新记录已载入。',error:'请根据 GitHub Actions 日志排查。',idle:''})[job.phase]}</p>
   {job.runUrl&&<a href={job.runUrl} target="_blank" rel="noreferrer">查看同步任务 ↗</a>}{job.deployUrl&&<a href={job.deployUrl} target="_blank" rel="noreferrer">查看发布任务 ↗</a>}
  </div></div>}
  {!isActive(job)&&!loading&&(known?
   <button className="primary full" disabled={submitting} onClick={()=>token.current&&void launch(token.current)}><RefreshCw size={17} className={submitting?'spin':''}/>{submitting?'提交中…':requestArtwork?(job?.phase==='ready'&&artworkMode?'再次刷新封面':'刷新游戏封面'):job?.phase==='ready'?'再次同步':'立即同步'}</button>:
   <div className="manual-sync-connect">
    <h3>首次授权此设备</h3>
    <p>创建一个仅允许触发此仓库 GitHub Actions 的令牌。它会使用应用密码加密，存放在本机浏览器，不传给 Playlog 或其他服务。</p>
    <a href={tokenSetupUrl} target="_blank" rel="noreferrer">创建 GitHub fine-grained token <ArrowUpRight size={15}/></a>
    <p className="note">Repository access 选择 <strong>Only select repositories → xbox-playlog-pages</strong>；Repository permissions 仅将 <strong>Actions</strong> 设置为 <strong>Read and write</strong>。不要将令牌发送到聊天中。</p>
    <label className="field">GitHub 授权令牌<input type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" aria-label="GitHub fine-grained token" value={tokenInput} onChange={e=>setTokenInput(e.target.value)}/></label>
    <button className="primary full" disabled={submitting||!tokenInput.trim()} onClick={()=>void connect()}>{submitting?'授权并提交中…':requestArtwork?'保存授权并刷新封面':'保存授权并立即同步'}</button>
   </div>
  )}
  {error&&<><p className="inline-error" role="alert">{error}</p>
   {!error.startsWith('状态查询暂时失败：')&&
    <a className="external" href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noreferrer">检查或修改现有 GitHub 令牌权限 <ArrowUpRight size={15}/></a>}</>}
  <div className="manual-sync-links"><a href={workflow} target="_blank" rel="noreferrer">在 GitHub Actions 手动运行 <ArrowUpRight size={15}/></a>
   {(known||error.includes('密码不匹配'))&&<button className="text-button" onClick={disconnect}>移除此设备授权</button>}</div>
  <p className="note"><ShieldCheck size={14} aria-hidden="true"/> 同步可能需要数分钟。关闭弹窗不会取消 GitHub 的任务，再次打开仍可检查进度。GitHub 定时同步独立运行。</p>
 </Modal>;
}
