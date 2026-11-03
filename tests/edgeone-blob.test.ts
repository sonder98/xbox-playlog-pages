import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHUNK_BYTES,splitBytes,makeManifest} from '../scripts/edgeone-blob.mjs';

test('EdgeOne vault chunks stay below the 25 MB Blob object limit and reassemble exactly',()=>{
 const source=Buffer.from('x'.repeat(CHUNK_BYTES*2+37));
 const parts=splitBytes(source);
 assert.equal(parts.length,3);
 assert.deepEqual(Buffer.concat(parts),source);
 assert.ok(parts.every(part=>part.length<=8*1024*1024));
 assert.deepEqual(parts.map(part=>part.length),[CHUNK_BYTES,CHUNK_BYTES,37]);
});

test('EdgeOne vault manifest points only to the ordered chunks for its version',()=>{
 const parts=[Buffer.from('one'),Buffer.from('two')];
 const manifest=makeManifest('run-7-1234',parts,6,'a'.repeat(64));
 assert.deepEqual(manifest,{
  format:'xbox-playlog-vault-v1',
  version:'run-7-1234',
  bytes:6,
  sha256:'a'.repeat(64),
  parts:['vault/run-7-1234/part-0000','vault/run-7-1234/part-0001']
 });
});
