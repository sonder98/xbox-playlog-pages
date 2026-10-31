import {useEffect,useRef,useState,useId,type ReactNode} from 'react';
import {Gamepad2,Trophy,X,Lock,Check,Clock3,Gem} from 'lucide-react';
import {completion} from '../completion';
import {GamerscoreIcon} from './gamerscore-icon';
import {sortAchievements,type AchievementSort} from '../achievement-sort';
import type {Game,Achievement} from '../data';

export const hours=(minutes:number|null)=>minutes===null?'暂无时长':`${(minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1})} 小时`;
export const date=(value:string|null)=>value?new Date(value).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}):'暂无记录';
function CompletionOrnament(){
  const metal=useId();
  return <svg className="completion-ornament" viewBox="0 0 140 34" aria-hidden="true" focusable="false">
    <defs><linearGradient id={metal} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1fff7"/><stop offset=".48" stopColor="#abd3bb"/><stop offset=".55" stopColor="#578d72"/><stop offset="1" stopColor="#d6efdf"/></linearGradient></defs>
    <path d="M6 26H30M110 26H134M16 29H39M101 29H124" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".65"/>
    <g fill={`url(#${metal})`}>
      <path d="M61 28C43 30 30 23 20 11C34 18 41 25 61 28ZM79 28C97 30 110 23 120 11C106 18 99 25 79 28Z"/>
      <path d="M34 23Q22 25 17 19Q27 17 34 23ZM42 27Q29 31 25 26Q34 22 42 27ZM51 29Q41 34 35 30Q43 25 51 29ZM32 20Q25 16 28 8Q35 12 32 20ZM41 25Q34 20 37 13Q44 17 41 25ZM50 28Q44 24 46 18Q53 21 50 28Z"/>
      <path d="M106 23Q118 25 123 19Q113 17 106 23ZM98 27Q111 31 115 26Q106 22 98 27ZM89 29Q99 34 105 30Q97 25 89 29ZM108 20Q115 16 112 8Q105 12 108 20ZM99 25Q106 20 103 13Q96 17 99 25ZM90 28Q96 24 94 18Q87 21 90 28Z"/>
    </g>
    <path d="M70 1L75 12L88 16L77 21L70 33L63 21L52 16L65 12Z" fill={`url(#${metal})`} stroke="#b0dcc2" strokeWidth="1"/>
    <path d="M70 5L70 16L58 16L66 19L70 29L70 16L82 16L74 13Z" fill="#45b880"/>
    <path d="M70 8L73 14L80 16L73 19L70 25L67 19L60 16L67 14Z" fill="#f0fff5"/>
  </svg>;
}
export function Progress({earned,total,label,complete=false}:{earned:number;total:number;label:string;complete?:boolean}){
  const percent=total?Math.min(100,Math.round(earned/total*100)):0;
  return <span className={'progress'+(complete?' complete':'')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:percent+'%'}}/></span>;
}
export function GameCover({game,wide=false,priority=false}:{game:Game;wide?:boolean;priority?:boolean}){
  const landscapes=wide?[game.cachedDetailImage,game.detailImage,game.imageWide].filter((url):url is string=>!!url):[];
  const squares=[wide?game.cachedImageLarge:game.cachedImage,wide?game.cachedImage:game.cachedImageLarge,game.image3x,game.image2x,game.image].filter((url):url is string=>!!url);
  const candidates=[...new Set([...landscapes,...squares])];
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>setAttempt(0),[game.id,game.cachedImage,game.cachedImageLarge,game.cachedDetailImage,game.detailImage,game.image3x,game.image]);
  const source=candidates[attempt],landscape=wide&&landscapes.includes(source),completed=completion(game).mythic;
  return <span className={'game-cover'+(wide?' detail-cover':'')+(landscape?' has-landscape':'')+(completed?' completion-frame':'')}>
    {wide&&source&&!landscape&&<img className="detail-backdrop" src={source} alt="" aria-hidden="true" decoding="async"/>}
    {source?<img className="cover-artwork" src={source} alt="" loading={wide||priority?'eager':'lazy'} fetchPriority={wide||priority?'high':'auto'} decoding="async" width={landscape?1600:1080} height={landscape?900:1080} onError={()=>setAttempt(a=>a+1)}/>:<span className="cover-fallback" role="img" aria-label="游戏封面暂不可用"><Gamepad2 size={28}/></span>}
    {completed&&<CompletionOrnament/>}
  </span>;
}
export function GameCard({game,onOpen,priority=false}:{game:Game;onOpen:()=>void;priority?:boolean}){
  const state=completion(game);
  const extra=state.base?{earned:game.earned-state.base.earned,total:game.total-state.base.total}:null;
  return <button className="game-card" data-game-id={game.id} onClick={onOpen} aria-label={`查看 ${game.name} 的游戏详情${state.mythic?'，本体全成就':''}`}>
    <span className="game-art"><GameCover game={game} priority={priority}/></span>
    <span className="game-copy"><span className="game-title">{game.name}</span><span className="game-last">最近游玩 {date(game.lastPlayed)}</span></span>
    <span className="game-progress"><span className="game-achievement"><span className="achievement-metric" aria-label={`${state.base?'本体':'已同步'}成就 ${state.earned}/${state.total}`} title={state.base?'本体成就':'成就总数 · 本体分组待确认'}><Trophy size={14}/><span>{state.earned}/{state.total}</span></span>{extra&&extra.total>0&&<span className="achievement-metric" aria-label={`追加内容成就 ${extra.earned}/${extra.total}`} title="DLC 与更新成就"><span className="dlc-mark">DLC</span><span>{extra.earned}/{extra.total}</span></span>}<span className="achievement-metric game-playtime" aria-label={'游玩时长 '+hours(game.minutes)}><Clock3 size={13}/>{hours(game.minutes)}</span></span><Progress earned={state.earned} total={state.total} complete={state.mythic} label={game.name+' 成就完成度'}/></span>
  </button>;
}
export function Modal({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
  const panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const original=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';panel.current?.querySelector<HTMLElement>('button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const controls=[...(panel.current?.querySelectorAll<HTMLElement>('button,a[href],input,select,summary,[tabindex="0"]')||[])].filter(el=>!el.hasAttribute('disabled')&&el.getClientRects().length);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return ()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);original?.focus({preventScroll:true});};
  },[]);
  return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} className={'dialog '+className} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-toolbar"><button className="icon-button close" aria-label="关闭详情" onClick={onClose}><X size={20}/></button></div><div className="dialog-body">{children}</div></section></div>;
}
function AchievementItem({achievement:a}:{achievement:Achievement}){
  const rare=a.rarity!==null&&a.rarity<10;
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>setAttempt(0),[a.id,a.image,a.cachedImage]);
  const images=[a.cachedImage,a.image].filter((url,index,all):url is string=>!!url&&all.indexOf(url)===index);
  const image=images[attempt];
  return <article className={'achievement '+(!a.unlocked?'locked':'')} data-achievement-id={a.id}>
    <span className="achievement-image"><Trophy size={24}/>{image&&<img src={image} alt="" width="160" height="90" loading="lazy" decoding="async" onError={()=>setAttempt(n=>n+1)}/>}</span>
    <div className="achievement-copy">
      <div className="achievement-title-row"><h4>{a.name}</h4>{(a.points??0)>0&&<span className="achievement-points" aria-label={`${a.points} 玩家积分`}><GamerscoreIcon size={14}/><span>{a.points}</span></span>}</div>
      <div className="achievement-description-row">
        {a.description&&<p className="achievement-description">{a.description}</p>}
        {a.rarity!==null?<span className={'achievement-rarity'+(rare?' rare':'')} data-rarity-tier={rare?'rare':'common'} aria-label={`${rare?'稀有成就，':''}稀有度 ${a.rarity}%`}>{rare?<Gem size={16} aria-hidden="true"/>:<Trophy size={15} aria-hidden="true"/>}{a.rarity}%</span>:<span className="achievement-rarity unknown">稀有度暂缺</span>}
      </div>
      <small className={'achievement-unlock'+(a.unlocked?' unlocked':'')}>
        {a.unlocked?<Check size={14} aria-hidden="true"/>:<Lock size={14} aria-hidden="true"/>}
        {a.unlocked?<span>{a.unlockedAt?<><span>已解锁 · </span><time dateTime={a.unlockedAt}>{new Date(a.unlockedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</time></>:'已解锁 · 时间暂缺'}</span>:<span>未解锁</span>}
      </small>
    </div>
  </article>;
}
export function GameDetail({game,onClose}:{game:Game;onClose:()=>void}){
  const groups=game.groupStatus==='verified'&&game.groups?.length?game.groups:[{id:'all',name:'已同步成就',kind:'base',earned:game.earned,total:game.total,achievementIds:game.achievements?.map(a=>a.id)||[]}];
  const [order,setOrder]=useState<AchievementSort>('date-desc');
  const [groupId,setGroupId]=useState('__all');
  const selected=groups.find(g=>g.id===groupId);
  const visibleGroups=selected?[selected]:[...groups].sort((a,b)=>Number(b.kind==='base')-Number(a.kind==='base'));
  const sections=visibleGroups.map(group=>{
    const ids=new Set(group.achievementIds);
    return {group,achievements:sortAchievements((game.achievements||[]).filter(a=>ids.has(a.id)),order)};
  });
  return <Modal title={game.name+' · 游戏详情'} onClose={onClose} className="game-detail"><GameCover game={game} wide/><div className="detail-heading"><div><span className="eyebrow">GAME DETAILS</span><h2>{game.name}</h2></div></div><div className="detail-summary"><span><Clock3 size={16}/>{hours(game.minutes)}</span><span><Trophy size={16}/>{game.earned}/{game.total} 成就</span><span className="detail-gamerscore" aria-label={`已获得 ${game.score.toLocaleString('zh-CN')} 玩家积分`}><GamerscoreIcon size={18}/><span>{game.score.toLocaleString('zh-CN')}</span></span></div>
    {game.groupStatus!=='verified'&&<p className="note">本体与追加内容分组待同步，当前显示已取得的逐项记录。</p>}
    {!!game.achievements?.length&&<>
      <div className="achievement-tools">
        {groups.length>1&&<label>成就分组<select aria-label="成就分组" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="__all">全部成就</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
        <label>排序方式<select aria-label="成就排序" value={order} onChange={e=>setOrder(e.target.value as AchievementSort)}><option value="date-desc">解锁时间：新 → 旧</option><option value="date-asc">解锁时间：旧 → 新</option><option value="rarity-asc">稀有度：低 → 高</option><option value="rarity-desc">稀有度：高 → 低</option></select></label>
      </div>
      <div className="achievement-groups">{sections.map(({group,achievements})=><section className="achievement-group" key={group.id} data-group-id={group.id}><div className="section-heading"><h3>{group.name}</h3><span>{group.earned}/{group.total}</span></div><Progress earned={group.earned} total={group.total} complete={group.earned===group.total&&group.total>0} label={group.name+' 完成度'}/>{achievements.map(a=><AchievementItem key={a.id} achievement={a}/>)}</section>)}</div>
    </>}
    {!game.achievements?.length&&<div className="empty"><Trophy/><h3>成就明细尚未同步</h3><p>下一次同步成功后将在这里展示。</p></div>}
  </Modal>;
}
