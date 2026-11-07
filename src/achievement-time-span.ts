import type {Game} from './data.ts';
import {firstRecordedPlayDate,shanghaiDate,type DailyPlaytimeLedger} from './playtime-ledger.ts';

export type AchievementTimeSpan={
 firstPlayedDate:string|null;
 firstUnlockedAt:string;
 lastUnlockedAt:string;
 basis:'first-play'|'first-unlock';
 days:number;
};

/**
 * If the first recorded play predates every unlocked achievement, use the
 * first-play calendar day to final-unlock calendar day. The daily ledger
 * started on 2026-11-01, so a later recorded session is not evidence of
 * a historical game's first play. Such games keep their original
 * first-unlock -> last-unlock duration in exact elapsed days.
 */
export function achievementTimeSpan(
 game:Pick<Game,'id'|'achievements'>,
 ledger:DailyPlaytimeLedger|null|undefined
):AchievementTimeSpan|null{
 let first=Infinity,last=-Infinity;
 for(const achievement of game.achievements??[]){
  if(!achievement.unlocked||!achievement.unlockedAt)continue;
  const instant=Date.parse(achievement.unlockedAt);
  if(!Number.isFinite(instant))continue;
  first=Math.min(first,instant);
  last=Math.max(last,instant);
 }
 if(!Number.isFinite(first))return null;
 const firstUnlockedAt=new Date(first).toISOString();
 const lastUnlockedAt=new Date(last).toISOString();
 const firstPlayedDate=firstRecordedPlayDate(ledger,game.id);

 // A play-day observed after the first unlock is a return visit, not
 // the game's original start. Fall back to the historical calculation.
 if(firstPlayedDate&&firstPlayedDate<=shanghaiDate(firstUnlockedAt)){
  const lastUnlockDate=shanghaiDate(lastUnlockedAt);
  const firstDay=Date.parse(firstPlayedDate+'T00:00:00Z');
  const lastDay=Date.parse(lastUnlockDate+'T00:00:00Z');
  return {firstPlayedDate,firstUnlockedAt,lastUnlockedAt,basis:'first-play',
   days:Math.round((lastDay-firstDay)/86400000)};
 }
 return {firstPlayedDate:null,firstUnlockedAt,lastUnlockedAt,basis:'first-unlock',
  days:(last-first)/86400000};
}

export function formatAchievementTimeSpan(span:AchievementTimeSpan|null):string{
 return span?(span.basis==='first-play'?String(span.days):span.days.toFixed(1))+'天':'暂无数据';
}

/** Missing spans stay last for both directions; stable ties are handled by the caller. */
export function compareAchievementTimeSpans(a:AchievementTimeSpan|null,b:AchievementTimeSpan|null,direction:'longest'|'shortest'):number{
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 return direction==='longest'?b.days-a.days:a.days-b.days;
}
