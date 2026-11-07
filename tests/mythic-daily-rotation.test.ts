import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beijingDay,mythicBackdrop,mythicBackdropPreview} from '../src/mythic-assets.ts';
import type {Game} from '../src/data.ts';

const from=(iso:string)=>beijingDay(Date.parse(iso));
const base=()=>({
 id:'1',name:'First Mythic',posterSelectionVersion:3,
 posterImage:'https://store-images.s-microsoft.com/first',
 posterImagePurpose:'Screenshot',posterRotationStartDay:'2026-11-06',
 posterScreenshots:['https://store-images.s-microsoft.com/first','https://store-images.s-microsoft.com/second','https://store-images.s-microsoft.com/third'],
 cachedPosterScreenshots:['https://cache.test/first.webp','https://cache.test/second.webp','https://cache.test/third.webp'],
 cachedPosterScreenshotsSmall:['https://cache.test/first-480.webp','https://cache.test/second-480.webp','https://cache.test/third-480.webp']
}) as Game;

test('rotation changes at Beijing midnight, not UTC midnight, and wraps in API order',()=>{
 const game=base();
 assert.equal(mythicBackdrop(game,from('2026-11-06T15:59:59Z')),'https://cache.test/first.webp');
 assert.equal(mythicBackdrop(game,from('2026-11-06T16:00:00Z')),'https://cache.test/second.webp');
 assert.equal(mythicBackdrop(game,from('2026-11-07T16:00:00Z')),'https://cache.test/third.webp');
 assert.equal(mythicBackdrop(game,from('2026-11-08T16:00:00Z')),'https://cache.test/first.webp');
 assert.equal(mythicBackdrop(game,from('2026-11-05T16:00:00Z')),'https://cache.test/first.webp');
});

test('each game has its own screenshot count and start date',()=>{
 const first=base();
 const second={...base(),id:'2',posterRotationStartDay:'2026-11-08',
  posterScreenshots:['https://other.test/a','https://other.test/b'],
  cachedPosterScreenshots:['https://cache.test/a.webp','https://cache.test/b.webp']};
 const day=from('2026-11-08T16:00:00Z');
 assert.equal(mythicBackdrop(first,day),'https://cache.test/first.webp');
 assert.equal(mythicBackdrop(second,day),'https://cache.test/b.webp');
});

test('a missing cached screenshot uses that day\'s original URL without shifting indices',()=>{
 const game=base();game.cachedPosterScreenshots=['https://cache.test/first.webp','','https://cache.test/third.webp'];
 assert.equal(mythicBackdrop(game,from('2026-11-06T16:00:00Z')),'https://store-images.s-microsoft.com/second');
});

test('legacy or missing screenshot sets keep the existing hero/poster fallback',()=>{
 const game=base();
 delete game.posterScreenshots;delete game.posterRotationStartDay;
 game.cachedPosterImage='https://cache.test/legacy.webp';
 assert.equal(mythicBackdrop(game,from('2026-11-20T00:00:00Z')),'https://cache.test/legacy.webp');
 delete game.cachedPosterImage;delete game.posterImage;
 game.detailImagePurpose='SuperHeroArt';game.detailImage='https://store-images.s-microsoft.com/hero';
 assert.equal(mythicBackdrop(game,from('2026-11-20T00:00:00Z')),'https://store-images.s-microsoft.com/hero');
});

test('480px preview uses the identical midnight index and safely falls back for legacy vaults',()=>{
 const game=base();
 assert.equal(mythicBackdropPreview(game,from('2026-11-06T15:59:59Z')),'https://cache.test/first-480.webp');
 assert.equal(mythicBackdropPreview(game,from('2026-11-06T16:00:00Z')),'https://cache.test/second-480.webp');
 assert.equal(mythicBackdropPreview(game,from('2026-11-07T16:00:00Z')),'https://cache.test/third-480.webp');
 game.cachedPosterScreenshotsSmall=['https://cache.test/first-480.webp','','https://cache.test/third-480.webp'];
 assert.equal(mythicBackdropPreview(game,from('2026-11-06T16:00:00Z')),'https://cache.test/second.webp');
 delete game.cachedPosterScreenshotsSmall;
 assert.equal(mythicBackdropPreview(game,from('2026-11-06T16:00:00Z')),'https://cache.test/second.webp');
 delete game.posterScreenshots;
 assert.equal(mythicBackdropPreview(game),'https://store-images.s-microsoft.com/first');
});
