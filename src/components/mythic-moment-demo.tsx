import {useEffect,useRef,useState} from 'react';
import type {Profile} from '../data';
import type {MythicPoster} from '../mythic-posters';
import {applyTheme,readThemePreference,type PlaylogTheme} from '../theme';
import {MythicPosterWall} from './mythic-wall';
import './mythic-moment-demo.css';

type MomentLayout='original'|'one'|'two';
const LAYOUTS={
 original:{label:'当前版本',description:'成就标签 / 解锁日期 / 解锁时间'},
 one:{label:'新版 · 单行成就名',description:'小号说明标签 / 大号成就名（单行） / 日期与时间'},
 two:{label:'新版 · 双行成就名',description:'小号说明标签 / 大号成就名（最多两行） / 日期与时间'}
} as const;

export function MythicMomentDemo({posters,profile,onClose}:{
 posters:MythicPoster[];profile:Profile;onClose:()=>void;
}){
 const [layout,setLayout]=useState<MomentLayout>('two');
 const initialTheme=useRef<PlaylogTheme>(readThemePreference());
 const [theme,setTheme]=useState<PlaylogTheme>(initialTheme.current);
 useEffect(()=>()=>applyTheme(initialTheme.current),[]);
 useEffect(()=>applyTheme(theme),[theme]);

 const toolbar=<div className="mythic-moment-demo-controls">
  <fieldset className="mythic-moment-demo-group">
   <legend>成就展示布局</legend>
   <div className="mythic-moment-demo-options">
    {(Object.keys(LAYOUTS) as MomentLayout[]).map(key=>
     <button type="button" key={key} aria-pressed={layout===key}
      className={layout===key?'selected':''} onClick={()=>setLayout(key)}>
      {LAYOUTS[key].label}
     </button>)}
   </div>
  </fieldset>
  <fieldset className="mythic-moment-demo-group">
   <legend>主题</legend>
   <div className="mythic-moment-demo-options">
    {(['dark','light'] as const).map(key=><button type="button" key={key}
     aria-pressed={theme===key} className={theme===key?'selected':''}
     onClick={()=>setTheme(key)}>{key==='dark'?'深色':'浅色'}</button>)}
   </div>
  </fieldset>
  <p className="mythic-moment-demo-note" role="status">{LAYOUTS[layout].description} · 使用真实解锁成就，左右切换游戏可比较长短名称</p>
 </div>;

 return <MythicPosterWall posters={posters} profile={profile} allowNavigation
  onClose={onClose} previewKind="moment" previewMomentLayout={layout}
  previewLabel="Mythic · 成就信息排版预览" previewToolbar={toolbar}/>;
}
