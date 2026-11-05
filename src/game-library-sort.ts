export type GameLibraryFilter='all'|'playing'|'mythic'|'full';
export type GameLibrarySort='recent'|'time'|'span-desc'|'span-asc'|'full-date-asc'|'full-date-desc'|'mythic-date-asc'|'mythic-date-desc';
export type GameLibrarySortOption=[GameLibrarySort,string];

const commonChoices:GameLibrarySortOption[]=[
 ['recent','最近游玩'],
 ['time','游玩时长'],
 ['span-desc','时间跨度：长 → 短'],
 ['span-asc','时间跨度：短 → 长'],
];
const fullDateChoices:GameLibrarySortOption[]=[
 ['full-date-asc','全成就日期：早 → 晚'],
 ['full-date-desc','全成就日期：晚 → 早'],
];
const mythicDateChoices:GameLibrarySortOption[]=[
 ['mythic-date-asc','Mythic 日期：早 → 晚'],
 ['mythic-date-desc','Mythic 日期：晚 → 早'],
];

/** Only expose completion dates when the selected library group gives them meaning. */
export function gameLibrarySortChoices(filter:GameLibraryFilter):GameLibrarySortOption[]{
 return [...commonChoices,...(filter==='full'?fullDateChoices:filter==='mythic'?mythicDateChoices:[])];
}

/** A group-specific sort cannot survive switching to a group where it is unavailable. */
export function normalizeGameLibrarySort(filter:GameLibraryFilter,sort:GameLibrarySort):GameLibrarySort{
 if((sort==='full-date-asc'||sort==='full-date-desc')&&filter!=='full')return 'recent';
 if((sort==='mythic-date-asc'||sort==='mythic-date-desc')&&filter!=='mythic')return 'recent';
 return sort;
}
