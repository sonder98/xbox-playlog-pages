import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {sealState,unsealState,readState,writeState,validateAuth} from '../scripts/microsoft-state.ts';
test('private credential envelope authenticates ciphertext, separates record-vault keys, and never writes plaintext',()=>{
 const value={version:1,clientId:'11111111-1111-1111-1111-111111111111',refreshToken:'PRIVATE-REFRESH',owner:'2530000000000000',updatedAt:'2026-10-31T00:00:00Z'};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-state-')),file=path.join(root,'auth.json');
 try{
  writeState(file,value,'old-password');const bytes=fs.readFileSync(file,'utf8');assert.ok(!bytes.includes('PRIVATE'));assert.ok(!bytes.includes(value.owner));assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.deepEqual(readState(file,'new-password','old-password'),value);assert.throws(()=>readState(file,'wrong-password'),/解密失败/);
  const envelope=JSON.parse(bytes);envelope.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>unsealState(envelope,'old-password'),/解密失败/);
  assert.deepEqual(validateAuth(value,value.clientId),value);assert.throws(()=>validateAuth(value,'22222222-2222-2222-2222-222222222222'),/不匹配/);
  const encrypted=sealState(value,'old-password');assert.notEqual(encrypted.salt,JSON.parse(bytes).salt);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('rotated credentials survive a new process-style load and do not depend on website password',async()=>{
 const {credentials}=await import('../scripts/microsoft-credentials.ts');const root=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-credentials-'));
 const key='a'.repeat(43),clientId='11111111-1111-1111-1111-111111111111';
 try{
  const first=await credentials({MICROSOFT_STATE_DIR:root,MICROSOFT_STATE_KEY:key,XBOX_CLIENT_ID:clientId,XBOX_REFRESH_TOKEN:'PRIVATE-INITIAL',APP_PASSWORD:'website-old'});
  await first.config.onRefreshToken!('PRIVATE-ROTATED');first.state.owner='2530000000000000';first.save();
  const second=await credentials({MICROSOFT_STATE_DIR:root,MICROSOFT_STATE_KEY:key,APP_PASSWORD:'website-changed'});
  assert.equal(second.config.refreshToken,'PRIVATE-ROTATED');assert.equal(second.state.owner,'2530000000000000');
  await assert.rejects(credentials({MICROSOFT_STATE_DIR:root,MICROSOFT_STATE_KEY:'b'.repeat(43)}),/解密失败/);
  assert.ok(!fs.readFileSync(path.join(root,'auth.json'),'utf8').includes('PRIVATE'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
