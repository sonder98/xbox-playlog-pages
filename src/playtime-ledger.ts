/** Privacy-preserving daily playtime sampling. This lives INSIDE the encrypted vault.
 * Xbox MinutesPlayed is cumulative, not a timestamped per-session play log.
 * We only assign positive differences to a calendar day when BOTH measured
 * endpoints are on that same day in Asia/Shanghai. Cross-midnight differences
 * are preserved separately rather than invented as exact daily playtime. */
export const PLAYTIME_TIME_ZONE='Asia/Shanghai' as const;
export const PLAYTIME_SINCE='2026-11-01';
export type PlaytimeSample={id:string;minutes:number;at:string};
export type DailyPlaytimeLedger={
 version:1;timeZone:typeof PLAYTIME_TIME_ZONE;since:typeof PLAYTIME_SINCE;
 latest:Record<string,{at:string;minutes:number}>;
 days:Record<string,Record<string,number>>;
 crossDay:Record<string,Record<string,number>>;
 corrections:Record<string,number>;
};
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const key=(date:string,id:string)=>date+'|'+id;
export function shanghaiDate(at:string):string{
 const time=Date.parse(at);
 if(!Number.isFinite(time))throw Error('游玩时长采样时间无效。');
 return new Date(time+8*3600_000).toISOString().slice(0,10);
}
/** The start time of the Xbox scan; these windows receive a full stats sweep.
 * 23:40–23:59 and 00:00–00:12 (Asia/Shanghai). */
export function boundaryPlaytimeSweep(at:string):boolean{
 const time=Date.parse(at);
 if(!Number.isFinite(time))return false;
 const hhmm=new Date(time+8*3600_000).toISOString().slice(11,16);
 return hhmm>='23:40'||hhmm<='00:12';
}
export function emptyPlaytimeLedger():DailyPlaytimeLedger{
 return {version:1,timeZone:PLAYTIME_TIME_ZONE,since:PLAYTIME_SINCE,
  latest:Object.create(null),days:Object.create(null),crossDay:Object.create(null),corrections:Object.create(null)};
}
function validLedger(value:unknown):value is DailyPlaytimeLedger{
 const d=value as DailyPlaytimeLedger;
 return !!d&&d.version===1&&d.timeZone===PLAYTIME_TIME_ZONE&&d.since===PLAYTIME_SINCE
  &&!!d.latest&&typeof d.latest==='object'&&!Array.isArray(d.latest)
  &&!!d.days&&typeof d.days==='object'&&!Array.isArray(d.days)
  &&!!d.crossDay&&typeof d.crossDay==='object'&&!Array.isArray(d.crossDay)
  &&!!d.corrections&&typeof d.corrections==='object'&&!Array.isArray(d.corrections);
}
export function appendPlaytimeSamples(existing:unknown,samples:PlaytimeSample[]):DailyPlaytimeLedger{
 if(existing!==undefined&&!validLedger(existing))throw Error('加密历史中的每日游玩时长账本格式无效，已停止覆盖。');
 const ledger:DailyPlaytimeLedger=existing?structuredClone(existing as DailyPlaytimeLedger):emptyPlaytimeLedger();
 for(const sample of samples){
  const {id,minutes,at}=sample;
  if(!/^\d{1,15}$/.test(id)||!Number.isSafeInteger(minutes)||minutes<0)continue;
  const date=shanghaiDate(at),ms=Date.parse(at);
  if(date<PLAYTIME_SINCE)continue;
  const previous=ledger.latest[id];
  if(previous&&ms<=Date.parse(previous.at))continue;
  if(previous){
   const delta=minutes-previous.minutes;
   if(delta>0){
    const oldDate=shanghaiDate(previous.at);
    const target=oldDate===date?(ledger.days[date]??={}):(ledger.crossDay[oldDate+'..'+date]??={});
    target[id]=(target[id]??0)+delta;
   }else if(delta<0)ledger.corrections[key(date,id)]=(ledger.corrections[key(date,id)]??0)+1;
  }
  ledger.latest[id]={minutes,at:new Date(ms).toISOString()};
  ledger.days[date]??={};
 }
 return ledger;
}
