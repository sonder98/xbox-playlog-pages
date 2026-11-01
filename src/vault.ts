import {decryptVault,encryptVault} from './crypto';
import {readDisplayPreferences,saveDisplayPreferences,normalizeDisplayPreferences,type DisplayPreferences} from './display-preferences';
import {validateRecord,type RecordData} from './data';
import type {DailyPlaytimeLedger} from './playtime-ledger';
import {validatedPcMetascores,type PcMetascores} from './metascores';
export const repo='https://github.com/sonder98/xbox-playlog-pages';
export const workflow=repo+'/actions/workflows/sync.yml';
let records:RecordData[]=[],password='',cloudLatestAt='';
let dailyPlaytime:DailyPlaytimeLedger|null=null;
let pcMetascores:PcMetascores={};
let designPreferences:DisplayPreferences|null=null;
const localKey='playlog-pages-encrypted-imports-v1';
export async function unlock(secret:string,envelope:unknown){const payload=await decryptVault(envelope,secret);if(!Array.isArray(payload.records))throw Error('记录内容无效。');const cloud=payload.records.map((r:any)=>{const valid=validateRecord(r);if(typeof r.id!=='string'||!Number.isFinite(Date.parse(r.at)))throw Error('记录时间无效。');return {...valid,id:r.id,at:r.at};});const local=localStorage.getItem(localKey);let extra:RecordData[]=[];if(local){try{extra=(await decryptVault(JSON.parse(local),secret)).records||[]}catch{throw Error('本机加密导入记录与当前密码不匹配，请先导出或清除本机记录。');}}password=secret;cloudLatestAt=cloud[0]?.at||'';dailyPlaytime=payload.playtimeLedger||null;pcMetascores=validatedPcMetascores(payload.metacriticScores);records=[...new Map([...extra,...cloud].map(r=>[r.id,r])).values()].sort((a,b)=>b.at.localeCompare(a.at));}
export function lock(){records=[];password='';cloudLatestAt='';dailyPlaytime=null;pcMetascores={};}
export function pcMetascoresForDisplay(){return pcMetascores;}
export function playtimeLedgerForBackup(){return dailyPlaytime;}
export async function api(path:string,body?:any):Promise<any>{if(!password)throw Error('请先解锁游戏档案。');if(path==='/api/records'&&!body)return {records};if(path==='/api/display-preferences'){if(import.meta.env.DEV&&designPreferences){if(body)designPreferences=normalizeDisplayPreferences(body);return designPreferences;}const xuid=records[0]?.profile.xuid;if(!xuid)throw Error('请先读取游戏档案。');return body?saveDisplayPreferences(xuid,password,body,localStorage):readDisplayPreferences(xuid,password,localStorage);}if(path==='/api/records'&&body){const data=validateRecord(body);if(records[0]&&records[0].profile.xuid!==data.profile.xuid)throw Error('导入记录属于另一个 Xbox 账号。');const record={...data,id:crypto.randomUUID(),at:new Date().toISOString()};const existing=localStorage.getItem(localKey);const imported=existing?(await decryptVault(JSON.parse(existing),password)).records:[];localStorage.setItem(localKey,JSON.stringify(await encryptVault({records:[record,...imported]},password)));records=[record,...records];return {record};}throw Error('此功能已迁移到 GitHub 同步任务。');}


// Fine-grained GitHub Actions token; encrypted with the same app password in this browser only.
const syncTokenKey='xbox-playlog-manual-sync-token-v1';
export async function manualSyncToken():Promise<string|null>{
 if(!password)throw Error('请先解锁档案。');
 const saved=localStorage.getItem(syncTokenKey);
 if(!saved)return null;
 try{
  const data=await decryptVault(JSON.parse(saved),password);
  return typeof data.token==='string'&&data.token.startsWith('github_pat_')?data.token:null;
 }catch{throw Error('GitHub 授权与当前档案密码不匹配，请移除旧授权后重新绑定。');}
}
export async function saveManualSyncToken(token:string):Promise<void>{
 if(!password)throw Error('请先解锁档案。');
 if(!/^github_pat_[a-zA-Z0-9_]+$/.test(token.trim()))throw Error('请输入有效的 GitHub fine-grained token（github_pat_ 开头）。');
 localStorage.setItem(syncTokenKey,JSON.stringify(await encryptVault({token:token.trim()},password)));
}
export function clearManualSyncToken(){localStorage.removeItem(syncTokenKey);}
/** Fetch the newly deployed encrypted archive; leave the old view untouched until validated. */
export async function refreshCloudRecords():Promise<RecordData[]|null>{
 if(!password)throw Error('请先解锁档案。');
 const response=await fetch(import.meta.env.BASE_URL+'vault.json?refresh='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw Error('还无法从网站获取最新快照。');
 const envelope=await response.json();
 const payload=await decryptVault(envelope,password);
 if(!Array.isArray(payload.records)||typeof payload.records[0]?.at!=='string')throw Error('新快照格式无效。');
 const nextTime=Date.parse(payload.records[0].at),oldTime=Date.parse(cloudLatestAt||'');
 if(!Number.isFinite(nextTime)||nextTime<=oldTime)return null;
 await unlock(password,envelope);
 return records;
}

export function loadDesignPreview(preview:RecordData[]){if(!import.meta.env.DEV)throw Error('Preview unavailable');records=preview;password='local-preview-only';dailyPlaytime=null;pcMetascores={};designPreferences={hiddenGameIds:[]};}
