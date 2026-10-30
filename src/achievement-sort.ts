import type {Achievement} from './data.ts';
export type AchievementSort='date-desc'|'date-asc'|'rarity-asc'|'rarity-desc';
export function sortAchievements(items:Achievement[],order:AchievementSort):Achievement[]{
  const time=(a:Achievement)=>a.unlocked&&a.unlockedAt&&Number.isFinite(Date.parse(a.unlockedAt))?Date.parse(a.unlockedAt):null;
  const rarity=(a:Achievement)=>a.rarity!==null&&Number.isFinite(a.rarity)?a.rarity:null;
  return items.map((a,index)=>({a,index})).sort((left,right)=>{
    const a=left.a,b=right.a;
    const x=order.startsWith('date')?time(a):rarity(a),y=order.startsWith('date')?time(b):rarity(b);
    if(x===null&&y!==null)return 1;
    if(y===null&&x!==null)return -1;
    if(x!==null&&y!==null&&x!==y)return order.endsWith('asc')?x-y:y-x;
    if(order.startsWith('date')&&a.unlocked!==b.unlocked)return a.unlocked?-1:1;
    return left.index-right.index;
  }).map(({a})=>a);
}
