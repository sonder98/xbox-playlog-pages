import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/xbox-playlog-pages/',plugins:[react()],server:{allowedHosts:['terminal.local']}});
