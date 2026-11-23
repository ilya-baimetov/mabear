import {isCarrot} from '../../shared/schema';
import * as THREE from 'three';
import type {ActorFrame,CharacterRig} from '../api';
import {PROP_CONTACTS} from '../../shared/propContacts';
import {clapOpen} from '../../shared/contactTiming';
import {kitchenSurfaceGrasp,prepTableLift,solveArm} from './mashaContacts';
import {contactHands,toolWristDelta,torsoElbowPole} from './contactHands';
import {isHousePoint} from '../../shared/houseLayout';
import {KITCHEN_CONTAINERS} from '../../shared/kitchenContainers';
import { clamp, smooth } from '../../shared/math';

type Sample={mesh:THREE.SkinnedMesh;index:number;local:THREE.Vector3;u:number};
type Hand={side:number;arm:THREE.Bone;elbow:THREE.Bone;wrist:THREE.Bone;restQ:THREE.Quaternion;basis:THREE.Quaternion;scale:THREE.Vector3;samples:Sample[];palm:Sample[];length:number;normal:THREE.Vector3};
const at=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
function measure(rig:CharacterRig,side:number,meshes:THREE.SkinnedMesh[]):Hand|null{
 const prefix=side>0?'Left':'Right',arm=rig.bones[prefix+'Arm'],elbow=rig.bones[prefix+'ForeArm'],wrist=rig.bones[prefix+'Hand'];
 if(!arm||!elbow||!wrist)return null;
 const origin=at(wrist),long=origin.clone().sub(at(elbow)).normalize(),normal=new THREE.Vector3(0,0,1).addScaledVector(long,-long.z).normalize(),width=new THREE.Vector3().crossVectors(normal,long),samples:Sample[]=[];
 const handBones=new Set<THREE.Object3D>();wrist.traverse(o=>handBones.add(o));
 for(const mesh of meshes){
  const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;if(!si||!sw)continue;
  for(let i=0;i<si.count;i++){
   let weight=0;for(let k=0;k<4;k++)if(handBones.has(mesh.skeleton.bones[si.getComponent(i,k)]))weight+=sw.getComponent(i,k);
   if(weight<.7)continue;
   const world=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),u=world.clone().sub(origin).dot(long);
   if(u<-.015*rig.height||u>.22*rig.height)continue;
   samples.push({mesh,index:i,local:wrist.worldToLocal(world),u});
  }
 }
 if(samples.length<15)return null;
 // The imported paw can droop 40 degrees beyond its wrist. Its surface axis
 // differs from the forearm; using the arm direction makes thumbs clap while
 // both pads face the audience. Recover the wrist-to-paw direction first.
 const centroid=new THREE.Vector3();for(const sample of samples)centroid.add(wrist.localToWorld(sample.local.clone()).sub(origin));centroid.multiplyScalar(1/samples.length);
 if(centroid.lengthSq()>1e-9)long.copy(centroid).normalize();
 normal.set(0,0,1).addScaledVector(long,-long.z).normalize();width.crossVectors(normal,long).normalize();
 for(const sample of samples)sample.u=wrist.localToWorld(sample.local.clone()).sub(origin).dot(long);
 const lengths=samples.map(s=>s.u).sort((a,b)=>a-b),length=lengths[Math.floor(lengths.length*.95)];
 const palm=samples.filter(s=>s.u>length*.3&&s.u<length*.75);
 if(palm.length<8)return null;
 // Broad paw axis comes from its source surface, not the humanoid wrist roll.
 let xx=0,xy=0,yy=0;const palmCentre=new THREE.Vector3();for(const sample of palm)palmCentre.add(wrist.localToWorld(sample.local.clone()));palmCentre.multiplyScalar(1/palm.length);
 for(const sample of palm){const d=wrist.localToWorld(sample.local.clone()).sub(palmCentre),x=d.dot(width),y=d.dot(normal);xx+=x*x;xy+=x*y;yy+=y*y;}
 const angle=.5*Math.atan2(2*xy,xx-yy),broad=width.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normal,Math.sin(angle));width.copy(broad);normal.crossVectors(long,width).normalize();if(normal.z<0){normal.negate();width.negate();}
 return{side,arm,elbow,wrist,restQ:wrist.getWorldQuaternion(new THREE.Quaternion()),scale:wrist.getWorldScale(new THREE.Vector3()),basis:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,width,normal)),samples,palm,length,normal};
}
function orient(h:Hand,long:THREE.Vector3,normal:THREE.Vector3):THREE.Quaternion{
 long=long.clone().normalize();normal=normal.clone().addScaledVector(long,-normal.dot(long)).normalize();
 const width=new THREE.Vector3().crossVectors(normal,long).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,width,normal)).multiply(h.basis.clone().invert()).multiply(h.restQ);
}
function setWorldRotation(b:THREE.Bone,q:THREE.Quaternion){b.quaternion.copy(b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));b.updateWorldMatrix(false,true);}
function surface(h:Hand,direction:THREE.Vector3,palmOnly=false):THREE.Vector3{
 let best=-Infinity,result=new THREE.Vector3();
 for(const sample of palmOnly?h.palm:h.samples){const v=sample.mesh.getVertexPosition(sample.index,new THREE.Vector3()).applyMatrix4(sample.mesh.matrixWorld),d=v.dot(direction);if(d>best){best=d;result=v;}}
 return result;
}
function palmSample(h:Hand,q:THREE.Quaternion,normal:THREE.Vector3):Sample{
 let best=-Infinity,result=h.palm[0];for(const sample of h.palm){const dot=sample.local.clone().multiply(h.scale).applyQuaternion(q).dot(normal);if(dot>best){best=dot;result=sample;}}return result;
}
const samplePoint=(s:Sample)=>s.mesh.getVertexPosition(s.index,new THREE.Vector3()).applyMatrix4(s.mesh.matrixWorld);

