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
 }else if(process.argv[2]==='scan'){
  const {old,target}=getPasswords(process.env),session=await credentials(process.env),stateKey=process.env.MICROSOFT_STATE_KEY!;
  const previous=readState(root+'/candidate.json',stateKey)?.record as RecordData|undefined;
  const baseline=fs.existsSync('public/vault.json')?(await readVault(JSON.parse(fs.readFileSync('public/vault.json','utf8')),old,target)).records?.[0]:undefined;
  const catalog=fs.existsSync('data/achievement-catalogs.json')?parseCatalogBundle(JSON.parse(fs.readFileSync('data/achievement-catalogs.json','utf8'))):undefined;
  const result=await scanMicrosoft(session.config,{previous,baseline,catalog,expectedOwner:session.state.owner,progress:(n,total,audit)=>{if(n%10===0||n===total)console.log(`微软全库核对进度：${n}/${total}；已核验 ${audit.complete}，官方分组 ${audit.officialBaseGroups}，稀有度 ${audit.rarityTitles}，时长 ${audit.playtimeTitles}，失败 ${audit.failed}`);if(n===10)console.log('微软接口结构诊断：'+JSON.stringify(audit.diagnostics));}});
  if(!session.state.owner||session.state.owner!==result.record.profile.xuid)throw Error('微软账号校验未通过；未保存候选记录。');
  // Candidate records are encrypted server-only state, separate from the production vault.
  writeState(root+'/candidate.json',result,stateKey);session.save();
  summary('微软全库只读核对完成；以下仅包含数量和覆盖情况，网站仍使用 Exophase。');summary(JSON.stringify(result.audit,null,2));
  if(result.audit.interrupted||result.audit.failed||result.audit.processed<result.audit.titles)process.exitCode=1;
 }else throw Error('微软工作流模式无效。');
}catch(error){
 // Do not print upstream response bodies, stack traces, account identifiers, or token values.
 const message=error instanceof Error?error.message:'';
 const safe=/^(微软|Xbox |APP_PASSWORD |NEW_APP_PASSWORD |旧密码|无法解密历史|历史记录格式)/.test(message)?message:'微软核对失败；未输出账号数据或凭据，未覆盖现有网站。';
 summary(safe);process.exitCode=1;
}
