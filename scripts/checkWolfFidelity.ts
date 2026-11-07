import * as THREE from 'three';
import {buildWolf} from '../src/engine/characters/wolf';
import {restFrame} from '../src/engine/characters/rig';
import {evaluatePose,STYLES,type VerbCtx} from '../src/engine/motion/library';
import type {Verb} from '../src/shared/schema';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const results=[];
for(const variant of ['a','b'] as const){
 const rig=buildWolf(variant), id=variant==='a'?'wolf_a':'wolf_b';
 const footMeshes: {mesh:THREE.SkinnedMesh;vertices:number[]}[]=[];
 const haunchMeshes: {mesh:THREE.SkinnedMesh;vertices:number[]}[]=[];
 rig.root.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
  const si=mesh.geometry.getAttribute('skinIndex');const sw=mesh.geometry.getAttribute('skinWeight');
  const vertices=[],haunch=[];const positions=mesh.geometry.getAttribute('position');for(let i=0;i<si.count;i++){
   let footWeight=0;for(let j=0;j<4;j++)if(/Foot$/.test(mesh.skeleton.bones[si.getComponent(i,j)].name))footWeight+=sw.getComponent(i,j);
   if(footWeight>.95)vertices.push(i);
   let haunchWeight=0;for(let j=0;j<4;j++)if(/^(Hips|LeftUpLeg|RightUpLeg)$/.test(mesh.skeleton.bones[si.getComponent(i,j)].name))haunchWeight+=sw.getComponent(i,j);
   if(haunchWeight>.75&&positions.getY(i)>.5*STYLES[id].height/2&&positions.getY(i)<.95*STYLES[id].height/2)haunch.push(i);
  }if(vertices.length)footMeshes.push({mesh,vertices});if(haunch.length)haunchMeshes.push({mesh,vertices:haunch});
 });
 for(const mode of ['idle','walk_to','run_to','wave','sit','sit_down','stand_up']){
  const verb=(mode==='sit_down'?'sit':mode) as Verb;
  const values=[];
  for(let i=0;i<=8;i++){
   const t=mode==='sit_down'?i*.12:.2+i*.35;const seated=verb==='sit';const wasSeated=mode==='sit'||verb==='stand_up';
   const ctx:VerbCtx={actor:id,style:STYLES[id],dur:4,t,dist:t*1.15,speed:1.15,turned:0,
    fromPosture:wasSeated?'sit' as const:'stand' as const,posture:seated?'sit' as const:'stand' as const,
    emotion:'neutral' as const,targetLocal:[.4,.2,1] as [number,number,number],seat:0};
   const {layer,breathe}=evaluatePose(verb,t,{},ctx);
   rig.apply(restFrame({bones:layer.bones,hipsOffset:layer.hipsOffset,posture:ctx.posture,verb,secondary:{sway:.5,jiggle:.5,breathe}}));
   rig.root.updateMatrixWorld(true);
   let min=Infinity,max=-Infinity;
   for(const {mesh,vertices} of footMeshes){mesh.skeleton.update();for(const i of vertices){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);max=Math.max(max,p.y);}}
   let haunchMin=Infinity;
   if(seated)for(const {mesh,vertices} of haunchMeshes){mesh.skeleton.update();for(const i of vertices){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);haunchMin=Math.min(haunchMin,p.y);}}
   values.push({t,min,max,...(seated?{haunchMin}:{})});
  }
  results.push({variant,verb:mode,minSole:Math.min(...values.map(v=>v.min)),maxLowestSole:Math.max(...values.map(v=>v.min)),values});
 }
 rig.dispose();
}
writeFileSync('docs/wolf-fidelity/contacts.json',JSON.stringify(results,null,2));
console.log(results.map(({variant,verb,minSole,maxLowestSole})=>({variant,verb,minSole,maxLowestSole})));

for(const row of results){
 assert(row.values.every(v=>Number.isFinite(v.min)&&Number.isFinite(v.max)),`${row.variant}/${row.verb}: nonfinite geometry`);
 assert(row.minSole>-.012,`${row.variant}/${row.verb}: paw penetrates floor ${row.minSole}m`);
 if(['idle','wave','sit','stand_up','sit_down'].includes(row.verb))
  assert(row.maxLowestSole<.018,`${row.variant}/${row.verb}: grounded paws float ${row.maxLowestSole}m`);
}
console.log('Both actual skinned wolf meshes passed contact checks through idle, gait, sitting and rising.');