/** Source-preserving paw/hoof contacts. No human fingers are added to animal meshes. */
export function addSourceContacts(rig:CharacterRig):boolean{
 const meshes:THREE.SkinnedMesh[]=[];rig.root.updateMatrixWorld(true);rig.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)meshes.push(o as THREE.SkinnedMesh);});
 const measured=[measure(rig,1,meshes),measure(rig,-1,meshes)];
 if(measured.some(h=>!h))return false;
 const hands=measured as Hand[],torso=rig.bones.Spine2??rig.bones.Spine,restTorso=torso.getWorldQuaternion(new THREE.Quaternion()).invert(),height=rig.height,restShoulderY=rig.root.worldToLocal(at((measured as Hand[])[1].arm)).y;
 const baseApply=rig.apply.bind(rig),metrics:Record<string,unknown>={},socketPosition=rig.handSocket.position.clone(),socketRotation=rig.handSocket.quaternion.clone();rig.root.userData.contacts=metrics;
 const place=(h:Hand,local:THREE.Vector3,target:THREE.Vector3,q:THREE.Quaternion,poleOverride?:THREE.Vector3)=>{
  const wristTarget=target.clone().sub(local.clone().multiply(h.scale).applyQuaternion(q));
  const pole=poleOverride??torsoElbowPole(at(h.arm),h.side as 1|-1,height,torso.getWorldQuaternion(new THREE.Quaternion()).multiply(restTorso));
  const error=solveArm(h.arm,h.elbow,h.wrist,wristTarget,pole);setWorldRotation(h.wrist,q);return error;
 };
 const fitSample=(h:Hand,s:Sample,target:THREE.Vector3,q:THREE.Quaternion,pole?:THREE.Vector3)=>{
  let error=place(h,s.local,target,q,pole);
  // A fixed measured vertex avoids alternating between two support extrema
  // when the broad mixed-weight paw rotates above the pot.
  for(let i=0;i<6;i++)error=place(h,h.wrist.worldToLocal(samplePoint(s)),target,q,pole);
  return error;
 };
 contactHands.set(rig.root,hands.map(h=>({side:h.side as 1|-1,place(target,long,normal,strength,pole){
  const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),q=orient(h,long,normal);
  let best=-Infinity,local=h.palm[0].local;
  for(const sample of h.palm){const d=sample.local.clone().multiply(h.scale).applyQuaternion(q).dot(normal);if(d>best){best=d;local=sample.local;}}
  let error=place(h,local,target,q,pole);
  for(let i=0;i<3;i++)error=place(h,h.wrist.worldToLocal(surface(h,normal,true)),target,q,pole);
  if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
  rig.root.updateMatrixWorld(true);return {error,point:surface(h,normal,true)};
 }})));
 rig.apply=(frame:ActorFrame)=>{
  baseApply(frame);rig.root.updateMatrixWorld(true);for(const key of Object.keys(metrics))delete metrics[key];metrics.mode='free';
  rig.handSocket.userData.preciseGrip=false;
  rig.handSocket.position.copy(socketPosition);rig.handSocket.quaternion.copy(socketRotation);
  const delta=torso.getWorldQuaternion(new THREE.Quaternion()).multiply(restTorso),vec=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyQuaternion(delta),time=frame.action?.time??0;
  const kitchenCarrot=rig.id==='bear'&&isCarrot(frame.holding??frame.pickup?.item??frame.putDown?.item)&&isHousePoint(frame.pos[0],frame.pos[2])&&frame.pos[0]<-9;
  const kitchenFoodPickup=rig.id==='bear'&&frame.pickup&&['pancakes','cake','jam_jar'].includes(frame.pickup.item)&&isHousePoint(frame.pos[0],frame.pos[2]);
  const pot=KITCHEN_CONTAINERS.kitchen_pot,nearPot=kitchenCarrot?smooth((1.50-Math.hypot(frame.pos[0]-pot.position[0],frame.pos[2]-pot.position[1]))/.55):0;
  const kitchenCarryOrigin=()=>new THREE.Vector3(-.20-.25*nearPot,1.20+.65*nearPot,.48-.08*nearPot).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).add(new THREE.Vector3(...frame.pos));
  const kitchenPole=(h:Hand)=>new THREE.Vector3(h.side*(.22+.13*nearPot),1.38+.57*nearPot,.30-.25*nearPot).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).add(new THREE.Vector3(...frame.pos));
  if(kitchenCarrot&&['idle','walk_to','run_to','tiptoe_to','look_at','take','put_down'].includes(frame.verb)){
    // Tuck the free paw while passing furniture. Its normal gait swing extends
    // beyond the torso and cuts through both the table and stove in this aisle.
    const h=hands[0],base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw),handQ=orient(h,new THREE.Vector3(0,1,0),normal),target=new THREE.Vector3(.27,1.53,.43).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).add(new THREE.Vector3(...frame.pos));
    for(let i=0;i<4;i++)place(h,h.wrist.worldToLocal(surface(h,normal,true)),target,handQ,kitchenPole(h));
    const strength=frame.pickup&&!frame.holding?smooth(time/.25):frame.putDown?1-smooth((time/(frame.action?.duration??1)-.7)/.3):1;
    if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
    rig.root.updateMatrixWorld(true);
  }
  if(frame.verb==='clap'&&!frame.holding){
   const open=clapOpen(time),gap=.001+open*height*.115,center=at(hands[0].arm).add(at(hands[1].arm)).multiplyScalar(.5).add(vec(0,-height*.065,height*.18));
   const entry=smooth(time/.15),exit=frame.action?.duration?smooth((frame.action.duration-time)/.12):1,strength=Math.min(entry,exit),errors:number[]=[];
   const plans=hands.map(h=>{
    const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),angle=.16,sa=Math.sin(angle),ca=Math.cos(angle),q=orient(h,vec(-h.side*sa,ca,0),vec(-h.side*ca,-sa,0)),inward=vec(-h.side,0,0);
    // Support of the complete imported hand, including claws. Put its extreme
    // surface on this side of the contact plane so paws cannot cross each other.
    let best=-Infinity,local=new THREE.Vector3();for(const sample of h.samples){const p=sample.local.clone().multiply(h.scale).applyQuaternion(q),d=p.dot(inward);if(d>best){best=d;local=sample.local;}}
    const offset=local.clone().multiply(h.scale).applyQuaternion(q),reach=at(h.arm).distanceTo(at(h.elbow))+at(h.elbow).distanceTo(at(h.wrist))-.001*height;
    return{h,base,q,local,reach,ball:at(h.arm).add(offset).addScaledVector(vec(1,0,0),-h.side*gap*.5)};
   });
   // Find a common meeting point reachable by both measured arm chains. Short
   // hare paws and Rosie's wide shoulders cannot use Bear's chest coordinates.
   for(let i=0;i<12;i++)for(const plan of plans){const d=center.clone().sub(plan.ball);if(d.length()>plan.reach)center.copy(plan.ball).add(d.setLength(plan.reach));}
   for(const {h,base,q,local} of plans){
    const target=center.clone().addScaledVector(vec(1,0,0),h.side*gap*.5),inward=vec(-h.side,0,0),adjTarget=target.clone();
    let error=place(h,local,adjTarget,q);
    // Mixed wrist/forearm skin weights move the real surface differently from
    // a rigid socket. Refit along the contact normal so the extreme surface sits on target.
    for(let i=0;i<4;i++){
      const overshoot=surface(h,inward).sub(target).dot(inward);
      adjTarget.addScaledVector(inward,-overshoot);
      error=place(h,local,adjTarget,q);
    }
    errors.push(error);
    // Restore the exact authored entrance pose and blend toward the IK result.
    if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const target=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(target,strength);});
   }
   rig.root.updateMatrixWorld(true);
   const axis=vec(1,0,0),left=surface(hands[0],axis.clone().negate()),right=surface(hands[1],axis);
   const normals=hands.map(h=>h.normal.clone().applyQuaternion(h.restQ.clone().invert()).applyQuaternion(h.wrist.getWorldQuaternion(new THREE.Quaternion())));
   const padOverlap=[vec(0,1,0),vec(0,0,1)].map(axis=>{
    const ranges=hands.map(h=>{const values=h.palm.map(s=>s.mesh.getVertexPosition(s.index,new THREE.Vector3()).applyMatrix4(s.mesh.matrixWorld).dot(axis));return[Math.min(...values),Math.max(...values)];});
    return Math.max(0,Math.min(ranges[0][1],ranges[1][1])-Math.max(ranges[0][0],ranges[1][0]))/Math.max(1e-6,Math.min(ranges[0][1]-ranges[0][0],ranges[1][1]-ranges[1][0]));
   });
   Object.assign(metrics,{mode:'clap',targetGap:gap,surfaceGap:left.clone().sub(right).dot(axis),reachError:Math.max(...errors),strength,palmNormalDot:normals[0].dot(normals[1]),padOverlap,planeNormal:axis.toArray()});
  }
  const reverseSurface=frame.putDown?kitchenSurfaceGrasp(frame,frame.putDown):null;
  const potWithdrawal=rig.id==='bear'&&frame.putDown?.container==='kitchen_pot'&&time>=(frame.action?.duration??1)*frame.putDown.release;
  if(potWithdrawal){
   const data=frame.putDown!,h=hands[1],grip=PROP_CONTACTS[data.item],duration=frame.action?.duration??1,release=duration*data.release,u=clamp((time-release)/Math.max(.001,duration-release),0,1);
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),baseElbow=at(h.elbow),restQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation,'YXZ')),normal=new THREE.Vector3(0,0,1).applyQuaternion(restQ),long=new THREE.Vector3(0,-1,0).applyQuaternion(restQ),contactQ=orient(h,long,normal),baseQ=h.wrist.getWorldQuaternion(new THREE.Quaternion());
   const grasp=palmSample(h,contactQ,normal),baseNormal=h.normal.clone().applyQuaternion(h.restQ.clone().invert()).applyQuaternion(baseQ),lower=smooth((u-.45)/.55),direction=normal.clone().lerp(baseNormal,lower).normalize(),handQ=contactQ.clone().slerp(baseQ,lower);
   const start=new THREE.Vector3(...data.position).add(new THREE.Vector3(...grip.point).applyQuaternion(restQ)).addScaledVector(normal,-grip.radius-.0005),retreat=new THREE.Vector3(-.58,2.18,-.03).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).add(new THREE.Vector3(...frame.pos));
   // First clear the rim at full height; only then lower the empty paw toward
   // the actual idle pose. The released carrot follows its independent fall.
   const target=u<.45?start.lerp(retreat,smooth(u/.45)):retreat.lerp(samplePoint(grasp),lower);
   const pole=kitchenPole(h).lerp(baseElbow,lower);
   const error=fitSample(h,grasp,target,handQ,pole);
   const exit=smooth((u-.85)/.15);if(exit>0)[h.arm,h.elbow,h.wrist].forEach((b,i)=>b.quaternion.slerp(base[i],exit));
   rig.root.updateMatrixWorld(true);Object.assign(metrics,{mode:'potWithdraw',prop:data.item,reachError:error,targetPoint:target.toArray(),contactPoint:samplePoint(grasp).toArray(),progress:u});
  }else if(frame.pickup||reverseSurface||frame.putDown&&isCarrot(frame.putDown.item)){
   const data=(frame.pickup??frame.putDown)!,h=hands[1],grip=PROP_CONTACTS[data.item],duration=frame.action?.duration??1,attach=duration*data.release,pickupTime=frame.pickup?time:duration-time;
   const after=clamp((pickupTime-attach)/Math.max(.001,duration-attach),0,1),carry=clamp((after-(data.container?.34:.06))/(data.container?.56:.64),0,1),gripCarry=smooth((after-(data.container?.34:.18))/(data.container?.56:.52)),strength=pickupTime<attach?smooth(pickupTime/Math.max(.001,attach-.035)):1;
   const surfaceGrasp=kitchenSurfaceGrasp(frame,data);
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),baseQ=h.wrist.getWorldQuaternion(new THREE.Quaternion());
   const restQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation,'YXZ')),heldQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(grip.rotation??[0,0,0]),'YXZ')));
   const heldDirection=grip.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(heldQ),heldOrigin=surface(h,heldDirection,true).addScaledVector(heldDirection,grip.radius+.0005).sub(new THREE.Vector3(...grip.point).applyQuaternion(heldQ));
   if(data.item==='pantry_honey'&&rig.id==='bear')heldOrigin.set(...frame.pos).add(new THREE.Vector3(-.33,1.45,.46).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw));
   if(kitchenCarrot)heldOrigin.copy(kitchenCarryOrigin());
   heldOrigin.y+=prepTableLift(frame,data.item,heldOrigin,.18);
   // The pot release is already above its rim. A large extra lift overextends
   // the measured arm midway through the approach and drives its thick skin
   // into the near wall even when the exact handoff is reachable.
   const containerLift=data.container==='kitchen_pot'?(frame.putDown?.06:.52):data.container==='kitchen_bowl'?.24:0;
   const origin=new THREE.Vector3(...data.position);if(pickupTime>attach)origin.y+=(containerLift||.18)*smooth(after/(containerLift?.30:.18));origin.lerp(heldOrigin,carry);
   if(containerLift&&pickupTime>attach){const horizontal=Math.hypot(origin.x-data.position[0],origin.z-data.position[2]);origin.y=Math.max(origin.y,data.position[1]+containerLift*smooth(after/.30)*(1-smooth((horizontal-.22)/.32)));}
   // Pull the jar clear of the shelf lip before lowering it to the carry pose.
   // The same time-derived path is evaluated on either side of attachment.
   if(data.item==='pantry_honey'&&data.position[1]>2){
    origin.set(...data.position).add(new THREE.Vector3(.40,.035,0).multiplyScalar(smooth(after/.35)));
    origin.lerp(heldOrigin,smooth((after-.35)/.65));
   }
   const horizontal=Math.hypot(origin.x-data.position[0],origin.z-data.position[2]);
   if(pickupTime>attach&&data.item!=='pantry_honey')origin.y=Math.max(origin.y,data.position[1]+.03*smooth(after/.1)*(1-smooth((horizontal-.15)/.25)));
   if(pickupTime>attach)origin.y+=prepTableLift(frame,data.item,origin,.18)*smooth(after/.1);
   if(data.container==='kitchen_pot'&&frame.putDown&&pickupTime>attach){
    // Keep the approaching arm on the near side until the paw is above the
    // opening, then translate the carrot over the pot for the exact release.
    const away=new THREE.Vector3(frame.pos[0]-data.position[0],0,frame.pos[2]-data.position[2]).normalize();
    origin.addScaledVector(away,.07*smooth(after/.25)*(1-smooth((after-.60)/.40)));
   }
   const objectQ=restQ.clone().slerp(heldQ,carry),objectDelta=objectQ.clone().multiply(restQ.clone().invert());
   const normal=surfaceGrasp?surfaceGrasp.normal.clone().applyQuaternion(objectDelta):grip.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(restQ),long=surfaceGrasp?surfaceGrasp.long.clone().applyQuaternion(objectDelta):grip.support?new THREE.Vector3(data.position[0],at(h.arm).y,data.position[2]).sub(at(h.arm)).normalize():new THREE.Vector3(0,1,0).applyQuaternion(restQ);
   if(data.container==='kitchen_pot'||!surfaceGrasp&&!grip.support&&data.position[1]+new THREE.Vector3(...grip.point).applyQuaternion(restQ).y<frame.pos[1]+restShoulderY-height*.08)long.negate();
   const direction=normal.clone().lerp(heldDirection,surfaceGrasp?gripCarry:carry);
   if(surfaceGrasp&&normal.dot(heldDirection)<-.99)direction.addScaledVector(surfaceGrasp.outward,-Math.sin(gripCarry*Math.PI));direction.normalize();
   const gripOffset=data.item==='ball'?new THREE.Vector3(0,.15,0).applyQuaternion(objectQ).sub(new THREE.Vector3(0,.15,0)):new THREE.Vector3(...grip.point).applyQuaternion(objectQ);
   if(surfaceGrasp)gripOffset.copy(surfaceGrasp.offset).applyQuaternion(objectDelta).lerp(new THREE.Vector3(...grip.point).applyQuaternion(objectQ),gripCarry);
   const carryQ=(data.item==='pantry_honey'&&rig.id==='bear')||kitchenCarrot?orient(h,new THREE.Vector3(0,1,0),heldDirection):baseQ;
   const handQ=orient(h,long,normal).slerp(carryQ,surfaceGrasp?gripCarry:carry),target=origin.clone().add(gripOffset).addScaledVector(direction,-grip.radius-.0005);
   let best=-Infinity,local=h.palm[0].local;
   for(const sample of h.palm){const d=sample.local.clone().multiply(h.scale).applyQuaternion(handQ).dot(direction);if(d>best){best=d;local=sample.local;}}
   const carryPole=kitchenCarrot||kitchenFoodPickup?at(h.arm).add(new THREE.Vector3(h.side*height*.2,-height*.2,0).applyQuaternion(rig.root.quaternion)).lerp(kitchenPole(h),data.container==='kitchen_pot'?1:kitchenCarrot?smooth(carry):1-smooth(carry)):undefined;
   const potGrasp=data.container==='kitchen_pot'?palmSample(h,handQ,direction):null;
   let error=potGrasp?fitSample(h,potGrasp,target,handQ,carryPole):place(h,local,target,handQ,carryPole);
   if(!potGrasp)for(let i=0;i<4;i++)error=place(h,h.wrist.worldToLocal(surface(h,direction,true)),target,handQ,carryPole);
   if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   rig.root.updateMatrixWorld(true);
   const touch=potGrasp?samplePoint(potGrasp):surface(h,direction,true),actualOrigin=touch.clone().addScaledVector(direction,grip.radius+.0005).sub(gripOffset);
   rig.handSocket.position.copy(h.wrist.worldToLocal(actualOrigin.clone()));rig.handSocket.quaternion.copy(h.wrist.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(objectQ));rig.handSocket.userData.preciseGrip=true;rig.handSocket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:frame.pickup?'pickup':'putDown',prop:data.item,strength,reachError:error,attachmentError:actualOrigin.distanceTo(new THREE.Vector3(...data.position)),targetError:actualOrigin.distanceTo(origin),contactPoint:touch.toArray(),targetPoint:target.toArray(),withdrawal:after,surfaceGrip:!!surfaceGrasp,releaseGap:actualOrigin.distanceTo(new THREE.Vector3(...data.position))});
  }else if(frame.putDown){
   const drop=frame.putDown,h=hands[1],grip=PROP_CONTACTS[drop.item],duration=frame.action?.duration??1,release=duration*drop.release;
   // Meet the actual resting object before ownership changes, then withdraw
   // the empty paw. Both sides of the release evaluate the same contact pose.
   const strength=time<=release?smooth(time/Math.max(release,1e-6)):1-smooth((time-release)/Math.max(duration-release,1e-6));
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),targetQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...drop.rotation,'YXZ'));
   const normal=grip.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(targetQ),long=new THREE.Vector3(...(grip.support?[0,0,1]:[0,1,0]) as [number,number,number]).applyQuaternion(targetQ);
   // Reach down with fingers pointing down. An upright-paw assumption puts
   // the wrist below a low object, wasting an entire paw length of reach.
   const gripHeight=drop.position[1]+new THREE.Vector3(...grip.point).applyQuaternion(targetQ).y;
   if(!grip.support&&gripHeight<frame.pos[1]+restShoulderY-height*.08)long.negate();
   const handQ=orient(h,long,normal);
   const restingOrigin=new THREE.Vector3(...drop.position);
   // Stage converts this target into the same pre-support-lift rig space.
   const target=restingOrigin.clone().add(new THREE.Vector3(...grip.point).applyQuaternion(targetQ)).addScaledVector(normal,-grip.radius-.0005);
   let best=-Infinity,local=h.palm[0].local;
   for(const sample of h.palm){const d=sample.local.clone().multiply(h.scale).applyQuaternion(handQ).dot(normal);if(d>best){best=d;local=sample.local;}}
   let error=place(h,local,target,handQ);
   for(let i=0;i<4;i++)error=place(h,h.wrist.worldToLocal(surface(h,normal,true)),target,handQ);
   if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   rig.root.updateMatrixWorld(true);
   const heldQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(grip.rotation??[0,0,0]),'YXZ'))),objectQ=heldQ.slerp(targetQ,strength);
   const direction=grip.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(objectQ),touch=surface(h,direction,true),anchor=touch.clone().addScaledVector(direction,grip.radius+.0005),origin=anchor.clone().sub(new THREE.Vector3(...grip.point).applyQuaternion(objectQ));
   rig.handSocket.position.copy(h.wrist.worldToLocal(origin.clone()));rig.handSocket.quaternion.copy(h.wrist.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(objectQ));rig.handSocket.userData.preciseGrip=true;rig.handSocket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'putDown',prop:drop.item,strength,reachError:error,releaseGap:origin.distanceTo(restingOrigin),contactPoint:touch.toArray(),targetPoint:target.toArray(),radius:grip.radius});
  }else if(frame.holding){
   const h=hands[1],grip=PROP_CONTACTS[frame.holding],fishing=frame.holding==='fishing_rod'&&frame.verb==='fish',yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw),rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(grip.rotation??[0,0,0]),'YXZ')),toolDelta=toolWristDelta(frame),q=toolDelta?yaw.multiply(toolDelta).multiply(rot):yaw.multiply(rot),defaultDirection=grip.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(q),fishingDirection=vec(1,0,0);
   // The caught fish replaces the rod before the authored clip ends. Ease both
   // arms back before that handoff, as well as easing into the initial grip.
   const contactEnd=frame.action?.contactEnd??frame.action?.duration;
   const fishingWeight=fishing?Math.min(smooth(time/.2),contactEnd===undefined?1:smooth((contactEnd-time)/.2)):0;
   const direction=defaultDirection.clone().lerp(fishingDirection,fishingWeight).normalize();
   if(fishing){
    const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),long=new THREE.Vector3(0,1,0).applyQuaternion(q),handQ=orient(h,long,fishingDirection),centre=at(hands[0].arm).add(at(h.arm)).multiplyScalar(.5).add(vec(-height*.04,-height*.10,height*.16));
    let best=-Infinity,local=h.palm[0].local;for(const sample of h.palm){const d=sample.local.clone().multiply(h.scale).applyQuaternion(handQ).dot(fishingDirection);if(d>best){best=d;local=sample.local;}}
    const target=centre.addScaledVector(fishingDirection,-grip.radius-.0005);let error=place(h,local,target,handQ);
    for(let i=0;i<2;i++)error=place(h,h.wrist.worldToLocal(surface(h,fishingDirection,true)),target,handQ);
    if(fishingWeight<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,fishingWeight);});
    rig.root.updateMatrixWorld(true);
    Object.assign(metrics,{primaryReachError:error,strength:fishingWeight});
   }
   if(frame.holding==='pantry_honey'&&rig.id==='bear'||kitchenCarrot){
    const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone());
    const carrying=['idle','walk_to','run_to','tiptoe_to','look_at','open','close'].includes(frame.verb);
    // The stable carry must yield to authored gestures and object actions.
    // Blend at their boundaries so waving/eating/giving still moves this paw.
    const weight=carrying?1:1-Math.min(smooth(time/.25),smooth(((frame.action?.duration??0)-time)/.25));
    const origin=kitchenCarrot?kitchenCarryOrigin():new THREE.Vector3(...frame.pos).add(new THREE.Vector3(-.33,1.45,.46).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw));
    const target=origin.add(new THREE.Vector3(...grip.point).applyQuaternion(q)).addScaledVector(direction,-grip.radius-.0005);
    const handQ=orient(h,new THREE.Vector3(0,1,0),direction);
    let error=place(h,h.wrist.worldToLocal(surface(h,direction,true)),target,handQ,kitchenCarrot?kitchenPole(h):undefined);
    for(let i=0;i<4;i++)error=place(h,h.wrist.worldToLocal(surface(h,direction,true)),target,handQ,kitchenCarrot?kitchenPole(h):undefined);
    if(weight<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,weight);});
    rig.root.updateMatrixWorld(true);Object.assign(metrics,{carryTarget:target.toArray(),reachError:error});
   }
   const touch=surface(h,direction,true),anchor=touch.clone().addScaledVector(direction,grip.radius+.0005),origin=anchor.clone().sub(new THREE.Vector3(...grip.point).applyQuaternion(q));
   const tableLift=prepTableLift(frame,frame.holding,origin,.18);
   if(tableLift>0){
    const target=touch.clone();target.y+=tableLift;const handQ=h.wrist.getWorldQuaternion(new THREE.Quaternion());
    let error=place(h,h.wrist.worldToLocal(touch.clone()),target,handQ);
    for(let i=0;i<3;i++)error=place(h,h.wrist.worldToLocal(surface(h,direction,true)),target,handQ);
    rig.root.updateMatrixWorld(true);touch.copy(surface(h,direction,true));anchor.copy(touch).addScaledVector(direction,grip.radius+.0005);origin.copy(anchor).sub(new THREE.Vector3(...grip.point).applyQuaternion(q));
    Object.assign(metrics,{tableClearanceLift:tableLift,reachError:error});
   }
   rig.handSocket.position.copy(h.wrist.worldToLocal(origin.clone()));rig.handSocket.quaternion.copy(h.wrist.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));rig.handSocket.userData.preciseGrip=true;rig.handSocket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'prop',prop:frame.holding,contactPoint:touch.toArray(),gripPoint:anchor.toArray(),radius:grip.radius});
   if(frame.holding==='fishing_rod'&&frame.verb==='fish'){
    const left=hands[0],normal=direction.clone().negate(),long=new THREE.Vector3(0,1,0).applyQuaternion(q),leftQ=orient(left,long,normal),base=[left.arm,left.elbow,left.wrist].map(b=>b.quaternion.clone());
    let best=-Infinity,local=left.palm[0].local;
    for(const sample of left.palm){const d=sample.local.clone().multiply(left.scale).applyQuaternion(leftQ).dot(normal);if(d>best){best=d;local=sample.local;}}
    const target=new THREE.Vector3(0,.34,0).applyQuaternion(q).add(origin).addScaledVector(normal,-.0145);
    let error=place(left,local,target,leftQ);
    for(let i=0;i<2;i++)error=place(left,left.wrist.worldToLocal(surface(left,normal,true)),target,leftQ);
    if(fishingWeight<1)[left.arm,left.elbow,left.wrist].forEach((b,i)=>{const target=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(target,fishingWeight);});
    Object.assign(metrics,{secondaryReachError:error,secondaryContact:target.toArray()});
   }
  }
  rig.root.updateMatrixWorld(true);
 };
 rig.root.userData.contactCalibration=hands.map(h=>({side:h.side,vertices:h.samples.length,palmVertices:h.palm.length,length:h.length}));
 return true;
}
