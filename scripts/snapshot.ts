import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {compactPayload} from '../src/record-payload.ts';
import {updateCapacity} from './vault-capacity.ts';
import {encryptVault,MAX_VAULT_CIPHERTEXT} from '../src/crypto.ts';
import {updateBoundaryCoverage} from './sync-health.ts';
import {readVault} from './password.ts';
import type {RecordData} from '../src/data.ts';
import type {DailyPlaytimeLedger} from '../src/playtime-ledger.ts';
import type {PcMetascores} from '../src/metascores.ts';
/** Verify decryption and round-trip before replacing the encrypted snapshot. */
export async function publishSnapshot(record:RecordData,previous:RecordData[],password:string,playtimeLedger?:DailyPlaytimeLedger,metacriticScores?:PcMetascores,boundaryObserved=false){
 const payload={records:[record,...previous],...(playtimeLedger?{playtimeLedger}:{}),...(metacriticScores?{metacriticScores}:{})};
 // Reader-first rollout: production writes v1 until the compatible UI is deployed.
 const version=process.env.PLAYLOG_VAULT_FORMAT==='2'?2:1;
 const envelope=await encryptVault(payload,password,version);
 if(!isDeepStrictEqual(await readVault(envelope,password,password),JSON.parse(JSON.stringify(payload))))throw Error('重新加密后的记录校验失败；未覆盖历史文件。');
 const serialized=JSON.stringify(envelope);
 console.log('Encrypted snapshot size: '+Buffer.byteLength(serialized)+' bytes');
 if(envelope.ciphertext.length>MAX_VAULT_CIPHERTEXT*0.75)console.warn('::warning::Encrypted snapshot approaching client size limit.');
 const previousStatus=fs.existsSync('public/status.json')?JSON.parse(fs.readFileSync('public/status.json','utf8')):{};
 const legacyEquivalentBytes=version===1?Buffer.byteLength(serialized):4*Math.ceil((Buffer.byteLength(JSON.stringify(compactPayload(payload)))+16)/3)+160;
 const capacity=updateCapacity(previousStatus.capacity,record.at,Buffer.byteLength(serialized),version,MAX_VAULT_CIPHERTEXT,legacyEquivalentBytes);
 console.log('Vault capacity: '+JSON.stringify({bytes:capacity.bytes,version,legacyEquivalentBytes,limitBytes:capacity.limitBytes}));
 const boundaryCoverage=updateBoundaryCoverage(previousStatus.boundaryCoverage,record.at,boundaryObserved);
 fs.writeFileSync('public/vault.json',serialized);
 fs.writeFileSync('public/status.json',JSON.stringify({initialized:true,latestAt:record.at,boundaryCoverage,capacity,vaultSha256:createHash('sha256').update(serialized).digest('hex')}));
}
