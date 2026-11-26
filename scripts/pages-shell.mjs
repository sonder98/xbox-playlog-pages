// Only versioned frontend files enter the shell. Hourly deploys overlay fresh data.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tag='playlog-live';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-shell-'));
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8'});
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
 const assets=JSON.parse(run('gh',['release','view',tag,'--json','assets'])).assets
  .filter(a=>a.state.toLowerCase()==='uploaded' && /^frontend-[a-f0-9]{12}-[a-f0-9]{64}\.tar\.gz$/.test(a.name))
  .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 if(process.argv[2]==='save'){
  const archive=path.join(dir,'shell.tar.gz');
  run('tar',['--exclude=./vault.json','--exclude=./status.json','--exclude=./media','-czf',archive,'-C','dist','.']);
  const {version}=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
  if(!/^[a-f0-9]{12}$/.test(version))throw Error('Invalid frontend build ID.');
  const name='frontend-'+version+'-'+digest(archive)+'.tar.gz',file=path.join(dir,name);
  fs.renameSync(archive,file);
  run('gh',['release','upload',tag,file]);
  // Keep the previous two validated builds for interrupted uploads and rollback.
  for(const old of assets.slice(2))run('gh',['release','delete-asset',tag,old.name,'--yes']);
 }else if(process.argv[2]==='restore'){
  let restored=false;
  let version;
  try{
   const res=await fetch('https://sonder98.github.io/xbox-playlog-pages/version.json?t='+Date.now(),{signal:AbortSignal.timeout(5000)});
   if(res.ok)version=(await res.json()).version;
  }catch{}
  const current=assets.filter(a=>a.name.startsWith('frontend-'+version+'-'));
  for(const asset of current.length?current:assets){
   try{
    run('gh',['release','download',tag,'--pattern',asset.name,'--dir',dir]);
    const file=path.join(dir,asset.name);
    if(!asset.name.endsWith('-'+digest(file)+'.tar.gz'))continue;
    fs.mkdirSync('dist',{recursive:true});
    run('tar',['-xzf',file,'-C','dist']);
    restored=true;break;
   }catch{console.warn('Could not restore a validated frontend package.');}
  }
  if(!restored)throw Error('No verified frontend package available.');
 }else throw Error('Unknown frontend operation.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
