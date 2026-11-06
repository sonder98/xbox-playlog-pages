import {safeImage,type RecordData} from '../src/data.ts';
import {completion} from '../src/completion.ts';
/** Select only first-party Australian Store artwork. Never send Xbox auth headers to this endpoint. */
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch,previous?:RecordData){
 let resolved=0,landscapes=0;
 const beijingToday=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
 const oldById=new Map(previous?.games.map(game=>[game.id,game])||[]);
 for(const game of record.games){
  const old=oldById.get(game.id);
  // Upgrade already-Mythic games once from the old hero-first poster to the first
  // AU Store Screenshot. Keep reuse for other games and already-migrated posters.
  if(old?.detailImagePurpose==='TitledHeroArt'&&old.detailImage&&old.posterImage&&old.image.includes('store-images.s-microsoft.com/image/')&&
    (old.posterSelectionVersion===3&&(!completion(game).mythic||Array.isArray(old.posterScreenshots))||
     !completion(game).mythic&&old.posterSelectionVersion===2)){
   game.name=old.name;game.image=old.image;game.detailImage=old.detailImage;game.detailImagePurpose=old.detailImagePurpose;
   game.posterImage=old.posterImage;game.posterImagePurpose=old.posterImagePurpose;game.posterSelectionVersion=old.posterSelectionVersion;
   if(old.posterScreenshots)game.posterScreenshots=old.posterScreenshots;
   if(old.posterRotationStartDay)game.posterRotationStartDay=old.posterRotationStartDay;
   resolved++;landscapes++;continue;
  }
  const url=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products/lookup');
  url.search=new URLSearchParams({alternateId:'XboxTitleId',Value:game.id,market:'AU',languages:'en-AU,en,neutral',fieldsTemplate:'Details'}).toString();
  const response=await request(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.status===404)continue;
  if(!response.ok)throw Error('微软澳区游戏资料读取失败；保留线上记录。');
  const data=await response.json();
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
  if(!selected||selected.score<10)continue;
  game.name=selected.info.ProductTitle;game.image=safeImage(selected.square.Uri);
  if(selected.hero){
   game.detailImage=safeImage(selected.hero.Uri);
   game.detailImagePurpose=selected.hero.ImagePurpose;
   landscapes++;
  }else{
   delete game.detailImage;delete game.detailImagePurpose;
  }
  // Existing Mythic entries are upgraded once. Other games need the complete
  // screenshot list only when they first reach Mythic status.
  game.posterSelectionVersion=3;
  if(completion(game).mythic){
   game.posterScreenshots=selected.screenshots;
   game.posterRotationStartDay=old?.posterRotationStartDay||beijingToday;
  }else{
   delete game.posterScreenshots;delete game.posterRotationStartDay;
  }
  if(selected.poster){
   game.posterImage=safeImage(selected.poster.Uri);
   game.posterImagePurpose=selected.poster.ImagePurpose;
  }else{
   delete game.posterImage;delete game.posterImagePurpose;
  }
  delete game.imageWide;delete game.image2x;delete game.image3x;
  delete game.cachedImage;delete game.cachedImageLarge;delete game.cachedDetailImage;
  delete game.cachedPosterImage;delete game.cachedPosterScreenshots;
  resolved++;
 }
 return {resolved,total:record.games.length,landscapes};
}
