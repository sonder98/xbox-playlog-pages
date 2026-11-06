import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {ChevronLeft,ChevronRight,CircleUserRound,Sparkles,X} from 'lucide-react';
import type {Profile,Game,Achievement} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {posterLocalDate} from '../mythic-posters';
import {MythicBadgeArt} from './mythic-badge';
import {mythicBackdrop,mythicCover,mythicImageAlreadyDecoded,prepareMythicPoster,warmMythicFonts,warmMythicImage,warmMythicPoster} from '../mythic-assets';
import {MythicOpeningFireworks} from './mythic-fireworks';
import {flyMythicIn,flyMythicOut,type MythicFlightOrigin} from './mythic-transition';

const GOLD='#e6c47b';
function useDecodedArt(url:string|undefined){
 // Do not flash a placeholder on every reopen when the image was already
 // decoded by the dashboard's warmup or a previous visit.
 const [ready,setReady]=useState(()=>mythicImageAlreadyDecoded(url));
 useEffect(()=>{
  let active=true;
  setReady(mythicImageAlreadyDecoded(url));
  if(url)void warmMythicImage(url).then(ok=>{if(active)setReady(ok);});
  return()=>{active=false;};
 },[url]);
 return [ready,()=>setReady(true)] as const;
}
function MythicEmblem({className=''}:{className?:string}){
 return <span className={'mythic-poster-emblem '+className} aria-label="Mythic 徽章">
  <MythicBadgeArt/>
 </span>;
}
function MomentArt({achievement,active}:{achievement:Achievement|null;active:boolean}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[achievement?.id]);
 const image=achievement?.cachedImage||achievement?.image;
 const [ready,onLoaded]=useDecodedArt(image);
 return <span className="mythic-poster-achievement-art">
  <Sparkles size={25} strokeWidth={1.3} aria-hidden="true"/>
  {image&&!failed&&<img src={image} alt="" loading={active?'eager':'lazy'} decoding="async"
   className={ready?'is-loaded':''} onLoad={onLoaded} onError={()=>setFailed(true)}/>}
 </span>;
}
function OrnateBorder(){
 return <svg className="mythic-poster-ornament" viewBox="0 0 420 748" preserveAspectRatio="none" aria-hidden="true">
  <rect x="4" y="4" width="412" height="740" rx="22" stroke="#dcc084" strokeOpacity=".95" fill="none" strokeWidth="1.1"/>
  <rect x="12" y="12" width="396" height="724" rx="17" stroke="#e2c383" strokeOpacity=".42" fill="none" strokeWidth=".7"/>
  <path d="M25 87V48Q25 26 47 26H92 M395 87V48Q395 26 373 26H328
           M25 661V700Q25 722 47 722H92 M395 661V700Q395 722 373 722H328"
   fill="none" stroke="#d8b374" strokeWidth="1.15" strokeOpacity=".78"/>
  <path d="M22 374h21M377 374h21M210 9l5 6-5 6-5-6zM210 739l5-6-5-6-5 6z
           M7 374l7-4 7 4-7 4zM413 374l-7-4-7 4 7 4z"
   fill="#e9cb8b" stroke="#e9cb8b" strokeWidth=".75"/>
  {Array.from({length:12},(_,i)=><g key={i} fill="#d6b777" opacity=".58">
   <path d={`M${41+i*31} 14l2.6 2.6-2.6 2.6-2.6-2.6z`}/>
   <path d={`M${41+i*31} 734l2.6-2.6-2.6-2.6-2.6 2.6z`}/>
  </g>)}
  <g fill="#f0d9a2">
   <path d="M25 25l6-6 6 6-6 6zM395 25l6-6 6 6-6 6zM25 723l6-6 6 6-6 6zM395 723l6-6 6 6-6 6z"/>
  </g>
 </svg>;
}
function MythicPosterCard({entry,profile,index,total,active,opening,fontReady}:{
 entry:MythicPoster;profile:Profile;index:number;total:number;active:boolean;opening:boolean;fontReady:boolean;
}){
 const {game,firstAt,mythicAt,firstAchievement,lastBaseAchievement,daysToMythic,baseTotal}=entry;
 const first=posterLocalDate(firstAt),finish=posterLocalDate(mythicAt);
 // The first AU Store Screenshot is the collectible's cinematic backdrop.
 // Older snapshots and titles without screenshots may fall back to wide Store art.
 // Never stretch a square library cover into this area.
 const screenshot=game.posterImagePurpose==='Screenshot';
 const background=mythicBackdrop(game);
 const cover=mythicCover(game);
 const [backdropReady]=useDecodedArt(background);
 const [coverReady,onCoverLoaded]=useDecodedArt(cover);
 const [avatarReady,onAvatarLoaded]=useDecodedArt(profile.avatar);
 return <article className={'mythic-poster'+(active?' is-active':'')+(opening?' is-opening':'')+(!fontReady?' is-type-loading':'')} data-poster-game={game.id}
  aria-label={game.name+' Mythic 纪念卡'}>
  <div className={'mythic-poster-backdrop'+(background?' has-promotional-art':'')+(backdropReady?' is-loaded':'')}
   data-art-source={screenshot&&game.posterImage?'store-screenshot':game.posterImage?'store-poster':background?'store-hero':'no-promotional-art'}
   style={background?{backgroundImage:`url("${background.replaceAll('"','%22')}")`}:undefined}/>
  <div className="mythic-poster-backdrop-shade"/>
  <OrnateBorder/>
  <div className="mythic-poster-stars" aria-hidden="true">
   {Array.from({length:15},(_,i)=><span key={i} style={{'--i':i,left:`${12+(i*37)%74}%`,top:`${7+(i*31)%78}%`} as CSSProperties}>✦</span>)}
  </div>
  <header className="mythic-poster-caption"><span>MYTHIC</span><span>NO. {String(total-index).padStart(3,'0')}</span></header>
  <div className="mythic-poster-portrait">
   <Sparkles className="mythic-poster-image-placeholder" size={54} color={GOLD}/>
   {cover&&<img src={cover} alt="" width={256} height={256} loading={active?'eager':'lazy'}
    fetchPriority={active?'high':'auto'} decoding="async" className={coverReady?'is-loaded':''}
    onLoad={onCoverLoaded}/>}
  </div>
  <MythicEmblem/>
  <div className="mythic-poster-congratulations">
   <span className="mythic-poster-gold-line">✧</span>
   <strong>恭喜 <span>MYTHIC</span></strong>
   <span className="mythic-poster-gold-line">✧</span>
  </div>
  <h2 className="mythic-poster-title">{game.name}</h2>
  <div className="mythic-poster-player">
   {profile.avatar?<span className="mythic-poster-avatar-frame">
    <CircleUserRound size={24} color={GOLD} aria-hidden="true"/>
    <img src={profile.avatar} alt="" className={'mythic-poster-avatar'+(avatarReady?' is-loaded':'')}
     width={36} height={36} loading="eager" fetchPriority="high" decoding="async"
     onLoad={onAvatarLoaded}/>
   </span>:<CircleUserRound size={33} color={GOLD} aria-hidden="true"/>}
   <strong>{profile.gamertag||'Xbox 玩家'}</strong>
  </div>
  <div className="mythic-poster-achievement-pair">
   <div className="mythic-poster-achievement">
    <MomentArt achievement={firstAchievement} active={active}/>
    <small>首项成就</small>
    <b>{first.date}</b>
    <span>{first.time}</span>
   </div>
   <span className="mythic-poster-bridge" aria-hidden="true">✦</span>
   <div className="mythic-poster-achievement">
    <MomentArt achievement={lastBaseAchievement} active={active}/>
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
  <div className="mythic-poster-footer" role="note">
   <span className="mythic-poster-brand">✳ XBOX PLAYLOG</span>
   <span>这份 Mythic，值得一张纪念卡</span>
  </div>
  <div className="mythic-poster-gamepad" aria-hidden="true">
   <span>A</span><span>B</span><span>X</span><span>Y</span>
  </div>
  {!fontReady&&<div className="mythic-poster-type-placeholder" aria-hidden="true"><i/><i/></div>}
  <div className="mythic-poster-shimmer" aria-hidden="true"/>
  {opening&&<div className="mythic-poster-opening-glint" aria-hidden="true"/>}
 </article>;
}

