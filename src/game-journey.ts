import type {Achievement,Game} from './data.ts';
import {gameCompletionTimestamp} from './game-completion-date.ts';

export const GAME_JOURNEY_TIME_ZONE='Asia/Shanghai' as const;
export type JourneyEvent={achievement:Achievement;timestamp:number;day:string;clock:string;hour:number};
export type JourneyDay={day:string;month:string;events:JourneyEvent[];nightCount:number};
export type JourneyMonth={month:string;days:JourneyDay[];count:number};
export type JourneyMilestone={id:string;day:string;title:string;detail:string;sincePrevious:number|null;important:boolean};
export type JourneyHighlight={
 kind:'night'|'burst'|'rare'|'full'|'mythic'|'first';
 day:string;title:string;headline:string;description:string;count:number;
};
export type GameJourneyModel={
 months:JourneyMonth[];highlights:JourneyHighlight[];milestones:JourneyMilestone[];
 unlockDays:number;firstUnlockDay:string|null;
 firstToFullDays:number|null;mythicToFullDays:number|null;
 datedUnlocks:number;missingUnlockTimes:number;
};

/** Asia/Shanghai stays at UTC+08:00 throughout the modern Xbox record era. */
function localDate(timestamp:number){
 return new Date(timestamp+8*3600_000).toISOString();
}
export function journeyCalendarDays(start:number,end:number):number{
 return (Date.parse(localDate(end).slice(0,10)+'T00:00:00Z')-
  Date.parse(localDate(start).slice(0,10)+'T00:00:00Z'))/86400000;
}

