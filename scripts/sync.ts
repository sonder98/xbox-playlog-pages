import fs from 'node:fs';
import {microsoftProvider} from './microsoft.ts';
import {encryptVault,decryptVault} from '../src/crypto.ts';
import {normalizeTitles,parseStats,safeImage,validateRecord,type RecordData} from '../src/data.ts';
const key=process.env.OPENXBL_API_KEY,password=process.env.APP_PASSWORD;
if(!password||password.length<16)throw Error('请先配置至少16位的 APP_PASSWORD。');
const direct=!!process.env.XBOX_CLIENT_ID||!!process.env.XBOX_REFRESH_TOKEN;
if(!direct&&!key)throw Error('请配置微软直连的 XBOX_CLIENT_ID 和 XBOX_REFRESH_TOKEN；OpenXBL 仅为可选备用。');
const provider=direct?await microsoftProvider({clientId:process.env.XBOX_CLIENT_ID||'',refreshToken:process.env.XBOX_REFRESH_TOKEN||'',clientSecret:process.env.XBOX_CLIENT_SECRET}):null;
async function call(path:string,body?:unknown){if(provider)return provider.call(path,body);const r=await fetch('https://api.xbl.io/v2'+path,{method:body?'POST':'GET',headers:{'X-Authorization':key!,'Accept':'application/json','Accept-Language':'zh-CN','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`OpenXBL HTTP ${r.status}；本次未覆盖已发布记录。`);return r.json() as Promise<any>;}
let previous:RecordData[]=[];
if(fs.existsSync('public/vault.json')){const payload=await decryptVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),password);if(!Array.isArray(payload.records))throw Error('历史记录格式无效。');previous=payload.records;}
console.log('读取自己的 Xbox 账号与游戏历史（不输出账号信息）…');
const a=await call('/account');const p=a.profileUsers?.[0];if(!p?.id)throw Error('账号接口格式不受支持。');const setting=(id:string)=>p.settings?.find((s:any)=>s.id===id)?.value||'';
if(previous.length&&previous[0].profile.xuid!==String(p.id))throw Error('接口账号与已有游戏档案不一致。');
const titles=new Map();let token='',pages=0;const seen=new Set();
do{const d=await call('/player/titleHistory'+(token?'?continuationToken='+encodeURIComponent(token):''));for(const g of normalizeTitles(d))titles.set(g.id,g);token=d.pagingInfo?.continuationToken||d.continuationToken||'';if(token&&seen.has(token))throw Error('游戏库分页重复，未发布不完整记录。');seen.add(token);if(++pages>=25&&token)throw Error('游戏库分页超过上限。');}while(token);
const games=[...titles.values()];
for(let i=0;i<games.length;i+=25){const batch=games.slice(i,i+25);const d=await call('/player/stats',{xuids:[String(p.id)],stats:batch.map(g=>({name:'MinutesPlayed',titleId:g.id})),groups:[]});if(!Array.isArray(d.users))throw Error('时长统计响应格式不受支持。');const minutes=parseStats(d);for(const g of batch)g.minutes=minutes[g.id]??null;}
const missing=games.filter(g=>g.minutes===null).length;
const record:RecordData={...validateRecord({profile:{xuid:String(p.id),gamertag:setting('Gamertag'),avatar:safeImage(setting('GameDisplayPicRaw'))},games,source:provider?'Xbox':'OpenXBL',warnings:missing?[`${missing} 个游戏未返回时长。`]:[]}),id:crypto.randomUUID(),at:new Date().toISOString()};
const envelope=await encryptVault({records:[record,...previous]},password);
// Game names, identity and snapshots exist only inside the ciphertext.
fs.writeFileSync('public/vault.json',JSON.stringify(envelope));
fs.writeFileSync('public/status.json',JSON.stringify({initialized:true}));
console.log('同步与加密完成，准备发布。');
