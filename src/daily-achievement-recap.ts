import type {DayBucket} from './achievement-activity.ts';
import type {Game} from './data.ts';
import {dailyGameMinutes,type DailyPlaytimeLedger} from './playtime-ledger.ts';

export type DayRecapGame={game:Game;count:number;minutes:number|null};
export type DayRecap={games:DayRecapGame[];totalMinutes:number|null;achievementCount:number;heroGame:Game|null};

/** Include games with recorded playtime even if none of their achievements unlocked
 * on that date. Never infer daily playtime from a title's lifetime Xbox hours. */
export function dailyAchievementRecap(day:string,bucket:DayBucket|undefined,allGames:Game[],ledger:DailyPlaytimeLedger|null|undefined):DayRecap{
 const byId=new Map<string,DayRecapGame>();
 for(const {game,count} of bucket?.games||[]){
  byId.set(game.id,{game,count,minutes:dailyGameMinutes(ledger,day,game.id)});
 }
 for(const game of allGames){
  const minutes=dailyGameMinutes(ledger,day,game.id);
  if(minutes!==null&&minutes>0&&!byId.has(game.id))byId.set(game.id,{game,count:0,minutes});
 }
 // The top unlocker takes the backdrop. Playtime breaks ties; the stable
 // source order resolves remaining ties without selecting arbitrary artwork.
 const games=[...byId.values()].sort((a,b)=>b.count-a.count||(b.minutes??-1)-(a.minutes??-1));
 const known=games.filter(g=>g.minutes!==null);
 const totalMinutes=known.length?known.reduce((n,g)=>n+g.minutes!,0):null;
 return {games,totalMinutes,achievementCount:bucket?.events.length||0,
  heroGame:games.find(g=>g.count>0)?.game||null};
}

/** Matches the detail-page landscape cover priority and prefers same-origin cache. */
export function dayRecapBackdropCandidates(game:Game|null):string[]{
 if(!game)return [];
 return [...new Set([game.cachedDetailImage,game.detailImage,game.imageWide,
  game.cachedPosterImage,game.posterImage].filter((url):url is string=>!!url))];
}
