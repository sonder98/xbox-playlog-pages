import {microsoftProvider,type DirectConfig} from './microsoft.ts';
export type ProbeReport={version:1;authentication:boolean;profile:boolean;titleHistory:boolean;historyPagination:boolean;refresh:boolean;sampledTitles:number;achievementSamples:{read:boolean;complete:boolean;images:boolean;unlockDates:boolean;rarity:boolean;playtime:boolean;distinctProductIds:number}[];dlcMappingVerified:false;issues:string[]};
const nextToken=(data:any)=>data.pagingInfo?.continuationToken??data.continuationToken??null;
/** Follow continuation tokens even when a page is shorter than maxItems. */
export async function collectPages(read:(token:string|null)=>Promise<any>,key:string){
 const values:any[]=[],seen=new Set<string>();let token:string|null=null,pages=0;
 do{
  const data=await read(token);if(!Array.isArray(data[key]))throw Error('Xbox 分页响应格式无效。');
  values.push(...data[key]);pages++;
  const next=nextToken(data);if(next!==null&&(typeof next!=='string'||seen.has(next)))throw Error('Xbox 分页令牌无效或重复。');
  if(next)seen.add(next);token=next||null;
  if(pages>=100&&token)throw Error('Xbox 分页超过验证上限。');
 }while(token);
 return {values,pages};
}
export function hasPlaytime(data:unknown):boolean{
 const visit=(value:any,depth:number):boolean=>{
  if(!value||typeof value!=='object'||depth>12)return false;
  if(value.name==='MinutesPlayed'&&value.value!==null&&value.value!==undefined&&value.value!==''&&Number.isFinite(Number(value.value))&&Number(value.value)>=0)return true;
  return Object.values(value).some(child=>visit(child,depth+1));
 };return visit(data,0);
}
/** Counts/coverage only; never returns tokens, gamer names, XUIDs, titles or playtimes. */
export async function probeMicrosoft(config:DirectConfig,request:typeof fetch=fetch):Promise<ProbeReport>{
 let latestRefresh=config.refreshToken;
 const provider=await microsoftProvider({...config,onRefreshToken:async token=>{latestRefresh=token;await config.onRefreshToken?.(token);}},request);
 await provider.call('/account');const owner=provider.xuid;
 const report:ProbeReport={version:1,authentication:true,profile:true,titleHistory:false,historyPagination:false,refresh:false,sampledTitles:0,achievementSamples:[],dlcMappingVerified:false,issues:[]};
 const history=await collectPages(token=>provider.call('/player/titleHistory'+(token?'?continuationToken='+encodeURIComponent(token):'')),'titles');
 report.titleHistory=true;report.historyPagination=true;
 const titles=[...new Map(history.values.filter(g=>/^\d{1,10}$/.test(String(g.titleId))&&Number(g.titleId)>0&&Number(g.titleId)<=4294967295&&g.type!=='App').map(g=>[String(g.titleId),g])).values()];
 const samples=titles.sort((a,b)=>(b.achievement?.totalAchievements||0)-(a.achievement?.totalAchievements||0)).slice(0,3);
 report.sampledTitles=samples.length;
 for(const title of samples){
  const sample={read:false,complete:false,images:false,unlockDates:false,rarity:false,playtime:false,distinctProductIds:0};
  try{
   const data=await collectPages(token=>provider.call('/player/achievements/'+title.titleId+(token?'?continuationToken='+encodeURIComponent(token):'')),'achievements');
   const achievements=[...new Map(data.values.filter(a=>typeof a.id==='string').map(a=>[a.id,a])).values()];
   sample.read=true;sample.complete=Number(title.achievement?.totalAchievements)>0?achievements.length===Number(title.achievement.totalAchievements):achievements.length>0;
   sample.images=achievements.some(a=>a.mediaAssets?.some((m:any)=>typeof m.url==='string'&&m.url.startsWith('https://')));
   sample.unlockDates=achievements.some(a=>a.progressState==='Achieved'&&Number.isFinite(Date.parse(a.progression?.timeUnlocked))&&Date.parse(a.progression.timeUnlocked)>0);
   sample.rarity=achievements.some(a=>typeof a.rarity?.currentPercentage==='number'&&a.rarity.currentPercentage>=0&&a.rarity.currentPercentage<=100);
   sample.distinctProductIds=new Set(achievements.map(a=>a.productId).filter((v:any)=>typeof v==='string'&&v)).size;
  }catch{report.issues.push('样本 '+(report.achievementSamples.length+1)+' 成就读取未通过。');}
  try{sample.playtime=hasPlaytime(await provider.call('/player/stats',{xuids:[owner],arrangebyfield:'xuid',stats:[{name:'MinutesPlayed',titleId:String(title.titleId)}]}));}
  catch{report.issues.push('样本 '+(report.achievementSamples.length+1)+' 时长读取未通过。');}
  report.achievementSamples.push(sample);
 }
 const refreshed=await microsoftProvider({...config,refreshToken:latestRefresh,onRefreshToken:config.onRefreshToken},request);
 await refreshed.call('/account');report.refresh=refreshed.xuid===owner;
 if(!report.refresh)throw Error('续期后的账号与首次授权不一致。');
 return report;
}
