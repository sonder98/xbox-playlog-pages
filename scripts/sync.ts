import fs from 'node:fs';
import {encryptVault,decryptVault} from '../src/crypto.ts';
import {safeImage,validateRecord,type RecordData} from '../src/data.ts';

// Exophase public profile: https://www.exophase.com/xbox/user/SondrRope/
const playerId='4285437';
const api=`https://api.exophase.com/public/player/${playerId}`;
const password=process.env.APP_PASSWORD;
if(!password||password.length<16)throw Error('请检查 APP_PASSWORD（至少16位），它只用于加密本地记录。');

let browserContext:Promise<any>|null=null;
async function browserJson(url:string){
  if(!browserContext)browserContext=(async()=>{
    console.log('普通 HTTP 请求被拒绝，改用标准 Chromium 浏览器读取公开接口。');
    const {chromium}=await import('playwright');
    const browser=await chromium.launch({headless:true});
    return browser.newContext();
  })();
  const context=await browserContext;
  const page=await context.newPage();
  try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    const body=await page.locator('body').innerText();
    if(!response?.ok())throw Error(`Exophase 浏览器请求 HTTP ${response?.status()}：${body.slice(0,180)}`);
    try{return JSON.parse(body);}catch{throw Error('Exophase 返回了网页而不是 JSON；旧记录未覆盖。');}
  }finally{await page.close();}
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
  const payload=await decryptVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),password);
  if(!Array.isArray(payload.records))throw Error('历史记录格式无效。');
  previous=payload.records;
}

console.log('正在读取 SondrRope 的 Exophase 公开 Xbox 游戏库…');
const gamesById=new Map<string,any>();
for(let page=1;page<=50;page++){
  const result=await getJson(`${api}/games?page=${page}&environment=xbox&sort=1&showHidden=0`);
  if(result.success!==true||!Array.isArray(result.games))throw Error('Exophase 游戏列表响应格式不符合预期；旧记录未覆盖。');
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
      id,name,image:safeImage(item.resource_standard||item.resource_small||item.resource_tile||''),
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
if(browserContext){const context=await browserContext;await context.browser()?.close();}
if(!games.length)throw Error('Exophase 没有返回任何游戏；不发布空快照。');
const noPlaytime=games.filter(game=>game.minutes===null).length;
const warnings=[
  ...(noPlaytime?[`${noPlaytime} 个游戏在 Exophase 未返回游玩时长。`]:[]),
  ...(detailFailures?[`${detailFailures} 个游戏未能读取 Exophase 成就明细。`]:[]),
  'Exophase 公开成就接口未提供稀有度字段；稀有度暂不显示。'
];
const record:RecordData={
  ...validateRecord({profile:{xuid:playerId,gamertag:'SondrRope',avatar:''},games,source:'Exophase',warnings}),
  id:crypto.randomUUID(),at:new Date().toISOString()
};
const envelope=await encryptVault({records:[record,...previous]},password);
fs.writeFileSync('public/vault.json',JSON.stringify(envelope));
fs.writeFileSync('public/status.json',JSON.stringify({initialized:true}));
console.log(`Exophase 同步完成：${games.length} 款游戏；正在加密记录。`);
