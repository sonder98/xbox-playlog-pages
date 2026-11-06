/** FLIP a single, fully rendered Mythic poster between the grid and the
 * fullscreen viewport. The same poster element is animated end-to-end.
 * Reparenting/cloning image elements is forbidden: iOS Safari drops their
 * painted surfaces and briefly exposes blue/empty image placeholders.
 */
export type MythicFlightOrigin={element:HTMLElement;rect:DOMRect};

const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nextPaint=()=>new Promise<void>(resolve=>
 requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))
);

function scaledTransform(from:DOMRect,to:DOMRect){
 return `translate3d(${from.left-to.left}px,${from.top-to.top}px,0) scale(${from.width/to.width},${from.height/to.height})`;
}

/** Preloading bytes is not enough: React must commit the image classes and
 * Safari must rasterize the actual <img>, badge and background in the modal.
 * Resolve only after the target DOM is dressed and has passed two paint frames.
 */
async function waitForPaintedPoster(poster:HTMLElement,prepared:Promise<unknown>){
 await prepared.catch(()=>{});
 const hasPaintedParts=()=>{
  if(!poster.isConnected||poster.classList.contains('is-type-loading'))return false;
  const backdrop=poster.querySelector<HTMLElement>('.mythic-poster-backdrop');
  if(backdrop?.classList.contains('has-promotional-art')&&!backdrop.classList.contains('is-loaded'))return false;
  for(const img of poster.querySelectorAll<HTMLImageElement>('img')){
   if(!img.complete)return false;
   if(!img.naturalWidth)continue; // Broken URL shows a stable placeholder.
   if(img.closest('.mythic-badge-art')&&!img.classList.contains('is-ready'))return false;
   if(img.classList.contains('mythic-poster-avatar')&&!img.classList.contains('is-loaded'))return false;
   if(img.closest('.mythic-poster-portrait')&&!img.classList.contains('is-loaded'))return false;
   if(img.closest('.mythic-poster-achievement-art')&&!img.classList.contains('is-loaded'))return false;
  }
  return true;
 };
 if(!hasPaintedParts()){
  await new Promise<void>(resolve=>{
   let done=false;
   const observer=new MutationObserver(check);
   const timer=window.setTimeout(finish,2800);
   function finish(){
    if(done)return;
    done=true;observer.disconnect();window.clearTimeout(timer);resolve();
   }
   function check(){
    if(!poster.isConnected||hasPaintedParts())finish();
   }
   observer.observe(poster,{subtree:true,attributes:true,attributeFilter:['class','src']});
   check();
  });
 }
 await nextPaint();
}

/** A genuine immediate-response FLIP:
 * The original *painted thumbnail*, still owned by React in its showcase,
 * starts moving in the very first post-click frame. Fullscreen assets prepare
 * in parallel, hidden below it. Once BOTH the motion and fully dressed modal
 * are ready, the two cards crossfade in one pass. We never clone/reparent an
 * image DOM node (which previously caused iOS Safari image flashes).
 */
