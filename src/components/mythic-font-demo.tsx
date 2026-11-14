import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {Profile} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {applyTheme,readThemePreference,type PlaylogTheme} from '../theme';
import {MythicPosterWall} from './mythic-wall';
import './mythic-font-demo.css';

// This lab is deliberately accessible only via ?mythic-font-demo=1 after
// unlocking the normal archive. It renders the real poster and real game data;
// neither the production font rules nor the encrypted snapshot are modified.
const ENGLISH={
 B:{label:'B · Cinzel Bold',family:'Cinzel',css:'"Cinzel", Georgia, serif'},
 C:{label:'C · Libre Baskerville Bold',family:'Libre Baskerville',css:'"Libre Baskerville", Georgia, serif'},
 E:{label:'E · Fraunces Bold',family:'Fraunces',css:'"Fraunces", Georgia, serif'}
} as const;
type EnglishChoice=keyof typeof ENGLISH;

const CHINESE={
 'serif600':{label:'思源宋体 · 半粗',family:'Noto Serif SC',css:'"Noto Serif SC", "Songti SC", serif',weight:600},
 'serif700':{label:'思源宋体 · 粗体',family:'Noto Serif SC',css:'"Noto Serif SC", "Songti SC", serif',weight:700},
 'sans700':{label:'思源黑体 · 粗体',family:'Noto Sans SC',css:'"Noto Sans SC", "Microsoft YaHei", sans-serif',weight:700}
} as const;
type ChineseChoice=keyof typeof CHINESE;

const DEMO_FONT_STYLESHEET='https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Fraunces:wght@700&family=Libre+Baskerville:wght@700&family=Noto+Sans+SC:wght@700&display=swap';

export function MythicFontDemo({posters,profile,onClose}:{
 posters:MythicPoster[];profile:Profile;onClose:()=>void;
}){
 const [english,setEnglish]=useState<EnglishChoice>('B');
 const [chinese,setChinese]=useState<ChineseChoice>('serif700');
 const [titleSize,setTitleSize]=useState(100);
 const initialTheme=useRef(readThemePreference());
 const [theme,setTheme]=useState<PlaylogTheme>(initialTheme.current);
 const [stylesheetReady,setStylesheetReady]=useState(false);
 const [loadStatus,setLoadStatus]=useState<'loading'|'ready'|'fallback'>('loading');

 // Do not persist preview theme to localStorage. Closing returns to the
 // visitor's original theme, even if they close with Escape.
 useEffect(()=>()=>applyTheme(initialTheme.current),[]);
 useEffect(()=>applyTheme(theme),[theme]);

 useEffect(()=>{
  let active=true;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href=DEMO_FONT_STYLESHEET;
  link.dataset.mythicFontDemo='true';
  link.onload=()=>{if(active)setStylesheetReady(true);};
  link.onerror=()=>{if(active)setLoadStatus('fallback');};
  document.head.appendChild(link);
  return()=>{active=false;link.remove();};
 },[]);

 useEffect(()=>{
  if(!stylesheetReady)return;
  let active=true;
  setLoadStatus('loading');
  const latin=ENGLISH[english],han=CHINESE[chinese];
  const watchdog=window.setTimeout(()=>{if(active)setLoadStatus('fallback');},12000);
  void Promise.all([
   document.fonts.load('700 24px "'+latin.family+'"','WUCHANG Fallen Feathers'),
   document.fonts.load(String(han.weight)+' 22px "'+han.family+'"','恭喜达成首项成就达成时刻')
  ]).then(([latinFaces,hanFaces])=>{
   if(active)setLoadStatus(latinFaces.length&&hanFaces.length?'ready':'fallback');
  }).catch(()=>{if(active)setLoadStatus('fallback');}).finally(()=>window.clearTimeout(watchdog));
  return()=>{active=false;window.clearTimeout(watchdog);};
 },[english,chinese,stylesheetReady]);

 const han=CHINESE[chinese];
 const style={
  '--mythic-demo-en-font':ENGLISH[english].css,
  '--mythic-demo-zh-font':han.css,
  '--mythic-demo-zh-weight':String(han.weight),
  '--mythic-demo-title-size':(6.55*titleSize/100).toFixed(2)+'cqw'
 } as CSSProperties;

 const toolbar=<div className="mythic-font-demo-toolbar-content">
  <fieldset className="mythic-font-demo-group" aria-label="英文字体">
   <legend>英文游戏名</legend>
   <div className="mythic-font-demo-options">
    {(Object.keys(ENGLISH) as EnglishChoice[]).map(key=><button type="button" key={key}
     aria-pressed={english===key} className={english===key?'selected':''}
     onClick={()=>setEnglish(key)}>{ENGLISH[key].label}</button>)}
   </div>
  </fieldset>
  <fieldset className="mythic-font-demo-group" aria-label="中文字体">
   <legend>中文字体</legend>
   <div className="mythic-font-demo-options">
    {(Object.keys(CHINESE) as ChineseChoice[]).map(key=><button type="button" key={key}
     aria-pressed={chinese===key} className={chinese===key?'selected':''}
     onClick={()=>setChinese(key)}>{CHINESE[key].label}</button>)}
   </div>
  </fieldset>
  <fieldset className="mythic-font-demo-group" aria-label="预览主题">
   <legend>主题</legend>
   <div className="mythic-font-demo-options">
    {(['dark','light'] as const).map(key=><button type="button" key={key}
     aria-pressed={theme===key} className={theme===key?'selected':''}
     onClick={()=>setTheme(key)}>{key==='dark'?'深色':'浅色'}</button>)}
   </div>
  </fieldset>
  <label className="mythic-font-demo-size">标题字号 <span>{titleSize}%</span>
   <input type="range" aria-label="游戏名字号" min={90} max={110} step={2}
    value={titleSize} onChange={event=>setTitleSize(Number(event.target.value))}/>
  </label>
  <span className={'mythic-font-demo-status '+(loadStatus==='fallback'?'is-fallback':'')} role="status">
   {loadStatus==='loading'?'正在加载真实字体…':loadStatus==='fallback'?'字体未完全加载，请检查网络':'字体已加载 · 可比较'}
  </span>
 </div>;

 return <MythicPosterWall posters={posters} profile={profile} allowNavigation
  onClose={onClose} previewToolbar={toolbar} previewStyle={style}/>;
}
