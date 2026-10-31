import type {Achievement,Game} from './data.ts';

export type UnlockEvent={key:string;game:Game;achievement:Achievement;time:number;day:string};
export type DayBucket={day:string;events:UnlockEvent[];games:{game:Game;count:number}[]};
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export function shanghaiDay(value:string|number|Date):string{
 const d=new Date(value);
 const parts=Object.fromEntries(clock.formatToParts(d).map(x=>[x.type,x.value]));
 return [parts.year,parts.month,parts.day].join('-');
}
export function dayLabel(value:string):string{
 const [y,m,d]=value.split('-').map(Number);
 return y+' 年 '+m+' 月 '+d+' 日';
}
export function buildActivity(games:Game[],now=new Date()){
 const today=shanghaiDay(now);
 const byDay=new Map<string,DayBucket>();
 for(const game of games)for(const achievement of game.achievements||[]){
  if(!achievement.unlocked||!achievement.unlockedAt)continue;
  const time=Date.parse(achievement.unlockedAt);
  if(!Number.isFinite(time))continue;
  const day=shanghaiDay(time);
  if(day<'2022-01-01'||day>today)continue;
  let bucket=byDay.get(day);
  if(!bucket){bucket={day,events:[],games:[]};byDay.set(day,bucket);}
  bucket.events.push({key:game.id+':'+achievement.id,game,achievement,time,day});
 }
 const years=new Map<number,number>();
 let total=0,peak=0,longestStreak=0,streak=0;
 let previousDay:number|null=null;
 for(const day of [...byDay.keys()].sort()){
  const bucket=byDay.get(day)!;
  bucket.events.sort((a,b)=>a.time-b.time||a.key.localeCompare(b.key));
  const counts=new Map<string,{game:Game;count:number}>();
  for(const event of bucket.events){
   const previous=counts.get(event.game.id);
   if(previous)previous.count++;
   else counts.set(event.game.id,{game:event.game,count:1});
  }
  bucket.games=[...counts.values()].sort((a,b)=>b.count-a.count||a.game.name.localeCompare(b.game.name));
  const num=bucket.events.length;
  total+=num;peak=Math.max(peak,num);
  const year=Number(day.slice(0,4));years.set(year,(years.get(year)||0)+num);
  const epoch=Date.parse(day+'T00:00:00Z');
  streak=previousDay!==null&&epoch-previousDay===86400000?streak+1:1;
  longestStreak=Math.max(longestStreak,streak);previousDay=epoch;
 }
 return {byDay,total,years,activeDays:byDay.size,longestStreak,peak,today};
}
export type Activity=ReturnType<typeof buildActivity>;
export function recentDays(activity:Activity,count=30){
 const end=Date.parse(activity.today+'T00:00:00Z');
 return Array.from({length:count},(_,i)=>{
  const day=new Date(end-(count-1-i)*86400000).toISOString().slice(0,10);
  return {day,count:activity.byDay.get(day)?.events.length||0};
 });
}
export function calendarHalf(year:number,half:0|1,today:string){
 const first=Date.UTC(year,half*6,1),end=Date.UTC(year,half*6+6,1);
 const monday=(new Date(first).getUTCDay()+6)%7;
 const aligned=first-monday*86400000;
 const columns=Math.ceil((end-aligned)/(7*86400000));
 const days=Array.from({length:columns*7},(_,i)=>{
  const date=new Date(aligned+i*86400000).toISOString().slice(0,10);
  const inside=aligned+i*86400000>=first&&aligned+i*86400000<end;
  return {day:inside?date:null,future:date>today,week:Math.floor(i/7),weekday:i%7};
 });
 const months=Array.from({length:6},(_,i)=>{
  const firstOfMonth=Date.UTC(year,half*6+i,1);
  return {label:String(half*6+i+1)+'月',column:Math.floor((firstOfMonth-aligned)/(7*86400000))};
 });
 return {columns,days,months};
}
export function heatLevel(count:number):number{
 return count===0?0:count===1?1:count<=3?2:count<=7?3:4;
}
