import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ArrowDownUp,Check,ListFilter} from 'lucide-react';
import type {AchievementSort,AchievementUnlockFilter} from '../achievement-sort';

type Option<T extends string>=[T,string];

const sortChoices:Option<AchievementSort>[]=[
 ['date-desc','解锁时间：新 → 旧'],
 ['date-asc','解锁时间：旧 → 新'],
 ['rarity-asc','稀有度：低 → 高'],
 ['rarity-desc','稀有度：高 → 低'],
];
const statusChoices:Option<AchievementUnlockFilter>[]=[
 ['all','全部'],
 ['unlocked','已解锁'],
 ['locked','未解锁'],
];

/** Same accessible dropdown, menu keyboard behavior, and appearance for both controls. */
function AchievementDropdown<T extends string>({title,label,menuLabel,value,options,onChange,icon}:{
 title:string;label:string;menuLabel:string;value:T;options:Option<T>[];onChange:(next:T)=>void;icon:ReactNode;
}){
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
  <button type="button" ref={trigger} className={'achievement-sort-toggle'+(open?' is-open':'')} aria-label={label}
   aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined} title={'选择'+menuLabel}
   onClick={()=>setOpen(v=>!v)}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}
    if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);}
   }}><span>{title}</span>{icon}</button>
  {open&&<div className="achievement-sort-menu" id={menuId} role="menu" aria-label={menuLabel} ref={menu}
   onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return;}
    if(event.key==='Tab'){setOpen(false);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
   }}>{options.map(([id,optionLabel])=><button type="button" className={'achievement-sort-option'+(value===id?' selected':'')} key={id}
    role="menuitemradio" aria-checked={value===id} onClick={()=>{onChange(id);setOpen(false);trigger.current?.focus();}}>
    <span>{optionLabel}</span>{value===id&&<Check size={16} aria-hidden="true"/>}
   </button>)}</div>}
 </div>;
}

/** The locked-only view does not expose the meaningless unlock-date sort options. */
export function AchievementSortControl({order,onChange,lockedOnly=false}:{
 order:AchievementSort;onChange:(next:AchievementSort)=>void;lockedOnly?:boolean;
}){
 return <AchievementDropdown title="排序" label="成就排序" menuLabel="成就排序方式"
  value={order} onChange={onChange} options={lockedOnly?sortChoices.slice(2):sortChoices}
  icon={<ArrowDownUp size={17} aria-hidden="true"/>}/>;
}

export function AchievementUnlockFilterControl({filter,onChange}:{
 filter:AchievementUnlockFilter;onChange:(next:AchievementUnlockFilter)=>void;
}){
 return <AchievementDropdown title="筛选" label="成就筛选" menuLabel="成就筛选方式"
  value={filter} onChange={onChange} options={statusChoices}
  icon={<ListFilter size={17} aria-hidden="true"/>}/>;
}
