import {microsoftProvider,XboxReadError,type DirectConfig} from './microsoft.ts';
import {collectPages} from './microsoft-probe.ts';
import {normalizeTitles,safeImage,type Achievement,type AchievementGroup,type Game,type RecordData} from '../src/data.ts';
import {validateGroups} from '../src/completion.ts';
import type {CatalogBundle} from './catalog-cache.ts';
import {boundaryPlaytimeSweep,type PlaytimeSample} from '../src/playtime-ledger.ts';
const percent=(value:unknown)=>(typeof value==='number'||typeof value==='string')&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=100?Number(value):null;
const timestamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>=Date.UTC(2005,0,1)?new Date(value).toISOString():null;
export function achievement(raw:any):Achievement{
 const unlocked=raw.progressState==='Achieved'||raw.unlocked===true;
 const points=raw.rewards?.find((r:any)=>r.type==='Gamerscore')?.value??raw.gamerscore??0;
 return {id:String(raw.id),name:String(raw.name||'Achievement'),description:String(unlocked?(raw.description||raw.lockedDescription||''):(raw.lockedDescription||raw.description||'')),image:safeImage(raw.mediaAssets?.find((m:any)=>m.type==='Icon')?.url||raw.mediaAssets?.[0]?.url||raw.imageUrl||raw.tileUrl),unlocked,unlockedAt:unlocked?timestamp(raw.progression?.timeUnlocked||raw.timeUnlocked):null,rarity:percent(raw.rarity?.currentPercentage),points:Number.isFinite(Number(points))?Math.max(0,Number(points)):0};
}
export function playtime(data:any,titleId:string):number|null{
 // Respect title and stat identity; a missing statistic never becomes zero.
 let result:number|null=null;
 const visit=(v:any,inherited?:string,depth=0)=>{
  if(!v||typeof v!=='object'||depth>12)return;
  const title=String(v.titleId??inherited??'');
  if(v.name==='MinutesPlayed'&&(!title||title===titleId)){
   if(v.value!==null&&v.value!==undefined&&v.value!==''&&Number.isFinite(Number(v.value))&&Number(v.value)>=0)result=Number(v.value);
  }
  for(const child of Object.values(v))if(typeof child==='object')visit(child,title||undefined,depth+1);
 };visit(data);return result;
}
/** A complete server BaseGame membership can distinguish original achievements from all add-ons.
 * Complement is named '追加内容' only, never invented individual DLC pack names. */
