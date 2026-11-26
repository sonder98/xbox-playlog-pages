import {safeImage,distinctScreenshotIndices,type RecordData} from '../src/data.ts';
import {completion} from '../src/completion.ts';
/** The Store metadata response has no reliable cross-title artwork version.
 * Refresh old cover and hero URLs weekly, including games not recently played. */
export const AU_ARTWORK_CHECK_MS=7*24*60*60*1000;
export function artworkCheckDue(checkedAt:unknown,at:string):boolean{
 const before=typeof checkedAt==='string'?Date.parse(checkedAt):NaN,now=Date.parse(at);
 return !Number.isFinite(before)||!Number.isFinite(now)||now<before||now-before>=AU_ARTWORK_CHECK_MS;
}
/** Select only first-party Australian Store artwork. Never send Xbox auth headers to this endpoint. */
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch,previous?:RecordData){
 let resolved=0,landscapes=0,queried=0,reused=0,squareChanged=0,heroChanged=0;
 const checkedAt=Number.isFinite(Date.parse(record.at))?record.at:new Date().toISOString();
 const beijingToday=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
 const oldById=new Map(previous?.games.map(game=>[game.id,game])||[]);
 const reuseOld=(game:RecordData['games'][number],old:RecordData['games'][number])=>{
  game.name=old.name;game.image=old.image;
  game.detailImage=old.detailImage;game.detailImagePurpose=old.detailImagePurpose;
  game.posterImage=old.posterImage;game.posterImagePurpose=old.posterImagePurpose;
  game.posterSelectionVersion=old.posterSelectionVersion;
  if(old.posterScreenshots)game.posterScreenshots=distinctScreenshotIndices(old.posterScreenshots).map(i=>old.posterScreenshots![i]);
  if(old.posterRotationStartDay)game.posterRotationStartDay=old.posterRotationStartDay;
  if(old.artworkCheckedAt)game.artworkCheckedAt=old.artworkCheckedAt;
 };
 const deadline=Date.now()+60_000;
 let unavailable=false;
 for(const game of record.games){
  const old=oldById.get(game.id);
  const reusable=old?.detailImagePurpose==='TitledHeroArt'&&old.detailImage&&old.posterImage&&
   old.image.includes('store-images.s-microsoft.com/image/')&&
   (old.posterSelectionVersion===3&&(!completion(game).mythic||Array.isArray(old.posterScreenshots))||
    !completion(game).mythic&&old.posterSelectionVersion===2);
  if(reusable&&!artworkCheckDue(old.artworkCheckedAt,checkedAt)){
   reuseOld(game,old);
   reused++;resolved++;landscapes++;continue;
  }
  // Legacy snapshots have no artworkCheckedAt: audit them once on the next sync.
  // Only the image metadata is re-read; unchanged WebP files stay in cache.
  if(unavailable||Date.now()>deadline){if(old)reuseOld(game,old);continue;}
  queried++;
  const url=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products/lookup');
  url.search=new URLSearchParams({alternateId:'XboxTitleId',Value:game.id,market:'AU',languages:'en-AU,en,neutral',fieldsTemplate:'Details'}).toString();
  let response:Response;
  try{response=await request(url,{redirect:'error',signal:AbortSignal.timeout(12000)});}
  catch{unavailable=true;if(old)reuseOld(game,old);continue;}
  if(response.status===404){if(old)reuseOld(game,old);continue;}
  if(!response.ok){
   unavailable=response.status===429||response.status>=500;
   if(old)reuseOld(game,old);
   continue;
  }
  let data;
  try{data=await response.json();}catch{if(old)reuseOld(game,old);continue;}
  const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'');
  const wanted=normalize(game.name);
  const candidates=(data.Products||[]).map((product:any)=>{
    const localized=product.LocalizedProperties||[];
    const info=localized.find((p:any)=>p.Language==='en-AU')||localized.find((p:any)=>/^en(?:-|$)/.test(p.Language||''));
    if(!info?.ProductTitle)return null;
    const images=(info.Images||[]).filter((i:any)=>i.Width>0&&i.Height>0&&safeImage(i.Uri));
    const squares=images.filter((i:any)=>Math.abs(i.Width/i.Height-1)<.04);
    squares.sort((a:any,b:any)=>(Number(b.ImagePurpose==='BoxArt')-Number(a.ImagePurpose==='BoxArt'))||b.Width-a.Width);
    if(!squares.length)return null;
    const heroes=images.filter((i:any)=>i.Width/i.Height>=1.45&&i.Width/i.Height<=2.45&&i.Width>=640&&(i.ImagePurpose==='SuperHeroArt'||i.ImagePurpose==='TitledHeroArt'));
    // The collectible deliberately uses the FIRST Screenshot in the official
    // response, not the largest image or the unrelated Store hero/banner.
    const screenshots=images.filter((i:any)=>i.ImagePurpose==='Screenshot');
    const firstScreenshot=screenshots[0];
    const posterFallbacks=images.filter((i:any)=>i.Width>=960&&i.Width/i.Height>=1.45&&i.Width/i.Height<=2.45&&
     ['SuperHeroArt','TitledHeroArt'].includes(i.ImagePurpose));
    posterFallbacks.sort((a:any,b:any)=>
     Number(b.ImagePurpose==='SuperHeroArt')-Number(a.ImagePurpose==='SuperHeroArt')||b.Width-a.Width);
    // Prefer the artwork including the game's title: TitledHeroArt -> SuperHeroArt -> square BoxArt fallback.
    heroes.sort((a:any,b:any)=>Number(b.ImagePurpose==='TitledHeroArt')-Number(a.ImagePurpose==='TitledHeroArt')||b.Width-a.Width);
    const title=normalize(info.ProductTitle);
    const match=title===wanted?100:title.includes(wanted)||wanted.includes(title)?70:0;
    const kind=product.ProductKind==='Game'?20:product.ProductKind==='GameEdition'?10:0;
    return {info,square:squares[0],hero:heroes[0],poster:firstScreenshot||posterFallbacks[0],
     screenshots:screenshots.map((i:any)=>safeImage(i.Uri)).filter(Boolean),score:match+kind};
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score);
  const selected=candidates[0];
  if(!selected||selected.score<10){if(old)reuseOld(game,old);continue;}
  game.name=selected.info.ProductTitle;game.image=safeImage(selected.square.Uri);
  if(old?.image&&old.image!==game.image)squareChanged++;
  if(selected.hero){
   game.detailImage=safeImage(selected.hero.Uri);
   game.detailImagePurpose=selected.hero.ImagePurpose;
   landscapes++;
  }else{
   delete game.detailImage;delete game.detailImagePurpose;
  }
  if(old?.detailImage!==game.detailImage)heroChanged++;
  // Existing Mythic entries are upgraded once. Other games need the complete
  // screenshot list only when they first reach Mythic status.
  game.posterSelectionVersion=3;
  if(completion(game).mythic){
   const screenshots=selected.screenshots.length?selected.screenshots:(old?.posterScreenshots||[]);
   game.posterScreenshots=distinctScreenshotIndices(screenshots).map(i=>screenshots[i]);
   game.posterRotationStartDay=old?.posterRotationStartDay||beijingToday;
  }else{
   delete game.posterScreenshots;delete game.posterRotationStartDay;
  }
  if(selected.poster){
   game.posterImage=safeImage(selected.poster.Uri);
   game.posterImagePurpose=selected.poster.ImagePurpose;
  }else if(old?.posterImage){
   game.posterImage=old.posterImage;game.posterImagePurpose=old.posterImagePurpose;
  }else{
   delete game.posterImage;delete game.posterImagePurpose;
  }
  game.artworkCheckedAt=checkedAt;
  delete game.imageWide;delete game.image2x;delete game.image3x;
  delete game.cachedImage;delete game.cachedImageLarge;delete game.cachedDetailImage;
  delete game.cachedPosterImage;delete game.cachedPosterScreenshots;
  resolved++;
 }
 return {resolved,total:record.games.length,landscapes,queried,reused,squareChanged,heroChanged};
}
