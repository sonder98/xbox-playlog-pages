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
export function mythicBackdrop(game:Game){
 return game.cachedPosterImage||game.posterImage||
  (game.detailImagePurpose==='SuperHeroArt'||game.detailImagePurpose==='TitledHeroArt'?
   game.cachedDetailImage||game.detailImage:undefined);
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
 for(const url of [mythicBackdrop(entry.game),
  entry.firstAchievement?.cachedImage||entry.firstAchievement?.image,
  entry.lastBaseAchievement?.cachedImage||entry.lastBaseAchievement?.image])
  void warmMythicImage(url);
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
