import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {
 isNestedRoute,isStaleNavigationEntry,navigationDepth,navigationScrollY,planTabNavigation,withNavigationState,
 type PageTab
} from './navigation-state';
export type {PageTab} from './navigation-state';
function createEpoch(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function route(){
 const [page,section,id]=location.hash.slice(1).split('/');
 // Older #history and #settings bookmarks now open the combined fourth tab.
 const normalized=page==='history'||page==='settings'?'manage':page;
 return {tab:(['overview','library','achievements','manage','dusty'].includes(normalized)?normalized:'overview') as PageTab,
  gameId:section==='game'?id||null:null,
  dayId:page==='achievements'&&section==='day'&&/^\d{4}-\d{2}-\d{2}$/.test(id||'')?id:null,
  showcase:page==='achievements'&&section==='showcase',
  gapShowcase:page==='achievements'&&section==='gaps'};
}
export function usePageNavigation(){
 const [current,setCurrent]=useState(route);
 const currentRef=useRef(current);
 const pendingTab=useRef<PageTab|null>(null);
 const activeEpoch=useRef('');
 const scrollPositions=useRef<Record<PageTab,number>>({overview:0,library:0,achievements:0,manage:0,dusty:0});
 const commitRoute=()=>{const next=route();currentRef.current=next;setCurrent(next);return next;};
 useEffect(()=>{
  const old=history.state;
  // Entries created before tab navigation was fixed have no epoch and may contain
  // a stack of old tab switches. Treat the current entry as a fresh app root.
  const hasEpoch=old?.playlog===true&&typeof old.epoch==='string';
  const epoch=hasEpoch?old.epoch as string:createEpoch();
  activeEpoch.current=epoch;
  const depth=hasEpoch?navigationDepth(old):0;
  const scroll=navigationScrollY(old,window.scrollY);
  history.replaceState(withNavigationState(old,epoch,depth,scroll),'');
  const initial=route();
  currentRef.current=initial;
  scrollPositions.current[initial.tab]=scroll;
  const restore=history.scrollRestoration;
  history.scrollRestoration='manual';
  const pop=()=>{
   const requestedTab=pendingTab.current;
   if(requestedTab){
    pendingTab.current=null;
    const base=route();
    const baseScroll=navigationScrollY(history.state,0);
    scrollPositions.current[base.tab]=baseScroll;
    const targetScroll=requestedTab===base.tab?baseScroll:scrollPositions.current[requestedTab]??0;
    const epoch=createEpoch();
    activeEpoch.current=epoch;
    history.replaceState(withNavigationState(history.state,epoch,0,targetScroll),'','#'+requestedTab);
    commitRoute();
    return;
   }
   // A tab switch starts a new navigation epoch. Old tab entries and abandoned
   // detail entries are skipped instead of reappearing on Back/Forward.
   if(isStaleNavigationEntry(history.state,activeEpoch.current)){
    const tab=currentRef.current.tab;
    const scroll=scrollPositions.current[tab]??0;
    history.replaceState(withNavigationState(history.state,activeEpoch.current,0,scroll),'','#'+tab);
    commitRoute();
    history.back();
    return;
   }
   commitRoute();
  };
  const hash=()=>{if(!isStaleNavigationEntry(history.state,activeEpoch.current))commitRoute();};
  addEventListener('popstate',pop);
  addEventListener('hashchange',hash);
  return()=>{
   removeEventListener('popstate',pop);
   removeEventListener('hashchange',hash);
   history.scrollRestoration=restore;
  };
 },[]);
 useLayoutEffect(()=>{
  if(!current.gameId)window.scrollTo(0,navigationScrollY(history.state,0));
 },[current]);
 function push(hash:string){
  const old=history.state;
  const depth=navigationDepth(old);
  const scroll=window.scrollY;
  if(depth===0)scrollPositions.current[currentRef.current.tab]=scroll;
  history.replaceState(withNavigationState(old,activeEpoch.current,depth,scroll),'');
  history.pushState(withNavigationState(null,activeEpoch.current,depth+1,hash.includes('/game/')?scroll:0),'',hash);
  commitRoute();
 }
 function navigate(next:PageTab){
  if(pendingTab.current){pendingTab.current=next;return;}
  const plan=planTabNavigation(currentRef.current,next,history.state);
  if(plan.action==='none')return;
  if(plan.action==='unwind'){
   pendingTab.current=next;
   history.go(-plan.steps);
   return;
  }
  if(!isNestedRoute(currentRef.current))scrollPositions.current[currentRef.current.tab]=window.scrollY;
  const targetScroll=plan.resetScroll?0:scrollPositions.current[next]??0;
  const epoch=createEpoch();
  activeEpoch.current=epoch;
  history.replaceState(withNavigationState(history.state,epoch,0,targetScroll),'','#'+next);
  commitRoute();
 }
 function openGame(id:string){push('#'+currentRef.current.tab+'/game/'+id);}
 function openAchievementGame(id:string){push('#achievements/game/'+id);}
 function openAchievementDay(day:string){push('#achievements/day/'+day);}
 function openAchievementShowcase(){push('#achievements/showcase');}
 function openAchievementGapShowcase(){push('#achievements/gaps');}
 // Adjacent-day browsing replaces the current day entry so Back returns to the heatmap,
 // not a trail of dates visited with the arrow controls.
 function changeAchievementDay(day:string){
  history.replaceState({...history.state,scrollY:0},'','#achievements/day/'+day);
  commitRoute();
 }
 function back(){
  if(history.state?.playlog&&navigationDepth(history.state)>0){history.back();return;}
  const active=currentRef.current;
  const nested=isNestedRoute(active);
  const target=nested?'#'+active.tab:'#overview';
  const scroll=nested?scrollPositions.current[active.tab]??navigationScrollY(history.state,0):0;
  if(!nested){const epoch=createEpoch();activeEpoch.current=epoch;}
  history.replaceState(withNavigationState(history.state,activeEpoch.current,0,scroll),'',target);
  commitRoute();
 }
 return {...current,navigate,back,openGame,openAchievementGame,openAchievementDay,openAchievementShowcase,openAchievementGapShowcase,changeAchievementDay};
}
