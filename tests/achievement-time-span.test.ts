import test from 'node:test';
import assert from 'node:assert/strict';
import {achievementTimeSpan,compareAchievementTimeSpans,formatAchievementTimeSpan} from '../src/achievement-time-span.ts';
import type {Game} from '../src/data.ts';

const game=(entries:Array<{unlocked:boolean;unlockedAt:string|null}>):Pick<Game,'achievements'>=>({
 achievements:entries.map((a,i)=>({id:String(i),name:'A'+i,image:'',rarity:null,...a}))
});

test('Elapsed first-to-last unlock span includes fractional days and ignores source order and locked achievements',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:false,unlockedAt:'2027-01-01T00:00:00Z'},
  {unlocked:true,unlockedAt:'2026-10-29T07:12:00Z'},
  {unlocked:true,unlockedAt:'2026-10-28T00:00:00Z'},
  {unlocked:true,unlockedAt:'2026-10-28T12:30:00Z'},
  {unlocked:false,unlockedAt:'2020-01-01T00:00:00Z'}
 ]));
 assert.deepEqual(span,{
  firstUnlockedAt:'2026-10-28T00:00:00.000Z',
  lastUnlockedAt:'2026-10-29T07:12:00.000Z',
  days:1.3
 });
 assert.equal(formatAchievementTimeSpan(span),'1.3天');
});

test('One achievement is 0.0 days and neither total completion nor lastPlayed is used',()=>{
 assert.equal(formatAchievementTimeSpan(achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-10-28T12:00:00Z'}]))),'0.0天');
 assert.equal(formatAchievementTimeSpan(achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2026-10-28T12:00:00Z'},
  {unlocked:false,unlockedAt:'2026-12-01T12:00:00Z'}
 ]))),'0.0天');
});

test('Unrecorded/invalid dates do not fabricate time span',()=>{
 assert.equal(achievementTimeSpan(game([{unlocked:false,unlockedAt:'2026-10-28T12:00:00Z'}])),null);
 assert.equal(achievementTimeSpan(game([{unlocked:true,unlockedAt:null},{unlocked:true,unlockedAt:'invalid'}])),null);
 assert.equal(achievementTimeSpan({}),null);
 assert.equal(formatAchievementTimeSpan(null),'暂无数据');
});

test('Sort supports longest and shortest first and consistently places missing data last',()=>{
 const a=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-10-28T00:00:00Z'}]));
 const b=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-10-28T00:00:00Z'},{unlocked:true,unlockedAt:'2026-10-30T00:00:00Z'}]));
 const c=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-10-28T00:00:00Z'},{unlocked:true,unlockedAt:'2026-10-29T00:00:00Z'}]));
 const values=[null,a,b,c];
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'longest')),[b,c,a,null]);
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'shortest')),[a,c,b,null]);
 assert.equal(compareAchievementTimeSpans(null,null,'longest'),0);
});
