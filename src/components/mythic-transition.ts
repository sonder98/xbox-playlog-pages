/** Shared-element transition for the Mythic cabinet.
 * Move the *already painted* poster DOM node instead of cloning it.
 * cloneNode() recreates lazy images and briefly shows empty rings on iOS Safari.
 */
export type MythicFlightOrigin={element:HTMLElement;rect:DOMRect};

const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function movePaintedCard(source:HTMLElement,rect:DOMRect,kind:'preview'|'poster'){
 const parent=source.parentElement;
 if(!parent)return null;
 // Keep the original grid/slide geometry while the real card is in flight.
 const placeholder=source.cloneNode(false) as HTMLElement;
 placeholder.setAttribute('aria-hidden','true');
 placeholder.style.visibility='hidden';
 placeholder.style.pointerEvents='none';
 parent.replaceChild(placeholder,source);
 const layer=document.createElement('div');
 layer.className='mythic-flight-ghost';
 layer.dataset.flight=kind;
 layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{
  left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'
 });
 source.style.width='100%';
 source.style.height='100%';
 source.style.maxHeight='none';
 source.style.aspectRatio='auto';
 source.style.margin='0';
 layer.append(source);
 document.body.append(layer);
 let restored=false;
 function restore(){
  if(restored)return;
  restored=true;
  for(const name of ['width','height','maxHeight','aspectRatio','margin'])
   source.style.removeProperty(name.replace(/[A-Z]/g,v=>'-'+v.toLowerCase()));
  if(placeholder.isConnected)placeholder.replaceWith(source);
  else source.remove();
  layer.remove();
 }
 return {layer,restore};
}
function motion(from:DOMRect,to:DOMRect){
 return `translate3d(${from.left-to.left}px,${from.top-to.top}px,0) scale(${from.width/to.width},${from.height/to.height})`;
}
function afterPaint():Promise<void>{
 return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}

/** Fly the existing thumbnail to the fullscreen rectangle, then hand off
 * only after ALL required large-card images and fonts have decoded.
 */
export function flyMythicIn(
 origin:MythicFlightOrigin,target:HTMLElement,ready:Promise<unknown>,
 onReveal:()=>void,onFinished:()=>void
){
 if(reducedMotion()){
  void ready.then(()=>{onReveal();onFinished();},()=>{onReveal();onFinished();});
  return ()=>{};
 }
 const finish=target.getBoundingClientRect();
 if(!finish.width||!finish.height){void ready.then(()=>{onReveal();onFinished();},()=>{onReveal();onFinished();});return ()=>{};}
 const moved=movePaintedCard(origin.element,finish,'preview');
 if(!moved){void ready.then(()=>{onReveal();onFinished();},()=>{onReveal();onFinished();});return ()=>{};}
 const {layer,restore}=moved;
 layer.style.transformOrigin='top left';
 const animation=layer.animate([
  {transform:motion(origin.rect,finish),offset:0},
  {transform:'translate3d(0,0,0) scale(1.01)',offset:.88},
  {transform:'translate3d(0,0,0) scale(1)',offset:1}
 ],{duration:560,easing:'cubic-bezier(.20,.76,.18,1)',fill:'forwards'});
 let cancelled=false;
 let blend:Animation|null=null;
 void Promise.allSettled([animation.finished,ready]).then(async()=>{
  if(cancelled)return;
  // Source and destination both remain fully dressed until this handoff.
  onReveal();
  await afterPaint();
  if(cancelled)return;
  blend=layer.animate([{opacity:1},{opacity:0}],{
   duration:200,easing:'ease-in-out',fill:'forwards'
  });
  await blend.finished.catch(()=>{});
  if(!cancelled){restore();onFinished();}
 });
 return ()=>{
  cancelled=true;animation.cancel();blend?.cancel();restore();
 };
}

/** Reverse motion uses the original painted modal card, too. No new
 * <img> nodes are created during the return flight.
 */
export function flyMythicOut(source:HTMLElement,destination:HTMLElement|null,onArrive:()=>void){
 if(reducedMotion()||!destination){onArrive();return ()=>{};}
 const from=source.getBoundingClientRect(),to=destination.getBoundingClientRect();
 if(!from.width||!to.width||to.bottom<0||to.top>innerHeight){
  onArrive();return ()=>{};
 }
 const moved=movePaintedCard(source,from,'poster');
 if(!moved){onArrive();return ()=>{};}
 const {layer,restore}=moved;
 layer.style.transformOrigin='top left';
 const animation=layer.animate([
  {transform:'translate3d(0,0,0) scale(1)',opacity:1,offset:0},
  {transform:`translate3d(${to.left-from.left}px,${to.top-from.top}px,0) scale(${to.width/from.width},${to.height/from.height})`,
   opacity:.98,offset:.89},
  {transform:`translate3d(${to.left-from.left}px,${to.top-from.top}px,0) scale(${to.width/from.width},${to.height/from.height})`,
   opacity:0,offset:1}
 ],{duration:450,easing:'cubic-bezier(.3,.15,.16,1)',fill:'forwards'});
 let cancelled=false;
 void animation.finished.then(()=>{
  if(cancelled)return;
  restore();onArrive();
 }).catch(()=>{if(!cancelled){restore();onArrive();}});
 return ()=>{cancelled=true;animation.cancel();restore();};
}