export function officialGroups(pages:any[],titleId:string,awards:Achievement[]):AchievementGroup[]|undefined{
 const entries:any[]=[];
 for(const page of pages){for(const c of Array.isArray(page.completion)?page.completion:[]){
  if(String(c.titleId)!==titleId||!c.groups||typeof c.groups!=='object'||Array.isArray(c.groups))continue;
  entries.push(...Object.entries(c.groups).map(([id,v])=>({...(v as any),id})));
 }}
 const byId=new Map(awards.map(a=>[a.id,a]));const bases=entries.filter(g=>g.groupType==='BaseGame');
 if(!bases.length)return;
 const memberships:string[][]=bases.map(g=>Array.isArray(g.achievementIds)?g.achievementIds.map(String).sort():[]);
 if(!memberships[0].length||memberships.some(ids=>JSON.stringify(ids)!==JSON.stringify(memberships[0])))return;
 const ids=memberships[0];if(new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))return;
 const claimedUnlocked=bases[0].unlockedAchievementIds;
 if(Array.isArray(claimedUnlocked)){
  const actual=ids.filter(id=>byId.get(id)?.unlocked).sort();
  if(JSON.stringify([...new Set(claimedUnlocked.map(String))].sort())!==JSON.stringify(actual))return;
 }
 const baseId='xbox-base',base=new Set(ids);const extra=awards.filter(a=>!base.has(a.id)).map(a=>a.id);
 const groups:AchievementGroup[]=[{id:baseId,name:'本体',kind:'base',achievementIds:ids,total:ids.length,earned:ids.filter(id=>byId.get(id)?.unlocked).length}];
 if(extra.length)groups.push({id:'xbox-addons',name:'追加内容',kind:'dlc',achievementIds:extra,total:extra.length,earned:extra.filter(id=>byId.get(id)?.unlocked).length});
 return validateGroups(groups,awards,awards.length,awards.filter(a=>a.unlocked).length);
}
export const normalizedName=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/[™®©]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
/** Catalog IDs and Xbox IDs are different. Only a complete, unambiguous name+score bijection is safe. */
export function catalogGroups(bundle:CatalogBundle|undefined,game:Game):AchievementGroup[]|undefined{
 if(!bundle||!game.achievements?.length)return;
 const candidates=bundle.catalogs.filter(c=>normalizedName(c.name)===normalizedName(game.name)&&c.total===game.total);
 if(candidates.length!==1)return;
 const catalog=candidates[0],key=(a:Achievement)=>normalizedName(a.name)+'|'+(a.points??0);
 const xbox=new Map<string,Achievement[]>();for(const a of game.achievements){const k=key(a);xbox.set(k,[...(xbox.get(k)||[]),a]);}
 const map=new Map<string,string>();
 for(const a of catalog.data.achievements){const matches=xbox.get(key(a));if(matches?.length!==1||[...map.values()].includes(matches[0].id))return;map.set(a.id,matches[0].id);}
 if(map.size!==game.achievements.length)return;
 return validateGroups(catalog.data.groups.map(g=>({...g,achievementIds:g.achievementIds.map(id=>map.get(id)!)})),game.achievements,game.total,game.earned);
}
export type ScanAudit={version:1;at:string;titlePages:number;achievementHistoryPages:number;historySourcesFailed:number;historyTitlesAdded:number;titles:number;processed:number;complete:number;preserved:number;legacy:number;rarityTitles:number;rarityAchievements:number;officialBaseGroups:number;officialAddonGroups:number;catalogGroups:number;unknownGroups:number;playtimeTitles:number;images:number;unlockDates:number;fullRefresh:boolean;reusedDetails:number;detailedReads:number;statsReads:number;statsSkipped:number;reuseReasons:Partial<Record<DetailDecision,number>>;failed:number;summaryMismatches:number;summaryTotalsDerived:number;diagnostics:{summaryKeys:string[];awardKeys:string[];expectedTotal:number|null;expectedEarned:number|null;returned:number;unlocked:number;expectedScore:number|null;returnedScore:number;rarityKeys:string[];completionShape:string;groupFields:string[]}[];interrupted:boolean;contracts:Record<string,number>;responseFields:{rarity:boolean;groupIds:boolean;completion:boolean};comparison:{matched:number;ambiguous:number;unmatched:number;earnedDifferences:number;totalDifferences:number;playtimeDifferences:number;achievementDateDifferences:number;matchedAchievementDates:number};};
export function compareLibrary(games:Game[],prior?:RecordData,aliases=new Map<string,string[]>(),awardNames=new Map<string,Map<string,string>>()){
 const out={matched:0,ambiguous:0,unmatched:0,earnedDifferences:0,totalDifferences:0,playtimeDifferences:0,achievementDateDifferences:0,matchedAchievementDates:0};
 const choices=new Map(games.map(g=>{const names=new Set([g.name,...(aliases.get(g.id)||[])].map(normalizedName));return [g.id,(prior?.games||[]).filter(p=>names.has(normalizedName(p.name)))];}));
 const claims=new Map<string,Game[]>();for(const g of games){const m=choices.get(g.id)!;if(m.length===1)claims.set(m[0].id,[...(claims.get(m[0].id)||[]),g]);}
 for(const g of games){const matches=choices.get(g.id)!;if(matches.length!==1){out[matches.length?'ambiguous':'unmatched']++;continue;}
  const p=matches[0];if(g.total===0&&!g.achievements?.length&&p.total>0){out.ambiguous++;continue;}const claimants=claims.get(p.id)||[];if(claimants.length>1){const exact=claimants.filter(c=>c.total>0&&c.total===p.total&&(p.maxScore===0||c.maxScore===p.maxScore));if(exact.length!==1||exact[0].id!==g.id){out.ambiguous++;continue;}}
  out.matched++;if(p.earned!==g.earned)out.earnedDifferences++;if(p.total!==g.total)out.totalDifferences++;
  if(g.minutes!==null&&p.minutes!==null&&Math.abs(g.minutes-p.minutes)>6)out.playtimeDifferences++;
  for(const a of g.achievements||[]){const candidates=p.achievements?.filter(b=>[a.name,awardNames.get(g.id)?.get(a.id)||''].filter(Boolean).some(name=>normalizedName(b.name)===normalizedName(name))&&b.points===a.points)||[];
   if(candidates.length===1&&a.unlockedAt&&candidates[0].unlockedAt){out.matchedAchievementDates++;if(Math.abs(Date.parse(a.unlockedAt)-Date.parse(candidates[0].unlockedAt!))>60000)out.achievementDateDifferences++;}
  }
 }return out;
}
export async function titleAliases(read:(path:string)=>Promise<any>){
 const history=await collectPages(t=>read('/player/titleHistory?locale=en-US'+(t?'&continuationToken='+encodeURIComponent(t):'')),'titles');
 const values=history.values.slice();
 for(const version of ['2','1'])try{const extra=await collectPages(t=>read('/player/achievementHistory?contractVersion='+version+'&locale=en-US'+(t?'&continuationToken='+encodeURIComponent(t):'')),'titles');values.push(...extra.values);}catch(error){if(error instanceof XboxReadError&&[401,429].includes(error.status))throw error;}
 const aliases=new Map<string,string[]>();for(const t of values)if(typeof t.name==='string'){const id=String(t.titleId);aliases.set(id,[...new Set([...(aliases.get(id)||[]),t.name])]);}return aliases;
}
export function mergeTitleHistories(hub:any[],modern:any[],legacy:any[]){
 const titles=new Map(hub.filter(t=>t.type!=='App').map(t=>[String(t.titleId),t]));
 for(const [source,list] of [[2,modern],[1,legacy]] as const)for(const item of list){
  if(item.titleType==='LiveApp'||item.titleType===5||!/^\d{1,10}$/.test(String(item.titleId)))continue;
  const id=String(item.titleId),old=titles.get(id),summary={...old?.achievement};
  for(const [target,fields]of Object.entries({currentAchievements:['currentAchievements','earnedAchievements'],totalAchievements:['totalAchievements'],currentGamerscore:['currentGamerscore'],totalGamerscore:['totalGamerscore','maxGamerscore']})){
   const field=fields.find(k=>typeof item[k]==='number');if(field)summary[target]=item[field];
  }
  const legacyContract=source===1&&typeof item.titleType==='number';if(legacyContract)summary.sourceVersion=1;
  titles.set(id,{...old,titleId:id,name:old?.name||item.name||'Xbox 游戏',type:'Game',devices:old?.devices||(legacyContract?['Xbox360']:['XboxOne']),achievement:summary,titleHistory:old?.titleHistory||{lastTimePlayed:item.lastPlayed||null}});
 }
 return [...titles.values()];
}
/** One full catalog refresh per day; incremental runs still check official title summaries.
 * This also refreshes rarity percentages and retries unavailable official groups. */
