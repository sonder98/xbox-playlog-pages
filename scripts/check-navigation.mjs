import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault,decryptVault} from '../src/crypto.ts';
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',image2x:'https://covers.example.test/medium.svg',image3x:'https://covers.example.test/original.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
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
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:2});
    const page=await context.newPage();
    let activeEnvelope=envelope;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://covers.example.test/**',route=>{
      const original=route.request().url().endsWith('original.svg'),medium=route.request().url().endsWith('medium.svg');
      const width=original?1920:medium?288:64,height=original?1080:medium?158:64;
      return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#789"/></svg>`});
    });
    await page.route('**/status.json',route=>route.fulfill({json:{initialized:true}}));
    await page.route('**/vault.json',route=>route.fulfill({json:activeEnvelope}));
    async function unlock(hash=''){
      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/'+hash);
      await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    }
    await unlock();
    await page.locator('.game-card .cover img').first().waitFor();
    await page.waitForFunction(()=>{const img=document.querySelector('.game-card .cover img');return img?.complete&&img.naturalWidth>0;});
    const cover=await page.locator('.game-card .cover').first().evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const image=el.querySelector('img');
      return {width:rect.width,height:rect.height,fit:getComputedStyle(image).objectFit,source:image.currentSrc,naturalHeight:image.naturalHeight};
    });
    assert.equal(cover.width,cover.height,'Cover container must be square');
    assert.equal(cover.fit,'cover','High resolution artwork must fill the square without stretching');
    assert.ok(cover.source.endsWith(mobile?'original.svg':'medium.svg'),'Screen density must select the matching artwork');
    assert.ok(cover.naturalHeight>=cover.height*(mobile?3:2),'Artwork must have enough real pixels');
    await page.route('**/medium.svg',route=>route.abort());
    await page.route('**/original.svg',route=>route.abort());
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.game-card .cover img')?.currentSrc.endsWith('square.svg'));
    await page.unroute('**/medium.svg');await page.unroute('**/original.svg');
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
    // Remembered credentials survive a reload and a new snapshot's random salt.
    async function signInRemembered(){
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).check();
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
      await page.getByRole('button',{name:'锁定并忘记',exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'锁定并忘记',exact:true}).click();
    await signInRemembered();
    const savedInfo=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('playlog-device-v1',1);
      request.onsuccess=()=>{
        const db=request.result,read=db.transaction('credentials').objectStore('credentials').get('remembered');
        read.onsuccess=()=>{const value=read.result;resolve({extractable:value.key.extractable,expires:value.expires,encrypted:value.ciphertext instanceof ArrayBuffer});db.close();};
        read.onerror=()=>reject(read.error);
      };
      request.onerror=()=>reject(request.error);
    }));
    assert.equal(savedInfo.extractable,false);
    assert.equal(savedInfo.encrypted,true);
    assert.ok(savedInfo.expires>Date.now()+29*24*60*60*1000);
    activeEnvelope=await encryptVault(await decryptVault(envelope,password),password);
    await page.reload();
    await page.getByRole('button',{name:'锁定并忘记',exact:true}).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(),0);
    await page.getByRole('button',{name:'锁定并忘记',exact:true}).click();
    await page.locator('input[type="password"]').waitFor();
    await page.reload();
    await page.locator('input[type="password"]').waitFor();
    await signInRemembered();
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('playlog-device-v1',1);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('credentials','readwrite'),store=tx.objectStore('credentials'),read=store.get('remembered');
        read.onsuccess=()=>store.put({...read.result,expires:Date.now()-1},'remembered');
        tx.oncomplete=()=>{db.close();resolve(true);};
        tx.onerror=()=>reject(tx.error);
      };
      request.onerror=()=>reject(request.error);
    }));
    await page.reload();
    await page.locator('input[type="password"]').waitFor();
    await signInRemembered();
    activeEnvelope=await encryptVault(await decryptVault(envelope,password),'changed-fixture-password');
    await page.reload();
    await page.locator('input[type="password"]').waitFor();
    await page.getByRole('alert').filter({hasText:'记住的密码已失效'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log((mobile?'Mobile':'Desktop')+': PASS all games, browser back/forward, back button, scroll restoration, direct link fallback, high density square covers with working image fallback, remembered unlock, fresh encrypted snapshot, lock, expiry, changed password');
    await context.close();
  }
}finally{await browser?.close();server.kill();}
