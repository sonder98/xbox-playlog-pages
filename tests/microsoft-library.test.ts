import {test} from 'node:test';import assert from 'node:assert/strict';
import {achievement,playtime,officialGroups,catalogGroups,scanMicrosoft,compareLibrary,mergeTitleHistories,refreshCatalogToday,shouldReadPlaytime,detailCacheDecision} from '../scripts/microsoft-library.ts';
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
  else if(url.hostname==='titlehub.xboxlive.com')data={titles:[{titleId:'1',name:'PRIVATE-MODERN',titleHistory:{visible:true},devices:['XboxSeries'],achievement:{totalAchievements:2,currentAchievements:1}},{titleId:'2',name:'PRIVATE-LEGACY',titleHistory:{visible:true},devices:['Xbox360'],achievement:{totalAchievements:2,currentAchievements:1}}]};
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
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',titleHistory:{visible:true,lastTimePlayed:'2026-11-01T06:00:00Z'},achievement:{totalAchievements:2,currentAchievements:1}}]});
  reads++;return Response.json({error:'do not print me'},{status:429});
 };
 const result=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([old,game('missing')])});
 assert.equal(reads,1);assert.equal(result.audit.interrupted,true);assert.equal(result.audit.failed,1);assert.equal(result.record.games.length,2);assert.deepEqual(result.record.games[0],{...old,officialHidden:false});
 assert.equal(compareLibrary([game()],record([game(),game('2')])).ambiguous,1);
});

test('missing title summary total is derived from the complete catalog, never mistaken for zero',async()=>{
 const request:typeof fetch=async(input)=>{
  const u=new URL(String(input));if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',titleHistory:{visible:true},achievement:{currentAchievements:1,totalAchievements:0}}]});
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
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-LEGACY',titleHistory:{visible:true},devices:['PC'],achievement:{currentAchievements:0,totalAchievements:0}},{titleId:'2',name:'PRIVATE-PRESERVED',titleHistory:{visible:true}}]});
  assert.equal(u.searchParams.get('titleId'),'1');
  if((init?.headers as any)['x-xbl-contract-version']==='1')return Response.json({achievements:[{id:1,name:'PRIVATE-AWARD',gamerscore:10,unlocked:true,timeUnlocked:'2026-10-30T00:00:00Z'}]});
  return Response.json({achievements:[]});
 };
 const old=game('2');const result=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([old]),onlyIds:new Set(['1'])});
 assert.equal(result.audit.titles,1);assert.equal(result.audit.legacy,1);assert.equal(result.audit.failed,0);assert.equal(result.record.games[0].earned,1);assert.equal(result.record.games[0].total,1);assert.deepEqual(result.record.games.find(g=>g.id==='2'),{...old,officialHidden:undefined});
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

test('title hub visibility cannot be overwritten by achievement-history merging',()=>{
 const hub=[{titleId:'1',name:'Official Hidden',titleHistory:{visible:false,lastTimePlayed:null}},{titleId:'2',name:'Official Visible',titleHistory:{visible:true}}];
 const merged=mergeTitleHistories(hub,[{titleId:1,name:'History Hidden',totalAchievements:3},{titleId:3,name:'History Only',totalAchievements:2}],[]);
 assert.equal(merged[0].titleHistory.visible,false);
 assert.equal(merged[1].titleHistory.visible,true);
 assert.equal(merged[2].titleHistory.visible,undefined);
});

test('Microsoft hidden games stay archived without detail requests, and unhide overrides old flag',async()=>{
 const old=record([{...game('1'),officialHidden:false},{...game('2'),officialHidden:true}]);
 const requests:string[]=[];
 const request:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});
  if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[
   {titleId:'1',name:'PRIVATE-GAME',titleHistory:{visible:false},achievement:{totalAchievements:2,currentAchievements:1}},
   {titleId:'2',name:'PRIVATE-GAME',titleHistory:{visible:true,lastTimePlayed:'2026-10-30T00:00:00Z'},achievement:{totalAchievements:2,currentAchievements:1}}
  ]});
  if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});
  requests.push(u.pathname);
  if(u.hostname==='userstats.xboxlive.com')return Response.json({stats:[{name:'MinutesPlayed',value:42}]});
  if(u.hostname==='achievements.xboxlive.com')return Response.json({achievements:[
   {id:'1',name:'Award 1',progressState:'Achieved',rewards:[{type:'Gamerscore',value:10}]},
   {id:'2',name:'Award 2',rewards:[{type:'Gamerscore',value:10}]}
  ],completion:[{titleId:'2',groups:{base:{groupType:'BaseGame',achievementIds:['1'],unlockedAchievementIds:['1']}}}]});
  throw Error('Unexpected host');
 };
 const output=await scanMicrosoft(config,{request,pause:async()=>{},previous:old});
 assert.equal(output.record.games.find(g=>g.id==='1')?.officialHidden,true);
 assert.equal(output.record.games.find(g=>g.id==='1')?.minutes,42,'Cached details and playtime are retained while hidden');
 assert.equal(output.record.games.find(g=>g.id==='2')?.officialHidden,false,'Official unhide overrides the old hidden state');
 assert.ok(requests.every(x=>!x.includes('titleId=1')),'No detail fetches for official hidden titles');
 assert.equal(output.audit.failed,0);
});

