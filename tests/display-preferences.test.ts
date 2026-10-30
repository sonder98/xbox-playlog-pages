import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDisplayPreferences,readDisplayPreferences,saveDisplayPreferences} from '../src/display-preferences.ts';
test('hidden games are encrypted, scoped to an account, and restored independently of snapshots',async()=>{
 const values=new Map<string,string>();const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 assert.deepEqual(await readDisplayPreferences('4285437','test-password',store),{hiddenGameIds:[]});
 await saveDisplayPreferences('4285437','test-password',{hiddenGameIds:['101','101','999']},store);
 assert.ok(![...values.values()][0].includes('hiddenGameIds'));
 assert.deepEqual(await readDisplayPreferences('4285437','test-password',store),{hiddenGameIds:['101','999']});
 assert.deepEqual(await readDisplayPreferences('5555555','test-password',store),{hiddenGameIds:[]});
 await assert.rejects(readDisplayPreferences('4285437','wrong-password',store),/无法读取/);
 await saveDisplayPreferences('4285437','test-password',{hiddenGameIds:[]},store);
 assert.deepEqual(await readDisplayPreferences('4285437','test-password',store),{hiddenGameIds:[]});
});
test('display settings reject malformed IDs and surface storage failures without changing the saved choice',async()=>{
 for(const input of [null,{}, {hiddenGameIds:['../x']},{hiddenGameIds:[123]},{hiddenGameIds:Array(5001).fill('1')}])assert.throws(()=>normalizeDisplayPreferences(input));
 const store={getItem:()=>null,setItem:()=>{throw Error('storage unavailable');}};
 await assert.rejects(saveDisplayPreferences('4285437','test-password',{hiddenGameIds:['101']},store),/storage unavailable/);
});
