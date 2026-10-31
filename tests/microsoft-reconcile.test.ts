import {test} from 'node:test';import assert from 'node:assert/strict';
import {reconcileMicrosoft} from '../scripts/microsoft-reconcile.ts';
import type {RecordData} from '../src/data.ts';
const config={clientId:'11111111-1111-1111-1111-111111111111',refreshToken:'PRIVATE-REFRESH'},owner='2530000000000000';
function fixtures(){
 const record:RecordData={id:'s',at:'2026-10-30T00:00:00Z',source:'Xbox',profile:{xuid:owner,gamertag:'PRIVATE-PLAYER',avatar:''},warnings:[],games:[{id:'1',name:'中文名称',image:'',devices:['XboxOne'],minutes:1,lastPlayed:null,earned:1,total:2,score:10,maxScore:20,groupStatus:'verified',groups:[{id:'xbox-base',kind:'base',name:'本体',achievementIds:['1'],earned:1,total:1},{id:'xbox-addons',kind:'dlc',name:'追加内容',achievementIds:['2'],earned:0,total:1}],achievements:[{id:'1',name:'中文成就一',image:'',unlocked:true,unlockedAt:'2026-10-29T00:00:00Z',rarity:1,points:10},{id:'2',name:'中文成就二',image:'',unlocked:false,unlockedAt:null,rarity:2,points:10}]}]};
 const baseline=structuredClone(record);baseline.games[0].name='English Game';baseline.games[0].id='exophase';baseline.games[0].achievements![0].name='English Award One';baseline.games[0].achievements![1].name='English Award Two';
 const catalog:any={catalogs:[{name:'English Game',total:2,data:{achievements:[{...baseline.games[0].achievements![0],id:'91'},{...baseline.games[0].achievements![1],id:'92'}],groups:[{id:'base',name:'Base',kind:'base',achievementIds:['91']},{id:'pack',name:'Named DLC',kind:'dlc',achievementIds:['92']}]}}]};
 return {record,baseline,catalog};
}
function requestCounter(mismatch=false){let metadata=0;const request:typeof fetch=async(input,init)=>{
 const u=new URL(String(input));if(u.pathname.includes('/history/titles'))return Response.json({titles:[]});if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'PRIVATE-ACCESS'});if(u.hostname==='user.auth.xboxlive.com')return Response.json({Token:'u'});if(u.hostname==='xsts.auth.xboxlive.com')return Response.json({Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}});if(u.hostname==='profile.xboxlive.com')return Response.json({profileUsers:[{id:owner,settings:[]}]});
 assert.equal((init?.headers as any)['Accept-Language'],'en-US');if(u.hostname==='titlehub.xboxlive.com')return Response.json({titles:[{titleId:'1',name:'English Game'}]});
 metadata++;return Response.json({achievements:[{id:'1',name:'English Award One'},...(!mismatch?[{id:'2',name:'English Award Two'}]:[])]});
 };return {request,count:()=>metadata};}
test('English metadata reconciles unlock dates and named DLC without changing display names; metadata is reused',async()=>{
 const {record,baseline,catalog}=fixtures(),mock=requestCounter(),candidate={record,audit:{}};
 const first=await reconcileMicrosoft(config,candidate,baseline,catalog,{expectedOwner:owner,request:mock.request,pause:async()=>{}});
 assert.equal(first.audit.comparison.matchedAchievementDates,1);assert.equal(first.audit.comparison.achievementDateDifferences,0);assert.equal(first.audit.catalogGroups,1);assert.equal(first.record.games[0].groups?.[1].name,'Named DLC');assert.equal(first.record.games[0].achievements?.[0].name,'中文成就一');assert.ok(!JSON.stringify(first.audit).includes('PRIVATE'));
 const second=await reconcileMicrosoft(config,first,baseline,catalog,{expectedOwner:owner,request:mock.request,pause:async()=>{}});assert.equal(mock.count(),1);assert.equal(second.audit.reconciliation.reused,1);
});
test('incomplete English metadata cannot remap a group or silently count date comparisons',async()=>{
 const {record,baseline,catalog}=fixtures(),mock=requestCounter(true);
 const result=await reconcileMicrosoft(config,{record,audit:{}},baseline,catalog,{expectedOwner:owner,request:mock.request,pause:async()=>{}});
 assert.equal(result.audit.reconciliation.metadataFailures,1);assert.equal(result.audit.comparison.matchedAchievementDates,0);assert.equal(result.record.games[0].groups?.[1].id,'xbox-addons');
});
