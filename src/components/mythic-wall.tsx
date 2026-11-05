import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {ChevronLeft,ChevronRight,CircleUserRound,Sparkles,X} from 'lucide-react';
import type {Profile,Game,Achievement} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {MYTHIC_BADGE_URL,posterLocalDate} from '../mythic-posters';

const GOLD='#e6c47b';
const confetti=Array.from({length:76},(_,i)=>{
 const random=(n:number)=>((i*1037+n*719+43)%997)/997;
 return {
  left:(random(1)*100).toFixed(2)+'%',
  delay:(random(2)*1.35).toFixed(2)+'s',
  duration:(2.3+random(3)*1.9).toFixed(2)+'s',
  drift:(-240+random(4)*480).toFixed(0)+'px',
  rotate:(random(5)*1200-600).toFixed(0)+'deg',
  width:(3+random(6)*8).toFixed(0)+'px',
  height:(7+random(7)*13).toFixed(0)+'px',
  color:['#e7ba65','#fff0ac','#b2fb5a','#f5e9d7','#f7d38d','#91cfad'][i%6]
 };
});

function MythicEmblem({className=''}:{className?:string}){
 const [failed,setFailed]=useState(false);
 return <span className={'mythic-poster-emblem '+className}>
  <Sparkles size={42} strokeWidth={1.4} aria-hidden="true"/>
  {!failed&&<img src={MYTHIC_BADGE_URL} alt="Xbox Mythic 勋章" loading="eager"
   onError={()=>setFailed(true)}/>}
 </span>;
}
function MomentArt({achievement}:{achievement:Achievement|null}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[achievement?.id]);
 const image=achievement?.cachedImage||achievement?.image;
 return <span className="mythic-poster-achievement-art">
  {image&&!failed?<img src={image} alt="" loading="lazy" onError={()=>setFailed(true)}/>:
  <Sparkles size={25} strokeWidth={1.3} aria-hidden="true"/>}
 </span>;
}
function OrnateBorder(){
 return <svg className="mythic-poster-ornament" viewBox="0 0 420 748" preserveAspectRatio="none" aria-hidden="true">
  <rect x="4" y="4" width="412" height="740" rx="24" stroke={GOLD} fill="none" strokeWidth="1.25"/>
  <rect x="12" y="12" width="396" height="724" rx="20" stroke="#c99a4c" opacity=".48" fill="none" strokeWidth=".7"/>
  <path d="M17 103 Q17 40 65 36 Q93 35 87 65 Q84 78 72 73 Q65 67 72 61 M403 103 Q403 40 355 36 Q327 35 333 65 Q336 78 348 73 Q355 67 348 61
   M17 645 Q17 708 65 712 Q93 713 87 683 Q84 670 72 675 Q65 681 72 687 M403 645 Q403 708 355 712 Q327 713 333 683 Q336 670 348 675 Q355 681 348 687"
   stroke="#deb774" strokeWidth="1.15" fill="none" opacity=".8"/>
  <path d="M20 374h25M375 374h25M205 14l5-8 5 8-5 8zM205 734l5-8 5 8-5 8zM8 374l8-4 8 4-8 4zM412 374l-8-4-8 4 8 4z" fill="#f5dda0" opacity=".85"/>
  {Array.from({length:14},(_,i)=><g key={i} fill="#d8b36a" opacity=".6">
   <path d={`M${24+i*28} 13l3 3-3 3-3-3z`}/>
   <path d={`M${24+i*28} 735l3-3-3-3-3 3z`}/>
  </g>)}
 </svg>;
}
function MythicPosterCard({entry,profile,index,total,active}:{
 entry:MythicPoster;profile:Profile;index:number;total:number;active:boolean;
}){
 const {game,firstAt,mythicAt,firstAchievement,lastBaseAchievement,daysToMythic,baseTotal}=entry;
 const first=posterLocalDate(firstAt),finish=posterLocalDate(mythicAt);
 const background=game.cachedDetailImage||game.detailImage||game.imageWide||
  game.cachedImageLarge||game.image3x||game.cachedImage||game.image;
 const cover=game.cachedImageLarge||game.cachedImage||game.image3x||game.image2x||game.image;
 return <article className={'mythic-poster'+(active?' is-active':'')} data-poster-game={game.id}
  aria-label={game.name+' Mythic 纪念卡'}>
  <div className="mythic-poster-backdrop" style={background?{backgroundImage:`url("${background.replaceAll('"','%22')}")`}:undefined}/>
  <div className="mythic-poster-backdrop-shade"/>
  <OrnateBorder/>
  <div className="mythic-poster-stars" aria-hidden="true">
   {Array.from({length:15},(_,i)=><span key={i} style={{'--i':i,left:`${12+(i*37)%74}%`,top:`${7+(i*31)%78}%`} as CSSProperties}>✦</span>)}
  </div>
  <header className="mythic-poster-caption"><span>MYTHIC</span><span>NO. {String(total-index).padStart(3,'0')}</span></header>
  <div className="mythic-poster-portrait">
   {cover?<img src={cover} alt="" loading={active?'eager':'lazy'} decoding="async"/>:<Sparkles size={54} color={GOLD}/>}
  </div>
  <MythicEmblem/>
  <div className="mythic-poster-congratulations">
   <span className="mythic-poster-gold-line">✧</span>
   <strong>恭喜 MYTHIC</strong>
   <span className="mythic-poster-gold-line">✧</span>
  </div>
  <h2 className="mythic-poster-title">{game.name}</h2>
  <div className="mythic-poster-player">
   {profile.avatar?<img src={profile.avatar} alt="" className="mythic-poster-avatar"/>:
    <CircleUserRound size={33} color={GOLD} aria-hidden="true"/>}
   <strong>{profile.gamertag||'Xbox 玩家'}</strong>
  </div>
  <div className="mythic-poster-achievement-pair">
   <div className="mythic-poster-achievement">
    <MomentArt achievement={firstAchievement}/>
    <small>首项成就</small>
    <b>{first.date}</b>
    <span>{first.time}</span>
   </div>
   <span className="mythic-poster-bridge" aria-hidden="true">✦</span>
   <div className="mythic-poster-achievement">
    <MomentArt achievement={lastBaseAchievement}/>
    <small>Mythic 达成</small>
    <b>{finish.date}</b>
    <span>{finish.time}</span>
   </div>
  </div>
  <div className="mythic-poster-stats">
   <div><strong>{game.minutes===null?'—':(game.minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1})}</strong><small>小时</small><span>累计游玩</span></div>
   <div><strong>{daysToMythic===null?'—':daysToMythic}</strong><small>天</small><span>首项成就至 Mythic</span></div>
   <div><strong>{baseTotal}</strong><small>个</small><span>本体成就数</span></div>
  </div>
  <footer className="mythic-poster-footer">
   <span className="mythic-poster-brand">✳ XBOX PLAYLOG</span>
   <span>这份 Mythic，值得一张奖牌</span>
  </footer>
  <div className="mythic-poster-gamepad" aria-hidden="true">
   <span>A</span><span>B</span><span>X</span><span>Y</span>
  </div>
  <div className="mythic-poster-shimmer" aria-hidden="true"/>
 </article>;
}

