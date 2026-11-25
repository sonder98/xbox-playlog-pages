// A GitHub Release stores only the already-public encrypted vault and WebP artwork.
// It replaces per-sync Git commits, so randomized ciphertext no longer bloats Git history.
// Authorization state remains in encrypted GitHub Actions cache, NEVER in this release.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const tag='playlog-live',mediaDir='public/media';
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
const available=()=>{try{run('gh',['release','view',tag]);return true;}catch(error){if(/release not found/i.test(String(error.stderr||'')))return false;throw error;}};
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
 const bundle=JSON.parse(text);
 return {vault:bundle.vault,status:bundle.status,at:validateSnapshot(bundle.vault,bundle.status)};
}
export function newestPair(pairs){
 const valid=pairs.filter(Boolean).sort((a,b)=>b.at-a.at);
 if(!valid.length)throw Error('No valid encrypted snapshot; refusing rollback.');
 return valid[0];
}
function cachePair(){
 try{return pairAt('.snapshot-backup');}catch{return null;}
}
function installPair(pair){
 fs.writeFileSync('public/vault.json',pair.vault);
 fs.writeFileSync('public/status.json',pair.status);
}

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'playlog-assets-'));
const cleanup=dir=>fs.rmSync(dir,{recursive:true,force:true});
// Releases can return HTTP 5xx while replacing an existing asset. Retry
// without touching the previous encrypted snapshot on disk.
async function releaseUpload(files){
 for(let attempt=1;attempt<=4;attempt++){
  try{return run('gh',['release','upload',tag,...files,'--clobber']);}
  catch(error){
   if(attempt===4)throw error;
   console.warn('Transient GitHub Release upload failure; retry '+attempt+'/3');
   await new Promise(resolve=>setTimeout(resolve,attempt*3500));
  }
 }
}
// The already-deployed Pages copy is a last-resort encrypted backup. This is
// recovery only for a genuinely missing Release asset (not a network timeout).
async function pagesPair(){
 const base='https://sonder98.github.io/xbox-playlog-pages/';
 const responses=await Promise.all(['vault.json','status.json'].map(name=>fetch(base+name,{cache:'no-store'})));
 if(responses.some(r=>!r.ok))throw Error('Live Release incomplete and Pages encrypted backup unavailable.');
 const texts=await Promise.all(responses.map(r=>r.text()));
 const pages={vault:texts[0],status:texts[1],at:validateSnapshot(...texts)};
 return pages;
}
function download(name,dir){
 try{run('gh',['release','download',tag,'--pattern',name,'--dir',dir,'--clobber']);return fs.existsSync(path.join(dir,name));}
 catch{return false;}
}
function manifest(){
 if(!fs.existsSync(mediaDir))return '';
 return fs.readdirSync(mediaDir).filter(n=>/^[a-f0-9]{32}-\d+\.webp$/.test(n))
  .sort().map(n=>n+' '+fs.statSync(path.join(mediaDir,n)).size).join('\n')+'\n';
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
if(import.meta.url===new URL(process.argv[1]||'','file:'+process.cwd()+'/').href){
if(!process.env.GH_TOKEN)throw Error('GH_TOKEN is required for live asset operations.');
if(!['restore-snapshot','restore-media','publish'].includes(mode))throw Error('Unknown live-assets mode');
if(mode==='restore-snapshot'){
 const dir=temp();
 try{
  const names=available()?new Set(JSON.parse(run('gh',['release','view',tag,'--json','assets'])).assets.map(a=>a.name)):new Set();
  const candidates=[cachePair()];
  for(const name of ['snapshot-a.json','snapshot-b.json']){
   if(!names.has(name))continue;
   if(!download(name,dir))throw Error('Cannot read existing durable checkpoint.');
   try{candidates.push(decodePair(fs.readFileSync(path.join(dir,name),'utf8')));}catch{console.warn('::warning::Invalid durable checkpoint '+name);}
  }
  if(names.has('vault.json')&&names.has('status.json')){
   if(!download('vault.json',dir)||!download('status.json',dir))throw Error('Cannot read existing Release snapshot.');
   try{candidates.push(pairAt(dir));}catch{console.warn('::warning::Invalid legacy Release pair.');}
  }
  // Pages can be newer than a restored cache. Compare it during recovery only.
  if(!candidates.some(Boolean)||!names.has('vault.json')||!names.has('status.json')){
   try{candidates.push(await pagesPair());}catch{console.warn('::warning::Published Pages backup unavailable.');}
  }
  installPair(newestPair(candidates));
  console.log('Restored newest validated encrypted checkpoint.');
 }finally{cleanup(dir);}
}
if(mode==='restore-media'){
 if(!available()){console.log('Live artwork release not created yet; using Actions image cache.');process.exit(0);}
 const dir=temp();
 try{
  if(!download('media-index.txt',dir)){console.log('No durable media index yet; using Actions image cache.');process.exit(0);}
  const index=fs.readFileSync(path.join(dir,'media-index.txt'),'utf8');
  if(allPresent(index)){console.log('Actions media cache matches durable artwork index.');process.exit(0);}
  if(!download('playlog-media.tar.gz',dir))throw Error('Durable media archive missing, cannot rebuild artwork cache.');
  fs.mkdirSync(mediaDir,{recursive:true});
  run('tar',['-xzf',path.join(dir,'playlog-media.tar.gz'),'-C','public']);
  if(!allPresent(index))throw Error('Durable artwork archive failed integrity verification.');
  console.log('Recovered WebP artwork from durable GitHub Release archive.');
 }finally{cleanup(dir);}
}
if(mode==='publish'){
 pairAt('public');
 if(!available())run('gh',['release','create',tag,'--target','main','--title','XBOX Playlog live assets','--notes','Machine-managed encrypted public snapshot and public WebP media. Never put tokens or plaintext here.','--latest=false']);
 const dir=temp();
 try{
  // The vault is encrypted on the runner before it is uploaded. No plaintext is published.
  // Upload a complete, self-contained checkpoint before replacing legacy assets.
  // Alternate slots based on the actual remote checkpoint timestamps, not clock parity.
  const names=new Set(JSON.parse(run('gh',['release','view',tag,'--json','assets'])).assets.map(a=>a.name));
  const slots=['snapshot-a.json','snapshot-b.json'];
  const ages=slots.map(name=>{
   if(!names.has(name))return -Infinity;
   if(!download(name,dir))throw Error('Cannot inspect existing checkpoint before publish.');
   try{return decodePair(fs.readFileSync(path.join(dir,name),'utf8')).at;}catch{return -Infinity;}
  });
  const checkpoint=path.join(dir,slots[ages[0]<=ages[1]?0:1]);
  const pair=pairAt('public');
  if(pair.at<Math.max(...ages))throw Error('Refusing to publish an older snapshot.');
  fs.writeFileSync(checkpoint,JSON.stringify({vault:pair.vault,status:pair.status}));
  await releaseUpload([checkpoint]);
  const verify=temp();
  try{
   if(!download(path.basename(checkpoint),verify))throw Error('Checkpoint verification download failed.');
   const recovered=decodePair(fs.readFileSync(path.join(verify,path.basename(checkpoint)),'utf8'));
   if(recovered.vault!==pair.vault||recovered.status!==pair.status)throw Error('Checkpoint verification failed.');
  }finally{cleanup(verify);}
  await releaseUpload(['public/vault.json','public/status.json']);
  const current=manifest(),indexFile=path.join(dir,'media-index.txt');
  let previous='';
  if(download('media-index.txt',dir))previous=fs.readFileSync(indexFile,'utf8');
  if(current!==previous&&current.trim()){
   fs.writeFileSync(indexFile,current);
   const archive=path.join(dir,'playlog-media.tar.gz');
   run('tar',['-czf',archive,'-C','public','media']);
   await releaseUpload([archive,indexFile]);
   console.log('Published durable artwork archive and integrity index.');
  }else console.log('Durable artwork archive unchanged, skipping image reupload.');
  console.log('Published encrypted snapshot without rewriting Git history.');
 }finally{cleanup(dir);}
}
}
