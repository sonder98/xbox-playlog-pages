import {useEffect,useState} from 'react';
import type {Profile,Game} from './data.ts';
import type {MythicPoster} from './mythic-posters.ts';
import {MYTHIC_BADGE_URL} from './mythic-posters.ts';

// Decode each requested image once. The browser HTTP cache handles persistence;
// keeping only the current/adjacent poster warm avoids downloading a whole library.
const pending=new Map<string,Promise<boolean>>();
const decoded=new Set<string>();
/** Cached images can be visible on the *first* render of a reopened poster. */
export function mythicImageAlreadyDecoded(url:string|undefined|null):boolean{
 return !!url&&decoded.has(url);
}
export function warmMythicImage(url:string|undefined|null,priority:'auto'|'high'='auto'):Promise<boolean>{
 if(!url)return Promise.resolve(false);
 if(decoded.has(url))return Promise.resolve(true);
 const prior=pending.get(url);if(prior)return prior;
 const picture=new Image();
 picture.decoding='async';
 picture.fetchPriority=priority;
 picture.src=url;
 const promise=picture.decode().then(()=>true,()=>false).then(ok=>{
  if(ok)decoded.add(url);
  else pending.delete(url); // Failed networks may recover on the next open.
  return ok;
 });
 pending.set(url,promise);
 return promise;
}
/** Rotate at midnight Beijing time, regardless of the viewer's device timezone. */
export const beijingDay=(now:number)=>Math.floor((now+8*3600_000)/86400_000);
export function useMythicRotationDay(){
 const [day,setDay]=useState(()=>beijingDay(Date.now()));
 useEffect(()=>{
  const refresh=()=>setDay(beijingDay(Date.now()));
  const nextMidnight=(day+1)*86400_000-8*3600_000;
  const timer=window.setTimeout(refresh,Math.max(1,nextMidnight-Date.now()+50));
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('focus',refresh);
  return()=>{
   window.clearTimeout(timer);
   document.removeEventListener('visibilitychange',refresh);
   window.removeEventListener('focus',refresh);
  };
 },[day]);
 return day;
}
function rotatingScreenshotIndex(game:Game,day:number):number|null{
 const shots=game.posterScreenshots;
 if(!shots?.length||!game.posterRotationStartDay)return null;
 const firstDay=Date.parse(game.posterRotationStartDay+'T00:00:00Z')/86400_000;
 return Number.isFinite(firstDay)?Math.max(0,day-firstDay)%shots.length:null;
}
export function mythicBackdrop(game:Game,day=beijingDay(Date.now())){
 const index=rotatingScreenshotIndex(game,day);
 if(index!==null)return game.cachedPosterScreenshots?.[index]||game.posterScreenshots![index];
 return game.cachedPosterImage||game.posterImage||
  (game.detailImagePurpose==='SuperHeroArt'||game.detailImagePurpose==='TitledHeroArt'?
   game.cachedDetailImage||game.detailImage:undefined);
}
/** The small WebP uses the EXACT SAME daily screenshot index as the HD image.
 * Older snapshots without preview assets automatically use the existing image. */
export function mythicBackdropPreview(game:Game,day=beijingDay(Date.now())){
 const index=rotatingScreenshotIndex(game,day);
 return (index!==null?game.cachedPosterScreenshotsSmall?.[index]:undefined)||mythicBackdrop(game,day);
}
export function mythicCover(game:Game){
 // The circular art is at most 141 CSS pixels wide; the existing 480px WebP
 // is sharp even on 3x screens and usually far smaller than the 1600px variant.
 return game.cachedImage||game.cachedImageLarge||game.image3x||game.image2x||game.image;
}
export function warmMythicPoster(entry:MythicPoster,profile:Profile){
 // Start the tiny player identity and circle art *before* the 1600px
 // screenshot, so the biggest request cannot get a head start on avatars.
 for(const url of [profile.avatar,MYTHIC_BADGE_URL,mythicCover(entry.game)])
  void warmMythicImage(url,'high');
 for(const url of [mythicBackdropPreview(entry.game),
  entry.firstAchievement?.cachedImage||entry.firstAchievement?.image,
  entry.lastBaseAchievement?.cachedImage||entry.lastBaseAchievement?.image])
  void warmMythicImage(url);
 // The full-resolution background is fetched only for the open card or on
 // deliberate hover, not for every item on a 70-card wall.
}

/** Warm fast preview art for the wall's idle queue. High-res screenshots are
 * optional and fetched on deliberate hover; opening never waits for them. */
export function prepareMythicPoster(entry:MythicPoster,profile:Profile,fullBackdrop=false):Promise<void>{
 const urls=[
  profile.avatar,MYTHIC_BADGE_URL,mythicCover(entry.game),
  mythicBackdropPreview(entry.game),
  entry.firstAchievement?.cachedImage||entry.firstAchievement?.image,
  entry.lastBaseAchievement?.cachedImage||entry.lastBaseAchievement?.image,
  ...(fullBackdrop?[mythicBackdrop(entry.game)]:[])
 ];
 return Promise.all([
  warmMythicFonts(),
  ...urls.map((url,i)=>warmMythicImage(url,i<4?'high':'auto'))
 ]).then(()=>{});
}

// Always show the finished font layout, never the fallback layout followed by
// an unrelated reflow when Google Fonts resolves 1-2 seconds later.
let fontReady:Promise<void>|null=null;
export function warmMythicFonts():Promise<void>{
 if(!fontReady){
  fontReady=Promise.allSettled([
   document.fonts.load('400 26px Marcellus','WUCHANG Fallen Feathers 0123456789'),
   document.fonts.load('600 22px "Cormorant Garamond"','MYTHIC 0123456789'),
   document.fonts.load('500 20px "Noto Serif SC"','恭喜首项成就小时天本体玩家')
  ]).then(()=>{});
 }
 return fontReady;
}
