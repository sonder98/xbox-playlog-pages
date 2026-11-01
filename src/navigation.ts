import {useEffect,useLayoutEffect,useState} from 'react';
const pages=['overview','library','achievements','manage','dusty'] as const;
export type PageTab=typeof pages[number];
function route(){
 const [page,section,id]=location.hash.slice(1).split('/');
 // Older #history and #settings bookmarks now open the combined fourth tab.
 const normalized=page==='history'||page==='settings'?'manage':page;
 return {tab:pages.includes(normalized as PageTab)?normalized as PageTab:'overview' as PageTab,gameId:section==='game'?id||null:null,dayId:page==='achievements'&&section==='day'&&/^\d{4}-\d{2}-\d{2}$/.test(id||'')?id:null,showcase:page==='achievements'&&section==='showcase',gapShowcase:page==='achievements'&&section==='gaps'};
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
 function navigate(next:PageTab){if(next!==current.tab||current.gameId||current.dayId||current.showcase||current.gapShowcase)push('#'+next);}
 function openGame(id:string){push('#'+current.tab+'/game/'+id);}
 function openAchievementDay(day:string){push('#achievements/day/'+day);}
 function openAchievementShowcase(){push('#achievements/showcase');}
 function openAchievementGapShowcase(){push('#achievements/gaps');}
 // Adjacent-day browsing replaces the current day entry so Back returns to the heatmap,
 // not a trail of dates visited with the arrow controls.
 function changeAchievementDay(day:string){
  history.replaceState({...history.state,scrollY:0},'','#achievements/day/'+day);
  setCurrent(route());
 }
 function back(){
  if(history.state?.playlog&&history.state.depth>0)history.back();
  else {history.replaceState({playlog:true,depth:0,scrollY:0},'',current.gameId?'#'+current.tab:'#overview');setCurrent(route());}
 }
 return {...current,navigate,back,openGame,openAchievementDay,openAchievementShowcase,openAchievementGapShowcase,changeAchievementDay};
}
