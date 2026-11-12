import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {buildHouseInterior} from '../../src/engine/set/houseInterior';
import {createMaterials,disposeMaterials} from '../../src/engine/look';
import {restFrame} from '../../src/engine/characters/rig';
import type {CharacterRig} from '../../src/engine/api';
import {evaluatePose,STYLES,type VerbCtx} from '../../src/engine/motion/library';
import {getFixture} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX,type Beat,type BeatScript} from '../../src/shared/schema';
import {initialWorldState} from '../../src/compiler/worldState';
import {MARKS} from '../../src/shared/bible/set';
import {cookingSupportHeightAt} from '../../src/shared/cookingStation';
import {HOUSE_LIVING_SEAT_HEIGHT,HOUSE_PREP_TABLE} from '../../src/shared/houseLayout';

type Pixels={width:number;height:number;data:Uint8ClampedArray};

// Derive the clearance plane from the actual production furniture, not a
// stale world coordinate from a previous room layout.
const chairFront=(()=>{
 const materials=createMaterials(),interior=buildHouseInterior(materials);interior.updateMatrixWorld(true);
 const front=new THREE.Box3().setFromObject(interior.userData.anchors.chair).max.z;
 interior.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.userData.setOwned)material.dispose();}});disposeMaterials(materials);
 return front;
})();

/** Decode the real GLB textures without a WebGL context. The production bake
 * reads/writes pixels only; this shim implements those canvas operations. */
function installPixelCanvas(){
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{
  const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};
 });
 vi.stubGlobal('document',{createElement(name:string){
  if(name!=='canvas')throw new Error(`Unexpected DOM element: ${name}`);
  let pixels:Pixels|undefined;
  const canvas={width:0,height:0,getContext(){return {
   drawImage(image:Pixels){pixels=image;},
   getImageData(){if(!pixels)throw new Error('Canvas has not been drawn');return pixels;},
   createImageData(width:number,height:number){return {width,height,data:new Uint8ClampedArray(width*height*4)};},
   putImageData(image:Pixels){pixels=image;},
  };}};
  return canvas;
 }});
}

