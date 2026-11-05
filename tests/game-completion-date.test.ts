import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Achievement,Game} from '../src/data.ts';
import {compareGameCompletionDates,gameCompletionTimestamp} from '../src/game-completion-date.ts';

const achievement=(id:string,unlockedAt:string|null,unlocked=true):Achievement=>({
 id,name:id,image:'',unlockedAt,rarity:null,unlocked
});
function makeGame(overrides:Partial<Game>={}):Game{
 return {
  id:'1',name:'Fixture',image:'',devices:[],lastPlayed:null,minutes:null,
  earned:2,total:4,score:20,maxScore:40,
  achievements:[
   achievement('base-1','2026-01-01T10:00:00.000Z'),
   achievement('base-2','2026-01-03T10:00:00.000Z'),
   achievement('dlc-1',null,false),
   achievement('dlc-2',null,false)
  ],
  groups:[
   {id:'base',name:'本体',kind:'base',achievementIds:['base-1','base-2'],earned:2,total:2},
   {id:'dlc',name:'DLC',kind:'dlc',achievementIds:['dlc-1','dlc-2'],earned:0,total:2}
  ],
  groupStatus:'verified',
  ...overrides
 };
}

test('Mythic date is the final BaseGame unlock even while DLC achievements remain locked',()=>{
 const game=makeGame();
 assert.equal(gameCompletionTimestamp(game,'mythic'),Date.parse('2026-01-03T10:00:00.000Z'));
 assert.equal(gameCompletionTimestamp(game,'full'),null);
});

test('Full date is the final unlock across base, DLC and updates',()=>{
 const game=makeGame({
  earned:4,
  achievements:[
   achievement('base-1','2026-01-01T10:00:00.000Z'),
   achievement('base-2','2026-01-03T10:00:00.000Z'),
   achievement('dlc-1','2026-02-04T10:00:00.000Z'),
   achievement('dlc-2','2026-02-06T10:00:00.000Z')
  ],
  groups:[
   {id:'base',name:'本体',kind:'base',achievementIds:['base-1','base-2'],earned:2,total:2},
   {id:'dlc',name:'DLC',kind:'dlc',achievementIds:['dlc-1','dlc-2'],earned:2,total:2}
  ]
 });
 assert.equal(gameCompletionTimestamp(game,'full'),Date.parse('2026-02-06T10:00:00.000Z'));
 assert.equal(gameCompletionTimestamp(game,'mythic'),Date.parse('2026-01-03T10:00:00.000Z'));
});

test('Unknown grouping only infers Mythic date from proven Full completion',()=>{
 const complete=makeGame({
  earned:4,
  achievements:[
   achievement('base-1','2026-01-01T10:00:00.000Z'),
   achievement('base-2','2026-01-03T10:00:00.000Z'),
   achievement('dlc-1','2026-02-04T10:00:00.000Z'),
   achievement('dlc-2','2026-02-06T10:00:00.000Z')
  ],
  groups:undefined,groupStatus:'unavailable'
 });
 assert.equal(gameCompletionTimestamp(complete,'mythic'),Date.parse('2026-02-06T10:00:00.000Z'));
 const partial=makeGame({groups:undefined,groupStatus:'unavailable'});
 assert.equal(gameCompletionTimestamp(partial,'mythic'),null);
});

test('Missing unlock timestamps or incomplete catalogs do not invent completion dates',()=>{
 const missingDate=makeGame({earned:4,achievements:[
  achievement('base-1','2026-01-01T10:00:00.000Z'),
  achievement('base-2',null),
  achievement('dlc-1','2026-02-04T10:00:00.000Z'),
  achievement('dlc-2','2026-02-06T10:00:00.000Z')
 ]});
 assert.equal(gameCompletionTimestamp(missingDate,'full'),null);
 const incompleteCatalog=makeGame({earned:4,achievements:[achievement('base-1','2026-01-01T10:00:00.000Z')]});
 assert.equal(gameCompletionTimestamp(incompleteCatalog,'full'),null);
});

test('Completion dates sort in both directions while unavailable dates always remain last',()=>{
 const older=makeGame({id:'older',earned:4,achievements:[
  achievement('base-1','2026-01-01T10:00:00.000Z'),achievement('base-2','2026-01-03T10:00:00.000Z'),
  achievement('dlc-1','2026-01-04T10:00:00.000Z'),achievement('dlc-2','2026-01-05T10:00:00.000Z')
 ]});
 const newer=makeGame({id:'newer',earned:4,achievements:[
  achievement('base-1','2026-02-01T10:00:00.000Z'),achievement('base-2','2026-02-03T10:00:00.000Z'),
  achievement('dlc-1','2026-02-04T10:00:00.000Z'),achievement('dlc-2','2026-02-06T10:00:00.000Z')
 ]});
 const incomplete=makeGame({id:'incomplete',earned:1,achievements:[
  achievement('base-1','2026-01-01T10:00:00.000Z'),
  achievement('base-2',null,false),
  achievement('dlc-1',null,false),
  achievement('dlc-2',null,false)
 ],groups:[
  {id:'base',name:'本体',kind:'base',achievementIds:['base-1','base-2'],earned:1,total:2},
  {id:'dlc',name:'DLC',kind:'dlc',achievementIds:['dlc-1','dlc-2'],earned:0,total:2}
 ]});
 const items=[incomplete,newer,older];
 assert.deepEqual([...items].sort((a,b)=>compareGameCompletionDates(a,b,'full','asc')).map(g=>g.id),['older','newer','incomplete']);
 assert.deepEqual([...items].sort((a,b)=>compareGameCompletionDates(a,b,'full','desc')).map(g=>g.id),['newer','older','incomplete']);
 assert.deepEqual([...items].sort((a,b)=>compareGameCompletionDates(a,b,'mythic','asc')).map(g=>g.id),['older','newer','incomplete']);
 assert.deepEqual([...items].sort((a,b)=>compareGameCompletionDates(a,b,'mythic','desc')).map(g=>g.id),['newer','older','incomplete']);
});
