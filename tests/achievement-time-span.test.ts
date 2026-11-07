import test from 'node:test';
import assert from 'node:assert/strict';
import {achievementTimeSpan,compareAchievementTimeSpans,formatAchievementTimeSpan} from '../src/achievement-time-span.ts';
import type {Game} from '../src/data.ts';
import type {DailyPlaytimeLedger} from '../src/playtime-ledger.ts';

const game=(entries:Array<{unlocked:boolean;unlockedAt:string|null}>,id='42'):Pick<Game,'id'|'achievements'>=>({
 id,achievements:entries.map((a,i)=>({id:String(i),name:'A'+i,image:'',rarity:null,...a}))
});
const ledger=(days:Record<string,Record<string,number>>,id='42'):DailyPlaytimeLedger=>({
 version:1,timeZone:'Asia/Shanghai',since:'2026-11-01',
 latest:{[id]:{at:'2026-11-04T12:00:00.000Z',minutes:100}},
 days,crossDay:{},corrections:{}
});

test('Span runs from the first positive-play day to the last unlocked achievement day',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:false,unlockedAt:'2027-01-01T00:00:00Z'},
  {unlocked:true,unlockedAt:'2026-11-03T07:12:00Z'},
  {unlocked:true,unlockedAt:'2026-11-02T00:00:00Z'},
  {unlocked:false,unlockedAt:'2020-01-01T00:00:00Z'}
 ]),ledger({
  '2026-11-01':{'42':18},
  '2026-11-02':{'42':12}
 }));
 assert.deepEqual(span,{
  firstPlayedDate:'2026-11-01',
  lastUnlockedAt:'2026-11-03T07:12:00.000Z',
  days:2
 });
 assert.equal(formatAchievementTimeSpan(span),'2天');
});

test('A single unlocked achievement can still have a multi-day span from first play',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2026-11-07T07:12:00Z'}
 ]),ledger({'2026-11-05':{'42':35},'2026-11-06':{'42':20}}));
 assert.equal(formatAchievementTimeSpan(span),'2天');
});

test('Same-calendar-day play and final unlock correctly produce zero days',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2026-11-05T15:12:00Z'}
 ]),ledger({'2026-11-05':{'42':35}}));
 assert.equal(formatAchievementTimeSpan(span),'0天');
});

test('Missing daily play records, locked-only achievements and invalid dates do not fabricate a span',()=>{
 const locked=game([{unlocked:false,unlockedAt:'2026-11-03T07:12:00Z'}]);
 const invalid=game([{unlocked:true,unlockedAt:'invalid'}]);
 assert.equal(achievementTimeSpan(locked,ledger({'2026-11-01':{'42':18}})),null);
 assert.equal(achievementTimeSpan(invalid,ledger({'2026-11-01':{'42':18}})),null);
 assert.equal(achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-03T07:12:00Z'}]),null),null);
 assert.equal(achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-03T07:12:00Z'}]),ledger({})),null);
 assert.equal(formatAchievementTimeSpan(null),'暂无数据');
});

test('An achievement timestamp earlier than the first recorded play is rejected',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2026-11-01T15:12:00Z'}
 ]),ledger({'2026-11-02':{'42':18}}));
 assert.equal(span,null);
});

test('Sort supports longest and shortest first and consistently places missing data last',()=>{
 const a=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-01T12:00:00Z'}]),ledger({'2026-11-01':{'42':1}}));
 const b=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-03T12:00:00Z'}]),ledger({'2026-11-01':{'42':1}}));
 const c=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-02T12:00:00Z'}]),ledger({'2026-11-01':{'42':1}}));
 const values=[null,a,b,c];
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'longest')),[b,c,a,null]);
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'shortest')),[a,c,b,null]);
 assert.equal(compareAchievementTimeSpans(null,null,'longest'),0);
});
