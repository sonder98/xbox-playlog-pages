import type {RecordData,Game,Achievement} from './data';
export function demoRecords():RecordData[]{
 const names=['Cyberpunk 2077','ACE COMBAT 8: WINGS OF THEVE','Resident Evil Requiem','Forza Horizon 6','Zenless Zone Zero','这是一个用于检查移动端换行的很长的游戏名称 / Long Game Title'];
 const covers=['00085db.png?c780dc9179984cb9ffd33a5d5577fdb4','678ej6b.png?16619071238e43236af5b504c6688926','67bj711.png?9c440923859e3483810739add3df4fbe','g188653.png?a557457e3e4b6dbd3d351c1fcd88605a','377e50j.png?cb878116190d6f31b8fc1b537321c732'];
 const games:Game[]=names.map((name,i)=>{
  const achievements:Achievement[]=Array.from({length:8},(_,n)=>({id:String(i*100+n+1),name:['Welcome to the City','逆流而上','初次挑战','探索每个角落'][n%4],description:'完成一次挑战，继续属于你的旅程。',image:'',unlocked:i===0||n<(i===1?6:3),unlockedAt:i===0||n<(i===1?6:3)?'2026-10-28T12:24:00.000Z':null,rarity:Math.round((n+1)*5.7*10)/10,groupId:n<6?'base':'dlc'}));
  const groups=[{id:'base',name:'本体',kind:'base' as const,achievementIds:achievements.slice(0,6).map(a=>a.id),total:6,earned:i<2?6:3},{id:'dlc',name:'Additional Story',kind:'dlc' as const,achievementIds:achievements.slice(6).map(a=>a.id),total:2,earned:i===0?2:0}];
  return {id:String(i+100),name,image:i<5?'https://m.exophase.com/xbox/games/m/'+covers[i]:'',image3x:i<5?'https://m.exophase.com/xbox/games/o/'+covers[i]:undefined,image2x:i<5?'https://m.exophase.com/xbox/games/l/'+covers[i]:undefined,devices:['Xbox Series X|S'],lastPlayed:'2026-10-'+String(29-i)+'T14:00:00Z',minutes:i===5?null:[20544,1980,1440,980,650][i],total:8,earned:i===0?8:i===1?6:3,score:500,maxScore:1000,achievements,groups,groupStatus:'verified'};
 });
 return [{id:'demo-now',at:'2026-10-30T08:17:00Z',source:'Exophase',warnings:[],profile:{xuid:'4285437',gamertag:'SondrRope · 示例',avatar:''},games},{id:'demo-before',at:'2026-10-29T08:17:00Z',source:'Exophase',warnings:[],profile:{xuid:'4285437',gamertag:'SondrRope · 示例',avatar:''},games:games.map(g=>({...g,minutes:g.minutes===null?null:g.minutes-60}))}];
}
