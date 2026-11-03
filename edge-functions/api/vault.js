import {getStore} from "@edgeone/pages-blob";

const store=getStore({name:"xbox-playlog",consistency:"strong"});
const jsonHeaders={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, max-age=0",
  "X-Content-Type-Options":"nosniff"
};

export async function onRequestGet(){
  const manifest=await store.get("vault/manifest.json",{type:"json",consistency:"strong"});
  if(!manifest||manifest.format!=="xbox-playlog-vault-v1"||
    !/^[a-zA-Z0-9-]+$/.test(manifest.version||"")||
    !Array.isArray(manifest.parts)||manifest.parts.length<1||manifest.parts.length>16||
    !Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||
    !/^[a-f0-9]{64}$/.test(manifest.sha256||"")){
    return new Response("Encrypted snapshot is not available.",{status:503,headers:{"Cache-Control":"no-store"}});
  }

  let index=0,reader=null;
  const body=new ReadableStream({
    async pull(controller){
      try{
        while(true){
          if(reader){
            const next=await reader.read();
            if(!next.done){controller.enqueue(next.value);return;}
            reader.releaseLock();
            reader=null;
            index++;
          }
          if(index>=manifest.parts.length){controller.close();return;}
          const key=manifest.parts[index];
          if(typeof key!=="string"||!key.startsWith(`vault/${manifest.version}/part-`)){
            throw new Error("Invalid encrypted snapshot part.");
          }
          const part=await store.get(key,{type:"stream",consistency:"strong"});
          if(!part)throw new Error("Encrypted snapshot part is missing.");
          reader=part.getReader();
        }
      }catch(error){
        controller.error(error);
      }
    },
    async cancel(reason){
      if(reader)await reader.cancel(reason);
    }
  });
  return new Response(body,{headers:{
    ...jsonHeaders,
    "Content-Length":String(manifest.bytes),
    "X-Playlog-Vault-Version":manifest.version
  }});
}
