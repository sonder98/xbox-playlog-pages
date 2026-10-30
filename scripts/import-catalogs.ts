import fs from 'node:fs';
import {parseCatalogBundle,mergeCatalogBundles} from './catalog-cache.ts';
const file=process.argv[2];if(!file)throw Error('请提供导出的成就目录 JSON 路径。');
const path='data/achievement-catalogs.json';
const next=parseCatalogBundle(JSON.parse(fs.readFileSync(file,'utf8')));
const old=fs.existsSync(path)?parseCatalogBundle(JSON.parse(fs.readFileSync(path,'utf8'))):{...next,catalogs:[]};
const merged=mergeCatalogBundles(old,next);fs.mkdirSync('data',{recursive:true});fs.writeFileSync(path,JSON.stringify(merged,null,2));
console.log(`目录校验通过：本次 ${next.catalogs.length} 个，合并后 ${merged.catalogs.length} 个。`);
