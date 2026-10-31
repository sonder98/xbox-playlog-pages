import {safeImage,type RecordData} from '../src/data.ts';
/** Store metadata is public; authorization headers must never be sent here. */
export async function australianArtwork(record:RecordData,request:typeof fetch=fetch){
 let resolved=0;
 for(const game of record.games){
  const url=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products/lookup');
  url.search=new URLSearchParams({alternateId:'XboxTitleId',Value:game.id,market:'AU',languages:'en-AU,en,neutral',fieldsTemplate:'Details'}).toString();
  const response=await request(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.status===404)continue;
  if(!response.ok)throw Error('微软澳区游戏资料读取失败；保留线上记录。');
  const data=await response.json();
  const products=data.Products||[];
  // Refuse ambiguous products (bundles/editions); never pick an arbitrary cover.
  const matches=products.filter((p:any)=>p.ProductKind==='Game');
  if(matches.length!==1)continue;
  const localized=matches[0].LocalizedProperties||[];
  const info=localized.find((p:any)=>p.Language==='en-AU')||localized.find((p:any)=>/^en(?:-|$)/.test(p.Language||''));
  if(!info?.ProductTitle)continue;
  const images=(info.Images||[]).filter((i:any)=>i.Width>0&&i.Width===i.Height&&safeImage(i.Uri));
  images.sort((a:any,b:any)=>(Number(b.ImagePurpose==='BoxArt')-Number(a.ImagePurpose==='BoxArt'))||b.Width-a.Width);
  if(!images.length)continue;
  game.name=info.ProductTitle;game.image=safeImage(images[0].Uri);
  delete game.imageWide;delete game.image2x;delete game.image3x;delete game.cachedImage;delete game.cachedImageLarge;
  resolved++;
 }
 return {resolved,total:record.games.length};
}
