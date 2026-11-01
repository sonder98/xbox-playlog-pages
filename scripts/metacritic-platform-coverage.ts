import fs from 'node:fs';
import {getPasswords,readVault} from './password.ts';
import {selectPreferredMetascore,strictGameSlug,normalTitle} from './metacritic-platform-choice.ts';

/** A one-time *read-only* availability experiment, not an ongoing scraper.
 * Metacritic has no documented consumer API; responses here are not promised.
 * Only aggregate counters are printed. Games/profile remain on Actions runner. */
const {old,target}=getPasswords(process.env);
const vault=await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target);
const games=(vault.records?.[0]?.games||[]).filter((g:any)=>g.officialHidden===undefined&&typeof g.name==='string');
const counts={eligible:games.length,queried:0,exactSearchMatches:0,pc:0,xbox:0,missingPlatformScore:0,unmatched:0,errors:0,blocked:0,
 xboxSeries:0,xboxOne:0,xbox360:0};
const key='1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u'; // Public website frontend key documented in browser-harness, may rotate.
let last=0;
async function read(url:string):Promise<any>{
 const gap=Date.now()-last;
 if(gap<700)await new Promise(r=>setTimeout(r,700-gap));
 last=Date.now();
 const res=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:'application/json','User-Agent':'XBOXPlaylog-Metascore-Coverage-Check/1.0'}});
 if(res.status===403||res.status===401||res.status===429){counts.blocked++;throw Error('Metacritic backend unavailable '+res.status);}
 if(!res.ok)throw Error('Metacritic API HTTP '+res.status);
 return res.json();
}
const base='https://backend.metacritic.com';
for(const game of games){
 try{
  const p=new URLSearchParams({offset:'0',limit:'15',sortBy:'META_SCORE',sortDirection:'DESC',mcoTypeId:'13',componentName:'search',componentType:'SearchResult',apiKey:key});
  const search=await read(base+'/finder/metacritic/search/'+encodeURIComponent(game.name)+'/web?'+p);
  const slug=strictGameSlug(game.name,search?.data?.items);
  counts.queried++;
  if(!slug){counts.unmatched++;continue;}
  counts.exactSearchMatches++;
  const detailParams=new URLSearchParams({componentName:'product',componentType:'Product',apiKey:key});
  const detail=await read(base+'/games/metacritic/'+slug+'/web?'+detailParams);
  const item=detail?.data?.item;
  if(!item||typeof item.title!=='string'||normalTitle(item.title)!==normalTitle(game.name)||!Array.isArray(item.platforms)){
   counts.unmatched++;continue;
  }
  const chosen=selectPreferredMetascore(item.platforms);
  if(!chosen){counts.missingPlatformScore++;continue;}
  if(chosen.platform==='PC')counts.pc++;
  else{
   counts.xbox++;
   if(chosen.platform==='Xbox Series X')counts.xboxSeries++;
   else if(chosen.platform==='Xbox One')counts.xboxOne++;
   else counts.xbox360++;
  }
 }catch(e){
  counts.errors++;
  if(counts.blocked){break;}
  if(counts.errors>=5)break;
 }
}
const covered=counts.pc+counts.xbox,denominator=counts.eligible;
console.log('METACRITIC_PLATFORM_COVERAGE '+JSON.stringify({...counts,covered,
 coveragePercent:denominator?Math.round(covered*1000/denominator)/10:null,
 complete:counts.queried===counts.eligible&&counts.errors===0}));
