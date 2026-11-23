import * as THREE from 'three';
import type {CharacterRig,FrameState} from '../api';
import { lerp, smooth } from '../../shared/math';
import type {ActorId} from '../../shared/schema';
import {contactHands} from './contactHands';
import {solveArm} from './mashaContacts';

type Sample={mesh:THREE.SkinnedMesh;index:number};
const cache=new WeakMap<THREE.Object3D,Map<string,Sample[]>>();
const at=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
function samples(rig:CharacterRig,names:string[]):Sample[]{
 const key=names.join(),byKind=cache.get(rig.root)??new Map(),found=byKind.get(key);if(found)return found;
 const bones=new Set(names.map(n=>rig.bones[n])),out:Sample[]=[];
 rig.root.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;if(!si||!sw)return;for(let i=0;i<si.count;i+=3){let w=0;for(let k=0;k<4;k++)if(bones.has(mesh.skeleton.bones[si.getComponent(i,k)]))w+=sw.getComponent(i,k);if(w>.65)out.push({mesh,index:i});}});
 const bounded=out.filter((_,i)=>i%Math.max(1,Math.ceil(out.length/1200))===0);byKind.set(key,bounded);cache.set(rig.root,byKind);return bounded;
}
function nearestSurface(rig:CharacterRig,names:string[],desired:THREE.Vector3,accept?:(p:THREE.Vector3)=>boolean){
 let best=Infinity,result=desired.clone();for(const s of samples(rig,names)){const p=s.mesh.getVertexPosition(s.index,new THREE.Vector3()).applyMatrix4(s.mesh.matrixWorld);if(accept&&!accept(p))continue;const d=p.distanceToSquared(desired);if(d<best){best=d;result=p;}}return result;
}
/** After both posed rigs and decking lifts: one deterministic physical seat,
 * followed by supporting paws. Normal rig.apply resets every edit before seeking. */
