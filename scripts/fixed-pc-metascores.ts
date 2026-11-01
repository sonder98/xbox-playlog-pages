/** Manually checked on 2026-11-01 against Metacritic PC Critic Reviews.
 * Public source file contains no game title or Xbox title ID. Keys are
 * HMAC-SHA256(titleId, MICROSOFT_STATE_KEY) prefixes, generated privately.
 * Source URLs and researched title mapping remain private; no secret is here. */
import {createHmac} from 'node:crypto';
export type FixedPcScore={score:number;platform:'PC';checkedAt:'2026-11-01';note?:string};
const fixed:Record<string,{score:number;note?:string}>={
 "f94ab1db0ce342b572cc3fc81f43eef3":{score:92},
 "1e7e8b8600a1e1773bf28effe726aa71":{score:73},
 "514ec2f2b55a6f6e4d19763bf0959f2a":{score:73},
 "7fa2f6983a79487a5bc8350a80775507":{score:75},
 "e27c7b4b66ccf2b12b2195670de0d9c8":{score:86},
 "528d95390293c746658d65f605417da3":{score:74},
 "ebf9c65a0a4a86f5d817104aaa770cb3":{score:84},
 "523758d87699174d99419746775cfddb":{score:92},
 "8540faa56c9bf815d86e1eaa3fcbee58":{score:82},
 "a8b2babdad812ac7783cbc987a5e1b88":{score:73},
 "3940c6bebe60ee81ed15a2758ec51c7c":{score:76},
 "1a33c9e0229dc460088f9b1808a3df26":{score:77,note:'原版 PC 评分，非 Enhanced 专属评分'},
 "ec5c3139ee67cf8e2ea3c8cd6c03a2e6":{score:80},
 "3bb8ca11dab342d09ef9fdd6789ac03b":{score:78},
 "3dc15b6cf41622c988075e905e8e410e":{score:90},
 "c62e65fa32acf7a9247a183cd8d8053b":{score:79},
 "ef223a710119dd6b491dc643724a685d":{score:85},
 "4a2f2ae888162b0f3aba6f6931ae0814":{score:94},
 "879c3dcfde4a7022700caa9b8bc91676":{score:78},
 "a352fd450ab456d9e7fd36b2b62da414":{score:84},
 "679940eed26ba5567884f02b0b0e54ee":{score:86},
 "0447d017a0c3a17af0dfd5bf56d81b51":{score:80},
 "604ace9173ef9608aa53dac92b6295a0":{score:71},
 "b7af93db44afe401e59d477a5669add2":{score:79},
 "07eb2158f9a7839e52253bdb577d7c98":{score:76},
 "e769df1b98d70bbfc429a2af3327a52d":{score:78},
 "ac2dfaddc5c6c9aeed5e782504824e6b":{score:86},
 "b51e3d4f4d65a8d0deef229ea0bd6a56":{score:83},
 "bfc99679edb7950c6439ca6be26662cc":{score:88}
};
export const fixedPcScoreCount=Object.keys(fixed).length;
export function fixedPcMetascores(ids:string[],hmacKey:string):Record<string,FixedPcScore>{
 if(!hmacKey||hmacKey.length<16)throw Error('没有稳定的私有游戏映射密钥，拒绝发布未匹配评分。');
 const out:Record<string,FixedPcScore>={};
 for(const id of ids){
  const digest=createHmac('sha256',hmacKey).update(id).digest('hex').slice(0,32);
  const found=fixed[digest];
  if(found)out[id]={...found,platform:'PC',checkedAt:'2026-11-01'};
 }
 return out;
}
