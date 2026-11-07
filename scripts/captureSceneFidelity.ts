import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:process.env.SCENE_PROOF_BACKEND==='software'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.env.SCENE_PROOF_URL??'http://127.0.0.1:5173'}/tools/scene-fidelity.html`);
 await page.waitForFunction(()=>!!(window as any).__sceneFidelity,null,{timeout:180000});
 const names=await page.evaluate(()=>Object.keys((window as any).__sceneFidelity.shots));const proof=[];
 await mkdir('docs/scene-fidelity/after',{recursive:true});
 for(const name of names){const result=await page.evaluate(name=>(window as any).__sceneFidelity.render(name),name);
  await writeFile(`docs/scene-fidelity/after/${name}.png`,Buffer.from(result.png.split(',')[1],'base64'));const{png,...meta}=result;proof.push({name,...meta});await writeFile('docs/scene-fidelity/proof.json',JSON.stringify({shots:proof,errors},null,2));console.log(name);}
 const performance=await page.evaluate(()=>(window as any).__sceneFidelity.bench('pond-story',8));
 await writeFile('docs/scene-fidelity/proof.json',JSON.stringify({shots:proof,errors,performance},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
