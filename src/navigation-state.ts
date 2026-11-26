export const PAGE_TABS=['overview','library','achievements','manage','dusty'] as const;
export type PageTab=typeof PAGE_TABS[number];
export type PageRoute={
 tab:PageTab;
 gameId?:string|null;
 dayId?:string|null;
 showcase?:boolean;
 gapShowcase?:boolean;
};
export type TabNavigationPlan=
 | {action:'none'}
 | {action:'unwind';steps:number;target:PageTab}
 | {action:'replace';target:PageTab;resetScroll:boolean};

type NavigationState={playlog?:unknown;depth?:unknown;epoch?:unknown;scrollY?:unknown;[key:string]:unknown};

function stateObject(value:unknown):NavigationState{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as NavigationState:{};
}
export function navigationDepth(value:unknown):number{
 const state=stateObject(value);
 return state.playlog===true&&typeof state.depth==='number'&&Number.isSafeInteger(state.depth)&&state.depth>=0?state.depth:0;
}
export function navigationScrollY(value:unknown,fallback=0):number{
 const scrollY=stateObject(value).scrollY;
 return typeof scrollY==='number'&&Number.isFinite(scrollY)&&scrollY>=0?scrollY:fallback;
}
export function isNestedRoute(route:PageRoute):boolean{
 return !!(route.gameId||route.dayId||route.showcase||route.gapShowcase);
}
export function planTabNavigation(current:PageRoute,next:PageTab,state:unknown):TabNavigationPlan{
 const nested=isNestedRoute(current);
 if(!nested&&next===current.tab)return {action:'none'};
 const depth=navigationDepth(state);
 if(nested&&depth>0)return {action:'unwind',steps:depth,target:next};
 return {action:'replace',target:next,resetScroll:nested&&next===current.tab};
}
export function isStaleNavigationEntry(value:unknown,activeEpoch:string):boolean{
 const state=stateObject(value);
 return state.playlog===true&&state.epoch!==activeEpoch;
}
export function withNavigationState(value:unknown,epoch:string,depth:number,scrollY:number):NavigationState{
 return {...stateObject(value),playlog:true,epoch,depth,scrollY};
}
