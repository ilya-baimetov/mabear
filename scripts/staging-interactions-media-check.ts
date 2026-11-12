import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'before',folder=`docs/staging-interactions/${phase}`;
const paired=phase==='comparison';
const info=JSON.parse(await readFile(`${folder}/${paired?'alignment':'recordings'}.json`,'utf8'));
const recordings=paired?info.results.map((r:any)=>({story:r.filename,filename:r.filename,duration:r.alignment.reduce((sum:number,c:any)=>sum+Math.max(...c.sides.map((s:any)=>s.end-s.start)),0),tolerance:r.alignment.length>1?5:.5})):info.recordings;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const checks=[];
 for(const r of recordings){
  await page.setContent(`<video muted preload="auto" src="${process.env.STAGING_INTERACTIONS_URL??'http://127.0.0.1:8797'}/${folder}/${r.filename}"></video>`);
  await page.waitForFunction(()=>document.querySelector('video')!.readyState>=2);
  const meta=await page.evaluate(async()=>{const v=document.querySelector('video')!;await v.play();await new Promise(resolve=>setTimeout(resolve,350));v.pause();return{duration:v.duration,width:v.videoWidth,height:v.videoHeight,advanced:v.currentTime,decoded:v.getVideoPlaybackQuality().totalVideoFrames};});
  if(meta.width!==1280||meta.height!==(paired?440:768)||meta.advanced<.1||meta.decoded<3||Math.abs(meta.duration-r.duration)>(r.tolerance??.2))throw new Error(JSON.stringify({story:r.story,meta,expected:r.duration}));
  let tailCheck=null;
  if(r.filename==='staging-before-after-montage.mp4'){
   tailCheck=await page.evaluate(async()=>{const v=document.querySelector('video')!;await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=v.duration-.45;});return{time:v.currentTime,duration:v.duration,ready:v.readyState};});
   if(tailCheck.ready<2||tailCheck.time<tailCheck.duration-1)throw new Error('Montage tail seek failed');
   await page.waitForTimeout(80);await page.locator('video').screenshot({path:`${folder}/montage-tail.png`});
  }
  checks.push({story:r.story,...meta,...(tailCheck?{tailCheck}:{})});
 }
 await writeFile(`${folder}/media-checks.json`,JSON.stringify({checks},null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();}
