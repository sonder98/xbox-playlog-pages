import assert from 'node:assert/strict';
import {runAuxiliaryChecks} from './check-navigation-aux.mjs';
import {runNavigationChecks} from './check-navigation-ui.mjs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault} from '../src/crypto.ts';
const FIXTURE_TIME='2026-11-14T12:00:00.000Z';
const suite=process.argv[2]||'all';
assert.ok(['all','aux','mobile','desktop'].includes(suite),'Unknown browser test suite');
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',image2x:'https://covers.example.test/medium.svg',image3x:'https://covers.example.test/original.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
games[0].posterImage='https://covers.example.test/landscape.svg';
games[1].cachedDetailImage='https://covers.example.test/landscape.svg';
games[0].posterImagePurpose='Screenshot';
// Fake a screenshot pair already archived in GitHub Pages media: 480 + 1600.
games[0].posterScreenshots=['https://covers.example.test/landscape.svg'];
games[0].cachedPosterScreenshots=['https://covers.example.test/landscape.svg'];
games[0].cachedPosterScreenshotsSmall=['https://covers.example.test/preview.svg'];
games[0].posterRotationStartDay='2026-11-06';
for(const game of games)game.achievements=[0,9.9,10,null].map((rarity,i)=>({id:String(i+1),points:[10,20,0,15][i],name:i===1?'Very long achievement name to check readable wrapping on mobile':'Achievement '+i,description:i===2?'这是一段很长的成就描述，用来验证它能与稀有度并排，内容自动换行且不挤出屏幕。':'完成一次挑战。',image:i===1?'https://covers.example.test/wide.svg':'https://covers.example.test/square.svg',unlocked:i<2,...(i===2?{progressPercent:80}:{}),unlockedAt:i<2?(i===0?'2026-10-27T12:24:00.000Z':'2026-10-28T12:24:00.000Z'):null,rarity}));
// Game 0 has a recorded first-play day and a final unlock on the following day.
games[0].achievements[0].unlockedAt='2026-11-01T12:24:00.000Z';
games[0].achievements[1].unlockedAt='2026-11-02T12:24:00.000Z';
for(const game of games){game.total=4;game.earned=2;game.groupStatus='verified';game.groups=[{id:'base',name:'本体',kind:'base',earned:2,total:2,achievementIds:['1','2']},{id:'dlc',name:'追加故事',kind:'dlc',earned:0,total:2,achievementIds:['3','4']}];}
const playtimeLedger={version:1,timeZone:'Asia/Shanghai',since:'2026-11-01',latest:{'100':{at:'2026-11-02T12:00:00.000Z',minutes:30}},days:{'2026-11-01':{'100':30}},crossDay:{},corrections:{}};
const envelope=await encryptVault({records:[{id:'test-snapshot',at:'2026-10-30T00:00:00Z',profile:{xuid:'4285437',gamertag:'Test Player',avatar:'https://covers.example.test/avatar.svg',cachedAvatar:'https://covers.example.test/avatar-cached.svg'},games,source:'Exophase',warnings:[],syncMechanism:'cloudflare'}],playtimeLedger},password,2);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<30;i++){
    try{if((await fetch('http://127.0.0.1:4173/xbox-playlog-pages/')).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  browser=await chromium.launch();
  const fixtures={browser,games,envelope,password,FIXTURE_TIME,suite};
  if(suite==='all'||suite==='aux')await runAuxiliaryChecks(fixtures);
  if(suite!=='aux')await runNavigationChecks(fixtures);
}finally{await browser?.close();server.kill();}
