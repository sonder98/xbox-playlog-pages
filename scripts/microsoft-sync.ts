import {createHash,randomUUID} from 'node:crypto';
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
import {distinctScreenshotIndices,normalizeSyncMechanism,type Game} from '../src/data.ts';
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
/** Temporary aggregate-only audit for a reported screenshot-rotation regression.
 * Never print user IDs, game IDs, raw image URLs or Xbox profile data. */
function auditReportedRotation(games:Game[],prior:Game[]){
 const cases=[
  {label:'Way of the Sword',matches:(name:string)=>/way of the sword/i.test(name)},
  {label:'Black Ops 6 Launcher',matches:(name:string)=>/black\s*ops\s*6.*launcher/i.test(name)}
 ];
 for(const sample of cases){
  const game=games.find(g=>sample.matches(g.name)),old=prior.find(g=>sample.matches(g.name));
  if(!game){console.log('Mythic 轮换核验（'+sample.label+'）：notInSnapshot');continue;}
  const shots=game.posterScreenshots||[],indices=distinctScreenshotIndices(shots);
  const today=Math.floor((Date.now()+8*3600_000)/86400_000);
  const start=game.posterRotationStartDay?Date.parse(game.posterRotationStartDay+'T00:00:00Z')/86400_000:NaN;
  const selected=(day:number)=>indices.length&&Number.isFinite(start)?indices[Math.max(0,day-start)%indices.length]:-1;
  const yesterdayIndex=selected(today-1),todayIndex=selected(today);
  const cached=game.cachedPosterScreenshotsSmall||[];
  const file=(i:number)=>{
   const name=cached[i]?.split('/').at(-1)||'';
   return /^[a-f0-9]{32}-480\.webp$/.test(name)?'public/media/'+name:null;
  };
  const bytes=(i:number)=>{const filename=file(i);return filename&&fs.existsSync(filename)?fs.readFileSync(filename):null;};
  const yesterday=bytes(yesterdayIndex),todayArt=bytes(todayIndex);
  const imageFingerprints=indices.flatMap(i=>{
   const art=bytes(i);
   return art?[createHash('sha256').update(art).digest('hex')]:[];
  });
  console.log('Mythic 轮换核验（'+sample.label+'）：'+JSON.stringify({
   priorScreenshots:old?.posterScreenshots?.length??0,
   priorDistinct:distinctScreenshotIndices(old?.posterScreenshots||[]).length,
   screenshots:shots.length,distinct:indices.length,startDay:game.posterRotationStartDay||null,
   yesterdayIndex,todayIndex,cachedYesterday:!!yesterday,cachedToday:!!todayArt,
   identicalCachedPictures:!!(yesterday&&todayArt&&yesterday.equals(todayArt)),
   cachedSlots:imageFingerprints.length,uniqueCachedPictures:new Set(imageFingerprints).size,
   posterPurpose:game.posterImagePurpose||null,posterVersion:game.posterSelectionVersion||null
  }));
 }
}

const session=await credentials(process.env),{old,target}=getPasswords(process.env);
const syncMechanism=normalizeSyncMechanism(process.env.PLAYLOG_SYNC_MECHANISM);
const root=process.env.MICROSOFT_STATE_DIR||'.private/microsoft',key=process.env.MICROSOFT_STATE_KEY!;
const saved=readState(root+'/candidate.json',key);
const existing=fs.existsSync('public/vault.json')?await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target):{records:[]};
const previous=existing.records;
const ledger=existing.playtimeLedger;
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
 const artwork=await australianArtwork(reused,fetch,previous[0]);
 console.log('快速快照澳区横幅覆盖：'+JSON.stringify(artwork));
 logMythicArtworkCoverage(reused.games);
 await cacheRecordImages(reused);
 logMythicScreenshotCache(reused.games);
 auditReportedRotation(reused.games,previous[0]?.games||[]);
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
const result=await scanMicrosoft(session.config,{previous:cacheBaseline,emptyTitles:saved?.emptyTitles,lastFullCatalogAt:saved?.lastFullCatalogAt??cacheBaseline?.at,expectedOwner:session.state.owner,forcePlaytimeSweep:process.env.PLAYTIME_FORCE_SWEEP==='true',recentAchievementLookbackDays:syncMechanism==='manual'?14:syncMechanism==='cloudflare'?3:0,progress:(n,total)=>{if(n%20===0||n===total)console.log(`微软同步 ${n}/${total}`);}});
const scanSeconds=Math.round((Date.now()-began)/1000);
// The workflow injects explicit provenance. Old snapshots remain unlabelled rather
// than being guessed from their timestamps.
if(syncMechanism)result.record.syncMechanism=syncMechanism;
// Only aggregate counts: no XUID, game names, credentials, private snapshots or timestamps.
console.log('微软扫描统计：'+JSON.stringify({scanSeconds,fullRefresh:result.audit.fullRefresh,reusedDetails:result.audit.reusedDetails,detailedReads:result.audit.detailedReads,statsReads:result.audit.statsReads,statsSkipped:result.audit.statsSkipped,emptySkipped:result.audit.emptySkipped,emptyCached:result.emptyTitles.length,reuseReasons:result.audit.reuseReasons,failed:result.audit.failed}));
if(result.audit.failed||result.audit.interrupted||result.audit.historySourcesFailed)throw Error('微软同步未完整完成。');
const artworkStarted=Date.now();
const artwork=await australianArtwork(result.record,fetch,previous[0]);
console.log('澳区英文封面覆盖：'+JSON.stringify({...artwork,seconds:Math.round((Date.now()-artworkStarted)/1000)}));
logMythicArtworkCoverage(result.record.games);
// Retain zero-result metadata ONLY in the existing encrypted private candidate
// so the next run can avoid re-reading 30+ unpublishable titles.
const allScannedGames=result.record.games;
result.record.games=result.record.games.filter(g=>g.total>0||g.minutes!==null);
result.record=refreshGroupingWarnings(result.record);
const mediaStarted=Date.now();
await cacheRecordImages(result.record);
logMythicScreenshotCache(result.record.games);
auditReportedRotation(result.record.games,previous[0]?.games||[]);
console.log('图片缓存耗时（秒）：'+Math.round((Date.now()-mediaStarted)/1000));
writeState(root+'/candidate.json',{...result,record:{...result.record,games:allScannedGames},
 lastFullCatalogAt:result.audit.fullRefresh?result.record.at:(saved?.lastFullCatalogAt??cacheBaseline?.at??result.record.at)},key);
session.save();
const daily=appendPlaytimeSamples(ledger,result.statsSamples);
await publishSnapshot(result.record,previous.slice(0,29),target,daily,fixedPcMetascores(result.record.games.map(g=>g.id),key));
console.log('每日时长采样：'+JSON.stringify({freshSamples:result.statsSamples.length,observedGames:Object.keys(daily.latest).length,dates:Object.keys(daily.days).length,crossDayIntervals:Object.keys(daily.crossDay).length}));
console.log('微软正式同步完成：'+JSON.stringify({games:result.record.games.length,achievementsWithRarity:result.audit.rarityAchievements,baseGroups:result.audit.officialBaseGroups,dlcGroups:result.audit.officialAddonGroups,artwork,seconds:Math.round((Date.now()-began)/1000)}));
