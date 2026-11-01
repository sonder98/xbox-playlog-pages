import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ChevronLeft,ChevronRight,Gamepad2,Gem,Trophy} from 'lucide-react';
import type {Game,RecordData} from '../data';
import {dailyGameMinutes,type DailyPlaytimeLedger} from '../playtime-ledger';
import {GameCover} from './game';
import {monthlyPlayedGames,type MonthlyPlayed} from '../monthly-played';
import {GamerscoreIcon} from './gamerscore-icon';
import {AchievementSortControl} from './achievement-sort-control';
import {sortAchievements,type AchievementSort} from '../achievement-sort';
import {adjacentDay,buildActivity,calendarMonth,dayLabel,heatLevel,recentCalendar,recentDays,type Activity,type UnlockEvent} from '../achievement-activity';
import {rareAchievementTop,achievementRarityTier,type RareAchievement} from '../rare-achievements';
import {longestAchievementGaps} from '../achievement-gaps';
import {AchievementGapRail,AchievementGapDetails} from './achievement-gap-showcase';

const fmt=(n:number)=>n.toLocaleString('zh-CN');
const fmtDailyHours=(minutes:number|null)=>minutes===null?'— 小时':(minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:2})+' 小时';
const time=(value:number)=>new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
const fullTime=(value:number)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
function Art({src,alt='',className}:{src?:string;alt?:string;className:string}){
 const [broken,setBroken]=useState(false),[artRatio,setArtRatio]=useState<number|null>(null);
 useEffect(()=>{setBroken(false);setArtRatio(null);},[src]);
 const tokens=className.split(' ');
 const isAchievement=tokens.includes('ah-achievement-art');
 const artwork=isAchievement||tokens.includes('ah-showcase-art');
 const square=isAchievement&&artRatio!==null&&artRatio<1.35;
 return <span className={className+(square?' ah-art-square':'')}
  style={artwork&&artRatio?{aspectRatio:String(artRatio)}:undefined}>
  {src&&!broken?<img src={src} alt={alt} loading="lazy"
   onLoad={e=>{if(artwork){const img=e.currentTarget;setArtRatio(Math.min(2.5,Math.max(.7,img.naturalWidth/img.naturalHeight)));}}}
   onError={()=>setBroken(true)}/>:<Trophy size={19} aria-hidden="true"/>}
 </span>;
}
const weekdays=['一','二','三','四','五','六','日'];
function MonthPlayedList({month,played,onOpenGame}:{month:string;played:MonthlyPlayed;onOpenGame:(id:string)=>void}){
 const games=played.get(month)||[];
 return <div className="ah-month-played" data-played-month={month}>
  <div className="ah-month-played-title"><span><Gamepad2 size={15} aria-hidden="true"/>本月在玩</span><small>{games.length} 款</small></div>
  {games.length?<div className="ah-month-played-list">{games.map(game=>
   <button type="button" className="ah-month-played-game" key={game.id} data-game-id={game.id}
    aria-label={'查看 '+game.name+' 游戏详情'} onClick={()=>onOpenGame(game.id)}>
    <span className="ah-month-played-cover"><GameCover game={game}/></span>
    <span className="ah-month-played-name">{game.name}</span>
    <ChevronRight size={16} aria-hidden="true"/>
   </button>)}</div>:<p className="ah-month-played-empty">暂无可确认的游玩记录</p>}
 </div>;
}
function Calendar({activity,year,month,selected,played,onSelect,onOpenGame}:{activity:Activity;year:number;month:number;selected:string|null;played:MonthlyPlayed;onSelect:(day:string,button:HTMLButtonElement)=>void;onOpenGame:(id:string)=>void}){
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
      className={'ah-cell'+(selected===d.day?' is-selected':'')}
      data-day={d.day} aria-label={dayLabel(d.day)+'，解锁 '+count+' 个成就'}
      aria-pressed={selected===d.day} disabled={d.future}
      title={dayLabel(d.day)+' · '+count+' 个成就'}
      onClick={e=>onSelect(d.day!,e.currentTarget)}><span className={'ah-dot ah-level-'+heatLevel(count)} aria-hidden="true">{Number(d.day.slice(-2))}</span></button>;
   })}
  </div>
  <MonthPlayedList month={year+'-'+String(month).padStart(2,'0')} played={played} onOpenGame={onOpenGame}/>
 </section>;
}
export function AchievementPreview({games,records=[],playtimeLedger,onOpen,onOpenDay,onOpenGame}:{games:Game[];records?:RecordData[];playtimeLedger?:DailyPlaytimeLedger|null;onOpen:()=>void;onOpenDay:(day:string)=>void;onOpenGame:(id:string)=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const played=useMemo(()=>monthlyPlayedGames(games,records,activity),[games,records,activity]);
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
     className="ah-preview-cell"
     aria-label={dayLabel(d.day)+'，解锁 '+d.count+' 个成就'}
     onClick={()=>setSheetDay(d.day!)}><span aria-hidden="true" className={'ah-dot ah-level-'+heatLevel(d.count)}>{Number(d.day.slice(-2))}</span></button>:<span className="ah-preview-placeholder" key={'pad-'+i} aria-hidden="true"/>)}
  </div>
  <MonthPlayedList month={activity.today.slice(0,7)} played={played} onOpenGame={onOpenGame}/>
  <button className="ah-preview-footer" type="button" onClick={onOpen}><span>解锁 {fmt(count)} 个 · 活跃 {active} 天</span><ArrowRight size={17}/></button>
  {sheetDay&&<Sheet day={sheetDay} activity={activity} playtimeLedger={playtimeLedger} minDay={days[0].day} onChangeDay={setSheetDay} onClose={()=>setSheetDay(null)} onDetail={()=>{const day=sheetDay;setSheetDay(null);onOpenDay(day);}}/>}
 </section>;
}
/** Image-only carousel. The images determine their own width after loading and are never cropped. */
function ShowcaseRail({items,onOpen}:{items:RareAchievement[];onOpen:()=>void}){
 const rail=useRef<HTMLDivElement>(null);
 return <section className="ah-showcase" aria-label="稀有成就展柜" data-achievement-showcase="preview">
  <div className="ah-showcase-heading">
   <div className="ah-showcase-title-group">
    <span className="ah-showcase-trophy"><Trophy size={21} aria-hidden="true"/></span>
    <div><h2>稀有成就展柜 <span className="ah-showcase-top-label">TOP 100</span></h2><p>跨游戏 · 全球解锁率最低的 {items.length} 个已解锁成就</p></div>
   </div>
   <button type="button" className="ah-showcase-open" onClick={onOpen} disabled={!items.length} title="查看稀有成就展柜" aria-label="查看稀有成就展柜详情"><ChevronRight size={22}/></button>
  </div>
  {items.length?
   <div className="ah-showcase-rail" role="region" aria-label="稀有成就 TOP 100 图片与稀有度，横向滚动查看" tabIndex={0} ref={rail}>
    {items.map((item,i)=>{
     const tier=achievementRarityTier(item.achievement.rarity);
     return <span key={item.key} className="ah-showcase-tile" data-rarity-tier={tier}
       title={`第 ${i+1} 名 · ${item.achievement.name} · ${item.achievement.rarity}% · ${item.game.name}`}>
      <Art src={item.achievement.cachedImage||item.achievement.image} alt={item.achievement.name}
       className={'ah-showcase-art ah-rarity-'+tier+(tier!=='common'?' ah-rarity-gold':'')}/>
      <span className={'ah-showcase-rarity-value'+(tier!=='common'?' is-rare':'')}>
       <Gem size={12} aria-hidden="true"/><strong>{item.achievement.rarity}%</strong>
      </span>
     </span>;
    })}
   </div>
  :<p className="ah-showcase-empty">暂时没有可用于排名的已解锁成就，等待官方稀有度数据更新。</p>}
  {items.length>0&&<div className="ah-showcase-foot">
   <div className="ah-showcase-rail-actions">
    <button type="button" aria-label="向左滚动展柜" onClick={()=>rail.current?.scrollBy({left:-420,behavior:'smooth'})}><ChevronLeft size={17}/></button>
    <button type="button" aria-label="向右滚动展柜" onClick={()=>rail.current?.scrollBy({left:420,behavior:'smooth'})}><ChevronRight size={17}/></button>
   </div>
  </div>}
 </section>;
}

