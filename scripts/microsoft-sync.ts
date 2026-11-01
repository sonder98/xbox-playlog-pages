import fs from 'node:fs';
import {credentials} from './microsoft-credentials.ts';
import {scanMicrosoft} from './microsoft-library.ts';
import {australianArtwork} from './microsoft-artwork.ts';
import {readState,writeState} from './microsoft-state.ts';
import {getPasswords,readVault} from './password.ts';
import {publishSnapshot} from './snapshot.ts';
import {cacheRecordImages} from './image-cache.ts';
import {appendPlaytimeSamples,boundaryPlaytimeSweep} from '../src/playtime-ledger.ts';
const session=await credentials(process.env),{old,target}=getPasswords(process.env);
const root=process.env.MICROSOFT_STATE_DIR||'.private/microsoft',key=process.env.MICROSOFT_STATE_KEY!;
const saved=readState(root+'/candidate.json',key);
const existing=fs.existsSync('public/vault.json')?await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target):{records:[]};
const previous=existing.records;
const ledger=existing.playtimeLedger;
const fresh=saved?.record?.games?.some((g:any)=>g.cachedImage)&&Date.now()-Date.parse(saved.record.at)<20*60_000?saved.record:previous[0];
if(ledger&&fresh?.source==='Xbox'&&!boundaryPlaytimeSweep(new Date().toISOString())&&process.env.PLAYTIME_FORCE_SWEEP!=='true'&&Date.now()-Date.parse(fresh.at)<20*60_000){
 const artwork=await australianArtwork(fresh,fetch,previous[0]);
 console.log('快速快照澳区横幅覆盖：'+JSON.stringify(artwork));
 await cacheRecordImages(fresh);
 await publishSnapshot(fresh,previous.filter((r:any)=>r.id!==fresh.id).slice(0,29),target,ledger);console.log('复用刚完成的微软快照。');process.exit(0);
}
const cacheBaseline=saved?.record??previous[0];
const cachedGames=cacheBaseline?.games||[];
// Counts only: confirm that the prior detail baseline was recovered without logging private data.
console.log('微软增量缓存基线：'+JSON.stringify({source:saved?.record?'private-cache':previous[0]?'encrypted-vault':'none',games:cachedGames.length,completeCatalogs:cachedGames.filter((g:any)=>Array.isArray(g.achievements)&&g.achievements.length>0&&g.achievements.length===g.total).length}));
const began=Date.now();
const result=await scanMicrosoft(session.config,{previous:cacheBaseline,expectedOwner:session.state.owner,forcePlaytimeSweep:process.env.PLAYTIME_FORCE_SWEEP==='true',progress:(n,total)=>{if(n%20===0||n===total)console.log(`微软同步 ${n}/${total}`);}});
const scanSeconds=Math.round((Date.now()-began)/1000);
// Only aggregate counts: no XUID, game names, credentials, private snapshots or timestamps.
console.log('微软扫描统计：'+JSON.stringify({scanSeconds,fullRefresh:result.audit.fullRefresh,reusedDetails:result.audit.reusedDetails,detailedReads:result.audit.detailedReads,statsReads:result.audit.statsReads,statsSkipped:result.audit.statsSkipped,reuseReasons:result.audit.reuseReasons,failed:result.audit.failed}));
if(result.audit.failed||result.audit.interrupted||result.audit.historySourcesFailed)throw Error('微软同步未完整完成。');
const artworkStarted=Date.now();
const artwork=await australianArtwork(result.record,fetch,previous[0]);
console.log('澳区英文封面覆盖：'+JSON.stringify({...artwork,seconds:Math.round((Date.now()-artworkStarted)/1000)}));
result.record.games=result.record.games.filter(g=>g.total>0||g.minutes!==null);
const mediaStarted=Date.now();
await cacheRecordImages(result.record);
console.log('图片缓存耗时（秒）：'+Math.round((Date.now()-mediaStarted)/1000));
writeState(root+'/candidate.json',result,key);session.save();
const daily=appendPlaytimeSamples(ledger,result.statsSamples);
await publishSnapshot(result.record,previous.slice(0,29),target,daily);
console.log('每日时长采样：'+JSON.stringify({freshSamples:result.statsSamples.length,observedGames:Object.keys(daily.latest).length,dates:Object.keys(daily.days).length,crossDayIntervals:Object.keys(daily.crossDay).length}));
console.log('微软正式同步完成：'+JSON.stringify({games:result.record.games.length,achievementsWithRarity:result.audit.rarityAchievements,baseGroups:result.audit.officialBaseGroups,dlcGroups:result.audit.officialAddonGroups,artwork,seconds:Math.round((Date.now()-began)/1000)}));
