import {test} from 'node:test';import assert from 'node:assert/strict';
import {collectPages,hasPlaytime,probeMicrosoft} from '../scripts/microsoft-probe.ts';
const config={clientId:'11111111-1111-1111-1111-111111111111',refreshToken:'PRIVATE-REFRESH'};
test('full own-account probe paginates short pages, keeps raw rarity, reads native statlists and verifies renewal without leaking identity',async()=>{
 const calls:{url:string;body:any}[]=[],refreshed:string[]=[];
 const request:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));let body:any=init?.body;if(typeof body==='string')body=JSON.parse(body);calls.push({url:url.href,body});let data;
  if(url.hostname==='login.microsoftonline.com'){data={access_token:'PRIVATE-ACCESS',refresh_token:'PRIVATE-ROTATED'};refreshed.push((init!.body as URLSearchParams).get('refresh_token')!);}
  else if(url.hostname==='user.auth.xboxlive.com')data={Token:'PRIVATE-USER'};
  else if(url.hostname==='xsts.auth.xboxlive.com')data={Token:'PRIVATE-XSTS',DisplayClaims:{xui:[{uhs:'PRIVATE-HASH'}]}};
  else if(url.hostname==='profile.xboxlive.com')data={profileUsers:[{id:'2530000000000000',settings:[{id:'Gamertag',value:'PRIVATE-GAMERTAG'}]}]};
  else if(url.hostname==='titlehub.xboxlive.com')data={titles:[{titleId:url.searchParams.has('continuationToken')?'2':'1',name:'PRIVATE-GAME',type:'Game',achievement:{totalAchievements:2}}],...(url.searchParams.has('continuationToken')?{}:{continuationToken:'NEXT-HISTORY'})};
  else if(url.hostname==='achievements.xboxlive.com')data={achievements:[{id:url.searchParams.has('continuationToken')?'2':'1',progressState:'Achieved',progression:{timeUnlocked:'2026-10-30T00:00:00Z'},rarity:{currentPercentage:0},mediaAssets:[{url:'https://images.example/award'}],productId:'one-product'}],pagingInfo:{continuationToken:url.searchParams.has('continuationToken')?null:'NEXT-AWARD'}};
  else if(url.hostname==='userstats.xboxlive.com')data={statlistscollection:[{stats:[{name:'MinutesPlayed',value:'0'}]}]};
  else throw Error('Unexpected host');
  return Response.json(data);
 };
 const report=await probeMicrosoft(config,request);
 assert.deepEqual(refreshed,['PRIVATE-REFRESH','PRIVATE-ROTATED']);assert.equal(report.refresh,true);assert.equal(report.sampledTitles,2);
 assert.ok(report.achievementSamples.every(s=>s.read&&s.complete&&s.rarity&&s.unlockDates&&s.images&&s.playtime));assert.deepEqual(report.issues,[]);assert.equal(report.dlcMappingVerified,false);
 const text=JSON.stringify(report);for(const secret of ['PRIVATE','2530000000000000','2026-10-30','one-product'])assert.ok(!text.includes(secret));
 assert.equal(calls.filter(c=>c.url.includes('achievements.xboxlive.com')).length,4);
 assert.ok(calls.filter(c=>c.url.includes('achievements.xboxlive.com')).every(c=>new URL(c.url).searchParams.get('unlockedOnly')==='false'));
});
test('pagination rejects loops and malformed pages; missing playtime is not zero',async()=>{
 await assert.rejects(collectPages(async()=>({titles:[],continuationToken:'repeat'}),'titles'),/重复/);
 await assert.rejects(collectPages(async()=>({titles:null}),'titles'),/格式/);
 assert.equal(hasPlaytime({groups:[{statlistscollection:[{stats:[{name:'MinutesPlayed',value:'42'}]}]}]}),true);
 for(const value of [null,'',undefined,-1,'NaN'])assert.equal(hasPlaytime({name:'MinutesPlayed',value}),false);
});
