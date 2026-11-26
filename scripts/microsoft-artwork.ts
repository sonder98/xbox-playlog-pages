import {safeImage,distinctScreenshotIndices,type RecordData} from '../src/data.ts';
import {completion} from '../src/completion.ts';
export const AU_ARTWORK_CHECK_MS=7*24*60*60*1000;
const RETRYABLE_STATUS=new Set([408,425,429,500,502,503,504]);
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function retryAfter(response:Response,fallback:number){
 const value=response.headers.get('retry-after');
 if(value){const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return Math.min(30_000,Math.max(250,seconds*1000));const date=Date.parse(value);if(Number.isFinite(date))return Math.min(30_000,Math.max(250,date-Date.now()));}
 return fallback;
}
export function artworkCheckDue(checkedAt:unknown,at:string):boolean{
 const before=typeof checkedAt==='string'?Date.parse(checkedAt):NaN,now=Date.parse(at);
 return !Number.isFinite(before)||!Number.isFinite(now)||now<before||now-before>=AU_ARTWORK_CHECK_MS;
}
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch,previous?:RecordData,options:{pause?:(ms:number)=>Promise<void>;maxAttempts?:number;force?:boolean;budgetMs?:number}={}){
 let resolved=0,landscapes=0,queried=0,reused=0,squareChanged=0,heroChanged=0,failures=0,unavailable=false;
 const pause=options.pause||wait,maxAttempts=Math.max(1,Math.min(4,options.maxAttempts??3));
 const checkedAt=Number.isFinite(Date.parse(record.at))?record.at:new Date().toISOString();
 const beijingToday=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
 const oldById=new Map(previous?.games.map(game=>[game.id,game])||[]);
 const reuseOld=(game:RecordData['games'][number],old:RecordData['games'][number])=>{
  game.name=old.name;game.image=old.image;game.detailImage=old.detailImage;game.detailImagePurpose=old.detailImagePurpose;
  game.posterImage=old.posterImage;game.posterImagePurpose=old.posterImagePurpose;game.posterSelectionVersion=old.posterSelectionVersion;
  if(old.posterScreenshots)game.posterScreenshots=distinctScreenshotIndices(old.posterScreenshots).map(i=>old.posterScreenshots![i]);
  if(old.posterRotationStartDay)game.posterRotationStartDay=old.posterRotationStartDay;
  if(old.artworkCheckedAt)game.artworkCheckedAt=old.artworkCheckedAt;
 };
 const deadline=Date.now()+(options.budgetMs??60_000);
 for(const game of record.games){
  const old=oldById.get(game.id);
  const reusable=old?.detailImagePurpose==='TitledHeroArt'&&old.detailImage&&old.posterImage&&old.image.includes('store-images.s-microsoft.com/image/')&&
   (old.posterSelectionVersion===3&&(!completion(game).mythic||Array.isArray(old.posterScreenshots))||!completion(game).mythic&&old.posterSelectionVersion===2);
  if(!options.force&&reusable&&!artworkCheckDue(old.artworkCheckedAt,checkedAt)){reuseOld(game,old);reused++;resolved++;landscapes++;continue;}
  if(unavailable||Date.now()>=deadline){if(old)reuseOld(game,old);continue;}
  queried++;
  const url=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products/lookup');
  url.search=new URLSearchParams({alternateId:'XboxTitleId',Value:game.id,market:'AU',languages:'en-AU,en,neutral',fieldsTemplate:'Details'}).toString();
  let response:Response|undefined;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try{response=await request(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(RETRYABLE_STATUS.has(response.status)&&attempt<maxAttempts){await pause(retryAfter(response,[1000,2500,6000][Math.min(attempt-1,2)]));continue;}break;
   }catch{if(attempt<maxAttempts){await pause([1000,2500,6000][Math.min(attempt-1,2)]);continue;}}
  }
  if(!response||(!response.ok&&response.status!==404)){failures++;unavailable=true;if(old)reuseOld(game,old);continue;}
  if(response.status===404){if(old)reuseOld(game,old);continue;}
  let data:any;try{data=await response.json();}catch{failures++;unavailable=true;if(old)reuseOld(game,old);continue;}
  const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'');
  const wanted=normalize(game.name);
  if(!Array.isArray(data?.Products)){failures++;unavailable=true;if(old)reuseOld(game,old);continue;}
  const candidates=data.Products.filter((p:any)=>p&&typeof p==='object').map((product:any)=>{
   const localized=Array.isArray(product.LocalizedProperties)?product.LocalizedProperties.filter((p:any)=>p&&typeof p==='object'):[],info=localized.find((p:any)=>p.Language==='en-AU')||localized.find((p:any)=>/^en(?:-|$)/.test(p.Language||''));
   if(typeof info?.ProductTitle!=='string'||!info.ProductTitle)return null;
   const images=(Array.isArray(info.Images)?info.Images:[]).filter((i:any)=>i&&i.Width>0&&i.Height>0&&safeImage(i.Uri));
   const squares=images.filter((i:any)=>Math.abs(i.Width/i.Height-1)<.04);
   squares.sort((a:any,b:any)=>(Number(b.ImagePurpose==='BoxArt')-Number(a.ImagePurpose==='BoxArt'))||b.Width-a.Width);
   if(!squares.length)return null;
   const heroes=images.filter((i:any)=>i.Width/i.Height>=1.45&&i.Width/i.Height<=2.45&&i.Width>=640&&(i.ImagePurpose==='SuperHeroArt'||i.ImagePurpose==='TitledHeroArt'));
   const screenshots=images.filter((i:any)=>i.ImagePurpose==='Screenshot'),firstScreenshot=screenshots[0];
   const posterFallbacks=images.filter((i:any)=>i.Width>=960&&i.Width/i.Height>=1.45&&i.Width/i.Height<=2.45&&['SuperHeroArt','TitledHeroArt'].includes(i.ImagePurpose));
   posterFallbacks.sort((a:any,b:any)=>Number(b.ImagePurpose==='SuperHeroArt')-Number(a.ImagePurpose==='SuperHeroArt')||b.Width-a.Width);
   heroes.sort((a:any,b:any)=>Number(b.ImagePurpose==='TitledHeroArt')-Number(a.ImagePurpose==='TitledHeroArt')||b.Width-a.Width);
   const title=normalize(info.ProductTitle),match=title===wanted?100:title.includes(wanted)||wanted.includes(title)?70:0,kind=product.ProductKind==='Game'?20:product.ProductKind==='GameEdition'?10:0;
   return {info,square:squares[0],hero:heroes[0],poster:firstScreenshot||posterFallbacks[0],screenshots:screenshots.map((i:any)=>safeImage(i.Uri)).filter(Boolean),score:match+kind};
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score);
  const selected=candidates[0];if(!selected||selected.score<10){if(old)reuseOld(game,old);continue;}
  game.name=selected.info.ProductTitle;game.image=safeImage(selected.square.Uri);if(old?.image&&old.image!==game.image)squareChanged++;
  if(selected.hero){game.detailImage=safeImage(selected.hero.Uri);game.detailImagePurpose=selected.hero.ImagePurpose;landscapes++;}
  else{delete game.detailImage;delete game.detailImagePurpose;}
  if(old?.detailImage!==game.detailImage)heroChanged++;
  game.posterSelectionVersion=3;
  if(completion(game).mythic){const shots=selected.screenshots.length?selected.screenshots:(old?.posterScreenshots||[]);game.posterScreenshots=distinctScreenshotIndices(shots).map(i=>shots[i]);game.posterRotationStartDay=old?.posterRotationStartDay||beijingToday;}
  else{delete game.posterScreenshots;delete game.posterRotationStartDay;}
  if(selected.poster){game.posterImage=safeImage(selected.poster.Uri);game.posterImagePurpose=selected.poster.ImagePurpose;}
  else if(old?.posterImage){game.posterImage=old.posterImage;game.posterImagePurpose=old.posterImagePurpose;}
  else{delete game.posterImage;delete game.posterImagePurpose;}
  game.artworkCheckedAt=checkedAt;delete game.imageWide;delete game.image2x;delete game.image3x;
  delete game.cachedImage;delete game.cachedImageLarge;delete game.cachedDetailImage;delete game.cachedPosterImage;delete game.cachedPosterScreenshots;delete game.cachedPosterScreenshotsSmall;
  resolved++;
 }
 return {resolved,total:record.games.length,landscapes,queried,reused,squareChanged,heroChanged,failures,unavailable};
}
