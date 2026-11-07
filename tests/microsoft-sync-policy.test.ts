import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldReuseRecentXboxSnapshot} from '../scripts/microsoft-sync-policy.ts';

const recent={
 ledgerAvailable:true,source:'Xbox',snapshotAt:'2026-11-07T12:11:00.000Z',
 now:'2026-11-07T12:17:00.000Z',dayBoundary:false,forceSweep:false
} as const;

test('Cloudflare hourly tick always scans even six minutes after a manual full sync',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'cloudflare'}),false);
});

test('Day-boundary auto checkpoints also never reuse snapshots',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'day-boundary'}),false);
});

test('Manual and code-update near-duplicate runs can keep their fast path',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual'}),true);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'code-update'}),true);
});

test('A fast path requires a recent Xbox record, a ledger, and no day boundary or forced sweep',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',source:'Exophase'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',ledgerAvailable:false}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',dayBoundary:true}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',forceSweep:true}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',snapshotAt:'2026-11-07T11:00:00.000Z'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',snapshotAt:'invalid'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...recent,mechanism:'manual',snapshotAt:'2026-11-07T12:21:00.000Z'}),false);
});
