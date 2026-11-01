import type {Game} from '../data';
import {GameCover} from './game';
import {overallAchievementPercent} from '../overall-achievement-progress';

export function RecentGamesRail({games,onGame}:{games:Game[];onGame:(id:string)=>void}){
 return games.length?<div className="recent-games-rail" role="region" aria-label="最近游玩的游戏，横向滑动" tabIndex={0}>
  {games.map((game,index)=>{
   const pct=overallAchievementPercent(game);
   return <button type="button" className="recent-game-card" data-game-id={game.id} key={game.id}
    onClick={()=>onGame(game.id)}
    aria-label={`查看 ${game.name}，全部成就完成度 ${pct===null?'暂无数据':pct+'%'}`}>
    <span className="recent-game-cover"><GameCover game={game} priority={index<3}/></span>
    <span className="recent-game-title" title={game.name}>{game.name}</span>
    <span className="recent-game-progress">
     <span className="recent-game-progress-track" role="progressbar"
      aria-label={game.name+' 全部成就进度（包含本体及 DLC）'}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??0}>
      <span style={{width:(pct??0)+'%'}}/>
     </span>
     <strong>{pct===null?'—':pct+'%'}</strong>
    </span>
   </button>;
  })}
 </div>:<div className="small-empty">暂无最近游玩记录</div>;
}
