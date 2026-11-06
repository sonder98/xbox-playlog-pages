import {useEffect,useRef} from 'react';

/** Closely follows the 9.47s reference video: brief gold flash, small
 * foil fragments bursting from both card edges, gravity and lingering glitter.
 * No oversized shockwaves or regular radial star explosions.
 */
type Piece={x:number;y:number;vx:number;vy:number;angle:number;spin:number;w:number;h:number;age:number;ttl:number;color:string;glint:boolean;seed:number};
const gold=['#efd49c','#e8bd72','#fff0bf','#c7a36f','#fffaf0'];
const color=['#b2dff0','#e9a0a2','#8ae3ad','#b0bdea'];
const volleys=[
 {at:.24,side:-1,y:.20,n:52},{at:.36,side:1,y:.27,n:60},
 {at:.66,side:-1,y:.50,n:33},{at:.95,side:1,y:.51,n:33},
 {at:1.24,side:-1,y:.69,n:24},{at:1.52,side:1,y:.65,n:22}
];
const rand=(v:number)=>{const n=Math.sin(v*127.137+78.41)*43832.345;return n-Math.floor(n)};
export function MythicOpeningFireworks(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current,ctx=canvas?.getContext('2d',{alpha:true});
  if(!canvas||!ctx)return;
  const host=canvas.parentElement;
  let raf=0,last=performance.now(),start=last,next=0;
  let width=1,height=1,scale=1,pieces:Piece[]=[];
  function resize(){
   width=host?.clientWidth||innerWidth;height=host?.clientHeight||innerHeight;
   scale=Math.min(devicePixelRatio||1,2);
   canvas!.width=Math.round(width*scale);canvas!.height=Math.round(height*scale);
   canvas!.style.width=width+'px';canvas!.style.height=height+'px';
   ctx!.setTransform(scale,0,0,scale,0,0);
  }
  resize();
  function emit(i:number){
   const e=volleys[i],poster=host?.querySelector('.mythic-poster.is-active')?.getBoundingClientRect();
   const frame=host?.getBoundingClientRect();
   const left=poster&&frame?poster.left-frame.left:width*.18;
   const right=poster&&frame?poster.right-frame.left:width*.82;
   const y=(poster&&frame?poster.top-frame.top:height*.1)+(poster?.height||height*.7)*e.y;
   for(let j=0;j<e.n;j++){
    const seed=j+i*107.4,angle=(e.side===-1?0:Math.PI)+(rand(seed+2)-.5)*2.1;
    const speed=80+rand(seed+5)*210,glint=j%9===0;
    pieces.push({
     x:(e.side===-1?left+7:right-7)+(rand(seed+9)-.5)*22,
     y:y+(rand(seed+11)-.5)*27,
     vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-40-rand(seed+19)*120,
     angle:rand(seed+12)*6.28,spin:(rand(seed+7)-.5)*11,
     w:glint?1.3+rand(seed+6)*1.7:2+rand(seed+15)*3,
     h:glint?2.3:3+rand(seed+24)*6,
     age:0,ttl:1.45+rand(seed+29)*2,
     color:glint?'#ffdfa3':j%5===0?color[Math.floor(rand(seed+34)*color.length)]:gold[Math.floor(rand(seed+45)*gold.length)],
     glint,seed
    });
   }
  }
  function draw(now:number){
   const t=(now-start)/1000,dt=Math.min(.035,(now-last)/1000);last=now;
   ctx!.clearRect(0,0,width,height);
   while(next<volleys.length&&t>=volleys[next].at){emit(next);next++;}
   pieces=pieces.filter(p=>p.age<p.ttl);
   for(const p of pieces){
    p.age+=dt;p.x+=(p.vx+Math.sin(p.age*5+p.seed)*12)*dt;p.y+=p.vy*dt;
    p.vy+=175*dt;p.vx*=Math.pow(.984,dt*60);p.angle+=p.spin*dt;
    ctx!.save();
    ctx!.globalAlpha=Math.max(0,Math.min(1,p.age*10,(p.ttl-p.age)/.52))*.87;
    ctx!.translate(p.x,p.y);ctx!.rotate(p.angle);ctx!.fillStyle=p.color;
    if(p.glint){
     ctx!.fillRect(-.6,-p.h*1.75,1.2,p.h*3.5);
     ctx!.fillRect(-p.h*1.75,-.6,p.h*3.5,1.2);
    }else{
     const edge=.28+.72*Math.abs(Math.cos(p.angle*.75));
     ctx!.fillRect(-p.w/2,-p.h/2,p.w*edge,p.h);
    }
    ctx!.restore();
   }
   ctx!.globalAlpha=1;
   if(t<4.25)raf=requestAnimationFrame(draw);
   else ctx!.clearRect(0,0,width,height);
  }
  raf=requestAnimationFrame(draw);
  addEventListener('resize',resize,{passive:true});
  return()=>{cancelAnimationFrame(raf);removeEventListener('resize',resize);ctx.clearRect(0,0,width,height)};
 },[]);
 return <canvas ref={ref} className="mythic-wall-fireworks" aria-hidden="true"/>;
}
