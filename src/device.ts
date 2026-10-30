type Remembered={version:1;key:CryptoKey;iv:Uint8Array;ciphertext:ArrayBuffer;expires:number};
const database='playlog-device-v1',storeName='credentials',recordKey='remembered';
async function databaseOperation<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('浏览器存储暂不可用。'));
  });
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(storeName,mode),request=operation(tx.objectStore(storeName));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||Error('浏览器存储操作已取消。'));
  });}finally{db.close();}
}
export async function forgetDevice(){
  await databaseOperation('readwrite',store=>store.delete(recordKey));
}
export async function rememberDevice(password:string){
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(password));
  const record:Remembered={version:1,key,iv,ciphertext,expires:Date.now()+30*24*60*60*1000};
  await databaseOperation('readwrite',store=>store.put(record,recordKey));
}
export async function recalledPassword():Promise<string|null>{
  try{
    const record=await databaseOperation<Remembered|undefined>('readonly',store=>store.get(recordKey));
    if(!record)return null;
    if(record.version!==1||!Number.isFinite(record.expires)||record.expires<=Date.now()){
      await forgetDevice();return null;
    }
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv as BufferSource},record.key,record.ciphertext);
    return new TextDecoder().decode(plaintext);
  }catch{
    await forgetDevice().catch(()=>{});
    return null;
  }
}
