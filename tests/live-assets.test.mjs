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
const a=process.argv.slice(2),root=process.env.MOCK_RELEASE,fail=process.env.MOCK_FAIL;
const die=()=>{console.error('HTTP 500: fixture failure');process.exit(1);};
if(a[0]!=='release')die();
if(a[1]==='view'){
 if(fail==='view')die();
 if(a.includes('--json'))console.log(JSON.stringify({assets:fs.readdirSync(root).map(name=>({name}))}));
}else if(a[1]==='download'){
 const name=a[a.indexOf('--pattern')+1],dir=a[a.indexOf('--dir')+1];
 if(!fs.existsSync(path.join(root,name)))process.exit(1);
 fs.copyFileSync(path.join(root,name),path.join(dir,name));
}else if(a[1]==='upload'){
 for(const file of a.slice(3).filter(s=>s!=='--clobber')){
  const name=path.basename(file),dest=path.join(root,name);
  if(fail===name){fs.rmSync(dest,{force:true});die();}
  fs.copyFileSync(file,dest);
 }
}else die();
`,{mode:0o755});
 const preload=join(root,'offline.mjs');
 fs.writeFileSync(preload,"globalThis.fetch=async()=>{throw Error('offline fixture')};const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,1),...args);");
 const run=(mode,fail='')=>spawnSync(process.execPath,['--import',preload,fileURLToPath(new URL('../scripts/live-assets.mjs',import.meta.url)),mode],{cwd:root,env:{...process.env,PATH:bin+delimiter+process.env.PATH,GH_TOKEN:'fixture-only',MOCK_RELEASE:release,MOCK_FAIL:fail},encoding:'utf8',timeout:15000});
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
  assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(join(m.publicDir,'vault.json'),'utf8'),older.vault);
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
