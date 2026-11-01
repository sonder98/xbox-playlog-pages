export type SteamItem={id:number;name:string;type?:string};
export type SteamDetails={type?:string;name?:string;platforms?:{windows?:boolean};metacritic?:{score?:number;url?:string}};
export function keyName(s:string){return s.normalize('NFKC').toLowerCase().replace(/[™®©]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
export function chooseSteam(title:string,items:SteamItem[]){
 const opts=items.filter(c=>Number.isSafeInteger(c.id)&&c.id>0&&(c.type==='app'||c.type==='game'||!c.type)&&keyName(c.name)===keyName(title));
 return opts.length===1?opts[0].id:null;
}
export function pcScore(data:SteamDetails|null,title:string):number|null{
 if(!data||data.type!=='game'||data.platforms?.windows!==true||keyName(data.name||'')!==keyName(title))return null;
 const score=data.metacritic?.score;
 return typeof score==='number'&&Number.isInteger(score)&&score>=0&&score<=100?score:null;
}
