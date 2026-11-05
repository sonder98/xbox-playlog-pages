import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Achievement,Game} from '../src/data.ts';
import {buildGameJourney,journeyCalendarDays} from '../src/game-journey.ts';

const award=(id:string,unlockedAt:string|null,rarity:number|null=null,unlocked=true):Achievement=>({
 id,name:'Achievement '+id,description:'Demo achievement',image:'',
 rarity,unlocked,unlockedAt
});
const game=(achievements:Achievement[],overrides:Partial<Game>={}):Game=>({
 id:'101',name:'Journey Test',image:'',devices:['Xbox'],lastPlayed:null,
 minutes:120,earned:achievements.filter(x=>x.unlocked).length,total:achievements.length,
 score:0,maxScore:0,achievements,...overrides
});

test('night moments group unlocks by Beijing calendar day and use 00:00–08:59',()=>{
 const source=game([
  award('a','2026-04-11T15:59:00Z'), // 23:59, previous day
  award('b','2026-04-11T16:00:00Z'), // 00:00, new day
  award('c','2026-04-11T18:03:00Z'), // 02:03
  award('d','2026-04-12T00:59:00Z'), // 08:59
  award('e','2026-04-12T01:00:00Z') // 09:00 excluded
 ]);
 const result=buildGameJourney(source);
 assert.equal(result.highlights[0].kind,'night');
 assert.equal(result.highlights[0].day,'2026-04-12');
 assert.equal(result.highlights[0].count,3);
 assert.equal(result.months[0].days[0].nightCount,3);
 assert.deepEqual(result.months[0].days[0].events.map(x=>x.clock),['00:00','02:03','08:59','09:00']);
 assert.deepEqual(result.months[0].days.map(x=>x.day),['2026-04-12','2026-04-11']);
 assert.equal(result.unlockDays,2);
});

test('without night unlocks the hero switches to a meaningful burst day',()=>{
 const result=buildGameJourney(game([
  award('1','2026-03-01T02:00:00Z'),
  award('2','2026-03-01T03:00:00Z'),
  award('3','2026-03-01T04:00:00Z'),
  award('4','2026-03-02T03:00:00Z')
 ]));
 assert.equal(result.highlights[0].kind,'burst');
 assert.equal(result.highlights[0].day,'2026-03-01');
 assert.equal(result.highlights[0].count,3);
 assert.equal(result.highlights[0].headline,'单日解锁 3 项成就');
});

test('a rare achievement becomes the hero when no night or burst exists',()=>{
 const result=buildGameJourney(game([
  award('1','2026-03-01T09:00:00Z',7),
  award('2','2026-03-02T10:00:00Z',.8),
  award('3','2026-03-03T10:00:00Z',33)
 ]));
 assert.equal(result.highlights[0].kind,'rare');
 assert.equal(result.highlights[0].day,'2026-03-02');
 assert.equal(result.highlights[0].headline,'稀有度 0.8%');
 assert.equal(result.highlights[0].description,'Achievement 2');
});

test('verified full and mythic dates form milestones with real elapsed calendar days',()=>{
 const source=game([
  award('1','2026-03-01T02:00:00Z'),
  award('2','2026-03-06T02:00:00Z'),
  award('3','2026-03-18T02:00:00Z'),
  award('4','2026-04-01T02:00:00Z')
 ],{
  groupStatus:'verified',
  groups:[{id:'base',name:'BaseGame',kind:'base',achievementIds:['1','2'],earned:2,total:2},
   {id:'dlc',name:'DLC',kind:'dlc',achievementIds:['3','4'],earned:2,total:2}]
 });
 const result=buildGameJourney(source);
 assert.deepEqual(result.milestones.map(x=>x.id),[
  'first','progress-25%','progress-50%','mythic','progress-75%','full'
 ]);
 const mythic=result.milestones.find(x=>x.id==='mythic')!;
 const full=result.milestones.find(x=>x.id==='full')!;
 assert.equal(mythic.day,'2026-03-06');
 assert.equal(full.day,'2026-04-01');
 assert.equal(result.firstToFullDays,31);
 assert.equal(result.mythicToFullDays,26);
 assert.equal(result.highlights[0].kind,'full');
 assert.equal(result.highlights[0].day,'2026-04-01');
 assert.ok(result.highlights.some(x=>x.kind==='mythic'));
});

test('missing unlock times never create guessed thresholds or completion dates',()=>{
 const result=buildGameJourney(game([
  award('1','2026-03-01T02:00:00Z'),
  award('2',null),
  award('3',null,false),
  award('4',null,false)
 ]));
 assert.equal(result.datedUnlocks,1);
 assert.equal(result.missingUnlockTimes,1);
 assert.deepEqual(result.milestones.map(x=>x.id),['first']);
 assert.equal(result.highlights[0].kind,'first');
 assert.equal(result.firstToFullDays,null);
 assert.equal(result.mythicToFullDays,null);
});

test('no timestamped achievements yields no highlights, milestones, or dated activity',()=>{
 const result=buildGameJourney(game([award('1',null),award('2',null,false)]));
 assert.deepEqual(result.highlights,[]);
 assert.deepEqual(result.milestones,[]);
 assert.deepEqual(result.months,[]);
 assert.equal(result.unlockDays,0);
 assert.equal(result.missingUnlockTimes,1);
});

test('even a single fully completed achievement cannot fabricate first-play information',()=>{
 const result=buildGameJourney(game([award('1','2026-03-05T11:00:00Z')]));
 assert.equal(result.firstUnlockDay,'2026-03-05');
 assert.equal(result.firstToFullDays,0);
 assert.deepEqual(result.highlights.map(x=>x.kind),['full']);
 assert.ok(result.milestones.some(x=>x.id==='full'));
});

test('calendar day difference uses Beijing dates, not rounded elapsed hours',()=>{
 assert.equal(journeyCalendarDays(
  Date.parse('2026-03-01T15:59:00Z'),Date.parse('2026-03-01T16:02:00Z')),1);
 assert.equal(journeyCalendarDays(
  Date.parse('2026-03-01T16:02:00Z'),Date.parse('2026-03-01T19:59:00Z')),0);
});
