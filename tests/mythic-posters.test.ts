import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Achievement,Game} from '../src/data.ts';
import {mythicPosterWall,posterLocalDate} from '../src/mythic-posters.ts';
import {mythicCover,mythicBackdrop} from '../src/mythic-assets.ts';

function award(id:string,date:string|null,unlocked=true):Achievement{
 return {id,name:'Achievement '+id,image:'',unlocked,unlockedAt:date,rarity:12,description:''};
}
function game(id:string,name:string,baseDates:(string|null)[],extras:Achievement[]=[]):Game{
 const achievements=baseDates.map((date,i)=>award('b'+i,date)).concat(extras);
 return {id,name,image:'',minutes:600,devices:[],lastPlayed:null,score:100,maxScore:300,
  achievements,total:achievements.length,earned:achievements.filter(a=>a.unlocked).length,
  groupStatus:'verified',groups:[
   {id:'base',name:'BaseGame',kind:'base',achievementIds:baseDates.map((_,i)=>'b'+i),earned:baseDates.length,total:baseDates.length},
   ...(extras.length?[{id:'dlc',name:'DLC',kind:'dlc' as const,achievementIds:extras.map(a=>a.id),
      earned:extras.filter(a=>a.unlocked).length,total:extras.length}]:[])
  ]};
}
test('Mythic posters sort by confirmed finish date descending and omit incomplete games',()=>{
 const older=game('1','Older',['2026-03-01T08:00:00Z','2026-03-02T08:00:00Z']);
 const newer=game('2','Newer',['2026-09-01T08:00:00Z','2026-09-06T08:00:00Z'],[award('extra',null,false)]);
 const incomplete=game('3','Incomplete',['2026-05-01T08:00:00Z']);
 incomplete.groups![0].earned=0;
 incomplete.achievements![0].unlocked=false;
 incomplete.earned=0;
 const posters=mythicPosterWall([older,incomplete,newer]);
 assert.deepEqual(posters.map(p=>p.game.id),['2','1']);
 assert.equal(posters[0].baseTotal,2);
 assert.equal(posters[0].lastBaseAchievement?.id,'b1');
 assert.equal(posters[0].daysToMythic,5);
 assert.equal(posters[0].firstAchievement?.id,'b0');
});
test('Mythic date comes from BaseGame even if later DLC achievements unlock',()=>{
 const base=game('1','DLC',['2026-08-01T15:00:00Z','2026-08-02T15:00:00Z'],
  [award('dlc1','2026-10-01T01:00:00Z')]);
 const poster=mythicPosterWall([base])[0];
 assert.equal(poster.mythicAt,Date.parse('2026-08-02T15:00:00Z'));
 assert.equal(poster.lastBaseAchievement?.id,'b1');
 assert.equal(poster.daysToMythic,1);
});
test('Unknown Mythic completion dates sort last and display honest missing values',()=>{
 const unknown=game('1','Unknown',['2026-04-01T12:00:00Z',null]);
 const known=game('2','Known',['2026-03-01T12:00:00Z','2026-03-04T12:00:00Z']);
 const posters=mythicPosterWall([unknown,known]);
 assert.deepEqual(posters.map(p=>p.game.id),['2','1']);
 assert.equal(posters[1].mythicAt,null);
 assert.equal(posters[1].daysToMythic,null);
 assert.equal(posters[1].lastBaseAchievement,null);
 assert.deepEqual(posterLocalDate(null),{date:'日期暂缺',time:'—'});
});
test('Beijing dates and times are used, including midnight rollover',()=>{
 const first=Date.parse('2026-10-31T15:59:00Z');
 const finish=Date.parse('2026-10-31T16:01:00Z');
 assert.equal(posterLocalDate(first).date,'2026.10.31');
 assert.equal(posterLocalDate(finish).date,'2026.11.01');
 assert.equal(posterLocalDate(finish).time,'00:01');
 const p=mythicPosterWall([game('9','Rollover',[new Date(first).toISOString(),new Date(finish).toISOString()])])[0];
 assert.equal(p.daysToMythic,1);
});
test('All-locked and unverified incomplete titles never get a poster',()=>{
 const locked=game('1','Locked',['2026-01-01T12:00:00Z']);
 locked.earned=0;
 locked.achievements![0].unlocked=false;
 locked.groups![0].earned=0;
 const noSplit=game('2','No grouping',['2026-02-01T12:00:00Z']);
 noSplit.groupStatus='unavailable';
 noSplit.groups=undefined;
 noSplit.earned=0;
 assert.equal(mythicPosterWall([locked,noSplit]).length,0);
});

test('Mythic circle uses a 480px cached WebP while the screenshot stays the original dedicated cache',()=>{
 const g={...game('88','Image',['2026-01-01T00:00:00Z']),
  image:'https://store-images.s-microsoft.com/raw-cover',
  cachedImage:'https://sonder98.github.io/xbox-playlog-pages/media/480.webp',
  cachedImageLarge:'https://sonder98.github.io/xbox-playlog-pages/media/1600.webp',
  cachedPosterImage:'https://sonder98.github.io/xbox-playlog-pages/media/screenshot.webp'};
 assert.equal(mythicCover(g),g.cachedImage,'Tiny circular art should not download a 1600px cover');
 assert.equal(mythicBackdrop(g),g.cachedPosterImage,'Full-width screenshots still use their dedicated cached asset');
});
