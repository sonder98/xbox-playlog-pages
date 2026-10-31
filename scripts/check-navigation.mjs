import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readAchievementPage} from './exophase-page.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {encryptVault,decryptVault} from '../src/crypto.ts';
const password='navigation-test-only';
const games=Array.from({length:12},(_,i)=>({id:String(100+i),name:'Test Game '+i,image:'https://covers.example.test/square.svg',image2x:'https://covers.example.test/medium.svg',image3x:'https://covers.example.test/original.svg',devices:['Xbox'],lastPlayed:'2026-10-30T00:00:00Z',minutes:60,earned:1,total:10,score:10,maxScore:100}));
for(const game of games)game.achievements=[0,9.9,10,null].map((rarity,i)=>({id:String(i+1),points:[10,20,0,15][i],name:i===1?'Very long achievement name to check readable wrapping on mobile':'Achievement '+i,description:i===2?'这是一段很长的成就描述，用来验证它能与稀有度并排，内容自动换行且不挤出屏幕。':'完成一次挑战。',image:'https://covers.example.test/square.svg',unlocked:i<2,unlockedAt:i<2?(i===0?'2026-10-27T12:24:00.000Z':'2026-10-28T12:24:00.000Z'):null,rarity}));
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
    if(mobile){
      const refresh=await page.locator('.title-row .overview-refresh').evaluate(button=>{
        const a=button.getBoundingClientRect(),b=button.querySelector('svg').getBoundingClientRect();
        return {dx:Math.abs((a.left+a.width/2)-(b.left+b.width/2)),dy:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),size:a.width};
      });
      assert.equal(refresh.size,44,'Mobile refresh is a 44px square tap target');
      assert.ok(refresh.dx<1&&refresh.dy<1,'Mobile refresh icon is centered both ways');
    }
    const statsBeforeHiding=await page.locator('.stats').innerText();
    assert.deepEqual(await page.locator('[data-overview-section]').evaluateAll(els=>els.map(el=>el.dataset.overviewSection)),['heatmap','recent','top','stats']);
    assert.equal(await page.locator('.ah-preview-grid .ah-preview-cell').count(),30,'Overview shows only 30 days');
    await page.getByRole('button',{name:'查看全部成就热力图'}).click();
    await page.locator('.ah-year').first().waitFor();
    assert.equal(await page.locator('.ah-year').count(),5,'Calendar covers 2022 through 2026');
    assert.equal(await page.locator('.ah-year').first().getByRole('heading').innerText(),'2026 年');
    await page.getByRole('button',{name:'2026 年 10 月 27 日，解锁 12 个成就',exact:true}).click();
    const sheet=page.getByRole('dialog',{name:'2026 年 10 月 27 日 成就摘要'});
    await sheet.waitFor();
    assert.ok((await sheet.innerText()).includes('12'));
    assert.ok((await sheet.innerText()).includes('Test Game 0'));
    if(mobile){
      const rect=await sheet.boundingBox();
      assert.ok(rect&&rect.y>280&&rect.y<650,'Mobile day summary opens as a lower-half bottom sheet');
    }
    await sheet.getByRole('button',{name:'查看当天全部成就'}).click();
    await page.locator('.ah-achievement-card').first().waitFor();
    assert.equal(await page.locator('.ah-achievement-card').count(),12,'All day unlocks across games appear');
    assert.ok(page.url().endsWith('#achievements/day/2026-10-27'),'Day detail is deep-linkable');
    assert.equal(await page.locator('.ah-achievement-card .ah-game-source').count(),12,'Each achievement identifies its original game');
    assert.ok(await page.locator('.ah-achievement-card time').first().innerText()==='20:24');
    await page.getByRole('button',{name:'切换解锁时间排序'}).click();
    await page.locator('.ah-game-source').first().click();
    await page.getByRole('dialog',{name:/游戏详情/}).waitFor();
    await page.getByRole('button',{name:'关闭详情'}).click();
    await page.getByRole('button',{name:/返回热力图/}).click();
    await page.locator('.ah-day-grid').first().waitFor();
    assert.equal(await page.locator('.ah-cell.is-selected').count(),1,'Selected calendar date persists after returning');
    await page.getByRole('button',{name:/返回概览/}).click();
    await page.locator('.game-card').first().waitFor();
    console.log((mobile?'Mobile':'Desktop')+': PASS recent heatmap, 2022+ history, day bottom sheet, chronological achievement detail, deep links and game provenance');
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
    await page.waitForFunction(()=>document.querySelector('.detail-cover .cover-artwork')?.currentSrc.endsWith('cached-1600.svg'));
    const hero=await page.locator('.detail-cover').evaluate(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,fallback:!!el.querySelector('.detail-backdrop'),fit:getComputedStyle(el.querySelector('.cover-artwork')).objectFit};});
    assert.ok(hero.ratio>1.7&&hero.ratio<1.85,'Detail cover must be widescreen');
    assert.ok(hero.fallback&&hero.fit==='contain','Square source uses unfitted artwork with a soft landscape backdrop');
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
    await page.getByRole('button',{name:'概览',exact:true}).click();
    assert.equal(await page.locator('.stats').innerText(),statsBeforeHiding,'Official and local hiding never change totals');
    await page.getByRole('button',{name:'游戏库',exact:true}).click();
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
