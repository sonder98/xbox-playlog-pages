import type {Game} from './data.ts';
import {firstRecordedPlayDate,shanghaiDate,type DailyPlaytimeLedger} from './playtime-ledger.ts';

export type AchievementTimeSpan={
 firstPlayedDate:string;
 lastUnlockedAt:string;
 days:number;
};

/**
 * Calendar-day interval from the first day with recorded positive playtime
 * to the latest unlocked achievement. Daily Xbox playtime is only precise
 * to the Asia/Shanghai calendar day, so the result is an integer day count.
 */
export function achievementTimeSpan(
 game:Pick<Game,'id'|'achievements'>,
 ledger:DailyPlaytimeLedger|null|undefined
):AchievementTimeSpan|null{
 const firstPlayedDate=firstRecordedPlayDate(ledger,game.id);
 if(!firstPlayedDate)return null;
 let last=-Infinity;
 for(const achievement of game.achievements??[]){
  if(!achievement.unlocked||!achievement.unlockedAt)continue;
  const instant=Date.parse(achievement.unlockedAt);
  if(Number.isFinite(instant))last=Math.max(last,instant);
 }
 if(!Number.isFinite(last))return null;
 const lastUnlockedAt=new Date(last).toISOString();
 const lastUnlockDate=shanghaiDate(lastUnlockedAt);
 const firstDay=Date.parse(firstPlayedDate+'T00:00:00Z');
 const lastDay=Date.parse(lastUnlockDate+'T00:00:00Z');
 if(!Number.isFinite(firstDay)||!Number.isFinite(lastDay)||lastDay<firstDay)return null;
 return {firstPlayedDate,lastUnlockedAt,days:Math.round((lastDay-firstDay)/86400000)};
}

export function formatAchievementTimeSpan(span:AchievementTimeSpan|null):string{
 return span?span.days+'天':'暂无数据';
}

/** Missing spans stay last for both directions; stable ties are handled by the caller. */
export function compareAchievementTimeSpans(a:AchievementTimeSpan|null,b:AchievementTimeSpan|null,direction:'longest'|'shortest'):number{
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 return direction==='longest'?b.days-a.days:a.days-b.days;
}
