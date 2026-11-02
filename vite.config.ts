import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {execFileSync} from 'node:child_process';

// Build ID changes whenever new site code is deployed, while encrypted Xbox
// data continues to refresh independently without a full reload.
const version=process.env.GITHUB_SHA?.slice(0,12)||
 execFileSync('git',['rev-parse','--short=12','HEAD'],{encoding:'utf8'}).trim();
export default defineConfig({
 base:process.env.PLAYLOG_BASE||'/xbox-playlog-pages/',
 plugins:[
  react(),
  {name:'playlog-version-check',generateBundle(){
   this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({version})});
  }}
 ],
 define:{__PLAYLOG_BUILD_ID__:JSON.stringify(version)},
 server:{allowedHosts:['terminal.local']}
});
