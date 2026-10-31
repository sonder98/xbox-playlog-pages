import {safeImage,type RecordData} from '../src/data.ts';
/** Public Microsoft catalog metadata. No Xbox authorization headers are sent. */
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch,previous?:RecordData){
 let resolved=0,landscapes=0;
 for(const game of record.games){
  const old=previous?.games.find(item=>item.id===game.id);
  if(old?.detailImage)game.detailImage=old.detailImage;
  // A previously verified AU square plus a real landscape can be reused unchanged.
  if(old?.name===game.name&&old.image.includes('store-images.s-microsoft.com/image/')&&old.detailImage){
   game.name=old.name;game.image=old.image;game.detailImage=old.detailImage;
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
    const wides=images.filter((i:any)=>i.Width/i.Height>=1.45&&i.Width/i.Height<=2.45&&i.Width>=640);
    const purpose=(image:any)=>/superhero|hero|background|featured|promotional/i.test(image.ImagePurpose||'')?2:/screenshot/i.test(image.ImagePurpose||'')?0:1;
    wides.sort((a:any,b:any)=>purpose(b)-purpose(a)||b.Width-a.Width);
    const title=normalize(info.ProductTitle);
    const match=title===wanted?100:title.includes(wanted)||wanted.includes(title)?70:0;
    const kind=product.ProductKind==='Game'?20:product.ProductKind==='GameEdition'?10:0;
    return {info,square:squares[0],wide:wides[0],score:match+kind};
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score);
  const selected=candidates[0];
  if(!selected||selected.score<10)continue;
  game.name=selected.info.ProductTitle;
  game.image=safeImage(selected.square.Uri);
  if(selected.wide)game.detailImage=safeImage(selected.wide.Uri);
  if(game.detailImage)landscapes++;
  delete game.imageWide;delete game.image2x;delete game.image3x;
  delete game.cachedImage;delete game.cachedImageLarge;delete game.cachedDetailImage;
  resolved++;
 }
 return {resolved,total:record.games.length,landscapes};
}
