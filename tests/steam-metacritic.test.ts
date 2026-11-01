import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseSteam,keyName,pcScore} from '../scripts/steam-metacritic-matcher.ts';
test('search matches only same named Steam app, no series/remaster/edition guessing',()=>{
 assert.equal(chooseSteam('Cyberpunk 2077',[{id:1091500,name:'Cyberpunk 2077',type:'app'},{id:1,name:'Cyberpunk 2077: Phantom Liberty',type:'app'}]),1091500);
 assert.equal(chooseSteam('Persona 3 Reload',[{id:1,name:'Persona 3 Portable',type:'app'}]),null);
 assert.equal(chooseSteam('WUCHANG: Fallen Feathers',[{id:9,name:'WUCHANG - Fallen Feathers',type:'app'}]),9);
 assert.equal(chooseSteam('Game',[{id:1,name:'Game',type:'app'},{id:2,name:'Game',type:'app'}]),null);
 assert.equal(chooseSteam('Game',[{id:1,name:'Game',type:'sub'}]),null);
 assert.equal(keyName('Cyberpunk® 2077'),'cyberpunk 2077');
});
test('only PC Windows, same game, valid integer metascore is accepted',()=>{
 const data={type:'game',name:'Cyberpunk 2077',platforms:{windows:true},metacritic:{score:86,url:'https://www.metacritic.com/game/cyberpunk-2077/'}};
 assert.equal(pcScore(data,'Cyberpunk 2077'),86);
 assert.equal(pcScore({...data,type:'dlc'},'Cyberpunk 2077'),null);
 assert.equal(pcScore({...data,platforms:{windows:false}},'Cyberpunk 2077'),null);
 assert.equal(pcScore({...data,name:'Cyberpunk 2077 Phantom Liberty'},'Cyberpunk 2077'),null);
 assert.equal(pcScore({...data,metacritic:{score:99.5}},'Cyberpunk 2077'),null);
 assert.equal(pcScore({...data,metacritic:{score:105}},'Cyberpunk 2077'),null);
 assert.equal(pcScore({...data,metacritic:undefined},'Cyberpunk 2077'),null);
});