import test from 'node:test';
import assert from 'node:assert/strict';
import type {Game,RecordData} from '../src/data.ts';
import {buildActivity} from '../src/achievement-activity.ts';
import {monthlyPlayedGames} from '../src/monthly-played.ts';
import {overallAchievementPercent} from '../src/overall-achievement-progress.ts';

function game(id:string,name=id):Game{return {id,name,image:'',devices:[],lastPlayed:null,minutes:0,earned:0,total:0,score:0,maxScore:0};}
function snap(at:string,games:Game[]):RecordData{return {id:at,at,source:'Xbox',profile:{xuid:'12345',gamertag:'tester',avatar:''},warnings:[],games};}

test('Recent gallery progress uses all achievements, not base-only completion',()=>{
 const g=game('1');
 g.earned=2;g.total=4;
 g.groupStatus='verified';
 g.groups=[{id:'base',name:'base',kind:'base',achievementIds:['a','b'],earned:2,total:2},
  {id:'dlc',name:'dlc',kind:'dlc',achievementIds:['c','d'],earned:0,total:2}];
 assert.equal(overallAchievementPercent(g),50);
 assert.equal(overallAchievementPercent({...g,earned:3}),75);
 assert.equal(overallAchievementPercent({...g,total:0}),null);
 assert.equal(overallAchievementPercent({...g,earned:5}),100);
});

test('Monthly played is union of current/history lastPlayed plus earned unlock timestamps',()=>{
 const a=game('a','Alpha'),b=game('b','Bravo'),c=game('c','Charlie');
 a.lastPlayed='2026-11-01T00:10:00Z';
 b.achievements=[{id:'1',name:'Award',image:'',unlocked:true,unlockedAt:'2026-10-03T18:00:00Z',rarity:4}];
 const oldA={...a,lastPlayed:'2026-09-16T04:00:00Z'};
 const oldC={...c,lastPlayed:'2026-10-24T11:00:00Z'};
 const records=[snap('2026-10-25T00:00:00Z',[oldA,oldC])];
 const activity=buildActivity([a,b,c],new Date('2026-11-01T15:00:00Z'));
 const months=monthlyPlayedGames([a,b,c],records,activity);
 assert.deepEqual(months.get('2026-11')?.map(g=>g.id),['a']);
 assert.deepEqual(months.get('2026-10')?.map(g=>g.id),['c','b']);
 assert.deepEqual(months.get('2026-09')?.map(g=>g.id),['a']);
 assert.equal(months.get('2026-08'),undefined);
});

test('Beijing midnight conversion and hidden/unknown games do not leak into month lists',()=>{
 const a=game('1'),hidden=game('hidden'),future=game('future');
 a.lastPlayed='2026-10-31T17:30:00Z'; // November 1 in Beijing
 hidden.lastPlayed='2026-10-31T17:30:00Z';
 future.lastPlayed='2027-11-01T00:00:00Z';
 const activity=buildActivity([a],new Date('2026-11-01T16:00:00Z'));
 const months=monthlyPlayedGames([a],[
  snap('2026-11-01T15:00:00Z',[hidden,future]),
  snap('2026-11-01T15:30:00Z',[{...a,lastPlayed:'2026-10-30T18:30:00Z'}])
 ],activity);
 assert.deepEqual(months.get('2026-11')?.map(g=>g.id),['1']);
 assert.deepEqual(months.get('2026-10')?.map(g=>g.id),['1']);
 assert.ok(![...months.values()].flat().some(g=>g.id==='hidden'));
 assert.equal(months.get('2027-11'),undefined);
});

test('Months without date evidence do not invent activity from cumulative minutes',()=>{
 const g=game('1');g.minutes=9000;g.earned=20;g.total=100;
 const activity=buildActivity([g],new Date('2026-11-01T15:00:00Z'));
 assert.equal(monthlyPlayedGames([g],[],activity).size,0);
});
