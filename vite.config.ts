import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// GitHub Pages uses the repository subpath; alternative free hosts deploy at domain root.
export default defineConfig({base:process.env.PLAYLOG_BASE||'/xbox-playlog-pages/',plugins:[react()],server:{allowedHosts:['terminal.local']}});