export function refreshCatalogToday(previousAt:string|undefined,at:string){
 return at.slice(11,13)==='02' && previousAt?.slice(0,13)!==at.slice(0,13);
}
/** Poll current playtime for recently played or unmeasured games only. */
export function shouldReadPlaytime(lastPlayed:string|null,oldMinutes:number|null,at:string){
 const played=lastPlayed?Date.parse(lastPlayed):NaN;
 return oldMinutes===null || (Number.isFinite(played) && Date.parse(at)-played<7*86400_000);
}
/** Decide whether the previous COMPLETE catalog is safe to reuse.
 * Xbox omits currentGamerscore on some title summaries, and can change the textual
 * timestamp precision without changing the actual last-played instant.
 * The total and earned counts are mandatory: absent ones must trigger a fresh read. */
export type DetailDecision='newGame'|'incompleteCache'|'dailyRefresh'|'playedAgain'|'missingSummary'|'totalChanged'|'earnedChanged'|'scoreChanged'|'reused'|'verifiedEarned';
export function detailCacheDecision(old:Game|undefined,summary:any,lastPlayed:string|null,fullRefresh:boolean):DetailDecision {
 if(!old)return 'newGame';
 const awards=old.achievements||[],groups=old.groups||[];
 if(!awards.length||awards.length!==old.total||(old.groupStatus==='verified'&&!groups.some(g=>g.kind==='base')))return 'incompleteCache';
 if(fullRefresh)return 'dailyRefresh';
 const oldTime=old.lastPlayed?Date.parse(old.lastPlayed):NaN;
 const newTime=lastPlayed?Date.parse(lastPlayed):NaN;
 const sameTime=old.lastPlayed===lastPlayed||
  (Number.isFinite(oldTime)&&Number.isFinite(newTime)&&oldTime===newTime);
 if(!sameTime)return 'playedAgain';
 if(typeof summary?.totalAchievements!=='number'||summary.totalAchievements<=0||
    typeof summary?.currentAchievements!=='number'||summary.currentAchievements<0||
    summary.currentAchievements>summary.totalAchievements)return 'missingSummary';
 if(summary.totalAchievements!==old.total)return 'totalChanged';
 if(summary.currentAchievements!==old.earned)return 'earnedChanged';
 // Gamerscore is optional in Xbox history responses. Missing != changed.
 if(typeof summary.currentGamerscore==='number'&&summary.currentGamerscore!==old.score)return 'scoreChanged';
 return 'reused';
}
export async function scanMicrosoft(config:DirectConfig,options:{request?:typeof fetch;previous?:RecordData;baseline?:RecordData;catalog?:CatalogBundle;expectedOwner?:string;onlyIds?:Set<string>;pause?:(ms:number)=>Promise<void>;progress?:(processed:number,total:number,audit:ScanAudit)=>void;now?:string;forcePlaytimeSweep?:boolean}={}){
 const pause=options.pause||((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 // Sustained pacing, no retries against permissions/security errors. 429 stops this scan.
 const request:typeof fetch=async(input,init)=>{await pause(1050);return (options.request||fetch)(input,init);};
 const provider=await microsoftProvider(config,request);const rawProfile=await provider.call('/account');
 if(options.expectedOwner&&options.expectedOwner!==provider.xuid)throw Error('微软续期账号发生变化；停止同步。');
 const settings=rawProfile.profileUsers[0].settings||[],setting=(id:string)=>settings.find((s:any)=>s.id===id)?.value||'';
 const history=await collectPages(t=>provider.call('/player/titleHistory?locale=en-AU'+(t?'&continuationToken='+encodeURIComponent(t):'')),'titles');
 let titles=[...new Map(history.values.filter(g=>g.type!=='App'&&/^\d{1,10}$/.test(String(g.titleId))).map(g=>[String(g.titleId),g])).values()];
 let historyFailures=0,achievementPages=0;const extra:any[][]=[];
 for(const version of ['2','1']){
  try{const list=await collectPages(t=>provider.call('/player/achievementHistory?locale=en-AU&contractVersion='+version+(t?'&continuationToken='+encodeURIComponent(t):'')),'titles');extra.push(list.values);achievementPages+=list.pages;}catch(error){if(error instanceof XboxReadError&&[401,429].includes(error.status))throw error;historyFailures++;extra.push([]);}
 }
 const hubTitles=titles.length;titles=mergeTitleHistories(titles,extra[0],extra[1]);
 if(!titles.length||titles.length>=5000)throw Error('Xbox 游戏历史为空或超出上限；未覆盖暂存记录。');
 const prior=options.previous?.profile.xuid===provider.xuid?new Map(options.previous.games.map(g=>[g.id,g])):new Map<string,Game>();
 // Display policy: explicit visible=true is the only showable Xbox state.
 // Missing flags remain unknown in the archive, but are hidden in UI and on later syncs.
 const games=normalizeTitles({titles:titles.filter(t=>!options.onlyIds||options.onlyIds.has(String(t.titleId))||!prior.has(String(t.titleId)))});
 const audit:ScanAudit={version:1,at:options.now||new Date().toISOString(),titlePages:history.pages,achievementHistoryPages:achievementPages,historySourcesFailed:historyFailures,historyTitlesAdded:titles.length-hubTitles,titles:games.length,processed:0,complete:0,preserved:0,legacy:0,rarityTitles:0,rarityAchievements:0,officialBaseGroups:0,officialAddonGroups:0,catalogGroups:0,unknownGroups:0,playtimeTitles:0,images:0,unlockDates:0,fullRefresh:false,reusedDetails:0,detailedReads:0,statsReads:0,statsSkipped:0,reuseReasons:{},failed:0,summaryMismatches:0,summaryTotalsDerived:0,diagnostics:[],interrupted:false,contracts:{},responseFields:{rarity:false,groupIds:false,completion:false},comparison:{matched:0,ambiguous:0,unmatched:0,earnedDifferences:0,totalDifferences:0,playtimeDifferences:0,achievementDateDifferences:0,matchedAchievementDates:0}};
 audit.fullRefresh=refreshCatalogToday(options.previous?.at,audit.at);
 const statsSamples:PlaytimeSample[]=[];
 const sampleMinutes=(id:string,value:number|null)=>{if(value!==null&&Number.isSafeInteger(value)&&value>=0)statsSamples.push({id,minutes:value,at:options.now||new Date().toISOString()});};
 const sweepPlaytime=options.forcePlaytimeSweep===true||boundaryPlaytimeSweep(audit.at);
 const pagesFor=async(id:string,version:string,possible=false,legacy=false,earned=false,unlockedOnly=false)=>{
  const pages:any[]=[];const result=await collectPages(async token=>{
   const params=new URLSearchParams(legacy?{earned:String(earned)}:{contractVersion:version,possibleOnly:String(possible),unlockedOnly:String(unlockedOnly)});if(token)params.set('continuationToken',token);
   const page=await provider.call(`/player/${legacy?'legacy-achievements':'achievements'}/${id}?${params}`);pages.push(page);return page;
  },'achievements');
  const raw=result.values.filter(a=>a.achievementType!=='Challenge'&&a.type!=='Challenge');
  if(raw.some(a=>a.id===null||a.id===undefined)||new Set(raw.map(a=>String(a.id))).size!==raw.length)throw Error('Xbox 成就编号无效或重复。');
  audit.responseFields.rarity ||=raw.some(a=>Object.hasOwn(a,'rarity'));audit.responseFields.groupIds ||=raw.some(a=>Object.hasOwn(a,'groupIds'));audit.responseFields.completion ||=pages.some(p=>Object.hasOwn(p,'completion'));
  return {raw,pages};
 };
 const legacyFor=async(id:string)=>{
  const all=await pagesFor(id,'1',false,true),earned=await pagesFor(id,'1',false,true,true),unlocked=new Map(earned.raw.map(a=>[String(a.id),a]));
  if(earned.raw.some(a=>!all.raw.some(b=>String(a.id)===String(b.id))))throw Error('Xbox 旧版目录与已解锁列表不一致。');
  return {raw:all.raw.map(a=>({...a,...unlocked.get(String(a.id)),unlocked:unlocked.has(String(a.id))})),pages:all.pages};
 };
 const fatal=(error:unknown)=>error instanceof XboxReadError&&[401,429].includes(error.status);
 for(let i=0;i<games.length;i++){
  const game=games[i],old=prior.get(game.id);let complete=false;
  // Missing visibility is interpreted as hidden, without pretending the API returned false.
  // Keep all prior achievements and playtime in the encrypted archive and aggregates.
  if(game.officialHidden!==false){
   if(old){games[i]={...old,officialHidden:game.officialHidden};audit.preserved++;}
   audit.processed++;options.progress?.(audit.processed,games.length,audit);continue;
  }
  try{
   const title=titles.find(t=>String(t.titleId)===game.id),summary=title?.achievement;
   const lastPlayed=title?.titleHistory?.lastTimePlayed||null;
   let decision=detailCacheDecision(old,summary,lastPlayed,audit.fullRefresh);
   // The title-history API occasionally omits mandatory counters (86 titles in
   // a production scan). Check earned IDs with ONE small official request instead
   // of fetching the full catalog and rarity/groups several times every 30m.
   // New earned IDs force a full read. Unlocked-but-unchanged catalogs are
   // refreshed during the daily full scan to detect unearned DLC additions.
   if(decision==='missingSummary'&&old){
    const isLegacy=titles.find(t=>String(t.titleId)===game.id)?.devices?.some((d:any)=>/xbox\s*360/i.test(String(d)))||summary?.sourceVersion===1;
    try{
     const probe=isLegacy?await pagesFor(game.id,'1',false,true,true):
      await pagesFor(game.id,'6',false,false,false,true);
     const awards=probe.raw.map(achievement);
     const priorEarned=(old.achievements||[]).filter(a=>a.unlocked).map(a=>a.id).sort();
     const freshEarned=awards.filter(a=>a.unlocked).map(a=>a.id).sort();
     if(awards.length===freshEarned.length&&JSON.stringify(priorEarned)===JSON.stringify(freshEarned))
      decision='verifiedEarned';
    }catch(error){if(fatal(error))throw error;/* Unknown probe contract: full fetch below. */}
   }
   audit.reuseReasons[decision]=(audit.reuseReasons[decision]||0)+1;
   if(decision==='reused'||decision==='verifiedEarned'){
    const cached=old!,oldAchievements=cached.achievements||[],oldGroups=cached.groups||[];
    let minutes=cached.minutes;
    if(sweepPlaytime||shouldReadPlaytime(lastPlayed,cached.minutes,audit.at)){
     const observed=playtime(await provider.call('/player/stats',{xuids:[provider.xuid],arrangebyfield:'xuid',stats:[{name:'MinutesPlayed',titleId:game.id}]}),game.id);
     sampleMinutes(game.id,observed);
     minutes=observed??cached.minutes;
     audit.statsReads++;
    }else audit.statsSkipped++;
    Object.assign(game,{achievements:oldAchievements,groups:oldGroups,groupStatus:cached.groupStatus,earned:cached.earned,total:cached.total,score:cached.score,maxScore:cached.maxScore,minutes,lastPlayed:cached.lastPlayed});
    audit.complete++;audit.processed++;audit.preserved++;audit.reusedDetails++;audit.rarityTitles+=oldAchievements.some(a=>a.rarity!==null)?1:0;audit.rarityAchievements+=oldAchievements.filter(a=>a.rarity!==null).length;audit.images+=oldAchievements.filter(a=>!!a.image).length;audit.unlockDates+=oldAchievements.filter(a=>!!a.unlockedAt).length;
    if(cached.groupStatus==='verified'){audit.officialBaseGroups++;if(oldGroups.some(g=>g.kind==='dlc'))audit.officialAddonGroups++;}else audit.unknownGroups++;
    if(game.minutes!==null)audit.playtimeTitles++;options.progress?.(audit.processed,games.length,audit);continue;
   }
   let data:Awaited<ReturnType<typeof pagesFor>>|undefined,version='6';const isLegacy=titles.find(t=>String(t.titleId)===game.id)?.devices?.some((d:any)=>/xbox\s*360/i.test(String(d)))||titles.find(t=>String(t.titleId)===game.id)?.achievement?.sourceVersion===1;
   if(isLegacy){
    data=await legacyFor(game.id);version='1';audit.legacy++;
   }else{
    for(const candidate of ['6','4','2']){
     try{const result=await pagesFor(game.id,candidate);data=result;version=candidate;if(result.raw.length)break;}
     catch(error){if(fatal(error))throw error;}
    }
   }
   if(!data)throw Error('Xbox 成就读取未完成。');
   if(!data.raw.length&&version!=='1'){
    try{const legacy=await legacyFor(game.id);if(legacy.raw.length){data=legacy;version='1';audit.legacy++;}}catch(error){if(fatal(error))throw error;}
   }
   if(version!=='1'){
    // Explicit possibleOnly catalog prevents unlocked-only payloads from masquerading as full lists.
    const catalog=await pagesFor(game.id,version,true),current=new Map(data.raw.map(a=>[String(a.id),a])),ids=new Set(catalog.raw.map(a=>String(a.id)));
    if(data.raw.some(a=>!ids.has(String(a.id))))throw Error('Xbox 已解锁成就与完整目录不一致。');
    data={raw:catalog.raw.map(a=>{
     const progress=current.get(String(a.id));
     return {...a,...progress,rarity:progress?.rarity??a.rarity,mediaAssets:progress?.mediaAssets?.length?progress.mediaAssets:a.mediaAssets,...(!progress?{progressState:'NotStarted',progression:undefined,unlocked:false}:{})};
    }),pages:[...data.pages,...catalog.pages]};
   }
   const awards=data.raw.map(achievement),unlocked=awards.filter(a=>a.unlocked).length;
   const titleSummary=titles.find(t=>String(t.titleId)===game.id)?.achievement;
   const expectedTotal=typeof titleSummary?.totalAchievements==='number'&&titleSummary.totalAchievements>0?titleSummary.totalAchievements:null,expectedEarned=version==='1'||(titleSummary?.totalAchievements===0&&titleSummary?.currentAchievements===0&&unlocked>0)?null:typeof titleSummary?.currentAchievements==='number'?titleSummary.currentAchievements:null;
   const returnedScore=awards.reduce((sum,a)=>sum+(a.points||0),0),expectedScore=typeof titleSummary?.totalGamerscore==='number'&&titleSummary.totalGamerscore>0?titleSummary.totalGamerscore:null;
   if(audit.diagnostics.length<3)audit.diagnostics.push({summaryKeys:Object.keys(titleSummary||{}).filter(k=>/^[A-Za-z]{1,40}$/.test(k)).slice(0,30),awardKeys:Object.keys(data.raw[0]||{}).filter(k=>/^[A-Za-z]{1,40}$/.test(k)).slice(0,30),expectedTotal,expectedEarned,returned:awards.length,unlocked,expectedScore,returnedScore,rarityKeys:Object.keys(data.raw[0]?.rarity||{}).filter(k=>/^[A-Za-z]{1,40}$/.test(k)),completionShape:Array.isArray(data.pages[0]?.completion)?'array':typeof data.pages[0]?.completion,groupFields:Object.keys(Object.values(data.pages[0]?.completion?.[0]?.groups||{})[0]||{}).filter(k=>/^[A-Za-z]{1,40}$/.test(k))});
   if(expectedTotal===null){game.total=awards.length;audit.summaryTotalsDerived++;}
   if(expectedEarned===null)game.earned=unlocked;
   if(version==='1')game.score=awards.filter(a=>a.unlocked).reduce((sum,a)=>sum+(a.points||0),0);
   if(expectedScore===null)game.maxScore=returnedScore;
   if(awards.length!==game.total||unlocked!==game.earned||(expectedScore!==null&&expectedScore!==returnedScore)){audit.summaryMismatches++;throw Error('Xbox 成就明细与摘要不一致。');}
   game.achievements=awards;complete=true;audit.complete++;audit.detailedReads++;audit.contracts[version]=(audit.contracts[version]||0)+1;
   let groups=officialGroups(data.pages,game.id,awards);
   if(!groups&&version!=='6'){
    try{const metadata=await pagesFor(game.id,'6',true);groups=officialGroups(metadata.pages,game.id,awards);
     const byId=new Map(metadata.raw.map(a=>[String(a.id),a]));for(const a of awards)if(a.rarity===null)a.rarity=percent(byId.get(a.id)?.rarity?.currentPercentage);
    }catch(error){if(fatal(error))throw error;}
   }
   if(awards.some(a=>a.rarity===null)&&version==='6'){
    try{const metadata=await pagesFor(game.id,'4',true);const byId=new Map(metadata.raw.map(a=>[String(a.id),a]));for(const a of awards)if(a.rarity===null)a.rarity=percent(byId.get(a.id)?.rarity?.currentPercentage);}catch(error){if(fatal(error))throw error;}
   }
   if(groups){
    audit.officialBaseGroups++;if(groups.some(g=>g.kind!=='base'))audit.officialAddonGroups++;
    const named=catalogGroups(options.catalog,game),officialBase=groups.find(g=>g.kind==='base')!.achievementIds.slice().sort();
    if(named&&JSON.stringify(named.find(g=>g.kind==='base')!.achievementIds.slice().sort())===JSON.stringify(officialBase)){groups=named;audit.catalogGroups++;}
   }else{groups=catalogGroups(options.catalog,game);if(groups)audit.catalogGroups++;}
   if(groups){game.groups=groups;game.groupStatus='verified';for(const a of awards)a.groupId=groups.find(g=>g.achievementIds.includes(a.id))?.id;}else{game.groupStatus='unavailable';audit.unknownGroups++;}
   if(awards.some(a=>a.rarity!==null))audit.rarityTitles++;audit.rarityAchievements+=awards.filter(a=>a.rarity!==null).length;
   audit.images+=awards.filter(a=>!!a.image).length;audit.unlockDates+=awards.filter(a=>!!a.unlockedAt).length;
   // Legacy time is explicitly unavailable, unless an earlier direct snapshot has a value.
   if(version!=='1'){
    game.minutes=playtime(await provider.call('/player/stats',{xuids:[provider.xuid],arrangebyfield:'xuid',stats:[{name:'MinutesPlayed',titleId:game.id}]}),game.id);
    sampleMinutes(game.id,game.minutes);audit.statsReads++;
   }
   if(game.minutes!==null)audit.playtimeTitles++;else if(old?.minutes!=null)game.minutes=old.minutes;
  }catch(error){
   audit.failed++;
   if(old){games[i]=complete?{...game,minutes:old.minutes}:{...old,officialHidden:game.officialHidden};audit.preserved++;}
   if(fatal(error)){audit.interrupted=true;break;}
  }
  audit.processed++;options.progress?.(audit.processed,games.length,audit);
 }
 // Keep previous titles missing from this response; a partial response cannot erase history.
 const ids=new Set(games.map(g=>g.id));for(const [id,g]of prior)if(!ids.has(id)){games.push({...g,officialHidden:undefined});audit.preserved++;}
 let aliases=new Map<string,string[]>();if(options.baseline)aliases=await titleAliases(p=>provider.call(p));
 audit.comparison=compareLibrary(games,options.baseline,aliases);
 const record:RecordData={id:crypto.randomUUID(),at:audit.at,source:'Xbox',profile:{xuid:provider.xuid,gamertag:setting('Gamertag')||'Xbox 玩家',avatar:safeImage(setting('GameDisplayPicRaw'))},games,warnings:[...(audit.failed?[`${audit.failed} 个游戏的官方数据尚未完整核对。`]:[]),...(audit.unknownGroups?[`${audit.unknownGroups} 个游戏分组未知。`]:[])]};
 return {record,audit,statsSamples};
}
