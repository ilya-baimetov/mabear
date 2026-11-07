import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Decode the delivered video completely, then extract two frames per labelled
// section. This verifies the file a reviewer receives, not replacement renders.
const input=path.resolve(process.argv[2]);
const metadata=JSON.parse(await readFile(path.resolve(process.argv[3]),'utf8'));
const output=path.resolve(process.argv[4]);await mkdir(output,{recursive:true});
const base=process.env.ANIMATION_PROOF_URL??'http://127.0.0.1:5185';
let offset=0;
const targets=metadata.sections.flatMap((section:{duration:number;label:string;start:number;time:number;dur:number;verb:string;putDown?:string})=>{
 const local=[section.duration*.28,section.duration*.72];
 if(section.putDown){const release=section.start-section.time+section.dur*.5;local.push(release-.05,release+.05,Math.min(section.duration-.05,release+.8));}
 if(section.verb==='fish'){const catchTime=section.start-section.time+section.dur*.7;local.push(.05,catchTime-.05,catchTime+.05,section.duration-.05);}
 if(section.verb==='clap')local.push(section.start-section.time+.3);
 const samples=[...new Set(local.filter(t=>t>0&&t<section.duration).map(t=>Number(t.toFixed(3))))].sort((a,b)=>a-b).map(t=>({time:Number((offset+t).toFixed(3)),label:section.label}));
 offset+=section.duration;return samples;
});
const browser=await chromium.launch({channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:900}});
 await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto(`${base}/tools/animation-story-video-review.html`);
 await page.evaluate(src=>{document.querySelector('video')!.src=src;},`${base}/@fs${input}`);
 await page.waitForFunction(()=>{const v=document.querySelector('video')!;return v.readyState>=2&&isFinite(v.duration);});
 const playback=await page.evaluate(async()=>{
  const v=document.querySelector('video')!,times:number[]=[];let previous=0,largestGap=0;
  const observe=(_now:number,meta:VideoFrameCallbackMetadata)=>{times.push(meta.mediaTime);if(previous)largestGap=Math.max(largestGap,meta.mediaTime-previous);previous=meta.mediaTime;if(!v.ended)v.requestVideoFrameCallback(observe);};
  v.requestVideoFrameCallback(observe);
  const ended=new Promise<void>((resolve,reject)=>{v.addEventListener('ended',()=>resolve(),{once:true});v.addEventListener('error',()=>reject(new Error('Video decode failed')),{once:true});});
  await v.play();await ended;const q=v.getVideoPlaybackQuality();
  return{duration:v.duration,width:v.videoWidth,height:v.videoHeight,decoded:q.totalVideoFrames,dropped:q.droppedVideoFrames,callbacks:times.length,largestFrameGap:largestGap,firstFrame:times[0],lastFrame:times.at(-1),ended:v.ended};
 });
 const thumbs:Buffer[]=[];
 for(const {time} of targets){
  const data=await page.evaluate(async(t:number)=>{const v=document.querySelector('video')!;v.pause();const seeked=new Promise<void>(r=>v.addEventListener('seeked',()=>r(),{once:true}));v.currentTime=Math.min(v.duration-.02,t);await seeked;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d')!.drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];},time);
  const bytes=Buffer.from(data,'base64');await writeFile(path.join(output,`frame-${time}.png`),bytes);
  thumbs.push(await sharp(bytes).resize({width:640}).png().toBuffer());
 }
 const height=(await sharp(thumbs[0]).metadata()).height!,columns=3,rows=Math.ceil(thumbs.length/columns);
 await sharp({create:{width:640*columns,height:height*rows,channels:3,background:'#ffffff'}}).composite(thumbs.map((thumb,i)=>({input:thumb,left:i%columns*640,top:Math.floor(i/columns)*height}))).png().toFile(path.join(output,'full-sequence-contact-sheet.png'));
 await writeFile(path.join(output,'review.json'),JSON.stringify({input,playback,targets},null,2));console.log(JSON.stringify(playback));
 if(!playback.ended||playback.decoded<2)throw new Error('Delivered video did not play completely');
}finally{await browser.close();}
