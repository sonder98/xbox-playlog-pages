import {decryptVault} from '../src/crypto.ts';
export function getPasswords(env:Record<string,string|undefined>){
  const old=env.APP_PASSWORD||'';
  const target=env.NEW_APP_PASSWORD||old;
  if(old.length<16)throw Error('APP_PASSWORD 至少需要16个字符。');
  if(target.length<16)throw Error('NEW_APP_PASSWORD 至少需要16个字符；未修改记录。');
  return {old,target};
}
export async function readVault(envelope:unknown,old:string,target:string){
  try{return await decryptVault(envelope,target);}
  catch{
    if(old===target)throw Error('无法解密历史记录；未修改文件，请检查 APP_PASSWORD。');
    try{return await decryptVault(envelope,old);}
    catch{throw Error('旧密码和新密码均无法解密历史记录；未修改文件。');}
  }
}
