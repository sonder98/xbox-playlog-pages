import {test} from 'node:test';
import assert from 'node:assert/strict';
import {australianArtwork} from '../scripts/microsoft-artwork.ts';
import type {RecordData} from '../src/data.ts';
const image=(purpose:string,width:number,height:number,uri:string)=>({ImagePurpose:purpose,Width:width,Height:height,Uri:'//store-images.s-microsoft.com/'+uri});
test('AU catalog selects TitledHeroArt before higher-resolution SuperHeroArt, never a screenshot',async()=>{
 const record={games:[{id:'1860967704',name:'ACE COMBAT 8: WINGS OF THEVE',image:'',achievements:[{name:'中文成就',description:'中文描述'}]}]} as RecordData;
 const answer=await australianArtwork(record,async(input,init)=>{
  const url=new URL(String(input));
  assert.equal(url.searchParams.get('alternateId'),'XboxTitleId');
  assert.equal(url.searchParams.get('Value'),'1860967704');
  assert.equal(url.searchParams.get('market'),'AU');
  assert.equal(url.searchParams.get('languages'),'en-AU,en,neutral');
  assert.equal(init?.headers,undefined);
  return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en',ProductTitle:'ACE COMBAT 8: WINGS OF THEVE',Images:[
   image('Screenshot',3840,2160,'shot'),
   image('TitledHeroArt',1920,1080,'titled'),
   image('SuperHeroArt',3840,2160,'hero'),
   image('BoxArt',2160,2160,'square')
  ]}]}]});
 });
 assert.equal(answer.landscapes,1);
 assert.equal(record.games[0].image,'https://store-images.s-microsoft.com/square');
 assert.equal(record.games[0].detailImage,'https://store-images.s-microsoft.com/titled');
 assert.equal(record.games[0].detailImagePurpose,'TitledHeroArt');
 assert.equal(record.games[0].posterImage,'https://store-images.s-microsoft.com/shot');
 assert.equal(record.games[0].posterImagePurpose,'Screenshot',
  'Mythic poster uses the first AU Store screenshot instead of a hero');
 assert.equal(record.games[0].posterSelectionVersion,3);
 assert.equal(record.games[0].achievements![0].name,'中文成就');
});
test('Missing TitledHeroArt uses SuperHeroArt, then BoxArt if no hero exists',async()=>{
 const make=(id:string)=>({games:[{id,name:'Game',image:'',detailImage:'https://store-images.s-microsoft.com/old'}]}) as RecordData;
 const titled=make('22'),square=make('33');
 const request:typeof fetch=async input=>Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
 image('Screenshot',3840,2160,'shot'),
 ...(String(input).includes('Value=22')?[image('SuperHeroArt',1920,1080,'hero')]:[]),
 image('BoxArt',2160,2160,'box')
 ]}]}]});
 await australianArtwork(titled,request);
 await australianArtwork(square,request);
 assert.equal(titled.games[0].detailImagePurpose,'SuperHeroArt');
 assert.equal(titled.games[0].detailImage,'https://store-images.s-microsoft.com/hero');
 assert.equal(titled.games[0].posterImage,'https://store-images.s-microsoft.com/shot');
 assert.equal(titled.games[0].posterImagePurpose,'Screenshot');
 assert.equal(square.games[0].image,'https://store-images.s-microsoft.com/box');
 assert.equal(square.games[0].detailImage,undefined);
 assert.equal(square.games[0].detailImagePurpose,undefined);
 assert.equal(square.games[0].posterImage,'https://store-images.s-microsoft.com/shot');
 assert.equal(square.games[0].posterImagePurpose,'Screenshot');
});
test('Verified AU TitledHeroArt remains reusable for incremental sync',async()=>{
 const old={games:[{id:'123',name:'Game',image:'https://store-images.s-microsoft.com/image/square',detailImage:'https://store-images.s-microsoft.com/image/hero',detailImagePurpose:'TitledHeroArt',posterImage:'https://store-images.s-microsoft.com/image/shot',posterImagePurpose:'Screenshot',posterSelectionVersion:2}]} as RecordData;
 const next={games:[{id:'123',name:'Game',image:''}]} as RecordData;
 await australianArtwork(next,async()=>{throw Error('should not contact catalog');},old);
 assert.equal(next.games[0].detailImage,old.games[0].detailImage);
 assert.equal(next.games[0].posterImage,old.games[0].posterImage);
 assert.equal(next.games[0].posterSelectionVersion,2);
});

test('An existing untitled SuperHeroArt is replaced by a titled image on refresh',async()=>{
 const old={games:[{id:'1860967704',name:'ACE COMBAT 8',image:'https://store-images.s-microsoft.com/image/square',detailImage:'https://store-images.s-microsoft.com/image/old-untitled',detailImagePurpose:'SuperHeroArt'}]} as RecordData;
 const next=structuredClone(old);
 let calls=0;
 await australianArtwork(next,async()=>{
  calls++;
  return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'ACE COMBAT 8',Images:[
   image('BoxArt',2160,2160,'image/square'),
   image('SuperHeroArt',3840,2160,'image/untitled'),
   image('TitledHeroArt',1920,1080,'image/titled')
  ]}]}]});
 },old);
 assert.equal(calls,1,'Old untitled artwork must not take the incremental fast path');
 assert.equal(next.games[0].detailImagePurpose,'TitledHeroArt');
 assert.equal(next.games[0].detailImage,'https://store-images.s-microsoft.com/image/titled');
 assert.equal(next.games[0].cachedDetailImage,undefined);
 assert.equal(next.games[0].posterImagePurpose,'SuperHeroArt');
 assert.equal(next.games[0].posterImage,'https://store-images.s-microsoft.com/image/untitled');
});

