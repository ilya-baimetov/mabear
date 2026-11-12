import * as THREE from 'three';
import type {CharacterRig,FrameState} from '../api';
import type {ActorId} from '../../shared/schema';
import {interactionRadius} from '../../shared/physicalInteractions';
import {contactHands} from './contactHands';

type Sample={mesh:THREE.SkinnedMesh;index:number};
const samples=new WeakMap<THREE.Object3D,Map<boolean,Sample[]>>();
const at=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
const smooth=(v:number)=>{v=THREE.MathUtils.clamp(v,0,1);return v*v*(3-2*v);};
function torsoSamples(rig:CharacterRig,arms=false):Sample[]{
 const cached=samples.get(rig.root)??new Map<boolean,Sample[]>(),existing=cached.get(arms);if(existing)return existing;
 const names=['Hips','Spine','Spine1','Spine2','LeftShoulder','RightShoulder',...(arms?['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']:[])];
 const torso=new Set(names.map(name=>rig.bones[name]).filter(Boolean)),out:Sample[]=[];
 rig.root.traverse(o=>{
  const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
  const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;if(!si||!sw)return;
  const joints=new Set(mesh.skeleton.bones.filter(b=>torso.has(b)));
  for(let i=0;i<si.count;i+=3){let weight=0;for(let k=0;k<4;k++)if(joints.has(mesh.skeleton.bones[si.getComponent(i,k)]))weight+=sw.getComponent(i,k);if(weight>.65)out.push({mesh,index:i});}
 });
 const bounded=out.filter((_,i)=>i%Math.max(1,Math.floor(out.length/900))===0);cached.set(arms,bounded);samples.set(rig.root,cached);return bounded;
}

/** Run after every rig pose and support lift, before held-prop sockets are read.
 * No simulation history is retained: scrubbing or replay restores the same pose. */
export function applyHugContacts(rigs:Record<ActorId,CharacterRig>,frame:FrameState):void{
 for(const rig of Object.values(rigs))delete rig.root.userData.hugContacts;
 const participants=new Set<ActorId>();
 for(const id of Object.keys(rigs) as ActorId[]){const a=frame.actors[id];if(a.interaction&&!a.holding&&a.opacity>=.01){participants.add(id);participants.add(a.interaction.partner);}}
 if(!participants.size)return;
 for(const id of participants)rigs[id]?.root.updateMatrixWorld(true);
 for(const [id,rig] of (Object.entries(rigs) as [ActorId,CharacterRig][]).sort((a,b)=>b[1].height-a[1].height)){
  const actor=frame.actors[id],interaction=actor.interaction;
  if(!interaction||actor.holding||actor.opacity<.01)continue;
  const partner=rigs[interaction.partner],other=frame.actors[interaction.partner];
  if(!partner||other.opacity<.01)continue;
  const hands=contactHands.get(rig.root),surface=torsoSamples(partner,partner.height>rig.height*1.4);if(!hands||!surface.length)continue;
  const time=actor.action?.time??0,duration=actor.action?.duration??0,strength=Math.min(smooth(time/Math.max(.001,duration*.22)),smooth((duration-time)/Math.max(.001,duration*.22)));
  if(strength<=0)continue;
  const center=at(partner.root),toward=at(rig.root).sub(center);toward.y=0;toward.normalize();
  const lateral=new THREE.Vector3(Math.cos(actor.yaw),0,-Math.sin(actor.yaw)),tall=rig.height>partner.height*1.4;
  const shoulderY=tall?(at(partner.bones.LeftArm).y+at(partner.bones.RightArm).y)*.5-.015:(at(rig.bones.LeftArm).y+at(rig.bones.RightArm).y)*.5+.025;
  const touches=[];
  for(const hand of hands){
   const desired=center.clone().addScaledVector(toward,interactionRadius(interaction.partner)*.92).addScaledVector(lateral,hand.side*Math.min(interactionRadius(interaction.partner)*.72,rig.height*.115));desired.y=shoulderY;
   const arm=at(rig.bones[hand.side>0?'LeftArm':'RightArm']),elbow=at(rig.bones[hand.side>0?'LeftForeArm':'RightForeArm']),wrist=at(rig.bones[hand.side>0?'LeftHand':'RightHand']),reach=arm.distanceTo(elbow)+elbow.distanceTo(wrist);
   let best=Infinity,target:THREE.Vector3|undefined;
   for(const sample of surface){const p=sample.mesh.getVertexPosition(sample.index,new THREE.Vector3()).applyMatrix4(sample.mesh.matrixWorld),heightError=p.y-desired.y,miss=Math.max(0,p.distanceTo(arm)-reach),d=p.distanceToSquared(desired)+heightError*heightError*3+miss*miss*100;if(d<best){best=d;target=p;}}
   if(!target)continue;
   const outward=toward.clone().addScaledVector(lateral,hand.side*(tall?.6:.16)).normalize(),normal=outward.clone().negate(),long=new THREE.Vector3(0,tall?-1:1,0);
   target.addScaledVector(outward,.004);
   const result=hand.place(target,long,normal,strength);
   touches.push({side:hand.side,error:result.error,gap:result.point.distanceTo(target),point:result.point.toArray(),target:target.toArray()});
  }
  rig.root.userData.hugContacts={partner:interaction.partner,strength,touches};
 }
}
