import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.addInitScript('globalThis.__name=x=>x');
 await page.goto(pathToFileURL(resolve('docs/cupboard/index.html')).href);await page.locator('summary').click();
 const results=[];
 for(const id of ['comparison','action','before','after']){
  await page.locator('#'+id).scrollIntoViewIfNeeded();
  const result=await page.evaluate(async id=>{
   const v=document.getElementById(id) as HTMLVideoElement;v.muted=true;await new Promise<void>((ok,fail)=>{if(v.readyState>=1)ok();else{v.onloadedmetadata=()=>ok();v.onerror=()=>fail(Error(v.error?.message));}});
   v.currentTime=Math.min(1,v.duration/2);await v.play();const start=v.currentTime;await new Promise(r=>setTimeout(r,350));v.pause();const advanced=v.currentTime>start;
   v.currentTime=Math.max(0,v.duration-.5);await new Promise<void>(ok=>{v.onseeked=()=>ok();});await v.play();await new Promise<void>((ok,fail)=>{v.onended=()=>ok();setTimeout(()=>v.ended?ok():fail(Error('Video did not reach the end')),3000);});
   return{id,duration:v.duration,width:v.videoWidth,height:v.videoHeight,advanced,ended:v.ended,error:v.error?.message??null};
  },id);if(!result.advanced||!result.ended||result.error)throw Error(JSON.stringify(result));results.push(result);
 }
 await writeFile('docs/cupboard/video-playback.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
