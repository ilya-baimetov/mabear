import type * as THREE from 'three';

/** Records the live WebGL renderers; no generated or pre-rendered substitute. */
export async function captureComparison(api:{
 renderers:THREE.WebGLRenderer[];
 cameras:THREE.PerspectiveCamera[];
 setScene(scene:'face'|'hold'|'clap',camera:string):void;
 renderAt(time:number):void;
}):Promise<Blob>{
 if(typeof MediaRecorder==='undefined')throw new Error('Video recording is not supported in this browser.');
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw new Error('Video recording is not supported in this browser.');
 const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=850;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Video recording could not create its canvas.');
 const chunks:BlobPart[]=[];
 const old=api.renderers.map((r,i)=>({width:r.domElement.clientWidth,height:r.domElement.clientHeight,ratio:r.getPixelRatio(),aspect:api.cameras[i].aspect}));
 let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,animationFrame:number|undefined;
 try{
  stream=canvas.captureStream(30);
  const encoder=recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:9_000_000});
  api.renderers.forEach((r,i)=>{r.setPixelRatio(1);r.setSize(930,620,false);api.cameras[i].aspect=930/620;api.cameras[i].updateProjectionMatrix();});
  return await new Promise<Blob>((resolve,reject)=>{
   let settled=false,stage=-1;const start=performance.now();
   const fail=(error:unknown)=>{if(settled)return;settled=true;reject(error);};
   encoder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   encoder.onstop=()=>{if(!settled){settled=true;resolve(new Blob(chunks,{type:mime}));}};
   encoder.onerror=()=>fail(new Error('Video recording failed.'));
   const tick=()=>{
    animationFrame=undefined;if(settled)return;
    try{
     const elapsed=(performance.now()-start)/1000,index=elapsed<12?0:elapsed<18?1:elapsed<21?2:3;
     if(stage!==index){stage=index;api.setScene(index===0?'face':index===1?'hold':'clap',index===1||index===3?'three':'front');}
     api.renderAt(index===0?elapsed:index===1?elapsed-12:elapsed-18);
     ctx.fillStyle='#fff5da';ctx.fillRect(0,0,1920,850);
     ctx.fillStyle='#54295e';ctx.font='30px "Rubik One", sans-serif';ctx.fillText('MASHA / EXPRESSION & CONTACT',30,48);
     ctx.font='800 22px Nunito, sans-serif';ctx.fillText('BEFORE · Current game',30,95);ctx.fillStyle='#b32262';ctx.fillText('AFTER · New Masha candidate',990,95);
     api.renderers.forEach((r,i)=>ctx.drawImage(r.domElement,i===0?30:990,120,900,600));
     ctx.fillStyle='#54295e';ctx.font='800 26px Nunito, sans-serif';ctx.fillText(['Curiosity, delight, surprise and a playful smile','A secure grasp and hand-to-mouth contact','Palms meet, hold and separate','The same clap, from an oblique angle'][index],30,773);
     ctx.fillStyle='#796181';ctx.font='600 19px Nunito, sans-serif';ctx.fillText('Actual real-time 3D · Identical acting inputs, camera and lighting · Silent study · Masha only',30,815);
     if(elapsed<24)animationFrame=requestAnimationFrame(tick);else encoder.stop();
    }catch(error){fail(error);}
   };
   encoder.start();tick();
  });
 }finally{
  if(animationFrame!==undefined)cancelAnimationFrame(animationFrame);
  if(recorder){
   recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;
   if(recorder.state==='recording'||recorder.state==='paused'){try{recorder.stop();}catch{/* Tracks still need to be released if the encoder failed. */}}
  }
  stream?.getTracks().forEach(track=>track.stop());
  api.renderers.forEach((r,i)=>{r.setPixelRatio(old[i].ratio);r.setSize(old[i].width,old[i].height,false);api.cameras[i].aspect=old[i].aspect;api.cameras[i].updateProjectionMatrix();});
 }
}
