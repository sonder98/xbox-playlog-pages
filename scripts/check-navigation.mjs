import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault} from '../src/crypto.ts';
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
const envelope=await encryptVault({records:[{id:'test-snapshot',at:'2026-10-30T00:00:00Z',profile:{xuid:'4285437',gamertag:'Test Player',avatar:''},games,source:'Exophase',warnings:[]}]},password);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<30;i++){
    try{if((await fetch('http://127.0.0.1:4173/xbox-playlog-pages/')).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  browser=await chromium.launch();
  for(const mobile of [true,false]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://covers.example.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#789"/></svg>'}));
    await page.route('**/status.json',route=>route.fulfill({json:{initialized:true}}));
    await page.route('**/vault.json',route=>route.fulfill({json:envelope}));
    async function unlock(hash=''){
      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/'+hash);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    }
    await unlock();
    await page.locator('.game-card .cover img').first().waitFor();
    const cover=await page.locator('.game-card .cover').first().evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const image=el.querySelector('img');
      return {width:rect.width,height:rect.height,fit:getComputedStyle(image).objectFit};
    });
    assert.equal(cover.width,cover.height,'Cover container must be square');
    assert.equal(cover.fit,'contain','Cover must preserve the full image');
    const all=page.getByRole('button',{name:'全部游戏',exact:true});
    await all.scrollIntoViewIfNeeded();
    const originalScroll=await page.evaluate(()=>window.scrollY);
    await all.click();
    await page.waitForURL('**/#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.goBack();
    await page.getByRole('heading',{name:'把游戏时光，留在这里。',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await page.goForward();
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'把游戏时光，留在这里。',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await unlock('#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'把游戏时光，留在这里。',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log((mobile?'Mobile':'Desktop')+': PASS all games, browser back/forward, back button, scroll restoration, direct link fallback, square covers without cropping');
    await context.close();
  }
}finally{await browser?.close();server.kill();}
