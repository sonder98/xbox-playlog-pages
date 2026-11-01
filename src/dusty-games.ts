import type {Game} from './data.ts';
import type {PcMetascores,PcMetascore} from './metascores.ts';
export type DustyGame={game:Game;lastActiveAt:string;days:number;pcScore:PcMetascore|null};
const beijingDay=(ms:number)=>Math.floor((ms+8*3600000)/86400000);
function timestamp(value:string|null|undefined):number{
 if(!value)return NaN;
 const ms=Date.parse(value);
 return Number.isFinite(ms)?ms:NaN;
}
/** Only titles without an official Xbox visibility flag are included.
 * Activity is the later of Xbox last played and last earned achievement time. */
export function rankDustyGames(games:Game[],scores:PcMetascores,now=Date.now(),source='Xbox'):DustyGame[]{
 if(source!=='Xbox')return [];
 const ranked:DustyGame[]=[];
 for(const game of games){
  if(game.officialHidden!==undefined)continue;
  const observed=[timestamp(game.lastPlayed),...(game.achievements||[])
   .filter(award=>award.unlocked).map(award=>timestamp(award.unlockedAt))]
   .filter(Number.isFinite);
  if(!observed.length)continue;
  const last=Math.max(...observed);
  ranked.push({game,lastActiveAt:new Date(last).toISOString(),
   days:Math.max(0,beijingDay(now)-beijingDay(last)),pcScore:scores[game.id]??null});
 }
 return ranked.sort((a,b)=>b.days-a.days||a.lastActiveAt.localeCompare(b.lastActiveAt)||a.game.name.localeCompare(b.game.name));
}
