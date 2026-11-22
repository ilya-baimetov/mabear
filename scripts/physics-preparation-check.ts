import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './parallel-interactions-utils';

// Real browser Worker, real loaded Masha rig, ordinary compiled continuity story.
// Rendering is frozen only for this CPU responsiveness measurement; the separate
// actual-story capture measures playback rendering and visible contacts.
const url=process.env.PREPARATION_URL??'http://127.0.0.1:8821';
const source=await sourceFingerprint(),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:810}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
  await page.goto(`${url}/tools/parallel-interactions.html?mode=animation`);
  await page.waitForFunction(()=>!!(window as any).__parallelTrial,null,{timeout:180000});
  const result=await page.evaluate(async()=>{
    const x=(window as any).__parallelTrial;x.player.frozen=true;
    const module='/src/engine/physics/stageReplay.ts';
    const {createStageReplay,createResponsiveStageReplay}=await import(module),timeline=x.stories.continuity;
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    async function measure(run:()=>Promise<void>|void){
      const gaps:number[]=[];let last=performance.now(),beats=0;
      const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;beats++;},4);
      await wait(20);gaps.length=0;beats=0;last=performance.now();const start=last;
      await run();const wallMs=performance.now()-start;await wait(12);clearInterval(timer);
      return {wallMs,maxMainThreadTimerGapMs:Math.max(...gaps),heartbeatCount:beats,gaps};
    }
    const sync=await createStageReplay(x.stage);
    const synchronous=await measure(()=>{sync.setTimeline(timeline);sync.evaluate(timeline,timeline.duration);});
    const expected=[0,2.337,timeline.duration,12.123].map(t=>sync.evaluate(timeline,t));sync.dispose();
    const worker=createResponsiveStageReplay(x.stage);
    const cold=await measure(async()=>{worker.setTimeline(timeline);await worker.whenReady();});
    const proof=worker.inspect(timeline,timeline.duration);
    if(proof.reason)throw Error(`Worker unexpectedly fell back: ${proof.reason}`);
    for(const [i,t] of [0,2.337,timeline.duration,12.123].entries())if(JSON.stringify(worker.evaluate(timeline,t))!==JSON.stringify(expected[i]))throw Error(`Worker/loaded-rig parity failed at ${t}`);
    const warm=await measure(()=>{worker.setTimeline(timeline);worker.evaluate(timeline,2.337);});
    const edited=structuredClone(timeline);edited.segments[0].segment.camera[0].from.fov+=.1;
    const reuse=await measure(async()=>{worker.setTimeline(edited);await worker.whenReady();});
    const cancel=structuredClone(timeline);cancel.segments[0].segment.camera[0].from.fov+=.2;
    worker.setTimeline(cancel);const cancelledRevision=worker.revision;
    const latest=structuredClone(timeline);latest.segments[0].segment.camera[0].from.fov+=.3;
    worker.setTimeline(latest);await worker.whenReady();const cancelled=worker.inspect(latest,3);
    if(cancelled.revision!==cancelledRevision+1||cancelled.reason)throw Error('Cancellation did not publish the latest story');
    const fallbacks:any[]=[];
    for(const id of ['cupboard','regression']){
      const start=performance.now();worker.setTimeline(x.stories[id]);const immediate=worker.ready;await worker.whenReady();
      fallbacks.push({id,immediate,wallMs:performance.now()-start,proof:worker.inspect(x.stories[id],0)});
      if(!immediate)throw Error(`Expected immediate authored fallback for ${id}`);
    }
    worker.dispose();
    const playerModule='/src/engine/player/player.ts',{Player}=await import(playerModule);
    const transport=createResponsiveStageReplay(x.stage),audioEvents:string[]=[];
    const audio={play:(_:unknown,t:number)=>audioEvents.push(`play:${t}`),stop:()=>audioEvents.push('stop'),pause:()=>audioEvents.push('pause'),resume:()=>audioEvents.push('resume'),updateListener:()=>{}};
    const player=new Player({stage:x.stage,audio,evaluator:transport});
    const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    try{
      player.setTimeline(x.stories.regression,'en');player.seek(1);await nextFrame();const held=player.frame;
      player.setTimeline(timeline,'en');player.play(2);
      const queued={preparing:player.isPreparing,time:player.time,playing:player.isPlaying,samePicture:player.frame===held,audioStarted:audioEvents.some(x=>x.startsWith('play:'))};
      if(!queued.preparing||queued.time!==2||!queued.playing||!queued.samePicture||queued.audioStarted)throw Error('Pending play leaked time, picture or audio');
      player.seek(7);player.seek(3.337);await transport.whenReady();await nextFrame();
      const seek={time:player.time,playing:player.isPlaying,frameT:player.frame.t,audioStarted:audioEvents.some(x=>x.startsWith('play:'))};
      if(seek.time!==3.337||seek.playing||seek.audioStarted)throw Error('Latest queued seek did not win');
      player.play(3.337);player.setTimeline(edited,'en');player.play(4);player.pause();player.setTimeline(latest,'en');player.seek(1);
      await transport.whenReady();await nextFrame();
      const paused={time:player.time,playing:player.isPlaying,playEvents:audioEvents.filter(x=>x.startsWith('play:'))};
      if(paused.time!==1||paused.playing||paused.playEvents.length!==1)throw Error('Edited pending play resumed after pause');
      return{info:x.info(),duration:timeline.duration,synchronous,cold,warm,reuse,proof,cancellation:{revision:cancelled.revision,reason:cancelled.reason},fallbacks,transport:{queued,seek,paused,audioEvents}};
    }finally{player.dispose();}
  });
  if(errors.length)throw Error(errors.join('\n'));
  await mkdir('docs/kitchen-bench/preparation',{recursive:true});
  const report={source,stable:source===await sourceFingerprint(),capturedAt:new Date().toISOString(),errors,...result};
  await writeFile('docs/kitchen-bench/preparation/proof.json',JSON.stringify(report,null,2));
  const timings=Object.fromEntries(['synchronous','cold','warm','reuse'].map(key=>{const {gaps,...summary}=(result as any)[key];return[key,summary];}));
  console.log(JSON.stringify({source,stable:report.stable,...timings,preparation:result.proof.preparation,cancellation:result.cancellation,fallbacks:result.fallbacks.map((x:any)=>({id:x.id,immediate:x.immediate,wallMs:x.wallMs})),transport:result.transport},null,2));
}finally{await browser.close();}
