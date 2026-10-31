import {microsoftProvider,XboxReadError,type DirectConfig} from './microsoft.ts';
import {collectPages} from './microsoft-probe.ts';
import {normalizeTitles,safeImage,type Achievement,type AchievementGroup,type Game,type RecordData} from '../src/data.ts';
import {validateGroups} from '../src/completion.ts';
import type {CatalogBundle} from './catalog-cache.ts';
const percent=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=100?Number(value):null;
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
export type ScanAudit={version:1;at:string;titlePages:number;titles:number;processed:number;complete:number;preserved:number;legacy:number;rarityTitles:number;rarityAchievements:number;officialBaseGroups:number;officialAddonGroups:number;catalogGroups:number;unknownGroups:number;playtimeTitles:number;images:number;unlockDates:number;failed:number;summaryMismatches:number;interrupted:boolean;contracts:Record<string,number>;responseFields:{rarity:boolean;groupIds:boolean;completion:boolean};comparison:{matched:number;ambiguous:number;unmatched:number;earnedDifferences:number;totalDifferences:number;playtimeDifferences:number;achievementDateDifferences:number};};
export function compareLibrary(games:Game[],prior?:RecordData){
 const out={matched:0,ambiguous:0,unmatched:0,earnedDifferences:0,totalDifferences:0,playtimeDifferences:0,achievementDateDifferences:0};
 for(const g of games){const matches=(prior?.games||[]).filter(p=>normalizedName(p.name)===normalizedName(g.name));if(matches.length!==1){out[matches.length?'ambiguous':'unmatched']++;continue;}
  out.matched++;const p=matches[0];if(p.earned!==g.earned)out.earnedDifferences++;if(p.total!==g.total)out.totalDifferences++;
  if(g.minutes!==null&&p.minutes!==null&&Math.abs(g.minutes-p.minutes)>6)out.playtimeDifferences++;
  for(const a of g.achievements||[]){const candidates=p.achievements?.filter(b=>normalizedName(b.name)===normalizedName(a.name)&&b.points===a.points)||[];
   if(candidates.length===1&&a.unlockedAt&&candidates[0].unlockedAt&&Math.abs(Date.parse(a.unlockedAt)-Date.parse(candidates[0].unlockedAt!))>60000)out.achievementDateDifferences++;
  }
 }return out;
}
export async function scanMicrosoft(config:DirectConfig,options:{request?:typeof fetch;previous?:RecordData;baseline?:RecordData;catalog?:CatalogBundle;expectedOwner?:string;pause?:(ms:number)=>Promise<void>;progress?:(processed:number,total:number)=>void}={}){
 const pause=options.pause||((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 // Sustained pacing, no retries against permissions/security errors. 429 stops this scan.
 const request:typeof fetch=async(input,init)=>{await pause(1050);return (options.request||fetch)(input,init);};
 const provider=await microsoftProvider(config,request);const rawProfile=await provider.call('/account');
 if(options.expectedOwner&&options.expectedOwner!==provider.xuid)throw Error('微软续期账号发生变化；停止同步。');
 const settings=rawProfile.profileUsers[0].settings||[],setting=(id:string)=>settings.find((s:any)=>s.id===id)?.value||'';
 const history=await collectPages(t=>provider.call('/player/titleHistory'+(t?'?continuationToken='+encodeURIComponent(t):'')),'titles');
 const titles=[...new Map(history.values.filter(g=>g.type!=='App'&&/^\d{1,10}$/.test(String(g.titleId))).map(g=>[String(g.titleId),g])).values()];
 if(!titles.length||titles.length>5000)throw Error('Xbox 游戏历史为空或超出上限；未覆盖暂存记录。');
 const games=normalizeTitles({titles:titles.map(t=>({...t,titleHistory:{...t.titleHistory,visible:true}}))});
 const prior=options.previous?.profile.xuid===provider.xuid?new Map(options.previous.games.map(g=>[g.id,g])):new Map<string,Game>();
 const audit:ScanAudit={version:1,at:new Date().toISOString(),titlePages:history.pages,titles:games.length,processed:0,complete:0,preserved:0,legacy:0,rarityTitles:0,rarityAchievements:0,officialBaseGroups:0,officialAddonGroups:0,catalogGroups:0,unknownGroups:0,playtimeTitles:0,images:0,unlockDates:0,failed:0,summaryMismatches:0,interrupted:false,contracts:{},responseFields:{rarity:false,groupIds:false,completion:false},comparison:{matched:0,ambiguous:0,unmatched:0,earnedDifferences:0,totalDifferences:0,playtimeDifferences:0,achievementDateDifferences:0}};
 const pagesFor=async(id:string,version:string,possible=false,legacy=false,earned=false)=>{
  const pages:any[]=[];const result=await collectPages(async token=>{
   const params=new URLSearchParams(legacy?{earned:String(earned)}:{contractVersion:version,possibleOnly:String(possible)});if(token)params.set('continuationToken',token);
   const page=await provider.call(`/player/${legacy?'legacy-achievements':'achievements'}/${id}?${params}`);pages.push(page);return page;
  },'achievements');
  const raw=result.values.filter(a=>a.achievementType!=='Challenge'&&a.type!=='Challenge');
  if(raw.some(a=>a.id===null||a.id===undefined)||new Set(raw.map(a=>String(a.id))).size!==raw.length)throw Error('Xbox 成就编号无效或重复。');
  audit.responseFields.rarity ||=raw.some(a=>Object.hasOwn(a,'rarity'));audit.responseFields.groupIds ||=raw.some(a=>Object.hasOwn(a,'groupIds'));audit.responseFields.completion ||=pages.some(p=>Object.hasOwn(p,'completion'));
  return {raw,pages};
 };
 const fatal=(error:unknown)=>error instanceof XboxReadError&&[401,429].includes(error.status);
 for(let i=0;i<games.length;i++){
  const game=games[i],old=prior.get(game.id);let complete=false;
  try{
   let data:Awaited<ReturnType<typeof pagesFor>>|undefined,version='6';const isLegacy=titles.find(t=>String(t.titleId)===game.id)?.devices?.some((d:any)=>/xbox\s*360/i.test(String(d)));
   if(isLegacy){
    const all=await pagesFor(game.id,'1',false,true),earned=await pagesFor(game.id,'1',false,true,true);const unlocked=new Map(earned.raw.map(a=>[String(a.id),a]));
    data={raw:all.raw.map(a=>({...a,...unlocked.get(String(a.id)),unlocked:unlocked.has(String(a.id))})),pages:all.pages};version='1';audit.legacy++;
   }else{
    for(const candidate of ['6','4','2']){
     try{const result=await pagesFor(game.id,candidate);if(result.raw.length||game.total===0){data=result;version=candidate;break;}}
     catch(error){if(fatal(error))throw error;}
    }
   }
   if(!data)throw Error('Xbox 成就读取未完成。');
   const awards=data.raw.map(achievement),unlocked=awards.filter(a=>a.unlocked).length;
   if(awards.length!==game.total||unlocked!==game.earned){audit.summaryMismatches++;throw Error('Xbox 成就明细与摘要不一致。');}
   game.achievements=awards;complete=true;audit.complete++;audit.contracts[version]=(audit.contracts[version]||0)+1;
   let groups=officialGroups(data.pages,game.id,awards);
   if(!groups&&version!=='1'){
    try{const metadata=await pagesFor(game.id,'6',true);groups=officialGroups(metadata.pages,game.id,awards);
     const byId=new Map(metadata.raw.map(a=>[String(a.id),a]));for(const a of awards)if(a.rarity===null)a.rarity=percent(byId.get(a.id)?.rarity?.currentPercentage);
    }catch(error){if(fatal(error))throw error;}
   }
   if(awards.some(a=>a.rarity===null)&&version==='6'){
    try{const metadata=await pagesFor(game.id,'4',true);const byId=new Map(metadata.raw.map(a=>[String(a.id),a]));for(const a of awards)if(a.rarity===null)a.rarity=percent(byId.get(a.id)?.rarity?.currentPercentage);}catch(error){if(fatal(error))throw error;}
   }
   if(groups){audit.officialBaseGroups++;if(groups.some(g=>g.kind!=='base'))audit.officialAddonGroups++;}
   else{groups=catalogGroups(options.catalog,game);if(groups)audit.catalogGroups++;}
   if(groups){game.groups=groups;game.groupStatus='verified';for(const a of awards)a.groupId=groups.find(g=>g.achievementIds.includes(a.id))?.id;}else{game.groupStatus='unavailable';audit.unknownGroups++;}
   if(awards.some(a=>a.rarity!==null))audit.rarityTitles++;audit.rarityAchievements+=awards.filter(a=>a.rarity!==null).length;
   audit.images+=awards.filter(a=>!!a.image).length;audit.unlockDates+=awards.filter(a=>!!a.unlockedAt).length;
   // Legacy time is explicitly unavailable, unless an earlier direct snapshot has a value.
   if(version!=='1')game.minutes=playtime(await provider.call('/player/stats',{xuids:[provider.xuid],arrangebyfield:'xuid',stats:[{name:'MinutesPlayed',titleId:game.id}]}),game.id);
   if(game.minutes!==null)audit.playtimeTitles++;else if(old?.minutes!=null)game.minutes=old.minutes;
  }catch(error){
   audit.failed++;
   if(old){games[i]=complete?{...game,minutes:old.minutes}:{...old};audit.preserved++;}
   if(fatal(error)){audit.interrupted=true;break;}
  }
  audit.processed++;options.progress?.(audit.processed,games.length);
 }
 // Keep previous titles missing from this response; a partial response cannot erase history.
 const ids=new Set(games.map(g=>g.id));for(const [id,g]of prior)if(!ids.has(id)){games.push(g);audit.preserved++;}
 audit.comparison=compareLibrary(games,options.baseline);
 const record:RecordData={id:crypto.randomUUID(),at:audit.at,source:'Xbox',profile:{xuid:provider.xuid,gamertag:setting('Gamertag')||'Xbox 玩家',avatar:safeImage(setting('GameDisplayPicRaw'))},games,warnings:[...(audit.failed?[`${audit.failed} 个游戏的官方数据尚未完整核对。`]:[]),...(audit.unknownGroups?[`${audit.unknownGroups} 个游戏分组未知。`]:[])]};
 return {record,audit};
}
