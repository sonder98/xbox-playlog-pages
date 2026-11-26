/** Non-sensitive operational size history; no game data, names or account identifiers. */
export type CapacitySample={day:string;bytes:number;version:1|2};
export type VaultCapacity={bytes:number;version:1|2;limitBytes:number;legacyEquivalentBytes:number;daily:CapacitySample[]};
export function updateCapacity(previous:unknown,at:string,bytes:number,version:1|2,limitBytes:number,legacyEquivalentBytes:number):VaultCapacity{
 const day=new Date(at).toISOString().slice(0,10),cutoff=new Date(Date.parse(at)-89*86400000).toISOString().slice(0,10);
 const prior=(previous as Partial<VaultCapacity>|null)?.daily;
 const samples=new Map<string,CapacitySample>();
 if(Array.isArray(prior))for(const s of prior){
  if(s&&typeof s.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.day)&&s.day>=cutoff&&s.day<=day&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&(s.version===1||s.version===2))samples.set(s.day,{day:s.day,bytes:s.bytes,version:s.version});
 }
 samples.set(day,{day,bytes,version});
 return {bytes,version,limitBytes,legacyEquivalentBytes,daily:[...samples.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-90)};
}
export function capacityWarning(status:unknown):boolean{
 const capacity=(status as {capacity?:VaultCapacity}|null)?.capacity;
 return !!capacity&&Number.isSafeInteger(capacity.bytes)&&Number.isSafeInteger(capacity.limitBytes)&&capacity.limitBytes>0&&capacity.bytes>=capacity.limitBytes*.75;
}
