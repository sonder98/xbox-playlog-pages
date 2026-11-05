import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameLibrarySortChoices,normalizeGameLibrarySort,type GameLibraryFilter,type GameLibrarySort} from '../src/game-library-sort.ts';

const values=(filter:GameLibraryFilter)=>gameLibrarySortChoices(filter).map(([value])=>value);
const common:GameLibrarySort[]=['recent','time','span-desc','span-asc'];

test('all games and unfinished games only expose the three shared sort types',()=>{
 assert.deepEqual(values('all'),common);
 assert.deepEqual(values('playing'),common);
});

test('Mythic adds only Mythic completion date directions',()=>{
 assert.deepEqual(values('mythic'),[...common,'mythic-date-asc','mythic-date-desc']);
});

test('Full adds only Full completion date directions',()=>{
 assert.deepEqual(values('full'),[...common,'full-date-asc','full-date-desc']);
});

test('switching away from a specialized group sort falls back to recent',()=>{
 assert.equal(normalizeGameLibrarySort('all','mythic-date-desc'),'recent');
 assert.equal(normalizeGameLibrarySort('playing','full-date-asc'),'recent');
 assert.equal(normalizeGameLibrarySort('full','mythic-date-asc'),'recent');
 assert.equal(normalizeGameLibrarySort('mythic','full-date-desc'),'recent');
});

test('a specialized date sort remains selected only in its matching group',()=>{
 assert.equal(normalizeGameLibrarySort('mythic','mythic-date-asc'),'mythic-date-asc');
 assert.equal(normalizeGameLibrarySort('full','full-date-desc'),'full-date-desc');
});

test('switching groups preserves each shared sort selection',()=>{
 for(const filter of ['all','playing','mythic','full'] as const){
  for(const sort of common)assert.equal(normalizeGameLibrarySort(filter,sort),sort);
 }
});
