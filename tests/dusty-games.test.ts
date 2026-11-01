import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Game} from '../src/data.ts';
import {rankDustyGames} from '../src/dusty-games.ts';
import {validatedPcMetascores} from '../src/metascores.ts';
import {fixedPcScoreCount} from '../scripts/fixed-pc-metascores.ts';
const game=(id:string,lastPlayed:string|null,other:Partial<Game>={}):Game=>({
 id,name:id,image:'',devices:[],lastPlayed,minutes:0,earned:0,total:0,score:0,maxScore:0,...other
});
test('Metascore fixed PC catalog has 29 manually verified entries',()=>assert.equal(fixedPcScoreCount,29));
test('only PC scores between 0 and 100 can be loaded',()=>{
 const a=validatedPcMetascores({'12':{score:94,platform:'PC',checkedAt:'2026-11-01'},
 '13':{score:102,platform:'PC',checkedAt:'2026-11-01'},
 '14':{score:92,platform:'Xbox',checkedAt:'2026-11-01'}});
 assert.deepEqual(Object.keys(a),['12']);
 assert.equal(a['12'].score,94);
});
test('missing-flag Xbox games are ranked by latest played or earned achievement',()=>{
 const games=[
 game('1','2026-10-01T12:00:00Z',{achievements:[{id:'1',name:'A',image:'',unlocked:true,unlockedAt:'2026-10-20T12:00:00Z',rarity:null}]}),
 game('2','2026-09-05T08:00:00Z'),
 game('3','2026-08-01T08:00:00Z',{officialHidden:true}),
 game('4','2026-08-01T08:00:00Z',{officialHidden:false}),
 game('5',null)];
 const scores=validatedPcMetascores({'2':{score:86,platform:'PC',checkedAt:'2026-11-01'}});
 const list=rankDustyGames(games,scores,Date.parse('2026-11-01T08:00:00Z'),'Xbox');
 assert.deepEqual(list.map(x=>x.game.id),['2','1']);
 assert.equal(list[0].pcScore?.score,86);
 assert.equal(list[1].days,12);
 assert.deepEqual(rankDustyGames(games,scores,Date.now(),'Exophase'),[]);
});
