import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactPayload,expandPayload} from '../src/record-payload.ts';
import {encryptVault,decryptVault} from '../src/crypto.ts';
const detail={achievements:[{id:'1',name:'A long formal achievement title',description:'A descriptive goal repeated in unchanged daily snapshots.',unlocked:true,unlockedAt:'2026-10-30T00:00:00Z'}],groups:[{id:'base',kind:'base',achievementIds:['1'],earned:1,total:1}],groupStatus:'verified',catalogAt:'2026-10-30T00:00:00Z'};
const payload={records:Array.from({length:30},(_,n)=>({id:String(n),at:'2026-10-30T00:00:00Z',games:[{id:'1',name:'Game',minutes:n,...detail}]}))};
test('unchanged achievement details are stored once while all history and playtimes remain',()=>{
 const compact=compactPayload(payload);
 assert.equal(compact.detailTable.length,1);
 assert.equal(compact.records.length,30);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(payload).length*.5);
 assert.deepEqual(expandPayload(compact),payload);
 assert.ok(payload.records[0].games[0].achievements,'input remains untouched');
});
test('changed unlock progress creates a separate detail entry and older vaults need no migration',()=>{
 const changed=structuredClone(payload);changed.records[0].games[0].achievements=[{...changed.records[0].games[0].achievements[0],unlocked:false}];
 const compact=compactPayload(changed);assert.equal(compact.detailTable.length,2);assert.deepEqual(expandPayload(compact),changed);assert.equal(expandPayload(payload),payload);
});
test('missing metadata references fail explicitly',()=>{const compact=compactPayload(payload);compact.records[0].games[0].detailRef=99;assert.throws(()=>expandPayload(compact),/索引缺失/);});
test('encrypted roundtrip transparently expands compact snapshots for exports',async()=>{assert.deepEqual(await decryptVault(await encryptVault(payload,'test-password'),'test-password'),payload);});
