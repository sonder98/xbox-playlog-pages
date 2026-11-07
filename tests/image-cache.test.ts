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

test('wide detail artwork has a separate uncropped WebP cache from the square library cover',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-detail-'));
 const cover='https://store-images.s-microsoft.com/image/square';
 const hero='https://store-images.s-microsoft.com/image/wide';
 const record:RecordData={id:'a',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'test',avatar:''},source:'Xbox',warnings:[],games:[{id:'1',name:'Test',image:cover,detailImage:hero,posterImage:'https://store-images.s-microsoft.com/image/poster',devices:[],lastPlayed:null,minutes:0,earned:0,total:0,score:0,maxScore:0}]};
 const square=await sharp({create:{width:1200,height:1200,channels:3,background:'#334455'}}).png().toBuffer();
 const landscape=await sharp({create:{width:1600,height:900,channels:3,background:'#557799'}}).png().toBuffer();
 try{
  const result=await cacheRecordImages(record,{directory,fetchImage:async url=>url===hero?landscape:square});
  assert.equal(result.covers,1);
  assert.ok(record.games[0].cachedImageLarge);
  assert.ok(record.games[0].cachedDetailImage);
  assert.ok(record.games[0].cachedPosterImage);
  assert.notEqual(record.games[0].cachedImageLarge,record.games[0].cachedDetailImage);
  assert.notEqual(record.games[0].cachedPosterImage,record.games[0].cachedDetailImage);
  const detailPath=path.join(directory,imageCacheName(hero,1600));
  const info=await sharp(fs.readFileSync(detailPath)).metadata();
  assert.equal(info.width,1600);assert.equal(info.height,900);
  assert.equal(validateRecord(record).games[0].cachedDetailImage,record.games[0].cachedDetailImage);
  assert.equal(validateRecord(record).games[0].cachedPosterImage,record.games[0].cachedPosterImage);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Mythic screenshot album caches each distinct image and keeps returned order, even when one download fails',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-mythic-gallery-'));
 const urls=['https://store-images.s-microsoft.com/image/one','https://store-images.s-microsoft.com/image/two','https://store-images.s-microsoft.com/image/three'];
 const game:RecordData['games'][number]={id:'2',name:'Mythic',image:urls[0],posterImage:urls[0],posterScreenshots:urls,posterRotationStartDay:'2026-11-06',
  devices:[],lastPlayed:null,minutes:0,earned:1,total:1,score:0,maxScore:0};
 const record:RecordData={id:'x',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'test',avatar:''},source:'Xbox',warnings:[],games:[game]};
 const bytes=await sharp({create:{width:1280,height:720,channels:3,background:'#445566'}}).png().toBuffer();
 try{
  await cacheRecordImages(record,{directory,fetchImage:async url=>{
   if(url===urls[1])throw Error('simulated missing day two image');
   return bytes;
  }});
  assert.equal(game.cachedPosterScreenshots?.length,3);
  assert.equal(game.cachedPosterScreenshotsSmall?.length,3);
  assert.ok(game.cachedPosterScreenshots?.[0]?.endsWith(imageCacheName(urls[0],1600)));
  assert.ok(game.cachedPosterScreenshotsSmall?.[0]?.endsWith(imageCacheName(urls[0],480)));
  assert.equal(game.cachedPosterScreenshots?.[1],'');
  assert.equal(game.cachedPosterScreenshotsSmall?.[1],'');
  assert.ok(game.cachedPosterScreenshots?.[2]?.endsWith(imageCacheName(urls[2],1600)));
  assert.ok(game.cachedPosterScreenshotsSmall?.[2]?.endsWith(imageCacheName(urls[2],480)));
  assert.equal(validateRecord(record).games[0].cachedPosterScreenshots?.[1],'');
  assert.equal(validateRecord(record).games[0].cachedPosterScreenshotsSmall?.[1],'');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('new 480px screenshot variants are derived from existing 1600px cache without downloading again',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-mythic-small-'));
 const shot='https://store-images.s-microsoft.com/image/previously-cached-screenshot';
 const game:RecordData['games'][number]={
  id:'9',name:'Mythic cached shot',image:shot,posterImage:shot,posterScreenshots:[shot],
  posterRotationStartDay:'2026-11-06',devices:[],lastPlayed:null,minutes:0,
  earned:1,total:1,score:0,maxScore:0
 };
 const record:RecordData={id:'x',at:new Date().toISOString(),profile:{xuid:'4285437',gamertag:'test',avatar:''},source:'Xbox',warnings:[],games:[game]};
 try{
  const full=await sharp({create:{width:1600,height:900,channels:3,background:'#334466'}}).webp().toBuffer();
  fs.writeFileSync(path.join(directory,imageCacheName(shot,1600)),full);
  const result=await cacheRecordImages(record,{directory,fetchImage:async()=>{throw Error('Must NOT contact Microsoft to build preview');}});
  assert.equal(result.downloaded,0);
  assert.equal(result.failures,0);
  assert.equal(result.derived,1);
  assert.equal(game.cachedPosterScreenshots?.[0]?.endsWith(imageCacheName(shot,1600)),true);
  assert.equal(game.cachedPosterScreenshotsSmall?.[0]?.endsWith(imageCacheName(shot,480)),true);
  const small=await sharp(fs.readFileSync(path.join(directory,imageCacheName(shot,480)))).metadata();
  assert.deepEqual([small.width,small.height,small.format],[480,270,'webp']);
  const warmed=await cacheRecordImages(record,{directory,fetchImage:async()=>{throw Error('Already warm');}});
  assert.equal(warmed.derived,0,'Later hourly sync must not regenerate an existing preview');
  assert.equal(warmed.downloaded,0);
  assert.equal(warmed.failures,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Xbox gamerpic is persisted as 96px WebP and reused without remote requests',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlog-avatar-'));
 const url='https://images-eds-ssl.xboxlive.com/image?gamerpic=fixture';
 const record:RecordData={id:'x',at:'2026-11-07T00:00:00Z',
  profile:{xuid:'4285437',gamertag:'Player',avatar:url},
  source:'Xbox',warnings:[],games:[]};
 const bytes=await sharp({create:{width:500,height:500,channels:3,background:'#b29277'}}).png().toBuffer();
 let requests=0;
 try{
  const first=await cacheRecordImages(record,{directory,fetchImage:async requested=>{
   assert.equal(requested,url);requests++;return bytes;
  }});
  assert.equal(first.downloaded,1);
  assert.equal(requests,1);
  assert.ok(record.profile.cachedAvatar?.endsWith(imageCacheName(url,96)));
  assert.equal(record.profile.avatar,url,'Xbox original avatar remains as a fallback');
  const meta=await sharp(fs.readFileSync(path.join(directory,imageCacheName(url,96)))).metadata();
  assert.deepEqual([meta.width,meta.height,meta.format],[96,96,'webp']);
  assert.equal(validateRecord(record).profile.cachedAvatar,record.profile.cachedAvatar);
  const warm=await cacheRecordImages(record,{directory,fetchImage:async()=>{throw Error('Avatar must not hit Microsoft again');}});
  assert.equal(warm.downloaded,0);assert.equal(warm.failures,0);
  assert.equal(requests,1);
  record.profile.avatar='https://images-eds-ssl.xboxlive.com/image?gamerpic=new-photo';
  await cacheRecordImages(record,{directory,fetchImage:async()=>bytes});
  assert.ok(record.profile.cachedAvatar?.endsWith(imageCacheName(record.profile.avatar,96)),
   'A changed Xbox gamerpic gets a new durable cache key');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