export function MythicPosterWall({posters,profile,initialGameId,allowNavigation=false,flightOrigin,onClose}:{
 posters:MythicPoster[];profile:Profile;initialGameId?:string|null;
 allowNavigation?:boolean;flightOrigin?:MythicFlightOrigin;onClose:()=>void;
}){
 // Selecting a card in the cabinet chooses the initial index, not single-card
 // mode; the game-detail shortcut still opens only its own collectible.
 const single=!allowNavigation&&initialGameId!==null&&initialGameId!==undefined;
 const initial=Math.max(0,posters.findIndex(p=>p.game.id===initialGameId));
 const [index,setIndex]=useState(initial);
 const [phase,setPhase]=useState<'entering'|'revealing'|'idle'|'flying-out'|'fading-out'>(()=>
  flightOrigin&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches?'entering':'idle');
 const wallRef=useRef<HTMLDivElement>(null);
 const exitCleanup=useRef<(()=>void)|null>(null);
 const closing=useRef(false);
 useLayoutEffect(()=>{
  if(!flightOrigin||phase!=='entering')return;
  const target=wallRef.current?.querySelector<HTMLElement>('.mythic-poster.is-active');
  if(!target){setPhase('idle');return;}
  // The painted original moves immediately. Keep it in front until every
  // enlarged illustration and the final fonts are decoded behind it.
  const chosen=posters[initial];
  return flyMythicIn(flightOrigin,target,
   chosen?prepareMythicPoster(chosen,profile):Promise.resolve(),
   ()=>setPhase('revealing'),()=>setPhase('idle'));
 // Initial geometry only; later swipes keep the poster in place.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>()=>{exitCleanup.current?.();},[]);
 function requestClose(){
  if(closing.current)return;
  if(!flightOrigin||phase==='entering'||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   onClose();return;
  }
  closing.current=true;
  const source=wallRef.current?.querySelector<HTMLElement>('.mythic-poster.is-active');
  const currentId=posters[index]?.game.id;
  const matching=[...document.querySelectorAll<HTMLElement>('.mythic-showcase-item')]
   .find(el=>el.dataset.showcaseGame===currentId);
  const destination=matching?.querySelector<HTMLElement>('.mythic-showcase-poster')||null;
  const r=destination?.getBoundingClientRect();
  if(!source||!r||r.bottom<0||r.top>window.innerHeight){
   setPhase('fading-out');
   window.setTimeout(onClose,220);
   return;
  }
  setPhase('flying-out');
  exitCleanup.current=flyMythicOut(source,destination,onClose);
 }
 const [fontReady,setFontReady]=useState(false);
 useEffect(()=>{
  let mounted=true;
  void warmMythicFonts().then(()=>{if(mounted)setFontReady(true);});
  return()=>{mounted=false;};
 },[]);
 useEffect(()=>{
  for(let i=Math.max(0,index-1);i<=Math.min(posters.length-1,index+1);i++)
   warmMythicPoster(posters[i],profile);
 },[index,posters,profile]);
 const [celebrate,setCelebrate]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const touchStart=useRef<{x:number;y:number}|null>(null);
 const dismiss=useRef(requestClose);dismiss.current=requestClose;
 useEffect(()=>{
  const previous=document.body.style.overflow,focused=document.activeElement as HTMLElement|null;
  document.body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();dismiss.current();}
   if(!single&&event.key==='ArrowLeft'){event.preventDefault();setCelebrate(false);setIndex(i=>Math.max(0,i-1));}
   if(!single&&event.key==='ArrowRight'){event.preventDefault();setCelebrate(false);setIndex(i=>Math.min(posters.length-1,i+1));}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previous;focused?.focus({preventScroll:true});};
 },[posters.length,single]);
 useEffect(()=>{
  if(!celebrate||!fontReady||phase!=='idle')return;
  const timeout=window.setTimeout(()=>setCelebrate(false),4200);
  return()=>window.clearTimeout(timeout);
 },[celebrate,fontReady,phase]);
 // Once the first card is left, the celebration does not replay on any swipe.
 useEffect(()=>{if(index!==initial)setCelebrate(false);},[index,initial]);
 const visiblePosters=useMemo(()=>posters.map((entry,i)=>({entry,i,visible:single?i===initial:Math.abs(i-index)<=1}))
  .filter(item=>!single||item.visible),[posters,index,initial,single]);
 function onTouchEnd(event:React.TouchEvent){
  if(single)return;
  const start=touchStart.current;touchStart.current=null;
  if(!start||event.changedTouches.length!==1)return;
  const dx=event.changedTouches[0].clientX-start.x;
  const dy=event.changedTouches[0].clientY-start.y;
  if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.2)return;
  setCelebrate(false);
  setIndex(i=>Math.max(0,Math.min(posters.length-1,i+(dx<0?1:-1))));
 }
 return <div ref={wallRef} className={'mythic-wall-overlay'+(phase!=='idle'?' is-'+phase:'')} role="dialog" aria-modal="true"
  aria-label={single?'Mythic纪念卡':'Mythic纪念墙'} data-display-mode={single?'single':'wall'}
  data-entry={allowNavigation?'showcase':single?'detail':'legacy'} data-transition={phase}>
  <header className="mythic-wall-header">
   <div><span className="mythic-wall-eyebrow">YOUR MYTHIC LEGACY</span>
    <strong>{single?'Mythic纪念卡':allowNavigation?'Mythic纪念卡':'Mythic纪念墙'}</strong></div>
   {!single&&<span className="mythic-wall-counter" aria-live="polite">{index+1} / {posters.length}</span>}
   <button type="button" className="mythic-wall-close" onClick={requestClose} aria-label={allowNavigation?'返回展示柜':single?'关闭Mythic纪念卡':'关闭Mythic纪念墙'}><X size={22}/></button>
  </header>
  <div className="mythic-wall-viewport" onTouchStart={e=>{
   if(!single&&e.touches.length===1)touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }} onTouchEnd={onTouchEnd} onTouchCancel={()=>touchStart.current=null}>
   <div className="mythic-wall-track" style={{transform:single?'none':`translate3d(-${index*100}%,0,0)`}}>
    {visiblePosters.map(({entry,i,visible})=><div className="mythic-wall-slide" key={entry.game.id}
     aria-hidden={index!==i}>
     {visible&&<MythicPosterCard entry={entry} profile={profile} index={i} total={posters.length}
      active={i===index} opening={i===initial&&celebrate&&fontReady&&phase==='idle'} fontReady={fontReady}/>} 
    </div>)}
   </div>
  </div>
  {single&&<div className="mythic-wall-bottom-spacer" aria-hidden="true"/>}
  {!single&&<nav className="mythic-wall-controls" aria-label="切换Mythic纪念卡">
   <button type="button" onClick={()=>{setCelebrate(false);setIndex(i=>Math.max(0,i-1));}} disabled={index===0} aria-label="上一张Mythic纪念卡"><ChevronLeft size={22}/></button>
   <span>左右滑动，回顾每一次 Mythic</span>
   <button type="button" onClick={()=>{setCelebrate(false);setIndex(i=>Math.min(posters.length-1,i+1));}}
    disabled={index===posters.length-1} aria-label="下一张Mythic纪念卡"><ChevronRight size={22}/></button>
  </nav>}
  {celebrate&&fontReady&&phase==='idle'&&index===initial&&<MythicOpeningFireworks/>}
 </div>;
}
