import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {credentials} from './microsoft-credentials.ts';
import {scanMicrosoft,refreshGroupingWarnings} from './microsoft-library.ts';
import {australianArtwork} from './microsoft-artwork.ts';
import {readState,writeState} from './microsoft-state.ts';
import {getPasswords,readVault} from './password.ts';
import {publishSnapshot} from './snapshot.ts';
import {cacheRecordImages} from './image-cache.ts';
import {appendPlaytimeSamples,boundaryPlaytimeSweep} from '../src/playtime-ledger.ts';
import {shouldReuseRecentXboxSnapshot} from './microsoft-sync-policy.ts';
import {fixedPcMetascores} from './fixed-pc-metascores.ts';
import {completion} from '../src/completion.ts';
import {normalizeSyncMechanism,type Game} from '../src/data.ts';
/** Aggregate only. Never log the private game's name, ID or snapshot. */
function logMythicArtworkCoverage(games:Game[]){
 const mythic=games.filter(g=>completion(g).mythic);
 console.log('Mythic 海报背景覆盖：'+JSON.stringify({
  catalogGames:games.length,mythic:mythic.length,
  firstScreenshot:mythic.filter(g=>g.posterImagePurpose==='Screenshot').length,
  fallbackOfficialArt:mythic.filter(g=>g.posterImage&&g.posterImagePurpose!=='Screenshot').length,
  missingBackground:mythic.filter(g=>!g.posterImage).length,
  rotating:mythic.filter(g=>g.posterSelectionVersion===3&&Array.isArray(g.posterScreenshots)).length,
  totalScreenshots:mythic.reduce((n,g)=>n+(g.posterScreenshots?.length||0),0)
 }));
}
/** Aggregate-only verification: distinguish AU Store screenshots listed in
 * the catalog from variants actually archived in /media/. */
