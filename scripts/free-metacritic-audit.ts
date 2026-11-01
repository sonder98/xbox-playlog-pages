import fs from 'node:fs';
import {getPasswords,readVault} from './password.ts';
import {chooseSteam,pcScore,keyName} from './steam-metacritic-matcher.ts';
/** Read-only real account comparison of free PC Metascore sources.
 * Neither names, IDs, game-level results nor vault secrets are printed.
 * Strict exact normalized-name equivalence avoids fake coverage. */
const {old,target}=getPasswords(process.env);
const vault=await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target);
const games=(vault.records?.[0]?.games||[]).filter((x:any)=>x.officialHidden===undefined&&typeof x.name==='string'&&x.name.trim());
const stats={all:{games:0,steam:0,cheapshark:0,cheapsharkNew:0,union:0,missing:0,errors:0},
 eligible:{games:0,steam:0,cheapshark:0,cheapsharkNew:0,union:0,missing:0,errors:0}};
let lastRequestAt=0;
async function fetchJson(url:string):Promise<any>{
 const ms=Date.now()-lastRequestAt;if(ms<950)await new Promise(r=>setTimeout(r,950-ms));
 lastRequestAt=Date.now();
 const res=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{accept:'application/json','user-agent':'XBOX-Playlog-Coverage-Experiment/1.0'}});
 if(!res.ok)throw Error('HTTP '+res.status);
 return res.json();
}
function hasMetascore(value:unknown):boolean{
 const n=Number(value);return (typeof value==='string'||typeof value==='number')&&Number.isInteger(n)&&n>=1&&n<=100;
}
async function steamScore(title:string):Promise<boolean>{
 const search=await fetchJson('https://store.steampowered.com/api/storesearch/?term='+encodeURIComponent(title)+'&l=english&cc=US');
 const appId=chooseSteam(title,Array.isArray(search?.items)?search.items:[]);
 if(!appId)return false;
 const response=await fetchJson('https://store.steampowered.com/api/appdetails?appids='+appId+'&l=english&cc=US');
 const data=response[String(appId)]?.success?response[String(appId)].data:null;
 return pcScore(data,title)!==null;
}
async function cheapsharkScore(title:string):Promise<boolean>{
 const data=await fetchJson('https://www.cheapshark.com/api/1.0/deals?title='+encodeURIComponent(title)+'&pageSize=60');
 if(!Array.isArray(data))return false;
 // Data is PC retail deals, not M Xbox scores. Require matching title and
 // credible Metacritic URL before treating its score as verified.
 const match=data.filter((item:any)=>item&&typeof item.title==='string'
  &&keyName(item.title)===keyName(title)&&hasMetascore(item.metacriticScore)
  &&typeof item.metacriticLink==='string'&&item.metacriticLink.startsWith('/game/'));
 const scores=[...new Set(match.map((item:any)=>Number(item.metacriticScore)))];
 return scores.length===1;
}
let processed=0;
const cache=new Map<string,{steam:boolean;cheap:boolean;err:boolean}>();
for(const game of games){
 const groups=[stats.all,...(game.officialHidden===undefined?[stats.eligible]:[])];
 for(const group of groups)group.games++;
 const name=String(game.name).trim();
 let record=cache.get(name);
 if(!record){
  let steam=false,cheap=false,err=false;
  try{steam=await steamScore(name);}catch{err=true;}
  try{cheap=await cheapsharkScore(name);}catch{err=true;}
  record={steam,cheap,err};cache.set(name,record);
 }
 for(const group of groups){
  if(record.steam)group.steam++;
  if(record.cheap)group.cheapshark++;
  if(record.cheap&&!record.steam)group.cheapsharkNew++;
  if(record.cheap||record.steam)group.union++;
  else group.missing++;
  if(record.err)group.errors++;
 }
 processed++;
 if(processed%15===0)console.log('FREE_SCORE_PROGRESS '+JSON.stringify({processed,of:games.length,
  eligible:stats.eligible.games,steam:stats.eligible.steam,cheapsharkAdditional:stats.eligible.cheapsharkNew,
  combined:stats.eligible.union,errors:stats.eligible.errors}));
}
for(const group of [stats.all,stats.eligible]){
 (group as any).coveragePercent=group.games?Math.round(group.union/group.games*1000)/10:null;
}
console.log('FREE_SCORE_SUMMARY '+JSON.stringify({...stats,processed,complete:processed===games.length&&stats.all.errors===0}));
