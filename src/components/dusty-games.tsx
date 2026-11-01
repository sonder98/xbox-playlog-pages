import {ArrowLeft,ChevronRight,Clock3,Gamepad2} from 'lucide-react';
import type {DustyGame} from '../dusty-games';
import {GameCover} from './game';

const date=(value:string)=>new Date(value).toLocaleDateString('zh-CN',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'
}).replaceAll('/','.');
function Score({item}:{item:DustyGame}){
 return <span className={'dust-score'+(item.pcScore?' has-score':'')} title={item.pcScore?.note||'Metacritic PC 专业媒体评分'}>
  <span>M</span> <strong>{item.pcScore?.score??'—'}</strong>
  {item.pcScore&&<small>PC</small>}
 </span>;
}
export function DustyPreview({items,onOpen}:{items:DustyGame[];onOpen:()=>void}){
 return <section className="ah-showcase dusty-preview" data-overview-section="dusty" aria-label="吃灰游戏">
  <div className="ah-showcase-heading">
   <div className="ah-showcase-title-group">
    <span className="ah-showcase-trophy dusty-section-icon"><Clock3 size={21} aria-hidden="true"/></span>
    <div><h2>吃灰游戏 <span className="ah-showcase-top-label">TOP 5</span></h2>
     <p>按距离上次游玩或解锁成就的天数排序 · M 站 PC 评分</p></div>
   </div>
   <button className="ah-showcase-open" type="button" onClick={onOpen} disabled={!items.length} aria-label="查看全部吃灰游戏">
    <ChevronRight size={22}/></button>
  </div>
  {items.length?<div className="dusty-rail" role="region" aria-label="吃灰游戏 TOP 5 横向滑动" tabIndex={0}>
   {items.slice(0,5).map((item,i)=><button key={item.game.id} type="button" className="dust-card" onClick={onOpen} data-game-id={item.game.id} aria-label={item.game.name+' 已吃灰 '+item.days+' 天'}>
     <span className="dust-cover"><GameCover game={item.game}/></span>
     <span className="dust-rank">#{String(i+1).padStart(2,'0')}</span>
     <span className="dust-title" title={item.game.name}>{item.game.name}</span>
     <span className="dust-days"><strong>{item.days.toLocaleString('zh-CN')}</strong> 天未活跃</span>
     <span className="dust-bottom"><Score item={item}/><small>{date(item.lastActiveAt)}</small></span>
    </button>)}
  </div>:<p className="ah-showcase-empty">暂无可确定最后活跃时间的官方未标记可见游戏。</p>}
 </section>;
}
export function DustyDetails({items,onBack}:{items:DustyGame[];onBack:()=>void}){
 return <section className="ah-page dusty-detail" data-dusty="detail">
  <button className="ah-back" onClick={onBack} type="button"><ArrowLeft size={20}/> 返回概览</button>
  <div className="ah-intro-block"><span className="eyebrow">LEFT ON THE SHELF</span>
   <h1>吃灰游戏</h1><p className="ah-intro">仅包含 Xbox 官方未返回可见状态的游戏 · 最近游玩与最近解锁成就取较晚者</p>
  </div>
  <div className="ah-showcase-detail-count"><span>可计算最后活跃日期</span><strong>{items.length} 款</strong></div>
  {items.length?<div className="dust-detail-list">
   {items.map((item,i)=><article className="dust-detail-row" key={item.game.id} data-game-id={item.game.id}>
    <span className="dust-detail-rank">{String(i+1).padStart(2,'0')}</span>
    <span className="dust-detail-cover"><GameCover game={item.game}/></span>
    <div className="dust-detail-body">
     <strong title={item.game.name}>{item.game.name}</strong>
     <small><Gamepad2 size={13} aria-hidden="true"/>最后活跃 {date(item.lastActiveAt)}</small>
     {item.pcScore?.note&&<span className="dust-detail-note">{item.pcScore.note}</span>}
    </div>
    <div className="dust-detail-numbers"><span><b>{item.days.toLocaleString('zh-CN')}</b> 天</span><Score item={item}/></div>
   </article>)}
  </div>:<p className="ah-empty-day">暂无符合条件的游戏。</p>}
  <p className="ah-footnote">吃灰天数按照北京时间的自然日差计算。M 分是截至 2026-11-01 人工核实的 Metacritic PC 专业媒体评分；无可用媒体综合分则显示 M —，不会用单篇评测或玩家分数替代。数据不会随每半小时的 Xbox 同步自动改分。</p>
 </section>;
}
