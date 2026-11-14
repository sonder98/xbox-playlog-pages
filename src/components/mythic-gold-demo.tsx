import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {Profile} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {applyTheme,readThemePreference,type PlaylogTheme} from '../theme';
import {MythicPosterWall} from './mythic-wall';
import './mythic-gold-demo.css';

// The preview wraps the actual production poster and unlocked archive records.
// It does not alter the game-name font, saved theme or production card CSS.
const EFFECTS={
 original:{label:'原版',note:'Cinzel Bold 原有米白文字，没有流光',duration:5.2},
 satin:{label:'A · 香槟流金',note:'浅金底色，窄光带无间隔扫过',duration:2.1},
 mirror:{label:'B · 镜面扫金',note:'明亮而集中的金箔高光',duration:4.6},
 liquid:{label:'C · 液态鎏金',note:'深浅金色持续缓缓流动',duration:8.5},
 ember:{label:'D · 熔金辉光',note:'金色流纹连续流动，伴随轻微呼吸辉光',duration:3.7}
} as const;
type GoldEffect=keyof typeof EFFECTS;
const RATES={
 slow:{label:'慢速',multiplier:.65},
 normal:{label:'标准',multiplier:1},
 fast:{label:'快速',multiplier:1.5}
} as const;
type Speed=keyof typeof RATES;

export function MythicGoldDemo({posters,profile,onClose}:{
 posters:MythicPoster[];profile:Profile;onClose:()=>void;
}){
 const [effect,setEffect]=useState<GoldEffect>('satin');
 const [speed,setSpeed]=useState<Speed>('normal');
 const [paused,setPaused]=useState(false);
 const initialTheme=useRef<PlaylogTheme>(readThemePreference());
 const [theme,setTheme]=useState<PlaylogTheme>(initialTheme.current);
 const [reduceMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>()=>applyTheme(initialTheme.current),[]);
 useEffect(()=>applyTheme(theme),[theme]);

 const duration=EFFECTS[effect].duration/RATES[speed].multiplier;
 const style={
  '--gold-demo-duration':duration.toFixed(2)+'s'
 } as CSSProperties;
 const toolbar=<div className="mythic-gold-demo-controls">
  <fieldset className="mythic-gold-demo-options">
   <legend>游戏名字体鎏金方案</legend>
   <div className="mythic-gold-demo-buttons">
    {(Object.keys(EFFECTS) as GoldEffect[]).map(key=>
     <button type="button" key={key} aria-pressed={effect===key}
      className={effect===key?'selected':''} onClick={()=>setEffect(key)}>{EFFECTS[key].label}</button>)}
   </div>
  </fieldset>
  <div className="mythic-gold-demo-secondary">
   <fieldset className="mythic-gold-demo-options">
    <legend>流动速度</legend>
    <div className="mythic-gold-demo-buttons">
     {(Object.keys(RATES) as Speed[]).map(key=>
      <button type="button" key={key} aria-pressed={speed===key}
       className={speed===key?'selected':''} onClick={()=>setSpeed(key)}>{RATES[key].label}</button>)}
    </div>
   </fieldset>
   <fieldset className="mythic-gold-demo-options">
    <legend>主题</legend>
    <div className="mythic-gold-demo-buttons">
     {(['dark','light'] as const).map(key=>
      <button type="button" key={key} aria-pressed={theme===key}
       className={theme===key?'selected':''} onClick={()=>setTheme(key)}>{key==='dark'?'深色':'浅色'}</button>)}
    </div>
   </fieldset>
   <button className="mythic-gold-demo-pause" type="button" disabled={effect==='original'||reduceMotion}
    aria-pressed={paused} onClick={()=>setPaused(current=>!current)}>{paused?'继续播放':'暂停动画'}</button>
  </div>
  <p className="mythic-gold-demo-note" role="status">{EFFECTS[effect].note}
   {reduceMotion?' · 系统已开启减少动态效果，预览为静态':' · 仅游戏名使用效果，原版卡片不变'}
  </p>
 </div>;

 return <MythicPosterWall posters={posters} profile={profile} allowNavigation onClose={onClose}
  previewKind="gold" previewVariant={effect} previewPaused={paused}
  previewLabel="Mythic · 游戏名鎏金实验室" previewToolbar={toolbar} previewStyle={style}/>;
}
