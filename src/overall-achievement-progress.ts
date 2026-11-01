import type {Game} from './data.ts';

/** Full Xbox completion = earned achievements / every achievement (base, DLC, updates).
 * Never use the Mythic base-only numerator. Unknown totals are unknown, not 0%. */
export function overallAchievementPercent(game:Pick<Game,'earned'|'total'>):number|null{
 return game.total>0?Math.min(100,Math.max(0,Math.round(game.earned/game.total*100))):null;
}
