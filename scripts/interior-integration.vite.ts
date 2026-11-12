import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],cacheDir:process.cwd().includes('mabear-interior-before')?'/tmp/mabear-vite-interior-before':'/tmp/mabear-vite-interior-after',server:{hmr:false}});
