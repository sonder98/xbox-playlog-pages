import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedSnapshotNewer} from '../src/snapshot-freshness.ts';

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
