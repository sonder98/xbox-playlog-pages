import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
// Server-side state only: a separate domain and AES-GCM key from the browser record vault.
const aad=Buffer.from('playlog-microsoft-private-state-v1');
export type AuthState={version:1;clientId:string;refreshToken:string;owner?:string;updatedAt:string};
export function sealState(value:unknown,password:string){
 if(password.length<8)throw Error('微软私有缓存需要有效的加密密钥。');
 const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32,{N:65536,r:8,p:1,maxmem:96*1024*1024});
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {version:1,kdf:'scrypt-65536-8-1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:bytes.toString('base64')};
}
export function unsealState(input:any,password:string):any{
 try{
  if(input?.version!==1||input.kdf!=='scrypt-65536-8-1'||typeof input.ciphertext!=='string'||input.ciphertext.length>80_000_000)throw Error();
  const salt=Buffer.from(input.salt,'base64'),iv=Buffer.from(input.iv,'base64'),tag=Buffer.from(input.tag,'base64');if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error();
  const key=scryptSync(password,salt,32,{N:65536,r:8,p:1,maxmem:96*1024*1024}),cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(input.ciphertext,'base64')),cipher.final()]).toString('utf8'));
 }catch{throw Error('微软私有缓存解密失败；请检查应用密码，或重新授权。');}
}
export function readState(file:string,password:string,alternate?:string){
 if(!fs.existsSync(file))return undefined;
 const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
 try{return unsealState(envelope,password);}catch(error){if(alternate&&alternate!==password)return unsealState(envelope,alternate);throw error;}
}
export function writeState(file:string,value:unknown,password:string){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const envelope=sealState(value,password);
 // Validate before atomic replacement. Neither plaintext nor credentials reach the filesystem.
 unsealState(envelope,password);const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(envelope),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file);
}
export function validateAuth(value:any,clientId?:string):AuthState{
 if(value?.version!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.clientId)||!value.refreshToken||typeof value.refreshToken!=='string'||(clientId&&value.clientId!==clientId)||(value.owner!==undefined&&!/^\d{5,25}$/.test(value.owner)))throw Error('微软授权缓存与当前应用不匹配；需要重新授权。');
 return value;
}
