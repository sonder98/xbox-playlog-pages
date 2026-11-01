import {test} from 'node:test';
import assert from 'node:assert/strict';
import {longestAchievementGaps,formattedGapDays,MILLISECONDS_PER_DAY} from '../src/achievement-gaps.ts';
import type {Achievement,Game} from '../src/data.ts';

const makeGame=(id:string):Game=>({id,name:'Game '+id,image:'',devices:[],lastPlayed:null,minutes:0,earned:0,total:0,score:0,maxScore:0});
const award=(id:string,when:string|null,unlocked=true):Achievement=>({
 id,name:'Award '+id,image:'',unlocked,unlockedAt:when,rarity:4,points:10
});
const day=(n:number)=>new Date(Date.UTC(2026,0,n)).toISOString();

test('only same-game adjacent unlocks create gaps, not the oldest-to-newest span',()=>{
 const game=makeGame('a');
 game.achievements=[award('third',day(16)),award('first',day(1)),award('second',day(4)),award('locked',day(30),false),award('unknown',null)];
 const items=longestAchievementGaps([game]);
 assert.equal(items.length,2);
 assert.deepEqual(items.map(item=>[item.earlier.id,item.later.id,item.gapDays]),[
  ['second','third',12],['first','second',3]
 ]);
 assert.ok(items.every(item=>item.game.id==='a'));
});

test('global ranking merges game-specific pairs, sorts descending, and has stable tie-breaks',()=>{
 const g1=makeGame('1'),g2=makeGame('2');
 g1.achievements=[award('one',day(1)),award('two',day(3)),award('three',day(8))];
 g2.achievements=[award('one',day(1)),award('two',day(6))];
 const top=longestAchievementGaps([g2,g1]);
 assert.deepEqual(top.map(x=>x.key),['1:two:three','2:one:two','1:one:two']);
 assert.deepEqual(longestAchievementGaps([g1,g2]).map(x=>x.key),top.map(x=>x.key));
});

test('zero-time pairs and invalid timestamps are ineligible; missing games do not count',()=>{
 const g=makeGame('a');
 g.achievements=[award('z',day(1)),award('a',day(1)),award('bad','not-a-time'),award('last',day(2))];
 const top=longestAchievementGaps([g,makeGame('b')]);
 assert.equal(top.length,1);
 assert.equal(top[0].gapDays,1);
 assert.equal(top[0].earlier.id,'z','Tied earlier timestamps use deterministic achievement ID order');
 assert.equal(top[0].later.id,'last');
});

test('fractional gaps retain actual milliseconds and display one decimal day',()=>{
 const g=makeGame('1');
 const first=Date.parse('2026-10-01T12:00:00Z');
 const second=new Date(first+428.56*MILLISECONDS_PER_DAY).toISOString();
 g.achievements=[award('a',new Date(first).toISOString()),award('b',second)];
 const gap=longestAchievementGaps([g])[0];
 assert.ok(Math.abs(gap.gapDays-428.56)<0.00001);
 assert.equal(formattedGapDays(gap.gapDays),'428.6');
 assert.equal(formattedGapDays(0.04),'0.0');
});

test('TOP 100 limit uses unique composite identities',()=>{
 const games=Array.from({length:6},(_,i)=>{
  const g=makeGame(String(i));
  g.achievements=Array.from({length:20},(_,j)=>award('a'+j,day(j+1+i)));
  return g;
 });
 const items=longestAchievementGaps(games);
 assert.equal(items.length,100);
 assert.equal(new Set(items.map(i=>i.key)).size,50);
 assert.equal(longestAchievementGaps(games,50).length,50,'Custom shorter ranking remains supported');
 assert.deepEqual(longestAchievementGaps(games,0),[]);
});
