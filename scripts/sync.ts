import fs from 'node:fs';
import {encryptVault} from '../src/crypto.ts';
import {getPasswords,readVault} from './password.ts';
import {safeImage,validateRecord,type RecordData} from '../src/data.ts';

// Exophase public profile: https://www.exophase.com/xbox/user/SondrRope/
const playerId='4285437';
const api=`https://api.exophase.com/public/player/${playerId}`;
const {old:oldPassword,target:password}=getPasswords(process.env);

let browserContext:Promise<any>|null=null;
let profileAvatar='';
async function activeSession():Promise<any>{return browserContext?await browserContext:null;}
async function browserJson(url:string){
  if(!browserContext)browserContext=(async()=>{
    console.log('正在通过 Exophase 公开个人主页建立正常浏览器会话…');
    const {chromium}=await import('playwright');
    const browser=await chromium.launch({headless:false});
    const context=await browser.newContext();
    const page=await context.newPage();
    const response=await page.goto('https://www.exophase.com/xbox/user/SondrRope/',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>!document.title.includes('Just a moment'),{},{timeout:30000}).catch(()=>{});
    console.log(`公开主页 HTTP ${response?.status()}；标题：${await page.title()}`);
    const avatarResult=await page.evaluate(()=>{
      const selectors=['.profile-avatar img','img.profile-avatar','.player-avatar img','img.player-avatar','[class*="avatar"] img','img[class*="avatar"]','img[src*="xboxlive.com"]','img[alt*="SondrRope"]'];
      for(const selector of selectors){
        const img=document.querySelector<HTMLImageElement>(selector);
        if(img?.src)return {url:img.currentSrc||img.src,selector};
      }
      for(const el of document.querySelectorAll('[class*="avatar"],[class*="gamerpic"]')){
        const background=getComputedStyle(el).backgroundImage;
        const match=background.match(/url\(["']?(.*?)["']?\)/);
        if(match?.[1])return {url:new URL(match[1],location.href).href,selector:'avatar background'};
      }
      return {url:'',selector:''};
    });
    if(avatarResult.url){
      const image=await context.request.get(avatarResult.url,{timeout:20000}).catch(()=>null);
      if(image?.ok()&&image.headers()['content-type']?.startsWith('image/')){
        profileAvatar=safeImage(avatarResult.url);
        console.log('头像同步：已从公开资料读取并验证图片。');
      }
    }
    if(!profileAvatar){
      console.log('头像未找到；图片结构诊断：'+JSON.stringify(await page.locator('img').evaluateAll((imgs:HTMLImageElement[])=>imgs.slice(0,8).map(img=>({src:img.src,alt:img.alt,class:img.className,parent:img.parentElement?.className})))));
    }
    return {browser,page};
  })();
  const {page}=await browserContext;
  const result=await page.evaluate(async(endpoint:string)=>{
    const response=await fetch(endpoint,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(30000)});
    return {status:response.status,ok:response.ok,text:await response.text(),server:response.headers.get('server')};
  },url);
  if(!result.ok)throw Error(`Exophase 站内公开接口 HTTP ${result.status} (${result.server})：${result.text.slice(0,180)}`);
  try{return JSON.parse(result.text);}catch{throw Error('Exophase 返回了网页而不是 JSON；旧记录未覆盖。');}
}
async function getJson(url:string):Promise<any>{
  if(browserContext)return browserJson(url);
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(response.status===403)return browserJson(url);
  if(!response.ok)throw Error(`Exophase 返回 HTTP ${response.status}；旧记录未覆盖。`);
  return response.json();
}
let previous:RecordData[]=[];
if(fs.existsSync('public/vault.json')){
  const payload=await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),oldPassword,password);
  if(!Array.isArray(payload.records))throw Error('历史记录格式无效。');
  previous=payload.records;
}

