import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['tools/interior-blockout.ts'],bundle:true,format:'iife',target:'es2022',minify:true,write:false});
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
let html=await readFile('tools/interior-blockout.html','utf8');
html=html.replaceAll('../docs/yard-reference/frames/','../yard-reference/frames/').replaceAll('../docs/interior-macro-reference/','../interior-macro-reference/').replace('<script type="module" src="./interior-blockout.ts"></script>',()=>`<script>${script}</script>`);
await writeFile('docs/interior-reference/blockout.html',html);
console.log('Built standalone layout study: docs/interior-reference/blockout.html');
