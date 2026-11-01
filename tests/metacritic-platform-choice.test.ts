import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strictGameSlug,selectPreferredMetascore} from '../scripts/metacritic-platform-choice.ts';
const platform=(slug:string,score:number|null)=>({slug,criticScoreSummary:{score,reviewCount:score===null?0:18}});
test('PC metascore wins, even if Xbox score is higher',()=>{
 assert.deepEqual(selectPreferredMetascore([platform('xbox-series-x',96),platform('pc',94)]),{score:94,platform:'PC'});
});
test('fall back to Xbox Series, Xbox One, then Xbox 360; no user-star or PS5 fallback',()=>{
 assert.deepEqual(selectPreferredMetascore([platform('pc',null),platform('xbox-one',81),platform('xbox-series-x',null)]),{score:81,platform:'Xbox One'});
 assert.deepEqual(selectPreferredMetascore([platform('pc',null),platform('xbox-one',81),platform('xbox-series-x',88)]),{score:88,platform:'Xbox Series X'});
 assert.deepEqual(selectPreferredMetascore([platform('xbox-360',73),platform('ps5',92)]),{score:73,platform:'Xbox 360'});
 assert.equal(selectPreferredMetascore([platform('ps5',92),platform('pc',null)]),null);
 assert.equal(selectPreferredMetascore([platform('pc',102)]),null);
});
test('exact title and one unambiguous game result, no editions or remasters assumed',()=>{
 const results=[{title:'Cyberpunk 2077',slug:'cyberpunk-2077',type:'game-title'},
  {title:'Cyberpunk 2077: Phantom Liberty',slug:'cyberpunk-2077-phantom-liberty',type:'game-title'},
  {title:'Cyberpunk 2077',slug:'cyberpunk-2077-music',type:'music'}];
 assert.equal(strictGameSlug('Cyberpunk 2077',results),'cyberpunk-2077');
 assert.equal(strictGameSlug('Cyberpunk 2077: Ultimate Edition',results),null);
 assert.equal(strictGameSlug('Cyberpunk 2077',results.concat([{title:'Cyberpunk 2077',slug:'cyberpunk-2077-2',type:'game-title'}])),null);
 assert.equal(strictGameSlug('Game',null),null);
});
