import * as THREE from 'three';
import type {ActorFrame} from '../api';
import {createMashaHands,MASHA_HAND} from './mashaHands';
import {PROP_CONTACTS} from '../../shared/propContacts';
import {clapOpen} from '../../shared/contactTiming';

type Hand={side:'Left'|'Right';arm:THREE.Bone;elbow:THREE.Bone;wrist:THREE.Bone;long:THREE.Vector3;normal:THREE.Vector3;width:THREE.Vector3;restQ:THREE.Quaternion;basis:THREE.Quaternion;scale:THREE.Vector3;palm:THREE.Vector3;grip:THREE.Vector3};
const clamp=THREE.MathUtils.clamp;
const point=(b:THREE.Object3D)=>b.getWorldPosition(new THREE.Vector3());
const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};

/** Analytic two-bone IK with a stable elbow pole. It uses measured source
 * lengths, so retargeted arm proportions cannot silently miss the contact. */
export function solveArm(arm:THREE.Bone,elbow:THREE.Bone,wrist:THREE.Bone,target:THREE.Vector3,pole:THREE.Vector3){
 const a=point(arm),b=point(elbow),c=point(wrist),upper=a.distanceTo(b),lower=b.distanceTo(c),direction=target.clone().sub(a),distance=clamp(direction.length(),Math.abs(upper-lower)+.0001,upper+lower-.0001);
 if(direction.lengthSq()<1e-12)direction.copy(c).sub(a);if(direction.lengthSq()<1e-12)direction.set(0,-1,0);direction.normalize();
 const bend=pole.clone().sub(a).addScaledVector(direction,-pole.clone().sub(a).dot(direction));
 if(bend.lengthSq()<1e-12){bend.set(Math.abs(direction.x)<.8?1:0,Math.abs(direction.x)<.8?0:1,0);bend.addScaledVector(direction,-bend.dot(direction));}bend.normalize();
 const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 const desiredElbow=a.clone().addScaledVector(direction,along).addScaledVector(bend,height);
 rotateWorld(arm,new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desiredElbow.clone().sub(a).normalize()));
 const nowElbow=point(elbow),nowWrist=point(wrist);
 rotateWorld(elbow,new THREE.Quaternion().setFromUnitVectors(nowWrist.sub(nowElbow).normalize(),target.clone().sub(nowElbow).normalize()));
 return point(wrist).distanceTo(target);
}
function rotateWorld(b:THREE.Bone,delta:THREE.Quaternion){
 const q=delta.multiply(b.getWorldQuaternion(new THREE.Quaternion()));b.quaternion.copy(b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));b.updateWorldMatrix(false,true);
}

function handFrame(side:'Left'|'Right',bones:Record<string,THREE.Bone>,meshes:THREE.SkinnedMesh[]):Hand{
 const arm=bones[side+'Arm'],elbow=bones[side+'ForeArm'],wrist=bones[side+'Hand'],origin=point(wrist),long=origin.clone().sub(point(elbow)).normalize(),normal=new THREE.Vector3(0,0,1).addScaledVector(long,-long.z).normalize(),width=new THREE.Vector3().crossVectors(normal,long).normalize();
 // Recover the broad palm axis from the generated geometry. The source hand
 // is rolled relative to its arm; assuming +Z is its palm twists a clap.
 let xx=0,xy=0,yy=0;
 for(const mesh of meshes){const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,joint=mesh.skeleton.bones.indexOf(wrist);for(let i=0;i<si.count;i++){let weight=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===joint)weight+=sw.getComponent(i,k);if(weight<.8)continue;const v=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).sub(origin),u=v.dot(long);if(u<.025||u>.09)continue;const x=v.dot(width),y=v.dot(normal);xx+=x*x;xy+=x*y;yy+=y*y;}}
 const angle=.5*Math.atan2(2*xy,xx-yy),broad=width.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normal,Math.sin(angle));width.copy(broad);normal.crossVectors(long,width).normalize();if(normal.z<0){normal.negate();width.negate();}
 return {side,arm,elbow,wrist,long,normal,width,restQ:wrist.getWorldQuaternion(new THREE.Quaternion()),basis:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,width,normal)),scale:wrist.getWorldScale(new THREE.Vector3()),palm:wrist.worldToLocal(origin.clone().addScaledVector(long,MASHA_HAND.palmCenter).addScaledVector(normal,MASHA_HAND.palmDepth)),grip:wrist.worldToLocal(origin.clone().addScaledVector(long,MASHA_HAND.gripLong).addScaledVector(normal,MASHA_HAND.gripNormal))};
}

