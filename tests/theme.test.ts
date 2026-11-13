import test from 'node:test';
import assert from 'node:assert/strict';
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
