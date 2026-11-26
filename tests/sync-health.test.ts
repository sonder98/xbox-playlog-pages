import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundarySlot,updateBoundaryCoverage,syncHealth} from '../scripts/sync-health.ts';
test('boundary tracking records actual scan windows, not a late queued invocation',()=>{
 assert.equal(boundarySlot('2026-11-25T15:50:00Z'),'2026-11-25T15:42:00.000Z');
 assert.equal(boundarySlot('2026-11-25T16:10:00Z'),'2026-11-25T16:02:00.000Z');
 assert.equal(boundarySlot('2026-11-25T16:20:00Z'),null);
 const first=updateBoundaryCoverage(undefined,'2026-11-25T14:00:00Z',false);
 const both=updateBoundaryCoverage(updateBoundaryCoverage(first,'2026-11-25T15:50:00Z',true),'2026-11-25T16:10:00Z',true);
 assert.equal(both.observed.length,2);
 const now=Date.parse('2026-11-25T18:00:00Z');
 assert.deepEqual(syncHealth({initialized:true,latestAt:'2026-11-25T17:45:00Z',boundaryCoverage:both},now).missing,[]);
 assert.equal(syncHealth({initialized:true,latestAt:'2026-11-25T17:45:00Z',boundaryCoverage:first},now).missing.length,2);
});
test('monitor thresholds are deterministic and legacy markers remain supported',()=>{
 const status={initialized:true,latestAt:'2026-11-25T12:00:00Z'};
 for(const [minutes,level] of [[89,'healthy'],[90,'warning'],[180,'error'],[360,'critical']] as const)
  assert.equal(syncHealth(status,Date.parse(status.latestAt)+minutes*60_000).level,level);
 assert.equal(syncHealth(null).level,'critical');
});

test('partial scan quality is visible to the independent health monitor',()=>{
 const status={initialized:true,latestAt:'2026-11-25T17:50:00Z',syncQuality:{titles:155,existingAttempted:155,existingFailed:2,newFailed:0,failed:2,historySourcesFailed:0,fullRefresh:false}};
 const health=syncHealth(status,Date.parse(status.latestAt)+5*60_000);
 assert.equal(health.level,'warning');assert.equal(health.partialSyncWarning,true);
 assert.match(health.message,/2 game failures/);
});
