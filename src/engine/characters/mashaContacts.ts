import {isCarrot} from '../../shared/schema';
import * as THREE from 'three';
import type {ActorFrame} from '../api';
import {createMashaHands,MASHA_HAND} from './mashaHands';
import {PROP_CONTACTS} from '../../shared/propContacts';
import {clapOpen} from '../../shared/contactTiming';
import {contactHands,toolWristDelta,torsoElbowPole} from './contactHands';
import {HOUSE_PREP_TABLE} from '../../shared/houseLayout';
import {cookingSupportHeightAt} from '../../shared/cookingStation';
import { clamp, smooth } from '../../shared/math';

type Hand={side:'Left'|'Right';arm:THREE.Bone;elbow:THREE.Bone;wrist:THREE.Bone;long:THREE.Vector3;normal:THREE.Vector3;width:THREE.Vector3;restQ:THREE.Quaternion;basis:THREE.Quaternion;scale:THREE.Vector3;palm:THREE.Vector3;grip:THREE.Vector3};
const point=(b:THREE.Object3D)=>b.getWorldPosition(new THREE.Vector3());

/** Keep a carried object's base above the worktop while it still overlaps it.
 * The correction fades outside the table, and uses the same pre-helper-lift
 * coordinates as the contact solver. Outdoor carries are unaffected. */
export function prepTableLift(frame:ActorFrame,item:string,origin:THREE.Vector3,handClearance=.06):number{
 const radius=({frying_pan:.135,pancakes:.15,flour_bag:.13,jam_jar:.07}as Record<string,number>)[item];
 if(radius===undefined)return 0;
 const table=HOUSE_PREP_TABLE;
 const outside=Math.max(Math.abs(origin.x-table.position[0])-table.width/2-radius,Math.abs(origin.z-table.position[1])-table.depth/2-radius);
 const weight=1-smooth(Math.max(0,outside)/.12);
 return Math.max(0,table.height+(item==='frying_pan'?.018:handClearance)+(item==='flour_bag'?.027:0)-cookingSupportHeightAt(frame.pos[0],frame.pos[2])-origin.y)*weight;
}

/** A tabletop pickup starts at the exposed rim/side. Only after lifting does
 * the hand move underneath for the normal carry; reaching through the table
 * to a bottom-center support point is not a valid acquisition pose. */
