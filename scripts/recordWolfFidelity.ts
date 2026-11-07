import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:920}});
 await page.routeWebSocket('**', ws=>{
   const server=ws.connectToServer();
   server.onMessage(message=>{
    try {const value=JSON.parse(String(message));if(value.type==='update'||value.type==='full-reload')return;}catch{}
    ws.send(message);
   });
  });
  await page.goto('http://127.0.0.1:5173/tools/wolf-fidelity.html?variant=a');
 await page.waitForFunction(()=>!!(window as any).__ready,null,{timeout:120000});
 const base64=await page.evaluate(async()=>{
  const api=(window as any).__wolfFidelity;
  const source=document.querySelector('canvas')!;
  const out=document.createElement('canvas');out.width=1280;out.height=768;
  const ctx=out.getContext('2d')!;const stream=out.captureStream(0);
  const track=stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
  const chunks:Blob[]=[];recorder.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise<Blob>(resolve=>recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'})));
  recorder.start();
  const fps=12;
  for(let i=0;i<96;i++){
   const t=i/fps;
   const pose=t<3?'walk_to':t<5?'laugh':'stand_up';
   api.render({angle:t<3?'three':t<5?'face':'three',pose,time:t<3?t:t<5?t-3:(t-5)*4/3,emotion:t>=3&&t<5?'happy':'neutral'},false);
   ctx.fillStyle='#f6f7f2';ctx.fillRect(0,0,1280,48);ctx.fillStyle='#273b30';ctx.font='bold 17px system-ui';ctx.textAlign='center';
   ctx.fillText('BEFORE · original model',320,30);ctx.fillText('AFTER · rebuilt wolf',960,30);
   ctx.drawImage(source,0,48);track.requestFrame();
   await new Promise(r=>setTimeout(r,1000/fps));
  }
  recorder.stop();const blob=await done;stream.getTracks().forEach(t=>t.stop());
  return await new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve((r.result as string).split(',')[1]);r.readAsDataURL(blob)});
 });
 await writeFile('docs/wolf-fidelity/proof/wolf-before-after.webm',Buffer.from(base64,'base64'));
 console.log('Recorded actual rig animation: docs/wolf-fidelity/proof/wolf-before-after.webm');
}finally{await browser.close()}
