import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronRight,Clock3,Gem,Trophy,X} from 'lucide-react';
import type {Game} from '../data';
import {GamerscoreIcon} from './gamerscore-icon';
import {buildActivity,calendarHalf,dayLabel,heatLevel,recentDays,type Activity,type UnlockEvent} from '../achievement-activity';

const fmt=(n:number)=>n.toLocaleString('zh-CN');
const time=(value:number)=>new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
function Art({src,alt='',className}:{src?:string;alt?:string;className:string}){
 const [broken,setBroken]=useState(false);
 useEffect(()=>setBroken(false),[src]);
 return <span className={className}>{src&&!broken?<img src={src} alt={alt} loading="lazy" onError={()=>setBroken(true)}/>:<Trophy size={19} aria-hidden="true"/>}</span>;
}
function Calendar({activity,year,half,selected,onSelect}:{activity:Activity;year:number;half:0|1;selected:string|null;onSelect:(day:string,button:HTMLButtonElement)=>void}){
 const calendar=useMemo(()=>calendarHalf(year,half,activity.today),[year,half,activity.today]);
 return <div className="ah-half" data-year={year} data-half={half}>
  <div className="ah-months"><span aria-hidden="true"/><div className="ah-month-grid" style={{gridTemplateColumns:'repeat('+calendar.columns+',minmax(0,1fr))'}}>{calendar.months.map(m=><span key={m.label} style={{gridColumnStart:m.column+1}}>{m.label}</span>)}</div></div>
  <div className="ah-week-area"><div className="ah-weekdays" aria-hidden="true"><span>一</span><span>三</span><span>五</span></div>
   <div className="ah-day-grid" style={{gridTemplateColumns:'repeat('+calendar.columns+',minmax(0,1fr))'}}>
    {calendar.days.map((d,i)=>{
     if(!d.day)return <span className="ah-blank-day" aria-hidden="true" key={'blank-'+i}/>;
     const count=activity.byDay.get(d.day)?.events.length||0;
     return <button key={d.day} type="button" className={'ah-cell ah-level-'+heatLevel(count)+(selected===d.day?' is-selected':'')} aria-label={dayLabel(d.day)+'，解锁 '+count+' 个成就'} aria-pressed={selected===d.day} disabled={d.future} title={dayLabel(d.day)+' · '+count+' 个成就'} onClick={e=>onSelect(d.day,e.currentTarget)}/>;
    })}
   </div>
  </div>
 </div>;
}
function Legend(){return <div className="ah-legend"><span>每日解锁强度</span><div className="ah-legend-right"><small>少</small>{[0,1,2,3,4].map(x=><i key={x} className={'ah-level-'+x}/>)}<small>多</small></div></div>;}
export function AchievementPreview({games,onOpen}:{games:Game[];onOpen:()=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const days=recentDays(activity);
 const count=days.reduce((sum,d)=>sum+d.count,0),active=days.filter(d=>d.count>0).length;
 return <section className="panel ah-preview" data-overview-section="heatmap">
  <button className="ah-preview-link" type="button" onClick={onOpen} aria-label="查看全部成就热力图">
   <span className="ah-preview-heading"><span><strong>成就热力图</strong><small>最近 30 天的解锁活跃度</small></span><span className="ah-preview-more">查看全部 <ChevronRight size={17}/></span></span>
   <span className="ah-preview-grid" aria-hidden="true">{days.map(d=><span className={'ah-preview-cell ah-level-'+heatLevel(d.count)} key={d.day}/>)}</span>
   <span className="ah-preview-footer"><span>解锁 {fmt(count)} 个 · 活跃 {active} 天</span><ArrowRight size={17}/></span>
  </button>
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
   <div className="ah-sheet-total"><strong>{fmt(count)}</strong><span>个成就 · {games.length} 款游戏</span></div>
   <div className="ah-sheet-games">
    {games.length?games.slice(0,3).map(({game,count:num})=><div className="ah-sheet-game" key={game.id}><Art src={game.cachedImage||game.image} className="ah-mini-art"/><span>{game.name}</span><b>{num} 个</b></div>):<p className="ah-no-activity">这一天没有解锁成就</p>}
    {games.length>3&&<p className="ah-more-games">另有 {games.length-3} 款游戏，共 {games.slice(3).reduce((s,g)=>s+g.count,0)} 个成就</p>}
   </div>
   <button type="button" className="ah-sheet-action" onClick={onDetail}>查看当天全部成就 <ArrowRight size={18}/></button>
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
export function AchievementJourney({games,dayId,onBack,onOpenDay,onOpenGame}:{games:Game[];dayId:string|null;onBack:()=>void;onOpenDay:(day:string)=>void;onOpenGame:(id:string)=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const [selected,setSelected]=useState<string|null>(null);
 const [sheetDay,setSheetDay]=useState<string|null>(null);
 const [ascending,setAscending]=useState(true);
 const lastFocus=useRef<HTMLButtonElement|null>(null);
 const closeSheet=()=>{setSheetDay(null);requestAnimationFrame(()=>lastFocus.current?.focus({preventScroll:true}));};
 const selectDay=(date:string,button:HTMLButtonElement)=>{
  lastFocus.current=button;setSelected(date);setSheetDay(date);
 };
 const years=Array.from({length:Math.max(0,Number(activity.today.slice(0,4))-2021)},(_,i)=>Number(activity.today.slice(0,4))-i);
 const bucket=dayId?activity.byDay.get(dayId):undefined;
 if(dayId){
  const events=ascending?[...(bucket?.events||[])]:[...(bucket?.events||[])].reverse();
  return <section className="ah-page ah-day-detail">
   <button className="ah-back" onClick={onBack}><ArrowLeft size={20}/> 返回热力图</button>
   <h1>{dayLabel(dayId)}</h1><p className="ah-intro">解锁 {bucket?.events.length||0} 个成就 · 涉及 {bucket?.games.length||0} 款游戏</p>
   <div className="ah-day-toolbar"><span><Clock3 size={16}/> 按解锁时间</span><button aria-label="切换解锁时间排序" type="button" onClick={()=>setAscending(v=>!v)}>{ascending?'早 → 晚':'晚 → 早'} <span aria-hidden="true">↕</span></button></div>
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
  {years.map(year=><section className="ah-year" key={year} aria-label={year+' 年成就热力图'}>
   <div className="ah-year-heading"><h2>{year} 年</h2><span>解锁 {fmt(activity.years.get(year)||0)} 个成就</span></div>
   <Calendar activity={activity} year={year} half={0} selected={selected} onSelect={selectDay}/>
   <Calendar activity={activity} year={year} half={1} selected={selected} onSelect={selectDay}/>
  </section>)}
  {!activity.total&&<p className="ah-empty-day">尚无带有效解锁时间的成就。完成 Xbox 同步后会自动显示。</p>}
  <p className="ah-footnote">统计来自已展示游戏中带解锁时间的成就；没有解锁时间的记录无法归入具体日期。时间采用北京时间。</p>
  {sheetDay&&<Sheet day={sheetDay} activity={activity} onClose={closeSheet} onDetail={()=>{setSheetDay(null);onOpenDay(sheetDay);}}/>}
 </section>;
}
