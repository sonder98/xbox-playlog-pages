import fs from 'node:fs';
import {appendFileSync} from 'node:fs';
import {confirmOwner,credentials} from './microsoft-credentials.ts';
import {readState,writeState} from './microsoft-state.ts';
import {scanMicrosoft,compareLibrary,titleAliases} from './microsoft-library.ts';
import {microsoftProvider} from './microsoft.ts';
import {readVault,getPasswords} from './password.ts';
import {parseCatalogBundle} from './catalog-cache.ts';
import type {RecordData} from '../src/data.ts';
const summary=(value:string)=>{console.log(value);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,value+'\n');};
const root=process.env.MICROSOFT_STATE_DIR||'.private/microsoft';
try{
 if(process.argv[2]==='authorize'){
  await confirmOwner(process.env,process.env.XBOX_DEVICE_LOGIN==='true');
  summary('微软授权已验证并加密保存，等待缓存检查点完成。未修改网站数据。');
 }else if(process.argv[2]==='compare'){
  const {old,target}=getPasswords(process.env),session=await credentials(process.env),stateKey=process.env.MICROSOFT_STATE_KEY!;
  const candidate=readState(root+'/candidate.json',stateKey);if(!candidate?.record?.games)throw Error('微软尚未完成全库候选快照。');
  const provider=await microsoftProvider(session.config);await provider.call('/account');
  if(provider.xuid!==session.state.owner||provider.xuid!==candidate.record.profile.xuid)throw Error('微软账号校验未通过；未修改候选记录。');
  const baseline=(await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target)).records?.[0];
  const aliases=await titleAliases(p=>provider.call(p));candidate.audit.comparison=compareLibrary(candidate.record.games,baseline,aliases);
  writeState(root+'/candidate.json',candidate,stateKey);session.save();summary('微软候选记录与 Exophase 核对（含同一 Title ID 的官方英文别名；未修改网站）：');summary(JSON.stringify(candidate.audit,null,2));
 }else if(process.argv[2]==='scan'||process.argv[2]==='repair'){
  const {old,target}=getPasswords(process.env),session=await credentials(process.env),stateKey=process.env.MICROSOFT_STATE_KEY!;
  const saved=readState(root+'/candidate.json',stateKey),previous=saved?.record as RecordData|undefined;
  const onlyIds=process.argv[2]==='repair'?new Set<string>((previous?.games||[]).filter(g=>!g.achievements?.length&&g.total===0).map(g=>g.id)):undefined;
  if(onlyIds&&!onlyIds.size)throw Error('微软候选快照没有需要补查的空目录。');
  const baseline=fs.existsSync('public/vault.json')?(await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target)).records?.[0]:undefined;
  const catalog=fs.existsSync('data/achievement-catalogs.json')?parseCatalogBundle(JSON.parse(fs.readFileSync('data/achievement-catalogs.json','utf8'))):undefined;
  const result=await scanMicrosoft(session.config,{previous,baseline,catalog,onlyIds,expectedOwner:session.state.owner,progress:(n,total,audit)=>{if(n%10===0||n===total)console.log(`微软全库核对进度：${n}/${total}；已核验 ${audit.complete}，官方分组 ${audit.officialBaseGroups}，稀有度 ${audit.rarityTitles}，时长 ${audit.playtimeTitles}，失败 ${audit.failed}`);if(n===10)console.log('微软接口结构诊断：'+JSON.stringify(audit.diagnostics));}});
  if(!session.state.owner||session.state.owner!==result.record.profile.xuid)throw Error('微软账号校验未通过；未保存候选记录。');
  // Candidate records are encrypted server-only state, separate from the production vault.
  if(onlyIds&&saved){
   const games=result.record.games,awards=games.flatMap(g=>g.achievements||[]),recovered=games.filter(g=>onlyIds.has(g.id)&&!!g.achievements?.length).length;
   const audit={...saved.audit,repair:{attempted:onlyIds.size,recovered,remaining:onlyIds.size-recovered,failed:result.audit.failed},legacy:(saved.audit.legacy||0)+result.audit.legacy,officialBaseGroups:(saved.audit.officialBaseGroups||0)+result.audit.officialBaseGroups,officialAddonGroups:(saved.audit.officialAddonGroups||0)+result.audit.officialAddonGroups,failed:result.audit.failed,rarityTitles:games.filter(g=>g.achievements?.some(a=>a.rarity!==null)).length,rarityAchievements:awards.filter(a=>a.rarity!==null).length,images:awards.filter(a=>!!a.image).length,unlockDates:awards.filter(a=>!!a.unlockedAt).length,playtimeTitles:games.filter(g=>g.minutes!==null).length,unknownGroups:games.filter(g=>g.groupStatus!=='verified').length,catalogGroups:(saved.audit.catalogGroups||0)+result.audit.catalogGroups,comparison:result.audit.comparison};
   writeState(root+'/candidate.json',{record:result.record,audit},stateKey);Object.assign(result.audit,audit);
  }else writeState(root+'/candidate.json',result,stateKey);session.save();
  summary('微软全库只读核对完成；以下仅包含数量和覆盖情况，网站仍使用 Exophase。');summary(JSON.stringify(result.audit,null,2));
  if(result.audit.interrupted||result.audit.failed||result.audit.processed<result.audit.titles)process.exitCode=1;
 }else throw Error('微软工作流模式无效。');
}catch(error){
 // Do not print upstream response bodies, stack traces, account identifiers, or token values.
 const message=error instanceof Error?error.message:'';
 const safe=/^(微软|Xbox |APP_PASSWORD |NEW_APP_PASSWORD |旧密码|无法解密历史|历史记录格式)/.test(message)?message:'微软核对失败；未输出账号数据或凭据，未覆盖现有网站。';
 summary(safe);process.exitCode=1;
}
