import assert from 'node:assert/strict';
import {encryptVault,decryptVault} from '../src/crypto.ts';
import {readFile} from 'node:fs/promises';
import {readAchievementPage} from './exophase-page.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
export async function runAuxiliaryChecks({browser,games,envelope,password,FIXTURE_TIME}){
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

  // Real interactive typography preview uses the same Mythic poster as the
  // production app, but has its own query-param entry and scoped font controls.
  {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.clock.setFixedTime(new Date(FIXTURE_TIME));
    await page.route('**/status.json*',route=>route.fulfill({json:{initialized:true,latestAt:'2026-10-30T00:00:00Z'}}));
    await page.route('**/vault.json*',route=>route.fulfill({json:envelope}));
    await page.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    // Testing actual CSS declarations should not require external Google Fonts.
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/?mythic-font-demo=1');
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    await page.locator('.mythic-wall-overlay[data-font-demo="true"]').waitFor();
    assert.ok(await page.locator('.mythic-poster-title').count()>0,
      'Preview must render the original MythicPosterCard, not a separate mockup.');
    const title=page.locator('.mythic-poster.is-active .mythic-poster-title');
    await page.getByRole('button',{name:'C · Libre Baskerville Bold'}).click();
    assert.ok((await title.evaluate(node=>getComputedStyle(node).fontFamily)).includes('Libre Baskerville'));
    await page.getByRole('button',{name:'E · Fraunces Bold'}).click();
    assert.ok((await title.evaluate(node=>getComputedStyle(node).fontFamily)).includes('Fraunces'));
    await page.getByRole('button',{name:'B · Cinzel Bold'}).click();
    assert.ok((await title.evaluate(node=>getComputedStyle(node).fontFamily)).includes('Cinzel'));
    await page.getByRole('button',{name:'思源黑体 · 粗体'}).click();
    assert.ok((await page.locator('.mythic-poster-congratulations').first()
      .evaluate(node=>getComputedStyle(node).fontFamily)).includes('Noto Sans SC'));
    await page.getByRole('button',{name:'浅色',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.getByRole('button',{name:'关闭字体预览'}).click();
    await page.locator('.mythic-wall-overlay[data-font-demo="true"]').waitFor({state:'detached'});
    assert.ok(!new URL(page.url()).searchParams.has('mythic-font-demo'));
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await context.close();
    console.log('Mythic typography demo: PASS real poster, B/C/E, Chinese font, theme and close');
  }

  // Use real MythicPosterCard and stored achievements for the proposed
  // name-plus-timestamp layout; compare it directly to the production version.
  {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.clock.setFixedTime(new Date(FIXTURE_TIME));
    await page.route('**/status.json*',route=>route.fulfill({json:{initialized:true,latestAt:'2026-10-30T00:00:00Z'}}));
    await page.route('**/vault.json*',route=>route.fulfill({json:envelope}));
    await page.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/?mythic-moment-demo=1');
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    const lab=page.locator('.mythic-wall-overlay[data-moment-demo="true"]');
    await lab.waitFor();
    const poster=lab.locator('.mythic-poster.is-active');
    assert.equal(await poster.getAttribute('data-poster-game'),'100');
    assert.equal(await lab.getAttribute('data-moment-layout'),'two');
    assert.equal(await poster.locator('.mythic-poster-achievement-art').count(),2,
      'The two authentic unlocked-achievement artworks remain in place');
    assert.deepEqual(await poster.locator('.mythic-poster-achievement small').allTextContents(),
      ['首项成就','Mythic 达成']);
    assert.deepEqual(await poster.locator('.mythic-poster-achievement-name').allTextContents(),
      ['Achievement 0','Very long achievement name to check readable wrapping on mobile']);
    const hierarchy=await poster.locator('.mythic-poster-achievement').first().evaluate(column=>{
      const label=getComputedStyle(column.querySelector('small'));
      const name=getComputedStyle(column.querySelector('.mythic-poster-achievement-name'));
      const date=column.querySelector('.mythic-poster-achievement-datetime');
      const dateStyle=getComputedStyle(date);
      const dateNumber=getComputedStyle(date.querySelector('.mythic-poster-achievement-date'));
      const timeNumber=getComputedStyle(date.querySelector('.mythic-poster-achievement-time'));
      return {
        labelSize:parseFloat(label.fontSize),nameSize:parseFloat(name.fontSize),
        labelWeight:label.fontWeight,nameWeight:name.fontWeight,
        labelSpacing:parseFloat(label.letterSpacing),
        labelFont:label.fontFamily,nameFont:name.fontFamily,
        dateFont:dateStyle.fontFamily,dateWeight:dateStyle.fontWeight,dateColor:dateStyle.color,
        dateNumberSize:parseFloat(dateNumber.fontSize),timeNumberSize:parseFloat(timeNumber.fontSize),
        dateNumberWeight:dateNumber.fontWeight
      };
    });
    assert.ok(hierarchy.nameSize>hierarchy.labelSize*1.35,
      'Achievement name is visibly larger than its category label: '+JSON.stringify(hierarchy));
    assert.equal(hierarchy.labelWeight,'400','Font candidates use the same regular weight for a fair comparison');
    assert.equal(hierarchy.nameWeight,'700','Achievement name uses bold weight');
    assert.ok(hierarchy.labelFont.includes('Cactus Classical Serif')&&
      !hierarchy.labelFont.includes('Noto Sans SC')&&
      hierarchy.nameFont.includes('Noto Serif SC')&&hierarchy.labelSpacing>0,
      'Selected candidate C uses Cactus Classical Serif, while the achievement title remains Noto Serif SC');
    await page.getByRole('button',{name:'B · 朱雀仿宋'}).click();
    assert.equal(await lab.getAttribute('data-moment-font'),'b');
    assert.ok((await poster.locator('.mythic-poster-achievement small').first()
      .evaluate(el=>getComputedStyle(el).fontFamily)).includes('Zhuque Fangsong'));
    await page.getByRole('button',{name:'C · 仙人掌明体'}).click();
    assert.equal(await lab.getAttribute('data-moment-font'),'c');
    assert.ok((await poster.locator('.mythic-poster-achievement small').first()
      .evaluate(el=>getComputedStyle(el).fontFamily)).includes('Cactus Classical Serif'));
    await page.getByRole('button',{name:'A · 站酷小薇体'}).click();
    assert.equal(await lab.getAttribute('data-moment-font'),'a');
    await page.getByRole('button',{name:'C · 仙人掌明体'}).click();
    assert.equal(await lab.getAttribute('data-moment-font'),'c');
    assert.ok(hierarchy.dateFont.includes('Cormorant Garamond'),
      'Combined date/time restores the original Cormorant Garamond typeface');
    assert.equal(hierarchy.dateWeight,'400','Combined date/time line retains the original regular timestamp weight');
    assert.equal(hierarchy.dateNumberWeight,'650','Date retains the original bold date weight');
    assert.equal(hierarchy.dateColor,'rgb(170, 166, 155)',
      'Date/time is muted gray in dark mode');
    assert.equal(hierarchy.dateNumberWeight,'650');
    const posterWidth=await poster.evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(hierarchy.dateNumberSize/posterWidth<.035&&
      hierarchy.timeNumberSize/posterWidth<.027,
      'Date and time use the reduced 3.2cqw / 2.4cqw sizes');
    assert.ok(hierarchy.dateNumberSize>hierarchy.timeNumberSize*1.25,
      'The date remains modestly larger than the time');
    assert.deepEqual(await poster.locator('.mythic-poster-achievement-datetime').allTextContents(),
      ['2026.11.01·20:24','2026.11.02·20:24'],
      'Show the real Beijing-local date and specific time together on line three');
    const name=poster.locator('.mythic-poster-achievement-name').last();
    assert.equal(await name.getAttribute('title'),
      'Very long achievement name to check readable wrapping on mobile',
      'Long achievement names retain their full text in the title attribute');
    assert.equal(await name.evaluate(el=>getComputedStyle(el).webkitLineClamp),'2');
    const fit=()=>poster.evaluate(el=>{
      const pair=el.querySelector('.mythic-poster-achievement-pair').getBoundingClientRect();
      return [...el.querySelectorAll('.mythic-poster-achievement')].map(col=>{
        const art=col.querySelector('.mythic-poster-achievement-art').getBoundingClientRect();
        const label=col.querySelector('small').getBoundingClientRect();
        const name=col.querySelector('.mythic-poster-achievement-name').getBoundingClientRect();
        const time=col.querySelector('.mythic-poster-achievement-datetime').getBoundingClientRect();
        const column=col.getBoundingClientRect();
        return {inside:art.top>=pair.top-1&&time.bottom<=pair.bottom+1,
          order:art.bottom<=label.top+2&&label.bottom<=name.top+2&&name.bottom<=time.top+2,
          xFit:name.left>=column.left-1&&name.right<=column.right+1,
          timeFit:time.left>=column.left-1&&time.right<=column.right+1};
      });
    });
    assert.ok((await fit()).every(x=>Object.values(x).every(Boolean)),
      'Achievement names and timestamp remain inside the original fixed poster zone on mobile');
    await page.getByRole('button',{name:'新版 · 单行成就名'}).click();
    assert.equal(await lab.getAttribute('data-moment-layout'),'one');
    assert.equal(await name.evaluate(el=>getComputedStyle(el).webkitLineClamp),'1');
    assert.equal(await poster.locator('.mythic-poster-achievement-datetime').count(),2);
    await page.getByRole('button',{name:'当前版本'}).click();
    assert.equal(await lab.getAttribute('data-moment-layout'),'original');
    assert.equal(await poster.locator('.mythic-poster-achievement-name').count(),0);
    assert.deepEqual(await poster.locator('.mythic-poster-achievement b').allTextContents(),
      ['2026.11.01','2026.11.02'],
      'Old version remains unchanged for side-by-side comparison by switching');
    await page.getByRole('button',{name:'新版 · 双行成就名'}).click();
    await page.getByRole('button',{name:'浅色',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    assert.notEqual(await name.evaluate(el=>getComputedStyle(el).color),'rgb(243, 221, 180)',
      'The achievement names use legible bronze text in light mode');
    assert.equal(await poster.locator('.mythic-poster-achievement-datetime').first()
      .evaluate(el=>getComputedStyle(el).color),'rgb(136, 130, 118)',
      'Date/time remains muted gray in light mode too');
    await page.setViewportSize({width:320,height:700});
    assert.ok((await fit()).every(x=>x.inside&&x.xFit&&x.timeFit),
      'Small phones retain readable moment content inside the achievement panel');
    await lab.getByRole('button',{name:'下一张Mythic纪念卡'}).click();
    await lab.locator('.mythic-poster.is-active[data-poster-game="101"]').waitFor();
    assert.equal(await lab.locator('.mythic-poster.is-active .mythic-poster-achievement-name').count(),2,
      'The chosen layout persists while browsing different actual Mythic games');
    await page.getByRole('button',{name:'关闭成就布局预览'}).click();
    await lab.waitFor({state:'detached'});
    assert.equal(new URL(page.url()).searchParams.has('mythic-moment-demo'),false);
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await context.close();
    console.log('Mythic achievement layout demo: PASS real names, combined dates, 3 modes, themes, small screen and navigation');
  }

  // Compare four animated foil techniques on the ACTUAL Mythic card; no
  // generated image, standalone fake poster or production style mutation.
  {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.clock.setFixedTime(new Date(FIXTURE_TIME));
    await page.route('**/status.json*',route=>route.fulfill({json:{initialized:true,latestAt:'2026-10-30T00:00:00Z'}}));
    await page.route('**/vault.json*',route=>route.fulfill({json:envelope}));
    await page.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/?mythic-gold-demo=1');
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    const lab=page.locator('.mythic-wall-overlay[data-gold-demo="true"]');
    await lab.waitFor();
    assert.equal(await page.locator('.mythic-poster.is-active .mythic-poster-title').innerText(),'Test Game 0',
      'Gold lab uses the current unlocked game title in the production Mythic poster.');
    const title=page.locator('.mythic-poster.is-active .mythic-poster-title');
    assert.ok((await title.evaluate(el=>getComputedStyle(el).fontFamily)).includes('Cinzel'),
      'The already-approved Cinzel Bold typography is preserved.');
    assert.equal(await lab.getAttribute('data-gold-effect'),'satin');
    const style=()=>title.evaluate(el=>{
      const css=getComputedStyle(el);
      return {animation:css.animationName,duration:parseFloat(css.animationDuration),
        state:css.animationPlayState,gradient:css.backgroundImage,fill:css.webkitTextFillColor};
    });
    const first=await style();
    assert.ok(first.animation.includes('continuous-satin')&&first.gradient.includes('linear-gradient'),
      'A uses an animated metallic gradient clipped into the actual text.');
    await page.getByRole('button',{name:'B · 镜面扫金'}).click();
    assert.equal(await lab.getAttribute('data-gold-effect'),'mirror');
    assert.ok((await style()).animation.includes('foil-flash'));
    await page.getByRole('button',{name:'C · 液态鎏金'}).click();
    assert.equal(await lab.getAttribute('data-gold-effect'),'liquid');
    assert.ok((await style()).animation.includes('foil-liquid'));
    await page.getByRole('button',{name:'D · 熔金辉光'}).click();
    assert.equal(await lab.getAttribute('data-gold-effect'),'ember');
    assert.ok((await style()).animation.includes('continuous-ember'));
    const standard=(await style()).duration;
    await page.getByRole('button',{name:'慢速'}).click();
    const slow=(await style()).duration;
    await page.getByRole('button',{name:'快速'}).click();
    const fast=(await style()).duration;
    assert.ok(slow>standard&&fast<standard&&fast>0,
      'Gold lab changes CSS animation durations without redrawing the poster.');
    await page.getByRole('button',{name:'暂停动画'}).click();
    assert.equal((await style()).state,'paused');
    await page.getByRole('button',{name:'继续播放'}).click();
    assert.equal((await style()).state,'running');
    const darkGradient=(await style()).gradient;
    await page.getByRole('button',{name:'浅色',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    assert.notEqual((await style()).gradient,darkGradient,
      'Light mode has separate bronze ink gradients with sufficient contrast.');
    await page.getByRole('button',{name:'原版',exact:true}).click();
    assert.equal(await lab.getAttribute('data-gold-effect'),'original');
    assert.equal((await style()).animation,'none',
      'Original option restores the unanimated production text.');
    await page.getByRole('button',{name:'A · 香槟流金'}).click();
    await lab.getByRole('button',{name:'下一张Mythic纪念卡'}).click();
    await page.locator('.mythic-poster.is-active[data-poster-game="101"]').waitFor();
    assert.equal(await title.innerText(),'Test Game 1',
      'Switching real Mythic games retains selected foil treatment.');
    await page.getByRole('button',{name:'关闭鎏金预览'}).click();
    await lab.waitFor({state:'detached'});
    assert.ok(!new URL(page.url()).searchParams.has('mythic-gold-demo'));
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await context.close();
    console.log('Mythic title gold demo: PASS real poster, four effects, speed, pause, theme, game navigation and exit');
  }


  // The production full-size Mythic card shares Beijing midnight with the
  // official screenshot rotation; its A/D title effect never idles.
  {
    const context=await browser.newContext({
      viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'
    });
    const page=await context.newPage();
    await page.clock.install({time:new Date('2026-11-14T15:59:45.000Z')});
    await page.route('**/status.json*',route=>route.fulfill({json:{initialized:true,latestAt:'2026-10-30T00:00:00Z'}}));
    await page.route('**/vault.json*',route=>route.fulfill({json:envelope}));
    await page.route('https://covers.example.test/**',route=>route.fulfill({
      contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
    }));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto('http://127.0.0.1:4173/xbox-playlog-pages/#library');
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button',{name:'解锁我的游戏档案'}).click();
    const library=page.locator('.library-games-panel');
    await library.waitFor();
    const libraryTitle=library.locator('.game-card[data-mythic="true"] .game-title').first();
    assert.equal(await library.getAttribute('data-title-foil'),'satin',
      'Library games share the November 14 A foil before opening the poster');
    assert.equal(await libraryTitle.evaluate(el=>getComputedStyle(el).animationName),
      'mythic-title-continuous-satin');
    // The real detail heading reuses the same current-day foil (no font/layout change).
    await library.locator('.game-card[data-mythic="true"]').first().click();
    const detailHeading=page.locator('.game-detail .detail-heading');
    await detailHeading.waitFor();
    assert.equal(await detailHeading.getAttribute('data-title-foil'),'satin');
    const detailTitle=detailHeading.locator('h2');
    const detailFoil=()=>detailTitle.evaluate(el=>{
      const css=getComputedStyle(el);
      return {name:css.animationName,duration:css.animationDuration,
        gradient:css.backgroundImage,fill:css.webkitTextFillColor,
        fontSize:css.fontSize,lineHeight:css.lineHeight};
    });
    const detailA=await detailFoil();
    assert.equal(detailA.name,'mythic-title-continuous-satin');
    assert.equal(detailA.duration,'2.6s');
    assert.ok(detailA.gradient.includes('linear-gradient'));
    assert.equal(detailA.fill,'rgba(0, 0, 0, 0)');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await detailHeading.waitFor({state:'detached'});
    await page.getByRole('button',{name:'打开Mythic纪念墙'}).click();
    const showcase=page.getByRole('region',{name:'Mythic纪念墙展示柜'});
    await showcase.locator('.mythic-showcase-item').first().click();
    const wall=page.getByRole('dialog',{name:'Mythic纪念墙'});
    await wall.waitFor();
    await page.waitForFunction(()=>!!document.querySelector('.mythic-poster.is-active')&&
      !document.querySelector('.mythic-poster.is-active').classList.contains('is-type-loading'));
    assert.equal(await wall.getAttribute('data-title-foil'),'satin',
      'November 14 Beijing date uses champagne gold in the actual Mythic poster.');
    const title=wall.locator('.mythic-poster.is-active .mythic-poster-title');
    const foil=()=>title.evaluate(el=>{
      const s=getComputedStyle(el);
      return {name:s.animationName,duration:s.animationDuration,
        timing:s.animationTimingFunction,direction:s.animationDirection,
        iterations:s.animationIterationCount,image:s.backgroundImage,
        fill:s.webkitTextFillColor,font:s.fontFamily,play:s.animationPlayState};
    });
    let a=await foil();
    assert.ok(a.name.includes('continuous-satin')&&a.duration==='2.6s'&&
      a.timing==='linear'&&a.direction==='alternate'&&a.iterations==='infinite'&&
      a.image.includes('linear-gradient')&&a.font.includes('Cinzel'),
      'Production A foil uses approved font and continuous non-idling standard sweep: '+JSON.stringify(a));
    await page.clock.fastForward(20_000);
    await page.waitForFunction(()=>document.querySelector('.mythic-wall-overlay')?.getAttribute('data-title-foil')==='ember');
    assert.equal(await library.getAttribute('data-title-foil'),'ember',
      'The library title uses D at the same Beijing midnight as the large card');
    assert.equal(await libraryTitle.evaluate(el=>getComputedStyle(el).animationName),
      'mythic-title-continuous-ember');
    const d=await foil();
    assert.ok(d.name.includes('continuous-ember')&&d.duration==='4.5s'&&
      d.timing==='linear'&&d.direction==='alternate'&&d.iterations==='infinite',
      'Exactly at Beijing midnight the title switches to uninterrupted D glow: '+JSON.stringify(d));
    await page.evaluate(()=>document.documentElement.dataset.theme='light');
    const light=await foil();
    assert.equal(light.name,'mythic-title-continuous-ember-light');
    assert.equal(light.duration,d.duration);
    assert.notEqual(light.image,d.image,
      'Production foil has readable bronze variation on light-theme collectible.');
    const libraryLight=await libraryTitle.evaluate(el=>getComputedStyle(el).backgroundImage);
    assert.equal(libraryLight,light.image,
      'Mythic titles in the library and large card share the exact light-theme gold gradient');
    await wall.getByRole('button',{name:'下一张Mythic纪念卡'}).click();
    await wall.locator('.mythic-poster.is-active[data-poster-game="101"]').waitFor();
    assert.equal(await wall.getAttribute('data-title-foil'),'ember',
      'Every Mythic poster has the same daily effect.');
    await wall.getByRole('button',{name:'返回展示柜'}).click();
    await wall.waitFor({state:'detached'});
    await showcase.getByRole('button',{name:'返回游戏库'}).click();
    await showcase.waitFor({state:'detached'});
    await library.locator('.game-card[data-mythic="true"]').first().click();
    await detailHeading.waitFor();
    assert.equal(await detailHeading.getAttribute('data-title-foil'),'ember',
      'The game detail title switches to D at the same Beijing midnight.');
    const detailD=await detailFoil();
    assert.equal(detailD.name,'mythic-title-continuous-ember-light');
    assert.equal(detailD.duration,'4.5s');
    assert.equal(detailD.gradient,light.image,
      'Detail, library and Mythic poster titles use the identical light-theme D gradient.');
    assert.equal(detailD.fontSize,detailA.fontSize,
      'The original detail game-title font size must remain unchanged.');
    assert.equal(detailD.lineHeight,detailA.lineHeight,
      'The original detail game-title line height must remain unchanged.');
    // Normal/non-Mythic game details never receive the effect.
    const defaultStyle=await detailHeading.evaluate(el=>{
      const title=el.querySelector('h2');
      el.removeAttribute('data-title-foil');
      const css=getComputedStyle(title);
      return {animation:css.animationName,fill:css.webkitTextFillColor};
    });
    assert.equal(defaultStyle.animation,'none');
    assert.notEqual(defaultStyle.fill,'rgba(0, 0, 0, 0)');
    await context.close();
    console.log('Mythic daily title foil: PASS Beijing midnight A/D, continuous speeds, themes and card changes');
  }

  // A user who leaves Overview open (without returning focus or entering Manage)
  // must see new Xbox snapshots after the cheap global status poll.
  {
    const pollContext=await browser.newContext({viewport:{width:1440,height:900}});
    const pollPage=await pollContext.newPage();
    await pollPage.clock.install({time:new Date(FIXTURE_TIME)});
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
    await cachePage.clock.setFixedTime(new Date(FIXTURE_TIME));
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
}
