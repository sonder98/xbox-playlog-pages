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
async function recoverMissingVaultFromPages(){
 const base='https://sonder98.github.io/xbox-playlog-pages/';
 const responses=await Promise.all(['vault.json','status.json'].map(name=>fetch(base+name,{cache:'no-store'})));
 if(responses.some(r=>!r.ok))throw Error('Live Release incomplete and Pages encrypted backup unavailable.');
 const texts=await Promise.all(responses.map(r=>r.text()));
 const pages={vault:texts[0],status:texts[1],at:validateSnapshot(...texts)};
 const cached=cachePair();
 installPair(cached&&cached.at>=pages.at?cached:pages);
 console.warn('RECOVERY: used previously deployed encrypted Pages archive because live Release lost an asset. Current Microsoft data will be rescanned before publication.');
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
if(!process.env.GH_TOKEN)throw Error('GH_TOKEN is required for live asset operations.');
if(!['restore-snapshot','restore-media','publish'].includes(mode))throw Error('Unknown live-assets mode');
if(mode==='restore-snapshot'){
 if(!available())throw Error('Live release missing; refusing bootstrap rollback.');
 const dir=temp();
 try{
  const names=new Set(JSON.parse(run('gh',['release','view',tag,'--json','assets'])).assets.map(a=>a.name));
  if(!names.has('vault.json')||!names.has('status.json')){
   const cached=cachePair();
   if(cached)installPair(cached);else await recoverMissingVaultFromPages();
   process.exit(0);
  }
  if(!download('vault.json',dir)||!download('status.json',dir))
   throw Error('Live release assets exist but cannot be downloaded; do not substitute older data for a transient error.');
  const remote=pairAt(dir),cached=cachePair();
  installPair(cached&&cached.at>remote.at?cached:remote);
  console.log('Restored current encrypted snapshot from GitHub Release.');
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
