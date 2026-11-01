/** Prioritize a verified PC Metascore, fall back to the current Xbox family.
 * These are professional critic scores, never Microsoft Store player stars. */
export type PlatformScore={slug?:string;name?:string;criticScoreSummary?:{score?:number|null;reviewCount?:number|null}};
export type PreferredMetascore={score:number;platform:'PC'|'Xbox Series X'|'Xbox One'|'Xbox 360'}|null;
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=100;
export const normalTitle=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/[™®©]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const platformNames:ReadonlyArray<{slug:string;label:NonNullable<PreferredMetascore>['platform']}>=
 [{slug:'pc',label:'PC'},{slug:'xbox-series-x',label:'Xbox Series X'},{slug:'xbox-one',label:'Xbox One'},{slug:'xbox-360',label:'Xbox 360'}];
export function selectPreferredMetascore(platforms:PlatformScore[]):PreferredMetascore{
 for(const option of platformNames){
  const matches=platforms.filter(x=>(x.slug||'').toLowerCase()===option.slug);
  if(matches.length!==1)continue;
  const score=matches[0].criticScoreSummary?.score;
  if(valid(score))return {score,platform:option.label};
 }
 return null;
}
export function strictGameSlug(name:string,searchItems:unknown):string|null{
 if(!Array.isArray(searchItems))return null;
 const matches=searchItems.filter((x:any)=>x&&x.type==='game-title'&&typeof x.title==='string'&&normalTitle(x.title)===normalTitle(name)&&typeof x.slug==='string'&&/^[a-z0-9-]+$/.test(x.slug));
 return matches.length===1?matches[0].slug:null;
}
