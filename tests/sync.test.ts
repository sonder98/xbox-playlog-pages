import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decryptVault} from '../src/crypto.ts';
import {readVault} from '../scripts/password.ts';
import {publishSnapshot} from '../scripts/snapshot.ts';
import {validateRecord,type RecordData} from '../src/data.ts';
test('snapshot is ciphertext, retains history, wrong password fails before replacement, password rotation retains all records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'playlog-sync-')),cwd=process.cwd();
 try{
  process.chdir(dir);mkdirSync('public');
  const password='test-password',record:RecordData={id:'1',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'PRIVATE-TEST',avatar:''},games:[{id:'123',name:'PRIVATE-GAME',image:'',image2x:undefined,devices:[],lastPlayed:null,minutes:60,earned:1,total:1,score:10,maxScore:10,achievements:[{id:'1',name:'Achievement',image:'',rarity:null,unlocked:true,unlockedAt:null}]}],source:'Exophase',warnings:[]};
  await publishSnapshot({...record,syncMechanism:'cloudflare'},[],password);
  const before=readFileSync('public/vault.json','utf8');assert.ok(!before.includes('PRIVATE-TEST'));
  const publicStatus=JSON.parse(readFileSync('public/status.json','utf8'));
  assert.deepEqual(publicStatus,{initialized:true,latestAt:record.at});
  assert.ok(!JSON.stringify(publicStatus).includes('PRIVATE-TEST'));
  await assert.rejects(readVault(JSON.parse(before),'incorrect','incorrect'));
  assert.equal(readFileSync('public/vault.json','utf8'),before);
  const previous=(await readVault(JSON.parse(before),password,password)).records;
   assert.equal(previous[0].syncMechanism,'cloudflare','Provenance must be preserved by encrypted snapshot round trips');
  // Reuse is an explicitly attributed new automatic event, not a fabricated
  // new Microsoft scan. The original manual record remains intact in history.
  const reused={...record,id:'auto-tick',at:new Date(Date.parse(record.at)+120000).toISOString(),
   source:'Xbox',syncMechanism:'cloudflare' as const,syncReusedFromAt:record.at};
  await publishSnapshot(reused,previous,'new-password');
  const encrypted=JSON.parse(readFileSync('public/vault.json','utf8'));
  const decrypted=await decryptVault(encrypted,'new-password');
  assert.equal(decrypted.records.length,2);
  assert.equal(decrypted.records[0].syncReusedFromAt,record.at);
  assert.equal(decrypted.records[1].syncMechanism,'cloudflare');
  assert.equal(validateRecord(decrypted.records[0]).syncReusedFromAt,record.at);
  await assert.rejects(decryptVault(encrypted,password));
 }finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
