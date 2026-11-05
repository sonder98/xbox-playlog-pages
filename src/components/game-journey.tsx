import {useEffect,useId,useMemo,useState,type ReactNode,type RefObject} from 'react';
import {ArrowUpRight,CalendarDays,CheckCircle2,ChevronDown,Clock3,Flame,Gamepad2,Gem,MoonStar,Trophy} from 'lucide-react';
import type {Achievement,Game} from '../data';
import {buildGameJourney,type JourneyHighlight} from '../game-journey';

const dateLabel=(day:string)=>day.slice(0,4)+' 年 '+Number(day.slice(5,7))+' 月 '+Number(day.slice(8))+' 日';
const shortDay=(day:string)=>day.slice(5,7)+'.'+day.slice(8);
const monthLabel=(month:string)=>month.slice(0,4)+' 年 '+Number(month.slice(5))+' 月';
const highlightIcons={night:MoonStar,burst:Flame,rare:Gem,full:CheckCircle2,mythic:Trophy,first:Gamepad2};

function AchievementThumbnail({achievement}:{achievement:Achievement}){
 const [failed,setFailed]=useState(false);
 const image=achievement.cachedImage||achievement.image;
 return <span className="journey-award-icon">
  {image&&!failed?<img src={image} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<Trophy size={20} aria-hidden="true"/>}
 </span>;
}
function MomentCard({moment,primary,onOpen}:{moment:JourneyHighlight;primary:boolean;onOpen:()=>void}){
 const Icon=highlightIcons[moment.kind];
 return <button type="button" className={'journey-moment '+(primary?'journey-moment-featured':'journey-moment-small')}
  data-kind={moment.kind} onClick={onOpen} aria-label={'查看 '+dateLabel(moment.day)+' · '+moment.title}>
  <span className="journey-moment-icon"><Icon size={primary?23:18} aria-hidden="true"/></span>
  <span className="journey-moment-copy">
   <span className="journey-moment-label">{moment.title}</span>
   <strong>{moment.headline}</strong>
   {primary&&<span className="journey-moment-description">{moment.description}</span>}
   <span className="journey-moment-date">{dateLabel(moment.day)}</span>
  </span>
  {primary?<span className="journey-moment-cta">回到这一天 <ArrowUpRight size={15}/></span>:
   <ArrowUpRight className="journey-moment-arrow" size={17} aria-hidden="true"/>}
 </button>;
}