function logMythicScreenshotCache(games:Game[]){
 const mythic=games.filter(g=>completion(g).mythic);
 const total=mythic.reduce((n,g)=>n+(g.posterScreenshots?.length||0),0);
 const full=mythic.reduce((n,g)=>n+(g.cachedPosterScreenshots?.filter(Boolean).length||0),0);
 const previews=mythic.reduce((n,g)=>n+(g.cachedPosterScreenshotsSmall?.filter(Boolean).length||0),0);
 console.log('Mythic Screenshot 缓存：'+JSON.stringify({
  total,full,previews,missingFull:total-full,missingPreviews:total-previews
 }));
}
async function optionalArtwork(record:Parameters<typeof australianArtwork>[0]){
 try{return await australianArtwork(record,fetch,previous[0]);}
 catch{console.warn('::warning::Store artwork unavailable; retaining official image sources.');}
}
async function optionalImageCache(record:Parameters<typeof cacheRecordImages>[0]){
 try{await cacheRecordImages(record,{budgetMs:60000});logMythicScreenshotCache(record.games);}
 catch{console.warn('::warning::Artwork cache unavailable for this scan.');}
}
const session=await credentials(process.env),{old,target}=getPasswords(process.env);
const syncMechanism=normalizeSyncMechanism(process.env.PLAYLOG_SYNC_MECHANISM);
const root=process.env.MICROSOFT_STATE_DIR||'.private/microsoft',key=process.env.MICROSOFT_STATE_KEY!;
const saved=readState(root+'/candidate.json',key);
const existing=fs.existsSync('public/vault.json')?await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target):{records:[]};
const previous=existing.records;
const ledger=existing.playtimeLedger;
if(previous[0]&&previous[0].source==='Xbox'&&Date.parse(previous[0].at)>=Date.parse('2026-11-02T00:00:00Z')&&!ledger)throw Error('Existing Xbox snapshot lacks its historical playtime ledger; refusing overwrite.');
if(previous[0]&&fs.existsSync('public/status.json')){
 const marker=JSON.parse(fs.readFileSync('public/status.json','utf8'));
 if(marker.latestAt&&Date.parse(marker.latestAt)!==Date.parse(previous[0].at))throw Error('Encrypted snapshot and public status timestamp disagree.');
}
const recentCandidate=saved?.record?.games?.some((g:any)=>g.cachedImage)&&Date.now()-Date.parse(saved.record.at)<20*60_000?saved.record:null;
// Private candidates may include zero-result titles; those never enter the public snapshot.
const freshSource=recentCandidate||previous[0];
const fresh=freshSource?refreshGroupingWarnings({...freshSource,games:freshSource.games.filter((g:any)=>g.total>0||g.minutes!==null)}):undefined;
const syncStartedAt=new Date().toISOString();
if(fresh&&fresh.id===previous[0]?.id&&shouldReuseRecentXboxSnapshot({
 mechanism:syncMechanism,priorMechanism:previous[0]?.syncMechanism,
 ledgerAvailable:!!ledger,source:fresh.source,snapshotAt:fresh.at,
 now:syncStartedAt,dayBoundary:boundaryPlaytimeSweep(syncStartedAt),
 forceSweep:process.env.PLAYTIME_FORCE_SWEEP==='true'
})){
 const reused:typeof fresh={...fresh,id:randomUUID(),at:syncStartedAt,syncMechanism:'cloudflare',syncReusedFromAt:fresh.at};
 const artwork=await optionalArtwork(reused);
 console.log('快速快照澳区横幅覆盖：'+JSON.stringify(artwork));
 logMythicArtworkCoverage(reused.games);
 await optionalImageCache(reused);
 await publishSnapshot(reused,previous.slice(0,29),target,ledger,fixedPcMetascores(reused.games.map((g:any)=>String(g.id)),key));
 console.log('Cloudflare 近五分钟内复用先前手动同步数据；已单独记录触发时间，未执行微软扫描。');process.exit(0);
}
const cacheBaseline=saved?.record??previous[0];
const cachedGames=cacheBaseline?.games||[];
// Counts only: confirm that the prior detail baseline was recovered without logging private data.
console.log('微软增量缓存基线：'+JSON.stringify({source:saved?.record?'private-cache':previous[0]?'encrypted-vault':'none',games:cachedGames.length,completeCatalogs:cachedGames.filter((g:any)=>Array.isArray(g.achievements)&&g.achievements.length>0&&g.achievements.length===g.total).length}));
const began=Date.now();
if(syncMechanism==='manual')console.log('手动同步：完整执行微软增量扫描，优先重新核验近期游玩游戏的成就。');
if(syncMechanism==='cloudflare')console.log('Cloudflare 定时同步：非允许的五分钟复用窗口，执行新的微软增量扫描。');
const result=await scanMicrosoft(session.config,{previous:cacheBaseline,retryTitles:saved?.retryTitles,emptyTitles:saved?.emptyTitles,lastFullCatalogAt:saved?.lastFullCatalogAt??cacheBaseline?.at,expectedOwner:session.state.owner,forcePlaytimeSweep:process.env.PLAYTIME_FORCE_SWEEP==='true',recentAchievementLookbackDays:syncMechanism==='manual'||syncMechanism==='code-update'?14:syncMechanism==='cloudflare'?3:0,progress:(n,total)=>{if(n%20===0||n===total)console.log(`微软同步 ${n}/${total}`);}});
const scanSeconds=Math.round((Date.now()-began)/1000);
// The workflow injects explicit provenance. Old snapshots remain unlabelled rather
// than being guessed from their timestamps.
if(syncMechanism)result.record.syncMechanism=syncMechanism;
// Only aggregate counts: no XUID, game names, credentials, private snapshots or timestamps.
console.log('微软扫描统计：'+JSON.stringify({scanSeconds,fullRefresh:result.audit.fullRefresh,reusedDetails:result.audit.reusedDetails,detailedReads:result.audit.detailedReads,statsReads:result.audit.statsReads,statsSkipped:result.audit.statsSkipped,emptySkipped:result.audit.emptySkipped,emptyCached:result.emptyTitles.length,reuseReasons:result.audit.reuseReasons,failed:result.audit.failed,unpreservedFailures:result.audit.unpreservedFailures}));
// An isolated previously seen title can preserve its last data without blocking other games.
// New titles with incomplete data are deferred; global history or fatal errors still stop publication.
if(result.audit.interrupted||(result.audit.titles>0&&result.audit.unpreservedFailures===result.audit.titles))throw Error('微软同步未完整完成。');
if(result.audit.failed)console.warn('微软同步部分降级：'+result.audit.failed+' 个游戏异常，旧游戏保留原数据、新游戏暂缓收录，其余继续发布。');
const artwork=await optionalArtwork(result.record);
// Retain zero-result metadata ONLY in the existing encrypted private candidate
// so the next run can avoid re-reading 30+ unpublishable titles.
const allScannedGames=result.record.games;
result.record.games=result.record.games.filter(g=>g.total>0||g.minutes!==null);
result.record=refreshGroupingWarnings(result.record);
await optionalImageCache(result.record);
writeState(root+'/candidate.json',{...result,record:{...result.record,games:allScannedGames},
 lastFullCatalogAt:result.audit.fullRefresh?result.record.at:(saved?.lastFullCatalogAt??cacheBaseline?.at??result.record.at)},key);
session.save();
const daily=appendPlaytimeSamples(ledger,result.statsSamples);
await publishSnapshot(result.record,previous.slice(0,29),target,daily,fixedPcMetascores(result.record.games.map(g=>g.id),key),result.statsSamples.length>0&&!result.audit.failed&&(process.env.PLAYTIME_FORCE_SWEEP==='true'||boundaryPlaytimeSweep(result.record.at)));
console.log('每日时长采样：'+JSON.stringify({freshSamples:result.statsSamples.length,observedGames:Object.keys(daily.latest).length,dates:Object.keys(daily.days).length,crossDayIntervals:Object.keys(daily.crossDay).length}));
console.log('微软正式同步完成：'+JSON.stringify({games:result.record.games.length,achievementsWithRarity:result.audit.rarityAchievements,baseGroups:result.audit.officialBaseGroups,dlcGroups:result.audit.officialAddonGroups,degradedGames:result.audit.failed,artwork,seconds:Math.round((Date.now()-began)/1000)}));
