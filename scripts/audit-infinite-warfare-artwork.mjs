/**
 * Exact Xbox One / Xbox Series console edition artwork from the public Microsoft
 * AU Store. Uses official console product ID BTCHP5NTZ053 (NOT the Windows PC
 * product 9NBLGGH52PH9). No authentication or private game data is used.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PRODUCT_ID='BTCHP5NTZ053';
const DEST='public/artwork-audit/infinite-warfare';
const params={market:'AU',languages:'en-AU,en,neutral',fieldsTemplate:'Details'};
const byProduct=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products');
byProduct.search=new URLSearchParams({bigIds:PRODUCT_ID,...params}).toString();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean=value=>String(value??'unknown').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,50);
const allowedHost=hostname=>hostname==='store-images.s-microsoft.com'||
 hostname==='store-images.microsoft.com'||hostname==='images-eds-ssl.xboxlive.com'||
 hostname==='assets.xboxservices.com';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retrieve(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'error'});
 if(!response.ok)throw Error('Microsoft Store catalog HTTP '+response.status);
 const result=await response.json();
 return (result.Products||[]).filter(x=>x&&x.ProductId);
}
// Query the exact Xbox One console product, never a search by game name.
const endpoint=byProduct.toString();
const products=(await retrieve(byProduct)).filter(p=>String(p.ProductId).toUpperCase()===PRODUCT_ID);
if(!products.length)throw Error('Microsoft returned no matching Xbox console product '+PRODUCT_ID+'.');
const alt=products.flatMap(p=>p.AlternateIds||[]).find(a=>a.IdType==='XboxTitleId');
const TITLE_ID=alt?.Value||'not-provided-by-catalog';
const groups=[];
for(const product of products){
 const properties=product.LocalizedProperties||[];
 const info=properties.find(x=>x.Language==='en-AU')||properties.find(x=>/^en(?:-|$)/i.test(x.Language||''))||properties[0];
 const title=info?.ProductTitle||'';
 if(!/infinite\s*warfare/i.test(title))continue;
 const images=(info?.Images||[]).map((image,index)=>{
  let link;
  try { link=new URL(image.Uri,'https://store-images.s-microsoft.com'); }catch { return null; }
  if(link.protocol!=='https:'||!allowedHost(link.hostname)||!(Number(image.Width)>0)||!(Number(image.Height)>0))return null;
  return {index,purpose:String(image.ImagePurpose||'Unknown'),width:Number(image.Width),height:Number(image.Height),
   url:link.toString()};
 }).filter(Boolean);
 groups.push({productId:product.ProductId,title,kind:product.ProductKind||'unknown',images});
}
if(!groups.length)throw Error('Official catalog had no matching Call of Duty: Infinite Warfare game/edition.');
// Keep all returned image entries; two product editions may legitimately share art.
const entries=groups.flatMap((group,gi)=>group.images.map(image=>({
 ...image,groupIndex:gi,productId:group.productId,productTitle:group.title,kind:group.kind
})));
if(!entries.length){
 console.log('Infinite Warfare Store public catalog image diagnostics:',JSON.stringify(products.map(p=>({
  productId:p.ProductId,kind:p.ProductKind,
  localized:(p.LocalizedProperties||[]).map(info=>({
   language:info.Language,title:info.ProductTitle,imageCount:(info.Images||[]).length,
   sample:(info.Images||[]).slice(0,5).map(im=>({
    purpose:im.ImagePurpose,width:im.Width,height:im.Height,
    fields:Object.keys(im),publicUri:String(im.Uri??im.Url??im.url).slice(0,220),
    urlHost:(()=>{try{return new URL(im.Uri??im.Url??im.url,'https://store-images.s-microsoft.com').hostname}catch{return 'invalid-or-relative'}})()
   }))
  }))
 }))));
 throw Error('Official AU Store response had no downloadable Infinite Warfare Images.');
}
const originalCount=entries.length;
const limit=120;
const selected=entries.slice(0,limit);
await fs.rm(DEST,{recursive:true,force:true});
await fs.mkdir(path.join(DEST,'images'),{recursive:true});
let downloaded=0;
for(let i=0;i<selected.length;i++){
 const entry=selected[i];
 const filename=`${String(i+1).padStart(3,'0')}-${clean(entry.purpose)}-${clean(entry.productId)}.webp`;
 try{
  const response=await fetch(entry.url,{signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!response.ok)throw Error('image HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.byteLength>18_000_000)throw Error('image exceeded 18MB');
  const {data,info}=await sharp(bytes,{limitInputPixels:50_000_000})
   .rotate().resize({width:1440,withoutEnlargement:true}).webp({quality:84,effort:4})
   .toBuffer({resolveWithObject:true});
  await fs.writeFile(path.join(DEST,'images',filename),data);
  entry.file='images/'+filename;
  entry.localWidth=info.width;
  entry.localHeight=info.height;
  entry.savedBytes=data.length;
  downloaded++;
 }catch(error){
  entry.error=String(error.message||error).slice(0,120);
 }
 if((i+1)%10===0)console.log('Infinite Warfare public Store images:',i+1,'/',selected.length,'saved',downloaded);
 // Being kind to the official catalog/CDN; no Xbox authenticated APIs are used.
 if(i<selected.length-1)await sleep(140);
}
if(downloaded<1)throw Error('No Infinite Warfare artwork could be downloaded. Inspect official Store endpoint before publishing.');

const purposes={};
for(const entry of entries)purposes[entry.purpose]=(purposes[entry.purpose]||0)+1;
const manifest={
 verifiedStorePlatform:'Xbox One / Xbox Series X|S (from Microsoft Xbox Australia console store)',
 excludedWindowsPcProductId:'9NBLGGH52PH9',
 capturedAt:new Date().toISOString(),market:'AU',languages:'en-AU,en,neutral',
 source:'Microsoft Store DisplayCatalog v7.0 (public, unauthenticated)',
 title:'Call of Duty: Infinite Warfare',xboxTitleId:TITLE_ID,storeProductId:PRODUCT_ID,
 endpoint,productCount:groups.length,products:groups.map(({images,...x})=>({...x,imageCount:images.length})),
 totalImageEntries:originalCount,attempted:selected.length,downloaded,
 truncated:originalCount>limit,types:purposes,
 images:selected
};
await fs.writeFile(path.join(DEST,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const ordered=[...selected].sort((a,b)=>{
 const rank=p=>({SuperHeroArt:0,TitledHeroArt:1,Screenshot:2,BoxArt:3,PosterArt:4}[p]??5);
 return rank(a.purpose)-rank(b.purpose)||a.groupIndex-b.groupIndex||a.index-b.index;
});
const tabs=['ALL',...Object.keys(purposes).sort()];
const cards=ordered.map((im,i)=>`
 <article class="card" data-type="${esc(im.purpose)}">
  <a class="preview" href="${esc(im.file||im.url)}" target="_blank" rel="noreferrer">
   ${im.file?`<img src="${esc(im.file)}" alt="${esc(im.purpose)} #${im.index}" loading="lazy">`:
    `<span class="not-saved">素材未能缓存</span>`}
  </a>
  <div class="meta">
   <strong>${esc(im.purpose)}</strong>
   <span class="dimensions">${esc(im.width)} × ${esc(im.height)}</span>
   <small>${esc(im.productTitle)} · ${esc(im.productId)}</small>
   <div class="links">${im.file?`<a href="${esc(im.file)}" download>本地 WebP</a>`:''}
    <a href="${esc(im.url)}" target="_blank" rel="noreferrer">微软原图</a></div>
   ${im.error?`<small class="error">${esc(im.error)}</small>`:''}
  </div>
 </article>`).join('\n');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#090c0b">
<title>Infinite Warfare · Xbox 澳区商店图片资产盘点</title>
<style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#080b0a;color:#f1f3ef}
*{box-sizing:border-box}body{margin:0}header{padding:36px max(24px,calc((100vw - 1360px)/2));background:radial-gradient(ellipse at 40% 0%,#234133,#101615 60%,#090c0b)}
.kicker{font-size:11px;letter-spacing:2.5px;color:#a9f45f;font-weight:700}h1{font-size:clamp(26px,4vw,40px);line-height:1.1;margin:13px 0 18px}
p{color:#9aa9a1;line-height:1.6;max-width:800px;font-size:14px}.stats{display:flex;gap:20px;flex-wrap:wrap;margin-top:24px;color:#c5d5cb}
.stats b{color:#b8f96c;font-size:22px}.toolbar{position:sticky;top:0;z-index:2;background:#0b100eeb;backdrop-filter:blur(12px);
 display:flex;flex-wrap:wrap;gap:8px;padding:14px max(24px,calc((100vw - 1360px)/2));border-bottom:1px solid #34443a}
button{font:inherit;background:#17211c;color:#b5cabc;border:1px solid #3b4b40;padding:7px 12px;border-radius:999px;cursor:pointer}
button.active{background:#b6ff67;color:#142015;border-color:#b6ff67;font-weight:750}
main{max-width:1410px;margin:auto;padding:30px 24px 60px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,350px),1fr));gap:18px}
.card{border:1px solid #344239;border-radius:13px;overflow:hidden;background:#141a17}.card[hidden]{display:none}
.preview{height:235px;display:grid;place-items:center;background:#0b1210}
.preview img{width:100%;height:100%;object-fit:contain}.not-saved{color:#b2b9ae}
.meta{padding:16px;display:flex;flex-direction:column;gap:9px}.meta strong{color:#c9ff87}
.dimensions{font-variant-numeric:tabular-nums;color:#e2e8dd;font-size:13px}
small{color:#91a197;font-size:11px;overflow-wrap:anywhere}.links{display:flex;gap:16px;margin-top:4px}
a{color:#c7ff86;text-decoration:none}.links a{font-size:13px}.error{color:#f2a4a4}
footer{padding:16px 24px 45px;color:#83918a;text-align:center;font-size:12px}
</style></head><body>
<header><div class="kicker">XBOX PLAYLOG · MICROSOFT STORE AU</div>
<h1>Call of Duty: Infinite Warfare<br>官方图片素材盘点</h1>
<p>使用与 XBOX Playlog 相同的 Microsoft Store DisplayCatalog 接口，查询澳大利亚区 en-AU 图片素材。
下面的图片是微软返回的真实素材；本地 WebP 最长边压缩至 1440px，保留“微软原图”链接。
只查询微软澳区的 Xbox One / Series 主机版商品 BTCHP5NTZ053；未请求同名 PC 商品 9NBLGGH52PH9，也不访问任何个人档案或授权数据。</p>
<div class="stats"><span><b>${groups.length}</b> 产品</span><span><b>${originalCount}</b> 返回图片条目</span>
<span><b>${downloaded}</b> 已保存到 GitHub</span><span><b>${tabs.length-1}</b> 种图片用途</span></div>
<p>查询日期：${esc(manifest.capturedAt)} · <a href="manifest.json">完整字段与接口返回统计（JSON）</a></p></header>
<div class="toolbar" role="group" aria-label="按图片用途筛选">
${tabs.map((type,i)=>`<button type="button" class="${i?'':'active'}" data-filter="${esc(type)}">${esc(type)}${i?` · ${purposes[type]}`:''}</button>`).join('')}
</div>
<main><div id="grid" class="grid">${cards}</div></main>
<footer>素材版权归原权利人所有。仅用于个人游戏记录网站的素材类型比较，不提供商用授权。</footer>
<script>
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 const selected=button.dataset.filter;
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));
 document.querySelectorAll('.card').forEach(card=>card.hidden=selected!=='ALL'&&card.dataset.type!==selected);
}));
</script></body></html>`;
await fs.writeFile(path.join(DEST,'index.html'),html);
await fs.writeFile(path.join(DEST,'README.md'),`# Infinite Warfare · 澳区 Xbox 商店图片资产\n\n- 查询日期：${manifest.capturedAt}\n- 官方商品：${PRODUCT_ID}（XboxTitleId：${TITLE_ID}）\n- 返回产品：${groups.length}；图片条目：${originalCount}；下载成功：${downloaded}\n- 图片类型：${Object.entries(purposes).map(([k,v])=>k+' '+v).join('、')}\n- 预览：<https://sonder98.github.io/xbox-playlog-pages/artwork-audit/infinite-warfare/>\n- 接口：${endpoint}\n\n图片来自微软 Xbox 澳大利亚主机版商品 BTCHP5NTZ053 的官方公开接口，不使用 Windows PC 版商品 9NBLGGH52PH9。WebP 预览最长边 1440px；元数据见 [manifest.json](manifest.json)。\n\n素材版权归原权利人所有，供个人设计研究参考。\n`);
console.log(JSON.stringify({products:groups.length,purposes,returned:originalCount,saved:downloaded,preview:'artwork-audit/infinite-warfare/index.html'}));
