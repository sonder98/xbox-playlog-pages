import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateSnapshot,decodePair,newestPair} from '../scripts/live-assets.mjs';

const pair=(at,ciphertext='test-only')=>{
 const vault=JSON.stringify({algorithm:'AES-GCM',ciphertext});
 const status=JSON.stringify({initialized:true,latestAt:at,vaultSha256:createHash('sha256').update(vault).digest('hex')});
 return {vault,status,at:Date.parse(at)};
};
const older=pair('2026-11-25T14:00:00Z'),newer=pair('2026-11-25T15:00:00Z','new');
test('legacy and checksummed snapshots restore without date dependence',()=>{
 assert.equal(validateSnapshot(older.vault,older.status),older.at);
 assert.equal(validateSnapshot(older.vault,JSON.stringify({initialized:true,latestAt:'2026-11-25T14:00:00Z'})),older.at);
});
test('inconsistent status and ciphertext cannot be used as a checkpoint',()=>{
 assert.throws(()=>validateSnapshot(older.vault,newer.status),/checksum/);
 assert.throws(()=>decodePair(JSON.stringify({vault:newer.vault,status:older.status})),/checksum/);
 assert.throws(()=>validateSnapshot(older.vault,JSON.stringify({initialized:true,latestAt:'bad'})),/Invalid/);
});
test('newest valid backup wins regardless of source, absent sources fail closed',()=>{
 assert.deepEqual(newestPair([older,null,newer]),newer);
 assert.deepEqual(newestPair([newer,older]),newer);
 assert.throws(()=>newestPair([null,undefined]),/refusing rollback/);
});
test('an interrupted replacement can use the surviving complete slot',()=>{
 const backup=decodePair(JSON.stringify(newer));
 let damaged=null;
 try{damaged=decodePair(JSON.stringify({vault:older.vault,status:newer.status}));}catch{}
 assert.deepEqual(newestPair([damaged,backup,older]),newer);
});

/** Exercise the actual CLI with a disposable fake Release; no network or credentials. */
function mockRelease(){
 const root=fs.mkdtempSync(join(tmpdir(),'playlog-release-test-'));
 const release=join(root,'release'),bin=join(root,'bin'),publicDir=join(root,'public');
 for(const dir of [release,bin,publicDir])fs.mkdirSync(dir);
 const gh=join(bin,'gh');
 fs.writeFileSync(gh,`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const a=process.argv.slice(2),root=process.env.MOCK_RELEASE,fail=process.env.MOCK_FAIL,transient=process.env.MOCK_TRANSIENT;
const bump=key=>{const file=path.join(root,'.calls-'+key.replace(/[^a-z0-9]/gi,'_'));const n=Number(fs.existsSync(file)?fs.readFileSync(file,'utf8'):0)+1;fs.writeFileSync(file,String(n));return n;};
const intermittent=key=>transient===key&&bump(key)<=2;
const die=()=>{console.error('HTTP 500: fixture failure');process.exit(1);};
if(a[0]!=='release')die();
if(a[1]==='view'){
 if(fail==='view'||intermittent('view'))die();
 if(a.includes('--json'))console.log(JSON.stringify({assets:fs.readdirSync(root).map(name=>({name,state:'uploaded',createdAt:'2026-11-25T00:00:00Z'}))}));
}else if(a[1]==='download'){
 const name=a[a.indexOf('--pattern')+1],dir=a[a.indexOf('--dir')+1];
 if(intermittent('download:'+name))die();
 if(!fs.existsSync(path.join(root,name))){console.error('HTTP 404: release asset not found');process.exit(1);}
 fs.copyFileSync(path.join(root,name),path.join(dir,name));
}else if(a[1]==='upload'){
 for(const file of a.slice(3).filter(s=>s!=='--clobber')){
  const name=path.basename(file),dest=path.join(root,name);
  if(fail===name||intermittent('upload:'+name)){if(fail===name)fs.rmSync(dest,{force:true});die();}
  fs.copyFileSync(file,dest);
 }
}else die();
`,{mode:0o755});
 const preload=join(root,'offline.mjs');
 fs.writeFileSync(preload,"globalThis.fetch=async()=>{throw Error('offline fixture')};const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,1),...args);");
 const run=(mode,fail='',transient='',script='live-assets')=>spawnSync(process.execPath,['--import',preload,fileURLToPath(new URL('../scripts/'+script+'.mjs',import.meta.url)),mode],{cwd:root,env:{...process.env,PATH:bin+delimiter+process.env.PATH,GH_TOKEN:'fixture-only',MOCK_RELEASE:release,MOCK_FAIL:fail,MOCK_TRANSIENT:transient},encoding:'utf8',timeout:15000});
 const writePair=(dir,p)=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(join(dir,'vault.json'),p.vault);fs.writeFileSync(join(dir,'status.json'),p.status);};
 const slot=(name,p)=>fs.writeFileSync(join(release,name),JSON.stringify({vault:p.vault,status:p.status}));
 return {root,release,publicDir,run,writePair,slot,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('transient Release lookup failure leaves the local snapshot untouched', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.writePair(m.publicDir,older);
  m.writePair(join(m.root,'.snapshot-backup'),newer);
  const result=m.run('restore-snapshot','view');
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});
test('restore prefers the newest valid independent cache or durable slot; damaged slot is ignored', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.slot('snapshot-a.json',older);
  fs.writeFileSync(join(m.release,'snapshot-b.json'),'not a checkpoint');
  m.writePair(join(m.root,'.snapshot-backup-legacy'),newer);
  const result=m.run('restore-snapshot');
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});
test('a failed replacement cannot erase the newest durable checkpoint', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.slot('snapshot-a.json',older);m.slot('snapshot-b.json',newer);
  const next=pair('2026-11-25T16:00:00Z','next');
  m.writePair(m.publicDir,next);
  assert.notEqual(m.run('publish','snapshot-a.json').status,0);
  assert.equal(decodePair(fs.readFileSync(join(m.release,'snapshot-b.json'),'utf8')).vault,newer.vault);
  const recovered=m.run('restore-snapshot');
  assert.equal(recovered.status,0,recovered.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});
