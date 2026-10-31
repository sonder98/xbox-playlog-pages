import {useEffect,useId,useRef,useState} from 'react';
import {ArrowDownUp,Check} from 'lucide-react';
import type {AchievementSort} from '../achievement-sort';

const choices:[AchievementSort,string][]=[
 ['date-desc','解锁时间：新 → 旧'],
 ['date-asc','解锁时间：旧 → 新'],
 ['rarity-asc','稀有度：低 → 高'],
 ['rarity-desc','稀有度：高 → 低'],
];
/** Shared compact dropdown for game detail and day achievement pages. */
export function AchievementSortControl({order,onChange}:{order:AchievementSort;onChange:(next:AchievementSort)=>void}){
 const [open,setOpen]=useState(false);
 const wrapper=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const menuId=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!wrapper.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);
  menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  return ()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 return <div className="achievement-sort-control" ref={wrapper}>
  <button type="button" ref={trigger} className={'achievement-sort-toggle'+(open?' is-open':'')} aria-label="成就排序"
   aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined} title="选择成就排序方式"
   onClick={()=>setOpen(v=>!v)}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}
    if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);}
   }}><span>排序</span><ArrowDownUp size={17} aria-hidden="true"/></button>
  {open&&<div className="achievement-sort-menu" id={menuId} role="menu" aria-label="成就排序方式" ref={menu}
   onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return;}
    if(event.key==='Tab'){setOpen(false);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
   }}>{choices.map(([id,label])=><button type="button" className={'achievement-sort-option'+(order===id?' selected':'')} key={id}
    role="menuitemradio" aria-checked={order===id} onClick={()=>{onChange(id);setOpen(false);trigger.current?.focus();}}>
    <span>{label}</span>{order===id&&<Check size={16} aria-hidden="true"/>}
   </button>)}</div>}
 </div>;
}