export function MythicPosterWall({posters,profile,initialGameId,onClose}:{
 posters:MythicPoster[];profile:Profile;initialGameId?:string|null;onClose:()=>void;
}){
 const initial=Math.max(0,posters.findIndex(p=>p.game.id===initialGameId));
 const [index,setIndex]=useState(initial);
 const [celebrate,setCelebrate]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const touchStart=useRef<{x:number;y:number}|null>(null);
 const dismiss=useRef(onClose);dismiss.current=onClose;
 useEffect(()=>{
  const previous=document.body.style.overflow,focused=document.activeElement as HTMLElement|null;
  document.body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();dismiss.current();}
   if(event.key==='ArrowLeft'){event.preventDefault();setIndex(i=>Math.max(0,i-1));}
   if(event.key==='ArrowRight'){event.preventDefault();setIndex(i=>Math.min(posters.length-1,i+1));}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previous;focused?.focus({preventScroll:true});};
 },[posters.length]);
 useEffect(()=>{
  if(!celebrate)return;
  const timeout=window.setTimeout(()=>setCelebrate(false),4200);
  return()=>window.clearTimeout(timeout);
 },[celebrate]);
 // Once the first card is left, the celebration does not replay on any swipe.
 useEffect(()=>{if(index!==initial)setCelebrate(false);},[index,initial]);
 const visiblePosters=useMemo(()=>posters.map((entry,i)=>({entry,i,visible:Math.abs(i-index)<=1})),[posters,index]);
 function onTouchEnd(event:React.TouchEvent){
  const start=touchStart.current;touchStart.current=null;
  if(!start||event.changedTouches.length!==1)return;
  const dx=event.changedTouches[0].clientX-start.x;
  const dy=event.changedTouches[0].clientY-start.y;
  if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.2)return;
  setIndex(i=>Math.max(0,Math.min(posters.length-1,i+(dx<0?1:-1))));
 }
 return <div className="mythic-wall-overlay" role="dialog" aria-modal="true" aria-label="Mythic纪念墙">
  <header className="mythic-wall-header">
   <div><span className="mythic-wall-eyebrow">YOUR MYTHIC LEGACY</span><strong>Mythic纪念墙</strong></div>
   <span className="mythic-wall-counter" aria-live="polite">{index+1} / {posters.length}</span>
   <button type="button" className="mythic-wall-close" onClick={onClose} aria-label="关闭Mythic纪念墙"><X size={22}/></button>
  </header>
  <div className="mythic-wall-viewport" onTouchStart={e=>{
   if(e.touches.length===1)touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }} onTouchEnd={onTouchEnd} onTouchCancel={()=>touchStart.current=null}>
   <div className="mythic-wall-track" style={{transform:`translate3d(-${index*100}%,0,0)`}}>
    {visiblePosters.map(({entry,i,visible})=><div className="mythic-wall-slide" key={entry.game.id}
     aria-hidden={index!==i}>
     {visible&&<MythicPosterCard entry={entry} profile={profile} index={i} total={posters.length} active={i===index}/>}
    </div>)}
   </div>
  </div>
  <nav className="mythic-wall-controls" aria-label="切换Mythic纪念卡">
   <button type="button" onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={index===0} aria-label="上一张Mythic纪念卡"><ChevronLeft size={22}/></button>
   <span>左右滑动，回顾每一次 Mythic</span>
   <button type="button" onClick={()=>setIndex(i=>Math.min(posters.length-1,i+1))}
    disabled={index===posters.length-1} aria-label="下一张Mythic纪念卡"><ChevronRight size={22}/></button>
  </nav>
  {celebrate&&<div className="mythic-wall-confetti" data-confetti="opening" aria-hidden="true">
   {confetti.map((piece,i)=><i key={i} style={{
    left:piece.left,backgroundColor:piece.color,width:piece.width,height:piece.height,
    animationDelay:piece.delay,animationDuration:piece.duration,
    '--mythic-drift':piece.drift,'--mythic-turn':piece.rotate
   } as CSSProperties}/>)}
  </div>}
 </div>;
}