test('Mythic background takes the first Screenshot in API order, not the largest one',async()=>{
 const record={games:[{id:'7',name:'Game',image:'',earned:1,total:1}]} as RecordData;
 await australianArtwork(record,async()=>Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
  image('BoxArt',1024,1024,'image/cover'),
  image('SuperHeroArt',3840,2160,'image/hero'),
  image('Screenshot',1280,720,'image/first-shot'),
  image('Screenshot',3840,2160,'image/later-4k-shot'),
 ]}]}]}));
 assert.equal(record.games[0].posterImage,'https://store-images.s-microsoft.com/image/first-shot');
 assert.equal(record.games[0].posterImagePurpose,'Screenshot');
 assert.deepEqual(record.games[0].posterScreenshots,[
  'https://store-images.s-microsoft.com/image/first-shot',
  'https://store-images.s-microsoft.com/image/later-4k-shot'
 ]);
 assert.match(record.games[0].posterRotationStartDay||'',/^\d{4}-\d{2}-\d{2}$/);
});

test('Already-Mythic legacy hero posters upgrade once; later syncs reuse the Screenshot',async()=>{
 const old={games:[{id:'8',name:'Game',image:'https://store-images.s-microsoft.com/image/cover',
  detailImage:'https://store-images.s-microsoft.com/image/titled',
  detailImagePurpose:'TitledHeroArt',posterImage:'https://store-images.s-microsoft.com/image/hero',
  posterImagePurpose:'SuperHeroArt',earned:1,total:1}]} as RecordData;
 const next={games:[{id:'8',name:'Game',image:'',earned:1,total:1}]} as RecordData;
 let calls=0;
 await australianArtwork(next,async()=>{calls++;
  return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
   image('BoxArt',1024,1024,'image/cover'),
   image('TitledHeroArt',1920,1080,'image/titled'),
   image('SuperHeroArt',1920,1080,'image/hero'),
   image('Screenshot',1920,1080,'image/first-shot')
  ]}]}]});
 },old);
 assert.equal(calls,1);
 assert.equal(next.games[0].posterImage,'https://store-images.s-microsoft.com/image/first-shot');
 assert.equal(next.games[0].posterSelectionVersion,3);
 const again={games:[{id:'8',name:'Game',image:'',earned:1,total:1}]} as RecordData;
 await australianArtwork(again,async()=>{throw Error('versioned poster should be reused');},next);
 assert.equal(again.games[0].posterImage,next.games[0].posterImage);
 assert.equal(again.games[0].posterSelectionVersion,3);
});

test('independent Mythic albums preserve AU API order and reuse a complete gallery on later syncs',async()=>{
 const make=(id:string)=>({games:[{id,name:'Game',image:'',earned:1,total:1}]}) as RecordData;
 const first=make('10'),second=make('11');
 const request:typeof fetch=async input=>{
  const id=new URL(String(input)).searchParams.get('Value');
  return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
   image('BoxArt',1080,1080,'image/cover-'+id),
   image('TitledHeroArt',1920,1080,'image/titled-'+id),
   image('Screenshot',1920,1080,'image/first-'+id),
   ...(id==='10'?[image('Screenshot',1920,1080,'image/second-10'),image('Screenshot',1920,1080,'image/third-10')]:[])
  ]}]}]});
 };
 await australianArtwork(first,request);
 await australianArtwork(second,request);
 assert.deepEqual(first.games[0].posterScreenshots,[
  'https://store-images.s-microsoft.com/image/first-10',
  'https://store-images.s-microsoft.com/image/second-10',
  'https://store-images.s-microsoft.com/image/third-10'
 ]);
 assert.deepEqual(second.games[0].posterScreenshots,['https://store-images.s-microsoft.com/image/first-11']);
 const refreshed=make('10');
 await australianArtwork(refreshed,async()=>{throw Error('must reuse already versioned screenshot album');},first);
 assert.deepEqual(refreshed.games[0].posterScreenshots,first.games[0].posterScreenshots);
 assert.equal(refreshed.games[0].posterRotationStartDay,first.games[0].posterRotationStartDay);
});

test('a legacy Mythic with a version-two poster reloads the screenshot album once',async()=>{
 const old={games:[{id:'99',name:'Game',image:'https://store-images.s-microsoft.com/image/cover',
  detailImage:'https://store-images.s-microsoft.com/image/title',
  detailImagePurpose:'TitledHeroArt',posterImage:'https://store-images.s-microsoft.com/image/shot-one',
  posterSelectionVersion:2,posterImagePurpose:'Screenshot',earned:1,total:1}]} as RecordData;
 const next=structuredClone(old);
 let calls=0;
 await australianArtwork(next,async()=>{calls++;return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
  image('BoxArt',1080,1080,'image/cover'),
  image('TitledHeroArt',1920,1080,'image/title'),
  image('Screenshot',1920,1080,'image/shot-one'),
  image('Screenshot',1920,1080,'image/shot-two')
 ]}]}]});},old);
 assert.equal(calls,1);
 assert.equal(next.games[0].posterSelectionVersion,3);
 assert.deepEqual(next.games[0].posterScreenshots,[
  'https://store-images.s-microsoft.com/image/shot-one','https://store-images.s-microsoft.com/image/shot-two'
 ]);
});
