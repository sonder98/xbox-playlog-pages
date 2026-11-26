import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactPayloadV2,expandPayloadV2} from '../src/record-payload-v2.ts';
import {compactPayload} from '../src/record-payload.ts';
import {encryptVault,decryptVault,isVaultEnvelope} from '../src/crypto.ts';
import {updateCapacity,capacityWarning} from '../scripts/vault-capacity.ts';
import {syncHealth} from '../scripts/sync-health.ts';

const password='fixture-password-only';
const makeGame=(id:string,n:number)=>({id,name:'Game '+id,minutes:n,total:100,earned:n,
 achievements:Array.from({length:100},(_,i)=>({id:String(i),name:'Achievement '+i,description:'Long repeated descriptive text for each goal '+i,image:'https://fixture.test/image/'+i,points:10,rarity:i===0?n/10:2,unlocked:i<n,unlockedAt:i<n?'2026-11-01T00:00:00Z':null,...(i===99?{progressPercent:n}:{})})),
 groups:[{id:'base',achievementIds:Array.from({length:100},(_,i)=>String(i)),earned:n,total:100}],posterScreenshots:['https://fixture.test/poster'],cachedPosterScreenshotsSmall:['small','']});
const payload={records:Array.from({length:30},(_,i)=>({id:'record-'+i,at:new Date(Date.UTC(2026,10,26,23-i)).toISOString(),profile:{gamertag:'PRIVATE-FIXTURE'},games:[makeGame('1',30-i),makeGame('2',1)]})),playtimeLedger:{days:{'2026-11-01':{'1':20}},latest:{'1':{minutes:30}},corrections:{}},metacriticScores:{'1':90}};
test('v2 retains exact histories and stores unchanged game/achievement metadata only once',()=>{
 const packed=compactPayloadV2(payload);
 assert.equal(packed.achievementStatic.length,100);
 assert.equal(packed.records[1].games.changes.length,1);
 assert.equal(packed.records[1].games.order,undefined);
 assert.ok(packed.records[1].games.changes[0][1].awards);
 assert.deepEqual(expandPayloadV2(packed),payload);
 assert.ok(JSON.stringify(packed).length<JSON.stringify(compactPayload(payload)).length*.5);
});
test('reverse deltas preserve additions, removals, reorderings, absent fields and achievement list changes',()=>{
 const sample=structuredClone(payload);
 sample.records[1].games.reverse();
 sample.records[2].games.pop();
 sample.records[3].games.push(makeGame('3',2));
 sample.records[4].games[0].achievements.splice(1,2);
 delete (sample.records[5].games[0] as any).posterScreenshots;
 sample.records[6].games[0].achievements.reverse();
 assert.deepEqual(expandPayloadV2(compactPayloadV2(sample)),sample);
 const empty={records:[{games:[]},{games:[makeGame('x',1)]},{games:[]}]};
 assert.deepEqual(expandPayloadV2(compactPayloadV2(empty)),empty);
});
test('invalid references, broken order, and malformed delta fail closed',()=>{
 const packed=compactPayloadV2(payload);
 packed.records[0].games.changes[0][1].full.achievements[0]=[999999,0];
 assert.throws(()=>expandPayloadV2(packed),/索引/);
 const bad=compactPayloadV2(payload);bad.records[1].games.order=['1','1'];assert.throws(()=>expandPayloadV2(bad),/索引/);
 const broken=compactPayloadV2(payload);broken.records[1].games.changes[0][1].awards.length=100001;assert.throws(()=>expandPayloadV2(broken),/索引/);
});
test('old and new envelopes decrypt, gzip is lossless, and format is authenticated',async()=>{
 const old=await encryptVault(payload,password,1),next=await encryptVault(payload,password,2);
 assert.equal(next.version,2);assert.ok(isVaultEnvelope(old)&&isVaultEnvelope(next));
 assert.deepEqual(await decryptVault(old,password),payload);
 assert.deepEqual(await decryptVault(next,password),payload);
 assert.ok(next.ciphertext.length<old.ciphertext.length*.2);
 await assert.rejects(decryptVault({...next,version:1},password));
 await assert.rejects(decryptVault({...next,compression:'invalid'},password));
 await assert.rejects(decryptVault(next,'wrong-password'));
});
test('capacity history keeps one daily observation and warns at 75% without exposing private records',()=>{
 let capacity=updateCapacity(undefined,'2026-11-25T02:00:00Z',26_000_000,1,120_000_000,26_000_000);
 capacity=updateCapacity(capacity,'2026-11-26T02:00:00Z',3_000_000,2,120_000_000,26_000_000);
 capacity=updateCapacity(capacity,'2026-11-26T03:00:00Z',4_000_000,2,120_000_000,27_000_000);
 assert.deepEqual(capacity.daily.map(s=>s.bytes),[26_000_000,4_000_000]);
 assert.equal(capacityWarning({capacity}),false);
 capacity=updateCapacity(capacity,'2027-03-01T02:00:00Z',90_000_000,2,120_000_000,150_000_000);
 assert.equal(capacity.daily.length,1);assert.equal(capacityWarning({capacity}),true);
 assert.equal(syncHealth({initialized:true,latestAt:'2027-03-01T02:00:00Z',capacity},Date.parse('2027-03-01T02:10:00Z')).capacityWarning,true);
});
