import {test} from 'node:test';import assert from 'node:assert/strict';
import {achievement,playtime,officialGroups,catalogGroups,scanMicrosoft,compareLibrary,mergeTitleHistories} from '../scripts/microsoft-library.ts';
import type {Achievement,Game,RecordData} from '../src/data.ts';
const config={clientId:'11111111-1111-1111-1111-111111111111',refreshToken:'PRIVATE-REFRESH'};
const award=(id:string,unlocked=false):Achievement=>({id,name:'Award '+id,image:'',unlocked,unlockedAt:null,rarity:null,points:10});
const game=(id='1'):Game=>({id,name:'PRIVATE-GAME',image:'',devices:[],minutes:42,lastPlayed:null,earned:1,total:2,score:10,maxScore:20,achievements:[award('1',true),award('2')]});
const record=(games:Game[]):RecordData=>({id:'snapshot',at:'2026-10-30T00:00:00Z',profile:{xuid:'2530000000000000',gamertag:'PRIVATE-GAMERTAG',avatar:''},source:'Xbox',games,warnings:[]});
test('official BaseGame IDs partition add-ons without assuming scores, and inconsistent membership stays unknown',()=>{
 const a=[award('8',true),award('99')],page={completion:[{titleId:'1',groups:{g:{groupType:'BaseGame',achievementIds:['8'],unlockedAchievementIds:['8']}}}]};
 const groups=officialGroups([page],'1',a);assert.deepEqual(groups?.map(g=>[g.kind,g.achievementIds]),[['base',['8']],['dlc',['99']]]);
 assert.equal(officialGroups([page],'2',a),undefined);assert.equal(officialGroups([{completion:[{titleId:'1',groups:{g:{groupType:'BaseGame',achievementIds:['missing']}}}]}],'1',a),undefined);
 const mismatch=structuredClone(page);mismatch.completion[0].groups.g.unlockedAchievementIds=[];assert.equal(officialGroups([mismatch],'1',a),undefined);
 assert.equal(officialGroups([{achievements:a}],'1',a),undefined);
});
test('rarity zero, legacy sentinel dates, native statlists, and ambiguous catalog joins are handled honestly',()=>{
 assert.equal(achievement({id:1,unlocked:false,timeUnlocked:'2002-11-15T00:00:00Z',rarity:{currentPercentage:0}}).unlockedAt,null);
 assert.equal(achievement({id:'1',progressState:'Achieved',rarity:{currentPercentage:'0'}}).rarity,0);
 assert.equal(playtime({statlistscollection:[{stats:[{name:'MinutesPlayed',value:'0'}]}]},'1'),0);
 assert.equal(playtime({users:[{titles:[{titleId:'2',stats:[{name:'MinutesPlayed',value:99}]}]}]},'1'),null);
 assert.equal(playtime({name:'MinutesPlayed',value:null},'1'),null);
 const g=game();const catalog:any={catalogs:[{name:g.name,total:2,data:{achievements:[{...award('99',true),name:'Award 1'},{...award('100'),name:'Award 2'}],groups:[{id:'base',kind:'base',name:'本体',achievementIds:['99','100']}]}}]};
 assert.deepEqual(catalogGroups(catalog,g)?.[0].achievementIds,['1','2']);catalog.catalogs[0].data.achievements[1].name='Award 1';assert.equal(catalogGroups(catalog,g),undefined);
});
test('full scan reads modern contract 6, legacy all+earned, explicit groups, time, and emits only counts in audit',async()=>{
 const calls:{url:URL;headers:any}[]=[];
 const request:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.pathname.includes('/history/titles'))return Response.json({titles:[]});calls.push({url,headers:init?.headers});let data:any;
  if(url.hostname==='login.microsoftonline.com')data={access_token:'PRIVATE-ACCESS',refresh_token:'PRIVATE-ROTATED'};
  else if(url.hostname==='user.auth.xboxlive.com')data={Token:'PRIVATE-USER'};
  else if(url.hostname==='xsts.auth.xboxlive.com')data={Token:'PRIVATE-XSTS',DisplayClaims:{xui:[{uhs:'PRIVATE-HASH'}]}};
  else if(url.hostname==='profile.xboxlive.com')data={profileUsers:[{id:'2530000000000000',settings:[{id:'Gamertag',value:'PRIVATE-GAMERTAG'}]}]};
  else if(url.hostname==='titlehub.xboxlive.com')data={titles:[{titleId:'1',name:'PRIVATE-MODERN',devices:['XboxSeries'],achievement:{totalAchievements:2,currentAchievements:1}},{titleId:'2',name:'PRIVATE-LEGACY',devices:['Xbox360'],achievement:{totalAchievements:2,currentAchievements:1}}]};
  else if(url.hostname==='userstats.xboxlive.com')data={statlistscollection:[{stats:[{name:'MinutesPlayed',value:'0'}]}]};
  else if(url.pathname.endsWith('titleachievements'))data={achievements:[{id:1,name:'PRIVATE-ONE'},{id:2,name:'PRIVATE-TWO'}]};
  else if(url.searchParams.get('titleId')==='2')data={achievements:[{id:1,name:'PRIVATE-ONE',unlocked:true,timeUnlocked:'2026-10-30T00:00:00Z'}]};
  else data={achievements:[{id:'1',name:'PRIVATE-ONE',progressState:'Achieved',progression:{timeUnlocked:'2026-10-30T00:00:00Z'},rarity:{currentPercentage:0},mediaAssets:[{url:'https://images.example/award'}],groupIds:['base']},{id:'2',name:'PRIVATE-TWO',rarity:{currentPercentage:50}}],completion:[{titleId:'1',groups:{base:{groupType:'BaseGame',achievementIds:['1'],unlockedAchievementIds:['1']}}}]};
  return Response.json(data);
 };
 const {record:r,audit}=await scanMicrosoft(config,{request,pause:async()=>{},expectedOwner:'2530000000000000'});
 assert.equal(audit.processed,2);assert.equal(audit.complete,2);assert.equal(audit.legacy,1);assert.equal(audit.rarityAchievements,2);assert.equal(audit.officialBaseGroups,1);assert.equal(audit.officialAddonGroups,1);assert.equal(audit.failed,0);
 assert.equal(r.games[0].minutes,0);assert.equal(r.games[1].minutes,null);assert.equal(r.games[1].achievements?.filter(a=>a.unlocked).length,1);
 assert.equal(calls.find(c=>c.url.hostname==='achievements.xboxlive.com'&&!c.url.pathname.includes('/history/'))?.headers['x-xbl-contract-version'],'6');
 for(const value of ['PRIVATE','2530000000000000','2026-10-30'])assert.ok(!JSON.stringify(audit).includes(value));
});
test('permission failures preserve previous title records; 429 interrupts without a request storm',async()=>{
 let reads=0;const old=game();
 const request:typeof fetch=async(input)=>{
  const u=new URL(String(input));if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',achievement:{totalAchievements:2,currentAchievements:1}}]});
  reads++;return Response.json({error:'do not print me'},{status:429});
 };
 const result=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([old,game('missing')])});
 assert.equal(reads,1);assert.equal(result.audit.interrupted,true);assert.equal(result.audit.failed,1);assert.equal(result.record.games.length,2);assert.deepEqual(result.record.games[0],old);
 assert.equal(compareLibrary([game()],record([game(),game('2')])).ambiguous,1);
});

