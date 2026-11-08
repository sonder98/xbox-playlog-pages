'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Gamepad2,LayoutDashboard,Library,History,Settings,CalendarDays,ArrowUpRight,ArrowLeft,RefreshCw,Search,Clock3,Trophy,ShieldCheck,X,ArrowRight,ChevronRight,SlidersHorizontal,EyeOff,Medal} from 'lucide-react';
import {compareRecords,officialGameVisible,syncMechanismLabel,type Game,type RecordData} from './data';
import {GameCard,GameCover,GameDetail,Modal} from './components/game';
import {MythicPosterWall} from './components/mythic-wall';
import {MythicShowcase} from './components/mythic-showcase';
import {mythicPosterWall} from './mythic-posters';
import {warmMythicFonts,warmMythicPoster} from './mythic-assets';
import {RecentGamesRail} from './components/recent-games';
import {DustyPreview,DustyDetails} from './components/dusty-games';
import {rankDustyGames} from './dusty-games';
import {AchievementPreview,AchievementJourney,AchievementShowcases} from './components/achievement-heatmap';
import {completion} from './completion';
import {achievementTimeSpan,compareAchievementTimeSpans} from './achievement-time-span';
import {compareGameCompletionDates} from './game-completion-date';
import {api,playtimeLedgerForBackup,pcMetascoresForDisplay,refreshCloudRecords,needsFullCloudCheckOnOpen} from './vault';
import {ManualSyncDialog} from './components/manual-sync';
import {GameLibrarySortControl,GameLibrarySearchControl} from './components/achievement-sort-control';
import {normalizeGameLibrarySort,type GameLibraryFilter,type GameLibrarySort} from './game-library-sort';
import {usePageNavigation} from './navigation';
import {PullToRefresh} from './pull-to-refresh';
const fmt=(m:number|null)=>m===null?'暂无数据':(m/60).toLocaleString('zh-CN',{maximumFractionDigits:1})+' 小时';
const dt=(s:string|null)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚未同步';
export default function Dashboard({onLock,locking=false,refreshFromCache=false}:{onLock:()=>void;locking?:boolean;refreshFromCache?:boolean}){
 const [records,setRecords]=useState<RecordData[]>([]),[modal,setModal]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[sort,setSort]=useState<GameLibrarySort>('recent'),[filter,setFilter]=useState<GameLibraryFilter>('all');
 const [manualPhase,setManualPhase]=useState<'idle'|'queued'|'running'|'deploying'|'ready'|'error'>('idle');
 const [mythicWallStart,setMythicWallStart]=useState<{gameId:string|null}|null>(null);
 const [showcaseOpen,setShowcaseOpen]=useState(false);
  const [hiddenIds,setHiddenIds]=useState<string[]>([]),[manageDisplay,setManageDisplay]=useState(false),[draftHidden,setDraftHidden]=useState<string[]>([]),[displayQuery,setDisplayQuery]=useState(''),[onlyHidden,setOnlyHidden]=useState(false),[savingDisplay,setSavingDisplay]=useState(false),[displayError,setDisplayError]=useState('');
 const {tab,navigate:setTab,back,gameId,dayId,showcase,gapShowcase,openGame,openAchievementDay,openAchievementShowcase,openAchievementGapShowcase,openAchievementGame,changeAchievementDay}=usePageNavigation();
 const [mobileNavVisible,setMobileNavVisible]=useState(false);
 useEffect(()=>{if(tab!=='library')setShowcaseOpen(false);},[tab]);
 const mobileNavHideTimer=useRef<number|undefined>(undefined);
 const ignoreMobileScrollUntil=useRef(0);
 const mobileNavKeepUntil=useRef(0);
 useEffect(()=>{
  let touchStartX=0,touchStartY=0,lastScrollY=window.scrollY;
  const showOnMovement=()=>{
   if(!window.matchMedia('(max-width:700px)').matches)return;
   setMobileNavVisible(true);
   window.clearTimeout(mobileNavHideTimer.current);
   // Scrolling still auto-hides after 1 second, unless a recent tab tap
   // has guaranteed a longer 1.5-second visibility window.
   const remaining=mobileNavKeepUntil.current-performance.now();
   mobileNavHideTimer.current=window.setTimeout(()=>setMobileNavVisible(false),Math.max(1000,remaining));
  };
  const onScroll=()=>{
   const y=window.scrollY;
   if(Math.abs(y-lastScrollY)>1){
    lastScrollY=y;
    if(performance.now()>=ignoreMobileScrollUntil.current)showOnMovement();
   }
  };
  const onTouchStart=(event:TouchEvent)=>{
   if(event.touches.length!==1)return;
   touchStartX=event.touches[0].clientX;
   touchStartY=event.touches[0].clientY;
  };
  const onTouchMove=(event:TouchEvent)=>{
   if(event.touches.length!==1)return;
   const dx=event.touches[0].clientX-touchStartX;
   const dy=event.touches[0].clientY-touchStartY;
   if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx))showOnMovement();
  };
  const onWheel=(event:WheelEvent)=>{
   if(Math.abs(event.deltaY)>5&&Math.abs(event.deltaY)>Math.abs(event.deltaX))showOnMovement();
  };
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('touchstart',onTouchStart,{passive:true});
  window.addEventListener('touchmove',onTouchMove,{passive:true});
  window.addEventListener('wheel',onWheel,{passive:true});
  return ()=>{
   window.removeEventListener('scroll',onScroll);
   window.removeEventListener('touchstart',onTouchStart);
   window.removeEventListener('touchmove',onTouchMove);
   window.removeEventListener('wheel',onWheel);
   window.clearTimeout(mobileNavHideTimer.current);
  };
 },[]);
 useEffect(()=>{
  // Route restoration uses programmatic scrolling; only user movement should reveal tabs.
  ignoreMobileScrollUntil.current=performance.now()+350;
  // A bottom-tab tap deliberately keeps navigation on screen after the
  // route changes. Other route transitions still hide it immediately.
  if(performance.now()<mobileNavKeepUntil.current)return;
  setMobileNavVisible(false);
  window.clearTimeout(mobileNavHideTimer.current);
 },[tab,gameId,dayId,showcase,gapShowcase]);
 const current=records[0],games=current?.games||[],prev=records[1];const playtimeLedger=playtimeLedgerForBackup();const pcScores=pcMetascoresForDisplay();const dusty=useMemo(()=>rankDustyGames(games,pcScores,Date.now(),current?.source||''),[current,pcScores]);const dustyIds=new Set(dusty.map(item=>item.game.id));const selected=games.find(g=>g.id===gameId&&(tab==='achievements'||dustyIds.has(g.id)||(officialGameVisible(g,current?.source||'')&&!hiddenIds.includes(g.id))));const delta=current?compareRecords(current,prev):null;
 useEffect(()=>{api('/api/records').then(async d=>{
  try{const preferences=await api('/api/display-preferences');setHiddenIds(preferences.hiddenGameIds);}
  catch(e){setError((e as Error).message);}
  // Preferences may take time to decrypt. Do not overwrite an already refreshed
  // cloud snapshot with the old record array captured before that await.
  const fresh=await api('/api/records');
  setRecords(previous=>previous[0]?.at&&previous[0].at>fresh.records[0]?.at?previous:fresh.records);
 }).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 // The Manage tab and resumed PWA should show the latest *published* snapshot,
 // not only the records that were decrypted when this page opened.
 // A shared promise prevents duplicate downloads from tab, focus and initial unlock.
 const [cloudChecking,setCloudChecking]=useState(false);
 const lastForcedCloudCheckAt=useRef(0);
 const autoRefreshPromise=useRef<Promise<void>|null>(null);
 const lastAutoRefreshAt=useRef(refreshFromCache?0:Date.now());
 const activeRef=useRef(true);
 useEffect(()=>()=>{activeRef.current=false;},[]);
 const refreshLatest=useCallback((warnForCachedStartup=false,minIntervalMs=15_000,force=false):Promise<void>=>{
  if(autoRefreshPromise.current)return force?autoRefreshPromise.current.then(()=>refreshLatest(warnForCachedStartup,0,true)):autoRefreshPromise.current;
  if(!force&&Date.now()-lastAutoRefreshAt.current<minIntervalMs)return Promise.resolve();
  lastAutoRefreshAt.current=Date.now();
  if(force){lastForcedCloudCheckAt.current=Date.now();setCloudChecking(true);}
  const task=refreshCloudRecords({force}).then(latest=>{
   if(activeRef.current&&latest){setRecords(latest);setNotice('已自动加载最新同步记录。');}
  }).catch(()=>{
   if(activeRef.current&&(warnForCachedStartup||force))
    setNotice('最新云端档案暂时无法读取，当前仍显示此前同步的数据，请稍后重试。');
  }).finally(()=>{autoRefreshPromise.current=null;if(activeRef.current)setCloudChecking(false);});
  autoRefreshPromise.current=task;
  return task;
 },[]);
 useEffect(()=>{
  // Start from encrypted IndexedDB immediately. A stale cache is checked
  // against the actual cloud vault even when Pages' tiny status is lagging.
  if(refreshFromCache)void refreshLatest(true,0,needsFullCloudCheckOnOpen());
 },[refreshFromCache,refreshLatest]);
 useEffect(()=>{
  if(tab!=='manage')return;
  // The published status marker can lag behind an already-uploaded encrypted
  // Release. Verify the full vault on Manage entry, at most once per 5 min.
  void refreshLatest(false,0,Date.now()-lastForcedCloudCheckAt.current>=5*60_000);
 },[tab,refreshLatest]);
 useEffect(()=>{
  // Check the tiny published timestamp on EVERY unlocked page, not only Manage.
  // An open Overview/Library/Achievements tab must not sit on old Xbox data
  // indefinitely. The ~25 MB encrypted vault is fetched only if latestAt advanced.
  const interval=window.setInterval(()=>{
   if(document.visibilityState==='visible')void refreshLatest();
  },60_000);
  return()=>window.clearInterval(interval);
 },[refreshLatest]);
 useEffect(()=>{
  const onResume=()=>{
   if(document.visibilityState==='visible')void refreshLatest(false,0,Date.now()-lastForcedCloudCheckAt.current>=5*60_000);
  };
  document.addEventListener('visibilitychange',onResume);
  window.addEventListener('focus',onResume);
  window.addEventListener('pageshow',onResume);
  return()=>{
   document.removeEventListener('visibilitychange',onResume);
   window.removeEventListener('focus',onResume);
   window.removeEventListener('pageshow',onResume);
  };
 },[refreshLatest]);
 const hiddenSet=new Set(hiddenIds);
 const officialAvailableGames=games.filter(g=>officialGameVisible(g,current?.source||''));
 const officialAvailableIds=new Set(officialAvailableGames.map(g=>g.id));
 const displayGames=officialAvailableGames.filter(g=>!hiddenSet.has(g.id));
 const hiddenCount=officialAvailableGames.length-displayGames.length;
 const mythicPosters=useMemo(()=>mythicPosterWall((current?.games||[]).filter(g=>
  officialGameVisible(g,current?.source||'')&&!hiddenIds.includes(g.id))),[current,hiddenIds]);
 useEffect(()=>{
  if(!current||!mythicPosters.length)return;
  // Start downloading collectible fonts and only the first two posters when
  // the unlocked vault arrives, not at the moment the user taps Open.
  void warmMythicFonts();
  for(const poster of mythicPosters.slice(0,2))warmMythicPoster(poster,current.profile);
  // The details page can open any Mythic, not just the latest on the wall.
  const selectedPoster=mythicPosters.find(p=>p.game.id===selected?.id);
  if(selectedPoster)warmMythicPoster(selectedPoster,current.profile);
 },[mythicPosters,current?.profile,selected?.id]);
 const managementGames=officialAvailableGames.filter(g=>g.name.toLowerCase().includes(displayQuery.trim().toLowerCase())&&(!onlyHidden||draftHidden.includes(g.id)));
 function openDisplayManager(){setDisplayError('');setDraftHidden([...hiddenIds]);setDisplayQuery('');setOnlyHidden(false);setManageDisplay(true);}
 async function saveDisplay(){setSavingDisplay(true);setDisplayError('');try{const saved=await api('/api/display-preferences',{hiddenGameIds:draftHidden});setHiddenIds(saved.hiddenGameIds);setManageDisplay(false);setNotice('游戏库显示设置已保存。');}catch(e){setDisplayError('显示设置保存失败：'+(e as Error).message);}finally{setSavingDisplay(false);}}

 const known=games.filter(g=>g.minutes!==null);const totalMinutes=known.reduce((a,g)=>a+(g.minutes||0),0),totalEarned=games.reduce((a,g)=>a+g.earned,0),completed=games.filter(g=>completion(g).mythic).length,full=games.filter(g=>completion(g).full).length;
 const achievementSpans=useMemo(()=>new Map((current?.games||[]).map(g=>[g.id,achievementTimeSpan(g,playtimeLedger)])),[current,playtimeLedger]);
 const visible=displayGames.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='mythic'&&completion(g).mythic||filter==='full'&&completion(g).full||filter==='playing'&&!completion(g).full)).sort((a,b)=>{
  if(sort==='span-desc'||sort==='span-asc'){
   const difference=compareAchievementTimeSpans(achievementSpans.get(a.id)??null,achievementSpans.get(b.id)??null,sort==='span-desc'?'longest':'shortest');
   if(difference!==0)return difference;
  }else if(sort==='full-date-asc'||sort==='full-date-desc'){
   const difference=compareGameCompletionDates(a,b,'full',sort==='full-date-asc'?'asc':'desc');
   if(difference!==0)return difference;
  }else if(sort==='mythic-date-asc'||sort==='mythic-date-desc'){
   const difference=compareGameCompletionDates(a,b,'mythic',sort==='mythic-date-asc'?'asc':'desc');
   if(difference!==0)return difference;
  }else if(sort==='time')return (b.minutes??-1)-(a.minutes??-1);
  return Date.parse(b.lastPlayed||'1970')-Date.parse(a.lastPlayed||'1970');
 });
 function changeLibraryFilter(next:GameLibraryFilter){
  setFilter(next);
  setSort(current=>normalizeGameLibrarySort(next,current));
 }
 function sync(){setModal(true);}
 function loadAchievements(g:Game){openGame(g.id);}
 const nav=[['overview','概览',LayoutDashboard],['library','游戏库',Library],['achievements','成就',CalendarDays],['manage','管理',Settings]] as const;
 const recent=[...displayGames].filter(g=>g.lastPlayed).sort((a,b)=>Date.parse(b.lastPlayed!)-Date.parse(a.lastPlayed!)||a.name.localeCompare(b.name)).slice(0,10);
 return <div className="shell"><PullToRefresh onUpdated={setRecords}/><aside className="sidebar"><a className="brand" href={import.meta.env.BASE_URL}><span className="brand-icon"><Gamepad2 size={24}/></span><span>XBOX Playlog<small>PERSONAL GAME ARCHIVE</small></span></a><div className="nav-caption">我的游戏空间</div><nav>{nav.map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={tab===id?'active':''}><Icon size={19}/>{label}{tab===id&&<span className="nav-dot"/>}</button>)}</nav><div className="side-bottom"><ShieldCheck size={19}/><div>私人游戏档案<small>密码解密后查看</small></div></div></aside><main><header><span className="breadcrumb">我的空间 <ChevronRight size={14}/> {tab==='achievements'?'成就热力图':tab==='dusty'?'吃灰游戏':nav.find(n=>n[0]===tab)?.[1]}</span><div className="account"><button className="account-lock secondary" onClick={onLock} disabled={locking}>锁定档案</button><span className={'dot '+(current?'green':'')}/><span className="gamertag">{current?.profile.gamertag||'Xbox 尚未连接'}</span><span className="avatar">{current?.profile.avatar&&<img src={current.profile.avatar} alt="玩家头像" onError={e=>{e.currentTarget.style.display='none';}}/>}<Gamepad2 size={18} aria-hidden="true"/></span></div></header><div className="content">{tab==='library'&&<button className="text-button" style={{marginBottom:16}} onClick={back}><ArrowLeft size={17}/>返回上一页</button>}{tab!=='achievements'&&tab!=='dusty'&&<div className="title-row"><div><div className="eyebrow">YOUR GAMES, YOUR STORY</div>{tab==='library'?<div className="library-heading-actions">
 <h1>我的游戏库</h1>
 <button type="button" className="mythic-wall-entry" onClick={()=>setShowcaseOpen(true)}
  disabled={!mythicPosters.length} aria-label="打开Mythic纪念墙">
  <Medal size={17}/><span>Mythic纪念墙</span>
 </button>
 </div>:<h1>{tab==='overview'?'我的游戏档案':'管理中心'}</h1>}<p>{tab==='overview'?'从第一小时，到最后一个成就。收藏属于你的游戏旅程。':tab==='library'?`${displayGames.length} 个游戏展示中${hiddenCount?` · ${hiddenCount} 个已隐藏`:``}。`:'管理游戏展示，并查看每次同步记录。'}</p></div><button className="primary overview-refresh" aria-label={['queued','running','deploying'].includes(manualPhase)?'查看同步进度':'立即同步'} disabled={loading} onClick={sync}><RefreshCw size={18} aria-hidden="true" className={['queued','running','deploying'].includes(manualPhase)?'spin':''}/><span className="refresh-label">{['queued','running','deploying'].includes(manualPhase)?'同步中…':'立即同步'}</span></button></div>}
 {error&&<div className="alert error" role="alert">{error}{error.includes('登录')&&<a href={import.meta.env.BASE_URL} target="_top">前往登录</a>}<button aria-label="关闭错误" onClick={()=>setError('')}><X size={16}/></button></div>}{notice&&<div className="alert success" role="status">{notice}<button aria-label="关闭提示" onClick={()=>setNotice('')}><X size={16}/></button></div>}
 {tab==='overview'&&<>
 <AchievementPreview games={games} records={records} playtimeLedger={playtimeLedger} onOpen={()=>setTab('achievements')} onOpenDay={openAchievementDay} onOpenGame={openAchievementGame}/>
 <section className="panel games-panel" data-overview-section="recent"><div className="section-title"><h2>最近游玩 <span className="count">{recent.length}</span></h2><button className="text-button" onClick={()=>setTab('library')}>全部游戏 <ArrowUpRight size={16}/></button></div><RecentGamesRail games={recent} onGame={openGame}/></section>
 <AchievementShowcases games={games} onOpenRare={openAchievementShowcase} onOpenGap={openAchievementGapShowcase}/>
 <DustyPreview items={dusty} onOpen={()=>setTab('dusty')} onGame={openGame}/>
 {!current&&!loading&&<section className="welcome"><div className="welcome-copy"><span className="pill"><span className="dot green"/>为你自己而建</span><h2>下一场冒险之前，<br/>先收藏走过的世界。</h2><p>读取 微软 Xbox 记录，汇集游戏、累计时长和成就。<br/>从今天开始，拥有一份持续生长的游戏档案。</p><button className="primary" onClick={()=>setModal(true)}>开始连接 <ArrowRight size={17}/></button><small>数据来自微软 Xbox 官方接口</small></div><div className="hero-art" aria-hidden="true"><div className="orbit one"/><div className="orbit two"/><div className="orbit three"/><div className="controller"><Gamepad2 size={130} strokeWidth={1.1}/></div><div className="art-tag t1"><Trophy size={19}/>成就收藏</div><div className="art-tag t2"><Clock3 size={18}/>游戏时光</div><div className="spark s1"/><div className="spark s2"/></div></section>}
<section className="stats" data-overview-section="stats"><Stat label="累计游玩" value={known.length?(totalMinutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1}):'—'} unit="小时" icon={<Clock3 size={19}/>} note={current?`${known.length} / ${games.length} 个游戏有时长数据`:'等待 微软 同步'}/><Stat label="玩过的游戏" value={current?String(games.length):'—'} unit="款" icon={<Gamepad2 size={19}/>} note="来自 微软 游戏库"/><Stat label="已解锁成就" value={current?totalEarned.toLocaleString():'—'} unit="个" icon={<Trophy size={19}/>} note={delta?.achievements!=null?`较上次增加 ${delta.achievements} 个`:'每一份挑战，都值得纪念'}/><Stat label="Mythic" value={current?String(completed):'—'} unit="款" icon={<Trophy size={19}/>} note={`${full} 款 Full · 本体完成记录`}/></section>
<section className="panels overview-moment"><div className="panel moment"><span className="eyebrow">SINCE LAST SYNC</span><h2>最近的游戏时光</h2><strong>{delta?.minutes!=null?fmt(delta.minutes):'等待下一次同步'}</strong><p>{prev?`${dt(prev.at)} → ${dt(current.at)}`:'两次同步后，将显示这段时间内的新增游玩时长。'}</p><div className="moment-foot"><span className="dot green"/>{delta?.corrections?`${delta.corrections} 款游戏时长回落，未计入新增`:'只比较两次记录中都有时长的游戏'}</div></div></section>
</>}
 {tab==='dusty'&&<DustyDetails items={dusty} onBack={back} onGame={openGame}/>}
 {tab==='achievements'&&<AchievementJourney games={games} records={records} playtimeLedger={playtimeLedger} dayId={dayId} showcase={showcase} gapShowcase={gapShowcase} onBack={dayId?back:()=>setTab('overview')} onOpenDay={openAchievementDay} onChangeDay={changeAchievementDay} onOpenGame={openAchievementGame}/>} 
 {tab==='library'&&<section className="panel games-panel"><div className="toolbar"><div className="filters"><div className="filter-pills" role="group" aria-label="筛选游戏">{([['all','全部'],['playing','未完成'],['mythic','Mythic'],['full','Full']] as const).map(([id,label])=><button key={id} aria-pressed={filter===id} className={filter===id?'active':''} onClick={()=>changeLibraryFilter(id)}>{label}</button>)}</div><div className="library-toolbar-actions"><GameLibrarySortControl sort={sort} filter={filter} onChange={setSort}/><GameLibrarySearchControl query={query} onChange={setQuery}/></div></div></div>{renderGames(visible)}</section>}
 {tab==='manage'&&<div className="manage-page" data-page="manage">
  <section className="manage-section" aria-labelledby="manage-visibility-title">
   <div className="manage-section-heading"><div><span className="eyebrow">GAME VISIBILITY</span><h2 id="manage-visibility-title">游戏展示</h2></div><p>决定哪些游戏出现在游戏库和概览中</p></div>
   <section className="panel visibility-panel">
    <div className="section-title"><h2>管理游戏展示</h2><SlidersHorizontal size={20}/></div>
    <p className="muted">当前展示 {displayGames.length} 款 · 已隐藏 {hiddenCount} 款</p>
    <button type="button" className="primary" aria-label="管理展示" disabled={!current||loading} onClick={openDisplayManager}><SlidersHorizontal size={17}/>管理展示{hiddenCount>0&&<span className="hidden-count">{hiddenCount}</span>}</button>
   </section>
  </section>
  <section className="manage-section" id="sync-history" aria-labelledby="manage-history-title">
   <div className="manage-section-heading"><div><span className="eyebrow">SYNC HISTORY</span><h2 id="manage-history-title">同步历史</h2></div><p>回顾每次同步的变化和数据快照</p></div>
   <section className="panel"><div className="section-title"><h2>同步快照</h2><span>共 {records.length} 次</span><button type="button" className="text-button" disabled={cloudChecking} onClick={()=>void refreshLatest(true,0,true)}>{cloudChecking?'检查中…':'检查云端更新'}</button></div><p className="muted">新增时长属于两次同步之间的区间，不代表单日实际游玩时长。首次记录作为基线。</p>{records.length?records.map((r,i)=>{const d=compareRecords(r,records[i+1]);return <div className="history-row" key={r.id}><span className="history-icon"><History size={18}/></span><div><b>{new Date(r.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</b><span className="history-sync-mechanism">{syncMechanismLabel(r.syncMechanism)}{r.syncReusedFromAt?' · 复用先前手动同步数据（未重新扫描）':''}</span><small>{r.source} · {r.games.length} 个游戏{r.warnings.length?` · ${r.warnings.join('；')}`:''}</small></div><div className="history-delta"><b>{d.minutes===null?'基线记录':'+'+fmt(d.minutes)}</b><small>{d.achievements===null?'从此刻开始':'+'+d.achievements+' 个成就'}{d.corrections>0?' · 存在时长修正':''}</small></div></div>}):<Empty title="第一份记录，等你开始" text="微软 首次同步会建立统计基线。"/>}</section>
  </section>
 </div>}
 <footer><span><span className="dot green"/>XBOX Playlog · 只属于你的游戏旅程</span><span>{current?'最后记录 '+dt(current.at):'连接账号后开始记录'} · 时间显示为北京时间</span></footer></div></main>
 {modal&&<ManualSyncDialog onClose={()=>setModal(false)} lastAt={current?.at||null} onUpdated={setRecords} onPhase={setManualPhase}/>}
 {manageDisplay&&<Modal title="游戏库显示管理" onClose={()=>{if(!savingDisplay)setManageDisplay(false);}} className="display-manager">
   <h2>管理游戏展示</h2>
   <label className="search"><Search size={17}/><input aria-label="搜索展示管理中的游戏" placeholder="搜索游戏名称…" value={displayQuery} onChange={e=>setDisplayQuery(e.target.value)}/></label>
   <div className="display-manager-actions"><label><input type="checkbox" checked={onlyHidden} onChange={e=>setOnlyHidden(e.target.checked)}/>仅看已隐藏</label><button className="text-button" disabled={savingDisplay} onClick={()=>setDraftHidden(ids=>ids.filter(id=>!officialAvailableIds.has(id)))}>全部展示</button></div>
   <p className="display-manager-count" role="status">展示 {officialAvailableGames.filter(g=>!draftHidden.includes(g.id)).length} · 隐藏 {officialAvailableGames.filter(g=>draftHidden.includes(g.id)).length}</p>
   <div className="display-manager-list">{managementGames.length?managementGames.map(g=><label key={g.id} className={'display-game-choice'+(draftHidden.includes(g.id)?' is-hidden':'')}><input type="checkbox" aria-label={'显示 '+g.name} checked={!draftHidden.includes(g.id)} disabled={savingDisplay} onChange={e=>setDraftHidden(ids=>e.target.checked?ids.filter(id=>id!==g.id):[...ids,g.id])}/><span className="display-game-cover"><GameCover game={g}/></span><span className="display-game-name">{g.name}</span>{draftHidden.includes(g.id)&&<EyeOff size={16} aria-label="已隐藏"/>}</label>):<p className="small-empty">{onlyHidden?'没有符合条件的已隐藏游戏':'没有匹配的游戏'}</p>}</div>
   {displayError&&<p className="inline-error" role="alert">{displayError}</p>}
   <div className="display-manager-footer"><button className="secondary" disabled={savingDisplay} onClick={()=>setManageDisplay(false)}>取消</button><button className="primary" disabled={savingDisplay} onClick={saveDisplay}>{savingDisplay?'保存中…':'保存展示设置'}</button></div>
 </Modal>}
 {showcaseOpen&&tab==='library'&&current&&<MythicShowcase posters={mythicPosters} profile={current.profile}
   onClose={()=>setShowcaseOpen(false)} onOpen={id=>setMythicWallStart({gameId:id})}/>}
 {selected&&!mythicWallStart&&!showcaseOpen&&<GameDetail game={selected} onClose={back}
   onOpenMythic={mythicPosters.some(p=>p.game.id===selected.id)?
    ()=>setMythicWallStart({gameId:selected.id}):undefined}/>}
  {mythicWallStart&&current&&mythicPosters.length>0&&
   <MythicPosterWall posters={mythicPosters} profile={current.profile}
    initialGameId={mythicWallStart.gameId} allowNavigation={showcaseOpen}
    onClose={()=>setMythicWallStart(null)}/>} 
 <nav className={'mobile-nav'+(mobileNavVisible?' is-visible':'')} aria-label="主导航">{nav.map(([id,label,Icon])=><button key={id} onClick={event=>{
   event.currentTarget.blur();
   ignoreMobileScrollUntil.current=performance.now()+350;
   mobileNavKeepUntil.current=performance.now()+1500;
   setMobileNavVisible(true);
   window.clearTimeout(mobileNavHideTimer.current);
   // Each tap restarts the visibility window, even when selecting the
   // already-active tab. This timer is shared with the scroll logic.
   mobileNavHideTimer.current=window.setTimeout(()=>{
    mobileNavKeepUntil.current=0;
    setMobileNavVisible(false);
   },1500);
   setTab(id);
  }} aria-current={tab===id?'page':undefined}><Icon size={21}/><span>{label}</span></button>)}</nav>

 </div>;
 function renderGames(list:Game[]){return list.length?<div className="game-cards">{list.map((g,index)=><GameCard key={g.id} game={g} priority={index<2} playtimeLedger={playtimeLedger} onOpen={()=>loadAchievements(g)}/>)}</div>:<Empty title={loading?'正在读取记录…':hiddenCount===games.length&&games.length?'所有游戏已隐藏':query||filter!=='all'?'没有匹配的游戏':'游戏故事，从连接开始'} text={hiddenCount===games.length&&games.length?'前往「管理」页面，恢复想展示的游戏。':query||filter!=='all'?'试试其他名称或筛选条件。':'微软 首次同步成功后，你的游戏会出现在这里。'}/>;}

}
function Stat({label,value,unit,icon,note}:{label:string;value:string;unit:string;icon:React.ReactNode;note:string}){return <div className="stat"><div className="stat-label">{label}<span>{icon}</span></div><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-note">{note}</div></div>}
function Empty({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <div className="empty"><div className="empty-icon"><Gamepad2 size={32}/></div><h3>{title}</h3><p>{text}</p>{action}</div>}
