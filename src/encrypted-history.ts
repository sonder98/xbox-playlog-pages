import type {Envelope} from './crypto';

/** Keep one already-unlocked encrypted snapshot for intermittent mobile networks.
 * IndexedDB avoids localStorage's small per-origin size limits. Plaintext is never saved. */
const databaseName='playlog-encrypted-history-v1';
const storeName='snapshots';
const latestKey='latest';

function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('本机档案缓存暂不可用。'));
 });
}

function isEnvelope(value:unknown):value is Envelope{
 if(!value||typeof value!=='object')return false;
 const v=value as Partial<Envelope>;
 return v.version===1&&v.algorithm==='AES-GCM'&&v.kdf==='PBKDF2-SHA256'&&
  v.iterations===600000&&typeof v.salt==='string'&&typeof v.iv==='string'&&
  typeof v.ciphertext==='string'&&v.ciphertext.length>0&&v.ciphertext.length<=40_000_000;
}

export async function readEncryptedHistory():Promise<Envelope|null>{
 if(typeof indexedDB==='undefined')return null;
 let db:IDBDatabase;
 try{db=await openDatabase();}catch{return null;}
 try{
  const cached=await new Promise<unknown>((resolve,reject)=>{
   const request=db.transaction(storeName,'readonly').objectStore(storeName).get(latestKey);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  return isEnvelope(cached)?cached:null;
 }catch{return null;}
 finally{db.close();}
}

/** Called only after successfully decrypting and validating a cloud envelope. */
export async function saveEncryptedHistory(envelope:unknown):Promise<void>{
 if(typeof indexedDB==='undefined'||!isEnvelope(envelope))return;
 let db:IDBDatabase;
 try{db=await openDatabase();}catch{return;}
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(storeName,'readwrite');
   tx.objectStore(storeName).put(envelope,latestKey);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error||Error('本机快照写入取消。'));
  });
 }catch{/* Storage quota/private mode must not block a working cloud unlock. */}
 finally{db.close();}
}