/** Both achievement cabinets belong to the overview, immediately after Recent Games. */
export function AchievementShowcases({games,onOpenRare,onOpenGap}:{games:Game[];onOpenRare:()=>void;onOpenGap:()=>void}){
 const rare=useMemo(()=>rareAchievementTop(games),[games]);
 const gaps=useMemo(()=>longestAchievementGaps(games),[games]);
 return <section className="ah-home-showcases" data-overview-section="showcases" aria-label="成就展柜">
  <ShowcaseRail items={rare} onOpen={onOpenRare}/>
  <AchievementGapRail items={gaps} onOpen={onOpenGap}/>
 </section>;
}

function Sheet({day,activity,playtimeLedger,minDay='2022-01-01',onChangeDay,onClose,onDetail}:{day:string;activity:Activity;playtimeLedger?:DailyPlaytimeLedger|null;minDay?:string;onChangeDay:(day:string)=>void;onClose:()=>void;onDetail:()=>void}){
 const prev=adjacentDay(day,-1),next=adjacentDay(day,1);
 const bucket=activity.byDay.get(day),games=bucket?.games||[],count=bucket?.events.length||0;
 const handle=useRef<HTMLElement|null>(null),touchY=useRef<number|null>(null);
 useEffect(()=>{
  const before=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const nextAction=handle.current?.querySelector<HTMLButtonElement>('.ah-sheet-date-arrow:not(:disabled)');
  if(nextAction)nextAction.focus({preventScroll:true});
  else handle.current?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);
  return ()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key);};
 },[onClose]);
 return <div className="ah-sheet-backdrop" onClick={onClose}>
  <section ref={handle} tabIndex={-1} className="ah-sheet" role="dialog" aria-modal="true" aria-label={dayLabel(day)+' 成就摘要'} onClick={e=>e.stopPropagation()}>
   <div className="ah-sheet-grab" onTouchStart={e=>{touchY.current=e.touches[0]?.clientY??null;}} onTouchEnd={e=>{if(touchY.current!==null&&(e.changedTouches[0]?.clientY??0)-touchY.current>70)onClose();touchY.current=null;}}><i/></div>
   <header className="ah-sheet-heading" aria-label="日期及前后导航">
    <button type="button" className="ah-sheet-date-arrow" aria-label={'前一天 '+dayLabel(prev)} title="前一天" disabled={prev<minDay} onClick={()=>onChangeDay(prev)}><ChevronLeft size={20} aria-hidden="true"/></button>
    <strong>{dayLabel(day)}</strong>
    <button type="button" className="ah-sheet-date-arrow" aria-label={'后一天 '+dayLabel(next)} title="后一天" disabled={next>activity.today} onClick={()=>onChangeDay(next)}><ChevronRight size={20} aria-hidden="true"/></button>
   </header>
   <div className="ah-sheet-games">
    {games.length?games.slice(0,3).map(({game,count:num})=><div className="ah-sheet-game" key={game.id}><Art src={game.cachedImage||game.image} className="ah-mini-art"/><span>{game.name}</span><span className="ah-sheet-game-count"><b>{num} 个</b><small className="ah-sheet-game-hours">· {fmtDailyHours(dailyGameMinutes(playtimeLedger,day,game.id))}</small></span></div>):<p className="ah-no-activity">这一天没有解锁成就</p>}
    {games.length>3&&<p className="ah-more-games">另有 {games.length-3} 款游戏，共 {games.slice(3).reduce((s,g)=>s+g.count,0)} 个成就</p>}
   </div>
   <div className="ah-sheet-total"><strong>{fmt(count)}</strong><span>个成就 · {games.length} 款游戏</span></div>
   <button type="button" className="ah-sheet-action" disabled={!count} onClick={onDetail}>查看当天全部成就 <ArrowRight size={18}/></button>
  </section>
 </div>;
}
function DayCard({event,onGame,rank,showFullDate=false}:{event:Pick<UnlockEvent,'achievement'|'game'> & {time:number|null};onGame:(id:string)=>void;rank?:number;showFullDate?:boolean}){
 const a=event.achievement,g=event.game,rare=a.rarity!==null&&a.rarity<10;
 const tier=achievementRarityTier(a.rarity);
 const frameClass='ah-achievement-art ah-rarity-'+tier+(tier!=='common'?' ah-rarity-gold':'');
 const group=g.groupStatus==='verified'?g.groups?.find(v=>v.achievementIds.includes(a.id)):undefined;
 return <article className={'ah-achievement-card'+(rank!==undefined?' ah-showcase-card ah-showcase-card-'+tier:'')}
  data-rarity-tier={tier} data-achievement-id={a.id} data-game-id={g.id}>
  <div className="ah-achievement-primary">
   {rank===undefined?<Art src={a.cachedImage||a.image} className={frameClass} alt={a.name}/>:
    <div className="ah-showcase-ranked-art"><Art src={a.cachedImage||a.image}
     className={frameClass} alt={a.name}/>
     <span className={'ah-showcase-rank'+(rank<=3?' is-top':'')}>#{String(rank).padStart(2,'0')}</span></div>}
   <div className="ah-achievement-main">
    <div className="ah-achievement-heading"><h3>{a.name}</h3>{event.time===null?<span className="ah-unlock-unknown">解锁时间未知</span>:<time dateTime={a.unlockedAt||undefined}>{showFullDate?fullTime(event.time):time(event.time)}</time>}</div>
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
export function AchievementJourney({games,records=[],playtimeLedger,dayId,showcase,gapShowcase,onBack,onOpenDay,onChangeDay,onOpenGame}:{games:Game[];records?:RecordData[];playtimeLedger?:DailyPlaytimeLedger|null;dayId:string|null;showcase:boolean;gapShowcase:boolean;onBack:()=>void;onOpenDay:(day:string)=>void;onChangeDay:(day:string)=>void;onOpenGame:(id:string)=>void}){
 const activity=useMemo(()=>buildActivity(games),[games]);
 const played=useMemo(()=>monthlyPlayedGames(games,records,activity),[games,records,activity]);
 const rare=useMemo(()=>rareAchievementTop(games),[games]);
 const gaps=useMemo(()=>longestAchievementGaps(games),[games]);
 const [selected,setSelected]=useState<string|null>(null);
 const [sheetDay,setSheetDay]=useState<string|null>(null);
 const [order,setOrder]=useState<AchievementSort>('date-asc');
 const [activeYear,setActiveYear]=useState<number|null>(null);
 const lastFocus=useRef<HTMLButtonElement|null>(null);
 const closeSheet=()=>{setSheetDay(null);requestAnimationFrame(()=>lastFocus.current?.focus({preventScroll:true}));};
 const selectDay=(date:string,button:HTMLButtonElement)=>{
  lastFocus.current=button;setSelected(date);setSheetDay(date);
 };
 const nowYear=Number(activity.today.slice(0,4)),nowMonth=Number(activity.today.slice(5,7));
 const years=Array.from({length:Math.max(0,nowYear-2021)},(_,i)=>nowYear-i);
 const months=years.flatMap(y=>Array.from({length:y===nowYear?nowMonth:12},(_,i)=>({year:y,month:(y===nowYear?nowMonth:12)-i})));
 useEffect(()=>{
  if(dayId||showcase||gapShowcase)return;
  const current=()=>{let active=years[0];for(const year of years){
   const target=document.getElementById('ah-year-'+year);
   if(target&&target.getBoundingClientRect().top<135)active=year;
  }setActiveYear(active);};
  window.addEventListener('scroll',current,{passive:true});
  window.addEventListener('resize',current);
  current();
  return ()=>{window.removeEventListener('scroll',current);window.removeEventListener('resize',current);};
 },[dayId,showcase,gapShowcase,years.join(',')]);
 if(showcase){
  return <section className="ah-page ah-showcase-detail" data-achievement-showcase="detail">
   <button type="button" className="ah-back" onClick={onBack}><ArrowLeft size={20}/> 返回概览</button>
   <div className="ah-intro-block"><span className="eyebrow">RARE ACHIEVEMENTS</span><h1>稀有成就展柜</h1>
    <p className="ah-intro">跨游戏 · 按全球玩家解锁率由低到高排列</p></div>
   <div className="ah-showcase-detail-count"><span>已解锁成就</span><strong>TOP {rare.length}</strong></div>
   {rare.length?<div className="ah-achievement-list">{rare.map((item,i)=><DayCard key={item.key} event={item} rank={i+1} showFullDate onGame={onOpenGame}/>)}</div>:
    <p className="ah-empty-day">尚无可用的稀有成就数据。Xbox 同步稀有度后自动展示。</p>}
  </section>;
 }
 if(gapShowcase)return <AchievementGapDetails items={gaps} onBack={onBack} onGame={onOpenGame}/>;
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
  <nav className="ah-year-jump" aria-label="按年份定位热力图">{years.map(y=><button type="button" key={y}
   className={activeYear===y?'is-active':''} aria-current={activeYear===y?'location':undefined} aria-controls={'ah-year-'+y}
   onClick={()=>{setActiveYear(y);document.getElementById('ah-year-'+y)?.scrollIntoView({behavior:'smooth',block:'start'});}}>{y}</button>)}</nav>
  <div className="ah-month-list">{months.map(({year,month},index)=><div key={year+'-'+month} id={index===0||months[index-1].year!==year?'ah-year-'+year:undefined}>
   <Calendar activity={activity} year={year} month={month} selected={selected} played={played} onSelect={selectDay} onOpenGame={onOpenGame}/>
  </div>)}</div>
  {!activity.total&&<p className="ah-empty-day">尚无带有效解锁时间的成就。完成 Xbox 同步后会自动显示。</p>}
  <p className="ah-footnote">统计来自已展示游戏中带解锁时间的成就；没有解锁时间的记录无法归入具体日期。时间采用北京时间。</p>
  {sheetDay&&<Sheet day={sheetDay} activity={activity} playtimeLedger={playtimeLedger} onChangeDay={day=>{setSelected(day);setSheetDay(day);}} onClose={closeSheet} onDetail={()=>{setSheetDay(null);onOpenDay(sheetDay);}}/>}
 </section>;
}
