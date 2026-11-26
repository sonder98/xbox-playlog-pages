import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryPlan} from '../scripts/recover-sync.mjs';
const now=Date.parse('2026-11-25T12:00Z');
const status=minutes=>({latestAt:new Date(now-minutes*60000).toISOString(),vaultSha256:String(minutes)});
const runs={pages:[],sync:[]};
test('a failed deployment reuses the verified Release without contacting Xbox',()=>{
 const plan=recoveryPlan(status(180),status(30),runs,now);
 assert.equal(plan.workflow,'pages');
 assert.equal(recoveryPlan(status(180),status(30),{...runs,pages:[{status:'queued'}]},now),null);
 const attempt={display_title:'Playlog deploy (workflow_dispatch · '+plan.id+')',status:'completed',created_at:status(45).latestAt};
 assert.equal(recoveryPlan(null,status(30),{...runs,pages:[attempt,attempt]},now),null);
 assert.equal(recoveryPlan(status(30),status(30),runs,now),null);
});
test('stale collection dispatches sync only when neither a newer checkpoint nor an active sync exists',()=>{
 assert.equal(recoveryPlan(status(180),status(180),runs,now).workflow,'sync');
 assert.equal(recoveryPlan(status(180),status(180),{...runs,sync:[{status:'in_progress'}]},now),null);
 assert.equal(recoveryPlan(status(30),status(120),runs,now),null);
});
