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

export function flyMythicIn(
 origin:MythicFlightOrigin,target:HTMLElement,ready:Promise<unknown>,
 onReveal:()=>void,onFinished:()=>void
){
 let cancelled=false;
 let animation:Animation|null=null;
 const source=origin.element;
 const previousSourceVisibility=source.style.visibility;
 const clearTap=()=>source.classList.remove('is-primed');
 const previousTargetVisibility=target.style.visibility;
 const previousTargetOpacity=target.style.opacity;
 let completed=false;
 const revealAndFinish=()=>{
  if(cancelled)return;
  onReveal();onFinished();
 };
 const run=async()=>{
  await waitForPaintedPoster(target,ready);
  if(cancelled)return;
  if(reducedMotion()){clearTap();revealAndFinish();return;}
  const finalRect=target.getBoundingClientRect();
  if(!finalRect.width||!finalRect.height){revealAndFinish();return;}
  // Switch from the thumbnail to the *complete* fullscreen card at exactly
  // the source rectangle, then transform only this ONE painted DOM surface.
  source.style.visibility='hidden';
  clearTap();
  target.style.visibility='visible';
  target.style.opacity='1';
  target.style.willChange='transform';
  animation=target.animate([
   {transform:scaledTransform(origin.rect,finalRect)},
   {transform:'translate3d(0,0,0) scale(1)'}
  ],{duration:570,easing:'cubic-bezier(.22,.72,.17,1)',fill:'both'});
  onReveal();
  try{await animation.finished;}catch{return;}
  if(cancelled)return;
  completed=true;
  animation.cancel();
  target.style.removeProperty('will-change');
  target.style.visibility=previousTargetVisibility;
  target.style.opacity=previousTargetOpacity;
  source.style.visibility=previousSourceVisibility;
  onFinished();
 };
 void run();
 return ()=>{
  cancelled=true;
  clearTap();
  animation?.cancel();
  if(!completed){
   source.style.visibility=previousSourceVisibility;
   target.style.visibility=previousTargetVisibility;
   target.style.opacity=previousTargetOpacity;
   target.style.removeProperty('will-change');
  }
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
