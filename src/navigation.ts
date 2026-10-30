import {useEffect,useLayoutEffect,useState} from 'react';
const pages=['overview','library','history','settings'] as const;
export type PageTab=typeof pages[number];
function route(){
 const [page,,id]=location.hash.slice(1).split('/');
 return {tab:pages.includes(page as PageTab)?page as PageTab:'overview' as PageTab,gameId:id||null};
}
export function usePageNavigation(){
 const [current,setCurrent]=useState(route);
 useEffect(()=>{
  const old=history.state;
  history.replaceState({...old,playlog:true,depth:old?.playlog?old.depth:0,scrollY:scrollY},'');
  const restore=history.scrollRestoration;history.scrollRestoration='manual';
  const pop=()=>setCurrent(route());
  addEventListener('popstate',pop);addEventListener('hashchange',pop);
  return()=>{removeEventListener('popstate',pop);removeEventListener('hashchange',pop);history.scrollRestoration=restore;};
 },[]);
 useLayoutEffect(()=>{if(!current.gameId)window.scrollTo(0,history.state?.scrollY||0);},[current]);
 function push(hash:string){
  const old=history.state;
  history.replaceState({...old,scrollY:window.scrollY},'');
  history.pushState({playlog:true,depth:(old?.depth||0)+1,scrollY:hash.includes('/game/')?window.scrollY:0},'',hash);
  setCurrent(route());
 }
 function navigate(next:PageTab){if(next!==current.tab||current.gameId)push('#'+next);}
 function openGame(id:string){push('#'+current.tab+'/game/'+id);}
 function back(){
  if(history.state?.playlog&&history.state.depth>0)history.back();
  else {history.replaceState({playlog:true,depth:0,scrollY:0},'',current.gameId?'#'+current.tab:'#overview');setCurrent(route());}
 }
 return {...current,navigate,back,openGame};
}
