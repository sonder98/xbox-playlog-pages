import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {encryptVault} from '../src/crypto.ts';
import {readVault} from './password.ts';
import type {RecordData} from '../src/data.ts';
/** Verify decryption and round-trip before replacing the encrypted snapshot. */
export async function publishSnapshot(record:RecordData,previous:RecordData[],password:string){
 const payload={records:[record,...previous]};
 const envelope=await encryptVault(payload,password);
 if(!isDeepStrictEqual(await readVault(envelope,password,password),JSON.parse(JSON.stringify(payload))))throw Error('重新加密后的记录校验失败；未覆盖历史文件。');
 fs.writeFileSync('public/vault.json',JSON.stringify(envelope));
 fs.writeFileSync('public/status.json',JSON.stringify({initialized:true}));
}
