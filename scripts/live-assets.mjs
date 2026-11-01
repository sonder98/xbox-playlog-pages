// A GitHub Release stores only the already-public encrypted vault and WebP artwork.
// It replaces per-sync Git commits, so randomized ciphertext no longer bloats Git history.
// Authorization state remains in encrypted GitHub Actions cache, NEVER in this release.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const tag='playlog-live',mediaDir='public/media';
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
const available=()=>{try{run('gh',['release','view',tag]);return true;}catch{return false;}};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'playlog-assets-'));
const cleanup=dir=>fs.rmSync(dir,{recursive:true,force:true});
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
 if(!available()){console.log('Live release not created yet; keeping bundled encrypted bootstrap snapshot.');process.exit(0);}
 const dir=temp();
 try{
  if(!download('vault.json',dir)||!download('status.json',dir))throw Error('Live release is incomplete; cannot use a stale encrypted snapshot.');
  const vault=JSON.parse(fs.readFileSync(path.join(dir,'vault.json'),'utf8'));
  const status=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));
  if(vault.algorithm!=='AES-GCM'||typeof vault.ciphertext!=='string'||!status.initialized)throw Error('Invalid published encrypted snapshot');
  for(const name of ['vault.json','status.json'])fs.copyFileSync(path.join(dir,name),'public/'+name);
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
 const vault=JSON.parse(fs.readFileSync('public/vault.json','utf8'));
 if(vault.algorithm!=='AES-GCM'||typeof vault.ciphertext!=='string')throw Error('Cannot release an invalid encrypted snapshot.');
 if(!available())run('gh',['release','create',tag,'--target','main','--title','XBOX Playlog live assets','--notes','Machine-managed encrypted public snapshot and public WebP media. Never put tokens or plaintext here.','--latest=false']);
 const dir=temp();
 try{
  // The vault is encrypted on the runner before it is uploaded. No plaintext is published.
  run('gh',['release','upload',tag,'public/vault.json','public/status.json','--clobber']);
  const current=manifest(),indexFile=path.join(dir,'media-index.txt');
  let previous='';
  if(download('media-index.txt',dir))previous=fs.readFileSync(indexFile,'utf8');
  if(current!==previous&&current.trim()){
   fs.writeFileSync(indexFile,current);
   const archive=path.join(dir,'playlog-media.tar.gz');
   run('tar',['-czf',archive,'-C','public','media']);
   run('gh',['release','upload',tag,archive,indexFile,'--clobber']);
   console.log('Published durable artwork archive and integrity index.');
  }else console.log('Durable artwork archive unchanged, skipping image reupload.');
  console.log('Published encrypted snapshot without rewriting Git history.');
 }finally{cleanup(dir);}
}
