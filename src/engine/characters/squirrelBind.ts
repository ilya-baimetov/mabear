import * as THREE from 'three';
import {BONES,SKELETON,makeSetup,type SourcePoseWorld} from '../motion/retarget';
import type {Quat} from '../api';
import type {Vec3} from '../../shared/schema';

const point=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const smooth=(a:number,b:number,v:number)=>THREE.MathUtils.smoothstep(v,a,b);

/** Source-specific repair: the automatic rig assigned the tail to the left arm
 * and left the right paw unweighted. Rebind the existing textured surface to
 * measured anatomy; never substitute a human mesh or animate the tail as a paw.
 * Coordinates below are measured in the original normalized .65m bind pose. */
export function repairSquirrelBind(source:THREE.Group):THREE.Group{
 const byName:Record<string,THREE.Bone>={},oldMeshes:THREE.SkinnedMesh[]=[];
 source.traverse(o=>{if((o as THREE.Bone).isBone)byName[o.name]=o as THREE.Bone;if((o as THREE.SkinnedMesh).isSkinnedMesh)oldMeshes.push(o as THREE.SkinnedMesh);});
 const map=Object.fromEntries(BONES.map(name=>[name,Object.keys(byName).find(n=>n.replace(/^mixamorig[:_]?/i,'')===name)!]));
 Object.assign(map,{Spine:'Spine02',Spine1:'Spine01',Spine2:'Spine',Neck:'neck'});
 source.updateMatrixWorld(true);
 const capture:SourcePoseWorld={rot:{},pos:{}};for(const [name,bone]of Object.entries(byName)){capture.rot[name]=bone.getWorldQuaternion(new THREE.Quaternion()).toArray() as Quat;capture.pos[name]=bone.getWorldPosition(new THREE.Vector3()).toArray() as Vec3;}
 const holder=new THREE.Group();holder.add(source);holder.quaternion.fromArray(makeSetup(map,capture).C);holder.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(holder,true),scale=.65/(box.max.y-box.min.y);
 holder.scale.setScalar(scale);holder.position.set(-(box.min.x+box.max.x)*.5*scale,-box.min.y*scale,-(box.min.z+box.max.z)*.5*scale);holder.updateMatrixWorld(true);
 const positions:Record<string,THREE.Vector3>={
  Hips:point(-.158,.190,.011),Spine:point(-.142,.235,.009),Spine1:point(-.125,.285,.010),Spine2:point(-.104,.333,.012),Neck:point(-.100,.352,.013),Head:point(-.102,.370,.025),
  LeftShoulder:point(-.089,.334,.023),LeftArm:point(-.069,.330,.038),LeftForeArm:point(-.048,.262,.072),LeftHand:point(-.042,.211,.099),LeftPawTip:point(-.022,.175,.113),
  RightShoulder:point(-.116,.336,.000),RightArm:point(-.138,.340,-.011),RightForeArm:point(-.198,.293,-.045),RightHand:point(-.246,.259,-.071),RightPawTip:point(-.270,.242,-.080),
  LeftUpLeg:point(-.155,.177,.033),LeftLeg:point(-.142,.102,.026),LeftFoot:point(-.144,.036,.025),LeftToeBase:point(-.156,.012,.052),
  RightUpLeg:point(-.188,.180,-.005),RightLeg:point(-.205,.111,-.032),RightFoot:point(-.221,.046,-.044),RightToeBase:point(-.240,.043,-.026),
  Tail:point(-.080,.170,-.040),
 };
 const parents={...SKELETON,LeftPawTip:'LeftHand',RightPawTip:'RightHand',Tail:'Hips'};
 const bones:Record<string,THREE.Bone>={};for(const name of Object.keys(parents)){const b=new THREE.Bone();b.name=name;bones[name]=b;}
 const result=new THREE.Group();result.name='squirrel:anatomical-bind';
 for(const[name,parent]of Object.entries(parents)){const b=bones[name];if(parent){b.position.copy(positions[name]).sub(positions[parent]);bones[parent].add(b);}else{b.position.copy(positions[name]);result.add(b);}}
 result.updateMatrixWorld(true);const names=Object.keys(parents),skeleton=new THREE.Skeleton(names.map(n=>bones[n])),index=(name:string)=>names.indexOf(name);
 const frame=makeSetup(Object.fromEntries(BONES.map(n=>[n,n])),{pos:Object.fromEntries(Object.entries(positions).map(([n,p])=>[n,p.toArray() as Vec3])),rot:Object.fromEntries(names.map(n=>[n,[0,0,0,1] as Quat]))});
 const canonical=new THREE.Quaternion().fromArray(frame.C),hip=positions.Hips.clone().applyQuaternion(canonical);
 const anatomical=(p:THREE.Vector3)=>p.clone().applyQuaternion(canonical).sub(hip);
 const counts:Record<string,number>={};let maxRestError=0,totalVertices=0;
 function limbWeights(p:THREE.Vector3,chain:string[]):Record<string,number>{
  let nearest={distance:Infinity,segment:0,u:0};
  for(let j=0;j<chain.length-1;j++){const a=positions[chain[j]],b=positions[chain[j+1]],d=b.clone().sub(a),u=THREE.MathUtils.clamp(p.clone().sub(a).dot(d)/d.lengthSq(),0,1),distance=p.distanceTo(a.clone().addScaledVector(d,u));if(distance<nearest.distance)nearest={distance,segment:j,u};}
  const j=nearest.segment,u=nearest.u;
  if(j===chain.length-2)return {[chain[j]]:1};
  const next=smooth(.55,1,u);return {[chain[j]]:1-next,[chain[j+1]]:next};
 }
 for(const original of oldMeshes){
  const geometry=original.geometry.clone(),attr=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),normalMatrix=new THREE.Matrix3().getNormalMatrix(original.matrixWorld),si=new Uint16Array(attr.count*4),sw=new Float32Array(attr.count*4),oldI=original.geometry.getAttribute('skinIndex'),oldW=original.geometry.getAttribute('skinWeight');
  const points:THREE.Vector3[]=[],normals=normal?new Float32Array(normal.count*3):null;
  for(let i=0;i<attr.count;i++){
   const p=original.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(original.matrixWorld);points.push(p);attr.setXYZ(i,p.x,p.y,p.z);
   if(normal){const n=new THREE.Vector3().fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);normals!.set(n.toArray(),i*3);}
   const local=anatomical(p);let oldTail=0;for(let k=0;k<4;k++)if(['LeftArm','LeftForeArm','LeftHand'].includes(original.skeleton.bones[oldI.getComponent(i,k)]?.name))oldTail+=oldW.getComponent(i,k);
   const tail=Math.max(smooth(.035,.085,-local.z)*smooth(.1,.5,oldTail),oldTail>.1&&p.x>-.01?1:0,smooth(-.14,-.115,p.x)*(1-smooth(.015,.045,p.z))*(1-smooth(.22,.26,p.y))*smooth(.07,.10,p.y));
   let weights:Record<string,number>;
   if(tail>.999)weights={Tail:1};
   else {
    if(p.y>.335){const head=smooth(.335,.375,p.y);weights={Spine2:1-head,Head:head};}
    else if(p.y<.205){
     const left=p.distanceTo(positions.LeftUpLeg),right=p.distanceTo(positions.RightUpLeg),side=left<right?'Left':'Right';
     const legChain=[side+'UpLeg',side+'Leg',side+'Foot',side+'ToeBase'];weights=limbWeights(p,legChain);const torso=smooth(.10,.21,p.y);for(const key of Object.keys(weights))weights[key]*=1-torso;weights.Hips=torso;
    }else{const chest=smooth(.235,.315,p.y);weights={Spine:1-chest,Spine2:chest};}
    // Evaluate each complete paw chain, including fingertips. A single line to
    // the wrist misclassified the tips as belly/leg vertices and tore the hand.
    let arm={side:'Left',distance:Infinity,segment:0,u:0};
    for(const side of ['Left','Right']){
     const chain=[side+'Arm',side+'ForeArm',side+'Hand',side+'PawTip'];
     for(let j=0;j<chain.length-1;j++){const a=positions[chain[j]],b=positions[chain[j+1]],d=b.clone().sub(a),u=THREE.MathUtils.clamp(p.clone().sub(a).dot(d)/d.lengthSq(),0,1),distance=p.distanceTo(a.clone().addScaledVector(d,u));if(distance<arm.distance)arm={side,distance,segment:j,u};}
    }
    const bodyLine=new THREE.Line3(positions.Hips,positions.Neck),bodyDistance=p.distanceTo(bodyLine.closestPointToPoint(p,true,new THREE.Vector3()));
    const bodyRadius=THREE.MathUtils.lerp(.065,.025,smooth(.205,.35,p.y)),armRadius=arm.segment>=2?.027:.020;
    const affinity=(bodyDistance/bodyRadius)/Math.max(.08,arm.distance/armRadius);
    const armWeight=smooth(.72,1.35,affinity)*(arm.segment===0?smooth(0,.32,arm.u):1);
    if(armWeight>0){const paw=limbWeights(p,[arm.side+'Arm',arm.side+'ForeArm',arm.side+'Hand',arm.side+'PawTip']);for(const key of Object.keys(weights))weights[key]*=1-armWeight;for(const[key,value]of Object.entries(paw))weights[key]=(weights[key]??0)+value*armWeight;}
   }
   if(tail>0&&tail<.999){for(const key of Object.keys(weights))weights[key]*=1-tail;weights.Tail=tail;}
   const sorted=Object.entries(weights).filter(([,w])=>w>1e-6).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((v,[,w])=>v+w,0);
   sorted.forEach(([name,w],k)=>{si[i*4+k]=index(name);sw[i*4+k]=w/sum;});
   totalVertices++;
  }
  // Smooth across the actual surface graph, welding UV seams for this solve.
  // Spatial masks alone leave abrupt bone changes across long fur triangles.
  const groupFor=new Uint32Array(attr.count),groups:{vertices:number[];neighbours:Set<number>;weights:Float64Array}[]=[],keys=new Map<string,number>();
  for(let i=0;i<attr.count;i++){
   const v=points[i],key=`${Math.round(v.x*1e5)},${Math.round(v.y*1e5)},${Math.round(v.z*1e5)}`;let group=keys.get(key);
   if(group===undefined){group=groups.length;keys.set(key,group);groups.push({vertices:[],neighbours:new Set(),weights:new Float64Array(names.length)});}
   groupFor[i]=group;groups[group].vertices.push(i);for(let k=0;k<4;k++)groups[group].weights[si[i*4+k]]+=sw[i*4+k];
  }
  for(const group of groups)for(let j=0;j<names.length;j++)group.weights[j]/=group.vertices.length;
  const triangles=geometry.index!;
  for(let i=0;i<triangles.count;i+=3)for(let k=0;k<3;k++){const a=groupFor[triangles.getX(i+k)],b=groupFor[triangles.getX(i+(k+1)%3)];if(a!==b){groups[a].neighbours.add(b);groups[b].neighbours.add(a);}}
  for(let iteration=0;iteration<6;iteration++){
   const next=groups.map(group=>{const weights=new Float64Array(group.weights);if(!group.neighbours.size)return weights;for(let j=0;j<names.length;j++){let sum=0;for(const other of group.neighbours)sum+=groups[other].weights[j];weights[j]=group.weights[j]*.35+sum/group.neighbours.size*.65;}return weights;});
   groups.forEach((group,i)=>{group.weights=next[i];});
  }
  for(let i=0;i<attr.count;i++){
   const sorted=Array.from(groups[groupFor[i]].weights,(w,j)=>({w,j})).filter(v=>v.w>1e-8).sort((a,b)=>b.w-a.w).slice(0,4),sum=sorted.reduce((n,v)=>n+v.w,0);
   for(let k=0;k<4;k++){si[i*4+k]=sorted[k]?.j??0;sw[i*4+k]=(sorted[k]?.w??0)/sum;}
   const dominant=names[sorted[0].j];counts[dominant]=(counts[dominant]??0)+1;
  }
  if(normals)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.SkinnedMesh(geometry,original.material);mesh.name=original.name;result.add(mesh);result.updateMatrixWorld(true);mesh.bind(skeleton);
  for(let i=0;i<attr.count;i++)maxRestError=Math.max(maxRestError,mesh.getVertexPosition(i,new THREE.Vector3()).distanceTo(points[i]));
 }
 result.userData.squirrelBind={revision:1,totalVertices,dominantVertices:counts,maxRestError,anatomicalRoot:true};
 return result;
}
