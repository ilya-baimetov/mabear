import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'after';
if(!['before','after'].includes(phase))throw new Error('Use before or after');
const destination=`docs/interior-revision/${phase}`;
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8793/tools/interior-review.html');
 await page.waitForFunction(()=>!!(window as any).__interiorReview,null,{timeout:180000});
 await page.waitForTimeout(1500);
 const names=await page.evaluate(()=>Object.keys((window as any).__interiorReview.shots));
 const proof=[];
 for(const name of names){
  const result=await page.evaluate(name=>{const r=(window as any).__interiorReview,s=r.shots[name];r.render(s.t,s.camera,s.empty);return r.render(s.t,s.camera,s.empty);},name);
  await writeFile(`${destination}/${name}.png`,Buffer.from(result.png.split(',')[1],'base64'));const{png,...meta}=result;proof.push({name,...meta});
 }
 const video=await page.evaluate(()=>(window as any).__interiorReview.record());
 await writeFile(`${destination}/cozy-evening.webm`,Buffer.from(video.split(',')[1],'base64'));
 await writeFile(`${destination}/proof.json`,JSON.stringify({shots:proof,errors},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(`${destination}: ${names.length} frames and actual story playback captured`);
}finally{await browser.close();}
