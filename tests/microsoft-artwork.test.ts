import {test} from 'node:test';
import assert from 'node:assert/strict';
import {australianArtwork} from '../scripts/microsoft-artwork.ts';
import type {RecordData} from '../src/data.ts';
test('Australian English square cover selection does not alter Chinese achievements',async()=>{
 const record={games:[{id:'123',name:'旧名称',image:'',achievements:[{name:'中文成就',description:'中文描述'}]}]} as RecordData;
 await australianArtwork(record,async(input,init)=>{
 const url=new URL(String(input));assert.equal(url.searchParams.get('market'),'AU');assert.equal(url.searchParams.get('languages'),'en-AU,en,neutral');assert.equal(init?.headers,undefined);
 return Response.json({Products:[{ProductKind:'Game',LocalizedProperties:[{Language:'en-AU',ProductTitle:'English Game',Images:[{Width:1920,Height:1080,ImagePurpose:'SuperHeroArt',Uri:'//store-images.s-microsoft.com/wide'},{Width:1080,Height:1080,ImagePurpose:'BoxArt',Uri:'//store-images.s-microsoft.com/square'}]}]}]});
 });
 assert.equal(record.games[0].name,'English Game');assert.equal(record.games[0].image,'https://store-images.s-microsoft.com/square');assert.equal(record.games[0].detailImage,'https://store-images.s-microsoft.com/wide');assert.equal(record.games[0].achievements![0].name,'中文成就');
});
