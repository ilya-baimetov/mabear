import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {getFixture} from '../src/director/fixtures';
import {DEFAULT_REMIX,type CamKey} from '../src/shared/schema';
import {evaluate} from '../src/engine/player/evaluate';
const canvas=document.querySelector('canvas')!;
const stage=await createStage(canvas);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const fixture=getFixture('cozy_evening','en')!;
const timeline=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
function render(t:number,camera?:CamKey,empty=false){
 const frame=evaluate(timeline,t);
 if(camera)frame.camera=camera;
 if(empty){frame.cast=[];frame.fx=[];for(const prop of Object.values(frame.props))prop.visible=false;}
 stage.render(frame);
 return{camera:frame.camera,t,png:canvas.toDataURL(),stats:stage.stats()};
}
const shots={
 story:{t:12.484},
 seated:{t:20.822},
 room:{t:12.484,camera:{pos:[-5.4,1.65,-3.8],look:[-8.15,1.25,-7],fov:56,location:'house'} as CamKey,empty:true},
 kitchen:{t:12.484,camera:{pos:[-6.2,1.85,-4.4],look:[-3.95,1.5,-7.65],fov:54,location:'house'} as CamKey,empty:true},
};
(window as any).__interiorReview={stage,timeline,render,shots,windowView(camera:CamKey){
 const frame=evaluate(timeline,12.484);frame.camera=camera;frame.cast=[];frame.fx=[];for(const prop of Object.values(frame.props))prop.visible=false;
 frame.lighting={from:'day',to:'day',k:1};stage.render(frame);stage.render(frame);return canvas.toDataURL();
},async record(start=9,duration=15){
 const stream=canvas.captureStream(30),chunks:BlobPart[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5_000_000});
 recorder.ondataavailable=e=>chunks.push(e.data);
 const done=new Promise<string>(resolve=>recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
 render(start);recorder.start();const began=performance.now();
 await new Promise<void>(resolve=>{function tick(){const t=(performance.now()-began)/1000;render(start+Math.min(t,duration));if(t<duration)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
 recorder.stop();const url=await done;stream.getTracks().forEach(track=>track.stop());return url;
}};
render(12.484);
