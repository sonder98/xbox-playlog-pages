import type {Game,RecordData} from './data.ts';
import {shanghaiDay,type Activity} from './achievement-activity.ts';

export type MonthlyPlayed=Map<string,Game[]>;

/** Confirmed evidence only: a timestamped achievement or an Xbox lastPlayed
 * timestamp from current/history snapshots. Total playtime cannot be allocated
 * to calendar months without dated samples. No month is inferred from presence
 * in the game library alone. */
export function monthlyPlayedGames(games:Game[],records:RecordData[]=[],activity?:Activity):MonthlyPlayed{
 const allowed=new Map(games.map(game=>[game.id,game]));
 const perMonth=new Map<string,Map<string,number>>();
 const today=activity?.today??shanghaiDay(new Date());
 const add=(gameId:string,when:string|number)=>{
  if(!allowed.has(gameId))return;
  const timestamp=typeof when==='number'?when:Date.parse(when);
  if(!Number.isFinite(timestamp))return;
  const day=shanghaiDay(timestamp);
  if(day<'2022-01-01'||day>today)return;
  const key=day.slice(0,7);
  let month=perMonth.get(key);
  if(!month){month=new Map();perMonth.set(key,month);}
  month.set(gameId,Math.max(month.get(gameId)??-Infinity,timestamp));
 };
 if(activity){
  for(const bucket of activity.byDay.values()){
   for(const event of bucket.events)add(event.game.id,event.time);
  }
 }else{
  for(const game of games)for(const award of game.achievements||[]){
   if(award.unlocked&&award.unlockedAt)add(game.id,award.unlockedAt);
  }
 }
 for(const game of games)if(game.lastPlayed)add(game.id,game.lastPlayed);
 for(const record of records)for(const game of record.games)if(game.lastPlayed)add(game.id,game.lastPlayed);
 return new Map([...perMonth].map(([month,ids])=>[month,[...ids].sort((a,b)=>b[1]-a[1]||
  (allowed.get(a[0])?.name||'').localeCompare(allowed.get(b[0])?.name||'')||a[0].localeCompare(b[0]))
  .map(([id])=>allowed.get(id)!) ]));
}
