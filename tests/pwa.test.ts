import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('PWA installs as a standalone app at both GitHub subpath and hosting root',()=>{
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.name,'游迹 · Xbox Playlog');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.scope,'./');
 assert.ok(manifest.icons.some((icon:any)=>icon.sizes==='192x192'));
 assert.ok(manifest.icons.some((icon:any)=>icon.sizes==='512x512'));
 const html=readFileSync('index.html','utf8');
 assert.ok(html.includes('%BASE_URL%manifest.webmanifest'));
 assert.ok(html.includes('%BASE_URL%apple-touch-icon.png'));
 const vite=readFileSync('vite.config.ts','utf8');
 assert.ok(vite.includes("process.env.PLAYLOG_BASE||'/xbox-playlog-pages/'"));
});
test('PWA never caches encrypted private snapshots or authorization state',()=>{
 const worker=readFileSync('public/sw.js','utf8');
 assert.ok(worker.includes('isRecord(url)'));
 assert.ok(worker.includes("if (!withinApp(url) || isRecord(url)"));
 assert.ok(!worker.includes("cache.addAll(['vault.json'"));
 assert.ok(worker.includes('request.mode === \'navigate\''));
 const entry=readFileSync('src/main.tsx','utf8');
 assert.ok(entry.includes("navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js'"));
});
test('PWA icons are generated from local SVG via existing Sharp dependency',()=>{
 const build=JSON.parse(readFileSync('package.json','utf8')).scripts.build;
 assert.ok(build.startsWith('node --experimental-strip-types scripts/generate-pwa-icons.ts'));
 const generator=readFileSync('scripts/generate-pwa-icons.ts','utf8');
 for(const file of ['pwa-192.png','pwa-512.png','apple-touch-icon.png'])assert.ok(generator.includes(file));
});
