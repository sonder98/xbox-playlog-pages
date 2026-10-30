import type {Game,AchievementGroup} from './data.ts';

/** Unknown grouping stays unknown: totals alone cannot identify original achievements. */
export function completion(game:Game){
  const full=game.total>0&&game.earned>=game.total;
  const base=game.groupStatus==='verified'?game.groups?.find(g=>g.kind==='base'):undefined;
  const mythic=base?base.total>0&&base.earned===base.total:full;
  return {full,mythic,known:!!base||full,base,earned:base?.earned??game.earned,total:base?.total??game.total};
}

export function validateGroups(input:unknown,achievements:Game['achievements'],total:number,earned:number):AchievementGroup[]|undefined{
  if(!Array.isArray(input)||!input.length||!achievements?.length)return;
  const byId=new Map(achievements.map(a=>[a.id,a]));
  if(byId.size!==achievements.length)return;
  const seen=new Set<string>(),groupIds=new Set<string>();
  const groups:AchievementGroup[]=[];
  for(const value of input){
    if(!value||typeof value.id!=='string'||groupIds.has(value.id)||!['base','dlc','update'].includes(value.kind)||!Array.isArray(value.achievementIds)||!value.achievementIds.length)return;
    groupIds.add(value.id);
    const ids=value.achievementIds.map(String);
    if(ids.some((id:string)=>!byId.has(id)||seen.has(id)))return;
    for(const id of ids){if(seen.has(id))return;seen.add(id);}
    groups.push({id:value.id.slice(0,200),name:String(value.name||'追加内容').slice(0,300),kind:value.kind,achievementIds:ids,total:ids.length,earned:ids.filter((id:string)=>byId.get(id)?.unlocked).length});
  }
  if(groups.filter(g=>g.kind==='base').length!==1||seen.size!==total||seen.size!==byId.size||groups.reduce((sum,g)=>sum+g.earned,0)!==earned)return;
  return groups;
}
