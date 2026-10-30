import {validateGroups} from '../src/completion.ts';
import {safeImage,type Game,type Achievement,type AchievementGroup} from '../src/data.ts';

export type PageData={groups:AchievementGroup[];achievements:Achievement[]};
/** Self-contained DOM reader, serialized by Playwright into the existing browser session. */
export function readAchievementPage(html?:string):PageData{
  const doc=typeof html==='string'?new DOMParser().parseFromString(html,'text/html'):document;
  const root=doc.querySelector('#awards');
  if(!root)throw Error('Exophase 成就列表不存在。');
  const groups:AchievementGroup[]=[],achievements:Achievement[]=[];
  let name='本体',kind:AchievementGroup['kind']='base';
  const seen=new Set<string>();
  for(const child of root.children){
    if(child.matches('h3.dlc-add-on')){
      name=(child.textContent||'追加内容').trim().replace(/\s+(Achievements|Trophies)$/i,'');
      kind=/title\s*update|update\s*#?\d|patch/i.test(name)?'update':'dlc';
    }
    if(!child.matches('ul.list-unordered-base'))continue;
    const rows=[...child.querySelectorAll('li.award')];
    if(!rows.length)continue;
    const groupId=kind==='base'?'base':`addon-${rows[0].getAttribute('data-master')||rows[0].id}`;
    const ids:string[]=[];
    for(const row of rows){
      const id=row.getAttribute('data-master')||row.id;
      if(!/^\d+$/.test(id)||seen.has(id))throw Error('Exophase 成就编号无效或重复。');
      seen.add(id);ids.push(id);
      const source=row.querySelector('img')?.getAttribute('src')||'';
      let image='';try{const url=new URL(source,'https://www.exophase.com');if(url.protocol==='https:')image=url.href;}catch{}
      const rawRarity=row.getAttribute('data-average'),rarity=rawRarity===null?NaN:Number(rawRarity);
      achievements.push({id,name:(row.querySelector('.award-title')?.textContent||'Achievement').trim(),description:(row.querySelector('.award-description')?.textContent||'').trim(),image,unlocked:false,unlockedAt:null,rarity:Number.isFinite(rarity)&&rarity>=0&&rarity<=100?rarity:null,groupId,points:Number(row.getAttribute('data-points'))||0});
    }
    groups.push({id:groupId,name,kind,achievementIds:ids,total:ids.length,earned:0});
  }
  if(!groups.length||groups.filter(g=>g.kind==='base').length!==1)throw Error('Exophase 本体分组不明确。');
  return {groups,achievements};
}

export function mergeAchievementPage(game:Game,page:PageData,earned:any[]):Game{
  const unlocked=new Map(earned.map(a=>[String(a.masterAwardId||a.awardid),a]));
  const achievements=page.achievements.map(a=>{
    const e=unlocked.get(a.id),time=Number(e?.timestamp);
    return {...a,image:safeImage(e?.icons?.m?`https://m.exophase.com${e.icons.m}`:'')||a.image,unlocked:!!e,unlockedAt:e&&Number.isFinite(time)&&time>0?new Date(time*1000).toISOString():null};
  });
  const groups=validateGroups(page.groups,achievements,game.total,game.earned);
  // Preserve summary counts if the metadata and unlock feeds are out of sync.
  if(!groups||[...unlocked.keys()].some(id=>!achievements.some(a=>a.id===id)))return {...game,achievements,groupStatus:'unavailable',groups:undefined};
  return {...game,achievements,groups,groupStatus:'verified'};
}
