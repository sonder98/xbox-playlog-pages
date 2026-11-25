/** Public operational metadata only, never game/account information. */
export type BoundaryCoverage={trackingSince:string;observed:string[]};
const dayMs=86_400_000, minuteMs=60_000;
export function boundarySlot(at:string):string|null{
 const t=Date.parse(at);
 if(!Number.isFinite(t))return null;
 const date=new Date(t),day=date.toISOString().slice(0,10);
 const m=date.getUTCHours()*60+date.getUTCMinutes();
 return m>=940&&m<960?day+'T15:42:00.000Z':m>=960&&m<977?day+'T16:02:00.000Z':null;
}
export function updateBoundaryCoverage(previous:unknown,at:string,observed:boolean):BoundaryCoverage{
 const p=previous as Partial<BoundaryCoverage>|null;
 const trackingSince=typeof p?.trackingSince==='string'&&Number.isFinite(Date.parse(p.trackingSince))?p.trackingSince:at;
 const cutoff=Date.parse(at)-7*dayMs;
 const slots=Array.isArray(p?.observed)?p.observed.filter(s=>typeof s==='string'&&Date.parse(s)>=cutoff&&Date.parse(s)<=Date.parse(at)+2*minuteMs):[];
 const slot=observed?boundarySlot(at):null;
 if(slot)slots.push(slot);
 return {trackingSince,observed:[...new Set(slots)].sort()};
}
export function syncHealth(status:unknown,now=Date.now()){
 const s=status as {initialized?:boolean;latestAt?:string;boundaryCoverage?:BoundaryCoverage}|null;
 const at=Date.parse(s?.latestAt||'');
 if(!s?.initialized||!Number.isFinite(at)||at>now+5*minuteMs)return {level:'critical',message:'Published sync marker unavailable or invalid.',missing:[] as string[]};
 const age=Math.max(0,Math.floor((now-at)/minuteMs));
 const missing:string[]=[];
 const coverage=s.boundaryCoverage;
 if(coverage&&Array.isArray(coverage.observed)){
  const start=Date.parse(coverage.trackingSince);
  const expected:string[]=[];
  for(let i=0;i<=2;i++){
   const day=new Date(now-i*dayMs).toISOString().slice(0,10);
   for(const suffix of ['T15:42:00.000Z','T16:02:00.000Z']){
    const slot=day+suffix,t=Date.parse(slot);
    if(t>=start&&t<=now-90*minuteMs)expected.push(slot);
   }
  }
  for(const slot of expected.sort().slice(-2))if(!coverage.observed.includes(slot))missing.push(slot);
 }
 const level=age>=360?'critical':age>=180?'error':age>=90||missing.length?'warning':'healthy';
 return {level,message:'Latest published Xbox snapshot: '+age+' minutes old.'+(missing.length?' Boundary scan not observed for '+missing.join(', ')+'.':''),missing};
}
