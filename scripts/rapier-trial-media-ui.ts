import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8801/docs/rapier-trial/index.html');
 const videos=page.locator('video'),proofs=[];
 for(let i=0;i<await videos.count();i++){
  const video=videos.nth(i);await video.scrollIntoViewIfNeeded();await video.evaluate((v:HTMLVideoElement)=>new Promise<void>((resolve,reject)=>{if(v.readyState>=1)return resolve();v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(Error('Video load failed'));}));
  await video.evaluate((v:HTMLVideoElement)=>v.play());await page.waitForFunction(i=>document.querySelectorAll('video')[i].currentTime>.08,i,{timeout:15000});
  const playing=await video.evaluate((v:HTMLVideoElement)=>({time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused}));
  if(playing.paused||playing.time<=0)throw Error(`Playback ${i} did not advance: ${JSON.stringify(playing)}`);
  await video.evaluate((v:HTMLVideoElement)=>{v.pause();v.currentTime=Math.max(0,v.duration-.3);});await page.waitForFunction(i=>{const v=document.querySelectorAll('video')[i];return !v.seeking&&v.readyState>=2;},i,{timeout:15000});
  const end=await video.evaluate((v:HTMLVideoElement)=>({time:v.currentTime,ready:v.readyState,error:v.error?.message??null}));
  if(end.error||end.ready<2)throw Error(`Seek ${i} did not load a frame: ${JSON.stringify(end)}`);
  proofs.push({playing,end});await video.evaluate((v:HTMLVideoElement)=>{v.currentTime=0;});
 }
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/rapier-trial/report-preview.png'});
 await writeFile('docs/rapier-trial/media-ui-check.json',JSON.stringify({proofs,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log(`Verified ${proofs.length} native video players: play, pause, seek and reset.`);
}finally{await browser.close();}
