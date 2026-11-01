import fs from 'node:fs';
import {publicEncrypt,createCipheriv,createHmac,randomBytes,constants} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {getPasswords,readVault} from './password.ts';
// RSA public key is for the one-time audit export only.
// The corresponding PRIVATE key never enters the GitHub repository or Actions.
const keyPem=`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn2Xbe8BoMm3NIRWOcVzr
oS1u7YpEqvkEbt33lzg7H8NMvb5Ptu2L/sqFGX4hj7DFvBhE+ZPqnzN4qknnk/Ut
psLflTmO5NpXL//7/0kkPABMHSjT4MaJfaKWEafqTANgfs2hdOzeCSCu/m3keDcI
zcUnZp+jiK8IwwM8rqL3oxil0P5480dv5XS9B7N02zVMfJTwmL191oAcsOK/O5Mg
MB658v+Vi77q7mT13rX1e9uIm4R4ZLg7hpbjh1gMhC7QKRoq13ERYgZc7AARk0Ms
FD4fvyQvyArqcbsHRtQxt2NuMrseIZQYuQb5v05Jjdo30qRubLNgi4yq0s7VX57Z
QQIDAQAB
-----END PUBLIC KEY-----`;
const {old,target}=getPasswords(process.env);
const vault=await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target);
const hmacKey=process.env.MICROSOFT_STATE_KEY;
if(!hmacKey||hmacKey.length<16)throw Error('Missing private hashing key');
const visible=vault.records[0].games.filter((g:any)=>g.officialHidden===undefined).map((g:any)=>({
  idHash:createHmac('sha256',hmacKey).update(String(g.id)).digest('hex').slice(0,32),
  name:String(g.name),lastPlayed:g.lastPlayed,
  lastAchievement:(g.achievements||[]).filter((a:any)=>a.unlockedAt).map((a:any)=>a.unlockedAt).sort().at(-1)||null
}));
const aesKey=randomBytes(32),iv=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',aesKey,iv);
const content=gzipSync(Buffer.from(JSON.stringify(visible),'utf8'));
const ciphertext=Buffer.concat([cipher.update(content),cipher.final()]);
const wrapped=publicEncrypt({key:keyPem,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},aesKey);
const payload=Buffer.from(JSON.stringify({wrapped:wrapped.toString('base64'),iv:iv.toString('base64'),
 tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}));
console.log('PRIVATE_ENCRYPTED_GAME_LIST='+payload.toString('base64'));
console.log('PRIVATE_LIST_COUNT='+visible.length);
