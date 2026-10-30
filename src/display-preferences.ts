import {decryptVault,encryptVault} from './crypto.ts';
export type DisplayPreferences={hiddenGameIds:string[]};
type Store=Pick<Storage,'getItem'|'setItem'>;
export function normalizeDisplayPreferences(input:unknown):DisplayPreferences{
 const ids=(input as DisplayPreferences)?.hiddenGameIds;
 if(!Array.isArray(ids)||ids.length>5000||ids.some(id=>typeof id!=='string'||!/^\d{1,20}$/.test(id)))throw Error('游戏显示设置格式无效。');
 return {hiddenGameIds:[...new Set(ids)]};
}
const key=(xuid:string)=>'playlog-display-encrypted-v1:'+xuid;
export async function readDisplayPreferences(xuid:string,password:string,store:Store):Promise<DisplayPreferences>{
 const raw=store.getItem(key(xuid));
 if(!raw)return {hiddenGameIds:[]};
 try{return normalizeDisplayPreferences(await decryptVault(JSON.parse(raw),password));}
 catch{throw Error('无法读取本机游戏显示设置，请在“管理展示”中重新保存选择。');}
}
export async function saveDisplayPreferences(xuid:string,password:string,input:unknown,store:Store){
 const value=normalizeDisplayPreferences(input);
 const encrypted=await encryptVault(value,password);
 store.setItem(key(xuid),JSON.stringify(encrypted));
 return value;
}