test('missing title summary total is derived from the complete catalog, never mistaken for zero',async()=>{
 const request:typeof fetch=async(input)=>{
  const u=new URL(String(input));if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',achievement:{currentAchievements:1,totalAchievements:0}}]});
  if(u.hostname==='userstats.xboxlive.com')return Response.json({stats:[{name:'MinutesPlayed',value:10}]});
  return Response.json({achievements:[{id:'1',name:'PRIVATE-AWARD',progressState:'Achieved',rarity:{currentPercentage:0.1}},...(u.searchParams.get('possibleOnly')==='true'?[{id:'2',name:'PRIVATE-LOCKED',rarity:{currentPercentage:0.5}}]:[])],completion:[{titleId:'1',groups:{g:{groupType:'BaseGame',achievementIds:['1'],unlockedAchievementIds:['1']}}}]});
 };
 const {record:r,audit}=await scanMicrosoft(config,{request,pause:async()=>{}});
 assert.equal(r.games[0].total,2);assert.equal(r.games[0].earned,1);assert.equal(r.games[0].achievements?.find(a=>a.id==='2')?.unlocked,false);assert.equal(audit.complete,1);assert.equal(audit.summaryMismatches,0);assert.equal(audit.summaryTotalsDerived,1);assert.equal(audit.rarityAchievements,2);assert.equal(audit.officialBaseGroups,1);assert.ok(!JSON.stringify(audit).includes('PRIVATE'));
});

