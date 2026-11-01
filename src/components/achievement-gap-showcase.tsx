import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronLeft,ChevronRight,Clock3,Gamepad2,Trophy} from 'lucide-react';
import type {Achievement,Game} from '../data';
import {achievementRarityTier} from '../rare-achievements';
import {formattedGapDays,type AchievementGap} from '../achievement-gaps';

function GapArt({achievement,detail=false}:{achievement:Achievement;detail?:boolean}){
 const [broken,setBroken]=useState(false);
 const [aspect,setAspect]=useState<number|null>(null);
 const src=achievement.cachedImage||achievement.image;
 const tier=achievementRarityTier(achievement.rarity);
 useEffect(()=>{setBroken(false);setAspect(null);},[src]);
 return <span className={'ah-showcase-art ah-gap-art'+(detail?' ah-gap-detail-art':'')+
   ' ah-rarity-'+tier+(tier!=='common'?' ah-rarity-gold':'')}
   style={aspect?{aspectRatio:String(aspect)}:undefined}>
  {src&&!broken?<img src={src} alt={achievement.name} loading="lazy"
   onLoad={e=>setAspect(Math.min(2.5,Math.max(.7,e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)))}
   onError={()=>setBroken(true)}/>:<Trophy size={20} aria-hidden="true"/>}
 </span>;
}
const date=(value:number)=>new Date(value).toLocaleDateString('zh-CN',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'
}).replaceAll('/','.');
const timestamp=(value:number)=>new Date(value).toLocaleString('zh-CN',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hour12:false
}).replaceAll('/','.');

export function AchievementGapRail({items,onOpen}:{items:AchievementGap[];onOpen:()=>void}){
 const rail=useRef<HTMLDivElement>(null);
 return <section className="ah-showcase ah-gap-showcase" aria-label="间隔最久成就" data-achievement-gap="preview">
  <div className="ah-showcase-heading">
   <div className="ah-showcase-title-group">
    <span className="ah-showcase-trophy ah-gap-icon"><Clock3 size={21} aria-hidden="true"/></span>
    <div><h2>间隔最久成就 <span className="ah-showcase-top-label">TOP 100</span></h2>
     <p>同一游戏中，相邻两次成就解锁的最长间隔</p></div>
   </div>
   <button type="button" className="ah-showcase-open" aria-label="查看间隔最久成就详情"
    disabled={!items.length} onClick={onOpen}><ChevronRight size={22}/></button>
  </div>
  {items.length?
   <div className="ah-showcase-rail ah-gap-rail" role="region" aria-label="最长相邻成就间隔 TOP 100，横向滑动" tabIndex={0} ref={rail}>
    {items.map((item,index)=><button type="button" className="ah-gap-tile" key={item.key}
      data-gap-rank={index+1} onClick={onOpen}
      aria-label={`第 ${index+1} 名，${item.game.name}，从 ${item.earlier.name} 到 ${item.later.name}，间隔 ${formattedGapDays(item.gapDays)} 天`}>
     <span className="ah-gap-stack">
      <span className="ah-gap-image-back"><GapArt achievement={item.earlier}/></span>
      <span className="ah-gap-image-front"><GapArt achievement={item.later}/></span>
      <span className="ah-gap-stack-rank">#{String(index+1).padStart(2,'0')}</span>
      <ArrowRight className="ah-gap-stack-arrow" size={14} aria-hidden="true"/>
     </span>
     <span className="ah-gap-tile-game" title={item.game.name}>{item.game.name}</span>
     <span className="ah-gap-tile-duration"><Clock3 size={13} aria-hidden="true"/>间隔 <strong>{formattedGapDays(item.gapDays)}</strong> 天</span>
    </button>)}
   </div>:<p className="ah-showcase-empty">尚无同一游戏中两次带有效时间的成就解锁记录。</p>}
  {items.length>0&&<div className="ah-showcase-foot">
   <span>共 {items.length} 对 · 间隔由长到短</span>
   <div className="ah-showcase-rail-actions">
    <button type="button" aria-label="向左滚动间隔成就展柜" onClick={()=>rail.current?.scrollBy({left:-400,behavior:'smooth'})}><ChevronLeft size={17}/></button>
    <button type="button" aria-label="向右滚动间隔成就展柜" onClick={()=>rail.current?.scrollBy({left:400,behavior:'smooth'})}><ChevronRight size={17}/></button>
   </div>
  </div>}
 </section>;
}

function GapSide({achievement,when,position}:{achievement:Achievement;when:number;position:'earlier'|'later'}){
 return <div className="ah-gap-side" data-gap-side={position}>
  <span className="ah-gap-side-label">{position==='earlier'?'较早解锁':'随后解锁'}</span>
  <GapArt achievement={achievement} detail/>
  <h3 title={achievement.name}>{achievement.name}</h3>
  <p className="ah-gap-achievement-condition">{achievement.description?.trim()||'暂无解锁条件说明'}</p>
  <time dateTime={achievement.unlockedAt||undefined}>{timestamp(when)}</time>
 </div>;
}

export function AchievementGapDetails({items,onBack,onGame}:{items:AchievementGap[];onBack:()=>void;onGame:(id:string)=>void}){
 return <section className="ah-page ah-gap-detail" data-achievement-gap="detail">
  <button type="button" className="ah-back" onClick={onBack}><ArrowLeft size={20}/> 返回热力图</button>
  <div className="ah-intro-block"><span className="eyebrow">ACHIEVEMENT INTERVALS</span>
   <h1>间隔最久成就</h1><p className="ah-intro">那些时隔许久才再次解锁的瞬间 · 按相邻成就间隔由长到短排列</p>
  </div>
  <div className="ah-showcase-detail-count"><span>跨游戏相邻解锁记录</span><strong>TOP {items.length}</strong></div>
  {items.length?<div className="ah-gap-detail-list">
   {items.map((item,index)=><article key={item.key} className="ah-gap-detail-card" data-gap-rank={index+1}>
    <div className="ah-gap-detail-heading"><span className="ah-gap-detail-rank">#{String(index+1).padStart(2,'0')}</span>
     <span>同一游戏 · 相邻解锁成就</span></div>
    <div className="ah-gap-duo">
     <GapSide achievement={item.earlier} when={item.earlierTime} position="earlier"/>
     <span className="ah-gap-duo-arrow" aria-hidden="true"><ArrowRight size={19}/></span>
     <GapSide achievement={item.later} when={item.laterTime} position="later"/>
    </div>
    <div className="ah-gap-detail-summary">
     <button type="button" className="ah-gap-game-link" onClick={()=>onGame(item.game.id)}
      aria-label={'打开 '+item.game.name+' 的游戏详情'}>
      {item.game.cachedImage||item.game.image?
       <img src={item.game.cachedImage||item.game.image} alt="" loading="lazy"/>:
       <Gamepad2 size={22} aria-hidden="true"/>}
      <span>{item.game.name}</span><ChevronRight size={16} aria-hidden="true"/>
     </button>
     <div className="ah-gap-detail-duration" aria-label={'成就间隔 '+formattedGapDays(item.gapDays)+' 天'}>
      <span>间隔</span><strong>{formattedGapDays(item.gapDays)}</strong><span>天</span>
     </div>
    </div>
    <p className="ah-gap-date-range">{date(item.earlierTime)} <ArrowRight size={13} aria-hidden="true"/> {date(item.laterTime)}</p>
   </article>)}
  </div>:<p className="ah-empty-day">尚无符合条件的成就间隔。需要同一游戏中至少两个带有效解锁时间的成就。</p>}
 </section>;
}
