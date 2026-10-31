import type {Game} from './data.ts';

export type AchievementTimeSpan={
 firstUnlockedAt:string;
 lastUnlockedAt:string;
 days:number;
};

/**
 * Elapsed time between the first and the last *unlocked, timestamped* achievement.
 * A single timestamped unlock has a 0-day span; missing timestamps never imply a date.
 * Uses exact UTC instants, not calendar-day boundaries or game completion state.
 */
export function achievementTimeSpan(game:Pick<Game,'achievements'>):AchievementTimeSpan|null{
 let first=Infinity,last=-Infinity;
 for(const achievement of game.achievements??[]){
  if(!achievement.unlocked||!achievement.unlockedAt)continue;
  const instant=Date.parse(achievement.unlockedAt);
  if(!Number.isFinite(instant))continue;
  first=Math.min(first,instant);
  last=Math.max(last,instant);
 }
 if(!Number.isFinite(first))return null;
 return {firstUnlockedAt:new Date(first).toISOString(),lastUnlockedAt:new Date(last).toISOString(),days:(last-first)/86400000};
}

export function formatAchievementTimeSpan(span:AchievementTimeSpan|null):string{
 return span?span.days.toFixed(1)+'天':'暂无数据';
}

/** Missing spans stay last for both directions; stable ties are handled by the caller. */
export function compareAchievementTimeSpans(a:AchievementTimeSpan|null,b:AchievementTimeSpan|null,direction:'longest'|'shortest'):number{
 if(a===null)return b===null?0:1;
 if(b===null)return -1;
 return direction==='longest'?b.days-a.days:a.days-b.days;
}
