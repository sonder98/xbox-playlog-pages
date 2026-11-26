import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const mod=await import(new URL('../cloudflare-sync/scheduler.mjs',import.meta.url).href);

test('Cloudflare schedules match the hourly sync and daily Beijing day-boundary checks',()=>{
 assert.deepEqual(mod.CRON_RULES,[
  '17 * * * *',
  '42 15 * * *',
  '2 16 * * *'
 ]);
 assert.equal(mod.dispatchRequest(mod.CRON_RULES[0]).inputs.force_sweep,'false');
 assert.equal(mod.dispatchRequest(mod.CRON_RULES[0]).inputs.sync_mechanism,'cloudflare');
 for(const cron of mod.CRON_RULES.slice(1))
  assert.equal(mod.dispatchRequest(cron).inputs.force_sweep,'true');
 for(const cron of mod.CRON_RULES.slice(1))
  assert.equal(mod.dispatchRequest(cron).inputs.sync_mechanism,'day-boundary');
 assert.equal(mod.dispatchRequest('17 */2 * * *').inputs.force_sweep,'false','legacy two-hour cron accepted during Cloudflare cutover');
 assert.throws(()=>mod.dispatchRequest('*/1 * * * *'),/Unexpected Cron/);
});
test('Worker sends one authenticated, least-privilege workflow_dispatch per tick',async()=>{
 const seen:Array<{url:string;init:RequestInit}>=[];
 const request=async(url:string,init:RequestInit)=>{
  seen.push({url,init});
  return new Response(null,{status:204});
 };
 const result=await mod.sendScheduledDispatch('42 15 * * *','github_pat_fixture_test',request);
 assert.deepEqual(result,{cron:'42 15 * * *',forceSweep:true,status:204});
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://api.github.com/repos/sonder98/xbox-playlog-pages/actions/workflows/sync.yml/dispatches');
 assert.equal(new Headers(seen[0].init.headers).get('authorization'),'Bearer github_pat_fixture_test');
 assert.deepEqual(JSON.parse(String(seen[0].init.body)),{ref:'main',inputs:{force_sweep:'true',sync_mechanism:'day-boundary'}});
});
test('Dispatch failure is surfaced without leaking secrets and missing secret cannot dispatch',async()=>{
 await assert.rejects(mod.sendScheduledDispatch(mod.CRON_RULES[0],'',async()=>new Response(null,{status:204})),/Missing GITHUB_ACTIONS_TOKEN/);
 await assert.rejects(mod.sendScheduledDispatch(mod.CRON_RULES[0],'fixture-secret',async()=>new Response(null,{status:401})),/HTTP 401/);
 const result=await mod.default.fetch();
 assert.equal(result.status,404,'Public URLs cannot initiate Xbox sync');
});

test('GitHub sync workflow attributes legacy Worker dispatches without a sync_mechanism input',()=>{
 const workflow=readFileSync('.github/workflows/sync.yml','utf8');
 assert.ok(workflow.includes("inputs.force_sweep == 'true' && 'day-boundary' || 'cloudflare'"),
  'Unlabelled hourly workflow_dispatch should be attributed to Cloudflare');
 assert.ok(workflow.includes("inputs.request_id != '' && 'manual'"),
  'Manual sync request ID must take precedence over fallback');
 assert.ok(workflow.includes("github.event_name == 'push' && 'code-update'"),
  'Code updates retain their distinct source label');
});
