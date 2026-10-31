import {test} from 'node:test';import assert from 'node:assert/strict';import {deviceAuthorization} from '../scripts/microsoft-device.ts';
const client='11111111-1111-1111-1111-111111111111';
test('device sign-in handles pending and slow-down, exposes only user challenge, and keeps private device code internal',async()=>{
 const challenges:any[]=[],waits:number[]=[];let polls=0;
 const request:typeof fetch=async(input,init)=>{
  if(String(input).endsWith('/devicecode'))return Response.json({user_code:'ABCDEFGH',device_code:'PRIVATE-DEVICE',expires_in:600,interval:5});
  assert.equal((init!.body as URLSearchParams).get('device_code'),'PRIVATE-DEVICE');polls++;
  return polls===1?Response.json({error:'authorization_pending'},{status:400}):polls===2?Response.json({error:'slow_down'},{status:400}):Response.json({refresh_token:'PRIVATE-REFRESH'});
 };
 assert.equal(await deviceAuthorization(client,info=>challenges.push(info),request,async ms=>{waits.push(ms);}),'PRIVATE-REFRESH');
 assert.deepEqual(waits,[5000,5000,10000]);assert.deepEqual(challenges,[{userCode:'ABCDEFGH',verificationUri:'https://microsoft.com/devicelogin'}]);
});
test('device cancellation never repeats upstream error descriptions or private codes',async()=>{
 const request:typeof fetch=async(input)=>String(input).endsWith('/devicecode')?Response.json({user_code:'ABCDEFGH',device_code:'PRIVATE-DEVICE',expires_in:600}):Response.json({error:'authorization_declined',error_description:'PRIVATE-ACCESS'},{status:400});
 await assert.rejects(deviceAuthorization(client,()=>{},request,async()=>{}),error=>error instanceof Error&&error.message.includes('取消')&&!error.message.includes('PRIVATE'));
});
