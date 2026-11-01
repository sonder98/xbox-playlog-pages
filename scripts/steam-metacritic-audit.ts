import fs from 'node:fs';
import {getPasswords,readVault} from './password.ts';
import {chooseSteam,pcScore} from './steam-metacritic-matcher.ts';
import type {Game} from '../src/data.ts';

/** One-time read-only audit. Inputs are decrypted only on the ephemeral Actions runner.
 * stdout contains aggregate counts exclusively; no profile, game names or tokens. */
const {old,target}=getPasswords(process.env);
const payload=await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target);
if(!Array.isArray(payload.records)||!Array.isArray(payload.records[0]?.games))throw Error('Missing current encrypted Xbox records');
const games=payload.records[0].games as Game[];
const stats={total:0,missingVisibility:0,explicitVisible:0,explicitHidden:0,
 searched:0,matched:0,pcScore:0,steamWithoutScore:0,noExactMatch:0,detailInvalid:0,errors:0,
 eligibleSearched:0,eligibleMatched:0,eligibleScore:0,eligibleNoScore:0,eligibleUnmatched:0};
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
let lastCall=0;
async function json(url:string):Promise<any>{
 const gap=Date.now()-lastCall;
 if(gap<650)await sleep(650-gap);
 lastCall=Date.now();
 const response=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{accept:'application/json','user-agent':'XBOX-Playlog-Metacritic-Coverage-Audit/1.0'}});
 if(!response.ok)throw Error('Steam HTTP '+response.status);
 const result=await response.json();
 if(!result||typeof result!=='object')throw Error('Steam returned invalid JSON');
 return result;
}
const cache=new Map<string,{matched:boolean;scored:boolean;unmatched:boolean;error:boolean}>();
let consecutiveErrors=0,processed=0;
for(const game of games){
 stats.total++;
 const eligible=game.officialHidden===undefined;
 if(eligible)stats.missingVisibility++;
 else if(game.officialHidden===false)stats.explicitVisible++;
 else stats.explicitHidden++;
 const title=String(game.name||'').trim();
 if(!title){stats.noExactMatch++;if(eligible)stats.eligibleUnmatched++;continue;}
 let result=cache.get(title);
 if(!result){
  result={matched:false,scored:false,unmatched:false,error:false};
  try{
   const search=await json('https://store.steampowered.com/api/storesearch/?term='+encodeURIComponent(title)+'&l=english&cc=US');
   const items=Array.isArray(search.items)?search.items:[];
   const appId=chooseSteam(title,items);
   if(!appId)result.unmatched=true;
   else{
    result.matched=true;
    const details=await json('https://store.steampowered.com/api/appdetails?appids='+appId+'&l=english&cc=US');
    const data=details[String(appId)]?.success===true?details[String(appId)].data:null;
    const score=pcScore(data,title);
    if(score!==null)result.scored=true;
   }
   consecutiveErrors=0;
  }catch{
   result.error=true;
   consecutiveErrors++;
  }
  cache.set(title,result);
 }
 if(!result.error)stats.searched++;
 if(result.matched)stats.matched++;
 if(result.scored)stats.pcScore++;
 if(result.matched&&!result.scored&&!result.error)stats.steamWithoutScore++;
 if(result.unmatched)stats.noExactMatch++;
 if(result.error)stats.errors++;
 if(eligible){
  if(!result.error)stats.eligibleSearched++;
  if(result.matched)stats.eligibleMatched++;
  if(result.scored)stats.eligibleScore++;
  if(result.matched&&!result.scored&&!result.error)stats.eligibleNoScore++;
  if(result.unmatched)stats.eligibleUnmatched++;
 }
 processed++;
 if(processed%20===0)console.log('STEAM_AUDIT_PROGRESS '+JSON.stringify({processed,total:games.length,matched:stats.matched,scored:stats.pcScore,errors:stats.errors}));
 if(consecutiveErrors>=8){
  console.log('STEAM_AUDIT_BLOCKED '+JSON.stringify({processed,total:games.length,consecutiveErrors}));
  process.exitCode=2;
  break;
 }
}
console.log('STEAM_AUDIT_SUMMARY '+JSON.stringify({...stats,processed,complete:processed===games.length&&stats.errors===0,
 allCoveragePercent:stats.searched?Number((100*stats.pcScore/stats.searched).toFixed(1)):null,
 missingVisibilityCoveragePercent:stats.eligibleSearched?Number((100*stats.eligibleScore/stats.eligibleSearched).toFixed(1)):null}));
