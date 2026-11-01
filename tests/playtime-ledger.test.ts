import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendPlaytimeSamples,boundaryPlaytimeSweep,emptyPlaytimeLedger,shanghaiDate,PLAYTIME_SINCE} from '../src/playtime-ledger.ts';
import {compactPayload,expandPayload} from '../src/record-payload.ts';

const first='2026-11-01T11:03:00.000Z'; // 19:03 Beijing time
const next='2026-11-01T11:33:00.000Z';
test('Beijing calendar date starts on November 1 2026 and daylight UTC offsets do not shift it',()=>{
 assert.equal(PLAYTIME_SINCE,'2026-11-01');
 assert.equal(shanghaiDate('2026-10-31T16:00:00Z'),'2026-11-01');
 assert.equal(shanghaiDate('2026-11-01T15:59:59Z'),'2026-11-01');
 assert.equal(shanghaiDate('2026-11-01T16:00:00Z'),'2026-11-02');
 assert.equal(boundaryPlaytimeSweep('2026-11-01T15:42:00Z'),true);
 assert.equal(boundaryPlaytimeSweep('2026-11-01T16:02:00Z'),true);
 assert.equal(boundaryPlaytimeSweep('2026-11-01T16:17:00Z'),false);
 assert.equal(boundaryPlaytimeSweep('2026-11-01T15:17:00Z'),false);
});
test('one game can gain minutes on a day without losing per-game identity',()=>{
 const a=appendPlaytimeSamples(undefined,[{id:'10',minutes:123,at:first},{id:'11',minutes:500,at:first}]);
 assert.deepEqual(a.days['2026-11-01'],{});
 const b=appendPlaytimeSamples(a,[{id:'10',minutes:141,at:next},{id:'11',minutes:505,at:next}]);
 assert.equal(b.days['2026-11-01']['10'],18);
 assert.equal(b.days['2026-11-01']['11'],5);
 assert.equal(b.latest['10'].minutes,141);
 assert.equal(b.timeZone,'Asia/Shanghai');
});
test('cross-midnight gains remain separately unallocated, never attributed to the next day',()=>{
 let a=appendPlaytimeSamples(undefined,[{id:'10',minutes:400,at:'2026-11-01T15:51:00Z'}]);
 a=appendPlaytimeSamples(a,[{id:'10',minutes:435,at:'2026-11-01T16:13:00Z'}]);
 assert.equal(a.days['2026-11-02']['10'],undefined);
 assert.equal(a.crossDay['2026-11-01..2026-11-02']['10'],35);
 a=appendPlaytimeSamples(a,[{id:'10',minutes:441,at:'2026-11-01T16:50:00Z'}]);
 assert.equal(a.days['2026-11-02']['10'],6);
});
test('duplicate replay, stale time, zero, corrections, unmeasured values do not fabricate playtime',()=>{
 const zero=appendPlaytimeSamples(undefined,[{id:'20',minutes:0,at:first}]);
 const a=appendPlaytimeSamples(zero,[
  {id:'20',minutes:0,at:next},
  {id:'20',minutes:-1,at:next},
  {id:'20',minutes:99,at:first}
 ]);
 assert.equal(a.latest['20'].minutes,0);
 assert.deepEqual(a.days['2026-11-01'],{});
 const b=appendPlaytimeSamples(a,[{id:'20',minutes:88,at:'2026-11-01T12:00:00Z'}]);
 const c=appendPlaytimeSamples(b,[{id:'20',minutes:1,at:'2026-11-01T12:30:00Z'}]);
 assert.equal(c.corrections['2026-11-01|20'],1);
 assert.equal(c.days['2026-11-01']['20'],88);
 assert.equal(emptyPlaytimeLedger().version,1);
});
test('old vault snapshots remain compatible, while entire daily ledger survives compaction',()=>{
 const value={records:[{id:'a',games:[{id:'10',minutes:200,achievements:[{id:'ach'}]}]}],
  playtimeLedger:appendPlaytimeSamples(undefined,[{id:'10',minutes:100,at:first},{id:'10',minutes:120,at:next}])};
 assert.deepEqual(expandPayload(compactPayload(value)),value);
 assert.throws(()=>appendPlaytimeSamples({version:8},[]),/账本格式无效/);
 assert.deepEqual(expandPayload(compactPayload({records:[]})),{records:[]});
});
