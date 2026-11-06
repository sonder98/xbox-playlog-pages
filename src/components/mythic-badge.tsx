import {useEffect,useRef,useState} from 'react';
import {Gem} from 'lucide-react';
import {MYTHIC_BADGE_URL} from '../mythic-posters';

/** Render a local graphic immediately, then reveal the remote original only
 * after it has decoded. An unreachable image host must never leave a blank medal. */
export function MythicBadgeArt({compact=false}:{compact?:boolean}){
 const imageRef=useRef<HTMLImageElement>(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const img=imageRef.current;
  if(img?.complete&&img.naturalWidth>0)setReady(true);
 },[]);
 return <span className={'mythic-badge-art'+(compact?' is-compact':'')} aria-hidden="true">
  <Gem size={compact?15:38} strokeWidth={1.5} className="mythic-badge-placeholder"/>
  <img ref={imageRef} src={MYTHIC_BADGE_URL} alt="" loading="eager" fetchPriority="high"
   decoding="async" className={ready?'is-ready':''}
   onLoad={()=>setReady(true)} onError={()=>setReady(false)}/>
 </span>;
}