export function GameJourney({game,cover,bodyRef}:{game:Game;cover:ReactNode;bodyRef:RefObject<HTMLDivElement|null>}){
 const model=useMemo(()=>buildGameJourney(game),[game]);
 const baseId=useId().replaceAll(':','');
 const [monthsOpen,setMonthsOpen]=useState<string[]>(model.months[0]?[model.months[0].month]:[]);
 const [daysOpen,setDaysOpen]=useState<string[]>([]);
 const [focusedDay,setFocusedDay]=useState<string|null>(null);
 const [jumpNumber,setJumpNumber]=useState(0);
 useEffect(()=>{
  if(!focusedDay)return;
  const frame=requestAnimationFrame(()=>{
   const container=bodyRef.current;
   const day=container?.querySelector<HTMLElement>('[data-journey-day="'+focusedDay+'"]');
   if(!container||!day)return;
   const target=container.scrollTop+day.getBoundingClientRect().top-container.getBoundingClientRect().top-16;
   container.scrollTo({top:Math.max(0,target),behavior:'smooth'});
  });
  return ()=>cancelAnimationFrame(frame);
 },[focusedDay,monthsOpen,daysOpen,bodyRef,jumpNumber]);
 function jumpToDay(day:string){
  const month=day.slice(0,7);
  setMonthsOpen(current=>current.includes(month)?current:[...current,month]);
  setDaysOpen(current=>current.includes(day)?current:[...current,day]);
  setFocusedDay(day);
  setJumpNumber(n=>n+1);
 }
 function toggleMonth(month:string){
  setMonthsOpen(current=>current.includes(month)?current.filter(x=>x!==month):[...current,month]);
  setFocusedDay(null);
 }
 function toggleDay(day:string){
  setDaysOpen(current=>current.includes(day)?current.filter(x=>x!==day):[...current,day]);
  setFocusedDay(null);
 }
 return <div className="game-journey" data-game-journey={game.id}>
  <div className="journey-hero">
   <span className="journey-hero-cover">{cover}</span>
   <span className="journey-hero-copy">
    <span className="journey-overline">GAMING JOURNEY / 游戏历程</span>
    <strong>{game.name}</strong>
    <span>每一个解锁瞬间，都值得收藏。</span>
   </span>
  </div>
  <div className="journey-metrics">
   <div><Clock3 size={17}/><strong>{game.minutes===null?'—':(game.minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1})+' h'}</strong><small>累计游玩时长</small></div>
   <div><CalendarDays size={17}/><strong>{model.unlockDays} 天</strong><small>有记录的成就解锁日</small></div>
   <div><Trophy size={17}/><strong>{model.firstToFullDays===null?'—':model.firstToFullDays+' 天'}</strong><small>首项成就 → Full</small></div>
   <div><CheckCircle2 size={17}/><strong>{model.mythicToFullDays===null?'—':model.mythicToFullDays+' 天'}</strong><small>Mythic → Full</small></div>
  </div>
  {model.highlights.length>0&&<section className="journey-section" aria-label="特别时刻">
   <h3 className="journey-section-title">特别时刻 <small>Special Moments</small></h3>
   <MomentCard moment={model.highlights[0]} primary onOpen={()=>jumpToDay(model.highlights[0].day)}/>
   {model.highlights.length>1&&<div className="journey-moments-more">
    {model.highlights.slice(1).map(moment=><MomentCard key={moment.kind} moment={moment} primary={false}
     onOpen={()=>jumpToDay(moment.day)}/>)}
   </div>}
  </section>}
  {model.milestones.length>0&&<section className="journey-section" aria-label="重要里程碑">
   <h3 className="journey-section-title">重要里程碑 <small>Milestones</small></h3>
   <div className="journey-milestone-list">
    {model.milestones.map(m=><div className={'journey-milestone'+(m.important?' is-major':'')} key={m.id}>
     <div className="journey-calendar-date"><small>{Number(m.day.slice(5,7))} 月</small><strong>{m.day.slice(8)}</strong></div>
     <span className="journey-milestone-track" aria-hidden="true"/>
     <button type="button" className="journey-milestone-event" onClick={()=>jumpToDay(m.day)}
      aria-label={'定位里程碑 '+m.title+'，'+dateLabel(m.day)}>
      <span className="journey-milestone-top">
       <strong>{m.title}</strong>
       {m.important&&<span className="journey-milestone-badge">{m.id==='full'?'FULL':'MYTHIC'}</span>}
      </span>
      <span className="journey-milestone-bottom">
       <span>{m.detail}</span>
       <span>{m.sincePrevious===null?'查看 ↗':m.sincePrevious===0?'同日 ↗':'间隔 '+m.sincePrevious+' 天 ↗'}</span>
      </span>
     </button>
    </div>)}
   </div>
  </section>}
  <section className="journey-section journey-timeline" aria-label="成就时间轴">
   <h3 className="journey-section-title">成就时间轴 <small>Achievement Timeline</small></h3>
   <p className="journey-timeline-intro">按月份和日期整理，点击日期查看当天解锁的成就。</p>
   {model.missingUnlockTimes>0&&<p className="journey-coverage-note">{model.missingUnlockTimes} 项已解锁成就缺少准确时间，未纳入时间轴。</p>}
   {model.months.length===0?<p className="journey-empty">当前没有带解锁时间的成就记录。可以继续查看游戏详情中的成就列表。</p>:
    model.months.map(month=><section className="journey-month" key={month.month} data-journey-month={month.month}>
     <button type="button" className="journey-month-toggle" aria-expanded={monthsOpen.includes(month.month)}
      aria-controls={baseId+'-month-'+month.month} onClick={()=>toggleMonth(month.month)}>
      <span><CalendarDays size={17} aria-hidden="true"/><strong>{monthLabel(month.month)}</strong></span>
      <span className="journey-month-meta">{month.count} 项 · {month.days.length} 个解锁日 <ChevronDown size={17}/></span>
     </button>
     {monthsOpen.includes(month.month)&&<div id={baseId+'-month-'+month.month} className="journey-month-days">
      {month.days.map(day=>{
       const open=daysOpen.includes(day.day);
       const milestones=model.milestones.filter(m=>m.day===day.day&&m.important);
       return <section key={day.day} data-journey-day={day.day}
        className={'journey-day'+(focusedDay===day.day?' is-highlighted':'')}>
        <button type="button" className="journey-day-toggle" aria-expanded={open}
         aria-controls={baseId+'-day-'+day.day} onClick={()=>toggleDay(day.day)}>
         <strong>{shortDay(day.day)}</strong>
         {milestones.length>0&&<span className="journey-day-badge">{milestones.map(m=>m.id.toUpperCase()).join(' · ')}</span>}
         {day.nightCount>=2&&<span className="journey-day-night"><MoonStar size={12}/> 凌晨 {day.nightCount} 项</span>}
         <span className="journey-day-count">{day.events.length} 项</span>
         <ChevronDown size={17} aria-hidden="true"/>
        </button>
        {open&&<div className="journey-day-events" id={baseId+'-day-'+day.day}>
         {day.events.map(e=><div key={e.achievement.id} className="journey-achievement">
          <AchievementThumbnail achievement={e.achievement}/>
          <span className="journey-achievement-content">
           <strong>{e.achievement.name}</strong>
           {e.achievement.description&&<span>{e.achievement.description}</span>}
           {e.achievement.rarity!==null&&e.achievement.rarity<10&&<small>稀有度 {e.achievement.rarity}%</small>}
          </span>
          <time dateTime={new Date(e.timestamp).toISOString()}>{e.clock}</time>
         </div>)}
        </div>}
       </section>;
      })}
     </div>}
    </section>)}
  </section>
  <p className="journey-data-note">时间统一使用北京时间（UTC+8）。Xbox 累计时长无法还原历史首次游玩日期与完整游玩天数，以上仅展示可验证的记录。</p>
 </div>;
}
