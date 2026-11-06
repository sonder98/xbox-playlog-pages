/** FLIP transition between a showcase thumbnail and its fullscreen collectible.
 *  The flying copy is a real DOM clone, so cached artwork and card ornamentation
 *  remain visible during travel rather than flashing to a blank loading state.
 */
export type MythicFlightOrigin={element:HTMLElement;rect:DOMRect};

const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeGhost(source:HTMLElement,rect:DOMRect,kind:'preview'|'poster'){
 const layer=document.createElement('div');
 layer.className='mythic-flight-ghost';
 layer.dataset.flight=kind;
 layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{
  left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'
 });
 const copy=source.cloneNode(true) as HTMLElement;
 copy.removeAttribute('id');
 copy.removeAttribute('aria-label');
 copy.style.width='100%';
 copy.style.height='100%';
 copy.style.maxHeight='none';
 copy.style.aspectRatio='auto';
 copy.style.margin='0';
 copy.style.transform='none';
 layer.append(copy);
 document.body.append(layer);
 return layer;
}
function motion(from:DOMRect,to:DOMRect){
 return `translate3d(${from.left-to.left}px,${from.top-to.top}px,0) scale(${from.width/to.width},${from.height/to.height})`;
}

/** Mount the full-size modal before calling, so the target geometry is exact. */
export function flyMythicIn(origin:MythicFlightOrigin,target:HTMLElement,onArrive:()=>void){
 if(reducedMotion()){onArrive();return ()=>{};}
 const finish=target.getBoundingClientRect();
 if(!finish.width||!finish.height){onArrive();return ()=>{};}
 const ghost=makeGhost(origin.element,finish,'preview');
 ghost.style.transformOrigin='top left';
 const animation=ghost.animate([
  {transform:motion(origin.rect,finish),filter:'brightness(1)',offset:0},
  {transform:'translate3d(0,0,0) scale(1.015)',filter:'brightness(1.13)',offset:.83},
  {transform:'translate3d(0,0,0) scale(1)',filter:'brightness(1)',offset:1}
 ],{duration:520,easing:'cubic-bezier(.18,.82,.18,1)',fill:'forwards'});
 let cancelled=false;
 let blend:Animation|null=null;
 void animation.finished.then(()=>{
  if(cancelled)return;
  onArrive();
  // Give React time to reveal the full poster underneath the flying copy,
  // then blend the subtly different thumbnail layout into the full artwork.
  blend=ghost.animate([{opacity:1},{opacity:0}],{duration:135,easing:'ease-out',fill:'forwards'});
  return blend.finished.then(()=>{ghost.remove();});
 }).catch(()=>{if(!cancelled){ghost.remove();onArrive();}});
 return ()=>{cancelled=true;animation.cancel();blend?.cancel();ghost.remove();};
}

/** Keep the full-size frame on screen while it returns to its grid position. */
export function flyMythicOut(source:HTMLElement,destination:HTMLElement|null,onArrive:()=>void){
 if(reducedMotion()||!destination){onArrive();return ()=>{};}
 const from=source.getBoundingClientRect(),to=destination.getBoundingClientRect();
 // Don't fly towards an offscreen thumbnail after the visitor has swiped.
 if(!from.width||!to.width||to.bottom<0||to.top>innerHeight){
  onArrive();return ()=>{};
 }
 const ghost=makeGhost(source,from,'poster');
 const sx=to.width/from.width,sy=to.height/from.height;
 ghost.style.transformOrigin='top left';
 const animation=ghost.animate([
  {transform:'translate3d(0,0,0) scale(1)',opacity:1,offset:0},
  {transform:`translate3d(${to.left-from.left}px,${to.top-from.top}px,0) scale(${sx},${sy})`,
   opacity:.98,offset:.88},
  {transform:`translate3d(${to.left-from.left}px,${to.top-from.top}px,0) scale(${sx},${sy})`,
   opacity:0,offset:1}
 ],{duration:440,easing:'cubic-bezier(.3,.15,.16,1)',fill:'forwards'});
 let cancelled=false;
 void animation.finished.then(()=>{
  if(!cancelled){ghost.remove();onArrive();}
 }).catch(()=>{if(!cancelled){ghost.remove();onArrive();}});
 return ()=>{cancelled=true;animation.cancel();ghost.remove();};
}
