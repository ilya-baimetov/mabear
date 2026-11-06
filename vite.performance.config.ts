import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({root:resolve(import.meta.dirname,'performance'),publicDir:false,server:{host:'127.0.0.1',port:5184,strictPort:true,fs:{allow:['..']}},build:{outDir:'../dist-performance',emptyOutDir:true,chunkSizeWarningLimit:2000}});
