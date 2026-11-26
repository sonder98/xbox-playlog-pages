/** Lossless archive format: one complete newest game state, reverse deltas for
 * older snapshots, and independent achievement metadata/state dictionaries. */
const FORMAT='playlog-delta-v2';
const dynamicKeys=new Set(['unlocked','unlockedAt','rarity','progressPercent']);
type Obj=Record<string,any>;
type Ref=[number,number];
type AwardPatch={length:number;changes:[number,Ref][]};
type GamePatch={set:Obj;drop:string[];awards?:AwardPatch};
type Change=[string,{full:Obj}|GamePatch|null];
const obj=(value:unknown):value is Obj=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const own=(v:Obj,k:string)=>Object.hasOwn(v,k);
function dictionary(){
 const values:Obj[]=[],keys=new Map<string,number>();
 return {values,intern(value:Obj){const key=JSON.stringify(value);let n=keys.get(key);if(n===undefined){n=values.length;values.push(value);keys.set(key,n);}return n;}};
}
function delta(before:Obj,after:Obj):GamePatch{
 const drop=Object.keys(before).filter(k=>!own(after,k));
 const set=Object.fromEntries(Object.entries(after).filter(([k,v])=>!own(before,k)||!same(before[k],v)));
 const patch:GamePatch={set,drop};
 if(Array.isArray(before.achievements)&&Array.isArray(set.achievements)){
  const next=set.achievements as Ref[];
  const changes=next.flatMap((ref,i)=>same(ref,before.achievements[i])?[]:[[i,ref] as [number,Ref]]);
  const awards={length:next.length,changes};
  if(JSON.stringify(awards).length<JSON.stringify(next).length){delete set.achievements;patch.awards=awards;}
 }
 return patch;
}
export function compactPayloadV2(input:unknown):any{
 // Normalize exactly as JSON serialization would, including omitted undefined fields.
 const payload=JSON.parse(JSON.stringify(input));
 if(!obj(payload)||!Array.isArray(payload.records)||own(payload,'recordFormat')||own(payload,'achievementStatic')||own(payload,'achievementState'))return payload;
 if(!payload.records.every((record:any)=>obj(record)&&Array.isArray(record.games)&&
  record.games.every((g:any)=>obj(g)&&typeof g.id==='string'&&(!Array.isArray(g.achievements)||g.achievements.every(obj)))&&
  new Set(record.games.map((g:any)=>g.id)).size===record.games.length))return payload;
 const metadata=dictionary(),state=dictionary();
 let prior=new Map<string,Obj>(),priorOrder:string[]=[];
 const records=payload.records.map((record:any,index:number)=>{
  const {games,...header}=record;
  const order=games.map((g:Obj)=>g.id as string),current=new Map<string,Obj>(),changes:Change[]=[];
  for(const game of games){
   const packed={...game};
   if(Array.isArray(game.achievements))packed.achievements=game.achievements.map((award:Obj)=>{
    const entries=Object.entries(award);
    return [metadata.intern(Object.fromEntries(entries.filter(([k])=>!dynamicKeys.has(k)))),
     state.intern(Object.fromEntries(entries.filter(([k])=>dynamicKeys.has(k))))] as Ref;
   });
   current.set(game.id,packed);
   const before=prior.get(game.id);
   if(!before)changes.push([game.id,{full:packed}]);
   else {const patch=delta(before,packed);if(patch.drop.length||Object.keys(patch.set).length||patch.awards)changes.push([game.id,patch]);}
  }
  for(const id of prior.keys())if(!current.has(id))changes.push([id,null]);
  const result={...header,games:{...(index===0||!same(order,priorOrder)?{order}:{}),changes}};
  prior=current;priorOrder=order;return result;
 });
 return {...payload,records,recordFormat:FORMAT,achievementStatic:metadata.values,achievementState:state.values};
}
function invalid():never{throw Error('增量档案索引缺失或无效。');}
function refAt(table:Obj[],index:unknown):Obj{
 if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=table.length||!obj(table[index]))invalid();
 return table[index];
}
export function expandPayloadV2(payload:any):any{
 if(payload?.recordFormat!==FORMAT)return payload;
 const {recordFormat:_,achievementStatic:metadata,achievementState:state,records,...rest}=payload;
 if(!Array.isArray(metadata)||!Array.isArray(state)||!Array.isArray(records))invalid();
 if(!metadata.every((m:unknown)=>obj(m)&&Object.keys(m).every(k=>!dynamicKeys.has(k)))||
    !state.every((s:unknown)=>obj(s)&&Object.keys(s).every(k=>dynamicKeys.has(k))))invalid();
 const games=new Map<string,Obj>();
 let order:string[]=[];
 // Reuse unchanged decoded games across snapshots (as the legacy detail table did).
 const decoded=new WeakMap<Obj,Obj>();
 const expandGame=(packed:Obj)=>{
  const existing=decoded.get(packed);if(existing)return existing;
  const game={...packed};
  if(Array.isArray(packed.achievements))game.achievements=packed.achievements.map((ref:unknown)=>{
   if(!Array.isArray(ref)||ref.length!==2)invalid();
   return {...refAt(metadata,ref[0]),...refAt(state,ref[1])};
  });
  decoded.set(packed,game);return game;
 };
 return {...rest,records:records.map((record:any,index:number)=>{
  if(!obj(record)||!obj(record.games)||!Array.isArray(record.games.changes))invalid();
  const {games:wire,...header}=record;
  if(own(wire,'order')){
   if(!Array.isArray(wire.order)||wire.order.some((id:unknown)=>typeof id!=='string')||new Set(wire.order).size!==wire.order.length)invalid();
   order=wire.order;
  }else if(index===0)invalid();
  const touched=new Set<string>();
  for(const change of wire.changes){
   if(!Array.isArray(change)||change.length!==2||typeof change[0]!=='string'||touched.has(change[0]))invalid();
   const [id,patch]=change;touched.add(id);
   const before=games.get(id);
   if(patch===null){if(!before)invalid();games.delete(id);continue;}
   if(!obj(patch))invalid();
   let next:Obj;
   if(own(patch,'full')){if(before||!obj(patch.full))invalid();next=patch.full;}
   else{
    if(!before||!obj(patch.set)||!Array.isArray(patch.drop)||patch.drop.some((k:unknown)=>typeof k!=='string'||!own(before,k)))invalid();
    const removed=new Set(patch.drop);
    next={...Object.fromEntries(Object.entries(before).filter(([k])=>!removed.has(k))),...patch.set};
    if(own(patch,'awards')){
     const p=patch.awards;
     if(!obj(p)||!Array.isArray(before.achievements)||own(patch.set,'achievements')||
       !Number.isSafeInteger(p.length)||p.length<0||p.length>100_000||!Array.isArray(p.changes))invalid();
     const list=before.achievements.slice(0,p.length);
     const seen=new Set<number>();
     for(const entry of p.changes){
      if(!Array.isArray(entry)||entry.length!==2||!Number.isInteger(entry[0])||entry[0]<0||entry[0]>=p.length||seen.has(entry[0]))invalid();
      seen.add(entry[0]);list[entry[0]]=entry[1];
     }
     if(list.length!==p.length||Object.keys(list).length!==p.length)invalid();
     next.achievements=list;
    }
   }
   if(next.id!==id)invalid();
   games.set(id,next);
  }
  if(order.length!==games.size)invalid();
  return {...header,games:order.map(id=>{const game=games.get(id);if(!game)invalid();return expandGame(game);})};
 })};
}
