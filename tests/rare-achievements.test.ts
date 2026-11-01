import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rareAchievementTop,achievementRarityTier} from '../src/rare-achievements.ts';
import type {Achievement,Game} from '../src/data.ts';

const sampleGame=(id:string,name=id):Game=>({id,name,image:'',devices:[],lastPlayed:null,minutes:0,earned:1,total:1,score:10,maxScore:10});
const award=(id:string,rarity:number|null,unlocked=true,unlockedAt:string|null=null):Achievement=>({
 id,name:'Achievement '+id,image:'',unlocked,unlockedAt,rarity,points:10
});

test('rare showcase selects only earned achievements with valid global rarity',()=>{
 const a=sampleGame('1'),b=sampleGame('2');
 a.achievements=[award('zero',0,true,'2026-10-30T08:00:00Z'),award('locked',0.01,false),award('missing',null),award('invalid',101),award('negative',-1)];
 b.achievements=[award('other',0.3),award('tie',0)];
 const top=rareAchievementTop([a,b]);
 assert.deepEqual(top.map(x=>x.key),['1:zero','2:tie','2:other']);
 assert.equal(top[0].achievement.rarity,0,'Zero-percent rarity must be eligible');
 assert.equal(top[1].time,null,'Missing unlock time cannot exclude a genuinely unlocked achievement');
});
test('cross-title sorting uses rarity ascending, then latest unlock, then stable game/achievement identity',()=>{
 const first=sampleGame('100','A'),second=sampleGame('101','B');
 first.achievements=[award('1',0.5,true,'2026-10-01T00:00:00Z'),award('2',0.1,true,'2026-10-05T00:00:00Z')];
 second.achievements=[award('1',0.1,true,'2026-10-08T00:00:00Z'),award('2',0.1,true,null)];
 assert.deepEqual(rareAchievementTop([first,second]).map(x=>x.key),['101:1','100:2','101:2','100:1']);
 assert.deepEqual(rareAchievementTop([second,first]).map(x=>x.key),['101:1','100:2','101:2','100:1']);
});
test('the showcase caps at 50 entries and uses game+achievement composite keys',()=>{
 const games=Array.from({length:6},(_,i)=>{
  const g=sampleGame(String(i+1));
  g.achievements=Array.from({length:13},(_,j)=>award(String(j),((i*13)+j)/10));
  return g;
 });
 const items=rareAchievementTop(games);
 assert.equal(items.length,50);
 assert.equal(new Set(items.map(item=>item.key)).size,50);
 assert.ok(items.every((item,i)=>i===0||item.achievement.rarity!>=items[i-1].achievement.rarity!));
 assert.equal(rareAchievementTop(games,0).length,0);
 assert.deepEqual(rareAchievementTop([]),[]);
});

test('Xbox rarity frame tiers follow strict 10% and 1% thresholds',()=>{
 for(const [percentage,tier] of [
  [0,'ultra'],[0.99,'ultra'],[1,'rare'],[9.99,'rare'],
  [10,'common'],[100,'common'],[null,'common'],[-1,'common'],[101,'common'],[NaN,'common']
 ] as const)assert.equal(achievementRarityTier(percentage),tier);
});