export function kitchenSurfaceGrasp(frame:ActorFrame,data:NonNullable<ActorFrame['pickup']>){
 if(data.item==='ball'){
  // Acquire the exposed upper surface; a palm cannot reach underneath a ball
  // that is still on the ground. Regrip to the usual bottom support after lift.
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation,'YXZ'));
  const centre=new THREE.Vector3(0,.15,0).applyQuaternion(q),outward=new THREE.Vector3(frame.pos[0]-data.position[0]-centre.x,0,frame.pos[2]-data.position[2]-centre.z).normalize();
  if(data.position[1]+centre.y>.45)return{offset:centre.addScaledVector(outward,.145).add(new THREE.Vector3(0,.02,0)),normal:outward.clone().negate(),long:new THREE.Vector3(0,1,0),outward};
  return{offset:centre.add(new THREE.Vector3(0,.135,0)),normal:new THREE.Vector3(0,-1,0),long:outward.clone().negate(),outward};
 }
 if(data.item==='pantry_honey'&&data.position[1]>2){
  return{offset:new THREE.Vector3(0,.13,0),normal:new THREE.Vector3(-1,0,0),long:new THREE.Vector3(0,1,0),outward:new THREE.Vector3(1,0,0)};
 }
 const table=HOUSE_PREP_TABLE;
 if(Math.abs(data.position[0]-table.position[0])>table.width/2+.05||Math.abs(data.position[2]-table.position[1])>table.depth/2+.05)return null;
 const outward=new THREE.Vector3(frame.pos[0]-data.position[0],0,frame.pos[2]-data.position[2]).normalize();
 if(data.item==='pancakes')return{offset:outward.clone().multiplyScalar(.145).add(new THREE.Vector3(0,.015,0)),normal:new THREE.Vector3(0,-1,0),long:outward.clone().negate(),outward};
 if(data.item==='jam_jar')return{offset:outward.clone().multiplyScalar(.062).add(new THREE.Vector3(0,.08,0)),normal:outward.clone().negate(),long:new THREE.Vector3(0,1,0),outward};
 if(data.item==='flour_bag'){
  const radius=1/Math.sqrt((outward.x/.13)**2+(outward.z/.104)**2);
  return{offset:outward.clone().multiplyScalar(radius).add(new THREE.Vector3(0,.13,0)),normal:outward.clone().negate(),long:new THREE.Vector3(0,1,0),outward};
 }
 return null;
}

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
 const place=(h:Hand,target:THREE.Vector3,q:THREE.Quaternion,localContact:THREE.Vector3,poleOverride?:THREE.Vector3)=>{
  const offset=localContact.clone().multiply(h.scale).applyQuaternion(q),wristTarget=target.clone().sub(offset),pole=poleOverride??torsoElbowPole(point(h.arm),h.side==='Left'?1:-1,.65,torsoDelta(),.08);
  const error=solveArm(h.arm,h.elbow,h.wrist,wristTarget,pole);
  h.wrist.quaternion.copy(h.wrist.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));h.wrist.updateWorldMatrix(false,true);return error;
 };
 contactHands.set(root,hands.map(h=>({side:(h.side==='Left'?1:-1) as 1|-1,place(target,long,normal,strength,pole){
  const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),q=orient(h,long,normal),error=place(h,target,q,h.palm,pole);
  if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
  root.updateMatrixWorld(true);return {error,point:h.wrist.localToWorld(h.palm.clone())};
 }})));
 return {update(frame:ActorFrame){
  socket.userData.preciseGrip=false;socket.position.set(0,0,0);socket.quaternion.identity();for(const key of Object.keys(metrics))delete metrics[key];
  const time=frame.action?.time??0,rootQ=torsoDelta(),vec=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyQuaternion(rootQ);
  const freeClap=frame.verb==='clap'&&!frame.holding;
  const reverseSurface=frame.putDown?kitchenSurfaceGrasp(frame,frame.putDown):null;
  if(frame.nudge){
   const h=hands[1],data=frame.nudge,duration=frame.action?.duration??1,u=time/duration;
   const strength=Math.min(smooth(u/.42),1-smooth((u-.58)/.35)),swipe=smooth((u-.5)/.23);
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone());
   // Contact the visible near/right quarter; follow left briefly, then withdraw.
   const normal=new THREE.Vector3(-.075,-.025,-.127).normalize(),long=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize(),q=orient(h,long,normal);
   const target=new THREE.Vector3(...data.position).add(new THREE.Vector3(.075-.12*swipe,.175,.127));
   const reachError=place(h,target,q,h.palm);
   if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   root.updateMatrixWorld(true);
   Object.assign(metrics,{mode:'nudge',strength,reachError,targetPoint:target.toArray(),contactPoint:h.wrist.localToWorld(h.palm.clone()).toArray(),attached:false});
  }else if(frame.pickup||reverseSurface||frame.putDown&&(isCarrot(frame.putDown.item)||frame.putDown.item==='ball')){
   const data=(frame.pickup??frame.putDown)!,h=hands[1],prop=PROP_CONTACTS[data.item],duration=frame.action?.duration??1,attach=duration*data.release,pickupTime=frame.pickup?time:duration-time;
   const after=clamp((pickupTime-attach)/Math.max(.001,duration-attach),0,1),carry=clamp((after-(data.container?.34:.06))/(data.container?.56:.64),0,1),gripCarry=smooth((after-(data.container?.34:.18))/(data.container?.56:.52)),strength=pickupTime<attach?smooth(pickupTime/Math.max(.001,attach-.035)):1;
   const surfaceGrasp=kitchenSurfaceGrasp(frame,data);
   const base=[h.arm,h.elbow,h.wrist].map(b=>b.quaternion.clone()),baseQ=h.wrist.getWorldQuaternion(new THREE.Quaternion());
   const restingQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation,'YXZ'));
   const heldQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(prop.rotation??[0,0,0]),'YXZ')));
   // Exact support of the rebuilt palm in any orientation, expressed in wrist
   // space. This keeps the socket on the actual hand while IK reaches the prop.
   const supportLocal=(q:THREE.Quaternion,direction:THREE.Vector3)=>{
    const delta=q.clone().multiply(h.restQ.clone().invert()),axes=[h.long,h.width,h.normal].map(v=>v.clone().applyQuaternion(delta)),radii=[MASHA_HAND.palmLength,MASHA_HAND.palmWidth,MASHA_HAND.palmDepth];
    const offset=h.palm.clone().multiply(h.scale).applyQuaternion(q).addScaledVector(axes[2],-MASHA_HAND.palmDepth),denom=Math.hypot(...axes.map((axis,i)=>radii[i]*axis.dot(direction)));
    for(let i=0;i<3;i++)offset.addScaledVector(axes[i],radii[i]**2*axes[i].dot(direction)/Math.max(denom,1e-9));
    return offset.applyQuaternion(q.clone().invert()).divide(h.scale);
   };
   const heldDirection=prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(heldQ);
   const heldOrigin=h.wrist.localToWorld(supportLocal(baseQ,heldDirection)).addScaledVector(heldDirection,prop.radius+.0005).sub(new THREE.Vector3(...prop.point).applyQuaternion(heldQ));
   heldOrigin.y+=prepTableLift(frame,data.item,heldOrigin);
   const origin=new THREE.Vector3(...data.position);
   // Ownership changes only after full contact. Withdraw vertically first,
   // then return toward the authored carry pose instead of dragging through a table.
   const containerLift=data.container==='kitchen_pot'?.52:data.container==='kitchen_bowl'?.24:0;
   if(pickupTime>attach)origin.y+=(containerLift||.12)*smooth(after/(containerLift?.30:.18));
   origin.lerp(heldOrigin,carry);
   const horizontal=Math.hypot(origin.x-data.position[0],origin.z-data.position[2]);
   if(pickupTime>attach)origin.y=Math.max(origin.y,data.position[1]+.025*smooth(after/.1)*(1-smooth((horizontal-.15)/.25)));
   if(pickupTime>attach)origin.y+=prepTableLift(frame,data.item,origin)*smooth(after/.1);
   if(containerLift&&pickupTime>attach)origin.y=Math.max(origin.y,data.position[1]+containerLift*smooth(after/.30)*(1-smooth((horizontal-.22)/.32)));
   const objectQ=restingQ.clone().slerp(heldQ,carry),objectDelta=objectQ.clone().multiply(restingQ.clone().invert());
   const normal=surfaceGrasp?surfaceGrasp.normal.clone().applyQuaternion(objectDelta):prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(restingQ);
   const long=surfaceGrasp?surfaceGrasp.long.clone().applyQuaternion(objectDelta):prop.support?new THREE.Vector3(data.position[0],point(h.arm).y,data.position[2]).sub(point(h.arm)).normalize():new THREE.Vector3(1,0,0).applyQuaternion(restingQ);
   const direction=normal.clone().lerp(heldDirection,surfaceGrasp?gripCarry:carry);
   if(surfaceGrasp&&normal.dot(heldDirection)<-.99)direction.addScaledVector(surfaceGrasp.outward,-Math.sin(gripCarry*Math.PI));direction.normalize();
   const gripOffset=data.item==='ball'?new THREE.Vector3(0,.15,0).applyQuaternion(objectQ).sub(new THREE.Vector3(0,.15,0)):new THREE.Vector3(...prop.point).applyQuaternion(objectQ);
   if(surfaceGrasp)gripOffset.copy(surfaceGrasp.offset).applyQuaternion(objectDelta).lerp(new THREE.Vector3(...prop.point).applyQuaternion(objectQ),gripCarry);
   const contactQ=orient(h,long,normal),handQ=contactQ.slerp(baseQ,surfaceGrasp?gripCarry:carry);
   const target=origin.clone().add(gripOffset).addScaledVector(direction,-prop.radius-.0005);
   const reachError=place(h,target,handQ,supportLocal(handQ,direction));
   if(strength<1)[h.arm,h.elbow,h.wrist].forEach((b,i)=>{const solved=b.quaternion.clone();b.quaternion.copy(base[i]).slerp(solved,strength);});
   root.updateMatrixWorld(true);
   const actualQ=h.wrist.getWorldQuaternion(new THREE.Quaternion()),touch=h.wrist.localToWorld(supportLocal(actualQ,direction)),actualOrigin=touch.clone().addScaledVector(direction,prop.radius+.0005).sub(gripOffset);
   socket.position.copy(h.wrist.worldToLocal(actualOrigin.clone()));socket.quaternion.copy(actualQ.invert().multiply(objectQ));socket.userData.preciseGrip=true;socket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:frame.pickup?'pickup':'putDown',prop:data.item,strength,reachError,attachmentError:actualOrigin.distanceTo(new THREE.Vector3(...data.position)),targetError:actualOrigin.distanceTo(origin),contactPoint:touch.toArray(),targetPoint:target.toArray(),withdrawal:after,surfaceGrip:!!surfaceGrasp,releaseError:actualOrigin.distanceTo(new THREE.Vector3(...data.position))});
  }else if(frame.putDown){
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
   const toolDelta=toolWristDelta(frame),yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.yaw),propQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(prop.rotation??[0,0,0]),'YXZ'));
   const objectQ=toolDelta?yawQ.multiply(toolDelta).multiply(propQ):yawQ.multiply(propQ),direction=prop.support?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1).applyQuaternion(objectQ);
   const centre=h.wrist.localToWorld(h.palm.clone()).addScaledVector(axes[2],-MASHA_HAND.palmDepth),denom=Math.hypot(...axes.map((axis,i)=>radii[i]*axis.dot(direction))),touch=centre.clone();
   for(let i=0;i<3;i++)touch.addScaledVector(axes[i],radii[i]**2*axes[i].dot(direction)/Math.max(denom,1e-9));
   const anchor=touch.clone().addScaledVector(direction,prop.radius+.0005),origin=anchor.clone().sub(new THREE.Vector3(...prop.point).applyQuaternion(objectQ));
   const tableLift=prepTableLift(frame,frame.holding,origin);
   if(tableLift>0){
    const localContact=h.wrist.worldToLocal(touch.clone()),target=touch.clone();target.y+=tableLift;
    const reachError=place(h,target,wristQ,localContact);root.updateMatrixWorld(true);
    touch.copy(h.wrist.localToWorld(localContact));anchor.copy(touch).addScaledVector(direction,prop.radius+.0005);origin.copy(anchor).sub(new THREE.Vector3(...prop.point).applyQuaternion(objectQ));
    Object.assign(metrics,{tableClearanceLift:tableLift,reachError});
   }
   socket.position.copy(h.wrist.worldToLocal(origin));socket.quaternion.copy(wristQ.invert().multiply(objectQ));socket.userData.preciseGrip=true;socket.updateWorldMatrix(false,true);
   Object.assign(metrics,{mode:'prop',prop:frame.holding,contactPoint:touch.toArray(),gripPoint:anchor.toArray(),radius:prop.radius});
  }else{socket.position.set(0,0,0);socket.quaternion.identity();metrics.mode='free';}
  rebuiltHands.update(frame.holding==='lollipop'?1:frame.putDown?.item==='lollipop'?smooth((frame.action!.duration-time)/(frame.action!.duration*(1-frame.putDown.release))):0,frame.opacity,freeClap?0:1);
 },dispose(){rebuiltHands.dispose();}};
}
