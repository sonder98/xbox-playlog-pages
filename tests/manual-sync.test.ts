import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchXboxSync,findWorkflowRun,githubRunUrl,newSyncRequestId} from '../src/manual-sync.ts';
const id='00000000-1111-4444-8888-aaaaaaaaaaaa';
test('manual GitHub sync dispatches once with scoped bearer token and correlatable request ID',async()=>{
 let called=0;
 const mock:typeof fetch=async(input,init)=>{
  called++;
  assert.equal(String(input),'https://api.github.com/repos/sonder98/xbox-playlog-pages/actions/workflows/sync.yml/dispatches');
  assert.equal(init?.method,'POST');
  assert.equal((init?.headers as Record<string,string>)?.Authorization,'Bearer github_pat_fixture');
  assert.deepEqual(JSON.parse(String(init?.body)),{ref:'main',inputs:{request_id:id}});
  return new Response(null,{status:204});
 };
 await dispatchXboxSync('github_pat_fixture',id,mock);
 assert.equal(called,1);
 assert.equal(newSyncRequestId().length,36);
});
test('manual sync refuses unscoped/invalid token and maps permission rejection without disclosing token',async()=>{
 await assert.rejects(dispatchXboxSync('ghp_legacy',id,async()=>{throw Error('Should not call API');}),/fine-grained/);
 await assert.rejects(dispatchXboxSync('github_pat_fixture','invalid',async()=>{throw Error('Should not call API');}),/ID/);
 await assert.rejects(dispatchXboxSync('github_pat_fixture',id,async()=>new Response('',{status:403})),/Actions: Read and write/);
});
test('run monitoring matches only the clicked request and not an unrelated scheduled or manual run',async()=>{
 const run=(display_title:string,event='workflow_dispatch')=>({id:123,name:'Xbox sync',status:'queued',conclusion:null,html_url:'https://github.com/sonder98/xbox-playlog-pages/actions/runs/123',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',display_title,event});
 const mock:typeof fetch=async(input)=>{
  assert.ok(String(input).includes('event=workflow_dispatch'));
  return Response.json({workflow_runs:[run('Xbox sync (workflow_dispatch · another-request)'),run('Xbox sync (schedule · '+id+')','schedule'),run('Xbox sync (workflow_dispatch · '+id+')')]});
 };
 const result=await findWorkflowRun('sync',id,mock);
 assert.equal(result?.display_title,'Xbox sync (workflow_dispatch · '+id+')');
 assert.equal(githubRunUrl(result!),'https://github.com/sonder98/xbox-playlog-pages/actions/runs/123');
 const absent=await findWorkflowRun('pages',id,async()=>Response.json({workflow_runs:[]}));
 assert.equal(absent,undefined);
});
