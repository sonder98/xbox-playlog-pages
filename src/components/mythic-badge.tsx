import {useEffect,useRef,useState} from 'react';
import {Gem} from 'lucide-react';
import {MYTHIC_BADGE_URL} from '../mythic-posters';
import {mythicImageAlreadyDecoded} from '../mythic-assets';

/** Render a local graphic immediately, then reveal the remote original only
 * after it has decoded. Even an uncached first load must never leave a blank medal. */
export function MythicBadgeArt({compact=false}:{compact?:boolean}){
 const imageRef=useRef<HTMLImageElement>(null);
 const [ready,setReady]=useState(()=>mythicImageAlreadyDecoded(MYTHIC_BADGE_URL));
 function revealWhenDecoded(){
  const img=imageRef.current;
  if(!img||img.naturalWidth===0)return;
  // An image can have transferred its bytes but still be decoding; keep the
  // local medal in front until the bundled asset is ready to paint.
  void img.decode().then(()=>{
   if(imageRef.current===img)setReady(true);
  }).catch(()=>{
   if(imageRef.current===img)setReady(true);
  });
 }
 useEffect(()=>{revealWhenDecoded();},[]);
 return <span className={'mythic-badge-art'+(compact?' is-compact':'')} aria-hidden="true">
  <Gem size={compact?15:38} strokeWidth={1.5} className="mythic-badge-placeholder"/>
  <img ref={imageRef} src={MYTHIC_BADGE_URL} alt="" loading="eager" fetchPriority="high"
   decoding="async" className={ready?'is-ready':''}
   onLoad={revealWhenDecoded} onError={()=>setReady(false)}/>
 </span>;
}
