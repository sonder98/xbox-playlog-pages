import fs from 'node:fs';
import {credentials} from './microsoft-credentials.ts';
import {scanMicrosoft} from './microsoft-library.ts';
import {australianArtwork} from './microsoft-artwork.ts';
import {readState,writeState} from './microsoft-state.ts';
import {getPasswords,readVault} from './password.ts';
import {publishSnapshot} from './snapshot.ts';
import {cacheRecordImages} from './image-cache.ts';
const session=await credentials(process.env),{old,target}=getPasswords(process.env);
const root=process.env.MICROSOFT_STATE_DIR||'.private/microsoft',key=process.env.MICROSOFT_STATE_KEY!;
const saved=readState(root+'/candidate.json',key);
const previous=fs.existsSync('public/vault.json')?(await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target)).records:[];
const fresh=saved?.record?.games?.some((g:any)=>g.cachedImage)&&Date.now()-Date.parse(saved.record.at)<20*60_000?saved.record:previous[0];
if(fresh?.source==='Xbox'&&Date.now()-Date.parse(fresh.at)<20*60_000){
 await cacheRecordImages(fresh);
 await publishSnapshot(fresh,previous.filter((r:any)=>r.id!==fresh.id).slice(0,29),target);console.log('复用刚完成的微软快照。');process.exit(0);
}
const result=await scanMicrosoft(session.config,{previous:saved?.record,expectedOwner:session.state.owner,progress:(n,total)=>{if(n%20===0||n===total)console.log(`微软同步 ${n}/${total}`);}});
if(result.audit.failed||result.audit.interrupted||result.audit.historySourcesFailed)throw Error('微软同步未完整完成。');
const artwork=await australianArtwork(result.record);
console.log('澳区英文封面覆盖：'+JSON.stringify(artwork));
result.record.games=result.record.games.filter(g=>g.total>0||g.minutes!==null);
await cacheRecordImages(result.record);
writeState(root+'/candidate.json',result,key);session.save();
await publishSnapshot(result.record,previous.slice(0,29),target);
console.log('微软正式同步完成：'+JSON.stringify({games:result.record.games.length,achievements:result.audit.rarityAchievements,baseGroups:result.audit.officialBaseGroups,dlcGroups:result.audit.officialAddonGroups,artwork}));
