import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronLeft,ChevronRight,Gem,Trophy,X} from 'lucide-react';
import type {Game} from '../data';
import {GamerscoreIcon} from './gamerscore-icon';
import {AchievementSortControl} from './achievement-sort-control';
import {sortAchievements,type AchievementSort} from '../achievement-sort';
import {adjacentDay,buildActivity,calendarMonth,dayLabel,heatLevel,recentCalendar,recentDays,type Activity,type UnlockEvent} from '../achievement-activity';

const fmt=(n:number)=>n.toLocaleString('zh-CN');
const time=(value:number)=>new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
function Art({src,alt='',className}:{src?:string;alt?:string;className:string}){
 const [broken,setBroken]=useState(false),[artRatio,setArtRatio]=useState<number|null>(null);
 useEffect(()=>{setBroken(false);setArtRatio(null);},[src]);
 const artwork=className==='ah-achievement-art';
 const square=artwork&&artRatio!==null&&artRatio<1.35;
 return <span className={className+(square?' ah-art-square':'')}
  style={artwork&&artRatio?{aspectRatio:String(artRatio)}:undefined}>
  {src&&!broken?<img src={src} alt={alt} loading="lazy"
   onLoad={e=>{if(artwork){const img=e.currentTarget;setArtRatio(Math.min(2.5,Math.max(.7,img.naturalWidth/img.naturalHeight)));}}}
   onError={()=>setBroken(true)}/>:<Trophy size={19} aria-hidden="true"/>}
 </span>;
}
const weekdays=['一','二','三','四','五','六','日'];
function Calendar({activity,year,month,selected,onSelect}:{activity:Activity;year:number;month:number;selected:string|null;onSelect:(day:string,button:HTMLButtonElement)=>void}){
 const calendar=useMemo(()=>calendarMonth(year,month,activity.today),[year,month,activity.today]);
 const monthEvents=calendar.days.reduce((sum,d)=>sum+(d.day?activity.byDay.get(d.day)?.events.length||0:0),0);
 return <section className="ah-month-card" data-year={year} data-month={month} aria-label={year+' 年 '+month+' 月'}>
  <div className="ah-month-title"><h2>{year} 年 {month} 月</h2><span>{monthEvents} 个成就</span></div>
  <div className="ah-calendar-weekdays" aria-hidden="true">{weekdays.map(w=><span key={w}>{w}</span>)}</div>
  <div className="ah-month-calendar" data-rows={calendar.rows}>
   {calendar.days.map((d,i)=>{
    if(!d.day)return <span key={'pad-'+i} className="ah-calendar-placeholder" aria-hidden="true"/>;
    const count=activity.byDay.get(d.day)?.events.length||0;
    return <button key={d.day} type="button"
      className={'ah-cell ah-level-'+heatLevel(count)+(selected===d.day?' is-selected':'')}
      data-day={d.day} aria-label={dayLabel(d.day)+'，解锁 '+count+' 个成就'}
      aria-pressed={selected===d.day} disabled={d.future}
      title={dayLabel(d.day)+' · '+count+' 个成就'}
      onClick={e=>onSelect(d.day!,e.currentTarget)}><span aria-hidden="true">{Number(d.day.slice(-2))}</span></button>;
   })}
  </div>
 </section>;
}
function Legend(){return <div className="ah-legend"><span>每日解锁强度</span><div className="ah-legend-right"><small>少</small>{[0,1,2,3,4].map(x=><i key={x} className={'ah-level-'+x}/>)}<small>多</small></div></div>;}
export function AchievementPreview({games,onOpen,onOpenDay}:{games:Game[];onOpen:()=>void;onOpenDay:(day:string)=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const days=recentDays(activity),calendar=recentCalendar(activity);
 const [sheetDay,setSheetDay]=useState<string|null>(null);
 const count=days.reduce((sum,d)=>sum+d.count,0),active=days.filter(d=>d.count>0).length;
 const span=days[0].day.slice(5).replace('-','/')+' — '+days.at(-1)!.day.slice(5).replace('-','/');
 return <section className="panel ah-preview" data-overview-section="heatmap">
  <div className="ah-preview-heading">
   <div><strong>成就热力图</strong><small>最近 30 天 · {span}</small></div>
   <button type="button" className="ah-preview-more" onClick={onOpen} aria-label="查看全部成就热力图">查看全部 <ChevronRight size={17}/></button>
  </div>
  <div className="ah-preview-weekdays" aria-hidden="true">{weekdays.map(w=><span key={w}>{w}</span>)}</div>
  <div className="ah-preview-grid">
   {calendar.map((d,i)=>d.day?
    <button type="button" key={d.day} data-day={d.day}
     className={'ah-preview-cell ah-level-'+heatLevel(d.count)}
     aria-label={dayLabel(d.day)+'，解锁 '+d.count+' 个成就'}
     onClick={()=>setSheetDay(d.day!)}/>:<span className="ah-preview-placeholder" key={'pad-'+i} aria-hidden="true"/>)}
  </div>
  <p className="ah-preview-axis">日期：左 → 右为周一至周日，按周从上往下</p>
  <button className="ah-preview-footer" type="button" onClick={onOpen}><span>解锁 {fmt(count)} 个 · 活跃 {active} 天</span><ArrowRight size={17}/></button>
  {sheetDay&&<Sheet day={sheetDay} activity={activity} onClose={()=>setSheetDay(null)} onDetail={()=>{const day=sheetDay;setSheetDay(null);onOpenDay(day);}}/>}
 </section>;
}
function Sheet({day,activity,onClose,onDetail}:{day:string;activity:Activity;onClose:()=>void;onDetail:()=>void}){
 const bucket=activity.byDay.get(day),games=bucket?.games||[],count=bucket?.events.length||0;
 const handle=useRef<HTMLElement|null>(null),touchY=useRef<number|null>(null);
 useEffect(()=>{
  const before=document.body.style.overflow;
  document.body.style.overflow='hidden';
  handle.current?.querySelector<HTMLButtonElement>('.ah-sheet-close')?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);
  return ()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key);};
 },[onClose]);
 return <div className="ah-sheet-backdrop" onClick={onClose}>
  <section ref={handle} className="ah-sheet" role="dialog" aria-modal="true" aria-label={dayLabel(day)+' 成就摘要'} onClick={e=>e.stopPropagation()}>
   <div className="ah-sheet-grab" onTouchStart={e=>{touchY.current=e.touches[0]?.clientY??null;}} onTouchEnd={e=>{if(touchY.current!==null&&(e.changedTouches[0]?.clientY??0)-touchY.current>70)onClose();touchY.current=null;}}><i/></div>
   <header className="ah-sheet-heading"><div><strong>{dayLabel(day)}</strong><span>当天解锁记录</span></div><button className="ah-sheet-close" type="button" aria-label="关闭日期摘要" onClick={onClose}><X size={19}/></button></header>
   <div className="ah-sheet-games">
    {games.length?games.slice(0,3).map(({game,count:num})=><div className="ah-sheet-game" key={game.id}><Art src={game.cachedImage||game.image} className="ah-mini-art"/><span>{game.name}</span><b>{num} 个</b></div>):<p className="ah-no-activity">这一天没有解锁成就</p>}
    {games.length>3&&<p className="ah-more-games">另有 {games.length-3} 款游戏，共 {games.slice(3).reduce((s,g)=>s+g.count,0)} 个成就</p>}
   </div>
   <div className="ah-sheet-total"><strong>{fmt(count)}</strong><span>个成就 · {games.length} 款游戏</span></div>
   <button type="button" className="ah-sheet-action" disabled={!count} onClick={onDetail}>查看当天全部成就 <ArrowRight size={18}/></button>
  </section>
 </div>;
}
function DayCard({event,onGame}:{event:UnlockEvent;onGame:(id:string)=>void}){
 const a=event.achievement,g=event.game,rare=a.rarity!==null&&a.rarity<10;
 const group=g.groupStatus==='verified'?g.groups?.find(v=>v.achievementIds.includes(a.id)):undefined;
 return <article className="ah-achievement-card" data-achievement-id={a.id} data-game-id={g.id}>
  <div className="ah-achievement-primary">
   <Art src={a.cachedImage||a.image} className="ah-achievement-art"/>
   <div className="ah-achievement-main">
    <div className="ah-achievement-heading"><h3>{a.name}</h3><time dateTime={a.unlockedAt||undefined}>{time(event.time)}</time></div>
    {a.description&&<p className="ah-achievement-desc">{a.description}</p>}
    <div className="ah-achievement-meta">
     <span className={rare?'ah-rare':''} aria-label={a.rarity===null?'稀有度未知':'稀有度 '+a.rarity+'%'}><Gem size={14}/>{a.rarity===null?'暂无稀有度':a.rarity+'%'}</span>
     <span aria-label={(a.points||0)+' 玩家积分'}><GamerscoreIcon size={14}/>{fmt(a.points||0)}</span>
    </div>
   </div>
  </div>
  <button type="button" className="ah-game-source" onClick={()=>onGame(g.id)} aria-label={'打开 '+g.name+' 的游戏详情'}>
   <Art src={g.cachedImage||g.image} className="ah-mini-art"/><span>{g.name}</span><span className="ah-game-group">{group?.kind==='base'?'本体':group?.kind==='dlc'?'DLC':group?.kind==='update'?'更新':''}</span><ChevronRight size={15}/>
  </button>
 </article>;
}
export function AchievementJourney({games,dayId,onBack,onOpenDay,onChangeDay,onOpenGame}:{games:Game[];dayId:string|null;onBack:()=>void;onOpenDay:(day:string)=>void;onChangeDay:(day:string)=>void;onOpenGame:(id:string)=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const [selected,setSelected]=useState<string|null>(null);
 const [sheetDay,setSheetDay]=useState<string|null>(null);
 const [order,setOrder]=useState<AchievementSort>('date-asc');
 const lastFocus=useRef<HTMLButtonElement|null>(null);
 const closeSheet=()=>{setSheetDay(null);requestAnimationFrame(()=>lastFocus.current?.focus({preventScroll:true}));};
 const selectDay=(date:string,button:HTMLButtonElement)=>{
  lastFocus.current=button;setSelected(date);setSheetDay(date);
 };
 const nowYear=Number(activity.today.slice(0,4)),nowMonth=Number(activity.today.slice(5,7));
 const years=Array.from({length:Math.max(0,nowYear-2021)},(_,i)=>nowYear-i);
 const months=years.flatMap(y=>Array.from({length:y===nowYear?nowMonth:12},(_,i)=>({year:y,month:(y===nowYear?nowMonth:12)-i})));
 const bucket=dayId?activity.byDay.get(dayId):undefined;
 if(dayId){
  const entries=bucket?.events||[];
  const byAchievement=new Map(entries.map(e=>[e.achievement,e]));
  const events=sortAchievements(entries.map(e=>e.achievement),order).map(a=>byAchievement.get(a)!);
  const prev=adjacentDay(dayId,-1),next=adjacentDay(dayId,1);
  return <section className="ah-page ah-day-detail">
   <button className="ah-back" onClick={onBack}><ArrowLeft size={20}/> 返回热力图</button>
   <div className="ah-day-title"><h1>{dayLabel(dayId)}</h1><div className="ah-date-arrows">
    <button type="button" aria-label={'前一天 '+dayLabel(prev)} title="前一天" disabled={prev<'2022-01-01'} onClick={()=>onChangeDay(prev)}><ChevronLeft size={22}/></button>
    <button type="button" aria-label={'后一天 '+dayLabel(next)} title="后一天" disabled={next>activity.today} onClick={()=>onChangeDay(next)}><ChevronRight size={22}/></button>
   </div></div><p className="ah-intro">解锁 {bucket?.events.length||0} 个成就 · 涉及 {bucket?.games.length||0} 款游戏</p>
   <div className="ah-day-toolbar"><span>{events.length} 个成就</span><AchievementSortControl order={order} onChange={setOrder}/></div>
   {events.length?<div className="ah-achievement-list">{events.map(e=><DayCard key={e.key} event={e} onGame={onOpenGame}/>)}</div>:<p className="ah-empty-day">这一天没有可查询的已解锁成就。</p>}
  </section>;
 }
 return <section className="ah-page ah-full-history">
  <button className="ah-back" onClick={onBack}><ArrowLeft size={20}/> 返回概览</button>
  <div className="ah-intro-block"><h1>成就热力图</h1><p className="ah-intro">从 2022 年起，每次解锁都有迹可循</p></div>
  <div className="ah-overview-stats">
   <div><small>累计成就</small><strong>{fmt(activity.total)}</strong></div>
   <div><small>活跃天数</small><strong>{fmt(activity.activeDays)}</strong></div>
   <div><small>最长连续</small><strong>{fmt(activity.longestStreak)} 天</strong></div>
   <div><small>单日最高</small><strong>{fmt(activity.peak)} 个</strong></div>
  </div>
  <Legend/>
  <nav className="ah-year-jump" aria-label="快速跳转年份">{years.map(y=><button type="button" key={y} onClick={()=>document.getElementById('ah-year-'+y)?.scrollIntoView({behavior:'smooth',block:'start'})}>{y}</button>)}</nav>
  <div className="ah-month-list">{months.map(({year,month},index)=><div key={year+'-'+month} id={index===0||months[index-1].year!==year?'ah-year-'+year:undefined}>
   <Calendar activity={activity} year={year} month={month} selected={selected} onSelect={selectDay}/>
  </div>)}</div>
  {!activity.total&&<p className="ah-empty-day">尚无带有效解锁时间的成就。完成 Xbox 同步后会自动显示。</p>}
  <p className="ah-footnote">统计来自已展示游戏中带解锁时间的成就；没有解锁时间的记录无法归入具体日期。时间采用北京时间。</p>
  {sheetDay&&<Sheet day={sheetDay} activity={activity} onClose={closeSheet} onDetail={()=>{setSheetDay(null);onOpenDay(sheetDay);}}/>}
 </section>;
}