export function flyMythicIn(
 origin:MythicFlightOrigin,target:HTMLElement,ready:Promise<unknown>,
 onReveal:()=>void,onFinished:()=>void
){
 let cancelled=false;
 const source=origin.element;
 const gallery=source.closest<HTMLElement>('.mythic-showcase-screen');
 let move:Animation|null=null;
 let blend:Animation|null=null;
 const prevSourceStyle=source.getAttribute('style');
 const prevTargetVisibility=target.style.visibility;
 const prevTargetOpacity=target.style.opacity;
 const galleryScroll=gallery?.scrollTop??0;
 let placeholder:HTMLElement|null=null;
 const complete=()=>{if(!cancelled){onReveal();onFinished();}};
 // For reduced-motion, skip transform but retain the complete-art requirement.
 if(reducedMotion()||!gallery||!source.isConnected){
  void waitForPaintedPoster(target,ready).then(complete);
  return ()=>{cancelled=true;};
 }
 const finalRect=target.getBoundingClientRect();
 if(!finalRect.width||!finalRect.height||!origin.rect.width||!origin.rect.height){
  void waitForPaintedPoster(target,ready).then(complete);
  return ()=>{cancelled=true;};
 }
 const restore=()=>{
  move?.cancel();
  blend?.cancel();
  source.classList.remove('is-flight-source','is-primed');
  if(prevSourceStyle===null)source.removeAttribute('style');
  else source.setAttribute('style',prevSourceStyle);
  placeholder?.remove();
  gallery.classList.remove('is-flight-active');
  gallery.scrollTop=galleryScroll;
 };
 // Preserve grid geometry while switching this SAME thumbnail to fixed mode.
 placeholder=document.createElement('div');
 placeholder.className='mythic-flight-spacer';
 placeholder.style.width=origin.rect.width+'px';
 placeholder.style.height=origin.rect.height+'px';
 source.parentElement?.insertBefore(placeholder,source);
 gallery.classList.add('is-flight-active');
 source.classList.add('is-flight-source');
 Object.assign(source.style,{
  position:'fixed',left:origin.rect.left+'px',top:origin.rect.top+'px',
  width:origin.rect.width+'px',height:origin.rect.height+'px',
  maxHeight:'none',margin:'0',zIndex:'3',transformOrigin:'top left'
 });
 target.dataset.visualStartDelayMs=String(
  Math.round(performance.now()-Number(source.dataset.openClickedAt||performance.now()))
 );
 // No network/decode await is allowed before this animation starts.
 move=source.animate([
  {transform:'translate3d(0,0,0) scale(1)'},
  {transform:`translate3d(${finalRect.left-origin.rect.left}px,${finalRect.top-origin.rect.top}px,0) scale(${finalRect.width/origin.rect.width},${finalRect.height/origin.rect.height})`}
 ],{duration:370,easing:'cubic-bezier(.22,.72,.17,1)',fill:'forwards'});
 const run=async()=>{
  const fullyPainted=waitForPaintedPoster(target,ready).then(()=>{
   target.dataset.artReadyDelayMs=String(Math.round(
    performance.now()-Number(source.dataset.openClickedAt||performance.now())
   ));
  });
  await Promise.allSettled([move!.finished,fullyPainted]);
  if(cancelled)return;
  // Keep the original enlarged thumbnail visible until the *actual* full
  // poster's image classes, badge, border and fonts have painted.
  target.style.visibility='visible';
  target.style.opacity='0';
  onReveal();
  await nextPaint();
  if(cancelled)return;
  target.dataset.openDelayMs=String(
   Math.round(performance.now()-Number(source.dataset.openClickedAt||performance.now()))
  );
  blend=target.animate([{opacity:0},{opacity:1}],
   {duration:110,easing:'ease-in-out',fill:'forwards'});
  try{await blend.finished;}catch{return;}
  if(cancelled)return;
  target.style.opacity='1';
  // The fullscreen poster is now opaque, so removing the temporary fixed
  // thumbnail cannot expose an empty frame or the gallery behind it.
  restore();
  onFinished();
  target.style.visibility=prevTargetVisibility;
  target.style.opacity=prevTargetOpacity;
 };
 void run();
 return ()=>{
  cancelled=true;
  restore();
  target.style.visibility=prevTargetVisibility;
  target.style.opacity=prevTargetOpacity;
 };
}

export function flyMythicOut(source:HTMLElement,destination:HTMLElement|null,onArrive:()=>void){
 if(reducedMotion()||!destination){onArrive();return ()=>{};}
 const from=source.getBoundingClientRect(),to=destination.getBoundingClientRect();
 if(!from.width||!to.width||to.bottom<0||to.top>innerHeight){
  onArrive();return ()=>{};
 }
 const destinationVisibility=destination.style.visibility;
 const sourceVisibility=source.style.visibility;
 destination.style.visibility='hidden';
 source.style.visibility='visible';
 source.style.willChange='transform';
 const animation=source.animate([
  {transform:'translate3d(0,0,0) scale(1)',opacity:1},
  {transform:scaledTransform(to,from),opacity:1}
 ],{duration:470,easing:'cubic-bezier(.3,.15,.16,1)',fill:'both'});
 let cancelled=false;
 const restore=()=>{
  animation.cancel();
  source.style.visibility=sourceVisibility;
  source.style.removeProperty('will-change');
  destination.style.visibility=destinationVisibility;
 };
 void animation.finished.then(()=>{
  if(!cancelled){restore();onArrive();}
 }).catch(()=>{if(!cancelled){restore();onArrive();}});
 return ()=>{cancelled=true;restore();};
}