/** A game journey uses only timestamped unlocked achievements: never guess play sessions. */
export function buildGameJourney(game:Game):GameJourneyModel{
 const events:JourneyEvent[]=[];
 const unlocked=(game.achievements||[]).filter(a=>a.unlocked);
 for(const achievement of unlocked){
  if(!achievement.unlockedAt)continue;
  const timestamp=Date.parse(achievement.unlockedAt);
  if(!Number.isFinite(timestamp))continue;
  const local=localDate(timestamp);
  events.push({achievement,timestamp,day:local.slice(0,10),
   clock:local.slice(11,16),hour:Number(local.slice(11,13))});
 }
 events.sort((a,b)=>a.timestamp-b.timestamp||a.achievement.id.localeCompare(b.achievement.id));
 const dayMap=new Map<string,JourneyDay>();
 for(const event of events){
  let entry=dayMap.get(event.day);
  if(!entry){
   entry={day:event.day,month:event.day.slice(0,7),events:[],nightCount:0};
   dayMap.set(event.day,entry);
  }
  entry.events.push(event);
  if(event.hour<9)entry.nightCount++;
 }
 const orderedDays=[...dayMap.values()].sort((a,b)=>b.day.localeCompare(a.day));
 const monthMap=new Map<string,JourneyMonth>();
 for(const day of orderedDays){
  let month=monthMap.get(day.month);
  if(!month){
   month={month:day.month,days:[],count:0};
   monthMap.set(day.month,month);
  }
  month.days.push(day);
  month.count+=day.events.length;
 }
 const first=events[0];
 const firstUnlockDay=first?.day??null;
 const mythicAt=gameCompletionTimestamp(game,'mythic');
 const fullAt=gameCompletionTimestamp(game,'full');
 const milestones:JourneyMilestone[]=[];
 function addMilestone(id:string,at:number,title:string,detail:string,important=false){
  milestones.push({id,day:localDate(at).slice(0,10),title,detail,
   important,sincePrevious:null});
 }
 if(first)addMilestone('first',first.timestamp,'首次解锁成就','档案中最早一项有时间记录的成就');
 // Missing unlock dates make progress thresholds ambiguous, so skip rather than backfill.
 if(game.total>0&&unlocked.length===game.earned&&unlocked.length===events.length){
  const seen=new Set<number>();
  for(const [ratio,title] of [[.25,'25%'],[.5,'50%'],[.75,'75%']] as const){
   const needed=Math.ceil(game.total*ratio);
   if(needed>0&&needed<=events.length&&!seen.has(needed)){
    seen.add(needed);
    addMilestone('progress-'+title,events[needed-1].timestamp,'完成度达到 '+title,
     needed+' / '+game.total+' 项成就');
   }
  }
 }
 if(mythicAt!==null)addMilestone('mythic',mythicAt,'Mythic 达成','完成全部本体成就',true);
 if(fullAt!==null)addMilestone('full',fullAt,'Full 达成','完成所有本体及追加内容成就',true);
 const order={first:0,'progress-25%':1,'progress-50%':2,'progress-75%':3,mythic:4,full:5};
 milestones.sort((a,b)=>a.day.localeCompare(b.day)||
  order[a.id as keyof typeof order]-order[b.id as keyof typeof order]);
 for(let i=1;i<milestones.length;i++){
  milestones[i].sincePrevious=(Date.parse(milestones[i].day+'T00:00:00Z')-
   Date.parse(milestones[i-1].day+'T00:00:00Z'))/86400000;
 }
 const candidates:JourneyHighlight[]=[];
 const night=[...orderedDays].filter(d=>d.nightCount>=2)
  .sort((a,b)=>b.nightCount-a.nightCount||b.day.localeCompare(a.day))[0];
 if(night){
  const firstNight=night.events.find(e=>e.hour<9)!;
  candidates.push({kind:'night',day:night.day,title:'最废寝忘食的时刻',
   headline:'凌晨解锁 '+night.nightCount+' 项成就',
   description:firstNight.clock+' 开始 · 00:00–08:59 的解锁记录',
   count:night.nightCount});
 }
 const burst=[...orderedDays].filter(d=>d.events.length>=3)
  .sort((a,b)=>b.events.length-a.events.length||b.day.localeCompare(a.day))[0];
 if(burst)candidates.push({kind:'burst',day:burst.day,title:'成就爆发的一天',
  headline:'单日解锁 '+burst.events.length+' 项成就',
  description:'这一天解锁成就最多',count:burst.events.length});
 const rare=[...events].filter(e=>e.achievement.rarity!==null&&
  e.achievement.rarity>=0&&e.achievement.rarity<10)
  .sort((a,b)=>a.achievement.rarity!-b.achievement.rarity!||a.timestamp-b.timestamp)[0];
 if(rare)candidates.push({kind:'rare',day:rare.day,title:'最珍贵的收获',
  headline:'稀有度 '+rare.achievement.rarity+'%',
  description:rare.achievement.name,count:1});
 if(fullAt!==null)candidates.push({kind:'full',day:localDate(fullAt).slice(0,10),
  title:'旅程完成的那一天',headline:'Full 达成',description:'所有成就全部解锁',count:1});
 if(mythicAt!==null)candidates.push({kind:'mythic',day:localDate(mythicAt).slice(0,10),
  title:'本体收官的一天',headline:'Mythic 达成',description:'本体全部成就解锁',count:1});
 if(first)candidates.push({kind:'first',day:first.day,title:'最初的收获',
  headline:'第一项成就',description:first.achievement.name,count:1});
 const highlights:JourneyHighlight[]=[];
 const pickedDays=new Set<string>();
 for(const candidate of candidates){
  if(pickedDays.has(candidate.day))continue;
  highlights.push(candidate);pickedDays.add(candidate.day);
  if(highlights.length===4)break;
 }
 return {months:[...monthMap.values()],highlights,milestones,unlockDays:dayMap.size,
  firstUnlockDay,firstToFullDays:first&&fullAt!==null?
   journeyCalendarDays(first.timestamp,fullAt):null,
  mythicToFullDays:mythicAt!==null&&fullAt!==null?
   journeyCalendarDays(mythicAt,fullAt):null,
  datedUnlocks:events.length,missingUnlockTimes:unlocked.length-events.length};
}
