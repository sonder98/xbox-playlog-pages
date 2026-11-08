import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedSnapshotNewer,cachedSnapshotNeedsFullCheck} from '../src/snapshot-freshness.ts';

test('a tiny public marker avoids an expensive vault download until the record time advances',()=>{
 const known='2026-11-07T07:18:00.000Z';
 assert.equal(publishedSnapshotNewer({initialized:true,latestAt:known},known),false);
 assert.equal(publishedSnapshotNewer({initialized:true,latestAt:'2026-11-07T08:18:00.000Z'},known),true);
 assert.equal(publishedSnapshotNewer({initialized:true,latestAt:'2026-11-07T06:18:00.000Z'},known),false);
});
test('legacy or invalid status does not suppress fetching the full encrypted vault',()=>{
 const known='2026-11-07T07:18:00Z';
 for(const status of [{initialized:true},{initialized:true,latestAt:'invalid'},null,{},'bad',{
  initialized:true,latestAt:123
 }])assert.equal(publishedSnapshotNewer(status,known),null);
 assert.equal(publishedSnapshotNewer({latestAt:known},'bad local date'),null);
});

test('a cached archive older than one hourly tick verifies the encrypted vault even if status is stale',()=>{
 const now=Date.parse('2026-11-08T07:53:00.000Z');
 assert.equal(cachedSnapshotNeedsFullCheck('2026-11-08T05:18:00.000Z',now),true,'13:18 cache at 15:53 must be checked');
 assert.equal(cachedSnapshotNeedsFullCheck('2026-11-08T07:18:00.000Z',now),false,'35-minute-old cache still uses tiny marker');
 assert.equal(cachedSnapshotNeedsFullCheck('2026-11-08T06:43:00.000Z',now),true,'exactly 70-minute-old cache requires full check');
 assert.equal(cachedSnapshotNeedsFullCheck('invalid',now),true,'unknown age requires verification');
 assert.equal(publishedSnapshotNewer({latestAt:'2026-11-08T05:18:00.000Z'},'2026-11-08T05:18:00.000Z'),false,
  'a lagging marker would otherwise incorrectly skip an authoritative check');
});
