import type {Achievement,Game} from './data.ts';
import {completion} from './completion.ts';

export type CompletionDateKind='full'|'mythic';
export type CompletionDateDirection='asc'|'desc';

/** A completion date is the latest unlock in the completed achievement set.
 * Missing or incomplete achievement details never produce a guessed date. */
function latestCompleteUnlock(achievements:Achievement[],expectedTotal:number):number|null{
 if(expectedTotal<=0||achievements.length!==expectedTotal)return null;
 let latest=-Infinity;
 for(const achievement of achievements){
  if(!achievement.unlocked||!achievement.unlockedAt)return null;
  const timestamp=Date.parse(achievement.unlockedAt);
  if(!Number.isFinite(timestamp))return null;
  latest=Math.max(latest,timestamp);
 }
 return Number.isFinite(latest)?latest:null;
}

/** Returns the date used by the library's Full or Mythic completion sort.
 * Full uses every base/DLC/update achievement. Mythic uses only the verified
 * BaseGame group; if grouping is unknown, a Full game is still safely Mythic. */
export function gameCompletionTimestamp(game:Game,kind:CompletionDateKind):number|null{
 const state=completion(game);
 const achievements=game.achievements||[];
 if(kind==='full'){
  if(!state.full)return null;
  return latestCompleteUnlock(achievements,game.total);
 }
 if(!state.mythic)return null;
 if(state.base){
  if(state.base.earned!==state.base.total||state.base.total<=0||
     state.base.achievementIds.length!==state.base.total)return null;
  const byId=new Map(achievements.map(achievement=>[achievement.id,achievement]));
  const baseAchievements=state.base.achievementIds.map(id=>byId.get(id));
  if(baseAchievements.some(achievement=>!achievement))return null;
  return latestCompleteUnlock(baseAchievements as Achievement[],state.base.total);
 }
 // When the base/DLC split is unavailable, Full completion proves the base
 // set is complete too; its final unlock is also the Mythic completion date.
 return state.full?latestCompleteUnlock(achievements,game.total):null;
}

/** Missing dates always sort last, independent of the selected direction. */
export function compareGameCompletionDates(
 a:Game,b:Game,kind:CompletionDateKind,direction:CompletionDateDirection
):number{
 const left=gameCompletionTimestamp(a,kind),right=gameCompletionTimestamp(b,kind);
 if(left===null)return right===null?0:1;
 if(right===null)return -1;
 return direction==='asc'?left-right:right-left;
}
