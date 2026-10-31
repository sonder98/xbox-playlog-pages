import {safeImage,type RecordData} from '../src/data.ts';
/** Select only first-party Australian Store artwork. Never send Xbox auth headers to this endpoint. */
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch,previous?:RecordData){
 let resolved=0,landscapes=0;
 const oldById=new Map(previous?.games.map(game=>[game.id,game])||[]);
 for(const game of record.games){
  const old=oldById.get(game.id);
  // Once the highest-priority Australian hero is verified, reuse it without refetching.
  if(old?.detailImagePurpose==='SuperHeroArt'&&old.detailImage&&old.image.includes('store-images.s-microsoft.com/image/')){
   game.name=old.name;game.image=old.image;game.detailImage=old.detailImage;game.detailImagePurpose=old.detailImagePurpose;
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
    // Purpose outranks resolution: SuperHeroArt -> TitledHeroArt -> no landscape (BoxArt fallback).
    heroes.sort((a:any,b:any)=>Number(b.ImagePurpose==='SuperHeroArt')-Number(a.ImagePurpose==='SuperHeroArt')||b.Width-a.Width);
    const title=normalize(info.ProductTitle);
    const match=title===wanted?100:title.includes(wanted)||wanted.includes(title)?70:0;
    const kind=product.ProductKind==='Game'?20:product.ProductKind==='GameEdition'?10:0;
    return {info,square:squares[0],hero:heroes[0],score:match+kind};
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
  delete game.imageWide;delete game.image2x;delete game.image3x;
  delete game.cachedImage;delete game.cachedImageLarge;delete game.cachedDetailImage;
  resolved++;
 }
 return {resolved,total:record.games.length,landscapes};
}
