import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateSnapshot,decodePair,newestPair} from '../scripts/live-assets.mjs';

const pair=(at,ciphertext='test-only')=>{
 const vault=JSON.stringify({algorithm:'AES-GCM',ciphertext});
 const status=JSON.stringify({initialized:true,latestAt:at,vaultSha256:createHash('sha256').update(vault).digest('hex')});
 return {vault,status,at:Date.parse(at)};
};
const older=pair('2026-11-25T14:00:00Z'),newer=pair('2026-11-25T15:00:00Z','new');
test('legacy and checksummed snapshots restore without date dependence',()=>{
 assert.equal(validateSnapshot(older.vault,older.status),older.at);
 assert.equal(validateSnapshot(older.vault,JSON.stringify({initialized:true,latestAt:'2026-11-25T14:00:00Z'})),older.at);
});
test('inconsistent status and ciphertext cannot be used as a checkpoint',()=>{
 assert.throws(()=>validateSnapshot(older.vault,newer.status),/checksum/);
 assert.throws(()=>decodePair(JSON.stringify({vault:newer.vault,status:older.status})),/checksum/);
 assert.throws(()=>validateSnapshot(older.vault,JSON.stringify({initialized:true,latestAt:'bad'})),/Invalid/);
});
test('newest valid backup wins regardless of source, absent sources fail closed',()=>{
 assert.deepEqual(newestPair([older,null,newer]),newer);
 assert.deepEqual(newestPair([newer,older]),newer);
 assert.throws(()=>newestPair([null,undefined]),/refusing rollback/);
});
test('an interrupted replacement can use the surviving complete slot',()=>{
 const backup=decodePair(JSON.stringify(newer));
 let damaged=null;
 try{damaged=decodePair(JSON.stringify({vault:older.vault,status:newer.status}));}catch{}
 assert.deepEqual(newestPair([damaged,backup,older]),newer);
});
