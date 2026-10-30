import {validateRecord,type Game} from '../src/data.ts';
import type {PageData} from './exophase-page.ts';
export type CatalogEntry={source:string;name:string;total:number;data:PageData};
export type CatalogBundle={kind:'exophase-achievement-catalogs';version:1;capturedAt:string;catalogs:CatalogEntry[]};
export function catalogSource(value:string){
 const url=new URL(value,'https://www.exophase.com');
 if(url.protocol!=='https:'||url.hostname!=='www.exophase.com'||!/^\/game\/[^/]+\/achievements\/?$/.test(url.pathname))throw Error('成就目录来源地址无效。');
 url.hash='';url.search='';return url.href.replace(/\/?$/,'/');
}
/** Validate public metadata only; never retain player unlock state in the cache. */
export function parseCatalogBundle(input:any):CatalogBundle{
 if(input?.kind!=='exophase-achievement-catalogs'||input.version!==1||!Array.isArray(input.catalogs)||input.catalogs.length>1000||!Number.isFinite(Date.parse(input.capturedAt)))throw Error('成就目录文件格式无效。');
 const seen=new Set<string>();
 const catalogs=input.catalogs.map((entry:any)=>{
  const source=catalogSource(entry.source);
  if(seen.has(source))throw Error('成就目录来源重复。');seen.add(source);
  const raw=entry.data;
  if(!Array.isArray(raw?.achievements)||!raw.achievements.length)throw Error('成就目录明细为空。');
  const total=Number(entry.total??raw.achievements.length);
  const game=validateRecord({profile:{xuid:'4285437'},games:[{id:'1',name:'catalog',minutes:null,earned:0,total,groups:raw.groups,groupStatus:'verified',achievements:raw.achievements.map((a:any)=>({...a,unlocked:false,unlockedAt:null}))}]}).games[0];
  if(game.groupStatus!=='verified')throw Error('成就目录分组、编号或总数不一致。');
  return {source,name:String(entry.name||'').slice(0,300),total,data:{groups:game.groups!,achievements:game.achievements!}};
 });
 return {kind:'exophase-achievement-catalogs',version:1,capturedAt:new Date(input.capturedAt).toISOString(),catalogs};
}
export function cachedCatalog(bundle:CatalogBundle|undefined,source:string,total:number):PageData|undefined{
 if(!bundle)return;const canonical=catalogSource(source);
 return bundle.catalogs.find(entry=>entry.source===canonical&&entry.total===total)?.data;
}
export function mergeCatalogBundles(old:CatalogBundle,next:CatalogBundle):CatalogBundle{
 const entries=new Map(old.catalogs.map(e=>[e.source,e]));
 for(const entry of next.catalogs)entries.set(entry.source,entry);
 return parseCatalogBundle({...next,catalogs:[...entries.values()]});
}