describe('Masha performance on the shipped GLB',()=>{
 let rig:CharacterRig;
 beforeAll(async()=>{
  installPixelCanvas();
  const data=await readFile(new URL('../../public/assets/generated/masha.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  rig=generatedRig('masha',gltf.scene,{height:1,mashaPerformance:true});
 },30_000);
 afterAll(()=>{rig?.dispose();vi.unstubAllGlobals();});

 it('meets real kitchen props before attachment and keeps a held pan above the worktop',()=>{
  for(const item of ['jam_jar','flour_bag','pancakes','frying_pan']as const){
   const initial=initialWorldState();initial.actors.masha={...initial.actors.masha,pos:[...MARKS.house_kitchen.pos],mark:'house_kitchen',facing:MARKS.house_kitchen.facing};initial.props[item]={at:'house_kitchen'};
   const beatScript:BeatScript={summary:'Masha takes an object from the kitchen table.',time_of_day:'day',mood:'calm',music:{mood:'calm',intensity:'soft',change:'start'},ambience:null,rule_hits:[],beats:[{actor:'masha',verb:'take',target:item,item,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'auto'}]};
   const timeline=compileEpisode([{paragraphId:'kitchen-contact',version:1,beatScript,remix:DEFAULT_REMIX}],'en',initial).timeline,segment=timeline.segments[0],clip=segment.segment.actorClips.masha.find(c=>c.params.pickUpAt)!;
   const sample=(t:number)=>{
    const frame=evaluate(timeline,t).actors.masha,lift=cookingSupportHeightAt(frame.pos[0],frame.pos[2]);
    rig.apply({...frame,pickup:frame.pickup?{...frame.pickup,position:[frame.pickup.position[0],frame.pickup.position[1]-lift,frame.pickup.position[2]]}:undefined,face:{...frame.face,lookAt:frame.face.lookAt?[frame.face.lookAt[0],frame.face.lookAt[1]-lift,frame.face.lookAt[2]]:null}});
    rig.root.position.y+=lift;rig.root.updateMatrixWorld(true);
    return{frame,lift,contact:rig.root.userData.contacts.contactPoint as number[]|undefined,socket:rig.handSocket.getWorldPosition(new THREE.Vector3())};
   };
   const attach=segment.offset+clip.start+clip.dur*.5,before=sample(attach-.0001),after=sample(attach+.0001);
   expect(after.socket.distanceTo(new THREE.Vector3(...after.frame.pickup!.position)),`${item} attachment must meet the real resting prop`).toBeLessThan(.001);
   expect(before.socket.distanceTo(after.socket),`${item} attachment must not jump`).toBeLessThan(.001);
   if(item!=='frying_pan'){
    expect(after.contact![1]+after.lift,`${item} acquisition must touch above the worktop, not through its underside`).toBeGreaterThan(HOUSE_PREP_TABLE.height+.01);
    expect(Math.hypot(after.contact![0]-after.frame.pickup!.position[0],after.contact![2]-after.frame.pickup!.position[2]),`${item} acquisition must use the exposed side/lip`).toBeGreaterThan(.05);
   }
   if(item==='pancakes'){
    const face=rig.root.getObjectByName('masha:articulated-face')!,bounds=new THREE.Box3().setFromObject(face);
    expect(bounds.min.y,'face must stay above the pancake stack while picking up its lip').toBeGreaterThan(HOUSE_PREP_TABLE.height+.143);
   }
   if(item==='frying_pan')for(const delay of [0,.05,.15,.3]){
    const held=sample(Math.min(timeline.duration-.001,segment.offset+clip.start+clip.dur+delay));
    expect(held.socket.y,`pan underside after take +${delay}s`).toBeGreaterThanOrEqual(HOUSE_PREP_TABLE.height-.001);
    expect(rig.root.userData.contacts.reachError??0).toBeLessThan(.001);
   }
   expect(sample(attach+.0001).socket.distanceTo(after.socket),`${item} seeking back must restore the same contact`).toBeLessThan(1e-8);
  }
 });

 it('keeps actual story claps and pan release continuous at ownership and clip boundaries',()=>{
  const f=getFixture('pancake_morning','en')!,tl=compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:String(i),version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
  const sample=(t:number)=>{const frame=evaluate(tl,t).actors.masha;rig.apply(frame);return{frame,right:rig.bones.RightHand.getWorldPosition(new THREE.Vector3()),left:rig.bones.LeftHand.getWorldPosition(new THREE.Vector3()),socket:rig.handSocket.getWorldPosition(new THREE.Vector3()),rotation:rig.handSocket.getWorldQuaternion(new THREE.Quaternion())};};
  let claps=0,releases=0;
  for(const segment of tl.segments)for(const clip of segment.segment.actorClips.masha){
   if(clip.verb==='clap'){
    claps++;
    for(const local of [clip.start,clip.start+clip.dur]){
     const a=sample(segment.offset+local-.0001),b=sample(segment.offset+local+.0001);
     for(const hand of ['right','left'] as const)expect(a[hand].distanceTo(b[hand]),`${hand} at clap boundary`).toBeLessThan(.003);
    }
   }
   if(clip.params.putDown){
    releases++;const t=segment.offset+clip.start+clip.dur*.5,a=sample(t-.0001),b=sample(t+.0001);
    expect(a.frame.holding).toBe('frying_pan');expect(b.frame.holding).toBeNull();
    expect(a.socket.distanceTo(new THREE.Vector3(...b.frame.putDown!.position))).toBeLessThan(.001);
    expect(a.rotation.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.frame.putDown!.rotation,'YXZ')))).toBeLessThan(.001);
    expect(a.right.distanceTo(b.right)).toBeLessThan(.001);
    expect(a.socket.distanceTo(b.socket)).toBeLessThan(.001);
   }
  }
  expect(claps).toBeGreaterThan(0);expect(releases).toBe(1);
 });

 it('blends into tasting and back to gestures without snapping the hand or candy',()=>{
  const beat=(verb:Beat['verb'],overrides:Partial<Beat>={}):Beat=>({actor:'masha',verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'close',...overrides});
  const beatScript:BeatScript={summary:'Candy contacts',time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'continue'},ambience:null,rule_hits:[],beats:[beat('take',{target:'lollipop',item:'lollipop'}),beat('eat',{item:'lollipop'}),beat('surprised',{emotion:'surprised'}),beat('give',{target:'bear',item:'lollipop'})]};
  const tl=compileEpisode([{paragraphId:'candy',version:1,beatScript,remix:DEFAULT_REMIX}],'en').timeline;
  const sample=(t:number)=>{rig.apply(evaluate(tl,t).actors.masha);return[rig.bones.RightHand,rig.handSocket].map(o=>o.getWorldPosition(new THREE.Vector3()));};
  let checks=0;
  for(const s of tl.segments)for(const c of s.segment.actorClips.masha)if(['eat','surprised','give'].includes(c.verb)){
   for(const local of [c.start,c.start+c.dur]){
    const a=sample(s.offset+local-.0001),b=sample(s.offset+local+.0001);
    for(let i=0;i<2;i++)expect(a[i].distanceTo(b[i]),`${c.verb} boundary, hand/socket ${i}`).toBeLessThan(.003);
    checks++;
   }
  }
  expect(checks).toBeGreaterThanOrEqual(6);
 });

 it('fades the rebuilt face together with the source body and restores it when seeking',()=>{
  const face=rig.root.getObjectByName('masha:articulated-face')!;
  const materials=new Set<THREE.Material>();
  face.traverse(object=>{
   const mesh=object as THREE.Mesh;
   if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);
  });
  expect(materials.size).toBeGreaterThan(5);
  for(const opacity of [.5,0,1]){
   rig.apply(restFrame({opacity}));
   for(const material of materials){
    expect(material.opacity,`${material.type} at actor opacity ${opacity}`).toBe(opacity);
    if(opacity<1)expect(material.transparent,`${material.type} must participate in fades`).toBe(true);
    expect(material.depthWrite,`${material.type} must match the fading body depth policy`).toBe(opacity>.98);
   }
  }
 });

 it('preserves contacts across postures and clears the prior hold when seeking',()=>{
  const frame=(verb:Parameters<typeof evaluatePose>[0],time:number,holding:'lollipop'|null,posture:VerbCtx['posture']='stand')=>{
   const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:12,emotion:'neutral',posture,fromPosture:posture,speed:0,dist:0,turned:0,targetLocal:null,seat:0};
   const pose=evaluatePose(verb,time,{},ctx);
   return restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb,holding,posture,action:{time,duration:12}});
  };
  const signature=()=>{
   const values:number[]=[];
   rig.root.traverse(object=>{
    values.push(...object.matrixWorld.elements);
    const mesh=object as THREE.SkinnedMesh;
    if(mesh.isMesh){for(const value of mesh.geometry.getAttribute('position').array)values.push(value);values.push(...(mesh.morphTargetInfluences??[]));}
   });
   return values;
  };
  const f=frame('idle',0,null);rig.apply(f);const original=signature();
  for(const [verb,time,holding] of [['eat',1.5,'lollipop'],['clap',.3,null],['eat',0,'lollipop'],['idle',1,'lollipop']] as const)rig.apply(frame(verb,time,holding));
  rig.apply(f);expect(signature()).toEqual(original);
  for(const posture of ['stand','sit','sleep','carried'] as const){
   for(const verb of ['idle','eat','clap'] as const){
    for(const time of [0,.3,.7,1.5,2.3,3]){
     rig.apply(frame(verb,time,'lollipop',posture));
     const contact=rig.root.userData.contacts,error=contact.reachError??Math.abs(contact.palmSeparation-contact.targetSeparation);
     expect(error,`${verb}, ${posture}, ${time}s must reach its contact within 1 mm`).toBeLessThan(.001);
    }
   }
  }
 });

 it('keeps the rendered palm, finger and cuff surfaces separated through the clap',()=>{
  const meshes=(side:string)=>{
   const result:THREE.Mesh[]=[];
   rig.root.getObjectByName(`masha:${side}-hand-articulated`)!.traverse(object=>{if((object as THREE.Mesh).isMesh)result.push(object as THREE.Mesh);});
   return result;
  };
  const left=meshes('left'),right=meshes('right');
  const centre=(mesh:THREE.Mesh)=>{mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);};
  const extreme=(meshes:THREE.Mesh[],axis:THREE.Vector3,max:boolean)=>{
   let value=max?-Infinity:Infinity;
   for(const mesh of meshes){const pos=mesh.geometry.getAttribute('position');for(let i=0;i<pos.count;i++){
    const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).dot(axis);
    value=max?Math.max(value,p):Math.min(value,p);
   }}
   return value;
  };
  for(let index=0;index<=60;index++){
   const time=index*.01,ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:12,emotion:'happy',posture:'stand',fromPosture:'stand',speed:0,dist:0,turned:0,targetLocal:null,seat:0};
   const pose=evaluatePose('clap',time,{},ctx);
   rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb:'clap',action:{time,duration:12}}));
   const axis=centre(right.find(m=>m.name.endsWith('-palm'))!).sub(centre(left.find(m=>m.name.endsWith('-palm'))!)).normalize();
   const clearance=extreme(right,axis,false)-extreme(left,axis,true);
   expect(clearance,`whole hand surface clearance at ${time}s`).toBeGreaterThanOrEqual(-.0001);
   if(time>=.27&&time<=.33)expect(clearance,`contact must be visible at ${time}s`).toBeLessThan(.001);
  }
 });

 it('wraps opposing fingers around the actual lollipop cylinder without penetrating its surface',()=>{
  for(const time of [0,.6,1.5,2.4]){
   const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:12,emotion:'neutral',posture:'stand',fromPosture:'stand',speed:0,dist:0,turned:0,targetLocal:null,seat:0};
   const pose=evaluatePose('eat',time,{},ctx);
   rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb:'eat',holding:'lollipop',action:{time,duration:12}}));
   for(const suffix of ['finger-0','finger-1','finger-2','finger-3','thumb']){
    const mesh=rig.root.getObjectByName(`masha:right-${suffix}`) as THREE.Mesh,position=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index!;
    const origin=rig.handSocket.getWorldPosition(new THREE.Vector3()),inverse=rig.handSocket.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local=(i:number)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).sub(origin).applyQuaternion(inverse);
    let nearest=Infinity;
    const sample=(p:THREE.Vector3)=>{if(p.y>=0&&p.y<=.16)nearest=Math.min(nearest,Math.hypot(p.x,p.z)-.006);};
    for(let i=0;i<position.count;i++)sample(local(i));
    // Triangle centers catch cylinder intersections hidden by vertex-only tests.
    for(let i=0;i<indices.count;i+=3)sample(local(indices.getX(i)).add(local(indices.getX(i+1))).add(local(indices.getX(i+2))).multiplyScalar(1/3));
    expect(nearest,`${suffix} must not penetrate the stem at ${time}s`).toBeGreaterThanOrEqual(-.0001);
    expect(nearest,`${suffix} must actually touch the stem at ${time}s`).toBeLessThan(.001);
   }
  }
 });

 it('keeps the accepted face and seated skirt active in an actual compiled indoor story',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='eat'))!;
  const clip=segment.segment.actorClips.masha.find(c=>c.verb==='eat')!;
  for(const offset of [.45,1,1.5,2]){
   const frame=evaluate(timeline,segment.offset+clip.start+offset).actors.masha;rig.apply(frame);
   expect(rig.root.getObjectByName('masha:articulated-face')).toBeDefined();
   let draped=0;
   rig.root.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(mesh.isSkinnedMesh&&mesh.userData.skirtVertices?.length){
    expect(mesh.morphTargetInfluences?.[2]).toBeGreaterThan(.8);draped++;
    // Facial baseline morphs must not move the newly rebuilt face.
    expect(mesh.morphTargetInfluences?.slice(0,2)).toEqual([0,0]);
   }});
   expect(draped).toBeGreaterThan(0);
   for(const foot of ['LeftFoot','RightFoot'])expect(rig.bones[foot].getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(chairFront+.01);
   expect(rig.root.userData.contacts.reachError??0).toBeLessThan(.001);
  }
 });

 it('rises in front of the actual armchair before moving onto its cushion',()=>{
  const fixture=getFixture('cozy_evening','en')!,{timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`mount-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='sit'&&c.params.target==='house_living'))!,clips=segment.segment.actorClips.masha,clip=clips.find(c=>c.verb==='sit'&&c.params.target==='house_living')!;
  expect(clip.params.to).toEqual(MARKS.house_living.pos);
  const apply=(time:number)=>{const frame=evaluate(timeline,time).actors.masha;rig.apply(frame);return{frame,hips:rig.bones.Hips.getWorldPosition(new THREE.Vector3()),feet:['LeftFoot','RightFoot'].map(name=>rig.bones[name].getWorldPosition(new THREE.Vector3()))};};
  const approach=clips.filter(c=>c.params.path&&c.start<clip.start).at(-1)!;
  const before=apply(segment.offset+approach.start+approach.dur-.001);
  expect(before.hips.z,'standing approach must stop outside solid upholstery').toBeGreaterThan(chairFront+.20);
  let crossed=false;
  for(let k=0;k<=1;k+=.025){
   const pose=apply(segment.offset+clip.start+clip.dur*k);
   if(pose.hips.z<chairFront+.06){
    crossed=true;expect(pose.hips.y,`pelvis must clear the cushion before crossing its front at ${k}`).toBeGreaterThan(HOUSE_LIVING_SEAT_HEIGHT+.08);
   }
   for(const foot of pose.feet)expect(foot.z,`dangling feet stay outside the chair front at ${k}`).toBeGreaterThan(chairFront+.005);
  }
  expect(crossed).toBe(true);
  const final=apply(segment.offset+clip.start+clip.dur-.001);expect(final.hips.y).toBeCloseTo(HOUSE_LIVING_SEAT_HEIGHT+.11,3);
  const time=segment.offset+clip.start+clip.dur*.5,mid=apply(time);apply(segment.offset+clip.start+clip.dur);expect(apply(time).hips.toArray()).toEqual(mid.hips.toArray());
 });

 it('preserves authored gesture arms and a precise candy grip instead of forcing every verb into the idle hold',()=>{
  for(const verb of ['give','take','wave','clap'] as const){
   const time=.3,ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:1,emotion:'happy',posture:'stand',fromPosture:'stand',speed:0,dist:0,turned:0,targetLocal:null,seat:0};
   const pose=evaluatePose(verb,time,{},ctx),frame=restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb,action:{time,duration:1}});
   // A held object suppresses the empty two-hand contact solver, while the
   // authored arm pose survives unchanged. The object follows its new grip.
   rig.apply({...frame,holding:'lollipop'});
   expect(rig.root.userData.contacts.mode).toBe('lollipop');
   expect(rig.root.userData.contacts.authoredArm).toBe(true);
   expect(rig.root.userData.contacts.gripError).toBeLessThan(.0001);
   expect(rig.handSocket.userData.preciseGrip).toBe(true);
   const held=rig.bones.RightArm.quaternion.toArray();
   if(verb!=='clap'){
    rig.apply(frame);expect(rig.bones.RightArm.quaternion.toArray()).toEqual(held);
   }
  }
 });

 it('keeps the pelvis at the chair when beginning to stand, then eases into sole contact',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='stand_up'))!,clip=segment.segment.actorClips.masha.find(c=>c.verb==='stand_up')!,start=segment.offset+clip.start;
  rig.apply(evaluate(timeline,start-1e-5).actors.masha);const seatedY=rig.bones.Hips.getWorldPosition(new THREE.Vector3()).y;
  const first=evaluate(timeline,start+.001).actors.masha;rig.apply(first);
  expect(first.groundWeight).toBeLessThan(.01);
  expect(Math.abs(rig.bones.Hips.getWorldPosition(new THREE.Vector3()).y-seatedY)).toBeLessThan(.01);
  expect(evaluate(timeline,start+clip.dur*.9).actors.masha.groundWeight).toBeGreaterThan(.95);
 });
});

describe('main Masha clothing on the shipped GLB',()=>{
 let rig:CharacterRig;
 const hemEdges:{mesh:THREE.SkinnedMesh;a:number;b:number;length:number}[]=[];
 const lowerEdges:{mesh:THREE.SkinnedMesh;a:number;b:number;length:number}[]=[];
 afterAll(()=>{rig?.dispose();vi.unstubAllGlobals();});
 it('preserves sleeve, hand and tights weights while repairing the skirt without enabling the facial candidate',async()=>{
  installPixelCanvas();
  const data=await readFile(new URL('../../public/assets/generated/masha.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  const source=new Map<THREE.SkinnedMesh,{indices:number[];weights:number[]}>();
  gltf.scene.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(mesh.isSkinnedMesh){
   const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
   source.set(mesh,{indices:Array.from({length:index.count*4},(_,i)=>index.getComponent(Math.floor(i/4),i%4)),weights:Array.from({length:weight.count*4},(_,i)=>weight.getComponent(Math.floor(i/4),i%4))});
  }});
  rig=generatedRig('masha',gltf.scene,{height:1});
  expect(rig.root.getObjectByName('masha:articulated-face')).toBeUndefined();
  expect(rig.root.userData.generated.dressVertices).toBeGreaterThan(100);
  const p=new THREE.Vector3();let protectedCount=0,tightsCount=0;
  for(const [mesh,before] of source){
   const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
   for(let i=0;i<index.count;i++){
    mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
    if(p.y<.08||p.y>.49||Math.abs(p.x)>.115+(.49-p.y)*.30){
     protectedCount++;
     for(let k=0;k<4;k++){
      expect(index.getComponent(i,k),`outside skirt vertex ${i} joint ${k}`).toBe(before.indices[i*4+k]);
      expect(weight.getComponent(i,k),`outside skirt vertex ${i} weight ${k}`).toBeCloseTo(before.weights[i*4+k],7);
     }
    }
   }
   // Independently inspected tights on both source legs, including hidden
   // magenta-textured faces that formerly tore visible shins onto the lap.
   if(index.count>70161)for(const i of [10139,10152,8173,44072,44073,44074,70161,46407]){
    tightsCount++;
    for(let k=0;k<4;k++){
     expect(index.getComponent(i,k),`tights vertex ${i} joint ${k}`).toBe(before.indices[i*4+k]);
     expect(weight.getComponent(i,k),`tights vertex ${i} weight ${k}`).toBeCloseTo(before.weights[i*4+k],7);
    }
    const drape=mesh.geometry.morphAttributes.position![2];
    expect([drape.getX(i),drape.getY(i),drape.getZ(i)],`tights vertex ${i} must not follow the skirt morph`).toEqual([0,0,0]);
   }
  }
  expect(protectedCount).toBeGreaterThan(1000);
  expect(tightsCount).toBe(8);
  for(const mesh of source.keys()){
   const index=mesh.geometry.index!,positions:THREE.Vector3[]=[];
   for(let i=0;i<mesh.geometry.getAttribute('position').count;i++)positions.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
   // Measured outer hem landmarks exclude both shoes and inner leggings.
   const hem=(v:THREE.Vector3)=>v.y>=.08&&v.y<.17&&(Math.abs(v.x)>.13||v.z>.11||v.z<-.1);
   for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
    const a=index.getX(i+k),b=index.getX(i+(k+1)%3),length=positions[a].distanceTo(positions[b]);
    if(hem(positions[a])&&hem(positions[b])&&length>.00001)hemEdges.push({mesh,a,b,length});
    if(positions[a].y<.18&&positions[b].y<.18&&length>.0001)lowerEdges.push({mesh,a,b,length});
   }
  }
 },30_000);
 it('places the measured pelvis above a raised seat',()=>{
  const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:2,dur:2,emotion:'neutral',posture:'sit',fromPosture:'sit',speed:0,dist:0,turned:0,targetLocal:null,seat:.47};
  const pose=evaluatePose('idle',1,{},ctx);
  rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,posture:'sit'}));
  expect(rig.bones.Hips.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(.47+.04*STYLES.masha.hipHeight,3);
  expect(hemEdges.length).toBeGreaterThan(100);
  for(const edge of hemEdges){
   const a=edge.mesh.getVertexPosition(edge.a,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld),b=edge.mesh.getVertexPosition(edge.b,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld);
   expect(a.distanceTo(b)/edge.length,`seated hem edge ${edge.a}-${edge.b} must not tear away with a thigh`).toBeCloseTo(1,4);
  }
  for(const edge of lowerEdges){
   const a=edge.mesh.getVertexPosition(edge.a,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld),b=edge.mesh.getVertexPosition(edge.b,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld);
   expect(a.distanceTo(b),`lower-leg edge ${edge.a}-${edge.b} must not stretch into the lap`).toBeLessThanOrEqual(Math.max(.018,edge.length*3));
  }
 });
 it('keeps both dangling feet in front of the actual chair throughout the eating sample',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='eat'))!;
  const clip=segment.segment.actorClips.masha.find(c=>c.verb==='eat')!;
  for(const offset of [.1,.45,1,1.45,2]){
   rig.apply(evaluate(timeline,segment.offset+clip.start+offset).actors.masha);
   expect(rig.bones.Hips.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(chairFront);
   for(const name of ['LeftFoot','RightFoot'])expect(rig.bones[name].getWorldPosition(new THREE.Vector3()).z,`${name} at ${offset}s must clear the cushion front`).toBeGreaterThan(chairFront+.01);
  }
 });
 it('restores the standing mesh when seeking backwards from a seated shot',()=>{
  const sample=()=>{
   const values:number[]=[];
   rig.root.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i+=137)
     values.push(...mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
   });
   return values;
  };
  const standing=restFrame();rig.apply(standing);const before=sample();
  const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:2,dur:2,emotion:'neutral',posture:'sit',fromPosture:'sit',speed:0,dist:0,turned:0,targetLocal:null,seat:.47};
  const pose=evaluatePose('idle',1,{},ctx);
  rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,posture:'sit'}));
  expect(sample()).not.toEqual(before);
  rig.apply(standing);expect(sample()).toEqual(before);
 });
});
