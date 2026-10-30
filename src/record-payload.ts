/** Lossless detail deduplication inside the encrypted payload; old vaults remain readable. */
const marker='playlog-detail-table-v1';
const detailKeys=['achievements','groups','groupStatus','catalogAt'] as const;
export function compactPayload(payload:any):any{
 if(!payload||!Array.isArray(payload.records)||!payload.records.every((r:any)=>r&&Array.isArray(r.games)))return payload;
 // Avoid changing arbitrary payloads that already use the reserved transport keys.
 if('detailTable' in payload||'recordFormat' in payload||payload.records.some((r:any)=>r.games.some((g:any)=>!g||'detailRef' in g)))return payload;
 const details:any[]=[],keys=new Map<string,number>();
 const records=payload.records.map((record:any)=>({...record,games:record.games.map((game:any)=>{
  const detail:any={},summary={...game};
  for(const key of detailKeys){if(key in game){detail[key]=game[key];delete summary[key];}}
  if(!Object.keys(detail).length)return summary;
  const serialized=JSON.stringify(detail);
  let index=keys.get(serialized);
  if(index===undefined){index=details.length;keys.set(serialized,index);details.push(detail);}
  return {...summary,detailRef:index};
 })}));
 return {...payload,records,recordFormat:marker,detailTable:details};
}
export function expandPayload(payload:any):any{
 if(payload?.recordFormat!==marker)return payload;
 if(!Array.isArray(payload.records)||!Array.isArray(payload.detailTable))throw Error('成就明细索引无效。');
 const {recordFormat:_,detailTable,...rest}=payload;
 return {...rest,records:payload.records.map((record:any)=>{
  if(!Array.isArray(record?.games))throw Error('游戏快照格式无效。');
  return {...record,games:record.games.map((game:any)=>{
   if(!('detailRef' in game))return game;
   const {detailRef,...summary}=game;
   if(!Number.isInteger(detailRef)||detailRef<0||!detailTable[detailRef]||typeof detailTable[detailRef]!=='object')throw Error('成就明细索引缺失。');
   const detail=detailTable[detailRef];
   if(Object.keys(detail).some(key=>!detailKeys.includes(key as typeof detailKeys[number])))throw Error('成就明细索引字段无效。');
   return {...summary,...detail};
  })};
 })};
}