export function applyCarryContacts(rigs:Record<ActorId,CharacterRig>,frame:FrameState):void{
 const rider=rigs.masha,carrier=rigs.bear,a=frame.actors.masha,b=frame.actors.bear;
 if(rider)delete rider.root.userData.carryContacts;
 if(!rider||!carrier||!a.riding||a.opacity<.01||b.opacity<.01)return;
 // These nape and ankle fits are calibrated to the shipped character meshes.
 // Loading fallbacks have different anatomy and retain their authored placement.
 if(!rider.root.userData.generated||!carrier.root.userData.generated){
  const k=smooth((a.riding.progress-.8)/.2),back=-.16*carrier.height;
  rider.root.position.lerp(new THREE.Vector3(b.pos[0]+Math.sin(b.yaw)*back,b.pos[1]+2.28+b.hipsOffset[1],b.pos[2]+Math.cos(b.yaw)*back),k);
  rider.root.updateMatrixWorld(true);return;
 }
 rider.root.updateMatrixWorld(true);carrier.root.updateMatrixWorld(true);
 const k=a.riding.progress,forward=new THREE.Vector3(Math.sin(b.yaw),0,Math.cos(b.yaw)),right=new THREE.Vector3(Math.cos(b.yaw),0,-Math.sin(b.yaw)),up=new THREE.Vector3(0,1,0),neck=at(carrier.bones.Neck);
 const desired=neck.clone().addScaledVector(forward,-.16).addScaledVector(up,.12),seat=nearestSurface(carrier,['Spine1','Spine2','Neck','Head'],desired,p=>p.y<neck.y+.23&&p.clone().sub(neck).dot(forward)<-.06);
 const riderSeat=at(rider.bones.LeftUpLeg).lerp(at(rider.bones.RightUpLeg),.5).addScaledVector(up,-.02);
 // Fit the hold to the surface; retain the authored overhead lift arc en route.
 if(k>.8){const delta=seat.clone().addScaledVector(up,.005).sub(riderSeat).multiplyScalar(smooth((k-.8)/.2));rider.root.position.add(delta);rider.root.updateMatrixWorld(true);}
 const legs=[];
 if(k>.8)for(const side of [1,-1]){
  const prefix=side>0?'Left':'Right',hip=rider.bones[prefix+'UpLeg'],knee=rider.bones[prefix+'Leg'],foot=rider.bones[prefix+'Foot'],base=[hip,knee,foot].map(j=>j.quaternion.clone()),footQ=foot.getWorldQuaternion(new THREE.Quaternion());
  const surface=nearestSurface(carrier,['Spine2','Neck',prefix+'Shoulder',prefix+'Arm'],neck.clone().addScaledVector(right,side*.26).addScaledVector(forward,-.025).addScaledVector(up,-.03));
  const target=surface.clone().addScaledVector(up,.065),pole=at(hip).addScaledVector(right,side*.25).addScaledVector(forward,.12).addScaledVector(up,.12),error=solveArm(hip,knee,foot,target,pole);
  foot.quaternion.copy(foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footQ));foot.updateWorldMatrix(false,true);
  const strength=smooth((k-.8)/.2);if(strength<1)[hip,knee,foot].forEach((j,i)=>{const solved=j.quaternion.clone();j.quaternion.copy(base[i]).slerp(solved,strength);});rider.root.updateMatrixWorld(true);
  legs.push({side,error,surface:surface.toArray(),target:target.toArray(),point:at(foot).toArray()});
 }
 const supports=[];
 if(!b.holding)for(const hand of contactHands.get(carrier.root)??[]){
  const side=hand.side>0?'Left':'Right',foot=at(rider.bones[side+'Foot']);
  const pickup=at(rider.bones.Spine2).lerp(at(rider.bones.Hips),.35*smooth(k/.4)).addScaledVector(right,hand.side*.07),target=pickup.lerp(foot.clone().addScaledVector(right,hand.side*.025),smooth((k-.55)/.35));
  const strength=b.verb==='carry'?smooth((b.action?.time??0)/.35):1;
  const joints=['Arm','ForeArm','Hand'].map(n=>carrier.bones[side+n]),base=joints.map(j=>j.quaternion.clone());
  for(const name of ['Arm','ForeArm'])carrier.bones[side+name].quaternion.copy(carrier.rest[side+name]);carrier.root.updateMatrixWorld(true);
  const overhead=smooth((k-.35)/.4);
  const pole=at(carrier.bones[side+'Arm']).addScaledVector(right,hand.side*.34).addScaledVector(forward,lerp(-.14,.16,overhead)).addScaledVector(up,-.55);
  const long=up.clone().addScaledVector(forward,-.9*smooth((k-.55)/.35)).normalize();
  const result=hand.place(target,long, right.clone().multiplyScalar(-hand.side),1,pole);
  if(strength<1)joints.forEach((j,i)=>{const solved=j.quaternion.clone();j.quaternion.copy(base[i]).slerp(solved,strength);});carrier.root.updateMatrixWorld(true);
  supports.push({side:hand.side,error:result.error,gap:result.point.distanceTo(target),point:result.point.toArray(),target:target.toArray()});
 }
 // Clapping and other authored hand actions remain free. Quiet riding rests
 // the palms against the rear sides of the head instead of hanging in space.
 if(k>=.99&&!a.holding&&['idle','laugh','nod','sigh'].includes(a.verb))for(const hand of contactHands.get(rider.root)??[]){
  const side=hand.side>0?'Left':'Right';
  const target=nearestSurface(carrier,['Neck','Head'],neck.clone().addScaledVector(right,hand.side*.16).addScaledVector(forward,-.18).addScaledVector(up,.08));
  const pole=at(rider.bones[side+'Arm']).addScaledVector(right,hand.side*.22).addScaledVector(forward,-.06).addScaledVector(up,-.18);
  const normal=neck.clone().sub(target);normal.y=0;normal.normalize();hand.place(target,new THREE.Vector3(0,-1,0),normal,1,pole);
 }
 rider.root.userData.carryContacts={progress:k,legs,seat:seat.toArray(),riderSeat:at(rider.bones.LeftUpLeg).lerp(at(rider.bones.RightUpLeg),.5).addScaledVector(up,-.02).toArray(),supports};
}