test('Missing visibility field overrides old visible state without losing playtime',async()=>{
 const previous=record([{...game('1'),officialHidden:false}]);
 const request:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});
  if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',achievement:{totalAchievements:2,currentAchievements:1}}]});
  if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});
  throw Error('Unknown visibility should not trigger hidden title detail fetch');
 };
 const result=await scanMicrosoft(config,{request,pause:async()=>{},previous});
 assert.equal(result.record.games[0].officialHidden,undefined);
 assert.equal(result.record.games[0].minutes,42,'No data loss while game is not displayable');
});

test('Previously visible game absent from title history stays archived, but not displayed',async()=>{
 const previous=record([{...game('55'),officialHidden:false}]);
 const request:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});
  if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'66',name:'Visible',titleHistory:{visible:true}}]});
  if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});
  return Response.json({achievements:[]});
 };
 const {record:latest}=await scanMicrosoft(config,{request,pause:async()=>{},previous});
 assert.equal(latest.games.find(g=>g.id==='55')?.officialHidden,undefined);
 assert.equal(latest.games.find(g=>g.id==='55')?.minutes,42);
 assert.equal(latest.games.find(g=>g.id==='66')?.officialHidden,false);
});

test('incremental cache does not refetch unchanged unverified achievements or old playtime, but polls recent titles',async()=>{
 const at='2026-11-01T01:30:00.000Z',recent='2026-10-31T00:00:00.000Z',dormant='2026-07-01T00:00:00.000Z';
 const old1={...game('1'),groupStatus:'unavailable' as const,groups:[],lastPlayed:dormant};
 const old2={...game('2'),groupStatus:'verified' as const,groups:[{id:'base',name:'本体',kind:'base' as const,achievementIds:['1','2'],total:2,earned:1}],lastPlayed:recent};
 const calls:string[]=[];
 const request:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'access'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'user'});
  if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'xsts',DisplayClaims:{xui:[{uhs:'hash'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[
   {titleId:'1',name:'PRIVATE-GAME',titleHistory:{visible:true,lastTimePlayed:'2026-07-01T00:00:00.0000000Z'},achievement:{totalAchievements:2,currentAchievements:1}},
   {titleId:'2',name:'PRIVATE-GAME-2',titleHistory:{visible:true,lastTimePlayed:recent},achievement:{totalAchievements:2,currentAchievements:1,currentGamerscore:10}}
  ]});
  if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});
  calls.push(u.toString());
  if(u.hostname==='userstats.xboxlive.com')return Response.json({statlistscollection:[{stats:[{name:'MinutesPlayed',value:99}]}]});
  throw Error('Unchanged achievements should not be refetched');
 };
 const {record:r,audit}=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([old1,old2]),now:at});
 assert.equal(audit.fullRefresh,false);
 assert.equal(audit.reusedDetails,2);
 assert.deepEqual(audit.reuseReasons,{reused:2});
 assert.equal(audit.detailedReads,0);
 assert.equal(audit.statsReads,1);
 assert.equal(audit.statsSkipped,1);
 assert.equal(audit.unknownGroups,1);
 assert.equal(calls.length,1);
 assert.equal(r.games.find(g=>g.id==='1')?.minutes,42);
 assert.equal(r.games.find(g=>g.id==='2')?.minutes,99);
});

