import {useEffect} from 'react';
import {ArrowLeft,ArrowUpRight,CircleUserRound,Diamond,Sparkles} from 'lucide-react';
import type {Profile} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {MYTHIC_BADGE_URL,posterLocalDate} from '../mythic-posters';
import {mythicBackdrop,mythicCover} from '../mythic-assets';

function CollectionPreview({entry,profile,index,total,onOpen}:{
 entry:MythicPoster;profile:Profile;index:number;total:number;onOpen:()=>void;
}){
 const {game,firstAt,mythicAt,firstAchievement,lastBaseAchievement,daysToMythic,baseTotal}=entry;
 const background=mythicBackdrop(game),cover=mythicCover(game);
 const first=posterLocalDate(firstAt),finish=posterLocalDate(mythicAt);
 const firstArt=firstAchievement?.cachedImage||firstAchievement?.image;
 const lastArt=lastBaseAchievement?.cachedImage||lastBaseAchievement?.image;
 return <button type="button" className="mythic-showcase-item" data-showcase-game={game.id}
  aria-label={`放大 ${game.name} 纪念卡`} onClick={onOpen}>
  <div className="mythic-showcase-seat">
   <div className="mythic-showcase-poster">
    {background&&<img className="mythic-showcase-backdrop" src={background} alt="" loading="lazy" decoding="async"/>}
    <div className="mythic-showcase-shade" aria-hidden="true"/>
    <div className="mythic-showcase-engraving" aria-hidden="true"/>
    <div className="mythic-showcase-card-caption"><span>MYTHIC</span><span>NO. {String(total-index).padStart(3,'0')}</span></div>
    <div className="mythic-showcase-portrait">
     {cover?<img src={cover} alt="" loading="lazy" decoding="async" width={256} height={256}/>:
      <Diamond size={24} strokeWidth={1} aria-hidden="true"/>}
    </div>
    <span className="mythic-showcase-emblem">
     <img src={MYTHIC_BADGE_URL} alt="" loading="lazy" decoding="async" width={360} height={360}/>
    </span>
    <div className="mythic-showcase-greeting"><span>✧</span> 恭喜 MYTHIC <span>✧</span></div>
    <strong className="mythic-showcase-game-name">{game.name}</strong>
    <div className="mythic-showcase-player">
     {profile.avatar?<img src={profile.avatar} alt="" width={26} height={26} loading="lazy" decoding="async"/>:
      <CircleUserRound aria-hidden="true" size={14}/>}
     <span>{profile.gamertag||'Xbox 玩家'}</span>
    </div>
    <div className="mythic-showcase-achievements">
     <div className="mythic-showcase-moment">
      <span className="mythic-showcase-achievement-art">{firstArt?
       <img src={firstArt} alt="" loading="lazy" decoding="async" width={48} height={48}/>:
       <Sparkles aria-hidden="true"/>}</span>
      <small>首项成就</small>
      <b>{first.date}</b>
     </div>
     <span className="mythic-showcase-moment-separator" aria-hidden="true">✦</span>
     <div className="mythic-showcase-moment">
      <span className="mythic-showcase-achievement-art">{lastArt?
       <img src={lastArt} alt="" loading="lazy" decoding="async" width={48} height={48}/>:
       <Sparkles aria-hidden="true"/>}</span>
      <small>Mythic 达成</small>
      <b>{finish.date}</b>
     </div>
    </div>
    <div className="mythic-showcase-stats">
     <span><b>{game.minutes===null?'—':(game.minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1})}</b><small>小时</small></span>
     <span><b>{daysToMythic===null?'—':daysToMythic}</b><small>天</small></span>
     <span><b>{baseTotal}</b><small>成就</small></span>
    </div>
    <div className="mythic-showcase-signature">✳ XBOX PLAYLOG</div>
   </div>
   <span className="mythic-showcase-seat-light" aria-hidden="true"/>
  </div>
  <span className="mythic-showcase-meta">
   <span className="mythic-showcase-meta-title" title={game.name}>{game.name}</span>
   <span className="mythic-showcase-meta-date">Mythic · {finish.date}</span>
   <ArrowUpRight aria-hidden="true" className="mythic-showcase-open-icon" size={18}/>
  </span>
 </button>;
}

/** A vertically scrolling, 3-column collectible gallery before the full-size poster carousel. */
export function MythicShowcase({posters,profile,onClose,onOpen}:{
 posters:MythicPoster[];profile:Profile;onClose:()=>void;onOpen:(gameId:string)=>void;
}){
 useEffect(()=>{
  const before=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=before;};
 },[]);
 return <section className="mythic-showcase-screen" aria-label="Mythic纪念墙展示柜" data-showcase="grid">
  <div className="mythic-showcase-inner">
   <div className="mythic-showcase-toolbar">
    <button type="button" className="mythic-showcase-back" onClick={onClose}>
     <ArrowLeft size={18} aria-hidden="true"/>返回游戏库
    </button>
    <span className="mythic-showcase-label">PRIVATE COLLECTION</span>
   </div>
   <div className="mythic-showcase-hero">
    <div className="mythic-showcase-hero-copy">
     <span className="mythic-showcase-eyebrow">THE MYTHIC COLLECTION</span>
     <h1>Mythic 纪念墙</h1>
     <p>每一张纪念卡，都是一段值得珍藏的游戏旅程。</p>
    </div>
    <div className="mythic-showcase-counter">
     <span className="mythic-showcase-count">{String(posters.length).padStart(2,'0')}</span><span className="mythic-showcase-unit">张</span>
     <small>已珍藏的 Mythic</small>
    </div>
   </div>
   <div className="mythic-showcase-rule" aria-hidden="true"/>
   <div className="mythic-showcase-section-heading">
    <strong>✦ <span>我的纪念卡</span></strong>
    <span>按 Mythic 达成时间排序 · 点击放大</span>
   </div>
   <div className="mythic-showcase-grid">
    {posters.map((entry,index)=><CollectionPreview key={entry.game.id}
     entry={entry} profile={profile} index={index} total={posters.length}
     onOpen={()=>onOpen(entry.game.id)}/>)}
   </div>
   <div className="mythic-showcase-bottom">✧ <span>THE JOURNEY IS THE REWARD</span> ✧</div>
  </div>
 </section>;
}
