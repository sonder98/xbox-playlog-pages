import type {Achievement,Game} from './data.ts';

export const MILLISECONDS_PER_DAY=86400000;

export type AchievementGap={
 key:string;
 game:Game;
 earlier:Achievement;
 later:Achievement;
 earlierTime:number;
 laterTime:number;
 gapMilliseconds:number;
 gapDays:number;
};

/** Adjacent unlocks within each game, never the first and last unlock unless adjacent.
 * Missing timestamps or locked entries are not eligible; exact ties have zero gap. */
export function longestAchievementGaps(games:Game[],limit=100):AchievementGap[]{
 const gaps:AchievementGap[]=[];
 for(const game of games){
  const ordered=(game.achievements||[])
   .filter(a=>a.unlocked&&a.unlockedAt)
   .map(a=>({achievement:a,time:Date.parse(a.unlockedAt!)}))
   .filter(a=>Number.isFinite(a.time))
   .sort((a,b)=>a.time-b.time||a.achievement.id.localeCompare(b.achievement.id));
  for(let i=1;i<ordered.length;i++){
   const before=ordered[i-1],after=ordered[i],gapMilliseconds=after.time-before.time;
   if(gapMilliseconds<=0)continue;
   gaps.push({key:game.id+':'+before.achievement.id+':'+after.achievement.id,
    game,earlier:before.achievement,later:after.achievement,
    earlierTime:before.time,laterTime:after.time,
    gapMilliseconds,gapDays:gapMilliseconds/MILLISECONDS_PER_DAY});
  }
 }
 return gaps.sort((a,b)=>b.gapMilliseconds-a.gapMilliseconds||
  b.laterTime-a.laterTime||
  a.game.id.localeCompare(b.game.id)||
  a.earlier.id.localeCompare(b.earlier.id)||
  a.later.id.localeCompare(b.later.id)).slice(0,Math.max(0,limit));
}
export function formattedGapDays(gapDays:number):string {
 return gapDays.toFixed(1);
}
