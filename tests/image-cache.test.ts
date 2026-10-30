import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {cacheRecordImages,convertImage,imageCacheName,imageSource} from '../scripts/image-cache.ts';
import {validateRecord,type RecordData} from '../src/data.ts';
test('only known public artwork hosts and paths can be fetched; variants have stable distinct cache keys',()=>{
 assert.equal(imageSource('https://m.exophase.com/xbox/awards/s/abc.png'),'https://m.exophase.com/xbox/awards/s/abc.png');
 for(const url of ['http://m.exophase.com/xbox/awards/s/a','https://m.exophase.com.evil.test/xbox/awards/a','https://user@m.exophase.com/xbox/awards/a','https://m.exophase.com:8443/xbox/games/a','https://127.0.0.1/','https://m.exophase.com/account'])assert.equal(imageSource(url),null);
 assert.notEqual(imageCacheName('https://m.exophase.com/xbox/games/o/a',480),imageCacheName('https://m.exophase.com/xbox/games/o/a',1600));
});
test('WebP variants preserve aspect ratio, never upscale and reduce photographic payload',async()=>{
 const original=await sharp({create:{width:1920,height:1080,channels:3,background:'#445577'}}).png().toBuffer();
 const output=await convertImage(original,480),meta=await sharp(output).metadata();
 assert.equal(meta.format,'webp');assert.equal(meta.width,480);assert.equal(meta.height,270);assert.ok(output.length<original.length);
 const small=await sharp({create:{width:64,height:64,channels:4,background:'#887799'}}).png().toBuffer();
 assert.equal((await sharp(await convertImage(small,168)).metadata()).width,64);
});
test('duplicate artwork downloads once, a warm build needs no network, failures preserve original fallback',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-media-'));
 const record:RecordData={id:'t',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'test',avatar:''},source:'Exophase',warnings:[],games:[{id:'1',name:'Test',image:'https://m.exophase.com/xbox/games/o/cover.png',devices:[],minutes:null,lastPlayed:null,total:2,earned:0,score:0,maxScore:0,achievements:['1','2'].map(id=>({id,name:id,image:'https://m.exophase.com/xbox/awards/s/shared.png',unlocked:false,unlockedAt:null,rarity:0}))}]};
 let requests=0;const bytes=await sharp({create:{width:192,height:108,channels:3,background:'#557788'}}).png().toBuffer();
 try{
  const stats=await cacheRecordImages(record,{directory,fetchImage:async()=>{requests++;return bytes;}});
  assert.equal(requests,2);assert.equal(stats.covers,1);assert.equal(stats.achievements,2);
  assert.equal(fs.readdirSync(directory).length,3);
  const warm=await cacheRecordImages(record,{directory,fetchImage:async()=>{throw Error('network must not be used');}});
  assert.equal(warm.downloaded,0);assert.equal(warm.failures,0);assert.equal(warm.reused,3);
  assert.ok(validateRecord(record).games[0].cachedImage);assert.ok(validateRecord(record).games[0].achievements?.[0].cachedImage);
  for(const name of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,name));
  const failed=await cacheRecordImages(record,{directory,fetchImage:async()=>{throw Error('unavailable');}});
  assert.equal(failed.covers,0);assert.equal(failed.achievements,0);assert.equal(record.games[0].cachedImage,undefined);assert.ok(record.games[0].image.includes('exophase.com'));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
