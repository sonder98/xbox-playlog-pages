import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decryptVault} from '../src/crypto.ts';
import {readVault} from '../scripts/password.ts';
import {publishSnapshot} from '../scripts/snapshot.ts';
import type {RecordData} from '../src/data.ts';
test('snapshot is ciphertext, retains history, wrong password fails before replacement, password rotation retains all records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'playlog-sync-')),cwd=process.cwd();
 try{
  process.chdir(dir);mkdirSync('public');
  const password='test-password',record:RecordData={id:'1',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'PRIVATE-TEST',avatar:''},games:[{id:'123',name:'PRIVATE-GAME',image:'',image2x:undefined,devices:[],lastPlayed:null,minutes:60,earned:1,total:1,score:10,maxScore:10,achievements:[{id:'1',name:'Achievement',image:'',rarity:null,unlocked:true,unlockedAt:null}]}],source:'Exophase',warnings:[]};
  await publishSnapshot(record,[],password);
  const before=readFileSync('public/vault.json','utf8');assert.ok(!before.includes('PRIVATE-TEST'));
  await assert.rejects(readVault(JSON.parse(before),'incorrect','incorrect'));
  assert.equal(readFileSync('public/vault.json','utf8'),before);
  const previous=(await readVault(JSON.parse(before),password,password)).records;
  await publishSnapshot({...record,id:'2'},previous,'new-password');
  const encrypted=JSON.parse(readFileSync('public/vault.json','utf8'));
  assert.equal((await decryptVault(encrypted,'new-password')).records.length,2);
  await assert.rejects(decryptVault(encrypted,password));
 }finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
