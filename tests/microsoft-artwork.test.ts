import {test} from 'node:test';
import assert from 'node:assert/strict';
import {australianArtwork} from '../scripts/microsoft-artwork.ts';
import type {RecordData} from '../src/data.ts';
const image=(purpose:string,width:number,height:number,uri:string)=>({ImagePurpose:purpose,Width:width,Height:height,Uri:'//store-images.s-microsoft.com/'+uri});
test('AU catalog selects SuperHeroArt before higher-resolution TitledHeroArt, never a screenshot',async()=>{
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
   image('TitledHeroArt',3840,2160,'titled'),
   image('SuperHeroArt',1920,1080,'hero'),
   image('BoxArt',2160,2160,'square')
  ]}]}]});
 });
 assert.equal(answer.landscapes,1);
 assert.equal(record.games[0].image,'https://store-images.s-microsoft.com/square');
 assert.equal(record.games[0].detailImage,'https://store-images.s-microsoft.com/hero');
 assert.equal(record.games[0].detailImagePurpose,'SuperHeroArt');
 assert.equal(record.games[0].achievements![0].name,'中文成就');
});
test('Missing SuperHeroArt uses TitledHeroArt, then BoxArt if no real hero exists',async()=>{
 const make=(id:string)=>({games:[{id,name:'Game',image:'',detailImage:'https://store-images.s-microsoft.com/old'}]}) as RecordData;
 const titled=make('22'),square=make('33');
 const request:typeof fetch=async input=>Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'Game',Images:[
 image('Screenshot',3840,2160,'shot'),
 ...(String(input).includes('Value=22')?[image('TitledHeroArt',1920,1080,'titled')]:[]),
 image('BoxArt',2160,2160,'box')
 ]}]}]});
 await australianArtwork(titled,request);
 await australianArtwork(square,request);
 assert.equal(titled.games[0].detailImagePurpose,'TitledHeroArt');
 assert.equal(titled.games[0].detailImage,'https://store-images.s-microsoft.com/titled');
 assert.equal(square.games[0].image,'https://store-images.s-microsoft.com/box');
 assert.equal(square.games[0].detailImage,undefined);
 assert.equal(square.games[0].detailImagePurpose,undefined);
});
test('Verified AU SuperHeroArt remains reusable for incremental sync',async()=>{
 const old={games:[{id:'123',name:'Game',image:'https://store-images.s-microsoft.com/image/square',detailImage:'https://store-images.s-microsoft.com/image/hero',detailImagePurpose:'SuperHeroArt'}]} as RecordData;
 const next={games:[{id:'123',name:'Game',image:''}]} as RecordData;
 await australianArtwork(next,async()=>{throw Error('should not contact catalog');},old);
 assert.equal(next.games[0].detailImage,old.games[0].detailImage);
});
