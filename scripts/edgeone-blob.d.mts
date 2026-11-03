export const CHUNK_BYTES:number;
export function splitBytes(input:Uint8Array|ArrayBuffer|string,maxBytes?:number):Uint8Array[];
export function makeManifest(version:string,chunks:readonly unknown[],bytes:number,sha256:string):{
 format:'xbox-playlog-vault-v1';
 version:string;
 bytes:number;
 sha256:string;
 parts:string[];
};