profileAvatar=previous[0]?.profile.avatar||'';
console.log('正在读取 SondrRope 的 Exophase 公开 Xbox 游戏库…');
const gamesById=new Map<string,any>();
for(let page=1;page<=50;page++){
  const result=await getJson(`${api}/games?page=${page}&environment=xbox&sort=1&showHidden=0`);
  if(result.success!==true||!Array.isArray(result.games))throw Error('Exophase 游戏列表响应格式不符合预期；旧记录未覆盖。');
  const sampleSession=page===1?await activeSession():null;
  if(sampleSession&&result.games[0]){
    const session=sampleSession;
    const sample=result.games[0];
    const dimensions=await session.page.evaluate(async(candidates:Record<string,string>)=>{
      return Promise.all(Object.entries(candidates).map(([field,url])=>new Promise(resolve=>{
        if(!url){resolve({field,available:false});return;}
        const image=new Image();
        const timer=setTimeout(()=>resolve({field,loaded:false}),15000);
        image.onload=()=>{clearTimeout(timer);resolve({field,width:image.naturalWidth,height:image.naturalHeight});};
        image.onerror=()=>{clearTimeout(timer);resolve({field,loaded:false});};
        image.src=url;
      })));
    },{resource_standard:sample.resource_standard||'',resource_small:sample.resource_small||'',resource_tile:sample.resource_tile||''});
    console.log('Exophase 封面尺寸校验：'+JSON.stringify(dimensions));
  }
  for(const item of result.games){
    const meta=item.meta||{};
    const id=String(item.master_id||meta.master_id||'');
    const name=String(meta.title||item.title||'').trim();
    if(!/^\d{1,20}$/.test(id)||!name)continue;
    const units=item.playtimeUnits||{};
    const hours=Number(units.hours),minutes=Number(units.minutes);
    const totalMinutes=Number.isFinite(hours)&&Number.isFinite(minutes)?Math.max(0,Math.round(hours*60+minutes)):null;
    const played=Number(item.lastplayed_utc);
    const lastPlayed=Number.isFinite(played)&&played>0?new Date(played*1000).toISOString():typeof item.lastplayed_utc==='string'&&Number.isFinite(Date.parse(item.lastplayed_utc))?new Date(item.lastplayed_utc).toISOString():typeof item.lastplayed==='string'&&Number.isFinite(Date.parse(item.lastplayed))?new Date(item.lastplayed).toISOString():null;
    gamesById.set(id,{
      id,name,image:safeImage(item.resource_tile||item.resource_standard||item.resource_small||''),
      devices:Array.isArray(meta.platforms)?meta.platforms.map((p:any)=>String(p.name||p.slug||'')).filter(Boolean):[],
      lastPlayed,minutes:totalMinutes,earned:Number(item.earned_awards)||0,total:Number(item.total_awards)||0,
      score:Number(item.earned_points)||0,maxScore:0,endpointAwards:meta.endpoint_awards||''
    });
  }
  if(result.games.length===0||result.games.length<20)break;
  if(page===50)throw Error('Exophase 游戏库分页超过上限；旧记录未覆盖。');
}
const games=[...gamesById.values()];

// Exophase's public earned feed supplies achievement icon and unlock timestamp.
// Its currently exposed JSON does not return rarity, so do not invent a value.
let cursor=0,detailFailures=0;
async function worker(){
  while(cursor<games.length){
    const game=games[cursor++];
    try{
      const payload=await getJson(`${api}/game/${encodeURIComponent(game.id)}/earned`);
      if(!Array.isArray(payload.list))throw Error('invalid earned list');
      game.achievements=payload.list.map((award:any)=>({
        id:String(award.masterAwardId||award.awardid||award.slug||''),
        name:String(award.name||award.title||award.slug||'Achievement').replaceAll('-',' '),
        image:safeImage(award.icons?.m?`https://m.exophase.com${award.icons.m}`:''),
        unlockedAt:Number(award.timestamp)>0?new Date(Number(award.timestamp)*1000).toISOString():null,
        rarity:typeof award.rarity==='number'?award.rarity:null,unlocked:true
      })).filter((award:any)=>award.id);
    }catch{detailFailures++;}
  }
}
await Promise.all(Array.from({length:5},()=>worker()));
const finishedSession=await activeSession();
if(finishedSession)await finishedSession.browser.close();
if(!games.length)throw Error('Exophase 没有返回任何游戏；不发布空快照。');
const noPlaytime=games.filter(game=>game.minutes===null).length;
const warnings=[
  ...(noPlaytime?[`${noPlaytime} 个游戏在 Exophase 未返回游玩时长。`]:[]),
  ...(detailFailures?[`${detailFailures} 个游戏未能读取 Exophase 成就明细。`]:[]),
  'Exophase 公开成就接口未提供稀有度字段；稀有度暂不显示。'
];
const record:RecordData={
  ...validateRecord({profile:{xuid:playerId,gamertag:'SondrRope',avatar:profileAvatar},games,source:'Exophase',warnings}),
  id:crypto.randomUUID(),at:new Date().toISOString()
};
const payload={records:[record,...previous]};
const envelope=await encryptVault(payload,password);
const verified=await readVault(envelope,password,password);
if(JSON.stringify(verified)!==JSON.stringify(payload))throw Error('重新加密后的记录校验失败；未覆盖历史文件。');
fs.writeFileSync('public/vault.json',JSON.stringify(envelope));
fs.writeFileSync('public/status.json',JSON.stringify({initialized:true}));
if(process.env.NEW_APP_PASSWORD)console.log(`密码迁移完成：保留 ${previous.length} 份历史快照，新快照已一并重新加密并校验。`);
console.log(`Exophase 同步完成：${games.length} 款游戏；正在加密记录。`);
