import {compactPayload,expandPayload} from './record-payload.ts';
import {compactPayloadV2} from './record-payload-v2.ts';
export const MAX_VAULT_CIPHERTEXT=120_000_000;
// Bound decompressed wire data separately from the encrypted download size.
export const MAX_VAULT_WIRE_BYTES=256_000_000;
type Common={algorithm:'AES-GCM';kdf:'PBKDF2-SHA256';iterations:number;salt:string;iv:string;ciphertext:string};
export type Envelope=Common&({version:1}|{version:2;compression:'gzip'});
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const decode=(s:string)=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
export function isVaultEnvelope(input:unknown):input is Envelope{
 if(!input||typeof input!=='object')return false;
 const e=input as Envelope;
 return (e.version===1||e.version===2&&e.compression==='gzip')&&e.algorithm==='AES-GCM'&&e.kdf==='PBKDF2-SHA256'&&e.iterations===600000&&typeof e.ciphertext==='string'&&e.ciphertext.length>0&&e.ciphertext.length<=MAX_VAULT_CIPHERTEXT&&typeof e.salt==='string'&&e.salt.length===24&&typeof e.iv==='string'&&e.iv.length===16;
}
async function derive(password:string,salt:Uint8Array){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function transform(bytes:Uint8Array,compress:boolean):Promise<Uint8Array<ArrayBuffer>>{
 const stream=new Blob([bytes as BlobPart]).stream().pipeThrough(compress?new CompressionStream('gzip'):new DecompressionStream('gzip'));
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_VAULT_WIRE_BYTES){await reader.cancel();throw Error('档案解压后超出安全容量。');}chunks.push(value);}
 }finally{reader.releaseLock();}
 const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
const aad=new TextEncoder().encode('xbox-playlog-vault-v2:gzip');
export async function encryptVault(payload:unknown,password:string,version:1|2=1):Promise<Envelope>{
 if(password.length<8)throw Error('应用密码至少需要8个字符。');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const raw=new TextEncoder().encode(JSON.stringify(version===2?compactPayloadV2(payload):compactPayload(payload)));
 if(raw.length>MAX_VAULT_WIRE_BYTES)throw Error('档案超出安全容量。');
 const bytes=version===2?await transform(raw,true):raw;
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,...(version===2?{additionalData:aad}:{})},await derive(password,salt),bytes);
 const encoded=encode(new Uint8Array(ciphertext));
 if(encoded.length>MAX_VAULT_CIPHERTEXT)throw Error('加密档案超出安全容量。');
 const common:Common={algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:600000,salt:encode(salt),iv:encode(iv),ciphertext:encoded};
 return version===2?{...common,version:2,compression:'gzip'}:{...common,version:1};
}
export async function decryptVault(input:unknown,password:string):Promise<any>{
 if(!isVaultEnvelope(input))throw Error('加密记录格式不受支持。');
 const e=input,salt=decode(e.salt),iv=decode(e.iv);
 if(salt.length!==16||iv.length!==12)throw Error('加密记录格式不受支持。');
 try{
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv as BufferSource,...(e.version===2?{additionalData:aad}:{})},await derive(password,salt),decode(e.ciphertext) as BufferSource);
  const raw=e.version===2?await transform(new Uint8Array(plaintext),false):new Uint8Array(plaintext);
  return expandPayload(JSON.parse(new TextDecoder().decode(raw)));
 }catch{throw Error('密码不正确，或加密记录已损坏。');}
}
