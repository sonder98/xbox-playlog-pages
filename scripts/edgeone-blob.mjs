import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const CHUNK_BYTES=8*1024*1024;
const manifestKey='vault/manifest.json';
const storeName=process.env.EDGEONE_BLOB_STORE||'xbox-playlog';

export function splitBytes(input,maxBytes=CHUNK_BYTES){
 const bytes=Buffer.from(input);
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid Blob chunk size.');
 const chunks=[];
 for(let offset=0;offset<bytes.length;offset+=maxBytes)chunks.push(Buffer.from(bytes.subarray(offset,Math.min(offset+maxBytes,bytes.length))));
 return chunks;
}
export function makeManifest(version,chunks,bytes,sha256){
 return {format:'xbox-playlog-vault-v1',version,bytes,sha256,parts:chunks.map((_,i)=>`vault/${version}/part-${String(i).padStart(4,'0')}`)};
}

async function publish(){
 const file='public/vault.json';
 if(!fs.existsSync(file))throw Error('public/vault.json is missing; sync must publish the encrypted snapshot first.');
 const bytes=fs.readFileSync(file);
 const envelope=JSON.parse(bytes.toString('utf8'));
 if(envelope.algorithm!=='AES-GCM'||typeof envelope.ciphertext!=='string')throw Error('Refusing to upload a non-encrypted or invalid vault.');
 const projectId=process.env.EDGEONE_PROJECT_ID,token=process.env.EDGEONE_API_TOKEN;
 if(!projectId||!token)throw Error('EDGEONE_PROJECT_ID and EDGEONE_API_TOKEN are required.');
 const {getStore}=await import('@edgeone/pages-blob');
 const store=getStore({name:storeName,projectId,token,consistency:'strong'});
 const previous=await store.get(manifestKey,{type:'json',consistency:'strong'});
 const version=`${process.env.GITHUB_RUN_ID||'manual'}-${process.env.GITHUB_RUN_ATTEMPT||'1'}-${Date.now()}`;
 const chunks=splitBytes(bytes);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const manifest=makeManifest(version,chunks,bytes.length,sha256);
 for(let i=0;i<chunks.length;i++){
  const key=manifest.parts[i],data=Uint8Array.from(chunks[i]);
  await store.set(key,data.buffer);
 }
 // Switch readers only after every new chunk is safely written.
 await store.setJSON(manifestKey,manifest);
 const confirmed=await store.get(manifestKey,{type:'json',consistency:'strong'});
 if(confirmed?.version!==version||confirmed?.sha256!==sha256||confirmed?.parts?.length!==chunks.length)throw Error('EdgeOne Blob manifest read-back failed.');
 // Keep the previous complete generation during the transition so a reader
 // holding its old manifest can finish. Older/orphaned chunks are reclaimed.
 const keep=new Set([manifestKey,...manifest.parts,...(Array.isArray(previous?.parts)?previous.parts:[])]);
 const {blobs}=await store.list({prefix:'vault/',consistency:'strong'});
 const stale=blobs.filter(item=>!keep.has(item.key));
 await Promise.all(stale.map(item=>store.delete(item.key)));
 console.log('EdgeOne Blob snapshot published: '+JSON.stringify({bytes:bytes.length,parts:chunks.length,retainedPrevious:Array.isArray(previous?.parts),removedStale:stale.length}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]!=='publish')throw Error('Usage: node scripts/edgeone-blob.mjs publish');
 await publish();
}
