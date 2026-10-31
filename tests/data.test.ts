import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTitles,parseStats,validateRecord,compareRecords,officialGameVisible,type RecordData} from '../src/data.ts';
const game={id:'123',name:'测试',image:'',devices:[],lastPlayed:null,minutes:100,earned:2,total:10,score:20,maxScore:100};
const record=(gs:any[]):RecordData=>({id:'a',at:'2026-10-30T00:00:00Z',profile:{xuid:'2530000000000000',gamertag:'Tester',avatar:''},games:gs,source:'OpenXBL',warnings:[]});
test('first snapshot is baseline; new games do not inflate delta',()=>{assert.equal(compareRecords(record([game])).minutes,null);assert.equal(compareRecords(record([{...game,minutes:160},{...game,id:'456',minutes:5000}]),record([game])).minutes,60)});
test('missing values and downward corrections are handled explicitly',()=>{const d=compareRecords(record([{...game,minutes:50}]),record([game]));assert.equal(d.minutes,0);assert.equal(d.corrections,1);assert.equal(compareRecords(record([{...game,minutes:null}]),record([game])).minutes,0)});
test('Xbox hidden titles remain in encrypted records with an explicit visibility flag',()=>{const g=normalizeTitles({titles:[{titleId:'123',name:'Game',titleHistory:{visible:true}},{titleId:'456',type:'App'},{titleId:'789',name:'Private Game',titleHistory:{visible:false}},{titleId:'555',name:'Unknown'}]});assert.equal(g.length,3);assert.equal(g[0].minutes,null);assert.equal(g[0].officialHidden,false);assert.equal(g[1].officialHidden,true);assert.equal(g[2].officialHidden,undefined);assert.throws(()=>normalizeTitles({}));const saved=validateRecord(record(g));assert.equal(saved.games[1].officialHidden,true);assert.equal(saved.games[0].officialHidden,false);assert.equal(saved.games[2].officialHidden,undefined);});
test('stats parse zero, reject invalid values',()=>assert.deepEqual(parseStats({users:[{titles:[{titleId:'123',stats:[{name:'MinutesPlayed',value:'0'}]},{titleId:'456',stats:[{name:'MinutesPlayed',value:'bad'}]}]}]}),{'123':0}));
test('import rejects duplicate IDs and invalid minutes; filters image URLs',()=>{assert.throws(()=>validateRecord(record([game,game])));assert.throws(()=>validateRecord(record([{...game,minutes:-1}])));assert.equal(validateRecord(record([{...game,image:'javascript:alert(1)'}])).games[0].image,'')});

test('Only explicit Xbox visibility allows display; archived unknown games retain data',()=>{
 const visible={...game,officialHidden:false},hidden={...game,officialHidden:true},unknown={...game};
 assert.equal(officialGameVisible(visible,'Xbox'),true);
 assert.equal(officialGameVisible(hidden,'Xbox'),false);
 assert.equal(officialGameVisible(unknown,'Xbox'),false);
 assert.equal(officialGameVisible(unknown,'Exophase'),true);
 assert.equal(officialGameVisible(hidden,'导入'),false);
 assert.equal(validateRecord(record([unknown])).games.length,1);
});
