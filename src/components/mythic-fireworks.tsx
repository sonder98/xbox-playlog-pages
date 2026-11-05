import {useEffect,useRef} from 'react';

type Particle={x:number;y:number;vx:number;vy:number;turn:number;spin:number;size:number;life:number;maxLife:number;color:string;paper:boolean};
const palette=['#ffe9aa','#f9c363','#ffffff','#f2cd8c','#b9fb84','#e8ad60','#d9dfdd','#9cc7dd','#e0b6a5'];

/** Opening-only radial firework bursts: fast outward explosion, gravity and falling confetti.
 * No image/video download and no work after the wall is dismissed or first card is changed.
 */
export function MythicOpeningFireworks(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current,context=canvas?.getContext('2d',{alpha:true});
  if(!canvas||!context)return;
  const host=canvas.parentElement;
  const started=performance.now();
  let frame=0,width=0,height=0,dpr=1,previous=started,next=0;
  let particles:Particle[]=[];
  const events=[
   {time:.04,rx:.17,ry:.30,n:60},{time:.24,rx:.83,ry:.24,n:66},
   {time:.57,rx:.5,ry:.14,n:72},{time:.92,rx:.12,ry:.49,n:52},
   {time:1.24,rx:.87,ry:.48,n:53}
  ];
  let anchors:{x:number;y:number}[]=[];
  function layout(){
   width=host?.clientWidth||innerWidth;height=host?.clientHeight||innerHeight;
   dpr=Math.min(2,devicePixelRatio||1);
   canvas!.width=Math.round(width*dpr);canvas!.height=Math.round(height*dpr);
   canvas!.style.width=width+'px';canvas!.style.height=height+'px';
   context!.setTransform(dpr,0,0,dpr,0,0);
   const r=host?.querySelector('.mythic-poster.is-active')?.getBoundingClientRect();
   const outer=host?.getBoundingClientRect();
   anchors=events.map(({rx,ry})=>({
    x:r&&outer?r.left-outer.left+r.width*rx:width*rx,
    y:r&&outer?r.top-outer.top+r.height*ry:height*ry
   }));
  }
  layout();
  const rand=(seed:number)=>{const value=Math.sin(seed*127.1+119.77)*43758.5453;return value-Math.floor(value);};
  const burst=(event:number)=>{
   const origin=anchors[event],count=events[event].n;
   for(let i=0;i<count;i++){
    const seed=event*113+i*1.87;
    const angle=2*Math.PI*((i+.12*rand(seed+1))/count);
    const speed=(105+320*rand(seed+3))*(i%7===0?.75:1);
    const size=2+6*rand(seed+5);
    particles.push({
     x:origin.x,y:origin.y,vx:Math.cos(angle)*speed,
     vy:Math.sin(angle)*speed-50,
     turn:rand(seed+7)*Math.PI,spin:rand(seed+8)*9-4.5,
     size,life:1.9+1.7*rand(seed+9),maxLife:1.9+1.7*rand(seed+9),
     color:palette[(i+event*2)%palette.length],paper:i%3===0
    });
   }
  };
  function draw(now:number){
   const elapsed=(now-started)/1000,dt=Math.min((now-previous)/1000,.035);previous=now;
   context!.clearRect(0,0,width,height);
   while(next<events.length&&elapsed>=events[next].time){burst(next);next++;}
   // Bright circular shock waves clearly establish an explosive, radial launch.
   events.forEach((event,i)=>{
    const age=elapsed-event.time;
    if(age<0||age>.6)return;
    const pos=anchors[i];
    context!.beginPath();context!.arc(pos.x,pos.y,5+age*210,0,Math.PI*2);
    context!.strokeStyle='rgba(255,227,151,'+(.48*(1-age/.6)).toFixed(3)+')';
    context!.lineWidth=2.3*(1-age/.6)+.5;context!.stroke();
    context!.beginPath();context!.arc(pos.x,pos.y,Math.max(0,35-age*35),0,Math.PI*2);
    context!.fillStyle='rgba(255,244,195,'+(.17*(1-age/.6)).toFixed(3)+')';
    context!.fill();
   });
   particles=particles.filter(p=>p.life>0);
   for(const p of particles){
    p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
    p.vx*=Math.pow(.991,dt*60);p.vy+=240*dt;p.turn+=p.spin*dt;
    const opacity=Math.min(1,p.life/.6,(p.maxLife-p.life)*8);
    context!.globalAlpha=Math.max(0,opacity);
    context!.save();context!.translate(p.x,p.y);context!.rotate(p.turn);
    context!.fillStyle=p.color;
    if(p.paper){context!.fillRect(-p.size/2,-p.size/2,p.size,p.size*1.85);}
    else{
     context!.fillRect(-p.size*.25,-p.size*1.8,p.size*.5,p.size*3.6);
     context!.fillRect(-p.size*1.8,-p.size*.25,p.size*3.6,p.size*.5);
    }
    context!.restore();
   }
   context!.globalAlpha=1;
   if(elapsed<4.25)frame=requestAnimationFrame(draw);
   else context!.clearRect(0,0,width,height);
  }
  frame=requestAnimationFrame(draw);
  addEventListener('resize',layout,{passive:true});
  return()=>{cancelAnimationFrame(frame);removeEventListener('resize',layout);context.clearRect(0,0,width,height);};
 },[]);
 return <canvas ref={ref} className="mythic-wall-fireworks" aria-hidden="true"/>;
}