test('failed legacy mirror does not block publication or recovery of a verified checkpoint', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.writePair(m.release,older);m.writePair(m.publicDir,newer);
  const result=m.run('publish','vault.json');
  assert.equal(result.status,0,result.stderr);
  assert.equal(decodePair(fs.readFileSync(join(m.release,'snapshot-a.json'),'utf8')).vault,newer.vault);
  const recovered=m.run('restore-snapshot');
  assert.equal(recovered.status,0,recovered.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});

test('transient Release lookup failure is retried and latest independent checkpoint is restored', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.slot('snapshot-a.json',newer);m.writePair(join(m.root,'.snapshot-backup'),older);
  const result=m.run('restore-snapshot','','view');
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});
test('transient checkpoint download failure is retried before restore', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.slot('snapshot-a.json',newer);m.writePair(join(m.root,'.snapshot-backup'),older);
  const result=m.run('restore-snapshot','','download:snapshot-a.json');
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),newer.vault);
 }finally{m.close();}
});
test('missing media archive does not block the Xbox data recovery workflow', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  fs.writeFileSync(join(m.release,'media-index.txt'),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-480.webp 1\n');
  const result=m.run('restore-media');
  assert.equal(result.status,0,result.stderr);
 }finally{m.close();}
});
test('artwork archive upload failure does not fail a verified encrypted snapshot publication', {skip:process.platform==='win32'},()=>{
 const m=mockRelease();
 try{
  m.writePair(m.publicDir,newer);
  const media=join(m.publicDir,'media');fs.mkdirSync(media);fs.writeFileSync(join(media,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-480.webp'),'x');
  const result=m.run('publish','playlog-media.tar.gz');
  assert.equal(result.status,0,result.stderr);
  const slot=['snapshot-a.json','snapshot-b.json'].find(name=>fs.existsSync(join(m.release,name)));
  assert.ok(slot,'encrypted checkpoint is published even if artwork archive upload fails');
  assert.equal(decodePair(fs.readFileSync(join(m.release,slot),'utf8')).vault,newer.vault);
 }finally{m.close();}
});
test('an incomplete artwork cache cannot overwrite archived media or block a verified snapshot',()=>{
 const m=mockRelease();
 try{
  const name='a'.repeat(32)+'-480.webp';
  fs.writeFileSync(join(m.release,'media-index.txt'),name+' 100\n');
  fs.writeFileSync(join(m.release,'playlog-media.tar.gz'),'previous archive');
  m.writePair(m.publicDir,newer);
  assert.equal(m.run('publish').status,0);
  assert.notEqual(m.run('publish-media').status,0);
  assert.equal(fs.readFileSync(join(m.release,'playlog-media.tar.gz'),'utf8'),'previous archive');
  assert.equal(decodePair(fs.readFileSync(join(m.release,'snapshot-a.json'),'utf8')).at,newer.at);
 }finally{m.close();}
});

test('hourly Pages assembly reuses frontend bytes without running tests or bundling stale records',()=>{
 const m=mockRelease();
 try{
  const dist=join(m.root,'dist');
  fs.mkdirSync(join(dist,'media'),{recursive:true});
  fs.writeFileSync(join(dist,'version.json'),'{"version":"aaaaaaaaaaaa"}');
  fs.writeFileSync(join(dist,'index.html'),'verified frontend');
  fs.writeFileSync(join(dist,'media','old.webp'),'old');
  m.writePair(dist,older);
  const save=m.run('save','','','pages-shell');
  assert.equal(save.status,0,save.stderr);
  fs.rmSync(dist,{recursive:true});
  const restore=m.run('restore','','','pages-shell');
  assert.equal(restore.status,0,restore.stderr);
  assert.equal(fs.readFileSync(join(dist,'index.html'),'utf8'),'verified frontend');
  for(const name of ['media','vault.json','status.json'])assert.equal(fs.existsSync(join(dist,name)),false);
 }finally{m.close();}
});
