import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
export default defineConfig({root:resolve(import.meta.dirname,'performance'),publicDir:false,plugins:[{
 name:'include-font-licenses',
 generateBundle(){for(const name of ['Nunito-OFL.txt','RubikOne-OFL.txt'])this.emitFile({type:'asset',fileName:`assets/${name}`,source:readFileSync(resolve(import.meta.dirname,'public/assets/brand',name),'utf8')});},
}],server:{host:'127.0.0.1',port:5184,strictPort:true,fs:{allow:['..']}},build:{outDir:'../dist-performance',emptyOutDir:true,chunkSizeWarningLimit:2000}});