test('official title aliases reconcile localized names without confusing duplicate editions',()=>{
 const current=game(),prior=record([{...game(),name:'English title'}]);current.name='中文名称';
 assert.equal(compareLibrary([current],prior).unmatched,1);
 const aliases=new Map([['1',['English title']]]);assert.equal(compareLibrary([current],prior,aliases).matched,1);
 prior.games.push({...game('2'),name:'English title'});assert.equal(compareLibrary([current],prior,aliases).ambiguous,1);
});

test('empty modern responses try legacy catalogs even without legacy flags; targeted repair preserves other games',async()=>{
 const request:typeof fetch=async(input,init)=>{
  const u=new URL(String(input));if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-LEGACY',devices:['PC'],achievement:{currentAchievements:0,totalAchievements:0}},{titleId:'2',name:'PRIVATE-PRESERVED'}]});
  assert.equal(u.searchParams.get('titleId'),'1');
  if((init?.headers as any)['x-xbl-contract-version']==='1')return Response.json({achievements:[{id:1,name:'PRIVATE-AWARD',gamerscore:10,unlocked:true,timeUnlocked:'2026-10-30T00:00:00Z'}]});
  return Response.json({achievements:[]});
 };
 const old=game('2');const result=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([old]),onlyIds:new Set(['1'])});
 assert.equal(result.audit.titles,1);assert.equal(result.audit.legacy,1);assert.equal(result.audit.failed,0);assert.equal(result.record.games[0].earned,1);assert.equal(result.record.games[0].total,1);assert.deepEqual(result.record.games.find(g=>g.id==='2'),old);
});

test('a metadata-only PC duplicate cannot be compared against the console record as a second match',()=>{
 const consoleGame=game('1'),pc={...game('2'),earned:0,total:0,score:0,achievements:[]};const prior=record([game('exophase')]);
 const result=compareLibrary([consoleGame,pc],prior);assert.equal(result.matched,1);assert.equal(result.ambiguous,1);assert.equal(result.earnedDifferences,0);assert.equal(result.totalDifferences,0);
});

test('achievement histories add omitted games, identify legacy explicitly, and exclude application history',()=>{
 const result=mergeTitleHistories([{titleId:'1',name:'中文游戏',devices:['XboxOne'],achievement:{currentAchievements:0,totalAchievements:0}}],[{titleId:1,name:'English Game',titleType:'DGame',earnedAchievements:3,currentGamerscore:30,maxGamerscore:100},{titleId:2,name:'Missing modern',titleType:'DGame',earnedAchievements:1,maxGamerscore:1000},{titleId:9,name:'App',titleType:'LiveApp'}],[{titleId:3,name:'Old game',titleType:1,currentAchievements:5,totalAchievements:50,totalGamerscore:1000},{titleId:10,name:'Video app',titleType:5}]);
 assert.deepEqual(result.map(t=>t.titleId),['1','2','3']);assert.equal(result[0].name,'中文游戏');assert.equal(result[0].achievement.currentAchievements,3);assert.equal(result[1].achievement.totalGamerscore,1000);assert.equal(result[2].achievement.sourceVersion,1);assert.equal(result[2].achievement.totalAchievements,50);
});

test('an empty PC catalog is unknown, not proof that the console game lost all achievements',()=>{
 const empty={...game('1'),total:0,earned:0,achievements:[]};
 const result=compareLibrary([empty],record([game('exophase')]));assert.equal(result.matched,0);assert.equal(result.ambiguous,1);assert.equal(result.totalDifferences,0);assert.equal(result.earnedDifferences,0);
});
