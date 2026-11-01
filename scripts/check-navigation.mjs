import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAchievementPage} from './exophase-page.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault,decryptVault} from '../src/crypto.ts';
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',image2x:'https://covers.example.test/medium.svg',image3x:'https://covers.example.test/original.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
for(const game of games)game.achievements=[0,9.9,10,null].map((rarity,i)=>({id:String(i+1),points:[10,20,0,15][i],name:i===1?'Very long achievement name to check readable wrapping on mobile':'Achievement '+i,description:i===2?'这是一段很长的成就描述，用来验证它能与稀有度并排，内容自动换行且不挤出屏幕。':'完成一次挑战。',image:i===1?'https://covers.example.test/wide.svg':'https://covers.example.test/square.svg',unlocked:i<2,unlockedAt:i<2?(i===0?'2026-10-27T12:24:00.000Z':'2026-10-28T12:24:00.000Z'):null,rarity}));
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
      const wide=route.request().url().endsWith('/wide.svg');
      // Slightly rectangular originals simulate the Cyberpunk 2077 Mythic frame gap.
      const width=original?1920:medium?480:wide?160:64,height=wide?90:original?1800:width;
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
    async function switchMainTab(name){
      if(mobile){
        await page.mouse.wheel(0,130);
        await page.waitForFunction(()=>document.querySelector('.mobile-nav')?.classList.contains('is-visible'));
      }
      await page.getByRole('button',{name,exact:true}).click();
    }
    await unlock();
    await page.locator('.recent-game-card').first().waitFor();
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
    assert.equal(pwa.manifest.name,'XBOX Playlog','Installed app uses the exact requested brand name');
    assert.equal(pwa.manifest.short_name,'XBOX Playlog','Home screen label matches the brand');
    assert.equal(await page.title(),'XBOX Playlog','Website title matches installed brand');
    assert.ok((await page.locator('aside .brand').innerText()).includes('XBOX Playlog'),'Sidebar uses the new brand');
    const iconHref=await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    assert.ok(iconHref?.endsWith('/xbox-playlog-pages/apple-touch-icon-v2.png'),
      'iOS home screen icon uses the explicit updated subpath URL');
    for(const [file,size] of [['pwa-192-v2.png',192],['pwa-512-v2.png',512],['apple-touch-icon-v2.png',180]]){
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
      assert.equal(await page.locator('.mobile-nav.is-visible').count(),0,'Switching tabs hides the nav again');
      await switchMainTab('概览');
      await page.locator('[data-overview-section="recent"]').waitFor();
      console.log('Mobile: PASS four bottom tabs hidden initially, reveal on scroll, auto-hide and navigate');
    }
    const recent=page.locator('[data-overview-section="recent"]');
    assert.equal(await recent.locator('.recent-game-card').count(),10,'Overview renders ten latest games in one horizontal rail');
    assert.equal(await recent.locator('.game-card').count(),0,'Recent games are not the old multi-line list');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-title').innerText(),'Test Game 0');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress strong').innerText(),'50%',
      'Combined base + DLC progress displays 2 / 4 = 50%, not base-only Mythic 100%');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress-track').getAttribute('aria-valuenow'),'50');
    assert.equal((await recent.locator('.recent-game-card').first().locator('.recent-game-hours').innerText()).trim(),'· 1 h',
      'Recently played cards append cumulative hours directly after 50% without moving completion');
    assert.equal(await recent.locator('.recent-game-card .recent-game-hours').count(),10,
      'Every recent game, including unmeasured ones, has a consistent time slot');
    assert.equal(await recent.locator('.recent-game-card').first().locator('.recent-game-progress').evaluate(el=>getComputedStyle(el).display),'flex',
      'Completion percentage and lifetime hours share one compact row');
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
    assert.deepEqual(await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection)),['heatmap','recent','showcases','top','stats']);
    assert.equal(await page.locator('.ah-preview-grid .ah-preview-cell').count(),30,'Overview shows only 30 days');
    assert.equal(await page.locator('.ah-preview-weekdays span').count(),7,'Overview has explicit Monday-Sunday weekday labels');
    assert.equal(await page.locator('.ah-preview-axis').count(),0,'Overview omits explanatory direction text');
    assert.equal(await page.locator('[data-overview-section="heatmap"] .ah-month-played').count(),1,
      'Overview heatmap has the monthly played section beneath its calendar');
    assert.equal((await page.locator('[data-overview-section="heatmap"] .ah-month-played-title').innerText()).replace(/\s+/g,' ').trim(),'本月在玩 0 款',
      'November has no confirmed playing records in the example, so no games are invented');
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
      const summary=el.querySelector('.ah-sheet-total').getBoundingClientRect();
      const icon=el.querySelector('.ah-sheet-game .ah-mini-art').getBoundingClientRect();
      return {gamesBottom:games.bottom,summaryTop:summary.top,iconWidth:icon.width};
    });
    assert.ok(placement.gamesBottom<placement.summaryTop,'Per-game summary is above overall totals');
    assert.ok(placement.iconWidth>=50,'Game artwork is visibly larger in day sheet');
    assert.equal(await overviewSheet.locator('.ah-sheet-game-count').count(),3,
      'Only the date half-sheet shows per-game completion followed by hours');
    assert.equal((await overviewSheet.locator('.ah-sheet-game-count').first().innerText()).replace(/\\s+/g,' ').trim(),'1 个 · — 小时',
      'Pre-November day cannot invent game-play hours, but shows an explicit unknown slot');
    assert.equal(await page.locator('.ah-day-detail .ah-sheet-game-hours').count(),0,
      'Full day details never add the new hour label');
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
      assert.ok(rect&&rect.y>250&&rect.y<650,'Home preview opens a lower-half mobile sheet');
    }
    await overviewSheet.getByRole('button',{name:/前一天 2026 年 10 月 26 日/}).click();
    await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).waitFor();
    assert.ok((await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).innerText()).includes('0'));
    await page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'}).getByRole('button',{name:/后一天 2026 年 10 月 27 日/}).click();
    await overviewSheet.waitFor();
    await page.locator('.ah-sheet-backdrop').click({position:{x:10,y:10}});
    await overviewSheet.waitFor({state:'hidden'});
    // Both TOP100 galleries now live between Recent Games and the time-played panel.
    const overviewOrder=await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection));
    assert.deepEqual(overviewOrder,['heatmap','recent','showcases','top','stats'],
      'The achievement cabinets sit immediately after Recent Games on the overview');
    assert.equal(await page.locator('.ah-home-showcases > .ah-showcase').count(),2,
      'Overview contains exactly two achievement cabinets');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-tile').count(),24,'Showcase previews each eligible earned achievement in one horizontal rail');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-rarity-value').count(),24,
      'Every rare achievement thumbnail includes its global unlock percentage beneath the picture');
    assert.equal((await page.locator('.ah-showcase-rarity-value').first().innerText()).trim(),'0%',
      'Rarest visible achievement displays 0% unlock rate');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-top-label').innerText(),'TOP 100',
      'Rarity display shows the expanded TOP 100 capacity');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-foot').locator('span').count(),0,
      'Rarity showcase footer has no redundant explanation');
    assert.equal(await page.locator('[data-achievement-showcase="preview"] .ah-showcase-foot').evaluate(el=>getComputedStyle(el).justifyContent),
      'flex-end','Rarity showcase arrows stay right-aligned');

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
    assert.equal(await page.locator('[data-achievement-gap="preview"] .ah-showcase-foot').evaluate(el=>getComputedStyle(el).justifyContent),
      'flex-end','Gap showcase arrows stay right-aligned');

    assert.equal((await page.locator('.ah-gap-tile-duration').first().innerText()).replace(/\s+/g,' ').trim(),'间隔 1.0 天',
      'Gap previews show one-decimal elapsed days');
    const pairArtwork=await page.locator('.ah-gap-tile').first().evaluate(card=>{
      const older=card.querySelector('.ah-gap-image-back').getBoundingClientRect();
      const newer=card.querySelector('.ah-gap-image-front').getBoundingClientRect();
      return {olderLeft:older.left,olderRight:older.right,newerLeft:newer.left,newerTop:newer.top,olderTop:older.top};
    });
    assert.ok(pairArtwork.newerLeft>pairArtwork.olderLeft && pairArtwork.newerLeft<pairArtwork.olderRight,
      'The two achievement pictures overlap but the earlier picture remains visible');
    assert.ok(pairArtwork.newerTop>pairArtwork.olderTop,'Later award overlaps at a lower layer position');
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
    assert.ok(firstPairMeta.every(meta=>meta.order.join(',')==='span,time'&&meta.timestamp?.includes('2026.10.')),
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
    assert.equal(await page.locator('.ah-month-card[data-month="11"][data-year="2026"] .ah-month-played-game').count(),0,
      'November correctly has no dated Xbox play activity in the test data');
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
    await page.getByRole('button',{name:'2026 年 10 月 27 日，解锁 12 个成就',exact:true}).click();
    const sheet=page.getByRole('dialog',{name:'2026 年 10 月 27 日 成就摘要'});
    await sheet.waitFor();
    assert.ok((await sheet.innerText()).includes('12'));
    assert.ok((await sheet.innerText()).includes('Test Game 0'));
    await sheet.getByRole('button',{name:/前一天 2026 年 10 月 26 日/}).click();
    const previousSheet=page.getByRole('dialog',{name:'2026 年 10 月 26 日 成就摘要'});
    await previousSheet.waitFor();
    assert.equal(await page.locator('.ah-cell.is-selected').count(),1,'Day stepper keeps the calendar selection in sync');
    assert.equal(await previousSheet.getByRole('button',{name:'查看当天全部成就'}).isDisabled(),true,'Empty-day detail CTA is disabled');
    await previousSheet.getByRole('button',{name:/后一天 2026 年 10 月 27 日/}).click();
    await sheet.waitFor();
    await sheet.getByRole('button',{name:'查看当天全部成就'}).click();
    await page.locator('.ah-achievement-card').first().waitFor();
    assert.equal(await page.locator('.ah-achievement-card').count(),12,'All day unlocks across games appear');
    assert.ok(page.url().endsWith('#achievements/day/2026-10-27'),'Day detail is deep-linkable');
    assert.equal(await page.locator('.ah-achievement-card .ah-game-source').count(),12,'Each achievement identifies its original game');
    assert.equal(await page.locator('.ah-achievement-card time').first().innerText(),'20:24');
    await page.locator('.ah-achievement-art img').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.ah-achievement-art')?.classList.contains('ah-art-square'));
    const artFrame=await page.locator('.ah-achievement-art').first().evaluate(el=>{
      const r=el.getBoundingClientRect(),img=el.querySelector('img');return {ratio:r.width/r.height,fit:img?getComputedStyle(img).objectFit:null};
    });
    assert.ok(Math.abs(artFrame.ratio-1)<.04,'Square achievement art retains a square fitting frame');
    assert.equal(artFrame.fit,'contain','Achievement art is not cropped');
    assert.equal(await page.locator('.ah-day-detail .ah-achievement-card[data-rarity-tier="ultra"]').count(),12,'Daily unlocks share the ultra-rare tier');
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
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.waitForFunction(y=>Math.abs(window.scrollY-y)<5,originalScroll);
    await unlock('#library');
    await page.getByRole('heading',{name:'我的游戏库',exact:true}).waitFor();
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await page.getByRole('heading',{name:'我的游戏档案',exact:true}).waitFor();
    await page.getByRole('button',{name:'全部游戏',exact:true}).click();
    await page.getByRole('textbox',{name:'搜索游戏名称'}).fill('Test Game 1');
    const gameSort=page.getByRole('combobox',{name:'排序游戏'});
    await gameSort.selectOption('span-desc');
    assert.equal(await gameSort.inputValue(),'span-desc','Longest-to-shortest achievement span sorting is available');
    assert.equal(await page.locator('.game-card .game-time-span').first().innerText(),'时间跨度：1.0天');
    await gameSort.selectOption('span-asc');
    assert.equal(await gameSort.inputValue(),'span-asc','Shortest-to-longest achievement span sorting is available');
    await gameSort.selectOption('time');
    const beforeDetail=await page.evaluate(()=>window.scrollY);
    await page.locator('.game-card').first().click();
    await page.getByRole('dialog').waitFor();
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
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.game-detail .achievement-image.ah-rarity-gold').first().evaluate(el=>getComputedStyle(el,'::after').animationName),
      'none','Reduced motion disables the universal gilt animation');
    await page.emulateMedia({reducedMotion:'no-preference'});

    const achievementIds=()=>page.locator('.achievement').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-achievement-id')));
    assert.deepEqual(await achievementIds(),['2','1','3','4'],'All-classes tab sorts achievements globally, newest first');
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
      return {sameLine:Math.abs((a.y+a.height/2)-(b.y+b.height/2))<2,leftFirst:a.x<b.x,sortText:el.querySelector('.achievement-sort-toggle span').textContent};
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
    await page.locator('.game-card[data-game-id="101"]').waitFor({state:'detached'});
    assert.equal(await page.locator('.game-card').count(),9,'Manual hiding applies to remaining official-visible games');
    await switchMainTab('概览');
    assert.equal(await page.locator('.stats').innerText(),statsBeforeHiding,'Official and local hiding never change totals');
    await switchMainTab('游戏库');
    await manageDisplay();
    await page.getByRole('button',{name:'全部展示',exact:true}).click();
    await page.getByRole('button',{name:'保存展示设置',exact:true}).click();
    await page.locator('.game-card[data-game-id="101"]').waitFor();
    activeEnvelope=envelope;
    await unlock('#library');
    await page.locator('.game-card').first().waitFor();
    assert.equal(await page.locator('.game-card').count(),12,'Officially unhidden game returns when Xbox snapshot updates');
    console.log((mobile?'Mobile':'Desktop')+': PASS official hiding, manual hiding, history totals, unhide restoration and toolbar 50/50 layout');
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