test('missing summary falls back to an earned-only Xbox probe and detects newly earned IDs',async()=>{
 const at='2026-11-01T01:30:00.000Z',previous='2026-07-01T00:00:00.000Z';
 const original={...game('1'),lastPlayed:previous,officialHidden:false};
 let changed=false;const calls:string[]=[];
 const request:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'a'});
  if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});
  if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});
  if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:'2530000000000000',settings:[]}]});
  if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'PRIVATE-GAME',titleHistory:{visible:true,lastTimePlayed:previous},achievement:{}}]});
  if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});
  if(u.hostname==='userstats.xboxlive.com')return Response.json({statlistscollection:[{stats:[{name:'MinutesPlayed',value:42}]}]});
  calls.push(u.toString());
  if(u.searchParams.get('unlockedOnly')==='true')
   return Response.json({achievements:[{id:'1',name:'Award 1',progressState:'Achieved'},...(changed?[{id:'2',name:'Award 2',progressState:'Achieved'}]:[])]});
  return Response.json({achievements:[{id:'1',name:'Award 1',progressState:'Achieved',gamerscore:10},{id:'2',name:'Award 2',progressState:changed?'Achieved':'NotStarted',gamerscore:10}],completion:[{titleId:'1',groups:{base:{groupType:'BaseGame',achievementIds:['1','2']}}}]});
 };
 const fast=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([original]),now:at});
 assert.equal(fast.audit.reusedDetails,1);
 assert.equal(fast.audit.detailedReads,0);
 assert.equal(fast.audit.statsSkipped,1);
 assert.deepEqual(fast.audit.reuseReasons,{verifiedEarned:1});
 assert.equal(calls.length,1,'Only the earned-only check is needed for an unchanged dormant title');
 assert.ok(calls[0].includes('unlockedOnly=true'));
 changed=true;calls.length=0;
 const refreshed=await scanMicrosoft(config,{request,pause:async()=>{},previous:record([original]),now:at});
 assert.equal(refreshed.audit.reusedDetails,0);
 assert.equal(refreshed.audit.detailedReads,1);
 assert.equal(refreshed.audit.reuseReasons.missingSummary,1);
 assert.ok(calls.some(url=>url.includes('unlockedOnly=true')),'New earned achievements force a complete catalog refresh');
});
test('cached catalogs reuse missing-score summaries and real identical last-played timestamps',()=>{
 const old={...game(),lastPlayed:'2026-10-26T11:24:30.000Z'};
 const good={totalAchievements:2,currentAchievements:1};
 assert.equal(detailCacheDecision(old,good,'2026-10-26T11:24:30.0000000Z',false),'reused');
 assert.equal(detailCacheDecision(old,{...good,currentGamerscore:10},'2026-10-26T11:24:30Z',false),'reused');
 assert.equal(detailCacheDecision(old,{...good,currentGamerscore:20},old.lastPlayed,false),'scoreChanged');
 assert.equal(detailCacheDecision(old,{...good,currentAchievements:2},old.lastPlayed,false),'earnedChanged');
 assert.equal(detailCacheDecision(old,{...good,totalAchievements:3},old.lastPlayed,false),'totalChanged');
 assert.equal(detailCacheDecision(old,good,'2026-11-01T11:24:30Z',false),'playedAgain');
 assert.equal(detailCacheDecision(old,good,old.lastPlayed,true),'dailyRefresh');
 assert.equal(detailCacheDecision(undefined,good,old.lastPlayed,false),'newGame');
 assert.equal(detailCacheDecision({...old,achievements:[award('1',true)]},good,old.lastPlayed,false),'incompleteCache');
 assert.equal(detailCacheDecision(old,{...good,currentAchievements:undefined},old.lastPlayed,false),'missingSummary');
 assert.equal(detailCacheDecision(old,{...good,totalAchievements:undefined},old.lastPlayed,false),'missingSummary');
 assert.equal(detailCacheDecision(old,good,null,false),'playedAgain');
});
test('daily catalog sweep is scheduled only once during its UTC hour',()=>{
 assert.equal(refreshCatalogToday('2026-10-31T01:30:00Z','2026-11-01T02:00:00Z'),true);
 assert.equal(refreshCatalogToday('2026-11-01T02:05:00Z','2026-11-01T02:35:00Z'),false);
 assert.equal(refreshCatalogToday('2026-10-31T02:00:00Z','2026-11-01T02:00:00Z'),true);
 assert.equal(refreshCatalogToday('2026-11-01T01:55:00Z','2026-11-01T03:05:00Z'),false);
 assert.equal(shouldReadPlaytime('2026-09-01T00:00:00Z',42,'2026-11-01T01:30:00Z'),false);
 assert.equal(shouldReadPlaytime('2026-10-31T00:00:00Z',42,'2026-11-01T01:30:00Z'),true);
 assert.equal(shouldReadPlaytime(null,null,'2026-11-01T01:30:00Z'),true);
});
