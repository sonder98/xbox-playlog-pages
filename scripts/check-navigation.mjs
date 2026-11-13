import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAchievementPage} from './exophase-page.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault,decryptVault} from '../src/crypto.ts';
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
const envelope=await encryptVault({records:[{id:'test-snapshot',at:'2026-10-30T00:00:00Z',profile:{xuid:'4285437',gamertag:'Test Player',avatar:'https://covers.example.test/avatar.svg',cachedAvatar:'https://covers.example.test/avatar-cached.svg'},games,source:'Exophase',warnings:[],syncMechanism:'cloudflare'}],playtimeLedger},password);
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
  // A user who leaves Overview open (without returning focus or entering Manage)
  // must see new Xbox snapshots after the cheap global status poll.
  {
    const pollContext=await browser.newContext({viewport:{width:1440,height:900}});
    const pollPage=await pollContext.newPage();
    await pollPage.clock.install();
    let pollEnvelope=envelope,pollStatusAt='2026-10-30T00:00:00Z';
    await pollPage.route('**/status.json*',route=>route.fulfill({json:{initialized:true,latestAt:pollStatusAt}}));
    await pollPage.route('**/vault.json*',route=>route.fulfill({json:pollEnvelope}));
    await pollPage.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    await pollPage.goto('http://127.0.0.1:4173/xbox-playlog-pages/');
    await pollPage.locator('input[type="password"]').fill(password);
    await pollPage.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await pollPage.locator('.recent-game-card').first().waitFor();
    assert.ok(pollPage.url().endsWith('/xbox-playlog-pages/'),'Poll case stays on Overview');
    const newer=await decryptVault(envelope,password);
    newer.records[0].at='2026-11-05T00:00:00.000Z';
    newer.records[0].games[0].name='Background-Poll Updated Game';
    pollEnvelope=await encryptVault(newer,password);
    pollStatusAt='2026-11-05T00:00:00.000Z';
    await pollPage.clock.fastForward(61_000);
    await pollPage.getByText('已自动加载最新同步记录。').waitFor({timeout:15000});
    assert.ok((await pollPage.locator('.recent-game-card').first().innerText()).includes('Background-Poll Updated Game'),
      'Foreground Overview updates without visiting Manage or regaining focus');
    await pollContext.close();
    console.log('Overview background-poll test: PASS one-minute marker check refreshes encrypted data');
  }
  // Reproduce: a 15:53 launch reads a 13:18 IndexedDB vault while the
  // status marker still says 13:18, although the actual vault has advanced.
  // Verify recovery with no manual pull, navigation or version reload.
  {
    const cacheContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const cachePage=await cacheContext.newPage();
    let cloudEnvelope=envelope;
    await cachePage.route('**/status.json*',route=>route.fulfill({
      json:{initialized:true,latestAt:'2026-10-30T00:00:00Z'}}));
    await cachePage.route('**/vault.json*',route=>route.fulfill({json:cloudEnvelope}));
    await cachePage.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    await cachePage.goto('http://127.0.0.1:4173/xbox-playlog-pages/');
    await cachePage.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
    await cachePage.locator('input[type="password"]').fill(password);
    await cachePage.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await cachePage.locator('.recent-game-card').first().waitFor();
    const newer=await decryptVault(envelope,password);
    newer.records[0].at='2026-11-08T07:20:00.000Z';
    newer.records[0].games[0].name='Auto-updated at open without pull';
    cloudEnvelope=await encryptVault(newer,password);
    await cachePage.reload();
    await cachePage.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
    await cachePage.locator('input[type="password"]').fill(password);
    await cachePage.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await cachePage.getByText('已自动加载最新同步记录。').waitFor({timeout:18000});
    assert.ok((await cachePage.locator('.recent-game-card').first().innerText()).includes('Auto-updated at open without pull'),
      'Cold cached launch detects new cloud vault without manually pulling or opening Manage');
    // Seen cloud data must remain accessible at the next offline launch.
    await cachePage.route('**/vault.json*',route=>route.abort('failed'));
    await cachePage.route('**/status.json*',route=>route.abort('failed'));
    await cachePage.reload();
    await cachePage.locator('input[type="password"]').fill(password);
    await cachePage.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
    await cachePage.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await cachePage.locator('.recent-game-card').first().waitFor();
    assert.ok((await cachePage.locator('.recent-game-card').first().innerText()).includes('Auto-updated at open without pull'),
      'The last cloud snapshot is durably saved into encrypted IndexedDB for offline reopening');
    await cacheContext.close();
    console.log('Cached startup freshness test: PASS stale marker bypass, automatic update and durable offline reopening');
  }
  for(const mobile of [true,false]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:2});
    const page=await context.newPage();
    let activeEnvelope=envelope;
    let simulatedStatusAt=null;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://covers.example.test/**',route=>{
      const original=route.request().url().endsWith('original.svg'),medium=route.request().url().endsWith('medium.svg');
      const wide=route.request().url().endsWith('/wide.svg'),landscape=route.request().url().endsWith('/landscape.svg'),preview=route.request().url().endsWith('/preview.svg');
      // Slightly rectangular originals simulate the Cyberpunk 2077 Mythic frame gap.
      const width=original||landscape?1920:medium||preview?480:wide?160:64,height=landscape?1080:preview?270:wide?90:original?1800:width;
      return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#789"/></svg>`});
    });
    // Use the real, committed first-party PNG; a regression must not silently
    // reintroduce a request to the unrelated third-party XCT image host.
    const externalMythicRequests=[];
    page.on('request',req=>{
      if(req.url().startsWith('https://xct.live/'))externalMythicRequests.push(req.url());
    });
    await page.route('**/status.json*',route=>route.fulfill({json:{initialized:true,...(simulatedStatusAt?{latestAt:simulatedStatusAt}:{})}}));
    await page.route('**/vault.json*',route=>route.fulfill({json:activeEnvelope}));
    // Most visual regressions inject a fresh network fixture on each login.
    // Clear only the encrypted local snapshot before those fixture resets.
    async function clearCachedEnvelope(){
      if(!page.url().startsWith('http://127.0.0.1:4173/xbox-playlog-pages/'))return;
      await page.evaluate(()=>new Promise((resolve,reject)=>{
        const request=indexedDB.open('playlog-encrypted-history-v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction('snapshots','readwrite');
          tx.objectStore('snapshots').delete('latest');
          tx.oncomplete=()=>{db.close();resolve(true);};
          tx.onerror=()=>{db.close();reject(tx.error);};
        };
        request.onerror=()=>reject(request.error);
      }));
    }
    async function unlock(hash=''){
      await clearCachedEnvelope();
      await page.goto('about:blank');
      await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/'+hash);
      await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
      if(mobile)assert.ok(await page.locator('input[type="password"]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Password text avoids iOS focus zoom');
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    }
    async function switchMainTab(name){
      if(mobile){
        await page.mouse.wheel(0,130);
        await page.waitForFunction(()=>document.querySelector('.mobile-nav')?.classList.contains('is-visible'));
      }
      await page.getByRole('button',{name,exact:true}).click();
    }
    // On a new device, network failure is not evidence that the site awaits its first sync.
    const simulatedOutage=route=>route.abort('failed');
    await page.route('**/vault.json*',simulatedOutage);
    await page.route('**/status.json*',simulatedOutage);
    await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/');
    await page.getByRole('heading',{name:'暂时无法连接游戏档案'}).waitFor();
    assert.equal(await page.getByText('等待首次同步').count(),0,
      'A failed network request never masquerades as a first synchronization');
    await page.unroute('**/vault.json*',simulatedOutage);
    await page.unroute('**/status.json*',simulatedOutage);
    await page.getByRole('button',{name:'重新读取游戏档案'}).click();
    await page.getByRole('heading',{name:'欢迎回到 XBOX Playlog'}).waitFor();
    await unlock();
    await page.locator('.recent-game-card').first().waitFor();
    // A successful decrypt persists ONLY the existing AES-GCM envelope in IndexedDB.
    const savedEncrypted=async()=>page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('playlog-encrypted-history-v1',1);
      request.onsuccess=()=>{
        const db=request.result,read=db.transaction('snapshots').objectStore('snapshots').get('latest');
        read.onsuccess=()=>{const value=read.result;db.close();resolve(value?{
          version:value.version,algorithm:value.algorithm,hasCiphertext:typeof value.ciphertext==='string',
          exposedRecords:'records' in value,hasGameName:JSON.stringify(value).includes('Test Game 1')
        }:null);};
        read.onerror=()=>reject(read.error);
      };
      request.onerror=()=>reject(request.error);
    }));
    await page.waitForFunction(async()=>{
      const request=indexedDB.open('playlog-encrypted-history-v1',1);
      return await new Promise(resolve=>{
        request.onsuccess=()=>{
          const db=request.result,read=db.transaction('snapshots').objectStore('snapshots').get('latest');
          read.onsuccess=()=>{db.close();resolve(!!read.result?.ciphertext);};
          read.onerror=()=>{db.close();resolve(false);};
        };
        request.onerror=()=>resolve(false);
      });
    });
    assert.deepEqual(await savedEncrypted(),{version:1,algorithm:'AES-GCM',hasCiphertext:true,exposedRecords:false,hasGameName:false},
      'Only the encrypted envelope, never decrypted records, is saved for offline use');
    // The app now opens historic records even when both cloud endpoints are unreachable.
    await page.route('**/vault.json*',simulatedOutage);
    await page.route('**/status.json*',simulatedOutage);
    await page.reload();
    await page.getByRole('heading',{name:'欢迎回到 XBOX Playlog'}).waitFor();
    assert.equal(await page.locator('.entry-screen').getByText('等待首次同步').count(),0);
    await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await page.locator('.recent-game-card').first().waitFor();
    await page.getByText('最新云端档案暂时无法读取',{exact:false}).waitFor();
    assert.equal(await page.locator('.stats').count(),1,
      'Historical game records remain readable while cloud refresh fails in the background');
    await page.unroute('**/vault.json*',simulatedOutage);
    await page.unroute('**/status.json*',simulatedOutage);
    // A newer encrypted cloud snapshot replaces the local history without hiding the archive.
    const newerPayload=await decryptVault(envelope,password);
    newerPayload.records[0].at='2026-11-02T00:00:00.000Z';
    newerPayload.records[0].games[0].name='Updated Test Game 0';
    newerPayload.records[0].games[0].lastPlayed='2026-11-02T00:00:00.000Z';
    activeEnvelope=await encryptVault(newerPayload,password);
    // A lagging public marker previously caused the PWA to falsely conclude
    // that a new vault was unavailable, even though the encrypted vault changed.
    simulatedStatusAt='2026-10-30T00:00:00Z';
    await page.reload();
    await page.getByRole('heading',{name:'欢迎回到 XBOX Playlog'}).waitFor();
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('checkbox',{name:'在此设备记住我（30天）',exact:true}).uncheck();
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    // Other tests cover scroll-triggered mobile nav. Here focus on the
    // vault-reload behavior, including while the mobile tab bar is hidden.
    await page.locator(mobile?'.mobile-nav':'.sidebar').getByRole('button',{name:'管理',exact:true}).evaluate(el=>el.click());
    await page.getByText('已自动加载最新同步记录。').waitFor();
    assert.equal(await page.locator('.history-row').count(),1,'The newest encrypted record appears in Manage history');
    assert.ok((await page.locator('.history-row').first().innerText()).includes('11/2'),'The newest published timestamp appears in sync history');
    await page.locator(mobile?'.mobile-nav':'.sidebar').getByRole('button',{name:'概览',exact:true}).evaluate(el=>el.click());
    assert.ok((await page.locator('.recent-game-card').first().innerText()).includes('Updated Test Game 0'),
      'Latest cloud history refreshes the archive after cached records are already visible');
    activeEnvelope=envelope;
    simulatedStatusAt=null;
    await unlock();
    await page.locator('.recent-game-card').first().waitFor();
    console.log((mobile?'Mobile':'Desktop')+': PASS offline-first encrypted history, network outage versus first sync, retry, background newer-snapshot refresh');
    // Xbox visibility is a game-library filter, never an achievement-history filter.
    const xboxArchive=await decryptVault(envelope,password);
    const xboxVisible={...structuredClone(xboxArchive.records[0].games[0]),officialHidden:false};
    const makePrivate=(id,name,visibility,awardName,rarity)=>{
      const g=structuredClone(xboxArchive.records[0].games[1]);
      g.id=id;g.name=name;g.lastPlayed='2026-10-29T13:00:00Z';
      if(visibility===undefined)delete g.officialHidden;else g.officialHidden=visibility;
      g.achievements=[{...g.achievements[0],id:'private-earned',name:awardName,
        unlocked:true,unlockedAt:'2026-10-29T12:24:00Z',rarity},
        {...g.achievements[2],id:'private-locked',unlocked:false,unlockedAt:null}];
      g.total=2;g.earned=1;g.groups=[];g.groupStatus='unavailable';
      return g;
    };
    const hiddenArchive=makePrivate('900','Xbox Hidden Archive',true,'Private Hidden Unlock',0.5);
    const unknownArchive=makePrivate('901','Xbox Unknown Archive',undefined,'Unknown Visibility Unlock',0.9);
    xboxArchive.records[0].source='Xbox';
    xboxArchive.records[0].games=[xboxVisible,hiddenArchive,unknownArchive];
    xboxArchive.records[0].at='2026-11-03T00:00:00.000Z';
    activeEnvelope=await encryptVault(xboxArchive,password);
    await unlock();
    await page.locator('.recent-game-card').first().waitFor();
    const recentArchiveNames=await page.locator('.recent-game-card').allTextContents();
    assert.ok(recentArchiveNames.every(t=>!t.includes('Xbox Hidden Archive')&&!t.includes('Xbox Unknown Archive')),
      'Official hidden and unknown games never appear in Recently Played');
    const hiddenDay=page.locator('.ah-preview-cell[data-day="2026-10-29"]');
    assert.match(await hiddenDay.getAttribute('aria-label'),/解锁 2 个成就/,
      'The overview achievement heatmap counts unlocks from hidden and unknown Xbox games');
    await hiddenDay.click();
    const hiddenDaySheet=page.getByRole('dialog',{name:'2026 年 10 月 29 日 成就摘要'});
    await hiddenDaySheet.waitFor();
    assert.ok((await hiddenDaySheet.innerText()).includes('Xbox Hidden Archive'));
    assert.ok((await hiddenDaySheet.innerText()).includes('Xbox Unknown Archive'));
    await hiddenDaySheet.getByRole('button',{name:'查看当天全部成就'}).click();
    await page.locator('.ah-day-detail').waitFor();
    assert.equal(await page.locator('.ah-day-detail .ah-achievement-card').count(),2,
      'The daily achievement detail includes both private and unknown-visibility records');
    assert.ok((await page.locator('.ah-day-detail').innerText()).includes('Private Hidden Unlock'));
    assert.ok((await page.locator('.ah-day-detail').innerText()).includes('Unknown Visibility Unlock'));
    await page.getByRole('button',{name:'打开 Xbox Hidden Archive 的游戏详情'}).click();
    await page.getByRole('dialog',{name:'Xbox Hidden Archive · 游戏详情'}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.locator('.ah-day-detail').waitFor();
    await switchMainTab('游戏库');
    await page.locator('.game-card').first().waitFor();
    assert.deepEqual(await page.locator('.game-card').evaluateAll(els=>els.map(el=>el.dataset.gameId)),[xboxVisible.id],
      'All Games remains restricted to Xbox titles explicitly marked visible');
    await switchMainTab('概览');
    await page.locator('.dusty-preview').waitFor();
    assert.equal(await page.locator('.dusty-preview .dust-card').count(),1,
      'Xbox titles without an explicit visibility flag appear in the dusty preview');
    const dustyPreviewCard=page.locator('.dusty-preview .dust-card[data-game-id="901"]');
    await dustyPreviewCard.click();
    await page.getByRole('dialog',{name:'Xbox Unknown Archive · 游戏详情'}).waitFor();
    assert.ok(page.url().endsWith('#overview/game/901'),'Dusty preview opens the selected game detail route');
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.locator('.dusty-preview').waitFor();
    await page.locator('.dusty-preview .ah-showcase-open').click();
    await page.locator('[data-dusty="detail"]').waitFor();
    assert.ok(page.url().endsWith('#dusty'),'The preview heading action still opens the full dusty list');
    const dustyDetailRow=page.locator('.dust-detail-row[data-game-id="901"]');
    assert.equal(await dustyDetailRow.evaluate(el=>el.tagName),'BUTTON','Every full-list game row is a semantic button');
    const dustyRing=dustyDetailRow.locator('.dust-achievement-ring');
    assert.equal(await dustyRing.getAttribute('aria-valuenow'),'50','Dusty list progress is earned achievements divided by total achievements');
    assert.equal((await dustyRing.locator('text').textContent())?.trim(),'50%','The ring percentage is shown in its center');
    assert.equal(await dustyRing.locator('.dust-achievement-ring-progress').evaluate(el=>getComputedStyle(el).stroke),
      'rgb(16, 124, 16)','Circular achievement progress matches official Xbox green');
    assert.equal(await dustyDetailRow.evaluate(el=>el.lastElementChild?.classList.contains('dust-achievement-ring')),true,
      'The achievement ring is placed at the far right of each row');
    await dustyDetailRow.click();
    await page.getByRole('dialog',{name:'Xbox Unknown Archive · 游戏详情'}).waitFor();
    assert.ok(page.url().endsWith('#dusty/game/901'),'Full dusty list opens the selected game detail route');
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.locator('[data-dusty="detail"]').waitFor();
    assert.ok(page.url().endsWith('#dusty'),'Closing a game detail returns to the full dusty list');
    await page.getByRole('button',{name:'返回概览'}).click();
    await page.locator('.dusty-preview').waitFor();
    assert.ok(page.url().endsWith('#overview'),'Full dusty list returns to the overview');
    activeEnvelope=envelope;
    await unlock();
    await page.locator('.recent-game-card').first().waitFor();
    console.log((mobile?'Mobile':'Desktop')+': PASS hidden/unknown Xbox achievements in heatmap and daily detail, without exposure in recent/all games, plus dusty game detail navigation');
    // Manual sync is fully client-side, and the scoped Actions credential never reaches Playlog hosting.
    let manualDispatches=0,requestedId='';
    await page.route('https://api.github.com/repos/sonder98/xbox-playlog-pages/actions/workflows/**',route=>{
      const req=route.request();
      if(req.method()==='POST'){
        manualDispatches++;
        assert.equal(req.headers().authorization,'Bearer github_pat_fixture_only');
        const body=req.postDataJSON();
        assert.equal(body.ref,'main');
        requestedId=body.inputs.request_id;
        return route.fulfill({status:204,body:''});
      }
      assert.equal(req.headers().authorization,'Bearer github_pat_fixture_only',
        'Manual sync status polling uses the existing Actions token instead of anonymous requests');
      return route.fulfill({json:{workflow_runs:requestedId?[{id:123,display_title:'Xbox sync (workflow_dispatch · '+requestedId+')',name:'Sync Xbox records',event:'workflow_dispatch',status:'queued',conclusion:null,html_url:'https://github.com/sonder98/xbox-playlog-pages/actions/runs/123',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}]:[]}});
    });
    await page.locator('.title-row .overview-refresh').click();
    const syncDialog=page.getByRole('dialog',{name:'手动同步 Xbox 游戏记录'});
    await syncDialog.waitFor();
    await syncDialog.locator('input[aria-label="GitHub fine-grained token"]').fill('github_pat_fixture_only');
    await syncDialog.getByRole('button',{name:'保存授权并立即同步'}).click();
    await syncDialog.getByText('已提交，等待 GitHub 排队').waitFor();
    assert.equal(manualDispatches,1,'Connected browser dispatches exactly one authenticated workflow');
    const encryptedToken=await page.evaluate(()=>localStorage.getItem('xbox-playlog-manual-sync-token-v1'));
    assert.ok(encryptedToken&&!encryptedToken.includes('github_pat_fixture_only'),'Scoped Actions token is encrypted in browser storage');
    await syncDialog.getByRole('button',{name:'关闭详情'}).click();
    await page.locator('.title-row .overview-refresh').click();
    await syncDialog.waitFor();
    assert.equal(manualDispatches,1,'Reopening an unfinished sync never dispatches a duplicate run');
    await syncDialog.getByRole('button',{name:'移除此设备授权'}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('xbox-playlog-manual-sync-token-v1')),null,'Disconnect removes the local token');
    await syncDialog.getByRole('button',{name:'关闭详情'}).click();
    console.log((mobile?'Mobile':'Desktop')+': PASS scoped one-click Xbox sync, encrypted credentials, job resume and disconnect');
    const pwa=await page.evaluate(async()=>{
      const link=document.querySelector('link[rel="manifest"]');
      return {href:link?.getAttribute('href'),manifest:link?await (await fetch(link.href)).json():null};
    });
    assert.equal(pwa.manifest?.display,'standalone','Production manifest enables standalone PWA');
    assert.ok(pwa.href?.endsWith('/xbox-playlog-pages/manifest.webmanifest'),'PWA links follow GitHub Pages base path');
    const versionResponse=await page.request.get('http://127.0.0.1:4173/xbox-playlog-pages/version.json');
    assert.ok(versionResponse.ok(),'Every release publishes an uncached build version manifest');
    assert.ok((await versionResponse.json()).version,'Build manifest has a real build revision');
    assert.equal(pwa.manifest.name,'XBOX Playlog','Installed app uses the exact requested brand name');
    assert.equal(pwa.manifest.short_name,'XBOX Playlog','Home screen label matches the brand');
    assert.equal(await page.title(),'XBOX Playlog','Website title matches installed brand');
    assert.ok((await page.locator('aside .brand').innerText()).includes('XBOX Playlog'),'Sidebar uses the new brand');
    const iconHref=await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    assert.ok(iconHref?.endsWith('/xbox-playlog-pages/apple-touch-icon-v3.png'),
      'iOS home screen icon uses the explicit updated subpath URL');
    for(const [file,size] of [['pwa-192-v3.png',192],['pwa-512-v3.png',512],['apple-touch-icon-v3.png',180],
      ['pwa-maskable-192-v3.png',192],['pwa-maskable-512-v3.png',512]]){
      const image=await page.request.get('http://127.0.0.1:4173/xbox-playlog-pages/'+file);
      assert.ok(image.ok(),file+' must be available after deployment');
      assert.ok(image.headers()['content-type']?.includes('image/png'),file+' must return a real PNG');
      const bytes=await image.body();
      assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file+' has a valid PNG signature');
      assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[size,size],
        file+' has the exact dimensions that iOS or the PWA manifest requests');
    }
    if(mobile){
      const mobileBar=page.getByRole('navigation',{name:'主导航'});
      assert.equal(await mobileBar.locator('button').count(),4,'Mobile navigation retains four tabs');
      assert.equal(await mobileBar.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
        'Bottom navigation starts hidden and cannot intercept touches');
      assert.equal(await mobileBar.evaluate(el=>getComputedStyle(el).opacity),'0',
        'Bottom navigation is initially transparent');
      await page.mouse.wheel(0,240);
      await page.waitForFunction(()=>document.querySelector('.mobile-nav')?.classList.contains('is-visible'));
      assert.equal(await mobileBar.evaluate(el=>getComputedStyle(el).pointerEvents),'auto',
        'Vertical page movement reveals the navigation for tapping');
      await page.waitForFunction(()=>!document.querySelector('.mobile-nav')?.classList.contains('is-visible'),
        {timeout:4000});
      assert.equal(await mobileBar.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
        'Navigation automatically hides again when scrolling stops');
      await switchMainTab('游戏库');
      await page.locator('.toolbar').waitFor();
      assert.equal(await page.locator('.mobile-nav.is-visible').count(),1,
        'Tapping a tab keeps mobile navigation visible after the route changes');
      await page.waitForTimeout(750);
      assert.equal(await page.locator('.mobile-nav.is-visible').count(),1,
        'Bottom nav must remain visible during the 1.5-second post-tap grace period');
      await mobileBar.getByRole('button',{name:'游戏库',exact:true}).click();
      await page.waitForTimeout(850);
      assert.equal(await page.locator('.mobile-nav.is-visible').count(),1,
        'Tapping the current tab restarts the full 1.5-second visibility timer');
      await page.waitForFunction(()=>!document.querySelector('.mobile-nav')?.classList.contains('is-visible'),
        {timeout:3000});
      assert.equal(await mobileBar.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
        'Bottom nav hides again and stops intercepting touches once the grace period expires');
      await switchMainTab('概览');
      await page.locator('[data-overview-section="recent"]').waitFor();
    // Official Xbox App #107C10 drives the site theme and progress.
    // Mythic collector frames remain independently minted #A6F3C8.
    const siteTheme=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      const draw=(cls)=>{
        const el=document.createElement('div');el.className=cls;document.body.append(el);
        const style=getComputedStyle(el),result={background:style.backgroundColor,color:style.color};
        el.remove();return result;
      };
      const pill=document.createElement('div');pill.className='filter-pills';
      const btn=document.createElement('button');btn.className='active';pill.append(btn);document.body.append(pill);
      const selected=getComputedStyle(btn).backgroundColor;
      pill.remove();
      const level=[0,1,2,3,4].map(n=>draw('ah-level-'+n).background);
      return {accent:root.getPropertyValue('--accent').trim().toUpperCase(),
        progress:root.getPropertyValue('--progress-mint').trim().toUpperCase(),
        primary:draw('primary'),selected,level};
    });
    assert.equal(siteTheme.accent,'#107C10','The site uses the exact Xbox app icon green');
    assert.equal(siteTheme.progress,'#107C10','Progress matches the sampled official Xbox green');
    assert.equal(siteTheme.primary.background,'rgb(16, 124, 16)','Primary CTAs use Xbox official green');
    assert.equal(siteTheme.primary.color,'rgb(255, 255, 255)','CTA text is white for 5.37:1 contrast on official green');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim().toUpperCase()),
      '#62D56B','Small labels use a readable green derived from the official hue');
    assert.equal(await page.locator('.stat:last-child .stat-value').evaluate(el=>getComputedStyle(el).color),
      'rgb(98, 213, 107)','Mythic count stays legible as an inline statistic');
    assert.equal(siteTheme.selected,'rgb(16, 124, 16)','Active filters use Xbox official green');
    assert.deepEqual(siteTheme.level,['rgb(48, 48, 48)','rgb(28, 58, 30)',
      'rgb(28, 87, 31)','rgb(34, 109, 44)','rgb(16, 124, 16)'],
      'Achievement heatmap uses the darker Xbox green intensity scale');
    console.log((mobile?'Mobile':'Desktop')+': PASS official Xbox App green theme and heatmap');

      assert.equal(await page.locator('.mobile-nav.is-visible').count(),1,
        'Tab switching back to overview also preserves navigation for 1.5 seconds');
      console.log('Mobile: PASS four tabs, scroll auto-hide and resettable 1.5-second post-tap navigation visibility');
    }
    // Bottom/sidebar navigation: heatmap is a first-class third tab; the fourth
    // combines previously separate connection/data and snapshot history screens.
    const navSurface=page.locator(mobile?'nav.mobile-nav':'aside.sidebar nav');
    assert.deepEqual(await navSurface.locator('button').allTextContents(),['概览','游戏库','成就','管理'],
      'Both mobile and desktop have exactly four tabs in their new order');
    await switchMainTab('成就');
    await page.locator('.ah-month-card').first().waitFor();
    assert.ok(page.url().endsWith('#achievements'),'Third tab opens the full heatmap directly');
    assert.equal(await page.locator('.ah-full-history').count(),1,'Third tab has full monthly heatmap rather than overview preview');
    assert.equal(await navSurface.locator('button').nth(2).getAttribute(mobile?'aria-current':'class'),mobile?'page':'active');
    await page.getByRole('button',{name:'返回概览',exact:true}).click();
    await page.locator('[data-overview-section="recent"]').waitFor();
    await switchMainTab('管理');
    await page.locator('[data-page="manage"]').waitFor();
    assert.ok(page.url().endsWith('#manage'),'Fourth tab opens combined management screen');
    assert.equal(await navSurface.locator('button').nth(3).getAttribute(mobile?'aria-current':'class'),mobile?'page':'active');
    assert.deepEqual(await page.locator('.manage-section-heading h2').allTextContents(),['游戏展示','同步历史'],
      'Management contains game visibility and sync history only');
    assert.equal(await page.locator('.visibility-panel').count(),1,'One visibility card replaces the old three management cards');
    assert.equal(await page.locator('.manage-page').getByRole('button',{name:'管理展示',exact:true}).count(),1,
      'Display management is now entered from the Management tab');
    for(const removed of ['微软 自动同步','备份与本机导入','统计口径']){
      assert.equal(await page.locator('.manage-page').getByText(removed,{exact:true}).count(),0,
        'Unused management card was removed: '+removed);
    }
    assert.equal(await page.locator('#sync-history .history-sync-mechanism').first().innerText(),'Cloudflare 自动同步',
      'Snapshot provenance is visible without changing the history layout');
    assert.equal(await page.locator('#sync-history .history-row').count(),1,
      'Existing snapshot history remains below game visibility');
    const groupOrder=await page.locator('.manage-section').evaluateAll(sections=>sections.map(section=>section.getBoundingClientRect().top));
    assert.ok(groupOrder[0]<groupOrder[1],'Sync history visually follows the game visibility section');
    for(const legacy of ['#settings','#history']){
      await page.evaluate(hash=>{location.hash=hash;},legacy);
      await page.locator('[data-page="manage"]').waitFor();
      assert.equal(await navSurface.locator('button').nth(3).getAttribute(mobile?'aria-current':'class'),mobile?'page':'active',
        'Old bookmark '+legacy+' resolves to the new fourth tab');
    }
    await switchMainTab('概览');
    await page.locator('[data-overview-section="recent"]').waitFor();
    console.log((mobile?'Mobile':'Desktop')+': PASS direct achievement tab, merged management hierarchy, legacy bookmarks and four-tab navigation');
    // Light/dark is an icon-only Overview heading control. Keep the selected
    // visual mode across normal PWA reopening; it never changes Xbox data.
    const themeSwitcher=page.getByRole('button',{name:'切换至浅色模式'});
    await themeSwitcher.waitFor();
    assert.equal(await themeSwitcher.locator('svg.lucide-sun').count(),1,
      'Dark mode displays a sun icon for switching to light');
    const getThemeAppearance=()=>page.evaluate(()=>{
      const bg=(selector)=>getComputedStyle(document.querySelector(selector)).backgroundColor;
      const root=getComputedStyle(document.documentElement);
      const symbol=document.querySelector('.game-cover.completion-frame');
      const heat=document.createElement('span');heat.className='ah-level-2';
      document.body.append(heat);const level=getComputedStyle(heat).backgroundColor;heat.remove();
      return {mode:document.documentElement.dataset.theme,
        page:root.backgroundColor,panel:bg('[data-overview-section="recent"]'),
        title:root.color,progress:bg('.recent-game-progress-track>span'),
        heat:level,collector:symbol?getComputedStyle(symbol).borderTopColor:null,
        status:document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
        stored:localStorage.getItem('xbox-playlog-theme')};
    });
    const darkAppearance=await getThemeAppearance();
    assert.equal(darkAppearance.mode,'dark','Existing users start in dark mode');
    assert.equal(darkAppearance.page,'rgb(15, 15, 15)');
    assert.equal(darkAppearance.panel,'rgb(24, 24, 24)');
    assert.equal(darkAppearance.status,'#0F0F0F');
    await themeSwitcher.click();
    const lightAppearance=await getThemeAppearance();
    assert.equal(lightAppearance.mode,'light','Sun icon selects light mode');
    assert.equal(lightAppearance.page,'rgb(244, 246, 243)');
    assert.equal(lightAppearance.panel,'rgb(255, 255, 255)');
    assert.equal(lightAppearance.title,'rgb(25, 39, 29)');
    assert.equal(lightAppearance.progress,'rgb(16, 124, 16)',
      'Original Xbox green remains the same in light mode');
    assert.equal(lightAppearance.heat,'rgb(158, 212, 166)');
    assert.equal(lightAppearance.collector,'rgb(166, 243, 200)',
      'The Mythic collector frame retains its exact mint, independent of theme');
    assert.equal(lightAppearance.status,'#F4F6F3');
    assert.equal(lightAppearance.stored,'light');
    const moon=page.getByRole('button',{name:'切换至深色模式'});
    assert.equal(await moon.locator('svg.lucide-moon').count(),1,
      'Light mode displays a moon icon to switch back');
    const toggleBounds=await page.locator('.title-row').evaluate(row=>{
      const head=row.querySelector('.overview-heading-actions h1').getBoundingClientRect();
      const icon=row.querySelector('.theme-toggle').getBoundingClientRect();
      const sync=row.querySelector('.overview-refresh').getBoundingClientRect();
      return {headingRight:head.right,iconLeft:icon.left,iconRight:icon.right,syncLeft:sync.left};
    });
    assert.ok(toggleBounds.iconLeft>=toggleBounds.headingRight,
      'Theme icon is immediately after the Overview title');
    assert.ok(toggleBounds.iconRight+5<=toggleBounds.syncLeft,
      'Theme icon and Sync action never overlap');
    // The first browser paint also respects localStorage before React starts.
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light',
      'Persisted light theme applies before unlocking on a subsequent launch');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#F4F6F3');
    if(await page.locator('input[type="password"]').count()){
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    }
    await page.getByRole('button',{name:'切换至深色模式'}).waitFor();
    await page.getByRole('button',{name:'切换至深色模式'}).click();
    const backToDark=await getThemeAppearance();
    assert.equal(backToDark.mode,'dark');
    assert.equal(backToDark.page,darkAppearance.page);
    assert.equal(backToDark.panel,darkAppearance.panel);
    assert.equal(backToDark.progress,darkAppearance.progress);
    assert.equal(backToDark.collector,darkAppearance.collector);
    assert.equal(backToDark.stored,'dark');
    assert.equal(await page.locator('.theme-toggle svg.lucide-sun').count(),1);
    console.log((mobile?'Mobile':'Desktop')+': PASS light/dark toggle beside Overview title, persisted launch and preserved Mythic art');
    const recent=page.locator('[data-overview-section="recent"]');
    assert.equal(await recent.locator('.recent-game-card').count(),10,'Overview renders ten latest games in one horizontal rail');
    assert.equal(await recent.locator('.game-card').count(),0,'Recent games are not the old multi-line list');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-title').innerText(),'Test Game 0');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress strong').innerText(),'50%',
      'Combined base + DLC progress displays 2 / 4 = 50%, not base-only Mythic 100%');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress-track').getAttribute('aria-valuenow'),'50');
    assert.equal(await recent.locator('.recent-game-progress-track>span').first().evaluate(el=>getComputedStyle(el).backgroundColor),
      'rgb(16, 124, 16)','Overview recent-game progress matches official Xbox green');
    assert.equal((await recent.locator('.recent-game-card').first().locator('.recent-game-hours').innerText()).trim(),'累计游玩 1 h',
      'Lifetime hours appear on their own line beneath the title');
    assert.equal(await recent.locator('.recent-game-card .recent-game-hours').count(),10,
      'Every recent game, including unmeasured ones, keeps a separate hours row');
    assert.equal(await recent.locator('.recent-game-progress .recent-game-hours').count(),0,
      'No hours label is allowed to shorten the achievement progress bar');
    const recentGeometry=await recent.locator('.recent-game-card').first().evaluate(card=>{
      const box=(selector)=>card.querySelector(selector).getBoundingClientRect();
      const title=box('.recent-game-title'),hours=box('.recent-game-hours');
      const progress=box('.recent-game-progress'),track=box('.recent-game-progress-track');
      const percent=box('.recent-game-progress strong');
      return {titleBottom:title.bottom,hoursTop:hours.top,hoursBottom:hours.bottom,
        progressTop:progress.top,trackRatio:track.width/progress.width,
        trackRight:track.right,percentLeft:percent.left,
        progressWidth:progress.width,cardWidth:card.clientWidth};
    });
    assert.ok(recentGeometry.titleBottom<=recentGeometry.hoursTop&&recentGeometry.hoursBottom<=recentGeometry.progressTop,
      'Title, cumulative hours and progress are three distinct vertically ordered rows');
    assert.ok(recentGeometry.trackRatio>.55,
      'Progress bar recovers at least 55% of its dedicated row on both mobile and desktop');
    assert.ok(recentGeometry.trackRight<=recentGeometry.percentLeft,
      'Percentage sits to the right of the full progress track');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress').evaluate(el=>getComputedStyle(el).display),'flex',
      'Completion percentage and progress track share a row');
    assert.equal(await recent.locator('.recent-games-rail').evaluate(el=>getComputedStyle(el).overflowX),'auto',
      'Recent games scroll as one cover-first horizontal row');
    if(mobile){
      const refresh=await page.locator('.title-row .overview-refresh').evaluate(button=>{
        const a=button.getBoundingClientRect(),b=button.querySelector('svg').getBoundingClientRect();
        return {dx:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),dy:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),size:a.width};
      });
      assert.equal(refresh.size,44,'Mobile refresh is a 44px square tap target');
      assert.ok(refresh.dx<1&&refresh.dy<1,'Mobile refresh icon is centered both ways');
    }
    const statsBeforeHiding=await page.locator('.stats').innerText();
    assert.equal(await page.locator('.stats .stat').count(),4,
      'Overview keeps all four summary figures');
    assert.equal(await page.locator('.stats .stat-note').count(),0,
      'Metric cards no longer display bottom helper notes');
    assert.equal(await page.locator('.overview-moment').count(),0,
      'Entire since-last-sync playtime panel has been removed');
    assert.equal(await page.locator('.title-row p').count(),0,
      'Overview page title has no explanatory paragraph');
    assert.equal(await page.locator('.ah-showcase-heading p').count(),0,
      'Rare, longest-gap and dusty preview headings show no helper subtitles');
    assert.deepEqual(await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection)),['recent','heatmap','showcases','dusty','stats']);
    assert.equal(await page.locator('.dusty-preview').count(),1,'Dusty preview belongs after achievements-gap showcase');
    assert.equal(await page.locator('.dusty-preview .dust-card').count(),0,'Non-Xbox fixtures must not invent official missing-visibility games');
    assert.equal(await page.locator('.ah-preview-grid .ah-preview-cell').count(),30,'Overview shows only 30 days');
    assert.equal(await page.locator('.ah-preview-weekdays span').count(),7,'Overview has explicit Monday-Sunday weekday labels');
    assert.equal(await page.locator('.ah-preview-axis').count(),0,'Overview omits explanatory direction text');
    assert.equal(await page.locator('[data-overview-section="heatmap"] .ah-month-played').count(),1,
      'Overview heatmap has the monthly played section beneath its calendar');
    assert.equal((await page.locator('[data-overview-section="heatmap"] .ah-month-played-title').innerText()).replace(/\s+/g,' ').trim(),'本月在玩 1 款',
      'November shows only the one game with a recorded positive playtime increase');
    const previewDot=await page.locator('.ah-preview-cell .ah-dot').first().evaluate(el=>{
      const button=el.parentElement.getBoundingClientRect(),dot=el.getBoundingClientRect();
      return {ratio:dot.width/dot.height,relative:dot.width/button.width,radius:getComputedStyle(el).borderRadius};
    });
    assert.ok(Math.abs(previewDot.ratio-1)<.04&&previewDot.relative<.69&&previewDot.relative>.6,'Circular heatmap dots are slightly smaller than tap targets');
    assert.equal(previewDot.radius,'50%','Overview heatmap dots are circular');
    const previewDates=await page.locator('.ah-preview-cell').evaluateAll(els=>els.map(el=>({day:el.dataset.day,date:el.querySelector('.ah-dot')?.textContent?.trim()})));
    assert.equal(previewDates.length,30,'Every recent activity date has its own circle');
    assert.ok(previewDates.every(({day,date})=>date===String(Number(day.slice(-2)))),'Recent activity circles show day-of-month numbers');
    const previewSquare=await page.locator('.ah-preview-cell').first().evaluate(el=>{
      const r=el.getBoundingClientRect();return r.width/r.height;
    });
    assert.ok(Math.abs(previewSquare-1)<.04,'Recent 30-day preview tiles are square');
    await page.locator('.ah-preview-cell[data-day="2026-10-27"]').click();
    const overviewSheet=page.getByRole('dialog',{name:'2026 年 10 月 27 日 成就摘要'});
    await overviewSheet.waitFor();
    const placement=await overviewSheet.evaluate(el=>{
      const games=el.querySelector('.ah-sheet-games').getBoundingClientRect();
      const summary=el.querySelector('.ah-day-recap').getBoundingClientRect();
      const art=el.querySelector('.ah-sheet-game-cover').getBoundingClientRect();
      const shell=el.getBoundingClientRect();
      return {summaryBottom:summary.bottom,gamesTop:games.top,artWidth:art.width,
       overflows:el.scrollWidth>el.clientWidth+1,viewHeight:shell.height,
       summaryMetrics:el.querySelectorAll('.ah-day-recap-stat').length};
    });
    assert.ok(placement.summaryBottom<placement.gamesTop,'Photo activity recap precedes the game rows');
    assert.ok(placement.artWidth>=49,'Game cover artwork has a prominent square thumbnail');
    assert.equal(placement.summaryMetrics,3,'Daily summary has achievements, hours, and games');
    assert.equal(placement.overflows,false,'Redesigned day sheet does not overflow narrow screens');
    assert.equal(await overviewSheet.locator('.ah-sheet-game-count').count(),3,
      'Game list keeps the first three compact tappable cards');
    assert.ok((await overviewSheet.locator('.ah-sheet-game-count').first().innerText()).includes('— 小时'),
      'An old day must show unknown time, not invent 0 hours');
    assert.equal(await overviewSheet.locator('.ah-day-recap-stat').nth(1).locator('strong').innerText(),'—',
      'No trustworthy playtime samples means no fictitious daily total');
    assert.equal(await overviewSheet.locator('.ah-day-recap').getAttribute('data-hero-game-id'),'101',
      'Largest daily achievement count selects the first stable game on a tie');
    const recapHero=await overviewSheet.locator('.ah-day-recap').evaluate(el=>{
      const img=el.querySelector('.ah-day-recap-backdrop img');
      const styles=img&&getComputedStyle(img);
      const veil=getComputedStyle(el,'::before').backgroundImage;
      const veilAlphas=(veil.match(/rgba?\([^)]+\)/g)||[]).map(value=>Number(value.replace(')','').split(',').at(-1)));
      return {src:img?.getAttribute('src'),brightness:styles?.filter,
        veilAlphas,shadow:getComputedStyle(el.querySelector('.ah-day-recap-content')).textShadow,
        overflow:getComputedStyle(el).overflow};
    });
    assert.ok(recapHero.src?.endsWith('/landscape.svg'),'Day recap uses the same cached detail hero art');
    assert.ok(recapHero.brightness?.includes('brightness(0.92)')&&recapHero.brightness.includes('blur(1.25px)'),
      "Winning game cover stays legible at 92% brightness with only slight blur");
    assert.ok(recapHero.veilAlphas.length>=2&&Math.max(...recapHero.veilAlphas)<=.5,
      'Atmospheric overlay stays <=50% opacity, not the previous nearly opaque 68-83%');
    assert.ok(recapHero.shadow&&recapHero.shadow!=='none',
      'Metric labels stay readable with a dark text shadow over brighter art');
    assert.equal(recapHero.overflow,'hidden','Background image stays inside the rounded recap card');
    assert.equal(await page.locator('.ah-day-detail .ah-sheet-game-hours').count(),0,
      'Full achievement detail does not inherit summary sheet metrics');
    const headerGeometry=await overviewSheet.evaluate(el=>{
      const header=el.querySelector('.ah-sheet-heading'),date=header.querySelector('strong');
      const arrows=[...header.querySelectorAll('.ah-sheet-date-arrow')];
      const bounds=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
      return {date:bounds(date),arrows:arrows.map(bounds),extraButtons:header.querySelectorAll('button').length,closeButtons:el.querySelectorAll('.ah-sheet-close').length,subtitle:el.textContent.includes('当天解锁记录'),visibleLabels:arrows.map(x=>x.textContent.trim())};
    });
    assert.equal(headerGeometry.subtitle,false,'No redundant unlock subtitle');
    assert.equal(headerGeometry.closeButtons,0,'Sheet has no X; close through backdrop');
    assert.equal(headerGeometry.extraButtons,2,'Only previous and next controls in the header');
    assert.deepEqual(headerGeometry.visibleLabels,['',''],'Date controls use icons without text');
    assert.ok(headerGeometry.arrows[0].right<=headerGeometry.date.x&&headerGeometry.date.right<=headerGeometry.arrows[1].x,'Date is between previous and next icons');
    assert.ok(Math.abs(headerGeometry.arrows[0].y-headerGeometry.arrows[1].y)<2&&Math.abs(headerGeometry.date.y-headerGeometry.arrows[0].y)<14,'Date and arrows share one horizontal row');
    if(mobile){
      const rect=await overviewSheet.boundingBox();
      assert.ok(rect&&rect.y>70&&rect.y<650,'Home preview remains a bottom-anchored mobile sheet despite richer content');
    }
    await overviewSheet.getByRole('button',{name:/前一天 2026 年 10 月 26 日/}).click();
    await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).waitFor();
    assert.ok((await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).innerText()).includes('0'));
    await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).getByRole('button',{name:/后一天 2026 年 10 月 27 日/}).click();
    await overviewSheet.waitFor();
    await page.locator('.ah-sheet-backdrop').click({position:{x:10,y:10}});
    await overviewSheet.waitFor({state:'hidden'});
    // Both TOP100 galleries and the dusty games preview sit between Recent Games and summary statistics.
    const overviewOrder=await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection));
    assert.deepEqual(overviewOrder,['recent','heatmap','showcases','dusty','stats'],
      'Overview starts with recent games, followed by heatmap, galleries and statistics');
    assert.equal(await page.locator('.ah-home-showcases > .ah-showcase').count(),2,
      'Overview contains exactly two achievement cabinets');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-tile').count(),24,'Showcase previews each eligible earned achievement in one horizontal rail');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-rarity-value').count(),24,
      'Every rare achievement thumbnail includes its global unlock percentage beneath the picture');
    assert.equal((await page.locator('.ah-showcase-rarity-value').first().innerText()).trim(),'0%',
      'Rarest visible achievement displays 0% unlock rate');
    const rareTiles=page.locator('[data-achievement-showcase="preview"] .ah-showcase-tile');
    assert.equal(await rareTiles.locator('.ah-showcase-name').count(),24,
      'Every rare achievement has a visible name below its artwork');
    assert.equal(await rareTiles.locator('.ah-showcase-unlock-time').count(),24,
      'Every rare achievement shows its unlock time on a separate third row');
    assert.equal(await rareTiles.first().locator('.ah-showcase-name').innerText(),'Achievement 0');
    assert.equal(await rareTiles.first().locator('time').innerText(),'2026.11.01 20:24',
      'Unlock time is rendered in Beijing time');
    assert.equal(await rareTiles.first().locator('time').getAttribute('datetime'),'2026-11-01T12:24:00.000Z');
    const rarePreviewLayout=await rareTiles.first().evaluate(el=>{
      const art=el.querySelector('.ah-showcase-art').getBoundingClientRect();
      const rarity=el.querySelector('.ah-showcase-rarity-value').getBoundingClientRect();
      const name=el.querySelector('.ah-showcase-name');
      const label=name.getBoundingClientRect();
      const time=el.querySelector('.ah-showcase-unlock-time');
      const date=time.getBoundingClientRect();
      const tile=el.getBoundingClientRect();
      const centered=box=>Math.abs(box.x+box.width/2-(tile.x+tile.width/2))<2;
      return {
        cardWidth:tile.width,
        imageHeight:art.height,
        artCentered:centered(art),
        rarityCentered:centered(rarity),
        labelCentered:centered(label)&&getComputedStyle(name).textAlign==='center',
        dateCentered:centered(date)&&getComputedStyle(time).textAlign==='center',
        threeRows:art.bottom<rarity.top&&rarity.bottom<=label.top&&label.bottom<=date.top,
        noOverflow:el.scrollWidth<=el.clientWidth+1
      };
    });
    assert.ok(rarePreviewLayout.artCentered&&rarePreviewLayout.rarityCentered&&
      rarePreviewLayout.labelCentered&&rarePreviewLayout.dateCentered&&
      rarePreviewLayout.threeRows&&rarePreviewLayout.noOverflow,
      'Artwork and all three caption rows are centered, with rarity first, name second, date third');
    assert.equal(rarePreviewLayout.cardWidth,mobile?156:164,'Rare preview uses compact card widths');
    assert.ok(Math.abs(rarePreviewLayout.imageHeight-(mobile?72:88))<1,
      'Rare showcase image height matches the original smaller size');
    const longRareName=rareTiles.locator('.ah-showcase-name').filter({hasText:'Very long achievement name'}).first();
    assert.ok(await longRareName.evaluate(el=>el.scrollWidth>el.clientWidth&&getComputedStyle(el).textOverflow==='ellipsis'),
      'Long achievement names are truncated, never forcing wider tiles');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-top-label').innerText(),'TOP 100',
      'Rarity display shows the expanded TOP 100 capacity');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-foot').locator('span').count(),0,
      'Rarity showcase footer has no redundant explanation');
    assert.ok(['flex-end','flow-end'].includes(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-foot').evaluate(el=>getComputedStyle(el).justifyContent)),
      'Rarity showcase arrows stay right-aligned in current Chromium');

    await page.locator('.ah-showcase-art img').first().waitFor();
    const wideArt=page.locator('.ah-showcase-art').filter({has:page.locator('img[src*="wide.svg"]')}).first();
    await wideArt.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.ah-showcase-art img[src*="wide.svg"]')?.naturalWidth>0);
    const firstFrame=await page.locator('.ah-showcase-art').first().evaluate(el=>{
      const rect=el.getBoundingClientRect(),img=el.querySelector('img');
      return {ratio:rect.width/rect.height,fit:getComputedStyle(img).objectFit};
    });
    const wideFrame=await wideArt.evaluate(el=>{
      const rect=el.getBoundingClientRect(),img=el.querySelector('img');
      return {ratio:rect.width/rect.height,fit:getComputedStyle(img).objectFit};
    });
    assert.ok(Math.abs(firstFrame.ratio-1)<.04,'Square Xbox art remains square');
    assert.ok(Math.abs(wideFrame.ratio-16/9)<.04,'Wide Xbox art keeps its source proportions');
    assert.equal(firstFrame.fit,'contain','Square showcase art is not cropped');
    assert.equal(wideFrame.fit,'contain','Wide showcase art is not cropped');
    const goldFrame=page.locator('.ah-showcase-art.ah-rarity-gold').first();
    const foil=await goldFrame.evaluate(el=>{
      const style=getComputedStyle(el),highlight=getComputedStyle(el,'::after');
      return {border:style.borderTopWidth,background:style.backgroundImage,shine:highlight.animationName};
    });
    assert.equal(foil.border,'2px','Rare achievement has a refined gold outline');
    assert.ok(foil.background.includes('gradient'),'Gold frame uses a layered metallic finish');
    assert.ok(foil.shine.includes('ah-foil-orbit'),'Gold shine animates around the art frame');
    assert.equal(await page.locator('.ah-showcase-tile[data-rarity-tier="ultra"]').count(),12,'Below 1 percent is ultra rare');
    assert.equal(await page.locator('.ah-showcase-tile[data-rarity-tier="rare"]').count(),12,'Under 10 percent gets the rare gold frame');

    await page.getByRole('button',{name:'查看稀有成就展柜详情'}).click();
    await page.locator('[data-achievement-showcase="detail"]').waitFor();
    assert.ok(page.url().endsWith('#achievements/showcase'),'Rarity detail supports a deep link');
    assert.equal(await page.locator('.ah-showcase-detail .ah-achievement-card').count(),24,'Rarity detail shows the same ranked items');
    assert.equal(await page.locator('.ah-showcase-rank').first().innerText(),'#01','Showcase cards are rank numbered');
    assert.equal(await page.locator('.ah-showcase-detail .ah-achievement-card[data-rarity-tier="ultra"]').count(),12,'Detail cards retain the ultra rarity finish');
    assert.equal(await page.locator('.ah-showcase-detail .ah-achievement-card[data-rarity-tier="rare"]').count(),12,'Detail cards retain their gold rarity frames');
    const detailFoil=await page.locator('.ah-showcase-detail .ah-achievement-art.ah-rarity-gold').first().evaluate(el=>
      ({fit:getComputedStyle(el.querySelector('img')).objectFit,shine:getComputedStyle(el,'::after').animationName}));
    assert.equal(detailFoil.fit,'contain','Detail gilt never crops achievement art');
    assert.ok(detailFoil.shine.includes('ah-foil-orbit'),'Detail also has animated border shimmer');

    assert.ok((await page.locator('.ah-showcase-detail .ah-achievement-meta').first().innerText()).includes('0%'),'Rarest eligible item is ranked first');
    await page.locator('.ah-showcase-detail .ah-game-source').first().click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.getByRole('button',{name:'返回概览'}).click();
    await page.locator('[data-achievement-showcase="preview"]').waitFor();
    assert.ok(['','#overview'].includes(await page.evaluate(()=>location.hash)),'Rare gallery detail returns to overview');
    assert.equal(await page.locator('[data-achievement-gap="preview"] .ah-gap-tile').count(),12,
      'Each of the 12 games contributes a single chronological adjacent unlock pair');
    assert.equal(await page.locator('[data-achievement-gap="preview"] .ah-showcase-top-label').innerText(),'TOP 100',
      'Gap preview also uses TOP 100');
    assert.equal(await page.locator('[data-achievement-gap="preview"] .ah-showcase-foot').locator('span').count(),0,
      'Gap showcase footer has no count/ranking explanation');
    assert.ok(['flex-end','flow-end'].includes(await page.locator('[data-achievement-gap="preview"] .ah-showcase-foot').evaluate(el=>getComputedStyle(el).justifyContent)),
      'Gap showcase arrows stay right-aligned in current Chromium');

    assert.equal((await page.locator('.ah-gap-tile-duration').first().innerText()).replace(/\s+/g,' ').trim(),'间隔 1.0 天',
      'Gap previews show one-decimal elapsed days');
    const pairArtwork=await page.locator('.ah-gap-tile').first().evaluate(card=>{
      const older=card.querySelector('.ah-gap-image-back').getBoundingClientRect();
      const newer=card.querySelector('.ah-gap-image-front').getBoundingClientRect();
      return {olderLeft:older.left,olderRight:older.right,newerLeft:newer.left,newerTop:newer.top,olderTop:older.top};
    });
    assert.ok(pairArtwork.newerLeft>pairArtwork.olderLeft && pairArtwork.newerLeft<pairArtwork.olderRight,
      'The two achievement pictures overlap but the earlier picture remains visible');
    assert.ok(pairArtwork.newerTop-pairArtwork.olderTop>=30,
      'Staggering exposes at least 30px of the older artwork above the later image');
    assert.equal(await page.locator('[data-achievement-gap="preview"] .ah-gap-stack-arrow').count(),0,
      'The decorative white arrow between achievement images is removed');
    // Regression for gold frames overlapping the right tile edge on iPhone.
    // Check every pair, not only #01: different achievement ratios/rarities
    // must not push the rotated later thumbnail (including its gold glow) over the card border.
    const originalGapViewport=page.viewportSize();
    const gapWidths=mobile?[320,360,375,390,430]:[701,1024,1440];
    for(const width of gapWidths){
      await page.setViewportSize({width,height:originalGapViewport.height});
      const bounds=await page.locator('[data-achievement-gap="preview"] .ah-gap-tile').evaluateAll(tiles=>tiles.map(tile=>{
        const r=tile.getBoundingClientRect();
        const stack=tile.querySelector('.ah-gap-stack').getBoundingClientRect();
        const earlier=tile.querySelector('.ah-gap-image-back').getBoundingClientRect();
        const later=tile.querySelector('.ah-gap-image-front').getBoundingClientRect();
        const laterArt=tile.querySelector('.ah-gap-image-front .ah-gap-art').getBoundingClientRect();
        return {
          rank:tile.dataset.gapRank,
          cardWidth:r.width,stackWidth:stack.width,
          frontRightInset:r.right-later.right,
          backLeftInset:earlier.left-r.left,
          backRightInset:r.right-earlier.right,
          laterLeft:later.left,earlierLeft:earlier.left,earlierRight:earlier.right,
          laterTop:later.top,earlierTop:earlier.top,
          frontArtWidth:laterArt.width,
          tileOverflow:tile.scrollWidth-tile.clientWidth
        };
      }));
      assert.equal(bounds.length,12,'All 12 gap preview pairs remain present at '+width+'px');
      for(const b of bounds){
        assert.ok(b.frontRightInset>=7&&b.frontRightInset<=18,
          'Gap #'+b.rank+' right image must sit close to, but clear, the tile border at '+width+'px: '+JSON.stringify(b));
        assert.ok(b.frontArtWidth>=(mobile?100:110),
          'Gap #'+b.rank+' must retain its original large artwork size at '+width+'px: '+JSON.stringify(b));
        assert.ok(b.backLeftInset>=2&&b.backRightInset>=16,
          'Gap #'+b.rank+' older artwork remains inside the card at '+width+'px: '+JSON.stringify(b));
        assert.ok(b.laterLeft>b.earlierLeft&&b.laterLeft<b.earlierRight&&b.laterTop>b.earlierTop,
          'Gap #'+b.rank+' retains intentional artwork overlap at '+width+'px');
        assert.ok(b.tileOverflow<=1,
          'Gap #'+b.rank+' has no horizontal content overflow at '+width+'px: '+JSON.stringify(b));
      }
    }
    await page.setViewportSize(originalGapViewport);
    // The later art must stay right-aligned even for square or narrow Xbox artwork.
    // It previously had a fixed left offset, creating disproportionate empty space.
    const dynamicGap=await page.locator('.ah-gap-tile').first().evaluate(tile=>{
      const front=tile.querySelector('.ah-gap-image-front');
      const art=front.querySelector('.ah-gap-art');
      const edge=()=>tile.getBoundingClientRect().right-front.getBoundingClientRect().right;
      const oldAspect=art.style.aspectRatio;
      const originalRightInset=edge();
      art.style.aspectRatio='1';
      const squareRightInset=edge();
      art.style.aspectRatio=oldAspect;
      return {originalRightInset,squareRightInset};
    });
    assert.ok(Math.abs(dynamicGap.squareRightInset-dynamicGap.originalRightInset)<2,
      'Right-aligned artwork preserves a consistent right margin for square achievement images');
    const widePair=await page.locator('.ah-gap-tile').first().evaluate(tile=>{
      const back=tile.querySelector('.ah-gap-image-back .ah-gap-art');
      const front=tile.querySelector('.ah-gap-image-front .ah-gap-art');
      const prevBack=back.style.aspectRatio,prevFront=front.style.aspectRatio;
      back.style.aspectRatio='16 / 9';front.style.aspectRatio='16 / 9';
      const earlier=tile.querySelector('.ah-gap-image-back').getBoundingClientRect();
      const later=tile.querySelector('.ah-gap-image-front').getBoundingClientRect();
      const right=Math.max(0,Math.min(earlier.right,later.right)-Math.max(earlier.left,later.left));
      const down=Math.max(0,Math.min(earlier.bottom,later.bottom)-Math.max(earlier.top,later.top));
      const obscured=right*down/(earlier.width*earlier.height);
      const topExposed=later.top-earlier.top;
      back.style.aspectRatio=prevBack;front.style.aspectRatio=prevFront;
      return {obscured,topExposed,rightGap:tile.getBoundingClientRect().right-later.right};
    });
    assert.ok(widePair.obscured<0.4&&widePair.topExposed>=30,
      'Two full-size 16:9 artworks remain layered while less than 40% of the older bounds are covered: '+JSON.stringify(widePair));
    assert.ok(widePair.rightGap>=7&&widePair.rightGap<=18,
      'Reducing overlap does not change the previously accepted right-side spacing');
    await page.getByRole('button',{name:'向右滚动间隔成就展柜'}).click();
    await page.waitForFunction(()=>document.querySelector('.ah-gap-rail')?.scrollLeft>60);
    await page.getByRole('button',{name:'查看间隔最久成就详情'}).click();
    await page.locator('[data-achievement-gap="detail"]').waitFor();
    assert.ok(page.url().endsWith('#achievements/gaps'),'Interval detail is deep-linkable');
    assert.equal(await page.locator('.ah-gap-detail-card').count(),12,'Detail shows all chronological gap pairs');
    assert.equal(await page.locator('.ah-gap-achievement-condition').count(),24,
      'Both achievements of every time-gap pair display their unlock conditions');
    assert.equal(await page.locator('.ah-gap-detail-card').first().locator('[data-gap-side="earlier"] .ah-gap-achievement-condition').innerText(),
      '完成一次挑战。','Earlier achievement keeps its full unlock requirement');
    assert.equal(await page.locator('.ah-gap-detail-card').first().locator('[data-gap-side="later"] .ah-gap-achievement-condition').innerText(),
      '完成一次挑战。','Later achievement keeps its full unlock requirement');
    assert.ok(await page.locator('.ah-gap-detail-card').first().evaluate(el=>el.scrollWidth<=el.clientWidth+1),
      'Mobile achievement conditions do not cause horizontal overflow');
    assert.equal(await page.locator('.ah-gap-achievement-condition').first().evaluate(el=>getComputedStyle(el).textAlign),
      'center','Each unlock description is centered beneath the achievement name');
    const firstPairMeta=await page.locator('.ah-gap-detail-card').first().locator('.ah-gap-side-meta').evaluateAll(nodes=>nodes.map(el=>({
      rarity:el.querySelector('.ah-gap-side-rarity')?.textContent?.trim(),
      timestamp:el.querySelector('time')?.textContent?.trim(),
      order:[...el.children].map(child=>child.tagName.toLowerCase()),
      alignment:getComputedStyle(el).justifyContent,
      overflow:el.scrollWidth>el.clientWidth+1
    })));
    assert.equal(firstPairMeta.length,2,'Each achievement gets its own rarity and timestamp');
    assert.deepEqual(firstPairMeta.map(meta=>meta.rarity),['0%','9.9%'],
      'Each side shows its own original Xbox rarity before unlock date');
    assert.ok(firstPairMeta.every(meta=>meta.order.join(',')==='span,time'&&/^2026\.\d{2}\.\d{2} \d{2}:\d{2}$/.test(meta.timestamp||'')),
      'Rarity precedes the existing full timestamp in DOM order');
    assert.ok(firstPairMeta.every(meta=>meta.alignment==='center'&&!meta.overflow),
      'Rarity/date metadata stays centered without mobile overflow');

    assert.deepEqual(await page.locator('.ah-gap-detail-card').first().locator('[data-gap-side]').evaluateAll(nodes=>nodes.map(node=>node.dataset.gapSide)),
      ['earlier','later'],'Detail renders chronologically ordered achievements on two sides');
    assert.equal(await page.locator('.ah-gap-detail-duration strong').first().innerText(),'1.0',
      'Detail uses decimal day units');
    assert.equal(await page.locator('.ah-gap-detail-art.ah-rarity-gold').count(),24,
      'Both earned achievement images keep existing flowing gold rarity frames');
    await page.locator('.ah-gap-game-link').first().click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.getByRole('button',{name:'返回概览'}).click();
    await page.locator('[data-achievement-gap="preview"]').waitFor();
    assert.ok(['','#overview'].includes(await page.evaluate(()=>location.hash)),'Gap gallery detail returns to overview');
    await page.getByRole('button',{name:'查看全部成就热力图'}).click();
    await page.locator('.ah-month-card').first().waitFor();
    assert.equal(await page.locator('.ah-month-card').count(),59,'Month-by-month calendars cover 2022 through Nov 2026');
    assert.equal(await page.locator('.ah-month-card').first().getByRole('heading').innerText(),'2026 年 11 月');
    assert.equal(await page.locator('.ah-month-card .ah-month-played').count(),59,
      'Every monthly achievement calendar includes its own played-games list');
    assert.equal(await page.locator('.ah-month-card[data-month="11"][data-year="2026"] .ah-month-played-game').count(),1,
      'November includes the one game with a recorded positive playtime increase');
    assert.equal(await page.locator('.ah-month-card[data-month="10"][data-year="2026"] .ah-month-played-game').count(),12,
      'October combines lastPlayed evidence and unlocked achievements across all twelve games');
    assert.equal(await page.locator('.ah-month-card[data-month="10"][data-year="2026"] .ah-month-played-game .ah-month-played-cover').count(),12,
      'Monthly played rows each include their own square game cover');
    await page.locator('.ah-month-card[data-month="10"][data-year="2026"] .ah-month-played-game').first().click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    const monthDot=await page.locator('.ah-month-card .ah-cell .ah-dot').first().evaluate(el=>{
      const box=el.getBoundingClientRect(),button=el.parentElement.getBoundingClientRect();
      return {ratio:box.width/box.height,width:button.width,relative:box.width/button.width,radius:getComputedStyle(el).borderRadius};
    });
    assert.ok(Math.abs(monthDot.ratio-1)<.04&&monthDot.width>=27,'Monthly date tap targets remain touch-friendly');
    assert.equal(monthDot.radius,'50%','Month heatmap points are circular');
    assert.ok(monthDot.relative<.69&&monthDot.relative>.6,'Monthly circles are slightly inset');
    assert.equal(await page.locator('.ah-legend').count(),0,'Full heatmap no longer contains a color legend');
    assert.equal(await page.locator('.ah-full-history .ah-intro-block .ah-intro').count(),0,
      'Full heatmap has no introductory explanatory subtitle');
    assert.equal(await page.locator('.ah-overview-stats').count(),0,'Old four stat blocks are removed');
    assert.equal(await page.locator('[data-achievement-showcase="preview"],[data-achievement-gap="preview"]').count(),0,
      'Full heatmap only contains monthly calendars, not the two overview galleries');



    const yearNav=page.getByRole('navigation',{name:'按年份定位热力图'});
    await yearNav.getByRole('button',{name:'2024'}).click();
    await page.waitForFunction(()=>Math.abs(document.getElementById('ah-year-2024')?.getBoundingClientRect().top-85)<45);
    assert.equal(await yearNav.getByRole('button',{name:'2024'}).getAttribute('aria-current'),'location','Year anchor reflects the active year');
    const yearNavStyle=await yearNav.evaluate(el=>{
      const style=getComputedStyle(el),pill=getComputedStyle(el.querySelector('button'));
      return {position:style.position,background:style.backgroundColor,border:style.borderTopWidth,shadow:style.boxShadow,pillBackground:pill.backgroundColor};
    });
    assert.equal(yearNavStyle.position,'sticky','Year navigation remains sticky');
    assert.equal(yearNavStyle.background,'rgba(0, 0, 0, 0)','Year navigation has no enclosing background');
    assert.equal(yearNavStyle.border,'0px','Year navigation has no outer box border');
    assert.equal(yearNavStyle.shadow,'none','Year navigation has no outer box shadow');
    assert.notEqual(yearNavStyle.pillBackground,'rgba(0, 0, 0, 0)','Individual year pills remain distinguishable');
    await yearNav.getByRole('button',{name:'2026'}).click();
    await page.waitForFunction(()=>Math.abs(document.getElementById('ah-year-2026')?.getBoundingClientRect().top-85)<45);
    await page.getByRole('button',{name:'2026 年 10 月 27 日，解锁 11 个成就',exact:true}).click();
    const sheet=page.getByRole('dialog',{name:'2026 年 10 月 27 日 成就摘要'});
    await sheet.waitFor();
    assert.ok((await sheet.innerText()).includes('11'));
    assert.ok((await sheet.innerText()).includes('Test Game 1'));
    await sheet.getByRole('button',{name:/前一天 2026 年 10 月 26 日/}).click();
    const previousSheet=page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'});
    await previousSheet.waitFor();
    assert.equal(await page.locator('.ah-cell.is-selected').count(),1,'Day stepper keeps the calendar selection in sync');
    assert.equal(await previousSheet.getByRole('button',{name:'查看当天全部成就'}).isDisabled(),true,'Empty-day detail CTA is disabled');
    await previousSheet.getByRole('button',{name:/后一天 2026 年 10 月 27 日/}).click();
    await sheet.waitFor();
    await sheet.getByRole('button',{name:'查看当天全部成就'}).click();
    await page.locator('.ah-achievement-card').first().waitFor();
    assert.equal(await page.locator('.ah-achievement-card').count(),11,'All remaining October day unlocks across games appear');
    assert.ok(page.url().endsWith('#achievements/day/2026-10-27'),'Day detail is deep-linkable');
    assert.equal(await page.locator('.ah-achievement-card .ah-game-source').count(),11,'Each achievement identifies its original game');
    assert.equal(await page.locator('.ah-achievement-card time').first().innerText(),'20:24');
    await page.locator('.ah-achievement-art img').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.ah-achievement-art')?.classList.contains('ah-art-square'));
    const artFrame=await page.locator('.ah-achievement-art').first().evaluate(el=>{
      const r=el.getBoundingClientRect(),img=el.querySelector('img');return {ratio:r.width/r.height,fit:img?getComputedStyle(img).objectFit:null};
    });
    assert.ok(Math.abs(artFrame.ratio-1)<.04,'Square achievement art retains a square fitting frame');
    assert.equal(artFrame.fit,'contain','Achievement art is not cropped');
    assert.equal(await page.locator('.ah-day-detail .ah-achievement-card[data-rarity-tier="ultra"]').count(),11,'Remaining October daily unlocks share the ultra-rare tier');
    const dailyFrame=await page.locator('.ah-day-detail .ah-achievement-art.ah-rarity-ultra').first().evaluate(el=>({
      border:getComputedStyle(el).borderTopWidth,shine:getComputedStyle(el,'::after').animationName,
      fit:getComputedStyle(el.querySelector('img')).objectFit
    }));
    assert.equal(dailyFrame.border,'2px','Daily achievement uses gold outline');
    assert.ok(dailyFrame.shine.includes('ah-foil-orbit'),'Daily achievement inherits the animated frame');
    assert.equal(dailyFrame.fit,'contain','Daily achievement artwork remains uncropped');

    await page.getByRole('button',{name:/前一天 2026 年 10 月 26 日/}).click();
    assert.equal(await page.getByRole('heading',{name:'2026 年 10 月 26 日'}).count(),1);
    assert.ok((await page.locator('.ah-empty-day').innerText()).includes('没有'));
    await page.getByRole('button',{name:/后一天 2026 年 10 月 27 日/}).click();
    await page.locator('.ah-achievement-card').first().waitFor();
    await page.getByRole('button',{name:'成就排序'}).click();
    await page.getByRole('menu',{name:'成就排序方式'}).getByRole('menuitemradio',{name:'稀有度：低 → 高'}).click();
    await page.getByRole('button',{name:'成就排序'}).click();
    assert.equal(await page.getByRole('menu',{name:'成就排序方式'}).getByRole('menuitemradio',{name:'稀有度：低 → 高'}).getAttribute('aria-checked'),'true');
    await page.getByRole('button',{name:'成就排序'}).click();
    await page.locator('.ah-game-source').first().click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.getByRole('button',{name:/返回热力图/}).click();
    await page.locator('.ah-month-calendar').first().waitFor();
    assert.equal(await page.locator('.ah-cell.is-selected').count(),1,'Selected calendar date persists after returning');
    await page.getByRole('button',{name:/返回概览/}).click();
    await page.locator('.recent-game-card').first().waitFor();
    console.log((mobile?'Mobile':'Desktop')+': PASS circular dots, sticky year anchors, sheet date stepping, chronological/rarity sort and artwork fit');
    assert.equal(await page.locator('[data-overview-section="top"]').count(),0,'Most-played world section is removed entirely');
    assert.equal(await page.getByRole('heading',{name:'时光最多的世界'}).count(),0,'No obsolete heading survives');
    assert.equal(await page.locator('.top-card').count(),0,'No legacy most-played tiles remain');
    await page.locator('.recent-game-card').first().click();
    await page.getByRole('dialog').waitFor();
    const compactHeader=await page.locator('.dialog.game-detail').evaluate(dialog=>{
      const toolbar=dialog.querySelector('.dialog-toolbar').getBoundingClientRect();
      const panel=dialog.getBoundingClientRect();
      const cover=dialog.querySelector('.detail-cover').getBoundingClientRect();
      const close=dialog.querySelector('button.close').getBoundingClientRect();
      return {toolbarHeight:toolbar.height,coverOffset:cover.top-panel.top,closeTop:close.top,closeRight:close.right,panelRight:panel.right};
    });
    assert.ok(compactHeader.toolbarHeight<1,'Game detail has no empty toolbar height while Journey is disabled');
    assert.ok(compactHeader.coverOffset<55,'Game cover starts near the top, without an empty black band');
    assert.ok(Math.abs(compactHeader.panelRight-compactHeader.closeRight)<40,'Close floats at the top-right of game details');
    await page.locator('.dialog-body').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='2000px';el.append(spacer);el.scrollTop=el.scrollHeight;});
    const closeRect=await page.getByRole('button',{name:'关闭详情',exact:true}).boundingBox();
    assert.ok(closeRect&&Math.abs(closeRect.y-compactHeader.closeTop)<2,
      'Close remains fixed without an empty bar when the detail body scrolls');
    assert.ok(closeRect&&closeRect.y>=0&&closeRect.y+closeRect.height<(mobile?844:1000),'Close remains visible at the bottom of long details');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    console.log((mobile?'Mobile':'Desktop')+': PASS overview order without most-played carousel, recent game detail navigation and persistent close after long scroll');

    await page.locator('.recent-game-card .game-cover img').first().waitFor();
    await page.waitForFunction(()=>{const img=document.querySelector('.recent-game-card .game-cover img');return img?.complete&&img.naturalWidth>0;});
    const cover=await page.locator('.recent-game-card .game-cover').first().evaluate(el=>{
      const rect=el.getBoundingClientRect();
      const image=el.querySelector('img');
      return {width:rect.width,height:rect.height,fit:getComputedStyle(image).objectFit,source:image.currentSrc,naturalHeight:image.naturalHeight};
    });
    assert.ok(Math.abs(cover.width/cover.height-1)<.03,'Artwork uses a square frame');
    assert.equal(cover.fit,'cover','Mythic game covers must meet the border without letterboxing');
     const mythicEdges=await page.locator('.recent-game-card .completion-frame').first().evaluate(frame=>{
       const image=frame.querySelector('.cover-artwork'),outer=frame.getBoundingClientRect(),inner=image.getBoundingClientRect();
       const border=parseFloat(getComputedStyle(frame).borderTopWidth);
       return {top:inner.top-outer.top,left:inner.left-outer.left,right:outer.right-inner.right,bottom:outer.bottom-inner.bottom,border};
     });
     for(const edge of ['top','left','right','bottom'])
       assert.ok(Math.abs(mythicEdges[edge]-mythicEdges.border)<1.1,
         'Mythic '+edge+' edge touches the inner border (no black padding or baseline gap)');

    assert.ok(cover.source.endsWith('original.svg'),'Screen density must select the matching artwork');
    assert.ok(cover.naturalHeight>=cover.height*(mobile?3:2),'Artwork must have enough real pixels');
    await page.route('**/medium.svg',route=>route.abort());
    await page.route('**/original.svg',route=>route.abort());
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.recent-game-card .game-cover img')?.currentSrc.endsWith('square.svg'));
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
    await page.waitForFunction(()=>document.querySelector('.recent-game-card .game-cover img')?.currentSrc.endsWith('cached-480.svg'));
    await page.locator('.recent-game-card').first().click();
    await page.waitForFunction(()=>document.querySelector('.detail-cover .cover-artwork')?.currentSrc.endsWith('cached-1600.svg'));
    const hero=await page.locator('.detail-cover').evaluate(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,fallback:!!el.querySelector('.detail-backdrop'),fit:getComputedStyle(el.querySelector('.cover-artwork')).objectFit};});
    assert.ok(hero.ratio>1.7&&hero.ratio<1.85,'Detail cover must be widescreen');
    assert.ok(hero.fallback&&hero.fit==='contain','Square source uses unfitted artwork with a soft landscape backdrop');
    await page.locator('.achievement-image img').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.achievement-image img')?.currentSrc.endsWith('cached-award.svg'));
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.route('**/cached-*.svg',route=>route.abort());
    await unlock();
    await page.waitForFunction(()=>document.querySelector('.recent-game-card .game-cover img')?.currentSrc.endsWith('original.svg'));
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
    const wallEntry=page.getByRole('button',{name:'打开Mythic纪念墙'});
    await wallEntry.click();
    const showcase=page.getByRole('region',{name:'Mythic纪念墙展示柜'});
    await showcase.waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Mythic纪念墙'}).count(),0,
      'Library entry opens the cabinet, not the old full-size single-card carousel');
    const shelfGeometry=await showcase.locator('.mythic-showcase-grid').evaluate(grid=>{
      const columns=getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
      const cards=[...grid.querySelectorAll('.mythic-showcase-seat')].slice(0,columns+1).map(el=>el.getBoundingClientRect());
      return {columns,firstRow:cards.slice(0,columns).map(r=>r.top),
       secondRow:cards[columns].top,firstRowBottom:cards[0].bottom,
       gridWidth:grid.getBoundingClientRect().width,cardWidths:cards.map(r=>r.width)};
    });
    assert.equal(shelfGeometry.columns,mobile?2:3,
      'Phones display two larger collectibles per row; desktop retains three');
    assert.ok(shelfGeometry.firstRow.every(top=>Math.abs(top-shelfGeometry.firstRow[0])<1),
      'All collectibles in the first row are horizontally aligned');
    assert.ok(shelfGeometry.secondRow>shelfGeometry.firstRowBottom+3&&
      shelfGeometry.cardWidths.every(width=>width>(mobile?130:40)),
      'Additional collectibles flow into the next row without shrinking the mobile cards: '+JSON.stringify(shelfGeometry));
    assert.equal(await showcase.locator('.mythic-showcase-item').count(),12,
      'The cabinet shows all eligible Mythic games in completion-date order');
    assert.equal(await showcase.locator('.mythic-showcase-item').first().getAttribute('data-showcase-game'),'100',
      'The latest Mythic appears first in the showcase');
    assert.equal(await showcase.locator('.mythic-showcase-backdrop').first().getAttribute('loading'),'lazy',
      'The cabinet uses native lazy-loading for cinematic preview images');
    assert.ok((await showcase.locator('.mythic-showcase-backdrop').first().getAttribute('src')).endsWith('preview.svg'),
      'The wall uses the cached 480px screenshot rather than fetching the 1600px original for each thumbnail');
    const miniatureRing=await showcase.locator('.mythic-showcase-emblem').first().evaluate(el=>({
      background:getComputedStyle(el).backgroundColor,
      border:parseFloat(getComputedStyle(el).borderTopWidth)
    }));
    assert.equal(miniatureRing.background,'rgba(0, 0, 0, 0)',
      'Mythic showcase miniature also reveals its own scene through the medal ring');
    assert.ok(miniatureRing.border>=1,'Miniature keeps the original gold border');
    const showcaseContact=await showcase.locator('.mythic-showcase-item[data-showcase-game="100"]').evaluate(item=>{
      const cover=item.querySelector('.mythic-showcase-portrait');
      const medal=item.querySelector('.mythic-showcase-emblem');
      const poster=item.querySelector('.mythic-showcase-poster');
      const c=cover.getBoundingClientRect(),m=medal.getBoundingClientRect(),p=poster.getBoundingClientRect();
      return {mask:getComputedStyle(cover).webkitMaskImage,
        centerDelta:Math.abs((c.top+p.width*.3668)-(m.top+m.height/2)),
        centersAligned:Math.abs((c.left+c.right-m.left-m.right)/2)};
    });
    assert.ok(showcaseContact.mask.includes('radial-gradient')&&showcaseContact.mask.includes('transparent')||
      showcaseContact.mask.includes('radial-gradient')&&showcaseContact.mask.includes('rgba(0, 0, 0, 0)'),
      'Miniature cover has a precisely circular medal cutout, not a premature straight crop');
    assert.ok(showcaseContact.centerDelta<1.5&&showcaseContact.centersAligned<1.5,
      'Miniature rim cutout is aligned to the true foreground medal center: '+JSON.stringify(showcaseContact));
    await page.waitForFunction(()=>document.querySelector(
      '.mythic-showcase-item[data-showcase-game="100"]')?.getAttribute('data-poster-prepared')==='true');
    assert.equal(await showcase.locator('[data-showcase-game="100"]').getAttribute('data-poster-prepared'),'true',
      'The first visible collectible is fully predecoded before it is tapped');
    assert.ok((await showcase.locator('.mythic-showcase-item[data-showcase-game="100"] .mythic-showcase-player img').getAttribute('src')).endsWith('avatar-cached.svg'),
      'Small Mythic card prefers the cached Xbox avatar over the remote URL');
    const miniatureBrand=await showcase.locator('.mythic-showcase-item[data-showcase-game="100"] .mythic-showcase-signature').evaluate(el=>{
      const mark=el.querySelector('svg.mythic-xbox-mark');
      return {text:el.textContent?.trim(),icon:!!mark,viewBox:mark?.getAttribute('viewBox'),
        color:mark?getComputedStyle(mark).fill:null,images:el.querySelectorAll('img').length};
    });
    assert.deepEqual(miniatureBrand,{text:'XBOX PLAYLOG',icon:true,viewBox:'0 0 24 24',color:'rgb(155, 240, 11)',images:0},
      'Showcase signature uses the true inline Xbox sphere without a network-backed image');
    await showcase.getByRole('button',{name:'放大 Test Game 0 纪念卡'}).click();
    const posterWall=page.getByRole('dialog',{name:'Mythic纪念墙'});
    await posterWall.waitFor();
    assert.ok((await posterWall.locator('.mythic-poster.is-active .mythic-poster-avatar').getAttribute('src')).endsWith('avatar-cached.svg'),
      'Full-size Mythic card uses the cached gamerpic already warmed in the wall');
    assert.equal(await posterWall.getAttribute('data-transition'),'idle',
      'A cabinet thumbnail opens the full-size poster immediately, exactly like the game detail shortcut');
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'100',
      'The selected collectible is the fully rendered initial poster on the first modal frame');
    const posterBrand=await posterWall.locator('.mythic-poster.is-active .mythic-poster-brand').evaluate(el=>{
      const mark=el.querySelector('svg.mythic-xbox-mark');
      const rect=mark?.getBoundingClientRect();
      return {text:el.textContent?.trim(),icon:!!mark,viewBox:mark?.getAttribute('viewBox'),
        color:mark?getComputedStyle(mark).fill:null,images:el.querySelectorAll('img').length,
        visible:!!rect&&rect.width>0&&rect.height>0};
    });
    assert.deepEqual(posterBrand,{text:'XBOX PLAYLOG',icon:true,viewBox:'0 0 24 24',
      color:'rgb(155, 240, 11)',images:0,visible:true},
      'Full Mythic poster shows bundled official Xbox mark immediately without any image fetch');
    assert.equal(await page.locator('.mythic-flight-ghost,.mythic-showcase-poster.is-flight-source').count(),0,
      'Opening does not run a thumbnail flight, clone any art or wait for a cross-card handoff');
    assert.equal(await showcase.locator('.mythic-showcase-poster.is-primed').count(),0,
      'The shelf preview does not retain a pending animation state');
    const openingAppearance=await posterWall.locator('.mythic-poster.is-active').evaluate(card=>({
      visible:getComputedStyle(card).visibility,
      overlayVisible:getComputedStyle(card.closest('.mythic-wall-overlay')).visibility,
      frame:!!card.querySelector('.mythic-poster-ornament'),
      title:card.querySelector('.mythic-poster-title')?.textContent
    }));
    assert.equal(openingAppearance.visible,'visible',
      'The full collectible is visible as soon as the modal mounts');
    assert.equal(openingAppearance.overlayVisible,'visible');
    assert.ok(openingAppearance.frame&&openingAppearance.title==='Test Game 0',
      'Poster frame and selected game details render immediately, independent of media decode');
    // Images can finish loading after opening, like the existing game-detail
    // shortcut. They must never block opening the fullscreen card itself.
    await page.waitForFunction(()=>{
      const poster=document.querySelector('.mythic-wall-overlay .mythic-poster.is-active');
      return poster&&!poster.classList.contains('is-type-loading')&&
        poster.querySelector('.mythic-poster-backdrop')?.classList.contains('is-loaded')&&
        poster.querySelector('.mythic-poster-portrait img')?.classList.contains('is-loaded')&&
        poster.querySelector('.mythic-poster-emblem img')?.naturalWidth>0;
    });
    const galleryPosterBox=await posterWall.locator('.mythic-poster.is-active').boundingBox();
    const posterFrame=await posterWall.locator('.mythic-poster.is-active').evaluate(card=>{
      const measure=selector=>{
        const e=card.querySelector(selector),r=e.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height};
      };
      const emblem=card.querySelector('.mythic-poster-emblem');
      const img=emblem.querySelector('img'),style=getComputedStyle(img);
      const text=card.querySelector('.mythic-poster-title');
      return {card:measure('.mythic-poster-portrait'),emblem:measure('.mythic-poster-emblem'),
       badge:measure('.mythic-badge-art'),player:measure('.mythic-poster-player'),
       avatar:measure('.mythic-poster-avatar-frame'),
       achievement:measure('.mythic-poster-achievement-art'),badgeFit:style.objectFit,
       fontLoading:card.classList.contains('is-type-loading'),
       titleVisibility:getComputedStyle(text).visibility};
    });
    assert.ok(Math.abs(posterFrame.emblem.width-posterFrame.emblem.height)<1,
      'The main Mythic medal has an actual square frame, not a flattened percentage-height oval: '+
      JSON.stringify(posterFrame.emblem));
    const connectedRims=await posterWall.locator('.mythic-poster.is-active').evaluate(card=>{
      const c=card.querySelector('.mythic-poster-portrait').getBoundingClientRect();
      const m=card.querySelector('.mythic-poster-emblem').getBoundingClientRect();
      const poster=card.getBoundingClientRect();
      const coverR=c.width/2,medalR=m.width/2,centerGap=(m.top+medalR)-(c.top+coverR);
      const intersectionFromCover=(coverR*coverR-medalR*medalR+centerGap*centerGap)/(2*centerGap);
      return {mask:getComputedStyle(card.querySelector('.mythic-poster-portrait')).webkitMaskImage,
        coverR,medalR,centerGap,intersectionFromCover,
        centerDelta:Math.abs(c.top+poster.width*.39495-(m.top+medalR)),
        centersAligned:Math.abs((c.left+c.right-m.left-m.right)/2)};
    });
    assert.ok(connectedRims.mask.includes('radial-gradient'),
      'Full poster subtracts the overlapping medal circle from the upper gold portrait rim');
    assert.ok(connectedRims.centerGap<connectedRims.coverR+connectedRims.medalR&&
      connectedRims.centerGap>Math.abs(connectedRims.coverR-connectedRims.medalR),
      'Both circles intersect in two physical junctions');
    assert.ok(connectedRims.intersectionFromCover<connectedRims.coverR&&
      connectedRims.intersectionFromCover>connectedRims.coverR-connectedRims.medalR,
      'Gold cover rim continues downward into the meeting points instead of fading early');
    assert.ok(connectedRims.centerDelta<1.5&&connectedRims.centersAligned<1.5,
      'Radial mask exactly matches the front medal center on any screen width: '+JSON.stringify(connectedRims));
    assert.ok(Math.abs(posterFrame.badge.width-posterFrame.badge.height)<1&&posterFrame.badgeFit==='contain',
      'Original Mythic badge preserves its own aspect ratio inside the square frame');
    assert.ok(Math.abs(posterFrame.avatar.width-posterFrame.avatar.height)<1,
      'Player avatar reserves exactly the same width and height before its image loads');
    // Simulate a delayed Google Fonts response after the avatar is ready.
    // The stable frame and decoded player image must stay visible even while
    // the username and typography wait for their final font.
    const fontLoadingPlayer=await posterWall.locator('.mythic-poster.is-active').evaluate(card=>{
      const hadLoading=card.classList.contains('is-type-loading');
      card.classList.add('is-type-loading');
      const frame=card.querySelector('.mythic-poster-avatar-frame');
      const name=card.querySelector('.mythic-poster-player strong');
      const result={
        avatarVisibility:getComputedStyle(frame).visibility,
        nameVisibility:getComputedStyle(name).visibility,
        imagePriority:frame.querySelector('img').fetchPriority
      };
      if(!hadLoading)card.classList.remove('is-type-loading');
      return result;
    });
    assert.equal(fontLoadingPlayer.avatarVisibility,'visible',
      'The player avatar must never wait for Marcellus or Chinese fonts');
    assert.equal(fontLoadingPlayer.nameVisibility,'hidden',
      'The player name may wait for its font without affecting the avatar');
    assert.equal(fontLoadingPlayer.imagePriority,'high',
      'Player avatars should load ahead of the large screenshot artwork');
    assert.ok(Math.abs(posterFrame.card.width-posterFrame.card.height)<1&&
      Math.abs(posterFrame.achievement.width-posterFrame.achievement.height)<1,
      'Cover and achievement artwork occupy stable square frames');
    if(posterFrame.fontLoading)assert.equal(posterFrame.titleVisibility,'hidden',
      'Do not show a fallback title that will shift after the web font arrives');
    const galleryFooterHeight=await posterWall.locator('.mythic-wall-controls').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(await posterWall.locator('.mythic-poster-emblem .mythic-badge-placeholder').first().isVisible(),
      'Mythic badge keeps its fallback while the local file decodes');
    const badgeSource=await posterWall.locator('.mythic-poster-emblem .mythic-badge-art img').first().evaluate(el=>({
      src:el.getAttribute('src'),width:el.naturalWidth,height:el.naturalHeight,complete:el.complete
    }));
    assert.equal(badgeSource.src,'/xbox-playlog-pages/mythic-unlocked.png',
      'The medal loads from the same-origin project asset, never XCT');
    assert.equal(badgeSource.width,360,'Use original 360px square badge artwork');
    assert.equal(badgeSource.height,360,'Original badge has square intrinsic dimensions');
    const ringStyle=await posterWall.locator('.mythic-poster.is-active').evaluate(card=>{
      const outer=getComputedStyle(card.querySelector('.mythic-poster-emblem'));
      const backing=getComputedStyle(card.querySelector('.mythic-badge-art'));
      return {outer:outer.backgroundColor,inner:backing.backgroundColor,
        gradient:backing.backgroundImage,shadow:backing.boxShadow,
        gold:outer.borderTopColor,goldWidth:parseFloat(outer.borderTopWidth)};
    });
    assert.equal(ringStyle.outer,'rgba(0, 0, 0, 0)','Outer medal backing must reveal the game backdrop');
    assert.equal(ringStyle.inner,'rgba(0, 0, 0, 0)','Blue gradient ring must be truly transparent');
    assert.equal(ringStyle.gradient,'none','No leftover blue background image');
    assert.equal(ringStyle.shadow,'none','No blue inset shadow after removing the gradient');
    assert.ok(ringStyle.goldWidth>0&&ringStyle.gold!=='rgba(0, 0, 0, 0)',
      'The original metallic gold trim stays visible');
    const artSamples=await posterWall.locator('.mythic-poster.is-active .mythic-badge-art img').evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=360;canvas.height=360;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0);
      return [[180,12],[180,35],[180,75],[45,180],[180,180],[315,180],[180,345]]
        .map(([x,y])=>({x,y,rgba:[...ctx.getImageData(x,y,1,1).data]}));
    });
    assert.equal(artSamples[0].rgba[3],0,'Top of the existing PNG has real alpha so backdrop can show through');
    assert.equal(artSamples[6].rgba[3],0,'Bottom of the existing PNG has real alpha so backdrop can show through');
    assert.equal(artSamples[4].rgba[3],255,'Green center of the original medal remains fully opaque');
    assert.equal(externalMythicRequests.length,0,'No third-party Mythic image requests occur');
    // Replace only an already mounted cover with a deliberately delayed asset.
    // The entire postcard must keep exactly the same geometry during the gap.
    await page.route('https://covers.example.test/delayed-poster.svg',async route=>{
      await new Promise(resolve=>setTimeout(resolve,850));
      await route.fulfill({contentType:'image/svg+xml',body:
       '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#678"/></svg>'});
    });
    const stableGeometry=()=>posterWall.locator('.mythic-poster.is-active').evaluate(card=>{
      const selectors=['.mythic-poster','.mythic-poster-portrait','.mythic-poster-emblem',
       '.mythic-poster-congratulations','.mythic-poster-title','.mythic-poster-player',
       '.mythic-poster-avatar-frame',
       '.mythic-poster-achievement-pair','.mythic-poster-stats','.mythic-poster-footer'];
      return selectors.map(selector=>{
        const b=(selector==='.mythic-poster'?card:card.querySelector(selector)).getBoundingClientRect();
        return {selector,x:b.x,y:b.y,width:b.width,height:b.height};
      });
    });
    const beforeSlowArt=await stableGeometry();
    await posterWall.locator('.mythic-poster.is-active .mythic-poster-portrait img').evaluate(img=>{
      img.src='https://covers.example.test/delayed-poster.svg';
    });
    await page.waitForTimeout(1000);
    const afterSlowArt=await stableGeometry();
    for(let i=0;i<beforeSlowArt.length;i++)
      for(const k of ['x','y','width','height'])
        assert.ok(Math.abs(beforeSlowArt[i][k]-afterSlowArt[i][k])<1,
          'Delayed image decode must never change '+beforeSlowArt[i].selector+' '+k+': '+
           JSON.stringify({before:beforeSlowArt[i],after:afterSlowArt[i]}));
    await page.unroute('https://covers.example.test/delayed-poster.svg');
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'100',
      'The global entry opens the newest Mythic based on its verified completion date');
    assert.equal(await posterWall.locator('.mythic-poster.is-active .mythic-poster-title').innerText(),'Test Game 0',
      'The poster displays its game name without a platform tag');
    assert.equal(await posterWall.getAttribute('data-display-mode'),'wall',
      'Opening a cabinet card enters the existing swipeable full-size gallery');
    assert.equal(await posterWall.getAttribute('data-entry'),'showcase',
      'A selected showcase item does not trigger the game-detail single-card mode');
    assert.ok((await posterWall.locator('.mythic-poster-title').first().evaluate(el=>
      getComputedStyle(el).fontFamily)).includes('Marcellus'),
      'The Mythic collectible uses the chosen Marcellus serif for the game title');
    const posterBottomLayout=await posterWall.locator('.mythic-poster.is-active').evaluate(el=>{
      const card=el.getBoundingClientRect();
      const pad=el.querySelector('.mythic-poster-gamepad').getBoundingClientRect();
      const footer=el.querySelector('.mythic-poster-footer').getBoundingClientRect();
      return {padBottom:pad.bottom,cardBottom:card.bottom,footerBottom:footer.bottom,padTop:pad.top,cardHeight:card.height};
    });
    assert.ok(posterBottomLayout.padBottom<posterBottomLayout.cardBottom-posterBottomLayout.cardHeight*.018,
      'ABXY controls sit inside the engraved bottom frame instead of overlapping it');
    assert.ok(posterBottomLayout.padTop>=posterBottomLayout.footerBottom-2,
      'ABXY motifs have their own space below the XBOX Playlog footer: '+JSON.stringify(posterBottomLayout));
    const posterSections=await posterWall.locator('.mythic-poster.is-active').evaluate(el=>{
      const b=selector=>el.querySelector(selector).getBoundingClientRect();
      const pair=b('.mythic-poster-achievement-pair');
      const lastTime=el.querySelectorAll('.mythic-poster-achievement>span:last-child');
      const times=[...lastTime].map(t=>t.getBoundingClientRect());
      const stats=b('.mythic-poster-stats');
      const statLabels=[...el.querySelectorAll('.mythic-poster-stats>div>span')].map(t=>t.getBoundingClientRect());
      const footer=b('.mythic-poster-footer');
      const footerText=[...el.querySelectorAll('.mythic-poster-footer>span')].map(t=>t.getBoundingClientRect());
      const abxy=b('.mythic-poster-gamepad');
      return {pairBottom:pair.bottom,latestTimeBottom:Math.max(...times.map(t=>t.bottom)),
        statsTop:stats.top,statsBottom:stats.bottom,statsTextBottom:Math.max(...statLabels.map(t=>t.bottom)),
        footerTop:footer.top,footerBottom:footer.bottom,
        footerTextTop:Math.min(...footerText.map(t=>t.top)),footerTextBottom:Math.max(...footerText.map(t=>t.bottom)),
        abxyTop:abxy.top};
    });
    assert.ok(posterSections.latestTimeBottom<=posterSections.pairBottom+1,
      'Both unlocked-at times fit inside the achievement comparison card: '+JSON.stringify(posterSections));
    assert.ok(posterSections.pairBottom<=posterSections.statsTop+1,
      'Achievement card never overlaps the summary stats: '+JSON.stringify(posterSections));
    assert.ok(posterSections.statsTextBottom<=posterSections.statsBottom+1,
      'All three summary labels fit inside their statistics panel: '+JSON.stringify(posterSections));
    assert.ok(posterSections.statsBottom<=posterSections.footerTop+1,
      'The inscription starts below the statistics panel: '+JSON.stringify(posterSections));
    assert.ok(posterSections.footerTextTop>=posterSections.footerTop-1&&
      posterSections.footerTextBottom<=posterSections.footerBottom+1,
      'The visible XBOX Playlog text fits inside its dedicated inscription: '+JSON.stringify(posterSections));
    assert.ok(posterSections.footerBottom<=posterSections.abxyTop+1,
      'ABXY begins below the complete, unobscured inscription: '+JSON.stringify(posterSections));
    const centeredBrand=await posterWall.locator('.mythic-poster.is-active').evaluate(poster=>{
      const card=poster.getBoundingClientRect();
      const footer=poster.querySelector('.mythic-poster-footer');
      const brand=footer.querySelector('.mythic-poster-brand');
      const r=brand.getBoundingClientRect();
      return {text:footer.textContent?.trim(),items:footer.children.length,
        centerOffset:Math.abs((r.left+r.right)/2-(card.left+card.right)/2)};
    });
    assert.equal(centeredBrand.text,'XBOX PLAYLOG','The extra Mythic commemorative tagline is removed');
    assert.equal(centeredBrand.items,1,'Only Xbox Playlog remains in the caption');
    assert.ok(centeredBrand.centerOffset<1,'Xbox Playlog emblem and text are horizontally centered on the card: '+JSON.stringify(centeredBrand));
    assert.equal(await posterWall.locator('canvas.mythic-wall-fireworks').count(),1,
      'Only the initial opening creates the radial firework particle canvas');
    const posterBackdrop=posterWall.locator('.mythic-poster.is-active .mythic-poster-backdrop');
    assert.equal(await posterBackdrop.getAttribute('data-art-source'),'store-screenshot',
      'The first Australian Store Screenshot is displayed instead of a stretched square cover');
    const previewBackdrop=posterWall.locator('.mythic-poster.is-active .mythic-poster-backdrop-preview');
    assert.equal(await previewBackdrop.getAttribute('data-art-tier'),'preview');
    assert.ok((await previewBackdrop.getAttribute('style')).includes('preview.svg'),
      'The full-size poster immediately uses the small warmed image while HD decodes');
    assert.equal(await posterBackdrop.getAttribute('data-art-tier'),'full');
    await page.waitForFunction(()=>document.querySelector('.mythic-poster.is-active .mythic-poster-backdrop-preview')?.classList.contains('is-replaced'));
    assert.equal(await previewBackdrop.evaluate(el=>getComputedStyle(el).maskImage.includes('linear-gradient')),true,
      'Preview and HD use the same cinematic mask');
    const artStyle=await posterBackdrop.evaluate(el=>({
      background:getComputedStyle(el).backgroundImage,
      size:getComputedStyle(el).backgroundSize,
      height:el.getBoundingClientRect().height,
      cardHeight:el.closest('.mythic-poster').getBoundingClientRect().height
    }));
    assert.ok(artStyle.background.includes('landscape.svg'),'Uses the wide Xbox Store source');
    assert.equal(artStyle.size,'cover','The first Store Screenshot fills the extended cinematic artwork region');
    assert.ok(artStyle.height>artStyle.cardHeight*.45&&artStyle.height<artStyle.cardHeight*.50,
      'Screenshot spans roughly the upper half before its fade-out');
    const composition=await posterWall.locator('.mythic-poster.is-active').evaluate(el=>{
      const box=selector=>el.querySelector(selector).getBoundingClientRect();
      const card=el.getBoundingClientRect(),backdrop=box('.mythic-poster-backdrop');
      const greeting=box('.mythic-poster-congratulations'),title=box('.mythic-poster-title');
      const player=box('.mythic-poster-player'),pair=box('.mythic-poster-achievement-pair');
      return {backdropEnd:backdrop.bottom,greetingTop:greeting.top,greetingBottom:greeting.bottom,
        titleTop:title.top,titleBottom:title.bottom,playerTop:player.top,playerBottom:player.bottom,
        pairTop:pair.top,pairHeight:pair.height,cardHeight:card.height,
        faded:getComputedStyle(el.querySelector('.mythic-poster-backdrop')).maskImage.includes('linear-gradient')};
    });
    assert.ok(composition.faded&&composition.backdropEnd>composition.greetingTop,
      'The screenshot fades behind the area immediately above the Mythic congratulations');
    assert.ok(composition.greetingTop<artStyle.cardHeight*.42+
      await posterWall.locator('.mythic-poster.is-active').evaluate(el=>el.getBoundingClientRect().top),
      'The headline is brought up from the old top-heavy image zone');
    assert.ok(composition.greetingBottom<=composition.titleTop+1&&
      composition.titleBottom<=composition.playerTop+1&&composition.playerBottom<=composition.pairTop+1,
      'Editorial headline, game title, player identity and achievements have clear non-overlapping zones: '+
       JSON.stringify(composition));
    assert.ok(composition.pairHeight/composition.cardHeight>.168,
      'Achievement comparison gains vertical breathing room compared with the old poster');
    assert.equal(await posterWall.locator('.mythic-poster-ornament path[d*="Q17"]').count(),0,
      'Old curled spider-like corner ornaments are removed');
    const posterGeometry=await posterWall.locator('.mythic-poster.is-active').evaluate(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,vw:innerWidth,vh:innerHeight};
    });
    assert.ok(posterGeometry.left>=0&&posterGeometry.right<=posterGeometry.vw+1&&posterGeometry.top>=0&&posterGeometry.bottom<=posterGeometry.vh+1,
      'One vertical poster fits completely within mobile and desktop screens');
    await posterWall.getByRole('button',{name:'下一张Mythic纪念卡'}).click();
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'101');
    assert.equal(await posterWall.locator('canvas.mythic-wall-fireworks').count(),0,
      'Subsequent posters stop the one-off radial fireworks');
    assert.equal(await posterWall.locator('.mythic-poster.is-active .mythic-poster-backdrop').getAttribute('data-art-source'),'no-promotional-art',
      'Games without official landscape art do not stretch their tiny square cover into a backdrop');
    assert.ok(await posterWall.locator('.mythic-poster.is-active .mythic-poster-stars span').count()>5,
      'Subsequent posters retain ambient gold sparkles');
    const motionDurations=await posterWall.locator('.mythic-poster.is-active').evaluate(el=>({
      star:parseFloat(getComputedStyle(el.querySelector('.mythic-poster-stars span')).animationDuration),
      foil:parseFloat(getComputedStyle(el.querySelector('.mythic-poster-shimmer')).animationDuration)
    }));
    assert.ok(motionDurations.star<4&&Math.abs(motionDurations.foil-4.6)<.01,
      'Gold shimmer and pinlights should return more frequently than the old 5s / 13s cadence');
    await posterWall.getByRole('button',{name:'上一张Mythic纪念卡'}).click();
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'100');
    assert.equal(await posterWall.locator('canvas.mythic-wall-fireworks').count(),0,
      'Returning to the initial poster does not replay radial fireworks');
    if(mobile){
      await posterWall.locator('.mythic-wall-viewport').evaluate(el=>{
        const start=new Touch({identifier:1,target:el,clientX:310,clientY:400});
        const end=new Touch({identifier:1,target:el,clientX:95,clientY:407});
        el.dispatchEvent(new TouchEvent('touchstart',{touches:[start],changedTouches:[start],bubbles:true}));
        el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[end],bubbles:true}));
      });
      assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'101',
        'A horizontal swipe advances exactly one poster');
    }
    await posterWall.getByRole('button',{name:'返回展示柜'}).click();
    await posterWall.waitFor({state:'hidden'});
    assert.equal(await showcase.locator('.mythic-showcase-poster.is-flight-source').count(),0,
      'Closing returns to the cabinet immediately, without reverse flight');
    await showcase.waitFor();
    // Idle preparation must continue even while the user spends time inside the
    // first full-size collectible. A distant card is ready before scrolling to it.
    await page.waitForFunction(()=>document.querySelector(
      '.mythic-showcase-item[data-showcase-game="107"]')?.getAttribute('data-poster-prepared')==='true',
      null,{timeout:15000});
    assert.equal(await showcase.locator('[data-showcase-game="107"]').getAttribute('data-poster-prepared'),'true',
      'The wall prepares distant game art in the background, even without scrolling near that card');
    // Scroll deep into the cabinet, choose a non-first collectible and return
    // to precisely the same scroll offset after swiping the large poster.
    await showcase.locator('[data-showcase-game="107"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector(
      '.mythic-showcase-item[data-showcase-game="107"]')?.getAttribute('data-poster-prepared')==='true');
    const cabinetScroll=await showcase.evaluate(el=>el.scrollTop);
    await showcase.getByRole('button',{name:'放大 Test Game 7 纪念卡'}).click();
    await posterWall.waitFor();
    assert.equal(await posterWall.getAttribute('data-transition'),'idle',
      'A second game from a scrolled shelf also opens directly, without a loading transition');
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'107',
      'The selected cabinet card determines the initial full-size slide');
    assert.equal(await page.locator('.mythic-showcase-poster.is-flight-source,.mythic-flight-ghost').count(),0,
      'Second and later opens have no thumbnail flight or extra handoff');
    assert.equal(await posterWall.locator('canvas.mythic-wall-fireworks').count(),1,
      'Opening a non-first poster from the cabinet also triggers the initial fireworks');
    await posterWall.getByRole('button',{name:'下一张Mythic纪念卡'}).click();
    assert.equal(await posterWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),'108',
      'A selected card still permits swiping to the next collectible');
    assert.equal(await posterWall.locator('canvas.mythic-wall-fireworks').count(),0,
      'The celebration does not repeat during navigation');
    await posterWall.getByRole('button',{name:'返回展示柜'}).click();
    await posterWall.waitFor({state:'hidden'});
    const restoredScroll=await showcase.evaluate(el=>el.scrollTop);
    assert.ok(Math.abs(cabinetScroll-restoredScroll)<2,
      'Closing a full-size poster restores the exact cabinet scroll position');
    await showcase.getByRole('button',{name:'返回游戏库'}).click();
    await showcase.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await unlock('#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.getByRole('button',{name:'全部游戏',exact:true}).click();
    const libraryCard=page.locator('.library-games-panel .game-card').first();
    await libraryCard.waitFor();
    assert.equal(await page.locator('.title-row p').count(),0,
      'Game library no longer repeats counts below its page title');
    const liveLibraryCount=page.locator('.library-game-count');
    assert.equal((await liveLibraryCount.innerText()).trim(),'游戏数：12',
      'The sort/search row initially shows all 12 visible games');
    const countLayout=await page.locator('.library-toolbar-actions').evaluate(el=>{
      const row=el.getBoundingClientRect(),count=el.querySelector('.library-game-count').getBoundingClientRect();
      const sort=el.querySelector('.game-library-sort').getBoundingClientRect();
      const search=el.querySelector('.game-library-search').getBoundingClientRect();
      return {rowRight:row.right,countRight:count.right,countTop:count.top,
        sortTop:sort.top,searchRight:search.right,countLeft:count.left};
    });
    assert.ok(Math.abs(countLayout.countRight-countLayout.rowRight)<3,
      'Live game count pins to the far right of the sort/search row');
    assert.ok(Math.abs(countLayout.countTop-countLayout.sortTop)<13,
      'Live count shares a single row with sort and search');
    assert.ok(countLayout.searchRight<=countLayout.countLeft,
      'Count never overlaps the search control');
    // iPad landscape/portrait must use spare space for the progress track while
    // the existing mobile layout remains pixel-identical at the 700px breakpoint.
    const measureLibraryCard=()=>libraryCard.evaluate(el=>{
      const box=element=>{
        const r=element.getBoundingClientRect();
        return {left:r.left,right:r.right,width:r.width};
      };
      return {card:box(el),cover:box(el.querySelector('.game-art')),
        copy:box(el.querySelector('.game-copy')),progress:box(el.querySelector('.game-progress')),
        columns:getComputedStyle(el).gridTemplateColumns.split(/\s+/).length};
    });
    if(mobile){
      const measured=await measureLibraryCard();
      assert.equal(measured.columns,2,'Phone keeps its original two-column game library layout');
      assert.ok(Math.abs(measured.cover.width-112)<2,'Phone keeps its 112px game cover');
      assert.ok(measured.progress.left>=measured.cover.right-2,
        'Phone progress remains in the right information column, not stretched across the card');
    }else{
      for(const width of [1024,1408]){
        await page.setViewportSize({width,height:1000});
        const measured=await measureLibraryCard();
        assert.equal(measured.columns,3,'Tablet retains cover, details and progress columns');
        assert.ok(measured.progress.width>=(width===1024?210:330),
          'Tablet achievement progress expands into previously unused center space');
        assert.ok(measured.copy.right+12<=measured.progress.left,
          'Tablet progress and game title must not collide');
        assert.ok(measured.progress.right<=measured.card.right+2,
          'Tablet progress stays inside the game card');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,
          'Tablet game library has no horizontal overflow');
      }
      await page.setViewportSize({width:1440,height:1000});
    }
    console.log((mobile?'Mobile':'Tablet')+': PASS game library progress geometry and protected phone layout');
    // All game names stay white; completion bars return to site green.
    // The collectible Mythic frame keeps its original independent mint color.
    const progressPalette=await libraryCard.evaluate(card=>{
      const title=card.querySelector('.game-title');
      const cover=card.querySelector('.game-cover.completion-frame');
      const track=card.querySelector('.game-progress .progress');
      const fill=track?.querySelector(':scope>span');
      const original={
        title:getComputedStyle(title).color,
        frame:getComputedStyle(cover).borderTopColor,
        bar:getComputedStyle(fill).backgroundColor,
        fontSize:getComputedStyle(title).fontSize,
        fontWeight:getComputedStyle(title).fontWeight,
        titleWidth:title.getBoundingClientRect().width,
        titleHeight:title.getBoundingClientRect().height
      };
      track.classList.remove('complete');
      const incomplete=getComputedStyle(fill).backgroundColor;
      track.classList.add('complete');
      const restored=getComputedStyle(fill).backgroundColor;
      return {original,incomplete,restored,unusedMythicClass:card.classList.contains('is-mythic')};
    });
    assert.equal(progressPalette.original.frame,'rgb(166, 243, 200)',
      'Original Mythic badge frame color stays unchanged');
    assert.equal(progressPalette.original.title,'rgb(255, 255, 255)',
      'Mythic and Full game titles revert to the existing white');
    for(const color of [progressPalette.original.bar,progressPalette.incomplete,progressPalette.restored])
      assert.equal(color,'rgb(16, 124, 16)',
        'Complete and incomplete progress use Xbox official green');
    assert.equal(progressPalette.unusedMythicClass,false,
      'No longer need a Mythic-only styling override on game cards');
    assert.ok(progressPalette.original.fontSize&&progressPalette.original.fontWeight&&
      progressPalette.original.titleWidth>0&&progressPalette.original.titleHeight>0,
      'Game name typography and geometry stay intact');
    console.log((mobile?'Mobile':'Desktop')+': PASS white titles, mint Mythic frames and original green progress');
    
    // Full and Mythic share the same cover/badge geometry. The Full shimmer
    // must be clipped to the existing 2px rounded border, not a floating SVG
    // that can drift at different mobile/tablet/desktop cover sizes.
    const mythicFrame=page.locator('.game-card .game-cover.completion-frame').first();
    await mythicFrame.waitFor();
    await mythicFrame.evaluate(el=>el.classList.add('full-completion'));
    const frameStyle=()=>mythicFrame.evaluate(el=>{
      const original=getComputedStyle(el),shine=getComputedStyle(el,'::before');
      return {
        parentBorder:original.borderTopWidth,
        parentRadius:original.borderTopLeftRadius,
        glowInset:shine.top,
        glowPadding:shine.paddingTop,
        glowRadius:shine.borderTopLeftRadius,
        glowTransform:shine.transform,
        mask:shine.maskComposite,
        animation:shine.animationName,
        angle:parseFloat(shine.getPropertyValue('--full-border-angle')),
        coverBox:(()=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height}})()
      };
    });
    const fullBefore=await frameStyle();
    assert.equal(fullBefore.parentBorder,'2px','Full retains the original Mythic border thickness');
    assert.equal(fullBefore.glowInset,'-2px','The shine outer edge aligns to the real outer border');
    assert.equal(fullBefore.glowPadding,'2px','Gold light occupies exactly the same 2px border width');
    assert.equal(fullBefore.glowRadius,fullBefore.parentRadius,
      'The traveling highlight follows the existing rounded corners');
    assert.equal(fullBefore.glowTransform,'none','The gold layer never rotates or shifts off the rounded frame');
    assert.ok(fullBefore.mask.includes('exclude'),'Only the original border ring may receive gold light');
    assert.equal(fullBefore.animation,'full-border-flow','Full border has an active moving highlight');
    await page.waitForTimeout(210);
    const fullAfter=await frameStyle();
    assert.ok(Number.isFinite(fullBefore.angle)&&Number.isFinite(fullAfter.angle)&&
      Math.abs(fullAfter.angle-fullBefore.angle)>6,
      'The gold highlight visibly advances along the frame rather than staying fixed');
    assert.ok(Math.abs(fullBefore.coverBox.width-fullBefore.coverBox.height)<2,
      'Compact game artwork keeps its original square geometry');
    await mythicFrame.evaluate(el=>el.classList.remove('full-completion'));
    assert.equal(await mythicFrame.evaluate(el=>getComputedStyle(el,'::before').content),'none',
      'Mythic-only covers have no new shine overlay');
    console.log((mobile?'Mobile':'Desktop')+': PASS Full glow path tracks Mythic border precisely');
    const gameSort=page.getByRole('button',{name:'游戏排序',exact:true});
    const gameSearch=page.getByRole('button',{name:'搜索游戏',exact:true});
    assert.equal(await page.getByRole('searchbox',{name:'搜索游戏名称'}).count(),0,
      'Library search input is collapsed by default');
    const searchRowBefore=await page.locator('.library-toolbar-actions').evaluate(el=>{
      const row=el.getBoundingClientRect();
      const sort=el.querySelector('.game-library-sort')?.getBoundingClientRect();
      const button=el.querySelector('.game-library-search-toggle')?.getBoundingClientRect();
      return {top:row.top,height:row.height,right:row.right,sortRight:sort?.right,sortTop:sort?.top,buttonLeft:button?.left,buttonTop:button?.top};
    });
    assert.ok(searchRowBefore.buttonLeft>=searchRowBefore.sortRight,
      'Small search button sits immediately to the right of sorting');
    await gameSearch.click();
    const gameSearchInput=page.getByRole('searchbox',{name:'搜索游戏名称'});
    await gameSearchInput.waitFor();
    const searchRowAfter=await page.locator('.library-toolbar-actions').evaluate(el=>{
      const row=el.getBoundingClientRect();
      const sort=el.querySelector('.game-library-sort')?.getBoundingClientRect();
      const button=el.querySelector('.game-library-search-toggle')?.getBoundingClientRect();
      const field=el.querySelector('.game-library-search-field')?.getBoundingClientRect();
      const count=el.querySelector('.library-game-count')?.getBoundingClientRect();
      return {top:row.top,height:row.height,right:row.right,sortRight:sort?.right,
        sortTop:sort?.top,buttonLeft:button?.left,buttonTop:button?.top,
        fieldLeft:field?.left,fieldRight:field?.right,fieldTop:field?.top,
        countLeft:count?.left,countRight:count?.right};
    });
    assert.ok(Math.abs(searchRowAfter.height-searchRowBefore.height)<2&&
      Math.abs(searchRowAfter.buttonTop-searchRowAfter.sortTop)<6,
      'Expanding search does not create a dropdown or an extra toolbar row');
    assert.ok(Math.abs(searchRowAfter.buttonLeft-searchRowBefore.buttonLeft)<2&&
      searchRowAfter.fieldLeft>=searchRowAfter.sortRight&&
      searchRowAfter.fieldRight<=searchRowAfter.countLeft+1&&
      Math.abs(searchRowAfter.countRight-searchRowAfter.right)<3,
      'Search expands only up to the live count, without covering sorting');
    assert.equal(await gameSearch.getAttribute('aria-expanded'),'true');
    await gameSearchInput.fill('Test Game 0');
    await page.waitForFunction(()=>document.querySelector('.library-game-count')?.textContent==='游戏数：1');
    assert.equal(await page.locator('.library-games-panel .game-card').count(),1,
      'Search dynamically reduces the displayed game count');
    await gameSearchInput.press('Enter');
    await gameSearchInput.waitFor({state:'hidden'});
    assert.equal(await gameSearch.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('.toolbar').getByRole('button',{name:'CSV',exact:true}).count(),0,
      'The All Games toolbar no longer shows the CSV download action');
    assert.equal(await page.getByRole('combobox',{name:'排序游戏'}).count(),0,'The library no longer uses the browser-native sort select');
    await gameSort.focus();
    await gameSort.press('ArrowDown');
    let gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    await gameSortMenu.waitFor();
    const sharedGameSorts=['最近游玩','游玩时长','时间跨度：长 → 短','时间跨度：短 → 长'];
    const fullGameSorts=[...sharedGameSorts,'全成就日期：早 → 晚','全成就日期：晚 → 早'];
    const mythicGameSorts=[...sharedGameSorts,'Mythic 日期：早 → 晚','Mythic 日期：晚 → 早'];
    assert.deepEqual(await gameSortMenu.getByRole('menuitemradio').allTextContents(),sharedGameSorts,
      'All games exposes only recent play, playtime and time-span sorting');
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{name:'成就完成度'}).count(),0,
      'The obsolete completion-percentage sort is removed');
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'最近游玩',
      'Library sorting keeps the recent-play default');
    const libraryMenuBounds=await gameSortMenu.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,viewport:window.innerWidth};
    });
    assert.ok(libraryMenuBounds.left>=0&&libraryMenuBounds.right<=libraryMenuBounds.viewport,
      'The custom sort menu stays inside the viewport on desktop and mobile');
    assert.ok(libraryMenuBounds.height<=220,
      'The All games menu stays compact with only shared sort choices');
    await gameSortMenu.getByRole('menuitemradio',{name:'时间跨度：长 → 短'}).click();
    await gameSortMenu.waitFor({state:'hidden'});
    assert.equal(await page.locator('.game-card .game-time-span').first().innerText(),'时间跨度：1天');
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    await gameSortMenu.getByRole('menuitemradio',{name:'时间跨度：短 → 长'}).click();
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    await gameSortMenu.getByRole('menuitemradio',{name:'游玩时长'}).click();

    await page.locator('.filter-pills').getByRole('button',{name:'Mythic',exact:true}).click();
    assert.equal((await liveLibraryCount.innerText()).trim(),'游戏数：1',
      'Mythic count reflects current group and search');
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.deepEqual(await gameSortMenu.getByRole('menuitemradio').allTextContents(),mythicGameSorts,
      'Mythic adds only Mythic completion date sorting');
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'游玩时长',
      'Shared sort selections survive a group change');
    await gameSortMenu.getByRole('menuitemradio',{name:'Mythic 日期：晚 → 早'}).click();

    await page.locator('.filter-pills').getByRole('button',{name:'Full',exact:true}).click();
    assert.equal((await liveLibraryCount.innerText()).trim(),'游戏数：0',
      'Full count is zero when no games qualify');
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.deepEqual(await gameSortMenu.getByRole('menuitemradio').allTextContents(),fullGameSorts,
      'Full adds only Full completion date sorting');
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'最近游玩',
      'Switching from Mythic to Full resets the unavailable Mythic date sort');
    await gameSortMenu.getByRole('menuitemradio',{name:'全成就日期：早 → 晚'}).click();

    await page.locator('.filter-pills').getByRole('button',{name:'全部',exact:true}).click();
    assert.equal((await liveLibraryCount.innerText()).trim(),'游戏数：1',
      'Returning to All restores the search result count');
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.deepEqual(await gameSortMenu.getByRole('menuitemradio').allTextContents(),sharedGameSorts,
      'Returning to All hides both group-specific date sorts');
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'最近游玩',
      'Leaving Full resets its unavailable completion date sort');

    await page.locator('.filter-pills').getByRole('button',{name:'Mythic',exact:true}).click();
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'最近游玩');
    await gameSortMenu.getByRole('menuitemradio',{name:'Mythic 日期：晚 → 早'}).click();
    await page.locator('.filter-pills').getByRole('button',{name:'全部',exact:true}).click();
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.deepEqual(await gameSortMenu.getByRole('menuitemradio').allTextContents(),sharedGameSorts);
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'最近游玩',
      'Leaving Mythic resets its unavailable completion date sort');
    await gameSortMenu.getByRole('menuitemradio',{name:'游玩时长'}).click();
    await gameSort.click();
    gameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.equal(await gameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'游玩时长',
      'Selecting playtime sorting updates the custom selected state');
    await page.keyboard.press('Escape');
    assert.equal(await gameSort.getAttribute('aria-expanded'),'false');
    const beforeDetail=await page.evaluate(()=>window.scrollY);
    const chosenMythicId=await page.locator('.game-card').first().getAttribute('data-game-id');
    await page.locator('.game-card').first().click();
    await page.getByRole('dialog').waitFor();
    const medal=page.locator('.game-detail .detail-mythic-trigger');
    assert.equal(await medal.count(),1,'Completed Mythic details display the medal action');
    const medalPlacement=await medal.evaluate(el=>{
      const button=el.getBoundingClientRect(),summary=el.closest('.detail-summary');
      const row=summary.getBoundingClientRect();
      const stats=[...summary.querySelectorAll('.detail-stat')].map(item=>item.getBoundingClientRect());
      return {buttonRight:button.right,buttonLeft:button.left,buttonCenter:(button.top+button.bottom)/2,
       rowRight:row.right,rowLeft:row.left,rowCenter:(row.top+row.bottom)/2,statsCount:stats.length,
       lastStatRight:stats.at(-1).right,rowScrollWidth:summary.scrollWidth,rowClientWidth:summary.clientWidth,
       metricsRight:summary.querySelector('.detail-metrics').getBoundingClientRect().right,
       display:getComputedStyle(summary).display};
    });
    assert.equal(medalPlacement.display,'grid','Game stats and medal form a fixed two-zone grid');
    assert.equal(medalPlacement.statsCount,3,'The summary row retains all three game metrics');
    assert.ok(medalPlacement.buttonLeft>=medalPlacement.lastStatRight-1,
      'Mythic medal follows playtime, achievements and gamerscore');
    assert.ok(medalPlacement.buttonRight<=medalPlacement.rowRight+1&&medalPlacement.buttonLeft>=medalPlacement.rowLeft,
      'The far-right Mythic entry remains fully visible');
    assert.ok(Math.abs(medalPlacement.buttonRight-medalPlacement.rowRight)<2&&medalPlacement.buttonLeft>=medalPlacement.metricsRight-1,
      'The memorial button is pinned to the extreme right of the row, not pushed beyond the metrics');
    assert.ok(medalPlacement.rowScrollWidth<=medalPlacement.rowClientWidth+1,
      'All three stats and the Mythic entry fit without horizontal scrolling');
    assert.ok(Math.abs(medalPlacement.buttonCenter-medalPlacement.rowCenter)<3,
      'Mythic medal is vertically aligned with the summary metrics');
    assert.equal(await page.locator('.game-detail .detail-summary .detail-mythic-trigger').count(),1,
      'The single-game Mythic entry is placed at the right end of the metric row');
    assert.ok(await medal.locator('.mythic-badge-placeholder').isVisible(),
      'Detail action renders a fallback emblem without waiting for a network image');
    const stressedStats=await medal.evaluate(el=>{
      const summary=el.closest('.detail-summary'),metrics=summary.querySelector('.detail-metrics');
      const labels=[...metrics.querySelectorAll('.detail-stat > span')];
      const originals=labels.map(span=>span.textContent);
      ['123,456,789.0 小时','12,345,678/99,999,999','123,456,789/987,654,321'].forEach((value,i)=>{
        labels[i].textContent=value;
      });
      const box=summary.getBoundingClientRect(),button=el.getBoundingClientRect(),left=metrics.getBoundingClientRect();
      const result={summaryOverflow:summary.scrollWidth-summary.clientWidth,
       metricOverflow:metrics.scrollWidth-metrics.clientWidth,
       buttonRight:button.right,rowRight:box.right,buttonLeft:button.left,metricsRight:left.right,
       centerDifference:Math.abs((button.top+button.bottom-left.top-left.bottom)/2)};
      labels.forEach((span,i)=>span.textContent=originals[i]);
      return result;
    });
    assert.ok(stressedStats.metricOverflow>0,'Extra-large stats scroll inside the metrics area');
    assert.ok(stressedStats.summaryOverflow<=1,'Long values do not overflow the whole summary');
    assert.ok(Math.abs(stressedStats.rowRight-stressedStats.buttonRight)<2&&
      stressedStats.buttonLeft>=stressedStats.metricsRight-1&&stressedStats.centerDifference<3,
      'The Mythic action stays in the right-hand row cell even with huge numbers: '+JSON.stringify(stressedStats));
    if(mobile){
      const size=page.viewportSize();
      await page.setViewportSize({width:320,height:size.height});
      const narrow=await medal.evaluate(el=>{
        const row=el.closest('.detail-summary').getBoundingClientRect();
        const btn=el.getBoundingClientRect();
        return {rowRight:row.right,buttonRight:btn.right,
          rowLeft:row.left,buttonLeft:btn.left,viewport:innerWidth};
      });
      assert.ok(narrow.buttonRight<=narrow.viewport&&Math.abs(narrow.rowRight-narrow.buttonRight)<2,
        'Even at 320px the right-hand Mythic button is visible without page overflow: '+JSON.stringify(narrow));
      await page.setViewportSize(size);
    }
    await medal.click();
    const detailWall=page.getByRole('dialog',{name:'Mythic纪念卡'});
    await detailWall.waitFor();
    assert.equal(await detailWall.getAttribute('data-display-mode'),'single',
      'The detail launch enters single-poster mode, not the global memorial wall');
    assert.equal(await detailWall.locator('.mythic-poster.is-active').getAttribute('data-poster-game'),chosenMythicId,
      'The detail entry opens only the current game');
    assert.equal(await detailWall.locator('.mythic-poster').count(),1,
      'The detail mode never renders neighboring games');
    assert.equal(await detailWall.locator('.mythic-wall-controls').count(),0,
      'No navigation buttons or swiping UI are shown in the single-game memorial');
    const detailPosterBox=await detailWall.locator('.mythic-poster.is-active').boundingBox();
    const spacerHeight=await detailWall.locator('.mythic-wall-bottom-spacer').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(Math.abs(galleryFooterHeight-spacerHeight)<1,
      'Single poster reserves the gallery footer space to prevent vertical drift');
    for(const dimension of ['x','y','width','height']){
      assert.ok(Math.abs(galleryPosterBox[dimension]-detailPosterBox[dimension])<2,
        'Gallery and single-game cards have matching '+dimension+': '+
        JSON.stringify({gallery:galleryPosterBox,detail:detailPosterBox}));
    }
    assert.equal(await page.getByRole('dialog').count(),1,'The poster replaces the detail modal rather than stacking dialogs');
    await detailWall.getByRole('button',{name:'关闭Mythic纪念卡'}).click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    // Gamerscore shares Lucide's transparent, 2px stroke vocabulary and aligned 24px grid.
    const scoreSummary=page.locator('.game-detail .detail-gamerscore');
    assert.equal(await scoreSummary.count(),1);
    assert.equal(await scoreSummary.innerText(),'10/100','Gamerscore shows earned and total points');
    const iconStyle=await scoreSummary.locator('svg.gamerscore-icon').evaluate(svg=>{
      const path=svg.querySelector('path'),ring=svg.querySelector('circle'),box=svg.getBoundingClientRect(),outline=path?.getBBox();
      const group=svg.closest('.detail-summary');
      const trophy=group?.querySelector('svg.lucide-trophy');
      const computed=getComputedStyle(svg);
      return {
       size:box.width,iconHeight:box.height,ring:{present:!!ring,cx:ring?.getAttribute('cx'),cy:ring?.getAttribute('cy'),radius:ring?.getAttribute('r')},
       fill:svg.getAttribute('fill'),stroke:svg.getAttribute('stroke'),strokeWidth:svg.getAttribute('stroke-width'),
       pathFill:path?.getAttribute('fill'),hasPath:!!path,
       glyphCenter:outline?{x:outline.x+outline.width/2,y:outline.y+outline.height/2,width:outline.width,height:outline.height}:null,
       color:computed.color,trophyColor:trophy?getComputedStyle(trophy).color:null,
       hidden:svg.getAttribute('aria-hidden')
      };
    });
    assert.equal(iconStyle.size,mobile?15:16,'Summary G icon matches neighboring time/trophy icons');
    assert.equal(iconStyle.iconHeight,mobile?15:16);
    assert.deepEqual(iconStyle.ring,{present:true,cx:'12',cy:'12',radius:'10'},'The outlined badge retains a complete centered circle');
    assert.equal(iconStyle.fill,'none');
    assert.equal(iconStyle.stroke,'currentColor');
    assert.equal(iconStyle.strokeWidth,'2','G matches Lucide stroke weight');
    assert.ok(iconStyle.hasPath);
    assert.ok(iconStyle.glyphCenter&&Math.abs(iconStyle.glyphCenter.x-12)<.6&&Math.abs(iconStyle.glyphCenter.y-12)<.6,'G glyph is optically centered on the 24px grid');
    assert.ok(iconStyle.glyphCenter.height>=8&&iconStyle.glyphCenter.width/iconStyle.glyphCenter.height>.7,'G is upright and not vertically squashed');
    assert.equal(iconStyle.color,iconStyle.trophyColor,'G uses the same muted color as the other detail icons');
    assert.equal(iconStyle.hidden,'true');
    const scoreRows=await page.locator('.achievement').evaluateAll(rows=>rows.map(row=>{
      const badge=row.querySelector('.achievement-points'),svg=badge?.querySelector('svg.gamerscore-icon');
      return {points:badge?.textContent??null,icon:!!svg,align:badge?Math.abs(badge.getBoundingClientRect().top+badge.getBoundingClientRect().height/2-svg.getBoundingClientRect().top-svg.getBoundingClientRect().height/2):null};
    }));
    assert.deepEqual(scoreRows.map(x=>x.points),['20','10',null,'15'],'Only positive point values display, without G text');
    assert.deepEqual(scoreRows.map(x=>x.icon),[true,true,false,true]);
    assert.ok(scoreRows.filter(x=>x.icon).every(x=>x.align<2),'G badges are vertically centered next to point values');
    const achievementLayout=await page.locator('.achievement').evaluateAll(rows=>rows.map(row=>{
      const image=row.querySelector('.achievement-image'),title=row.querySelector('h4'),description=row.querySelector('.achievement-description'),rarity=row.querySelector('.achievement-rarity');
      const rect=image.getBoundingClientRect();
      return {imageWidth:rect.width,imageRatio:rect.width/rect.height,fit:getComputedStyle(image.querySelector('img')).objectFit,titleSize:parseFloat(getComputedStyle(title).fontSize),descriptionSize:parseFloat(getComputedStyle(description).fontSize),sameRow:Math.abs(description.getBoundingClientRect().top-rarity.getBoundingClientRect().top)<1,tier:rarity.getAttribute('data-rarity-tier'),icon:rarity.querySelector('svg')?.getAttribute('class'),fits:row.scrollWidth<=row.clientWidth+1};
    }));
    assert.deepEqual(achievementLayout.map(a=>a.tier),['rare','rare','common',null]);
    // Award rarity remains icon + number only. Unlock state uses the art itself,
    // without adding labels to the artwork or green/gray stripes to card edges.
    const unlockLooks=await page.locator('.game-detail .achievement').evaluateAll(rows=>rows.map(row=>{
      const image=row.querySelector('.achievement-image');
      const artwork=image?.querySelector('img');
      const rarity=row.querySelector('.achievement-rarity');
      return {
        locked:row.classList.contains('locked'),
        filter:artwork?getComputedStyle(artwork).filter:null,
        frameOpacity:getComputedStyle(image).opacity,
        rarityText:rarity?.textContent?.trim(),
        rarityIcon:!!rarity?.querySelector('svg'),
        imageStatusLabels:image?.querySelectorAll('.achievement-unlock,.achievement-status-badge').length
      };
    }));
    assert.deepEqual(unlockLooks.map(x=>x.locked),[false,false,true,true]);
    assert.ok(unlockLooks.filter(x=>!x.locked).every(x=>x.filter==='none'),
      'Unlocked achievement artwork stays fully colored');
    assert.ok(unlockLooks.filter(x=>x.locked).every(x=>x.filter.includes('grayscale(1)')&&x.filter.includes('brightness(0.7)')&&x.frameOpacity==='1'),
      'Locked art alone becomes grayscale/dimmer; frame and rarity information remain visible');
    assert.ok(unlockLooks.every(x=>x.rarityIcon&&/^(?:\d+(?:\.\d+)?%|—)$/.test(x.rarityText)),
      'Rarity keeps its icon plus value, without adding a visible rarity label');
    assert.ok(unlockLooks.every(x=>x.imageStatusLabels===0),
      'Artwork stays free of lock/unlock badges and corner overlays');
    const goldLocked=await page.locator('.game-detail .achievement[data-achievement-id="2"]').evaluate(row=>{
      row.classList.add('locked');
      const frame=row.querySelector('.achievement-image');
      const result={border:getComputedStyle(frame).borderTopWidth,shine:getComputedStyle(frame,'::after').animationName};
      row.classList.remove('locked');
      return result;
    });
    assert.equal(goldLocked.border,'2px','Locked rare artwork retains its existing gold border');
    assert.equal(goldLocked.shine,'none','Locked rare artwork no longer animates its foil glow');

    assert.deepEqual(await page.locator('.game-detail .achievement').evaluateAll(rows=>rows.map(el=>el.dataset.frameTier)),
      ['rare','ultra','common','common'],'Game achievements use strict 1% / 10% frame tiers');
    const frameResult=await page.locator('.game-detail .achievement-image.ah-rarity-gold').first().evaluate(el=>({
      border:getComputedStyle(el).borderTopWidth,
      shine:getComputedStyle(el,'::after').animationName,
      fit:getComputedStyle(el.querySelector('img')).objectFit
    }));
    assert.equal(frameResult.border,'2px','Game achievement gilding matches the showcase');
    assert.ok(frameResult.shine.includes('ah-foil-orbit'),'Game detail inherits flowing gold foil');
    assert.equal(frameResult.fit,'contain','Game detail retains uncropped achievement images');
    assert.equal(await page.locator('.game-detail .achievement-image.ah-rarity-common').count(),2,'Standard and unknown achievements retain gray frames');
    const detailCardBackgrounds=await page.locator('.game-detail .achievement').evaluateAll(rows=>rows.map(el=>({
      tier:el.getAttribute('data-frame-tier'),
      color:getComputedStyle(el).backgroundColor,
      image:getComputedStyle(el).backgroundImage,
      artworkBorder:getComputedStyle(el.querySelector('.achievement-image')).borderTopWidth
    })));
    const standardCard=detailCardBackgrounds.find(card=>card.tier==='common');
    assert.ok(standardCard,'Test fixture includes standard game-detail achievements');
    for(const card of detailCardBackgrounds.filter(card=>card.tier==='rare'||card.tier==='ultra')){
      assert.equal(card.color,standardCard.color,
        'Rare and ultra-rare achievements use the same raised background color as standard cards');
      assert.ok(card.image.includes('gradient'),
        'Rare achievement cards retain their warm gradient accent');
      assert.equal(card.artworkBorder,'2px',
        'Rare achievement artwork still has its metal rarity frame');
    }
    assert.equal(standardCard.color,'rgb(34, 34, 34)',
      'Game-detail achievement cards use the raised surface rather than the dialog background');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.game-detail .achievement-image.ah-rarity-gold').first().evaluate(el=>getComputedStyle(el,'::after').animationName),
      'none','Reduced motion disables the universal gilt animation');
    await page.emulateMedia({reducedMotion:'no-preference'});

    const achievementIds=()=>page.locator('.achievement').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-achievement-id')));
    assert.deepEqual(await achievementIds(),['2','1','3','4'],'All-classes tab sorts achievements globally, newest first');
    const progressCard=page.locator('.game-detail .achievement[data-achievement-id="3"]');
    assert.equal(await progressCard.locator('.achievement-progress-value').innerText(),'80%');
    assert.equal(await progressCard.getByRole('progressbar',{name:'成就完成进度'}).getAttribute('aria-valuenow'),'80');
    const grayscale=await progressCard.evaluate(el=>{
      const label=el.querySelector('.achievement-progress-value');
      const lock=el.querySelector('.achievement-unlock');
      const track=el.querySelector('.achievement-progress-track');
      const fill=track?.firstElementChild;
      return {label:getComputedStyle(label).color,locked:getComputedStyle(lock).color,
        fill:getComputedStyle(fill).backgroundColor,track:getComputedStyle(track).backgroundColor,
        fillWidth:fill.getBoundingClientRect().width,trackWidth:track.getBoundingClientRect().width};
    });
    assert.equal(grayscale.label,grayscale.locked,'Percentage matches the muted unlocked-status gray');
    assert.ok(grayscale.fillWidth>0&&Math.abs(grayscale.fillWidth/grayscale.trackWidth-.8)<.02,'Track fills 80%');
    assert.equal(grayscale.fill,'rgb(16, 124, 16)',
      'Official locked-achievement completion bar uses Xbox official green');
    assert.ok(grayscale.fill!==grayscale.track,'Green fill contrasts with original dark-gray track');
    const detailCompletionFill=page.locator('.game-detail .detail-achievement-section>.progress>span');
    assert.equal(await detailCompletionFill.evaluate(el=>getComputedStyle(el).backgroundColor),
      'rgb(16, 124, 16)','Game detail completion summary uses Xbox official green');
    assert.equal(await page.locator('.game-detail .achievement[data-achievement-id="4"] .achievement-progress-track').count(),0,
      'Locked awards without official progress have no placeholder zero bar');
    assert.equal(await page.locator('.game-detail .achievement:not(.locked) .achievement-progress-track').count(),0,
      'Unlocked awards never have a progress bar');
    assert.equal(await page.locator('.game-detail .eyebrow').count(),0,'GAME DETAILS heading is removed');
    assert.equal(await page.locator('.game-detail .detail-achievements').innerText(),'2/4','Achievement count drops redundant suffix');
    assert.deepEqual(await page.locator('.detail-summary .detail-stat').allTextContents(),['1 小时','2/4','10/100']);
    const summaryLayout=await page.locator('.detail-summary .detail-stat').evaluateAll(nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};
    }));
    assert.equal(summaryLayout.length,3);
    assert.ok(summaryLayout.every(s=>Math.abs(s.y-summaryLayout[0].y)<2),'All three metrics share a single row');
    assert.ok(summaryLayout[2].right<=(await page.locator('.detail-summary').boundingBox()).x+(await page.locator('.detail-summary').boundingBox()).width+1,'Stats fit viewport width');
    const tabs=page.getByRole('tablist',{name:'成就分类'});
    assert.deepEqual(await tabs.getByRole('tab').allTextContents(),['全部成就','本体成就','DLC成就']);
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/4');
    assert.equal(await page.locator('.achievement-group').count(),1,'One sorted list rather than separate base/DLC section blocks');
    assert.equal(await page.locator('.achievement-group').getAttribute('data-group-id'),'all');
    for(const [sort,expected] of [['date-asc',['1','2','3','4']],['rarity-asc',['1','2','3','4']],['rarity-desc',['3','2','1','4']],['date-desc',['2','1','3','4']]]){
      await page.getByRole('button',{name:'成就排序',exact:true}).click();
      const popup=page.getByRole('menu',{name:'成就排序方式'});
      await popup.waitFor();
      assert.equal(await page.locator('.game-detail .achievement-sort-menu select').count(),0,'Sort popup is custom rather than a browser native select');
      await popup.getByRole('menuitemradio',{name:({'date-asc':'解锁时间：旧 → 新','date-desc':'解锁时间：新 → 旧','rarity-asc':'稀有度：低 → 高','rarity-desc':'稀有度：高 → 低'})[sort]}).click();
      await popup.waitFor({state:'hidden'});
      assert.deepEqual(await achievementIds(),expected);
    }

    // Game-detail unlock filters use the same menu behavior and styling as sorting.
    const filterToggle=page.getByRole('button',{name:'成就筛选',exact:true});
    await filterToggle.click();
    let filterMenu=page.getByRole('menu',{name:'成就筛选方式'});
    assert.deepEqual(await filterMenu.getByRole('menuitemradio').allTextContents(),['全部','已解锁','未解锁']);
    assert.equal(await filterMenu.getByRole('menuitemradio',{checked:true}).innerText(),'全部');
    await filterMenu.getByRole('menuitemradio',{name:'已解锁'}).click();
    // The menu restores focus to its trigger. This must not leave the old
    // global accent :focus-within outline stuck on a touched iOS filter button.
    const filterFocus=await filterToggle.evaluate(el=>({
      focused:el.matches(':focus-within'),
      outline:getComputedStyle(el).outlineStyle,
      expanded:el.getAttribute('aria-expanded')
    }));
    assert.equal(filterFocus.focused,true,'Menu returns focus to its accessible trigger');
    assert.equal(filterFocus.expanded,'false','Selecting a filter closes the popup');
    assert.equal(filterFocus.outline,'none','Closed filter has no persistent green focus outline');
    assert.deepEqual(await achievementIds(),['2','1'],'Unlocked filter preserves the chosen date order');
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/4','Status filter does not alter overall completion count');
    await filterToggle.click();
    filterMenu=page.getByRole('menu',{name:'成就筛选方式'});
    await filterMenu.getByRole('menuitemradio',{name:'未解锁'}).click();
    assert.deepEqual(await achievementIds(),['3','4'],'Locked filter excludes earned achievements');
    assert.equal(await page.locator('.achievement-list').getAttribute('data-unlock-filter'),'locked');
    await page.getByRole('button',{name:'成就排序',exact:true}).click();
    let lockedSortMenu=page.getByRole('menu',{name:'成就排序方式'});
    assert.deepEqual(await lockedSortMenu.getByRole('menuitemradio').allTextContents(),
      ['稀有度：低 → 高','稀有度：高 → 低'],'Locked achievements have rarity-only sort choices');
    assert.equal(await lockedSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'稀有度：低 → 高',
      'Switching from date sort automatically picks rarity ascending');
    await lockedSortMenu.getByRole('menuitemradio',{name:'稀有度：高 → 低'}).click();
    assert.equal(await page.getByRole('button',{name:'成就排序',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none',
      'Sorting also leaves no persistent accent outline after its menu closes');
    assert.deepEqual(await achievementIds(),['3','4'],'Unknown rarity stays at end in locked-only mode');
    await tabs.getByRole('tab',{name:'本体成就'}).click();
    assert.equal(await page.locator('.achievement').count(),0,'Locked-only base category has no achievements in fixture');
    assert.ok(await page.locator('.achievement-filter-empty').isVisible(),'Empty filter results have an explanation');
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/2',
      'Empty filtered view still shows the base completion summary');
    await tabs.getByRole('tab',{name:'DLC成就'}).click();
    assert.deepEqual(await achievementIds(),['3','4'],'Locked filter composes with DLC category');
    await tabs.getByRole('tab',{name:'全部成就'}).click();
    await filterToggle.click();
    filterMenu=page.getByRole('menu',{name:'成就筛选方式'});
    await filterMenu.getByRole('menuitemradio',{name:'全部'}).click();
    await page.getByRole('button',{name:'成就排序',exact:true}).click();
    lockedSortMenu=page.getByRole('menu',{name:'成就排序方式'});
    assert.equal(await lockedSortMenu.getByRole('menuitemradio').count(),4,
      'Restoring all achievements restores both time-based sort choices');
    await lockedSortMenu.getByRole('menuitemradio',{name:'解锁时间：新 → 旧'}).click();
    assert.deepEqual(await achievementIds(),['2','1','3','4'],'All-classes ordering returns to normal');
    const detailFilterLayout=await page.locator('.achievement-sort-row').evaluate(el=>{
      const toggles=[...el.querySelectorAll('.achievement-sort-toggle')].map(node=>node.getBoundingClientRect());
      const count=el.querySelector('.achievement-filter-count').getBoundingClientRect();
      return {sortBeforeFilter:toggles[0].x<toggles[1].x,filterBeforeCount:toggles[1].right<count.x,
       sameLine:Math.abs(toggles[0].y-toggles[1].y)<2,
       noOverflow:el.scrollWidth<=el.clientWidth+1};
    });
    assert.ok(detailFilterLayout.sortBeforeFilter&&detailFilterLayout.filterBeforeCount&&
      detailFilterLayout.sameLine&&detailFilterLayout.noOverflow,
      'Sort, filter, and count fit in the expected one-row order on desktop and mobile');
    await tabs.getByRole('tab',{name:'本体成就'}).click();
    assert.deepEqual(await achievementIds(),['2','1']);
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/2');
    assert.equal(await page.locator('.achievement-group').getAttribute('data-group-id'),'base');
    assert.equal(await page.getByRole('progressbar',{name:'当前成就分类完成度'}).getAttribute('aria-valuenow'),'100');
    await tabs.getByRole('tab',{name:'DLC成就'}).click();
    assert.deepEqual(await achievementIds(),['3','4']);
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'0/2');
    assert.equal(await page.getByRole('progressbar',{name:'当前成就分类完成度'}).getAttribute('aria-valuenow'),'0');
    await tabs.getByRole('tab',{name:'全部成就'}).click();
    assert.deepEqual(await achievementIds(),['2','1','3','4']);
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/4');
    assert.equal(await page.getByRole('progressbar',{name:'当前成就分类完成度'}).getAttribute('aria-valuenow'),'50');
    // Compact sort selector occupies the same horizontal line as the current completion count.
    const sortRow=await page.locator('.achievement-sort-row').evaluate(el=>{
      const a=el.querySelector('.achievement-sort-toggle').getBoundingClientRect(),b=el.querySelector('.achievement-filter-count').getBoundingClientRect();
      const hasMythic=!!el.querySelector('.detail-mythic-trigger');
      return {sameLine:hasMythic?Math.abs(a.bottom-b.bottom)<3:Math.abs((a.y+a.height/2)-(b.y+b.height/2))<2,
       leftFirst:a.x<b.x,sortText:el.querySelector('.achievement-sort-toggle span').textContent};
    });
    assert.equal(sortRow.sameLine,true);
    assert.equal(sortRow.leftFirst,true);
    assert.equal(sortRow.sortText,'排序');
    await page.getByRole('button',{name:'成就排序',exact:true}).click();
    const sortMenu=page.getByRole('menu',{name:'成就排序方式'});
    const selectedItem=sortMenu.getByRole('menuitemradio',{checked:true});
    assert.equal(await selectedItem.count(),1);
    const selectedStyles=await selectedItem.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,outline:getComputedStyle(el).outlineStyle,px:parseFloat(getComputedStyle(el).paddingLeft)}));
    assert.equal(selectedStyles.bg,'rgb(57, 57, 57)','Selected item uses grey background without a yellow border');
    assert.equal(selectedStyles.outline,'none');
    assert.ok(selectedStyles.px>=14,'Hover/select item leaves enough left and right padding');
    await page.keyboard.press('ArrowDown');
    assert.ok(await sortMenu.getByRole('menuitemradio').nth(1).evaluate(el=>document.activeElement===el),'Arrow keys navigate sorting choices');
    await page.keyboard.press('Escape');
    await sortMenu.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'成就排序'}).getAttribute('aria-expanded'),'false');
    const tabPadding=await tabs.getByRole('tab').first().evaluate(el=>parseFloat(getComputedStyle(el).paddingInlineStart));
    assert.ok(tabPadding>=16,'Tab hover area has comfortable horizontal padding');
    console.log((mobile?'Mobile':'Desktop')+': PASS categorized tabs, aggregate counters, interactive sorting, and unified summary row');
    for(const row of achievementLayout){
      assert.ok(row.imageWidth>=(mobile?93:145),'Thumbnail retains a readable widescreen size');
      assert.ok(Math.abs(row.imageRatio-16/9)<.06,'Achievement thumbnail uses 16:9');
      assert.equal(row.fit,'contain','Achievement art is never distorted or cropped');
      assert.ok(row.titleSize>row.descriptionSize);
      assert.equal(row.sameRow,!mobile,'Inline rarity on desktop, stacked rarity on mobile');
      assert.ok(row.fits);
    }
    assert.ok(achievementLayout[0].icon.includes('gem'));
    assert.ok(achievementLayout[2].icon.includes('trophy'));
    assert.ok(!(await page.getByRole('dialog').innerText()).includes('玩家解锁'));
    console.log((mobile?'Mobile':'Desktop')+': PASS achievement image size, typography, inline rarity, 0/9.9/10 thresholds, unknown rarity and long wrapping');

    // Journey is unpublished pending redesign. Keep the underlying code, but no
    // route or button may expose it in either desktop or mobile game details.
    assert.equal(await page.getByRole('group',{name:'详情页面切换'}).count(),0,
      'The game journey view switch is not available on the production UI');
    assert.equal(await page.getByRole('button',{name:'游戏历程'}).count(),0,
      'No game journey entry can be clicked');
    assert.equal(await page.locator('.game-journey-content').count(),0,
      'The game journey is not mounted while disabled');
    await tabs.getByRole('tab',{name:'本体成就'}).click();
    assert.equal(await page.locator('.achievement-group').getAttribute('data-group-id'),'base',
      'The original game detail category controls remain functional');
    assert.equal(await page.getByRole('dialog').count(),1,
      'The existing game details open normally');
    console.log((mobile?'Mobile':'Desktop')+': PASS unpublished game journey and intact original details');

    await page.goBack();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const persistedGameSort=page.getByRole('button',{name:'游戏排序',exact:true});
    await persistedGameSort.click();
    const persistedGameSortMenu=page.getByRole('menu',{name:'游戏排序方式'});
    assert.equal(await persistedGameSortMenu.getByRole('menuitemradio',{checked:true}).innerText(),'游玩时长',
      'The chosen library sort persists when navigating back from a game detail');
    await page.keyboard.press('Escape');
    assert.equal(await persistedGameSort.getAttribute('aria-expanded'),'false');
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,beforeDetail);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
    const restoredSearch=page.getByRole('button',{name:'搜索游戏',exact:true});
    await restoredSearch.click();
    assert.equal(await page.getByRole('searchbox',{name:'搜索游戏名称'}).inputValue(),'Test Game 0',
      'The search query persists while collapsed and across game details');
    await page.getByRole('searchbox',{name:'搜索游戏名称'}).press('Escape');
    assert.equal(await restoredSearch.getAttribute('aria-expanded'),'false');
    await restoredSearch.click();
    await page.getByRole('button',{name:'清空游戏搜索',exact:true}).click();
    assert.equal(await page.getByRole('searchbox',{name:'搜索游戏名称'}).inputValue(),'');
    await page.getByRole('searchbox',{name:'搜索游戏名称'}).fill('Test Game 1');
    await page.locator('.game-library-sort .achievement-sort-toggle').click();
    assert.equal(await restoredSearch.getAttribute('aria-expanded'),'false',
      'Clicking the adjacent sort button dismisses the inline search');
    await page.keyboard.press('Escape');
    
    // Hiding is a reversible encrypted display preference, independent of fresh sync snapshots.
    const manageDisplay=async()=>{
      assert.equal(await page.locator('.toolbar').getByRole('button',{name:'管理展示',exact:true}).count(),0,
        'There is no entry for managing visibility in the game library toolbar');
      await switchMainTab('管理');
      await page.locator('[data-page="manage"]').getByRole('button',{name:'管理展示',exact:true}).click();
    };
    const returnToLibrary=async()=>{
      await switchMainTab('游戏库');
      await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    };
    await manageDisplay();
    assert.equal(await page.getByText('只管理 Xbox 明确标记可见的游戏。',{exact:false}).count(),0,
      'The long display-scope explanation is removed from the Manage Display dialog');
    const displayChoices=page.locator('.display-game-choice');
    assert.ok(await displayChoices.count()>0,'Manage Display shows the available games');
    assert.equal(await displayChoices.locator('.display-game-cover').count(),await displayChoices.count(),
      'Every managed game has a compact cover before its name');
    assert.equal(await displayChoices.locator('.display-game-cover + .display-game-name').count(),await displayChoices.count(),
      'Game covers appear immediately before their corresponding names');
    assert.equal(await displayChoices.locator('.display-game-cover img').count(),await displayChoices.count(),
      'The managed-game thumbnails use the existing game artwork');
    const displayCoverBounds=await displayChoices.first().locator('.display-game-cover').evaluate(el=>{
      const r=el.getBoundingClientRect();return {width:r.width,height:r.height};
    });
    assert.ok(displayCoverBounds.width>=34&&displayCoverBounds.width<=41&&Math.abs(displayCoverBounds.width-displayCoverBounds.height)<1,
      'Manage Display uses small square cover thumbnails on desktop and mobile');
    if(mobile){
      const fonts=await page.locator('input:not([type="checkbox"]):not([type="file"]),select,textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({label:el.getAttribute('aria-label'),size:parseFloat(getComputedStyle(el).fontSize)})));
      assert.ok(fonts.length>=1,'Manager search is still visible in its relocated dialog');assert.ok(fonts.every(f=>f.size>=16),JSON.stringify(fonts));
      console.log('Mobile: PASS >=16px text for relocated manager search and selection controls; pinch zoom preserved');
    }
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await returnToLibrary();
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),0);
    await switchMainTab('概览');
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
    await returnToLibrary();
    assert.equal(await page.locator('.game-card').count(),12);
    await manageDisplay();
    for(const checkbox of await page.locator('.display-game-choice input').all())await checkbox.uncheck();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await returnToLibrary();
    await page.getByRole('heading',{name:'所有游戏已隐藏',exact:true}).waitFor();
    await manageDisplay();
    await page.getByRole('button',{name:'全部展示',exact:true}).click();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await returnToLibrary();
    assert.equal(await page.locator('.game-card').count(),12);
    await manageDisplay();
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await returnToLibrary();
    assert.equal(await page.locator('.game-card[data-game-id="101"]').count(),1,'Cancel keeps the saved selection');
    console.log((mobile?'Mobile':'Desktop')+': PASS encrypted hide/restore preferences, unchanged statistics, new snapshot persistence, hide-all recovery and cancel');
    // Official Xbox hiding is independent from reversible local preferences.
    const officialPayload=await decryptVault(envelope,password);
    officialPayload.records[0].source='Xbox';
    for(const game of officialPayload.records[0].games)game.officialHidden=false;
    officialPayload.records[0].games.find(g=>g.id==='102').officialHidden=true;
    delete officialPayload.records[0].games.find(g=>g.id==='103').officialHidden;
    activeEnvelope=await encryptVault(officialPayload,password);
    await unlock('#library');
    await page.locator('.game-card').first().waitFor();
    assert.equal(await page.locator('.game-card[data-game-id="102"]').count(),0,'Officially hidden game is not listed');
    assert.equal(await page.locator('.game-card[data-game-id="103"]').count(),0,'Missing official visibility also hides the game');
    assert.equal(await page.locator('.game-card').count(),10,'Only explicit official-visible games appear');
    await manageDisplay();
    assert.equal(await page.getByRole('checkbox',{name:'显示 Test Game 2',exact:true}).count(),0,'Officially hidden game is not manageable');
    assert.equal(await page.getByRole('checkbox',{name:'显示 Test Game 3',exact:true}).count(),0,'Missing visibility title also excluded from manager');
    assert.equal(await page.locator('.display-game-choice').count(),10,'Manager only contains explicit official-visible games');
    await page.getByRole('checkbox',{name:'显示 Test Game 1',exact:true}).uncheck();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await returnToLibrary();
    await page.locator('.game-card[data-game-id="101"]').waitFor({state:'detached'});
    assert.equal(await page.locator('.game-card').count(),9,'Manual hiding applies to remaining official-visible games');
    await switchMainTab('概览');
    assert.equal(await page.locator('.stats').innerText(),statsBeforeHiding,'Official and local hiding never change totals');
    await switchMainTab('游戏库');
    await manageDisplay();
    await page.getByRole('button',{name:'全部展示',exact:true}).click();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.getByRole('dialog',{name:'游戏库显示管理',exact:true}).waitFor({state:'hidden'});
    await returnToLibrary();
    await page.locator('.game-card[data-game-id="101"]').waitFor();
    activeEnvelope=envelope;
    await unlock('#library');
    await page.locator('.game-card').first().waitFor();
    assert.equal(await page.locator('.game-card').count(),12,'Officially unhidden game returns when Xbox snapshot updates');
    console.log((mobile?'Mobile':'Desktop')+': PASS official hiding, manual hiding, history totals and unhide restoration through Management');
    // When the title has no verified base/DLC classification, there are no tabs.
    const uncategorized=await decryptVault(envelope,password);
    const noGroup=uncategorized.records[0].games.find(g=>g.id==='101');
    noGroup.groupStatus='unavailable';delete noGroup.groups;
    activeEnvelope=await encryptVault(uncategorized,password);
    await unlock('#library');
    await page.locator('.game-card[data-game-id="101"]').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('tablist',{name:'成就分类'}).count(),0,'No classification means no category tabs');
    assert.equal(await page.locator('.achievement-sort-row').count(),1,'Sorting is directly under summary when there are no tabs');
    assert.equal(await page.locator('.achievement-filter-count').innerText(),'2/4');
    assert.equal(await page.locator('.achievement-list .achievement').count(),4);
    await page.getByRole('button',{name:'成就排序'}).click();
    await page.getByRole('menu',{name:'成就排序方式'}).getByRole('menuitemradio',{name:'解锁时间：旧 → 新'}).click();
    assert.deepEqual(await page.locator('.achievement').evaluateAll(rows=>rows.map(r=>r.dataset.achievementId)),['1','2','3','4']);
    await page.getByRole('button',{name:'关闭详情'}).click();
    activeEnvelope=envelope;
    await unlock('#library');
    console.log((mobile?'Mobile':'Desktop')+': PASS unclassified game omits tabs and retains functional sort and completion');
    if(mobile){
      const firePull=async({startX=180,endX=180,startY=95,endY=255}={})=>{
        await page.evaluate(({startX,endX,startY,endY})=>{
          const send=(type,x,y,ending=false)=>{
            const point=new Touch({identifier:1,target:document.body,clientX:x,clientY:y});
            window.dispatchEvent(new TouchEvent(type,{
              touches:ending?[]:[point],changedTouches:[point],bubbles:true,cancelable:true
            }));
          };
          send('touchstart',startX,startY);
          send('touchmove',endX,endY);
          send('touchend',endX,endY,true);
        },{startX,endX,startY,endY});
      };
      // This fixture may be too short for a wheel gesture to show the
      // auto-hidden nav. Trigger its real React click handler directly.
      await page.locator('nav.mobile-nav button').first().evaluate(button=>button.click());
      await page.locator('.recent-game-card').first().waitFor();
      await page.evaluate(()=>window.scrollTo(0,0));
      await firePull({endX:340,endY:104});
      assert.equal(await page.locator('[data-pull-refresh="refreshing"]').count(),0,
        'Horizontal swipes at top must not start refresh');
      const updated=await decryptVault(envelope,password);
      updated.records[0].at='2026-11-02T01:00:00Z';
      updated.records[0].games[0].minutes=180;
      activeEnvelope=await encryptVault(updated,password);
      await firePull();
      await page.locator('.recent-game-card').first().getByText('累计游玩 3 h').waitFor();
      assert.equal(await page.locator('[data-pull-refresh="done"]').count(),1,
        'Pull-to-refresh updates new encrypted Xbox data without reloading or locking the page');
      assert.ok(page.url().endsWith('#overview'),'In-place data refresh preserves the active page');
      assert.equal(await page.locator('input[type="password"]').count(),0,'Pulling never requests the password again');
      activeEnvelope=envelope;
      await unlock('#library');
      console.log('Mobile: PASS top pull, horizontal swipe guard and encrypted data update without sign-in');
    }
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
    if(mobile){
      // Simulate a release published while the PWA is open. The version
      // mismatch reloads the shell, and explicit remembered-device consent
      // restores the unlock automatically after navigation.
      await page.route('**/version.json?check=*',route=>route.fulfill({json:{version:'new-release-test'}}));
      await page.evaluate(()=>{
        window.scrollTo(0,0);
        const make=(type,y,end=false)=>{
          const point=new Touch({identifier:1,target:document.body,clientX:160,clientY:y});
          window.dispatchEvent(new TouchEvent(type,{touches:end?[]:[point],changedTouches:[point],bubbles:true,cancelable:true}));
        };
        make('touchstart',80);make('touchmove',250);make('touchend',250,true);
      });
      await page.waitForEvent('framenavigated',{timeout:18000});
      await page.getByRole('button',{name:'锁定档案',exact:true}).waitFor();
      assert.equal(await page.locator('input[type="password"]').count(),0,
        'New release automatically reloads and restores explicitly remembered login');
      await page.unroute('**/version.json?check=*');
      console.log('Mobile: PASS PWA version upgrade via pull without another login');
    }
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
    await page.getByRole('button',{name:'锁定档案',exact:true}).waitFor();
    await page.locator('.game-card, .recent-game-card').first().waitFor();
    assert.ok(await page.locator('.game-card, .recent-game-card').count()>0,
      'A password rotation in the cloud cannot lock the user out of previously decrypted encrypted history');
    await page.getByText('最新云端档案暂时无法读取',{exact:false}).waitFor();
    // When no valid cached archive remains, a remembered old password must not unlock new cloud ciphertext.
    await clearCachedEnvelope();
    await page.reload();
    await page.locator('input[type="password"]').waitFor();
    await page.getByRole('alert').filter({hasText:'记住的密码已失效'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log((mobile?'Mobile':'Desktop')+': PASS all games, browser back/forward, back button, scroll restoration, direct link fallback, full-frame high resolution covers with working image fallback, remembered unlock, fresh encrypted snapshot, lock, expiry, changed password');
    await context.close();
  }
}finally{await browser?.close();server.kill();}
