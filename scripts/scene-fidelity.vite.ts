import {defineConfig} from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'.scene-proof',emptyOutDir:true,rolldownOptions:{input:'tools/scene-fidelity.html'}}});
