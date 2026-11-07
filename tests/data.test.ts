import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTitles,parseStats,validateRecord,compareRecords,officialGameVisible,syncMechanismLabel,distinctScreenshotIndices,type RecordData} from '../src/data.ts';
const game={id:'123',name:'测试',image:'',devices:[],lastPlayed:null,minutes:100,earned:2,total:10,score:20,maxScore:100};
const record=(gs:any[]):RecordData=>({id:'a',at:'2026-10-30T00:00:00Z',profile:{xuid:'2530000000000000',gamertag:'Tester',avatar:''},games:gs,source:'OpenXBL',warnings:[]});
test('first snapshot is baseline; new games do not inflate delta',()=>{assert.equal(compareRecords(record([game])).minutes,null);assert.equal(compareRecords(record([{...game,minutes:160},{...game,id:'456',minutes:5000}]),record([game])).minutes,60)});
test('missing values and downward corrections are handled explicitly',()=>{const d=compareRecords(record([{...game,minutes:50}]),record([game]));assert.equal(d.minutes,0);assert.equal(d.corrections,1);assert.equal(compareRecords(record([{...game,minutes:null}]),record([game])).minutes,0)});
test('Xbox hidden titles remain in encrypted records with an explicit visibility flag',()=>{const g=normalizeTitles({titles:[{titleId:'123',name:'Game',titleHistory:{visible:true}},{titleId:'456',type:'App'},{titleId:'789',name:'Private Game',titleHistory:{visible:false}},{titleId:'555',name:'Unknown'}]});assert.equal(g.length,3);assert.equal(g[0].minutes,null);assert.equal(g[0].officialHidden,false);assert.equal(g[1].officialHidden,true);assert.equal(g[2].officialHidden,undefined);assert.throws(()=>normalizeTitles({}));const saved=validateRecord(record(g));assert.equal(saved.games[1].officialHidden,true);assert.equal(saved.games[0].officialHidden,false);assert.equal(saved.games[2].officialHidden,undefined);});
test('encrypted record validation retains only genuine locked achievement progress and scan status',()=>{
 const example={...game,progressScanVersion:1,achievements:[
  {id:'1',name:'FH4 coop',image:'',rarity:12,unlocked:false,unlockedAt:null,progressPercent:80},
  {id:'2',name:'Earned',image:'',rarity:8,unlocked:true,unlockedAt:'2026-11-01T10:00:00Z',progressPercent:100},
  {id:'3',name:'Unknown',image:'',rarity:null,unlocked:false,unlockedAt:null,progressPercent:-1},
  {id:'4',name:'Over limit',image:'',rarity:null,unlocked:false,unlockedAt:null,progressPercent:120}
 ]};
 const valid=validateRecord(record([example])).games[0];
 assert.equal(valid.progressScanVersion,1);
 assert.deepEqual(valid.achievements?.map(a=>a.progressPercent),[80,undefined,undefined,undefined]);
 assert.equal(validateRecord(record([{...example,progressScanVersion:2}])).games[0].progressScanVersion,undefined);
});
test('stats parse zero, reject invalid values',()=>assert.deepEqual(parseStats({users:[{titles:[{titleId:'123',stats:[{name:'MinutesPlayed',value:'0'}]},{titleId:'456',stats:[{name:'MinutesPlayed',value:'bad'}]}]}]}),{'123':0}));
test('import rejects duplicate IDs and invalid minutes; filters image URLs',()=>{assert.throws(()=>validateRecord(record([game,game])));assert.throws(()=>validateRecord(record([{...game,minutes:-1}])));assert.equal(validateRecord(record([{...game,image:'javascript:alert(1)'}])).games[0].image,'')});

test('Only explicit Xbox visibility allows display; archived unknown games retain data',()=>{
 const visible={...game,officialHidden:false},hidden={...game,officialHidden:true},unknown={...game};
 assert.equal(officialGameVisible(visible,'Xbox'),true);
 assert.equal(officialGameVisible(hidden,'Xbox'),false);
 assert.equal(officialGameVisible(unknown,'Xbox'),false);
 assert.equal(officialGameVisible(unknown,'Exophase'),true);
 assert.equal(officialGameVisible(hidden,'导入'),false);
 assert.equal(validateRecord(record([unknown])).games.length,1);
});

