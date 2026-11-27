import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Copy,FlaskConical} from 'lucide-react';
import type {Profile,Game} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {mythicCover,useMythicRotationDay,warmMythicFonts} from '../mythic-assets';
import {Modal} from './game';
import {MythicPosterCard} from './mythic-wall';
import './mythic-particle-lab.css';

import {presets,curated,curatedConfig,type Config,type Kind,type Direction} from './mythic-particle-presets';

const storageKey='playlog-particle-lab-config-v1';
const range=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(100,Math.max(0,v)):fallback;
function readConfigs():Record<string,Config>{
 try{
  const raw=JSON.parse(sessionStorage.getItem(storageKey)||'{}');
  return Object.fromEntries(Object.entries(raw).flatMap(([id,value])=>{
   const v=value as Partial<Config>|null;
   if(!v||!v.kind||!Object.hasOwn(presets,v.kind))return [];
   return [[id,{kind:v.kind,color:typeof v.color==='string'&&/^#[a-f0-9]{6}$/i.test(v.color)?v.color:presets[v.kind].color,accent:typeof v.accent==='string'&&/^#[a-f0-9]{6}$/i.test(v.accent)?v.accent:undefined,direction:v.direction==='fall'||v.direction==='rise'||v.direction==='drift'?v.direction:presets[v.kind].direction,density:range(v.density,35),speed:range(v.speed,30),opacity:range(v.opacity,55),size:range(v.size,35)}]];
  }));
 }catch{return {};}
}
function random(n:number){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function ParticleLayer({config,limit,paused,staticMode}:{config:Config;limit:number;paused:boolean;staticMode:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(false),[foreground,setForeground]=useState(()=>!document.hidden);
 useEffect(()=>{
  const node=ref.current;
  if(!node)return;
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));
  observer.observe(node);
  const change=()=>setForeground(!document.hidden);
  document.addEventListener('visibilitychange',change);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',change);};
 },[]);
 const count=staticMode?0:Math.round(limit*config.density/100);
 return <div ref={ref} className={'particle-layer particle-'+config.kind} aria-hidden="true" data-paused={paused?'true':'false'} data-running={!paused&&visible&&foreground?'true':'false'} style={{'--particle-color':config.color} as CSSProperties}>
  {Array.from({length:count},(_,i)=>{
   const r=(n:number)=>random(i*17+n);
   const duration=(8+r(2)*8)/(0.45+config.speed/80);
   const size=(1.5+r(3)*3)*(0.5+config.size/40)*(limit<=10?.8:1);
   const dx=config.direction==='drift'?60+r(4)*80:(r(4)-.5)*90;
   const dy=config.direction==='rise'?-130:config.direction==='fall'?130:(r(5)-.5)*35;
   return <i key={i} style={{left:(5+r(1)*90)+'%',top:(5+r(5)*90)+'%','--particle-color':config.accent&&i%3===1?config.accent:config.color,'--p-size':size+'px','--p-duration':duration+'s','--p-delay':(-duration*r(6))+'s','--p-alpha':(config.opacity/100*(.4+r(7)*.6)).toFixed(2),'--p-x':dx+'px','--p-y':dy+'px','--p-turn':(config.kind==='mist'||config.kind==='rain'||config.kind==='snow'?0:r(8)*540-270)+'deg'} as CSSProperties}/>;
  })}
 </div>;
}
function Art({game,wide}:{game:Game;wide:boolean}){
 const urls=[...new Set([...(wide?[game.cachedDetailImage,game.detailImage,game.imageWide]:[]),mythicCover(game),game.cachedImageLarge,game.image].filter((v):v is string=>!!v))];
 const [attempt,setAttempt]=useState(0);
 return urls[attempt]?<img src={urls[attempt]} alt={game.name} decoding="async" onError={()=>setAttempt(i=>i+1)}/>:<span className="particle-art-empty">图片暂不可用</span>;
}
export default function ParticleLab({posters,profile,onClose}:{posters:MythicPoster[];profile:Profile;onClose:()=>void}){
 const [id,setId]=useState(posters[0]?.game.id||'');
 const [saved,setSaved]=useState(readConfigs);
 const [drafts,setDrafts]=useState<Record<string,Config>>({});
 const [paused,setPaused]=useState(false),[staticMode,setStaticMode]=useState(false);
 const [fonts,setFonts]=useState(false);
 const [notice,setNotice]=useState('');
 const day=useMythicRotationDay();
 useEffect(()=>{let active=true;void warmMythicFonts().then(()=>{if(active)setFonts(true);});return()=>{active=false;};},[]);
 const index=Math.max(0,posters.findIndex(p=>p.game.id===id)),entry=posters[index];
 const selectedId=entry?.game.id||'';
 const recommendation=curated[selectedId];
 const config=drafts[selectedId]||saved[selectedId]||curatedConfig(selectedId);
 const customized=!!(drafts[selectedId]||saved[selectedId]);
 const curatedCount=posters.filter(p=>!!curated[p.game.id]).length;
 const update=(patch:Partial<Config>)=>setDrafts(d=>({...d,[selectedId]:{...config,...patch}}));
 const roster=JSON.stringify(posters.map(p=>({id:p.game.id,name:p.game.name})),null,2);
 const configText=JSON.stringify(Object.fromEntries(posters.flatMap(p=>saved[p.game.id]?[[p.game.id,saved[p.game.id]]]:curated[p.game.id]?[[p.game.id,curatedConfig(p.game.id)]]:[])),null,2);
 async function copy(text:string,label:string){
  try{await navigator.clipboard.writeText(text);setNotice(label+'已复制');}
  catch{setNotice('无法自动复制，请长按对应文本框全选并复制。');}
 }
 function save(){
  const next={...saved,[selectedId]:config};
  setSaved(next);
  try{sessionStorage.setItem(storageKey,JSON.stringify(next));setNotice('当前配置已保存至本次浏览器会话');}
  catch{setNotice('配置已保存在页面内，请关闭前复制导出。');}
 }
 function reset(){
  const next={...saved};delete next[selectedId];setSaved(next);
  setDrafts(d=>{const next={...d};delete next[selectedId];return next;});
  try{sessionStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Preview remains usable without storage. */}
  setNotice('已恢复推荐方案');
 }
 const layer=(limit:number)=><ParticleLayer key={selectedId+'-'+limit} config={config} limit={limit} paused={paused} staticMode={staticMode}/>;
 return <Modal title="Mythic 粒子实验室" onClose={onClose} className="particle-lab" toolbarContent={<strong className="particle-toolbar"><FlaskConical size={19}/> PARTICLE LAB</strong>}>
  <header className="particle-lab-heading"><span className="eyebrow">XBOX PLAYLOG / DESIGN LAB</span><h2>Mythic 粒子实验室</h2><p className="muted">当前展示的 Mythic：{posters.length} 款 · 已设计 {curatedCount}/{posters.length} 款 · 仅本机预览，不修改正式封面。</p></header>
  <div className="particle-export"><button className="primary" onClick={()=>void copy(roster,'游戏名单')}><Copy size={16}/>复制游戏名单</button><details><summary>查看名单 / 手动复制</summary><textarea aria-label="游戏名单 JSON" readOnly value={roster} rows={5}/></details></div>
  {entry?<><label className="particle-field">选择 Mythic 游戏<select aria-label="选择 Mythic 游戏" value={selectedId} onChange={e=>{setId(e.target.value);setNotice('');}}>{posters.map(p=><option key={p.game.id} value={p.game.id}>{p.game.name}</option>)}</select></label>
  <div className="particle-recommendation"><div><strong>{recommendation?.label||'待设计 · 浮尘试验'}</strong><span>{customized?'自定义预览':recommendation?'专属推荐':'未配置'}</span></div><p>{recommendation?.note||'新增游戏尚未匹配专属动效。'}</p>{customized&&<button type="button" className="text-button" onClick={reset}>恢复推荐方案</button>}</div>
  <div className="particle-switches"><button className={staticMode?'primary':'secondary'} onClick={()=>setStaticMode(v=>!v)} aria-pressed={staticMode}>{staticMode?'恢复粒子':'静态对照'}</button><button className="secondary" onClick={()=>setPaused(v=>!v)} aria-pressed={paused}>{paused?'继续播放':'暂停动画'}</button></div>
  <div className="particle-lab-grid">
   <div className="particle-samples"><span>方形封面</span><div className="particle-art square"><Art key={selectedId+'-s'} game={entry.game} wide={false}/>{layer(10)}</div><span>详情横图</span><div className="particle-art wide"><Art key={selectedId+'-w'} game={entry.game} wide/>{layer(24)}</div></div>
   <div className="particle-poster-sample"><span>Mythic 大卡 · 今日背景</span><div className="particle-poster-wrap"><MythicPosterCard key={selectedId} entry={entry} profile={profile} index={index} total={posters.length} active opening={false} fontReady={fonts} rotationDay={day} momentLayout="two" backgroundEffect={layer(40)}/></div></div>
  </div>
  <div className="particle-controls">
   <label className="particle-field">粒子模板<select aria-label="粒子模板" value={config.kind} onChange={e=>{const kind=e.target.value as Kind;update({kind,color:presets[kind].color,accent:undefined,direction:presets[kind].direction});}}>{(Object.keys(presets) as Kind[]).map(k=><option key={k} value={k}>{presets[k].label}</option>)}</select></label>
   <label className="particle-field">运动方向<select aria-label="运动方向" value={config.direction} onChange={e=>update({direction:e.target.value as Direction})}><option value="fall">下落</option><option value="rise">上升</option><option value="drift">横向漂移</option></select></label>
   <label className="particle-color">粒子颜色<input aria-label="粒子颜色" type="color" value={config.color} onChange={e=>update({color:e.target.value})}/><span>{config.color}</span></label>
   <label className="particle-color">辅助颜色<input aria-label="辅助颜色" type="color" value={config.accent||config.color} onChange={e=>update({accent:e.target.value})}/><span>{config.accent||'未设置'}</span><button type="button" className="text-button" onClick={()=>update({accent:undefined})}>清除</button></label>
   {([['density','粒子密度'],['speed','运动速度'],['opacity','不透明度'],['size','粒子大小']] as const).map(([key,label])=><label className="particle-range" key={key}><span>{label}</span><input aria-label={label} type="range" min={0} max={100} value={config[key]} onChange={e=>update({[key]:Number(e.target.value)})}/><output>{config[key]}%</output></label>)}
   <button className="primary" onClick={save}>保存当前配置</button>
  </div></>:<p>当前没有正在展示的 Mythic 游戏。</p>}
  <div className="particle-export"><button className="secondary" onClick={()=>void copy(configText,'动效配置')}><Copy size={16}/>复制全部配置</button><details><summary>查看配置 / 手动复制</summary><textarea aria-label="动效配置 JSON" value={configText} readOnly rows={5}/></details></div>
  <p role="status" className="muted">{notice||'推荐配置已内置，自定义配置仅保存于本次会话。系统减少动态效果时自动静态显示。'}</p>
 </Modal>;
}
