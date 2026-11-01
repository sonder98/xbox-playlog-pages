import type {Achievement,Game} from './data.ts';

/** One earned Xbox achievement in the global rarity ranking.
 * Rarity is a percentage of players who unlocked it; lower means rarer.
 * A missing unlock date does not exclude a known unlocked achievement. */
export type RareAchievement={
 key:string;
 game:Game;
 achievement:Achievement;
 time:number|null;
};

export function rareAchievementTop(games:Game[],limit=50):RareAchievement[]{
 const ranked:RareAchievement[]=[];
 for(const game of games){
  for(const achievement of game.achievements||[]){
   if(!achievement.unlocked||achievement.rarity===null||!Number.isFinite(achievement.rarity)||
      achievement.rarity<0||achievement.rarity>100)continue;
   const parsed=achievement.unlockedAt?Date.parse(achievement.unlockedAt):NaN;
   ranked.push({key:game.id+':'+achievement.id,game,achievement,time:Number.isFinite(parsed)?parsed:null});
  }
 }
 return ranked.sort((a,b)=>a.achievement.rarity!-b.achievement.rarity!||
  (b.time??-Infinity)-(a.time??-Infinity)||
  a.game.name.localeCompare(b.game.name)||
  a.game.id.localeCompare(b.game.id)||
  a.achievement.id.localeCompare(b.achievement.id)).slice(0,Math.max(0,limit));
}
