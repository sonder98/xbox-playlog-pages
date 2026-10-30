import {decryptVault,encryptVault} from './crypto';
import {validateRecord,type RecordData} from './data';
export const repo='https://github.com/sonder98/xbox-playlog-pages';
export const workflow=repo+'/actions/workflows/pages.yml';
let records:RecordData[]=[],password='';
const localKey='playlog-pages-encrypted-imports-v1';
export async function unlock(secret:string,envelope:unknown){const payload=await decryptVault(envelope,secret);if(!Array.isArray(payload.records))throw Error('记录内容无效。');const cloud=payload.records.map((r:any)=>{const valid=validateRecord(r);if(typeof r.id!=='string'||!Number.isFinite(Date.parse(r.at)))throw Error('记录时间无效。');return {...valid,id:r.id,at:r.at};});const local=localStorage.getItem(localKey);let extra:RecordData[]=[];if(local){try{extra=(await decryptVault(JSON.parse(local),secret)).records||[]}catch{throw Error('本机加密导入记录与当前密码不匹配，请先导出或清除本机记录。');}}password=secret;records=[...new Map([...extra,...cloud].map(r=>[r.id,r])).values()].sort((a,b)=>b.at.localeCompare(a.at));}
export function lock(){records=[];password='';}
export async function api(path:string,body?:any):Promise<any>{if(!password)throw Error('请先解锁游戏档案。');if(path==='/api/records'&&!body)return {records};if(path==='/api/records'&&body){const data=validateRecord(body);if(records[0]&&records[0].profile.xuid!==data.profile.xuid)throw Error('导入记录属于另一个 Xbox 账号。');const record={...data,id:crypto.randomUUID(),at:new Date().toISOString()};const existing=localStorage.getItem(localKey);const imported=existing?(await decryptVault(JSON.parse(existing),password)).records:[];localStorage.setItem(localKey,JSON.stringify(await encryptVault({records:[record,...imported]},password)));records=[record,...records];return {record};}throw Error('此功能已迁移到 GitHub 同步任务。');}
