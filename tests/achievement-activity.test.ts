import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActivity,adjacentDay,calendarHalf,calendarMonth,dayLabel,heatLevel,recentCalendar,recentDays,shanghaiDay} from '../src/achievement-activity.ts';
import type {Game} from '../src/data.ts';

function fixture(id:string,dates:(string|null)[]):Game{
 return {id,name:'Game '+id,image:'',devices:[],lastPlayed:null,minutes:null,earned:dates.length,total:dates.length,score:100,maxScore:100,achievements:dates.map((unlockedAt,i)=>({id:String(i),name:'Achievement '+i,image:'',unlockedAt,rarity:2.5,unlocked:true,points:10}))};
}
test('Beijing date grouping handles midnight UTC boundary and chronological unlocks',()=>{
 const a=fixture('1',['2026-10-28T16:05:00Z','2026-10-29T07:30:00Z','2026-10-28T15:50:00Z']);
 const b=fixture('2',['2026-10-29T02:00:00Z']);
 const activity=buildActivity([a,b],new Date('2026-11-01T12:00:00Z'));
 assert.equal(shanghaiDay('2026-10-28T16:05:00Z'),'2026-10-29');
 assert.equal(dayLabel('2026-10-29'),'2026 年 10 月 29 日');
 const today=activity.byDay.get('2026-10-29');
 assert.equal(today?.events.length,3);
 assert.deepEqual(today?.events.map(e=>e.achievement.id),['0','0','1']);
 assert.deepEqual(today?.games.map(g=>[g.game.id,g.count]),[['1',2],['2',1]]);
 assert.equal(activity.byDay.get('2026-10-28')?.events.length,1);
 assert.equal(activity.total,4);
 assert.equal(activity.activeDays,2);
 assert.equal(activity.longestStreak,2);
 assert.equal(activity.peak,3);
 assert.equal(activity.years.get(2026),4);
});
test('Missing timestamps, locked and out-of-range events are excluded without inventing dates',()=>{
 const a=fixture('1',['2021-12-31T12:59:59Z','2022-01-01T00:00:00Z',null,'2027-01-01T00:00:00Z']);
 a.achievements![2].unlocked=true;
 a.achievements![1].unlocked=false;
 const result=buildActivity([a],new Date('2026-11-01T00:00:00Z'));
 assert.equal(result.total,0);
 assert.equal(result.activeDays,0);
 assert.equal(result.peak,0);
 assert.equal(result.longestStreak,0);
});
test('30-day preview uses calendar days, not 30 most active days',()=>{
 const result=buildActivity([fixture('1',['2026-10-31T09:00:00Z'])],new Date('2026-11-01T12:00:00Z'));
 const days=recentDays(result);
 assert.equal(days.length,30);
 assert.equal(days[0].day,'2026-10-03');
 assert.equal(days.at(-1)?.day,'2026-11-01');
 assert.equal(days.at(-2)?.count,1);
 assert.equal(days[0].count,0);
});
test('Half-year grid maps every local calendar date once, aligned Monday to Sunday',()=>{
 for(const year of [2022,2024,2026])for(const half of [0,1] as const){
  const c=calendarHalf(year,half,'2026-11-01');
  assert.ok(c.columns===26||c.columns===27);
  assert.equal(c.days.length,c.columns*7);
  assert.equal(new Set(c.days.filter(d=>d.day).map(d=>d.day)).size,c.days.filter(d=>d.day).length);
  assert.equal(c.days[0].weekday,0);
  assert.equal(c.months.length,6);
 }
 const c=calendarHalf(2026,1,'2026-11-01');
 assert.equal(c.days.find(d=>d.day==='2026-10-29')?.weekday,3);
 assert.equal(c.days.find(d=>d.day==='2026-11-02')?.future,true);
});
test('Five intensities mirror approved heatmap legend',()=>{
 assert.deepEqual([0,1,2,3,4,7,8,30].map(heatLevel),[0,1,2,2,3,3,4,4]);
});

test('Monthly calendar shows 7 touch-friendly day columns with correct weekday alignment',()=>{
 const oct=calendarMonth(2026,10,'2026-11-01');
 assert.equal(oct.rows,5);
 assert.equal(oct.days[0].day,null);
 assert.equal(oct.days.find(x=>x.day==='2026-10-29')?.weekday,3);
 assert.equal(oct.days.filter(x=>x.day).length,31);
 assert.equal(oct.days.find(x=>x.day==='2026-10-31')?.future,false);
 const nov=calendarMonth(2026,11,'2026-11-01');
 assert.equal(nov.rows,6);
 assert.equal(nov.days.find(x=>x.day==='2026-11-01')?.weekday,6);
 assert.equal(nov.days.find(x=>x.day==='2026-11-02')?.future,true);
});
test('Overview calendar runs oldest to newest left to right within each Monday–Sunday week',()=>{
 const a=buildActivity([],new Date('2026-11-01T12:00:00Z'));
 const preview=recentCalendar(a);
 assert.equal(preview.length,35);
 assert.equal(preview[0].day,null);
 assert.equal(preview[5].day,'2026-10-03');
 assert.equal(preview.at(-1)?.day,'2026-11-01');
});
test('Adjacent date navigation spans year and leap-day boundaries',()=>{
 assert.equal(adjacentDay('2026-01-01',-1),'2025-12-31');
 assert.equal(adjacentDay('2024-02-28',1),'2024-02-29');
 assert.equal(adjacentDay('2024-02-29',1),'2024-03-01');
});
