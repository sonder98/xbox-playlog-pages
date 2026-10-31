import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAchievementPage} from './exophase-page.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault,decryptVault} from '../src/crypto.ts';
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',image2x:'https://covers.example.test/medium.svg',image3x:'https://covers.example.test/original.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
for(const game of games)game.achievements=[0,9.9,10,null].map((rarity,i)=>({id:String(i+1),name:i===1?'Very long achievement name to check readable wrapping on mobile':'Achievement '+i,description:i===2?'这是一段很长的成就描述，用来验证它能与稀有度并排，内容自动换行且不挤出屏幕。':'完成一次挑战。',image:'https://covers.example.test/square.svg',unlocked:i<2,unlockedAt:i<2?(i===0?'2026-10-27T12:24:00.000Z':'2026-10-28T12:24:00.000Z'):null,rarity}));
for(const game of games){game.total=4;game.earned=2;game.groupStatus='verified';game.groups=[{id:'base',name:'本体',kind:'base',earned:2,total:2,achievementIds:['1','2']},{id:'dlc',name:'追加故事',kind:'dlc',earned:0,total:2,achievementIds:['3','4']}];}
const envelope=await encryptVault({records:[{id:'test-snapshot',at:'2026-10-30T00:00:00Z',profile:{xuid:'4285437',gamertag:'Test Player',avatar:''},games,source:'Exophase',warnings:[]}]},password);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
let browser;
try{
  for(let i=0;i<30;i++){
    try{if((await fetch('http://127.0.0.1:4173/xbox-playlog-pages/')).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  browser=await chromium.launch();
  const catalogPage=await browser.newPage();
  const catalog=await catalogPage.evaluate(readAchievementPage,await readFile(new URL('../tests/fixtures/cyberpunk-catalog.html',import.meta.url),'utf8'));
  assert.deepEqual(catalog.groups.map(g=>[g.kind,g.total]),[['base',44],['dlc',13]]);
  assert.equal(catalog.achievements[0].name,'Ten out of Ten');
  assert.equal(catalog.achievements[0].rarity,15.87);
  await catalogPage.close();
  // Exercise the exporter against intercepted fixture documents only: no upstream requests.
  const exportHtml=await readFile(new URL('../public/catalog-export.html',import.meta.url),'utf8');
  const assignment="document.getElementById('bookmark').href=";
  const bookmark=JSON.parse(exportHtml.slice(exportHtml.indexOf(assignment)+assignment.length).split(';</script>')[0]);
  const exportContext=await browser.newContext();
  const fixture=await readFile(new URL('../tests/fixtures/cyberpunk-catalog.html',import.meta.url),'utf8');
  await exportContext.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='api.exophase.com')return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{success:true,games:[{total_awards:57,meta:{title:'Cyberpunk 2077',endpoint_awards:'https://www.exophase.com/game/cyberpunk-2077-xbox/achievements/'}}]}});
    if(url.hostname==='www.exophase.com'&&url.pathname.startsWith('/xbox/user/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><a id="export" href="'+bookmark+'">Export public catalog</a>'});
    if(url.hostname==='www.exophase.com'&&url.pathname.startsWith('/game/cyberpunk-2077-xbox/'))return route.fulfill({contentType:'text/html',body:fixture});
    return route.abort();
  });
  const exportPage=await exportContext.newPage();
  await exportPage.goto('https://www.exophase.com/xbox/user/SondrRope/');
  await exportPage.getByRole('link',{name:'Export public catalog'}).click();
  await exportPage.getByRole('button',{name:'保存 JSON 文件'}).waitFor();
  const exportDownload=exportPage.waitForEvent('download');
  await exportPage.getByRole('button',{name:'保存 JSON 文件'}).click();
  const file=await (await exportDownload).path();
  const exported=parseCatalogBundle(JSON.parse(await readFile(file,'utf8')));
  assert.equal(exported.catalogs.length,1);
  assert.deepEqual(exported.catalogs[0].data.groups.map(g=>g.total),[44,13]);
  assert.ok(exported.catalogs[0].data.achievements.every(a=>!a.unlocked&&a.unlockedAt===null));
  await exportContext.close();
  console.log('Public catalog exporter: PASS popup, document parsing, JSON download, sanitized metadata');
  for(const mobile of [true,false]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:2});
    const page=await context.newPage();
    let activeEnvelope=envelope;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://covers.example.test/**',route=>{
      const original=route.request().url().endsWith('original.svg'),medium=route.request().url().endsWith('medium.svg');
      const width=original?1920:medium?480:64,height=width;
      return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#789"/></svg>`});
    });
    await page.route('**/status.json',route=>route.fulfill({json:{initialized:true}}));
    await page.route('**/vault.json',route=>route.fulfill({json:activeEnvelope}));
    async function unlock(hash=''){
      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/'+hash);
      await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
      if(mobile)assert.ok(await page.locator('input[type="password"]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Password text avoids iOS focus zoom');
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    }
    await unlock();
    await page.locator('.game-card').first().waitFor();
    const statsBeforeHiding=await page.locator('.stats').innerText();
    assert.deepEqual(await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection)),['recent','top','stats']);
    assert.equal(await page.locator('.top-card').count(),5);
    assert.equal(await page.locator('.top-card .completion-ornament').count(),5);
    await page.locator('.top-card').last().click();
    await page.getByRole('dialog').waitFor();
    await page.locator('.dialog-body').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='2000px';el.append(spacer);el.scrollTop=el.scrollHeight;});
    const closeRect=await page.getByRole('button',{name:'关闭详情',exact:true}).boundingBox();
    assert.ok(closeRect&&closeRect.y>=0&&closeRect.y+closeRect.height<(mobile?844:1000),'Close remains visible at the bottom of long details');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    console.log((mobile?'Mobile':'Desktop')+': PASS overview order, five illustrated Mythic cards, horizontal rail navigation and persistent close after long scroll');

    await page.locator('.game-card .game-cover img').first().waitFor();
    await page.waitForFunction(()=>{const img=document.querySelector('.game-card .game-cover img');return img?.complete&&img.naturalWidth>0;});
    const cover=await page.locator('.game-card .game-cover').first().evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const image=el.querySelector('img');
      return {width:rect.width,height:rect.height,fit:getComputedStyle(image).objectFit,source:image.currentSrc,naturalHeight:image.naturalHeight};
    });
    assert.ok(Math.abs(cover.width/cover.height-1)<.03,'Artwork uses a square frame');
    assert.equal(cover.fit,'contain','Artwork must remain uncropped');
    assert.ok(cover.source.endsWith('original.svg'),'Screen density must select the matching artwork');
    assert.ok(cover.naturalHeight>=cover.height*(mobile?3:2),'Artwork must have enough real pixels');
    await page.route('**/medium.svg',route=>route.abort());
    await page.route('**/original.svg',route=>route.abort());
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.game-card .game-cover img')?.currentSrc.endsWith('square.svg'));
    await page.unroute('**/medium.svg');await page.unroute('**/original.svg');
    // Cached display variants avoid original artwork; a missing mirror still has the upstream fallback.
    await page.route('**/cached-*.svg',route=>{
      const width=route.request().url().includes('1600')?1600:480;
      return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="100%" height="100%" fill="#789"/></svg>`});
    });
    const cachePayload=await decryptVault(envelope,password);
    for(const game of cachePayload.records[0].games){game.cachedImage='https://covers.example.test/cached-480.svg';game.cachedImageLarge='https://covers.example.test/cached-1600.svg';for(const a of game.achievements||[])a.cachedImage='https://covers.example.test/cached-award.svg';}
    activeEnvelope=await encryptVault(cachePayload,password);
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.game-card .game-cover img')?.currentSrc.endsWith('cached-480.svg'));
    await page.locator('.game-card').first().click();
    await page.waitForFunction(()=>document.querySelector('.detail-cover img')?.currentSrc.endsWith('cached-1600.svg'));
    await page.locator('.achievement-image img').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.achievement-image img')?.currentSrc.endsWith('cached-award.svg'));
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.route('**/cached-*.svg',route=>route.abort());
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.game-card .game-cover img')?.currentSrc.endsWith('original.svg'));
    activeEnvelope=envelope;await unlock();
    console.log((mobile?'Mobile':'Desktop')+': PASS cached list/detail artwork sizes and missing-cache fallback');
    const all=page.getByRole('button',{name:'全部游戏',exact:true});
    await all.scrollIntoViewIfNeeded();
    const originalScroll=await page.evaluate(()=>window.scrollY);
    await all.click();
    await page.waitForURL('**/#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.goBack();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await page.goForward();
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await unlock('#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.getByRole('button',{name:'全部游戏',exact:true}).click();
    await page.getByRole('textbox',{name:'搜索游戏名称'}).fill('Test Game 1');
    await page.getByRole('combobox',{name:'排序游戏'}).selectOption('time');
    const beforeDetail=await page.evaluate(()=>window.scrollY);
    await page.locator('.game-card').first().click();
    await page.getByRole('dialog').waitFor();
    const achievementLayout=await page.locator('.achievement').evaluateAll(rows=>rows.map(row=>{
      const image=row.querySelector('.achievement-image'),title=row.querySelector('h4'),description=row.querySelector('.achievement-description'),rarity=row.querySelector('.achievement-rarity');
      return {imageWidth:image.getBoundingClientRect().width,titleSize:parseFloat(getComputedStyle(title).fontSize),descriptionSize:parseFloat(getComputedStyle(description).fontSize),sameRow:Math.abs(description.getBoundingClientRect().top-rarity.getBoundingClientRect().top)<1,tier:rarity.getAttribute('data-rarity-tier'),icon:rarity.querySelector('svg')?.getAttribute('class'),fits:row.scrollWidth<=row.clientWidth+1};
    }));
    assert.deepEqual(achievementLayout.map(a=>a.tier),['rare','rare','common',null]);
    const achievementIds=()=>page.locator('.achievement').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-achievement-id')));
    assert.deepEqual(await achievementIds(),['2','1','3','4'],'Default is newest unlock first, with locked entries last');
    for(const [sort,expected] of [['date-asc',['1','2','3','4']],['rarity-asc',['1','2','3','4']],['rarity-desc',['2','1','3','4']],['date-desc',['2','1','3','4']]]){
      await page.getByRole('combobox',{name:'成就排序',exact:true}).selectOption(sort);
      assert.deepEqual(await achievementIds(),expected);
      assert.deepEqual(await page.locator('.achievement-group').evaluateAll(sections=>sections.map(s=>({id:s.dataset.groupId,title:s.querySelector('h3').textContent,ids:[...s.querySelectorAll('.achievement')].map(a=>a.dataset.achievementId)}))),[
        {id:'base',title:'本体',ids:expected.slice(0,2)},
        {id:'dlc',title:'追加故事',ids:expected.slice(2)}
      ],'Every sort retains base and DLC headers and membership');
    }

    await page.getByRole('combobox',{name:'成就分组',exact:true}).selectOption('base');
    assert.deepEqual(await achievementIds(),['2','1']);
    await page.getByRole('combobox',{name:'成就分组',exact:true}).selectOption('dlc');
    assert.deepEqual(await achievementIds(),['3','4']);
    await page.getByRole('combobox',{name:'成就分组',exact:true}).selectOption('__all');
    assert.deepEqual(await achievementIds(),['2','1','3','4']);
    console.log((mobile?'Mobile':'Desktop')+': PASS four within-group achievement sort orders, preserved base/DLC headers and membership, filters and default newest-first');
    for(const row of achievementLayout){assert.equal(row.imageWidth,56);assert.ok(row.titleSize>row.descriptionSize);assert.ok(row.sameRow);assert.ok(row.fits);}
    assert.ok(achievementLayout[0].icon.includes('gem'));
    assert.ok(achievementLayout[2].icon.includes('trophy'));
    assert.ok(!(await page.getByRole('dialog').innerText()).includes('玩家解锁'));
    console.log((mobile?'Mobile':'Desktop')+': PASS achievement image size, typography, inline rarity, 0/9.9/10 thresholds, unknown rarity and long wrapping');

    await page.goBack();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.getByRole('textbox',{name:'搜索游戏名称'}).inputValue(),'Test Game 1');
    assert.equal(await page.getByRole('combobox',{name:'排序游戏'}).inputValue(),'time');
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,beforeDetail);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
    // Hiding is a reversible encrypted display preference, independent of fresh sync snapshots.
    const manageDisplay=()=>page.locator('.toolbar').getByRole('button',{name:'管理展示',exact:true}).click();
    await manageDisplay();
    if(mobile){
      const fonts=await page.locator('input:not([type="checkbox"]):not([type="file"]),select,textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({label:el.getAttribute('aria-label'),size:parseFloat(getComputedStyle(el).fontSize)})));
      assert.ok(fonts.length>=2);assert.ok(fonts.every(f=>f.size>=16),JSON.stringify(fonts));
      console.log('Mobile: PASS >=16px text for password, library/manager search and selection controls; pinch zoom preserved');
    }
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),0);
    await page.getByRole('button',{name:'概览',exact:true}).click();
    assert.equal(await page.locator('.stats').innerText(),statsBeforeHiding,'Hiding never changes aggregate statistics');
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),0);
    activeEnvelope=await encryptVault(await decryptVault(envelope,password),password);
    await unlock('#library');
    await page.locator('.game-card').first().waitFor();
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),0,'Hidden choice survives a fresh encrypted snapshot');
    assert.equal(await page.locator('.game-card').count(),11);
    const storedPreference=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('playlog-display-encrypted-v1:')).map(key=>localStorage.getItem(key)));
    assert.equal(storedPreference.length,1);assert.ok(!storedPreference[0].includes('hiddenGameIds'));
    await manageDisplay();
    await page.getByRole('checkbox',{name:'仅看已隐藏',exact:true}).check();
    assert.equal(await page.locator('.display-game-choice').count(),1);
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).click();
    await page.locator('.display-game-choice').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.locator('.game-card').count(),12);
    await manageDisplay();
    for(const checkbox of await page.locator('.display-game-choice input').all())await checkbox.uncheck();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await page.getByRole('heading',{name:'所有游戏已隐藏',exact:true}).waitFor();
    await manageDisplay();
    await page.getByRole('button',{name:'全部展示',exact:true}).click();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.locator('.game-card').count(),12);
    await manageDisplay();
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),1,'Cancel keeps the saved selection');
    console.log((mobile?'Mobile':'Desktop')+': PASS encrypted hide/restore preferences, unchanged statistics, new snapshot persistence, hide-all recovery and cancel');
    // Remembered credentials survive a reload and a new snapshot's random salt.
    async function signInRemembered(){
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).check();
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
      await page.getByRole('button',{name:'锁定档案',exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'锁定档案',exact:true}).click();
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
    await page.getByRole('button',{name:'锁定档案',exact:true}).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(),0);
    await page.getByRole('button',{name:'锁定档案',exact:true}).click();
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
    console.log((mobile?'Mobile':'Desktop')+': PASS all games, browser back/forward, back button, scroll restoration, direct link fallback, full-frame high resolution covers with working image fallback, remembered unlock, fresh encrypted snapshot, lock, expiry, changed password');
    await context.close();
  }
}finally{await browser?.close();server.kill();}
