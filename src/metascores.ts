export type PcMetascore={score:number;platform:'PC';checkedAt:string;note?:string};
export type PcMetascores=Record<string,PcMetascore>;
export function validPcScore(score:unknown):score is number{
 return typeof score==='number'&&Number.isInteger(score)&&score>=0&&score<=100;
}
export function validatedPcMetascores(input:unknown):PcMetascores{
 const out:PcMetascores={};
 if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [id,raw]of Object.entries(input)){
  const value=raw as Partial<PcMetascore>;
  if(!/^[0-9]+$/.test(id)||id.length>20||!value||value.platform!=='PC'||!validPcScore(value.score)||typeof value.checkedAt!=='string')continue;
  out[id]={score:value.score,platform:'PC',checkedAt:value.checkedAt,...(typeof value.note==='string'&&value.note.length<=200?{note:value.note}:{})};
 }
 return out;
}
