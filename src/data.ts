export type Achievement = { id:string; name:string; image:string; unlockedAt:string|null; rarity:number|null; unlocked:boolean };
export type Game = { id:string; name:string; image:string; devices:string[]; lastPlayed:string|null; minutes:number|null; earned:number; total:number; score:number; maxScore:number; achievements?:Achievement[] };
export type Profile = { xuid:string; gamertag:string; avatar:string };
export type RecordData = { id:string; at:string; profile:Profile; games:Game[]; source:string; warnings:string[] };
export function number(v:unknown):number { const n=Number(v);return Number.isFinite(n)&&n>=0?n:0; }
export function safeImage(v:unknown):string { if(typeof v!=='string')return '';try { const u=new URL(v.startsWith('//')?'https:'+v:v);return u.protocol==='https:'?u.href:''; }catch{return '';} }
export function normalizeTitles(data:any):Game[] {
 if(!Array.isArray(data?.titles))throw new Error('游戏列表返回格式不符合预期，未覆盖已有记录。');
 return data.titles.filter((g:any)=>g.type!=='App'&&g.titleHistory?.visible!==false).map((g:any)=>({id:String(g.titleId),name:String(g.name||'未命名游戏'),image:safeImage(g.displayImage),devices:Array.isArray(g.devices)?g.devices.map(String):[],lastPlayed:g.titleHistory?.lastTimePlayed||null,minutes:null,earned:number(g.achievement?.currentAchievements),total:number(g.achievement?.totalAchievements),score:number(g.achievement?.currentGamerscore),maxScore:number(g.achievement?.totalGamerscore)}));
}
export function parseStats(data:any):Record<string,number> {
 const out:Record<string,number>={};
 for(const user of data?.users||[]){for(const title of user.titles||[]){ const s=(title.stats||[]).find((s:any)=>s.name==='MinutesPlayed');if(s&&s.value!==null&&s.value!==''&&Number.isFinite(Number(s.value))&&Number(s.value)>=0)out[String(title.titleId)]=Number(s.value); }}
 return out;
}
export function validateRecord(input:any):{profile:Profile;games:Game[];source:string;warnings:string[]} {
 if(!input?.profile||typeof input.profile.xuid!=='string'||!/^\d{5,25}$/.test(input.profile.xuid))throw new Error('缺少有效 XUID。');
 if(!Array.isArray(input.games)||input.games.length>5000)throw new Error('games 必须为数组，最多 5000 个游戏。');
 const ids=new Set(); const games:Game[]=input.games.map((g:any)=>{
 if(!g||typeof g.id!=='string'||!/^\d{1,20}$/.test(g.id)||ids.has(g.id))throw new Error('游戏 ID 无效或重复。');ids.add(g.id);
 if(typeof g.name!=='string'||!g.name.trim())throw new Error('缺少游戏名称。');
 if(g.minutes!=null&&(typeof g.minutes!=='number'||!Number.isFinite(g.minutes)||g.minutes<0))throw new Error('游玩分钟数必须为非负数或 null。');
 const achievements=Array.isArray(g.achievements)?g.achievements.slice(0,1000).filter((a:any)=>a&&typeof a.id==='string').map((a:any)=>({id:a.id.slice(0,200),name:String(a.name||'Achievement').slice(0,300),image:safeImage(a.image),unlockedAt:typeof a.unlockedAt==='string'&&Number.isFinite(Date.parse(a.unlockedAt))?new Date(a.unlockedAt).toISOString():null,rarity:typeof a.rarity==='number'&&Number.isFinite(a.rarity)&&a.rarity>=0&&a.rarity<=100?a.rarity:null,unlocked:a.unlocked===true})):undefined;
 return {id:g.id,name:g.name.slice(0,300),image:safeImage(g.image),devices:Array.isArray(g.devices)?g.devices.slice(0,10).map(String):[],lastPlayed:typeof g.lastPlayed==='string'&&Number.isFinite(Date.parse(g.lastPlayed))?new Date(g.lastPlayed).toISOString():null,minutes:g.minutes??null,earned:number(g.earned),total:number(g.total),score:number(g.score),maxScore:number(g.maxScore),...(achievements?{achievements}:{})};
 });
 return {profile:{xuid:input.profile.xuid,gamertag:String(input.profile.gamertag||'Xbox 玩家').slice(0,100),avatar:safeImage(input.profile.avatar)},games,source:input.source==='Xbox'?'Xbox':input.source==='OpenXBL'?'OpenXBL':'导入',warnings:Array.isArray(input.warnings)?input.warnings.slice(0,30).map((v:any)=>String(v).slice(0,300)):[]};
}
export function compareRecords(current:RecordData, previous?:RecordData){
 if(!previous||previous.profile.xuid!==current.profile.xuid)return {minutes:null,achievements:null,corrections:0};
 const old=new Map(previous.games.map(g=>[g.id,g]));let minutes=0,achievements=0,corrections=0;
 for(const g of current.games){const o=old.get(g.id);if(!o)continue;if(o.minutes!==null&&g.minutes!==null){const d=g.minutes-o.minutes;if(d<0)corrections++;else minutes+=d;}achievements+=Math.max(0,g.earned-o.earned);}
 return {minutes,achievements,corrections};
}
