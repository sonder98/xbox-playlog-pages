// GitHub Release stores the encrypted vault and public WebP artwork only.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const tag='playlog-live',mediaDir='public/media',maxAttempts=4;
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
const errorText=error=>[error?.message,error?.stderr,error?.stdout].map(value=>value?String(value):'').join('\n');
const isNotFound=error=>/HTTP\s*404|release(?: asset)?[^\n]*not found|not found[^\n]*release|no assets? found/i.test(errorText(error));
const isTransient=error=>/HTTP\s*(408|425|429|500|502|503|504)|rate limit|secondary rate|timed? ?out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connection reset|socket hang up|TLS handshake/i.test(errorText(error));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function gh(args,{notFound=false}={}){
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  try{return run('gh',args);}
  catch(error){
   if(notFound&&isNotFound(error))return null;
   if(!isTransient(error)||attempt===maxAttempts)throw error;
   console.warn('Transient GitHub CLI failure; retry '+attempt+'/'+(maxAttempts-1)+'.');
   await pause([1000,2500,6000][Math.min(attempt-1,2)]);
  }
 }
 throw Error('GitHub CLI operation failed after retries.');
}
async function releaseAssets(){
 const output=await gh(['release','view',tag,'--json','assets'],{notFound:true});
 return output===null?null:new Set(JSON.parse(output).assets.map(asset=>asset.name));
}
export function validateSnapshot(vaultText,statusText){
 const vault=JSON.parse(vaultText),status=JSON.parse(statusText);
 if(vault.algorithm!=='AES-GCM'||typeof vault.ciphertext!=='string'||!status.initialized||!Number.isFinite(Date.parse(status.latestAt)))throw Error('Invalid encrypted snapshot pair');
 if(status.vaultSha256!==undefined&&status.vaultSha256!==createHash('sha256').update(vaultText).digest('hex'))throw Error('Snapshot checksum mismatch');
 return Date.parse(status.latestAt);
}
function pairAt(dir){
 const vault=fs.readFileSync(path.join(dir,'vault.json'),'utf8'),status=fs.readFileSync(path.join(dir,'status.json'),'utf8');
 return {vault,status,at:validateSnapshot(vault,status)};
}
export function decodePair(text){
 const bundle=JSON.parse(text);return {vault:bundle.vault,status:bundle.status,at:validateSnapshot(bundle.vault,bundle.status)};
}
export function newestPair(pairs){
 const valid=pairs.filter(Boolean).sort((a,b)=>b.at-a.at);
 if(!valid.length)throw Error('No valid encrypted snapshot; refusing rollback.');
 return valid[0];
}
function cachePair(dir){try{return pairAt(dir);}catch{return null;}}
function installPair(pair){fs.writeFileSync('public/vault.json',pair.vault);fs.writeFileSync('public/status.json',pair.status);}
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'playlog-assets-'));
const cleanup=dir=>fs.rmSync(dir,{recursive:true,force:true});
async function download(name,dir){
 const result=await gh(['release','download',tag,'--pattern',name,'--dir',dir,'--clobber'],{notFound:true});
 return result!==null&&fs.existsSync(path.join(dir,name));
}
async function releaseUpload(files){return gh(['release','upload',tag,...files,'--clobber']);}
async function pagesPair(){
 const base='https://sonder98.github.io/xbox-playlog-pages/';
 const responses=await Promise.all(['vault.json','status.json'].map(name=>fetch(base+name,{cache:'no-store',signal:AbortSignal.timeout(20000)})));
 if(responses.some(response=>!response.ok))throw Error('Published Pages encrypted backup unavailable.');
 const texts=await Promise.all(responses.map(response=>response.text()));
 return {vault:texts[0],status:texts[1],at:validateSnapshot(...texts)};
}
function manifest(){
 if(!fs.existsSync(mediaDir))return '';
 return fs.readdirSync(mediaDir).filter(name=>/^[a-f0-9]{32}-\d+\.webp$/.test(name))
  .sort().map(name=>name+' '+fs.statSync(path.join(mediaDir,name)).size).join('\n')+'\n';
}
function allPresent(index){
 if(!index.trim())return false;
 for(const line of index.trim().split('\n')){
  const split=line.lastIndexOf(' '),name=line.slice(0,split),size=Number(line.slice(split+1));
  if(!/^[a-f0-9]{32}-\d+\.webp$/.test(name)||!Number.isSafeInteger(size)||size<=0)return false;
  try{if(fs.statSync(path.join(mediaDir,name)).size!==size)return false;}catch{return false;}
 }
 return true;
}
const mode=process.argv[2];
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(!process.env.GH_TOKEN)throw Error('GH_TOKEN is required for live asset operations.');
 if(!['restore-snapshot','restore-media','publish'].includes(mode))throw Error('Unknown live-assets mode');
 if(mode==='restore-snapshot'){
  const dir=temp();
  try{
   const candidates=[cachePair('.snapshot-backup'),cachePair('.snapshot-backup-legacy')];
   let names=null,releaseLookupFailed=false,durableCount=0,assetReadFailed=false;
   try{names=await releaseAssets();}catch{releaseLookupFailed=true;console.warn('::warning::GitHub Release lookup unavailable after retries; checking independent encrypted checkpoints.');}
   if(names){
    for(const name of ['snapshot-a.json','snapshot-b.json']){
     if(!names.has(name))continue;
     try{
      if(!await download(name,dir)){console.warn('::warning::Durable checkpoint '+name+' is listed but unavailable.');assetReadFailed=true;continue;}
      try{candidates.push(decodePair(fs.readFileSync(path.join(dir,name),'utf8')));durableCount++;}
      catch{console.warn('::warning::Invalid durable checkpoint '+name);}
     }catch{assetReadFailed=true;console.warn('::warning::Durable checkpoint '+name+' could not be downloaded after retries.');}
    }
    if(names.has('vault.json')&&names.has('status.json')){
     try{
      if(await download('vault.json',dir)&&await download('status.json',dir)){
       try{candidates.push(pairAt(dir));}catch{console.warn('::warning::Invalid legacy Release pair.');}
      }else assetReadFailed=true;
     }catch{assetReadFailed=true;console.warn('::warning::Legacy Release snapshot could not be downloaded after retries.');}
    }
   }
   const independent=candidates.filter(Boolean);
   if((releaseLookupFailed||assetReadFailed)&&!independent.length)throw Error('Release is unavailable and no independent encrypted checkpoint exists; refusing a possibly stale restore.');
   if(!independent.length||!durableCount){
    try{candidates.push(await pagesPair());}catch{console.warn('::warning::Published Pages backup unavailable.');}
   }
   installPair(newestPair(candidates));
   console.log('Restored newest validated encrypted checkpoint.');
  }finally{cleanup(dir);}
 }
 if(mode==='restore-media'){
  const dir=temp();
  try{
   let names;
   try{names=await releaseAssets();}catch{console.warn('::warning::GitHub artwork Release unavailable after retries; using Actions image cache and original-image fallback.');names=null;}
   if(!names)console.log('No readable artwork Release; continuing without durable media restore.');
   else if(!names.has('media-index.txt'))console.log('No durable media index; continuing with Actions image cache.');
   else{
    let indexReady=false;
    try{indexReady=await download('media-index.txt',dir);}catch{console.warn('::warning::Artwork index download failed after retries; continuing without durable media restore.');}
    if(!indexReady)console.warn('::warning::Artwork index unavailable; continuing with original-image fallback.');
    else{
     const index=fs.readFileSync(path.join(dir,'media-index.txt'),'utf8');
     if(allPresent(index))console.log('Actions media cache matches durable artwork index.');
     else if(!names.has('playlog-media.tar.gz'))console.warn('::warning::Durable artwork archive is missing; continuing without it.');
     else{
      let archiveReady=false;
      try{archiveReady=await download('playlog-media.tar.gz',dir);}catch{console.warn('::warning::Durable artwork archive download failed after retries; continuing without it.');}
      if(archiveReady){
       try{
        fs.mkdirSync(mediaDir,{recursive:true});run('tar',['-xzf',path.join(dir,'playlog-media.tar.gz'),'-C','public']);
        if(allPresent(index))console.log('Recovered WebP artwork from durable GitHub Release archive.');
        else console.warn('::warning::Artwork archive integrity mismatch; continuing with original-image fallback.');
       }catch{console.warn('::warning::Artwork archive could not be restored; continuing with original-image fallback.');}
      }
     }
    }
   }
  }finally{cleanup(dir);}
 }
 if(mode==='publish'){
  pairAt('public');
  let names=await releaseAssets();
  if(!names){
   try{await gh(['release','create',tag,'--target','main','--title','XBOX Playlog live assets','--notes','Machine-managed encrypted public snapshot and public WebP media. Never put tokens or plaintext here.','--latest=false']);}
   catch(error){names=await releaseAssets();if(!names)throw error;}
   names=await releaseAssets();
  }
  if(!names)throw Error('GitHub Release could not be verified after creation.');
  const dir=temp();
  try{
   const slots=['snapshot-a.json','snapshot-b.json'];
   const ages=await Promise.all(slots.map(async name=>{
    if(!names.has(name))return -Infinity;
    if(!await download(name,dir))throw Error('Cannot read existing durable checkpoint.');
    try{return decodePair(fs.readFileSync(path.join(dir,name),'utf8')).at;}catch{return -Infinity;}
   }));
   const checkpoint=path.join(dir,slots[ages[0]<=ages[1]?0:1]),pair=pairAt('public');
   if(pair.at<Math.max(...ages))throw Error('Refusing to publish an older snapshot.');
   fs.writeFileSync(checkpoint,JSON.stringify({vault:pair.vault,status:pair.status}));
   await releaseUpload([checkpoint]);
   const verify=temp();
   try{
    if(!await download(path.basename(checkpoint),verify))throw Error('Checkpoint verification download failed.');
    const recovered=decodePair(fs.readFileSync(path.join(verify,path.basename(checkpoint)),'utf8'));
    if(recovered.vault!==pair.vault||recovered.status!==pair.status)throw Error('Checkpoint verification failed.');
   }finally{cleanup(verify);}
   try{await releaseUpload(['public/vault.json','public/status.json']);}catch{console.warn('::warning::Legacy Release mirror update failed; verified checkpoint remains available.');}
   const current=manifest(),indexFile=path.join(dir,'media-index.txt');
   let previous='',indexReadable=true;
   if(names.has('media-index.txt')){
    try{if(await download('media-index.txt',dir))previous=fs.readFileSync(indexFile,'utf8');else indexReadable=false;}
    catch{indexReadable=false;}
   }
   if(!indexReadable)console.warn('::warning::Could not inspect old artwork index; core encrypted snapshot is already published.');
   else if(current.trim()&&(current!==previous||!names.has('playlog-media.tar.gz'))){
    try{
     fs.writeFileSync(indexFile,current);
     const archive=path.join(dir,'playlog-media.tar.gz');run('tar',['-czf',archive,'-C','public','media']);
     await releaseUpload([archive,indexFile]);
     console.log('Published durable artwork archive and integrity index.');
    }catch{console.warn('::warning::Artwork archive publication failed; encrypted game data remains published and Pages deployment will continue.');}
   }else console.log('Durable artwork archive unchanged, skipping image reupload.');
   console.log('Published encrypted snapshot without rewriting Git history.');
  }finally{cleanup(dir);}
 }
}