export function createMashaContacts(meshes:THREE.SkinnedMesh[],bones:Record<string,THREE.Bone>,root:THREE.Object3D,socket:THREE.Object3D,mouthTarget?:(frame:ActorFrame)=>THREE.Vector3){
 const hands=[handFrame('Left',bones,meshes),handFrame('Right',bones,meshes)];
 const rebuiltHands=createMashaHands(meshes,hands);
 const mouthLocal=bones.Head.worldToLocal(new THREE.Vector3(-.001,.651,.16));
 const torso=bones.Spine2??bones.Spine,torsoRest=torso.getWorldQuaternion(new THREE.Quaternion()).invert();
 const torsoDelta=()=>torso.getWorldQuaternion(new THREE.Quaternion()).multiply(torsoRest);
 const metrics:Record<string,unknown>={mode:'free'};root.userData.contacts=metrics;
 const orient=(h:Hand,long:THREE.Vector3,normal:THREE.Vector3)=>{
  const width=new THREE.Vector3().crossVectors(normal,long).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,width,normal)).multiply(h.basis.clone().invert()).multiply(h.restQ);
 };
 const place=(h:Hand,target:THREE.Vector3,q:THREE.Quaternion,localContact:THREE.Vector3)=>{
  const offset=localContact.clone().multiply(h.scale).applyQuaternion(q),wristTarget=target.clone().sub(offset),pole=point(h.arm).add(new THREE.Vector3(h.side==='Left'?.13:-.13,-.18,.02).applyQuaternion(torsoDelta()));
  const error=solveArm(h.arm,h.elbow,h.wrist,wristTarget,pole);
  h.wrist.quaternion.copy(h.wrist.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));h.wrist.updateWorldMatrix(false,true);return error;
 };
 return {update(frame:ActorFrame){
  socket.userData.preciseGrip=false;socket.position.set(0,0,0);socket.quaternion.identity();for(const key of Object.keys(metrics))delete metrics[key];
  const time=frame.action?.time??0,rootQ=torsoDelta(),vec=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyQuaternion(rootQ);
  const freeClap=frame.verb==='clap'&&!frame.holding;
  if(frame.putDown){
   const h=hands[1],data=frame.putDown,prop=PROP_CONTACTS[data.item],duration=frame.action?.duration??1,release=duration*data.release,hold=.035;
   const strength=Math.min(smooth(time/Math.max(.001,release-hold)),smooth((duration-time)/Math.max(.001,duration-release-hold)));
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),restObjectQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation,'YXZ'));
   const startObjectQ=data.item==='lollipop'?h.wrist.getWorldQuaternion(new THREE.Quaternion()).multiply(orient(h,new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)).invert()):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(prop.rotation??[0,0,0]),'YXZ')));
   const objectQ=startObjectQ.slerp(restObjectQ,strength),direction=prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(restObjectQ),long=new THREE.Vector3(1,0,0).applyQuaternion(restObjectQ),q=orient(h,long,direction);
   const target=new THREE.Vector3(...data.position).add(new THREE.Vector3(...prop.point).applyQuaternion(restObjectQ)),candy=data.item==='lollipop';
   if(!candy)target.addScaledVector(direction,-prop.radius-.0005);
   const reachError=place(h,target,q,candy?h.grip:h.palm);
   if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   root.updateMatrixWorld(true);
   const wristQ=h.wrist.getWorldQuaternion(new THREE.Quaternion()),delta=wristQ.clone().multiply(h.restQ.clone().invert());
   const actualDirection=prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(objectQ);
   let anchor:THREE.Vector3;
   if(candy)anchor=h.wrist.localToWorld(h.grip.clone());
   else{
    const axes=[h.long,h.width,h.normal].map(v=>v.clone().applyQuaternion(delta)),radii=[MASHA_HAND.palmLength,MASHA_HAND.palmWidth,MASHA_HAND.palmDepth];
    const denom=Math.hypot(...axes.map((axis,i)=>radii[i]*axis.dot(actualDirection)));
    anchor=h.wrist.localToWorld(h.palm.clone()).addScaledVector(axes[2],-MASHA_HAND.palmDepth);
    for(let i=0;i<3;i++)anchor.addScaledVector(axes[i],radii[i]**2*axes[i].dot(actualDirection)/Math.max(denom,1e-9));
    anchor.addScaledVector(actualDirection,prop.radius+.0005);
   }
   const origin=anchor.clone().sub(new THREE.Vector3(...prop.point).applyQuaternion(objectQ));
   socket.position.copy(h.wrist.worldToLocal(origin));socket.quaternion.copy(wristQ.invert().multiply(objectQ));socket.userData.preciseGrip=true;socket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'putDown',prop:data.item,strength,reachError,releaseError:socket.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...data.position))});
  }else if(freeClap){
   // A quick approach, a 60ms contact hold, and a slower release. All targets
   // derive from clip time, so a scrub never inherits another frame's inertia.
   const open=clapOpen(time),gap=.0004+open*.18,strength=Math.min(smooth(time/.15),frame.action?.duration?smooth((frame.action.duration-time)/.12):1);
   const center=point(hands[0].arm).lerp(point(hands[1].arm),.5).add(vec(0,0,.15));
   const supports:THREE.Vector3[]=[];
   for(const h of hands){
    const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone());
    const side=h.side==='Left'?1:-1,angle=.20+open*.14,sa=Math.sin(angle),ca=Math.cos(angle),long=vec(-side*sa,ca,0),normal=vec(-side*ca,-sa,0),target=center.clone().addScaledVector(vec(1,0,0),side*gap/2).addScaledVector(vec(0,1,0),open*(side>0?.004:-.003)),q=orient(h,long,normal);
    // The wrists open out below the contact. Solve against the ellipsoid's
    // actual support in the shared contact plane, not its rotated normal tip.
    const a=MASHA_HAND.palmLength,c=MASHA_HAND.palmDepth,support=Math.hypot(a*sa,c*ca),inverse=h.restQ.clone().invert();
    const anchor=h.palm.clone().addScaledVector(h.long.clone().applyQuaternion(inverse).divide(h.scale),a*a*sa/support).addScaledVector(h.normal.clone().applyQuaternion(inverse).divide(h.scale),c*c*ca/support-c);
    place(h,target,q,anchor);
    if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
    root.updateMatrixWorld(true);supports.push(h.wrist.localToWorld(anchor));
   }
   Object.assign(metrics,{mode:'clap',strength,palmSeparation:supports[0].distanceTo(supports[1]),targetSeparation:Math.hypot(gap,open*.007),contactHold:open<.001,targetSurfaceGap:gap});
  }else if(frame.holding==='lollipop'){
   const h=hands[1],k=frame.verb==='eat'?(1-Math.cos(time/3*Math.PI*2))*.5:0;
   const hold=point(h.arm).add(vec(-.03,-.08,.16)),mouth=mouthTarget?.(frame)??bones.Head.localToWorld(mouthLocal.clone()),taste=mouth.clone().add(vec(0,-.13,.0125)),grip=hold.lerp(taste,k);
   // A take/give/gesture already authors a deliberate arm path. Retain that
   // path and fit the object to the fingers; only idle/tasting needs hold IK.
   const solveHold=frame.verb==='eat'||frame.verb==='idle';
   const strength=solveHold?(frame.action?Math.min(smooth(time/.2),smooth((frame.action.duration-time)/.2)):1):0;
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),q=orient(h,vec(1,0,0),vec(0,0,1));const reachError=solveHold?place(h,grip,q,h.grip):0;
   if(solveHold&&strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   root.updateMatrixWorld(true);
   const objectQ=h.wrist.getWorldQuaternion(new THREE.Quaternion()).multiply(orient(h,new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)).invert()).slerp(rootQ,strength);
   const stem=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyQuaternion(objectQ);
   // The socket is the object's actual origin, derived from its grip point.
   const actualGrip=h.wrist.localToWorld(h.grip.clone()),origin=actualGrip.clone().sub(stem(0,.07,0));socket.position.copy(h.wrist.worldToLocal(origin));socket.quaternion.copy(h.wrist.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(objectQ));socket.userData.preciseGrip=true;socket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'lollipop',authoredArm:!solveHold,strength,reachError,gripError:socket.getWorldPosition(new THREE.Vector3()).add(stem(0,.07,0)).distanceTo(actualGrip),mouthDistance:actualGrip.clone().add(stem(0,.13,0)).distanceTo(mouth),surfaceGap:actualGrip.clone().add(stem(0,.13,-.0125)).distanceTo(mouth),taste:k});
  }else if(frame.holding){
   // Plates rest on the actual rebuilt palm; tool handles touch its forward
   // surface. These supports follow authored take/give/cook poses unchanged.
   const h=hands[1],prop=PROP_CONTACTS[frame.holding],wristQ=h.wrist.getWorldQuaternion(new THREE.Quaternion()),delta=wristQ.clone().multiply(h.restQ.clone().invert());
   const axes=[h.long,h.width,h.normal].map(v=>v.clone().applyQuaternion(delta)),radii=[MASHA_HAND.palmLength,MASHA_HAND.palmWidth,MASHA_HAND.palmDepth];
   const objectQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(prop.rotation??[0,0,0]),'YXZ'))),direction=prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(objectQ);
   const centre=h.wrist.localToWorld(h.palm.clone()).addScaledVector(axes[2],-MASHA_HAND.palmDepth),denom=Math.hypot(...axes.map((axis,i)=>radii[i]*axis.dot(direction))),touch=centre.clone();
   for(let i=0;i<3;i++)touch.addScaledVector(axes[i],radii[i]**2*axes[i].dot(direction)/Math.max(denom,1e-9));
   const anchor=touch.clone().addScaledVector(direction,prop.radius+.0005),origin=anchor.clone().sub(new THREE.Vector3(...prop.point).applyQuaternion(objectQ));
   socket.position.copy(h.wrist.worldToLocal(origin));socket.quaternion.copy(wristQ.invert().multiply(objectQ));socket.userData.preciseGrip=true;socket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'prop',prop:frame.holding,contactPoint:touch.toArray(),gripPoint:anchor.toArray(),radius:prop.radius});
  }else{socket.position.set(0,0,0);socket.quaternion.identity();metrics.mode='free';}
  rebuiltHands.update(frame.holding==='lollipop'?1:frame.putDown?.item==='lollipop'?smooth((frame.action!.duration-time)/(frame.action!.duration*(1-frame.putDown.release))):0,frame.opacity,freeClap?0:1);
 },dispose(){rebuiltHands.dispose();}};
}
