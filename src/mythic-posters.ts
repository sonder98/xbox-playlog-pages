import type {Achievement,Game} from './data.ts';
import {completion} from './completion.ts';
import {gameCompletionTimestamp} from './game-completion-date.ts';

export type MythicPoster={
 game:Game;
 mythicAt:number|null;
 firstAt:number|null;
 firstAchievement:Achievement|null;
 lastBaseAchievement:Achievement|null;
 daysToMythic:number|null;
 baseTotal:number;
};

/** The wall follows the same verified Mythic eligibility and completion date as the library. */
export function mythicPosterWall(games:Game[]):MythicPoster[]{
 return games.filter(game=>completion(game).mythic).map(game=>{
  const state=completion(game);
  const mythicAt=gameCompletionTimestamp(game,'mythic');
  const unlocked=(game.achievements||[]).filter(a=>a.unlocked&&a.unlockedAt&&Number.isFinite(Date.parse(a.unlockedAt)));
  unlocked.sort((a,b)=>Date.parse(a.unlockedAt!)-Date.parse(b.unlockedAt!)||a.id.localeCompare(b.id));
  const firstAchievement=unlocked[0]||null;
  const firstAt=firstAchievement?Date.parse(firstAchievement.unlockedAt!):null;
  const baseIds=state.base?new Set(state.base.achievementIds):null;
  const lastBaseAchievement=mythicAt===null?null:unlocked.filter(a=>
   (!baseIds||baseIds.has(a.id))&&Date.parse(a.unlockedAt!)===mythicAt
  ).at(-1)||null;
  // Display elapsed Beijing calendar days, not an invented total session duration.
  const day=(timestamp:number)=>new Date(timestamp+8*3600_000).toISOString().slice(0,10);
  const daysToMythic=firstAt===null||mythicAt===null?null:
   Math.round((Date.parse(day(mythicAt)+'T00:00:00Z')-Date.parse(day(firstAt)+'T00:00:00Z'))/86400000);
  return {game,mythicAt,firstAt,firstAchievement,lastBaseAchievement,
   daysToMythic,baseTotal:state.base?.total??game.total};
 }).sort((a,b)=>{
  if(a.mythicAt===null)return b.mythicAt===null?a.game.name.localeCompare(b.game.name):1;
  if(b.mythicAt===null)return -1;
  return b.mythicAt-a.mythicAt||a.game.name.localeCompare(b.game.name);
 });
}

export function posterLocalDate(timestamp:number|null){
 if(timestamp===null)return {date:'日期暂缺',time:'—'};
 const date=new Date(timestamp);
 return {
  date:date.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).replaceAll('/','.'),
  time:date.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})
 };
}
