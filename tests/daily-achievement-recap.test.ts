import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActivity} from '../src/achievement-activity.ts';
import {dailyAchievementRecap,dayRecapBackdropCandidates} from '../src/daily-achievement-recap.ts';
import type {Game} from '../src/data.ts';
import type {DailyPlaytimeLedger} from '../src/playtime-ledger.ts';

const stamp='2026-11-07T08:00:00.000Z';
const sample=(id:string,name:string,awards:number):Game=>({
 id,name,image:'cover-'+id,devices:['Xbox'],lastPlayed:stamp,minutes:500,
 earned:awards,total:10,score:awards*10,maxScore:100,
 achievements:Array.from({length:awards},(_,i)=>({
  id:String(i),name:'Achievement '+i,image:'',unlocked:true,unlockedAt:stamp,rarity:null
 }))
});
const ledger=(values:Record<string,number>):DailyPlaytimeLedger=>({
 version:1,timeZone:'Asia/Shanghai',since:'2026-11-01',
 latest:{},days:{'2026-11-07':values},crossDay:{},corrections:{}
});

test('daily recap matches six unlocks, 2.17 measured hours and two games',()=>{
 const forza=sample('fh4','Forza Horizon 4',4),ff=sample('ff','FINAL FANTASY RESONANCE',2);
 forza.cachedDetailImage='/media/forza-wide.webp';forza.detailImage='https://example.org/forza-wide';
 const activity=buildActivity([forza,ff],new Date('2026-11-09T00:00:00.000Z'));
 const summary=dailyAchievementRecap('2026-11-07',activity.byDay.get('2026-11-07'),[forza,ff],ledger({fh4:13,ff:117}));
 assert.equal(summary.achievementCount,6);
 assert.equal(summary.totalMinutes,130);
 assert.deepEqual(summary.games.map(x=>[x.game.id,x.count,x.minutes]),[['fh4',4,13],['ff',2,117]]);
 assert.equal(summary.heroGame?.id,'fh4','four achievements wins over longer-played game');
 assert.deepEqual(dayRecapBackdropCandidates(summary.heroGame),['/media/forza-wide.webp','https://example.org/forza-wide']);
});
test('playtime-only games are included; ties resolve by actual day minutes',()=>{
 const a=sample('a','A',2),b=sample('b','B',2),c=sample('c','C',0);
 const act=buildActivity([a,b,c],new Date('2026-11-09T00:00:00Z'));
 const recap=dailyAchievementRecap('2026-11-07',act.byDay.get('2026-11-07'),[a,b,c],ledger({a:5,b:45,c:80}));
 assert.equal(recap.heroGame?.id,'b','tie on unlocks uses daily playtime');
 assert.deepEqual(recap.games.map(g=>g.game.id),['b','a','c']);
 assert.equal(recap.games[2].count,0,'time-only player still appears in the day activity list');
 assert.equal(recap.totalMinutes,130);
});
test('missing playtime remains unknown and no unlocks yields gradient fallback',()=>{
 const g=sample('1','Archive',1),act=buildActivity([g],new Date('2026-11-09T00:00:00Z'));
 const recap=dailyAchievementRecap('2026-11-07',act.byDay.get('2026-11-07'),[g],null);
 assert.equal(recap.totalMinutes,null);
 assert.equal(recap.games[0].minutes,null);
 assert.deepEqual(dayRecapBackdropCandidates(g),[]);
 const nextDayLedger=ledger({});nextDayLedger.days['2026-11-08']={'1':44};
 const noUnlocks=dailyAchievementRecap('2026-11-08',undefined,[g],nextDayLedger);
 assert.equal(noUnlocks.heroGame,null,'no achievement leader means plain gradient even if game time exists');
 assert.equal(noUnlocks.achievementCount,0);
 assert.equal(noUnlocks.totalMinutes,44);
 assert.deepEqual(noUnlocks.games.map(x=>[x.game.id,x.count]),[['1',0]]);
});
test('background candidates match detail cover and prefer local cached landscape',()=>{
 const game=sample('7','Mythic',1);
 game.cachedDetailImage='/media/hero.webp';
 game.detailImage='https://xbox.test/hero.jpg';
 game.imageWide='https://xbox.test/alternative.jpg';
 game.cachedPosterImage='/media/poster.webp';
 assert.deepEqual(dayRecapBackdropCandidates(game),[
  '/media/hero.webp','https://xbox.test/hero.jpg','https://xbox.test/alternative.jpg','/media/poster.webp'
 ]);
 assert.deepEqual(dayRecapBackdropCandidates(null),[]);
});
