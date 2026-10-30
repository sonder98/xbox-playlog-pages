import {useEffect,useState} from 'react';
const pages=['overview','library','history','settings'] as const;
export type PageTab=typeof pages[number];
function currentTab():PageTab{
  const hash=window.location.hash.slice(1);
  return pages.includes(hash as PageTab)?hash as PageTab:'overview';
}
export function usePageNavigation(){
  const [tab,setTab]=useState<PageTab>(currentTab);
  useEffect(()=>{
    const old=window.history.state;
    window.history.replaceState({...old,playlog:true,tab:currentTab(),depth:old?.playlog?old.depth:0,scrollY:window.scrollY},'');
    const restore=window.history.scrollRestoration;
    window.history.scrollRestoration='manual';
    const pop=(event:PopStateEvent)=>{
      setTab(currentTab());
      requestAnimationFrame(()=>window.scrollTo(0,event.state?.scrollY||0));
    };
    window.addEventListener('popstate',pop);
    return ()=>{window.removeEventListener('popstate',pop);window.history.scrollRestoration=restore;};
  },[]);
  function navigate(next:PageTab){
    if(next===tab)return;
    const old=window.history.state;
    window.history.replaceState({...old,scrollY:window.scrollY},'');
    window.history.pushState({playlog:true,tab:next,depth:(old?.depth||0)+1,scrollY:0},'', '#'+next);
    setTab(next);
    window.scrollTo(0,0);
  }
  function back(){
    if(window.history.state?.playlog&&window.history.state.depth>0)window.history.back();
    else{
      window.history.replaceState({playlog:true,tab:'overview',depth:0,scrollY:0},'', '#overview');
      setTab('overview');
      window.scrollTo(0,0);
    }
  }
  return {tab,navigate,back};
}
