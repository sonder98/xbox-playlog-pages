import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type {RecordData} from '../src/data.ts';

const version='webp-v1';
export function imageSource(value:string):string|null{
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='m.exophase.com'&&!u.port&&!u.username&&!u.password&&/^\/[^/]+\/(?:games|awards)\//.test(u.pathname)?u.href:null;}catch{return null;}
}
export function imageCacheName(url:string,width:number){return `${createHash('sha256').update(`${version}:${url}:${width}`).digest('hex').slice(0,32)}-${width}.webp`;}
export async function convertImage(bytes:Uint8Array,width:number){
  return sharp(bytes,{limitInputPixels:32_000_000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:80,effort:4}).toBuffer();
}
type Options={directory?:string;baseUrl?:string;budgetMs?:number;fetchImage?:(url:string)=>Promise<Uint8Array>};
/** Only public CDN artwork is mirrored; records and credentials never enter this directory. */
export async function cacheRecordImages(record:RecordData,options:Options={}){
  const directory=options.directory||'public/media',base=options.baseUrl||'https://sonder98.github.io/xbox-playlog-pages/media/';
  fs.mkdirSync(directory,{recursive:true});
  let downloaded=0,reused=0,failures=0,originalBytes=0,webpBytes=0,blocked=false;
  const deadline=Date.now()+(options.budgetMs??300_000);
  const fetchImage=options.fetchImage||(async(url:string)=>{
    const response=await fetch(url,{headers:{Accept:'image/*','User-Agent':'XboxPlaylog/1.0 (personal public artwork cache)'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(response.status===403||response.status===429){blocked=true;throw Error('图片源拒绝云端请求，停止本轮下载。');}
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('图片源未返回有效图片。');
    const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();throw Error('图片过大。');}chunks.push(value);}
    return Buffer.concat(chunks);
  });
  const jobs=new Map<string,{widths:Set<number>;apply:Array<(urls:Map<number,string>)=>void>}>();
  function add(source:string,widths:number[],apply:(urls:Map<number,string>)=>void){
    const url=imageSource(source);if(!url)return;
    const job=jobs.get(url)||{widths:new Set<number>(),apply:[]};widths.forEach(w=>job.widths.add(w));job.apply.push(apply);jobs.set(url,job);
  }
  for(const game of record.games){
    delete game.cachedImage;delete game.cachedImageLarge;
    const source=game.image3x||game.image2x||game.imageWide||game.image;
    add(source,[480,1600],urls=>{game.cachedImage=urls.get(480);game.cachedImageLarge=urls.get(1600);});
  }
  for(const game of record.games)for(const a of game.achievements||[]){delete a.cachedImage;add(a.image,[168],urls=>{a.cachedImage=urls.get(168);});}
  const tasks=[...jobs];let cursor=0;
  async function worker(){
    while(cursor<tasks.length){
      const [url,job]=tasks[cursor++],urls=new Map<number,string>();
      const missing=[...job.widths].filter(width=>{const name=imageCacheName(url,width),file=path.join(directory,name);if(fs.existsSync(file)&&fs.statSync(file).size>0){urls.set(width,base+name);reused++;return false;}return true;});
      if(missing.length&&!blocked&&Date.now()<deadline){
        try{
          const bytes=await fetchImage(url);originalBytes+=bytes.length;
          for(const width of missing){const output=await convertImage(bytes,width),name=imageCacheName(url,width),file=path.join(directory,name);fs.writeFileSync(file+'.tmp',output);fs.renameSync(file+'.tmp',file);urls.set(width,base+name);webpBytes+=output.length;}
          downloaded++;
        }catch{failures++;}
      }
      for(const apply of job.apply)apply(urls);
    }
  }
  await Promise.all(Array.from({length:8},worker));
  const covers=record.games.filter(g=>g.cachedImage).length,achievements=record.games.flatMap(g=>g.achievements||[]).filter(a=>a.cachedImage).length;
  console.log(`图片缓存：封面 ${covers}/${record.games.length}，成就 ${achievements}；下载 ${downloaded}，复用 ${reused}，失败 ${failures}；原图 ${originalBytes} 字节，WebP ${webpBytes} 字节${blocked?'；源站拒绝，已停止下载':''}`);
  return {covers,achievements,downloaded,reused,failures,originalBytes,webpBytes};
}
