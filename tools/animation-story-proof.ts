import * as THREE from 'three';
import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {FIXTURES} from '../src/director/fixtures';
import {evaluate} from '../src/engine/player/evaluate';
import {ACTOR_IDS,DEFAULT_REMIX,type ActorId,type Beat,type BeatScript,type Timeline} from '../src/shared/schema';
import {castCloseup} from '../src/app/castCamera';

const canvas=document.querySelector('canvas')!;
const stage=await createStage(canvas);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const compile=(scripts:BeatScript[])=>compileEpisode(scripts.map((beatScript,i)=>({paragraphId:`proof-${i}`,version:1,beatScript,remix:DEFAULT_REMIX})),'en').timeline;
const timelines:Record<string,Timeline>=Object.fromEntries(FIXTURES.filter(f=>f.lang==='en').map(f=>[f.id,compile(f.paragraphs.map(p=>p.beatScript))]));
const beat=(actor:ActorId,verb:Beat['verb'],extra:Partial<Beat>={}):Beat=>({actor,verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'close',...extra});
const script=(summary:string,beats:Beat[]):BeatScript=>({summary,time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'continue'},ambience:null,rule_hits:[],beats});
timelines.masha_contacts=compile([
 script('Masha tastes her candy, is surprised and shares it with Bear.',[
  beat('masha','take',{target:'lollipop',item:'lollipop',emotion:'curious'}),
  beat('masha','eat',{item:'lollipop',line:'This is delicious!',emotion:'happy'}),
  beat('masha','surprised',{emotion:'surprised'}),
  beat('masha','give',{target:'bear',item:'lollipop',emotion:'happy'}),
 ]),
 script('Masha claps, sits down, then gets up to wave.',[
  beat('masha','clap',{emotion:'excited'}),beat('masha','sit',{target:'bench',emotion:'sad'}),
  beat('masha','stand_up',{emotion:'curious'}),beat('masha','wave',{target:'bear',emotion:'happy'}),
 ]),
]);
timelines.wolves_reactions=compile([
 script('The wolves meet beside their ambulance and celebrate.',[
  beat('wolf_a','walk_to',{target:'van',shot:'wide'}),beat('wolf_b','walk_to',{target:'van',with_previous:true}),
  beat('wolf_a','surprised',{emotion:'surprised',shot:'close'}),beat('wolf_b','laugh',{emotion:'happy',shot:'close'}),
  beat('wolf_a','clap',{emotion:'excited',shot:'medium'}),beat('wolf_b','clap',{emotion:'happy',with_previous:true}),
 ]),
]);
for(const actor of ['hare','squirrel'] as const)timelines[`${actor}_release`]=compile([script(`${actor} sets flowers down before applause.`,[
 beat(actor,'take',{target:'flowers',item:'flowers'}),beat(actor,'clap',{emotion:'excited'}),
])]);
type ClipInfo={story:string;actor:ActorId;verb:string;start:number;dur:number;emotion:string;putDown?:string;item?:string};
const clips:ClipInfo[]=Object.entries(timelines).flatMap(([story,timeline])=>timeline.segments.flatMap(s=>ACTOR_IDS.flatMap(actor=>s.segment.actorClips[actor].filter(c=>!c.params.ambient).map(c=>({story,actor,verb:c.verb,start:s.offset+c.start,dur:c.dur,emotion:c.emotion,putDown:c.params.putDown,item:c.params.item})))));
function diagnostics(story:string,time:number,closeup?:ActorId){
 const frame=evaluate(timelines[story],time);
 if(closeup){const a=frame.actors[closeup],h=stage.rigs[closeup].height;frame.camera={pos:[a.pos[0]+Math.sin(a.yaw+.23)*h*1.65,a.pos[1]+h*.76,a.pos[2]+Math.cos(a.yaw+.23)*h*1.65],look:[a.pos[0],a.pos[1]+h*.65,a.pos[2]],fov:36,location:frame.camera.location};}
 stage.render(frame);
 const actors=Object.fromEntries(ACTOR_IDS.filter(id=>frame.cast?.includes(id)).map(id=>{
  const rig=stage.rigs[id],a=frame.actors[id];let finite=true;
  rig.root.traverse(o=>{if(o.matrixWorld.elements.some(v=>!Number.isFinite(v)))finite=false;});
  return [id,{verb:a.verb,holding:a.holding,posture:a.posture,pos:a.pos,hipsOffset:a.hipsOffset,groundWeight:a.groundWeight,face:a.face,finite,performance:!!rig.root.getObjectByName('masha:articulated-face'),facialPerformance:rig.root.userData.facialPerformance??null,contacts:rig.root.userData.contacts??null,generated:rig.root.userData.generated??null}];
 }));
 return {story,time,camera:frame.camera,closeup:closeup??null,actors,stats:stage.stats()};
}
const find=(story:string,actor:ActorId,verb:string)=>clips.find(c=>c.story===story&&c.actor===actor&&c.verb===verb)!;
const selected=[
 find('masha_contacts','masha','eat'),find('masha_contacts','masha','surprised'),find('masha_contacts','masha','clap'),find('masha_contacts','masha','sit'),
 find('garden_party','hare','eat'),find('garden_party','rosie','surprised'),find('garden_party','lady_bear','clap'),
 find('garden_party','squirrel','jump'),find('garden_party','rival_bear','dance'),
 find('fishing_trip','bear','fish'),find('cozy_evening','masha','eat'),find('cozy_evening','masha','stand_up'),find('bears_nap','bear','carry'),
 find('wolves_reactions','wolf_a','surprised'),find('wolves_reactions','wolf_b','clap'),
].filter(Boolean);
const sections=selected.map(c=>({...c,time:c.verb==='fish'||c.verb==='clap'?Math.max(0,c.start-.2):c.start+Math.min(c.dur*.1,.2),duration:c.verb==='fish'||c.verb==='clap'?c.dur+.4:Math.min(4,c.dur),label:`${c.story} · ${c.actor}: ${c.verb}`}));
const putDown=clips.find(c=>c.story==='pancake_morning'&&c.actor==='masha'&&c.putDown)!;
const approach=clips.find(c=>c.story===putDown.story&&c.actor===putDown.actor&&c.verb==='walk_to'&&Math.abs(c.start+c.dur-putDown.start)<.002);
const releaseStart=Math.max(0,(approach?.start??putDown.start)-.1);
sections.splice(4,0,{...putDown,time:releaseStart,duration:putDown.start+putDown.dur+1.5-releaseStart,label:'pancake_morning · Masha: approach, put down pan, clap'});
for(const actor of ['hare','squirrel'] as const){const release=clips.find(c=>c.story===`${actor}_release`&&c.putDown)!;sections.push({...release,time:release.start-.3,duration:release.dur+1.8,label:`${actor} · actual story: put down flowers, clap`});}
function rigSignature(actor:ActorId){
 let hash=2166136261,finite=true,count=0;
 const add=(n:number)=>{finite&&=Number.isFinite(n);hash=Math.imul(hash^Math.round(n*1e6),16777619);count++;};
 stage.rigs[actor].root.traverse(o=>{
  o.matrixWorld.elements.forEach(add);
  const mesh=o as unknown as {geometry?:{attributes:{position?:{array:ArrayLike<number>};normal?:{array:ArrayLike<number>}}};morphTargetInfluences?:number[]};
  for(const key of ['position','normal'] as const){const a=mesh.geometry?.attributes[key]?.array;if(a)for(let i=0;i<a.length;i++)add(a[i]);}
  mesh.morphTargetInfluences?.forEach(add);
 });return{hash:hash>>>0,finite,count};
}
const faceSections=[find('masha_contacts','masha','surprised'),find('garden_party','bear','laugh'),find('garden_party','lady_bear','clap'),find('garden_party','hare','eat'),find('garden_party','rosie','surprised'),find('garden_party','squirrel','jump'),find('garden_party','rival_bear','dance'),find('wolves_reactions','wolf_a','surprised'),find('wolves_reactions','wolf_b','laugh')].map(c=>({...c,time:Math.max(0,c.start-.15),duration:Math.min(2.8,c.dur+.5),label:`${c.actor} · ${c.verb} · compiled story input`}));
function faceDiagnostic(story:string,time:number,actor:ActorId){
 const frame=evaluate(timelines[story],time);frame.cast=[actor];frame.fx=[];for(const prop of Object.values(frame.props))prop.visible=false;
 stage.render(frame);
 const rig=stage.rigs[actor],left=rig.root.getObjectByName('eyeL'),right=rig.root.getObjectByName('eyeR');
 let yaw=frame.actors[actor].yaw;
 if(left&&right){const across=left.getWorldPosition(new THREE.Vector3()).sub(right.getWorldPosition(new THREE.Vector3())),forward=new THREE.Vector3().crossVectors(across,new THREE.Vector3(0,1,0));if(forward.lengthSq()>1e-8)yaw=Math.atan2(forward.x,forward.z);}
 const portrait=castCloseup(rig,{...frame.actors[actor],yaw},.12),distance=Math.max(.55,rig.height*.70),angle=yaw+.12;
 portrait.pos=[portrait.look[0]+Math.sin(angle)*distance,portrait.look[1]+rig.height*.03,portrait.look[2]+Math.cos(angle)*distance];
 frame.camera={...portrait,location:frame.camera.location};
 stage.render(frame);
 // Explicit diagnostic isolation: story poses/expressions stay unchanged;
 // camera and background are changed so furniture cannot conceal the face.
 const background=stage.scene.background,visible=stage.set.root.visible,skyVisible=stage.look.sky.visible;
 stage.set.root.visible=false;stage.look.sky.visible=false;stage.scene.background=new THREE.Color('#eee7d9');
 stage.renderer.render(stage.scene,stage.camera);
 stage.scene.background=background;stage.set.root.visible=visible;stage.look.sky.visible=skyVisible;
}
function groundDiagnostic(story:string,time:number,actor:ActorId){
 const frame=evaluate(timelines[story],time),a=frame.actors[actor],h=stage.rigs[actor].height,yaw=a.yaw+.75;
 frame.camera={pos:[a.pos[0]+Math.sin(yaw)*h*2,a.pos[1]+h*.65,a.pos[2]+Math.cos(yaw)*h*2],look:[a.pos[0],a.pos[1]+h*.22,a.pos[2]],fov:40,location:frame.camera.location};
 stage.render(frame);return canvas.toDataURL();
}
async function record(diagnostic=false){
 // Compile diagnostic materials/background before starting its clock. Shader
 // setup is not part of the animation and must not freeze the opening frame.
 if(diagnostic){for(const section of faceSections){faceDiagnostic(section.story,section.time,section.actor);await new Promise(requestAnimationFrame);}}
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('No video encoder');
 const output=document.createElement('canvas');output.width=1280;output.height=784;const ctx=output.getContext('2d')!,stream=output.captureStream(30),parts:BlobPart[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});
 const activeSections=diagnostic?faceSections:sections;
 let raf=0;const intervals:number[]=[];let prev=0;
 try{return await new Promise<{blob:Blob;frames:number;maxGapMs:number;sections:typeof sections}>((resolve,reject)=>{
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};recorder.onerror=()=>reject(new Error('Recorder failed'));
  recorder.onstop=()=>resolve({blob:new Blob(parts,{type:mime}),frames:intervals.length,maxGapMs:Math.max(...intervals),sections:activeSections});
  const start=performance.now(),duration=activeSections.reduce((s,c)=>s+c.duration,0);
  const tick=(now:number)=>{try{if(prev)intervals.push(now-prev);prev=now;const elapsed=Math.min((now-start)/1000,duration-.001);let offset=0;let section=activeSections[activeSections.length-1];for(const c of activeSections){if(elapsed<offset+c.duration){section=c;break;}offset+=c.duration;}
   if(diagnostic)faceDiagnostic(section.story,section.time+elapsed-offset,section.actor);else diagnostics(section.story,section.time+elapsed-offset);
   ctx.fillStyle='#fff5da';ctx.fillRect(0,0,1280,784);ctx.drawImage(canvas,0,64,1280,720);ctx.fillStyle='#54295e';ctx.font='bold 22px sans-serif';ctx.fillText(section.label,20,28);ctx.font='15px sans-serif';ctx.fillText(diagnostic?'Diagnostic close-up · Actual story poses · Isolated background and camera · Silent':'Actual compiled story · Production stage and story camera · Silent QA capture',20,51);
   if(now-start<duration*1000)raf=requestAnimationFrame(tick);else recorder.stop();
  }catch(e){reject(e);}};recorder.start();raf=requestAnimationFrame(tick);
 });}finally{cancelAnimationFrame(raf);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
}
(window as unknown as {__animationStories:unknown}).__animationStories={stage,timelines,clips,sections,diagnostics,rigSignature,groundDiagnostic,render(story:string,time:number,closeup?:ActorId){const meta=diagnostics(story,time,closeup);return {...meta,png:canvas.toDataURL()};},record};
document.querySelector('#status')!.textContent='Ready: real story compiler, evaluator and game stage.';
