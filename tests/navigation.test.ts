import test from 'node:test';
import assert from 'node:assert/strict';
import {
 isNestedRoute,isStaleNavigationEntry,navigationDepth,navigationScrollY,planTabNavigation,withNavigationState,
 type PageRoute, type PageTab
} from '../src/navigation-state.ts';

const route=(tab:PageTab,extra:Partial<Omit<PageRoute,'tab'>>={})=>({tab,...extra});

test('switching between root tabs replaces the current entry and the active tab is a no-op',()=>{
 const root={playlog:true,epoch:'one',depth:0,scrollY:240};
 assert.deepEqual(planTabNavigation(route('manage'),'library',root),
  {action:'replace',target:'library',resetScroll:false});
 assert.deepEqual(planTabNavigation(route('manage'),'manage',root),{action:'none'});
});

test('switching tabs from a nested game or achievement view unwinds the full detail stack',()=>{
 for(const nested of [
  route('library',{gameId:'123'}),
  route('achievements',{dayId:'2026-11-26'}),
  route('achievements',{showcase:true}),
  route('achievements',{gapShowcase:true})
 ]){
  assert.equal(isNestedRoute(nested),true);
  assert.deepEqual(planTabNavigation(nested,'manage',{playlog:true,epoch:'one',depth:2}),
   {action:'unwind',steps:2,target:'manage'});
 }
});

test('a directly opened detail with no in-app history replaces to its tab instead of navigating outside',()=>{
 const direct=route('achievements',{dayId:'2026-11-26'});
 assert.deepEqual(planTabNavigation(direct,'achievements',{playlog:true,epoch:'one',depth:0}),
  {action:'replace',target:'achievements',resetScroll:true});
 assert.deepEqual(planTabNavigation(direct,'library',{playlog:true,epoch:'one',depth:0}),
  {action:'replace',target:'library',resetScroll:false});
});

test('history state parsing rejects invalid depth and scroll values',()=>{
 assert.equal(navigationDepth(null),0);
 assert.equal(navigationDepth({playlog:true,depth:-1}),0);
 assert.equal(navigationDepth({playlog:true,depth:1.5}),0);
 assert.equal(navigationDepth({playlog:false,depth:4}),0);
 assert.equal(navigationDepth({playlog:true,depth:3}),3);
 assert.equal(navigationScrollY({scrollY:-2},17),17);
 assert.equal(navigationScrollY({scrollY:NaN},17),17);
 assert.equal(navigationScrollY({scrollY:125.5},17),125.5);
});

test('navigation epochs identify abandoned tab and detail entries without blocking current details',()=>{
 assert.equal(isStaleNavigationEntry({playlog:true,epoch:'old'},'new'),true);
 assert.equal(isStaleNavigationEntry({playlog:true},'new'),true);
 assert.equal(isStaleNavigationEntry({playlog:true,epoch:'new'},'new'),false);
 assert.equal(isStaleNavigationEntry({playlog:false,epoch:'old'},'new'),false);
 const preserved=withNavigationState({other:'keep'},'new',0,90);
 assert.deepEqual(preserved,{other:'keep',playlog:true,epoch:'new',depth:0,scrollY:90});
});
