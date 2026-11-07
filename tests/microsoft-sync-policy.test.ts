import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldReuseRecentXboxSnapshot} from '../scripts/microsoft-sync-policy.ts';

const base={
 ledgerAvailable:true,source:'Xbox',priorMechanism:'manual' as const,
 snapshotAt:'2026-11-07T12:14:00.000Z',
 now:'2026-11-07T12:18:45.000Z',dayBoundary:false,forceSweep:false
};

test('A scheduled :17 Cloudflare tick can reuse a preceding manual scan from :12–:17',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare'}),true);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'2026-11-07T12:12:00Z'}),true);
});

test('Manual sync NEVER reuses a snapshot, regardless of its proximity to automatic sync',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'manual'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'manual',priorMechanism:'cloudflare'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'code-update'}),false);
});

test('Auto sync cannot reuse a manual scan that started AFTER the scheduled :17 tick',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'2026-11-07T12:17:01Z'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'2026-11-07T12:18:00Z'}),false);
});

test('Auto sync cannot reuse a manual scan more than 5 minutes before :17',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'2026-11-07T12:11:59Z'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'2026-11-07T11:59:00Z'}),false);
});

test('Auto sync cannot reuse older auto or code-update snapshots',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',priorMechanism:'cloudflare'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',priorMechanism:'code-update'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',priorMechanism:undefined}),false);
});

test('Queue delays allow :17 attribution but never open an indefinite reuse window',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',now:'2026-11-07T12:29:00Z'}),true);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',now:'2026-11-07T12:33:01Z'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',now:'2026-11-07T13:00:00Z'}),false);
});

test('Day-boundary automatic scans and forced sweeps always fetch Microsoft',()=>{
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'day-boundary'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',dayBoundary:true}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',forceSweep:true}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',ledgerAvailable:false}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',source:'Exophase'}),false);
 assert.equal(shouldReuseRecentXboxSnapshot({...base,mechanism:'cloudflare',snapshotAt:'invalid'}),false);
});
