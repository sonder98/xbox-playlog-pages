import {useEffect,useRef,useState} from 'react';
import {ArrowDown,Check,RefreshCw,RotateCw} from 'lucide-react';
import {recalledPassword} from './device';
import {refreshCloudRecords} from './vault';
import type {RecordData} from './data';

declare const __PLAYLOG_BUILD_ID__:string;
const DISTANCE=82;
type Feedback='idle'|'refreshing'|'done'|'update'|'error';
type UpdateResult='latest'|'updated';
export async function detectSiteUpdate(request:typeof fetch=fetch):Promise<UpdateResult>{
 const response=await request(import.meta.env.BASE_URL+'version.json?check='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw Error('无法检查网站版本（HTTP '+response.status+'）');
 const data=await response.json() as {version?:unknown};
 if(typeof data.version!=='string'||!data.version)throw Error('网站版本信息无效');
 return data.version===__PLAYLOG_BUILD_ID__?'latest':'updated';
}
export function PullToRefresh({onUpdated}:{onUpdated:(records:RecordData[])=>void}){
 const [distance,setDistance]=useState(0);
 const [feedback,setFeedback]=useState<Feedback>('idle');
 const [message,setMessage]=useState('');
 const running=useRef(false);
 const state=useRef({tracking:false,startX:0,startY:0,pull:0,decided:false});
 const onUpdatedRef=useRef(onUpdated);onUpdatedRef.current=onUpdated;
 const feedbackTimer=useRef<number|undefined>(undefined);
 const dismiss=()=>{
  window.clearTimeout(feedbackTimer.current);
  feedbackTimer.current=window.setTimeout(()=>{setFeedback('idle');setMessage('');},2100);
 };
 useEffect(()=>{
  if(!window.matchMedia('(max-width:700px)').matches)return;
  const reset=()=>{state.current.tracking=false;state.current.decided=false;state.current.pull=0;setDistance(0);};
  const begin=(event:TouchEvent)=>{
   if(running.current||event.touches.length!==1||window.scrollY>1)return;
   const target=event.target;
   if(target instanceof Element&&target.closest('input,textarea,select,[role="dialog"],.mobile-nav'))return;
   const finger=event.touches[0];
   state.current={tracking:true,startX:finger.clientX,startY:finger.clientY,pull:0,decided:false};
  };
  const move=(event:TouchEvent)=>{
   const s=state.current;
   if(!s.tracking||event.touches.length!==1)return;
   if(window.scrollY>1){reset();return;}
   const finger=event.touches[0],dx=finger.clientX-s.startX,dy=finger.clientY-s.startY;
   if(!s.decided){
    if(Math.abs(dx)<9&&Math.abs(dy)<9)return;
    s.decided=true;
    if(dy<=0||Math.abs(dx)>=Math.abs(dy)){reset();return;}
   }
   if(dy<=0){reset();return;}
   // Suppress the browser's native overscroll refresh only during a deliberate pull.
   if(event.cancelable)event.preventDefault();
   s.pull=Math.min(115,dy*.68);
   setDistance(s.pull);
  };
  const end=()=>{
   const activated=state.current.tracking&&state.current.pull>=DISTANCE;
   reset();
   if(activated)void runRefresh();
  };
  window.addEventListener('touchstart',begin,{passive:true});
  window.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',end,{passive:true});
  window.addEventListener('touchcancel',reset,{passive:true});
  return()=>{
   window.removeEventListener('touchstart',begin);
   window.removeEventListener('touchmove',move);
   window.removeEventListener('touchend',end);
   window.removeEventListener('touchcancel',reset);
   window.clearTimeout(feedbackTimer.current);
  };
 },[]);
 async function runRefresh(){
  if(running.current)return;
  running.current=true;
  window.clearTimeout(feedbackTimer.current);
  setFeedback('refreshing');setMessage('正在检查数据和新版本…');
  try{
   // Reloads lose in-memory passwords, so only automatically reload app code if
   // the user already opted into the existing remembered-device mechanism.
   const [version,nextRecords]=await Promise.all([detectSiteUpdate(),refreshCloudRecords()]);
   if(nextRecords)onUpdatedRef.current(nextRecords);
   if(version==='updated'){
    const saved=await recalledPassword();
    if(saved){
     await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL).then(reg=>reg?.update()).catch(()=>{});
     window.location.reload();return;
    }
    setFeedback('update');setMessage('新版本已上线，点击更新（需重新解锁）');return;
   }
   setFeedback('done');setMessage(nextRecords?'已加载最新游戏记录':'当前已是最新版本和数据');
   dismiss();
  }catch(e){setFeedback('error');setMessage('刷新失败：'+(e as Error).message);dismiss();}
  finally{running.current=false;}
 }
 return <>
  {(distance>0||feedback!=='idle')&&<div className={'pull-refresh-indicator pull-refresh-'+feedback} role="status"
   data-pull-refresh={feedback} style={{transform:'translate(-50%, '+(distance?Math.round(Math.min(distance*.6,60)):0)+'px)'}}>
   {feedback==='refreshing'?<RefreshCw size={17} className="spin"/>:
    feedback==='done'?<Check size={17}/>:
    feedback==='update'?<RotateCw size={17}/>:
    <ArrowDown size={17} style={{transform:distance>=DISTANCE?'rotate(180deg)':undefined}}/>}
   <span>{feedback==='idle'?distance>=DISTANCE?'松开刷新':'下拉刷新':message}</span>
   {feedback==='update'&&<button className="pull-refresh-install" type="button" onClick={()=>window.location.reload()}>更新</button>}
  </div>}
 </>;
}
