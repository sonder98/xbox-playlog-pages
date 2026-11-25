import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {encryptVault,MAX_VAULT_CIPHERTEXT} from '../src/crypto.ts';
import {updateBoundaryCoverage} from './sync-health.ts';
import {readVault} from './password.ts';
import type {RecordData} from '../src/data.ts';
import type {DailyPlaytimeLedger} from '../src/playtime-ledger.ts';
import type {PcMetascores} from '../src/metascores.ts';
/** Verify decryption and round-trip before replacing the encrypted snapshot. */
export async function publishSnapshot(record:RecordData,previous:RecordData[],password:string,playtimeLedger?:DailyPlaytimeLedger,metacriticScores?:PcMetascores,boundaryObserved=false){
 const payload={records:[record,...previous],...(playtimeLedger?{playtimeLedger}:{}),...(metacriticScores?{metacriticScores}:{})};
 const envelope=await encryptVault(payload,password);
 if(!isDeepStrictEqual(await readVault(envelope,password,password),JSON.parse(JSON.stringify(payload))))throw Error('重新加密后的记录校验失败；未覆盖历史文件。');
 const serialized=JSON.stringify(envelope);
 console.log('Encrypted snapshot size: '+Buffer.byteLength(serialized)+' bytes');
 if(envelope.ciphertext.length>MAX_VAULT_CIPHERTEXT*0.75)console.warn('::warning::Encrypted snapshot approaching client size limit.');
 const previousStatus=fs.existsSync('public/status.json')?JSON.parse(fs.readFileSync('public/status.json','utf8')):{};
 const boundaryCoverage=updateBoundaryCoverage(previousStatus.boundaryCoverage,record.at,boundaryObserved);
 fs.writeFileSync('public/vault.json',serialized);
 fs.writeFileSync('public/status.json',JSON.stringify({initialized:true,latestAt:record.at,boundaryCoverage,vaultSha256:createHash('sha256').update(serialized).digest('hex')}));
}
