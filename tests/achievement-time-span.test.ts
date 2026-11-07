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
 latest:{[id]:{at:'2026-11-07T12:00:00.000Z',minutes:100}},
 days,crossDay:{},corrections:{}
});

test('New games use the first recorded play day and the last unlocked achievement day',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:false,unlockedAt:'2027-01-01T00:00:00Z'},
  {unlocked:true,unlockedAt:'2026-11-03T07:12:00Z'},
  {unlocked:true,unlockedAt:'2026-11-02T00:00:00Z'},
  {unlocked:false,unlockedAt:'2020-01-01T00:00:00Z'}
 ]),ledger({'2026-11-01':{'42':18},'2026-11-02':{'42':12}}));
 assert.deepEqual(span,{
  firstPlayedDate:'2026-11-01',
  firstUnlockedAt:'2026-11-02T00:00:00.000Z',
  lastUnlockedAt:'2026-11-03T07:12:00.000Z',
  basis:'first-play',
  days:2
 });
 assert.equal(formatAchievementTimeSpan(span),'2天');
});

test('New game with a single unlock still counts days from the first play',()=>{
 const span=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-07T07:12:00Z'}]),
  ledger({'2026-11-05':{'42':35},'2026-11-06':{'42':20}}));
 assert.equal(span?.basis,'first-play');
 assert.equal(formatAchievementTimeSpan(span),'2天');
});

test('New game played and unlocked on the same Shanghai calendar day has zero-day span',()=>{
 const span=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-05T15:12:00Z'}]),
  ledger({'2026-11-05':{'42':35}}));
 assert.equal(span?.basis,'first-play');
 assert.equal(formatAchievementTimeSpan(span),'0天');
});

test('Old game without recorded play preserves exact first-to-last unlock interval',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2025-04-05T12:00:00Z'},
  {unlocked:true,unlockedAt:'2025-04-03T00:00:00Z'}
 ]),null);
 assert.deepEqual(span,{
  firstPlayedDate:null,
  firstUnlockedAt:'2025-04-03T00:00:00.000Z',
  lastUnlockedAt:'2025-04-05T12:00:00.000Z',
  basis:'first-unlock',
  days:2.5
 });
 assert.equal(formatAchievementTimeSpan(span),'2.5天');
});

test('Old game replayed after tracking started does not treat replay as its first play',()=>{
 const span=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2024-01-01T00:00:00Z'},
  {unlocked:true,unlockedAt:'2026-11-07T12:00:00Z'}
 ]),ledger({'2026-11-05':{'42':60}}));
 assert.equal(span?.basis,'first-unlock');
 assert.equal(span?.firstPlayedDate,null);
 assert.equal(span?.days,(Date.parse('2026-11-07T12:00:00Z')-Date.parse('2024-01-01T00:00:00Z'))/86400000);
});

test('Old games with one unlock preserve 0.0 days, with or without replay evidence',()=>{
 const one=game([{unlocked:true,unlockedAt:'2025-01-01T00:00:00Z'}]);
 assert.equal(formatAchievementTimeSpan(achievementTimeSpan(one,ledger({}))), '0.0天');
 assert.equal(formatAchievementTimeSpan(achievementTimeSpan(one,ledger({'2026-11-05':{'42':5}}))), '0.0天');
});

test('Only games without valid unlocked achievement timestamps have unavailable spans',()=>{
 const locked=game([{unlocked:false,unlockedAt:'2026-11-03T07:12:00Z'}]);
 const invalid=game([{unlocked:true,unlockedAt:'invalid'}]);
 assert.equal(achievementTimeSpan(locked,ledger({'2026-11-01':{'42':18}})),null);
 assert.equal(achievementTimeSpan(invalid,ledger({'2026-11-01':{'42':18}})),null);
 assert.equal(formatAchievementTimeSpan(null),'暂无数据');
});

test('Span sorting handles both new and legacy games; absent timestamps sort last',()=>{
 const fresh=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-03T12:00:00Z'}]),
  ledger({'2026-11-01':{'42':1}})); // 2 calendar days
 const old=achievementTimeSpan(game([
  {unlocked:true,unlockedAt:'2025-01-01T00:00:00Z'},
  {unlocked:true,unlockedAt:'2025-01-02T12:00:00Z'}
 ]),null); // 1.5 days
 const short=achievementTimeSpan(game([{unlocked:true,unlockedAt:'2026-11-01T12:00:00Z'}]),
  ledger({'2026-11-01':{'42':1}})); // 0 days
 const values=[null,short,old,fresh];
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'longest')),[fresh,old,short,null]);
 assert.deepEqual([...values].sort((x,y)=>compareAchievementTimeSpans(x,y,'shortest')),[short,old,fresh,null]);
 assert.equal(compareAchievementTimeSpans(null,null,'longest'),0);
});