test('independent promotional backdrop URLs are retained only when safe, not conflated with square covers',()=>{
 const poster={...game,posterImage:'https://store-images.s-microsoft.com/hero',cachedPosterImage:'https://sonder98.github.io/xbox-playlog-pages/media/asset.webp',posterImagePurpose:'SuperHeroArt'};
 const result=validateRecord(record([poster])).games[0];
 assert.equal(result.posterImage,poster.posterImage);
 assert.equal(result.cachedPosterImage,poster.cachedPosterImage);
 assert.equal(result.posterImagePurpose,'SuperHeroArt');
 assert.equal(validateRecord(record([{...poster,posterImage:'javascript:alert(1)'}])).games[0].posterImage,undefined);
});

test('AU screenshot selection version survives an encrypted-record validation round trip',()=>{
 const poster={...game,posterImage:'https://store-images.s-microsoft.com/shot',
  posterImagePurpose:'Screenshot',posterSelectionVersion:2};
 const result=validateRecord(record([poster])).games[0];
 assert.equal(result.posterImagePurpose,'Screenshot');
 assert.equal(result.posterSelectionVersion,2);
 assert.equal(validateRecord(record([{...poster,posterSelectionVersion:99}])).games[0].posterSelectionVersion,undefined);
});

test('rotating Mythic screenshot URLs survive record validation without index reordering',()=>{
 const g={...game,posterSelectionVersion:3,posterRotationStartDay:'2026-11-06',
  posterScreenshots:['https://store-images.s-microsoft.com/a','https://store-images.s-microsoft.com/b'],
  cachedPosterScreenshots:['https://cache.test/a.webp',''],
  cachedPosterScreenshotsSmall:['https://cache.test/a-480.webp','']};
 const valid=validateRecord(record([g])).games[0];
 assert.equal(valid.posterSelectionVersion,3);
 assert.equal(valid.posterRotationStartDay,'2026-11-06');
 assert.deepEqual(valid.posterScreenshots,g.posterScreenshots);
 assert.deepEqual(valid.cachedPosterScreenshots,g.cachedPosterScreenshots);
 assert.deepEqual(valid.cachedPosterScreenshotsSmall,g.cachedPosterScreenshotsSmall);
 assert.deepEqual(validateRecord(record([{...g,cachedPosterScreenshotsSmall:['javascript:invalid','']}])).games[0].cachedPosterScreenshotsSmall,['','']);
 assert.equal(validateRecord(record([{...g,posterRotationStartDay:'yesterday'}])).games[0].posterRotationStartDay,undefined);
});

test('snapshot sync trigger is validated; all three sources and code-change have honest labels',()=>{
 for(const [trigger,label] of [
  ['cloudflare','Cloudflare 自动同步'],
  ['manual','手动同步'],
  ['day-boundary','跨天触发同步'],
  ['code-update','代码更新触发']
 ] as const){
  const valid=validateRecord({...record([game]),syncMechanism:trigger});
  assert.equal(valid.syncMechanism,trigger);
  assert.equal(syncMechanismLabel(valid.syncMechanism),label);
 }
 assert.equal(syncMechanismLabel(validateRecord(record([game])).syncMechanism),'来源未记录',
  'Legacy encrypted history must not infer a trigger from the clock');
 assert.equal(validateRecord({...record([game]),syncMechanism:'untrusted'}).syncMechanism,undefined);
});

test('cached Xbox player avatar survives record validation and rejects invalid URLs',()=>{
 const input={...record([game]),profile:{...record([game]).profile,avatar:'https://images-eds-ssl.xboxlive.com/image?key=original',
 cachedAvatar:'https://sonder98.github.io/xbox-playlog-pages/media/11223344556677889900112233445566-96.webp'}};
 assert.equal(validateRecord(input).profile.cachedAvatar,input.profile.cachedAvatar);
 assert.equal(validateRecord({...input,profile:{...input.profile,cachedAvatar:'javascript:bad'}}).profile.cachedAvatar,undefined);
});
test('Store screenshots are distinct by underlying asset, not CDN resizing query',()=>{
 const urls=['https://store-images.s-microsoft.com/image/apps.abc?w=720',
  'https://store-images.s-microsoft.com/image/apps.abc?w=1440',
  'https://store-images.s-microsoft.com/image/apps.def?w=720',
  'https://store-images.s-microsoft.com/image/apps.def?w=1440',
  'https://store-images.s-microsoft.com/image/apps.xyz?w=720'];
 assert.deepEqual(distinctScreenshotIndices(urls),[0,2,4]);
 assert.deepEqual(distinctScreenshotIndices([]),[]);
});
