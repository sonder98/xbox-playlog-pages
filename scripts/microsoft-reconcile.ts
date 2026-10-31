import {microsoftProvider,XboxReadError,type DirectConfig} from './microsoft.ts';
import {collectPages} from './microsoft-probe.ts';
import {titleAliases,normalizedName,catalogGroups,compareLibrary} from './microsoft-library.ts';
import type {CatalogBundle} from './catalog-cache.ts';
import type {RecordData,Game} from '../src/data.ts';
type Names={ids:string[];names:Record<string,string>};
/** Server-only reconciliation: locale aliases never replace the user's displayed names. */
export async function reconcileMicrosoft(config:DirectConfig,candidate:any,baseline:RecordData|undefined,catalog:CatalogBundle|undefined,options:{expectedOwner:string;request?:typeof fetch;pause?:(ms:number)=>Promise<void>;progress?:(n:number,total:number)=>void}){
 const pause=options.pause||((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const request:typeof fetch=async(input,init)=>{await pause(1050);return (options.request||fetch)(input,init);};
 const provider=await microsoftProvider(config,request);await provider.call('/account');
 if(provider.xuid!==options.expectedOwner||provider.xuid!==candidate.record?.profile?.xuid)throw Error('微软核对账号与已保存快照不一致。');
 const aliases=await titleAliases(path=>provider.call(path)),games=candidate.record.games as Game[],namesCache:Record<string,Names>=candidate.englishAchievements||{};
 const mappedNames=new Map<string,Map<string,string>>();let metadataRead=0,reused=0,metadataFailures=0,checked=0;
 const targets=games.filter(g=>g.achievements?.length&&[g.name,...(aliases.get(g.id)||[])].some(name=>(baseline?.games||[]).some(p=>normalizedName(p.name)===normalizedName(name))||catalog?.catalogs.some(c=>normalizedName(c.name)===normalizedName(name))));
 for(const game of targets){
  const ids=game.achievements!.map(a=>a.id).sort();let entry=namesCache[game.id];
  try{
   if(!entry||JSON.stringify(entry.ids)!==JSON.stringify(ids)){
    const all=await collectPages(token=>provider.call(`/player/achievements/${game.id}?contractVersion=6&possibleOnly=true&locale=en-US`+(token?'&continuationToken='+encodeURIComponent(token):'')),'achievements');
    const values=all.values.filter(a=>a.achievementType!=='Challenge'),fetched=values.map(a=>String(a.id)).sort();
    if(JSON.stringify(fetched)!==JSON.stringify(ids)||values.some(a=>typeof a.name!=='string'))throw Error('Xbox 英文目录与当前目录不一致。');
    entry={ids,names:Object.fromEntries(values.map(a=>[String(a.id),a.name]))};namesCache[game.id]=entry;metadataRead++;
   }else reused++;
   mappedNames.set(game.id,new Map(Object.entries(entry.names)));
   // Named DLC packs are accepted only after a full name+score bijection and agreement with the official base IDs.
   const catalogNames=[game.name,...(aliases.get(game.id)||[])];
   const entries=catalog?.catalogs.filter(c=>catalogNames.some(name=>normalizedName(c.name)===normalizedName(name))&&c.total===game.total)||[];
   if(entries.length===1){
    const virtual={...game,name:entries[0].name,achievements:game.achievements!.map(a=>({...a,name:entry.names[a.id]||a.name}))};
    const groups=catalogGroups(catalog,virtual),base=game.groupStatus==='verified'?game.groups?.find(g=>g.kind==='base'):undefined;
    if(groups&&(!base||JSON.stringify(base.achievementIds.slice().sort())===JSON.stringify(groups.find(g=>g.kind==='base')!.achievementIds.slice().sort()))){
     game.groups=groups;game.groupStatus='verified';for(const a of game.achievements!)a.groupId=groups.find(g=>g.achievementIds.includes(a.id))?.id;
    }
   }
  }catch(error){metadataFailures++;if(error instanceof XboxReadError&&[401,429].includes(error.status))break;}
  checked++;options.progress?.(checked,targets.length);
 }
 const devices:Record<string,number>={};const empty=games.filter(g=>!g.achievements?.length);
 for(const game of empty){for(const value of game.devices){const known=['Xbox360','XboxOne','XboxSeries','XboxSeriesX','PC','Win32','WindowsOneCore','WindowsPhone','Android','iOS'];const name=known.includes(value)?value:'Other';devices[name]=(devices[name]||0)+1;}}
 candidate.englishAchievements=namesCache;candidate.audit.at=candidate.record.at;
 candidate.audit.comparison=compareLibrary(games,baseline,aliases,mappedNames);
 candidate.audit.catalogGroups=games.filter(g=>g.groupStatus==='verified'&&g.groups?.find(p=>p.kind==='base')?.id!=='xbox-base').length;
 candidate.audit.unknownGroups=games.filter(g=>g.groupStatus!=='verified').length;
 candidate.audit.reconciliation={checked,targets:targets.length,metadataRead,reused,metadataFailures,emptyTitles:empty.length,emptyDevices:devices};
 return candidate;
}
