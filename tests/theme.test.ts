import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeThemePreference,readThemePreference,saveThemePreference,THEME_BAR_COLORS,THEME_STORAGE_KEY} from '../src/theme.ts';

test('theme defaults to dark on unset, invalid, or unavailable storage',()=>{
  assert.equal(normalizeThemePreference(null),'dark');
  assert.equal(normalizeThemePreference('system'),'dark');
  assert.equal(normalizeThemePreference('light'),'light');
  assert.equal(readThemePreference({getItem:()=>null}),'dark');
  assert.equal(readThemePreference({getItem:()=>{throw new Error('blocked');}}),'dark');
});
test('theme persists without writing Xbox records or other user preferences',()=>{
  const values=new Map<string,string>();
  const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  saveThemePreference('light',store);
  assert.deepEqual([...values.entries()],[[THEME_STORAGE_KEY,'light']]);
  assert.equal(readThemePreference(store),'light');
  saveThemePreference('dark',store);
  assert.equal(readThemePreference(store),'dark');
  assert.deepEqual(THEME_BAR_COLORS,{dark:'#0F0F0F',light:'#F4F6F3'});
  assert.doesNotThrow(()=>saveThemePreference('light',{setItem:()=>{throw new Error('blocked');}}));
});

test('light-mode detail Mythic trigger overrides the shared dark background without changing compact layout',()=>{
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.mythic-wall-entry,\.detail-mythic-trigger\{[^}]*background:linear-gradient\(120deg,#332819,#171c1a\)/);
  const scoped=css.match(/:root\[data-theme="light"\] \.game-detail \.detail-mythic-trigger \{([^}]+)\}/);
  assert.ok(scoped,'light theme must override the detail badge specifically');
  assert.match(scoped[1],/background:linear-gradient\(120deg,#FFF9EA,#F1E5C9\)/);
  assert.match(scoped[1],/color:#74531F/);
  assert.match(css,/:root\[data-theme="light"\] \.game-detail \.detail-mythic-trigger:hover,/);
  assert.match(css,/\.game-detail \.detail-summary \.mythic-badge-art\.is-compact\{[^}]*display:grid;place-items:center;gap:0;[^}]*transform:none/,'desktop and mobile center art without manual translation');
  assert.match(css,/\.game-detail \.detail-summary \.detail-mythic-trigger\{[^}]*width:32px;height:32px;min-height:32px;padding:0;gap:0;[^}]*display:grid;place-items:center/,'phone ring and icon use integer-centered geometry');
  assert.match(css,/\.game-detail \.detail-summary \.mythic-badge-art\.is-compact\{width:24px;height:24px\}/,'phone art has symmetrical 4px inset');
  assert.match(css,/\.game-detail \.detail-summary \.detail-mythic-trigger\{[^}]*min-height:31px;padding:3px 9px/,'desktop icon-plus-text badge remains unchanged');
  assert.match(css,/\.game-detail \.detail-summary \.detail-mythic-label\{display:none\}/,'mobile badge keeps icon-only layout');
});

test('decoded Mythic badge displays exactly one emblem, never the Gem behind it',()=>{
  const component=readFileSync(new URL('../src/components/mythic-badge.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(component,/\{!ready&&<Gem[^>]+className="mythic-badge-placeholder"\/>\}/,
    'the Gem fallback must unmount as soon as the image is ready');
  assert.match(component,/className=\{ready\?'is-ready':''\}/,
    'the image is revealed after decode');
  assert.match(css,/\.mythic-badge-art img\.is-ready\{opacity:1;transition:none\}/,
    'the swap should not leave an empty image while fading');
  assert.doesNotMatch(css,/transform:translateX\(1px\)/,
    'do not push the image off-center');
});
