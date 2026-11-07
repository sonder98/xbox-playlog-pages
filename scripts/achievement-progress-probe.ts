// One-time read-only diagnostic: only publish the matched achievement's numeric progress.
// Never log Xbox authorization, user IDs, profile, or unrelated games.
import {credentials} from './microsoft-credentials.ts';
import {microsoftProvider} from './microsoft.ts';
import {collectPages} from './microsoft-probe.ts';

const session=await credentials(process.env);
try{
 const provider=await microsoftProvider(session.config);
 await provider.call('/account');
 if(session.state.owner&&session.state.owner!==provider.xuid)throw Error('Xbox account owner mismatch');
 session.state.owner=provider.xuid;
 session.save();

 const history=await collectPages(token=>provider.call('/player/titleHistory'+
  (token?'?continuationToken='+encodeURIComponent(token):'')),'titles');
 const title=history.values.find(t=>/forza\s*horizon\s*4/i.test(String(t.name||'')));
 if(!title)throw Error('Forza Horizon 4 not found in authorized title history');
 const id=String(title.titleId);
 if(!/^\d{1,10}$/.test(id))throw Error('Unexpected title identity');
 const label=/jolly\s+cooperation|欢乐并肩|合作无间/i;
 let success=false;
 for(const version of ['6','4','2']){
  for(const possible of [false,true]){
   const url='/player/achievements/'+id+'?contractVersion='+version+'&possibleOnly='+possible;
   try{
    const data=await collectPages(token=>provider.call(url+
     (token?'&continuationToken='+encodeURIComponent(token):'')),'achievements');
    const matched=data.values.find(a=>label.test(String(a.name||'')));
    if(!matched){
     console.log('FH4_PROGRESS_PROBE '+JSON.stringify({version,possible,found:false,achievementCount:data.values.length}));
     continue;
    }
    success=true;
    const req=Array.isArray(matched.progression?.requirements)?matched.progression.requirements:[];
    const requirements=req.slice(0,5).map((r:any)=>{
     const current=(typeof r.current==='string'||typeof r.current==='number')?Number(r.current):NaN;
     const target=(typeof r.target==='string'||typeof r.target==='number')?Number(r.target):NaN;
     return {current:Number.isFinite(current)?current:null,target:Number.isFinite(target)?target:null,
      percent:Number.isFinite(current)&&Number.isFinite(target)&&target>0?
       Math.round(current/target*10000)/100:null};
    });
    console.log('FH4_PROGRESS_PROBE '+JSON.stringify({version,possible,found:true,
     progressState:String(matched.progressState||''),requirements,
     progressionKeys:Object.keys(matched.progression||{}).slice(0,10),
     requirementKeys:req.length?Object.keys(req[0]).slice(0,10):[]}));
   }catch(e){
    console.log('FH4_PROGRESS_PROBE '+JSON.stringify({version,possible,error:(e instanceof Error?e.message:'request failed').replace(/\d{7,}/g,'[redacted]')}));
   }
  }
  if(success)break;
 }
 if(!success)throw Error('Target achievement not found in official API');
}finally{session.save();}
