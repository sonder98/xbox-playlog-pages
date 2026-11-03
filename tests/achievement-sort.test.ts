import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortAchievements,filterAchievements} from '../src/achievement-sort.ts';
import type {Achievement} from '../src/data.ts';
const item=(id:string,unlocked:boolean,unlockedAt:string|null,rarity:number|null):Achievement=>({id,name:id,image:'',unlocked,unlockedAt,rarity});
const items=[item('locked',false,null,2),item('old',true,'2025-01-01T00:00:00Z',0),item('unknown',true,null,null),item('new',true,'2026-01-01T00:00:00Z',20),item('invalid',true,'invalid',null)];
test('time order keeps undated and locked entries after actual dates in both directions',()=>{
 assert.deepEqual(sortAchievements(items,'date-desc').map(a=>a.id),['new','old','unknown','invalid','locked']);
 assert.deepEqual(sortAchievements(items,'date-asc').map(a=>a.id),['old','new','unknown','invalid','locked']);
 assert.equal(items[0].id,'locked');
});
test('rarity order accepts zero, keeps missing values last and stable ties',()=>{
 assert.deepEqual(sortAchievements(items,'rarity-asc').map(a=>a.id),['old','locked','new','unknown','invalid']);
 assert.deepEqual(sortAchievements(items,'rarity-desc').map(a=>a.id),['new','locked','old','unknown','invalid']);
});

test('unlock filter composes with rarity ordering and never mutates the source',()=>{
 assert.deepEqual(filterAchievements(items,'all').map(a=>a.id),['locked','old','unknown','new','invalid']);
 assert.deepEqual(filterAchievements(items,'unlocked').map(a=>a.id),['old','unknown','new','invalid']);
 assert.deepEqual(filterAchievements(items,'locked').map(a=>a.id),['locked']);
 assert.deepEqual(sortAchievements(filterAchievements(items,'locked'),'rarity-asc').map(a=>a.id),['locked']);
 assert.deepEqual(filterAchievements(items.filter(a=>a.id==='old'),'locked'),[]);
 assert.equal(items.length,5);
});
