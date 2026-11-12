// Rest-aware adapter for Meshy skeletal characters. Animation remains deterministic and seekable.
import * as THREE from 'three';
import type { ActorFrame, CharacterRig, Quat } from '../api';
import type { ActorId, Vec3 } from '../../shared/schema';
import { BONES, SKELETON, makeSetup, type SourcePoseWorld } from '../motion/retarget';
import { qmul, qinv, IDENTITY } from '../motion/blend';
import { STYLES, feetPoints } from '../motion/verbs/common';
import {createMashaPerformance} from './mashaPerformance';
import {createMashaContacts} from './mashaContacts';
import {repairSquirrelBind} from './squirrelBind';
import {createGeneratedFace} from './generatedFace';

export interface GeneratedOptions { height: number; mashaPerformance?: boolean; animalPerformance?:boolean; }
interface Sample { mesh: THREE.SkinnedMesh; index: number; }
const p = new THREE.Vector3(), q = new THREE.Quaternion();

/** Keep the source's skeleton and materials; map canonical game poses through world-space rest transforms. */
export function generatedRig(id: ActorId, model: THREE.Group, options: GeneratedOptions): CharacterRig {
  if(id==='squirrel')model=repairSquirrelBind(model);
  const root = new THREE.Group(); root.name = `character:${id}:generated`;
  const holder = new THREE.Group(); root.add(holder); holder.add(model);
  const byName: Record<string, THREE.Bone> = {}, bones: Record<string, THREE.Bone> = {};
  const map: Record<string,string> = {};
  const meshes: THREE.SkinnedMesh[] = [], materials = new Set<THREE.MeshStandardMaterial>();
  model.traverse(o => {
    if ((o as THREE.Bone).isBone) byName[o.name] = o as THREE.Bone;
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.SkinnedMesh;
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      if(m.isSkinnedMesh) meshes.push(m);
      for(const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const material = mat as THREE.MeshStandardMaterial;
        material.transparent = true; material.roughness = Math.max(.65,material.roughness); material.metalness = 0;
        // Generated normal maps contain some high-frequency baked fur; keep it subtle under sunlight.
        material.normalScale?.set(.6,.6); materials.add(material);
      }
    }
  });
  for(const name of BONES) {
    const source = Object.keys(byName).find(n => n.replace(/^mixamorig[:_]?/i,'') === name);
    if(source) map[name] = source;
  }
  if(byName.Spine02 && byName.Spine01 && byName.neck) Object.assign(map,{Spine:'Spine02',Spine1:'Spine01',Spine2:'Spine',Neck:'neck'});
  for(const name of ['Hips','Head','LeftArm','RightArm','LeftFoot','RightFoot']) {
    if(!map[name]) throw new Error(`${id}: missing skeletal joint ${name}`);
  }
  for(const [name,source] of Object.entries(map)) bones[name] = byName[source];
  const capture = (): SourcePoseWorld => {
    root.updateMatrixWorld(true);
    const rot: Record<string,Quat> = {}, pos: Record<string,Vec3> = {};
    for(const [name,b] of Object.entries(byName)) {
      rot[name] = b.getWorldQuaternion(new THREE.Quaternion()).toArray() as Quat;
      pos[name] = b.getWorldPosition(new THREE.Vector3()).toArray() as Vec3;
    }
    return {rot,pos};
  };
  const raw = makeSetup(map,capture()); holder.quaternion.fromArray(raw.C); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder,true), h = box.max.y-box.min.y;
  if(!Number.isFinite(h) || h < .001) throw new Error(`${id}: empty generated geometry`);
  const scale = options.height/h;
  holder.scale.setScalar(scale);
  const anatomicalRoot=id==='squirrel'?bones.Hips.getWorldPosition(new THREE.Vector3()):null;
  holder.position.set(-(anatomicalRoot?.x??(box.min.x+box.max.x)*.5)*scale,-box.min.y*scale,-(anatomicalRoot?.z??(box.min.z+box.max.z)*.5)*scale);
  root.updateMatrixWorld(true);
  const setup = makeSetup(map,capture());
  const localRest = new Map<THREE.Bone,{q:THREE.Quaternion;p:THREE.Vector3}>();
  const rest: Record<string,THREE.Quaternion> = {};
  for(const b of Object.values(byName)) localRest.set(b,{q:b.quaternion.clone(),p:b.position.clone()});
  for(const [name,b] of Object.entries(bones)) rest[name] = b.quaternion.clone();

  // The motion solver needs the actual leg lengths rather than the previous procedural character proportions.
  const joint = (name:string) => bones[name].getWorldPosition(new THREE.Vector3());
  const style = STYLES[id];
  const handSocket = new THREE.Object3D(); handSocket.name = 'handSocket'; bones.RightHand.add(handSocket);

  // Repair the split skirt in every version of this asset. Sleeve/hand highlights
  // must retain their arm weights; facial performance remains a separate opt-in.
  let dressVertices = 0;
  if(id === 'masha') for(const mesh of meshes) dressVertices += repairDress(mesh);
  // Facial anchors are authored in metres, then converted through the imported skeleton's centimetre scale.
  const headAt=joint('Head');
  for(const side of [-1,1]) {
    const eye=new THREE.Object3D();eye.name=side===1?'eyeL':'eyeR';
    const at=id==='masha'?new THREE.Vector3(side*.055,.742,.139):new THREE.Vector3(headAt.x+side*options.height*.035,headAt.y+options.height*.075,headAt.z+options.height*.08);
    eye.position.copy(bones.Head.worldToLocal(at));bones.Head.add(eye);
  }
  const performance=id==='masha'&&options.mashaPerformance?createMashaPerformance(meshes,bones,root):null;
  const contacts=performance?createMashaContacts(meshes,bones,root,handSocket,performance.mouthTarget):null;
  const animalPerformance=options.animalPerformance?createGeneratedFace(id,meshes,bones,root):null;
  // The seated skirt morph is independent of the chosen face. Install it for
  // the articulated candidate too, while leaving its rebuilt facial skin alone.
  const faces=id==='masha'?meshes.map(mesh=>addMashaFace(mesh,bones.Hips.getWorldPosition(new THREE.Vector3()).y,!performance)):[];
  const samples: Sample[] = [];
  for(const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    const candidates: Sample[] = [];
    for(let i=0;i<pos.count;i++) {
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
      if(p.y < options.height*.105) candidates.push({mesh,index:i});
    }
    // Surface sampling is only for sole contact, not a per-frame full-mesh CPU skinning pass.
    const step = Math.max(1,Math.floor(candidates.length/100));
    for(let i=0;i<candidates.length;i+=step) samples.push(candidates[i]);
  }
  const hip=joint('Hips'),thigh=joint('LeftUpLeg'),knee=joint('LeftLeg'),ankle=joint('LeftFoot');
  const measured={height:options.height,hipHeight:hip.y,leg:{x:Math.abs(thigh.x-hip.x),y:thigh.y-hip.y,thigh:thigh.distanceTo(knee),shin:knee.distanceTo(ankle),ankle:ankle.y,toe:options.height*.065}};
  root.userData.generated = {mapping:map,dressVertices,source:'Meshy 7.1',facialRig:!!performance||!!animalPerformance||faces.length>0,performance:performance?'masha-v3':animalPerformance?'animal-v1':null,measured,calibrationError:Math.abs(style.hipHeight-measured.hipHeight)};
  if(id==='squirrel')root.userData.squirrelBind=model.userData.squirrelBind;

  return {
    id,root,bones,rest,height:options.height,handSocket,
    apply(frame:ActorFrame) {
      // All rest transforms are in actor-local world space; place the actor after solving the skeleton.
      root.position.set(0,0,0); root.rotation.set(0,0,0); holder.position.y=-box.min.y*scale;
      for(const [b,r] of localRest) {b.quaternion.copy(r.q);b.position.copy(r.p);}
      root.updateMatrixWorld(true);
      const globals:Record<string,Quat> = {};
      for(const name of BONES) {
        const parent = SKELETON[name];
        globals[name] = parent ? qmul(globals[parent],frame.bones[name]??IDENTITY) : frame.bones[name]??IDENTITY;
        const b = bones[name]; if(!b) continue;
        const delta = qmul(globals[name],qinv(setup.F[name]));
        const world = qmul(qmul(qmul(qinv(setup.C),delta),setup.C),setup.restRot[name]);
        const parentQ = b.parent!.getWorldQuaternion(q).invert();
        b.quaternion.copy(parentQ.multiply(new THREE.Quaternion().fromArray(world)));
        b.updateWorldMatrix(false,true);
      }
      const hips = bones.Hips, hp = localRest.get(hips)!.p;
      const desired = hips.parent!.localToWorld(hp.clone()).add(new THREE.Vector3(...frame.hipsOffset));
      hips.position.copy(hips.parent!.worldToLocal(desired));
      root.updateMatrixWorld(true);
      // Match the motion solver's intended clearance: jump flight stays airborne and shoulder rides keep their height.
      if(frame.posture === 'stand' || frame.posture === 'offstage') {
        const feet=feetPoints(frame.bones,frame.hipsOffset,style);
        const intended=Math.max(0,Math.min(...feet.left.map(v=>v[1]),...feet.right.map(v=>v[1])));
        let low=Infinity;
        for(const sample of samples){sample.mesh.getVertexPosition(sample.index,p).applyMatrix4(sample.mesh.matrixWorld);low=Math.min(low,p.y);}
        if(Number.isFinite(low)) holder.position.y += (intended-low)*THREE.MathUtils.clamp(frame.groundWeight??1,0,1);
      }
      root.position.fromArray(frame.pos); root.rotation.y=frame.yaw;
      root.visible=frame.opacity>.001;
      for(const face of faces)face(frame);
      root.updateMatrixWorld(true);
      contacts?.update(frame);
      performance?.update(frame);
      animalPerformance?.update(frame);
      for(const mat of materials){mat.opacity=frame.opacity;mat.depthWrite=frame.opacity>.98;}
      root.updateMatrixWorld(true);
    },
    dispose(){
      performance?.dispose();
      contacts?.dispose();
      animalPerformance?.dispose();
      const textures=new Set<THREE.Texture>();
      const skeletons=new Set<THREE.Skeleton>();
      for(const mesh of meshes) {mesh.geometry.dispose();skeletons.add(mesh.skeleton);}
      for(const skeleton of skeletons)skeleton.dispose();
      for(const m of materials){for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);m.dispose();}
      for(const t of textures)t.dispose();
    },
  };
}

function repairDress(mesh:THREE.SkinnedMesh):number {
  const mat=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as THREE.MeshStandardMaterial;
  const tex=mat.map, uv=mesh.geometry.getAttribute('uv'), position=mesh.geometry.getAttribute('position');
  if(!tex?.image || !uv) return 0;
  const bitmap=tex.image as ImageBitmap;
  const canvas=document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx)return 0;
  ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const oldI=mesh.geometry.getAttribute('skinIndex'),oldW=mesh.geometry.getAttribute('skinWeight');
  const indices=new Uint16Array(position.count*4),weights=new Float32Array(position.count*4);
  const hip=mesh.skeleton.bones.findIndex(b=>b.name==='Hips');if(hip<0)return 0;
  const candidate=new Uint8Array(position.count),cloth=new Uint8Array(position.count);
  const seams=new Map<string,number>(),seamLinks:[number,number][]=[];
  for(let i=0;i<position.count;i++) {
    for(let k=0;k<4;k++){indices[i*4+k]=oldI.getComponent(i,k);weights[i*4+k]=oldW.getComponent(i,k);}
    mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
    // UV/normal seams duplicate vertices. Reconnect coincident rest positions
    // before identifying enclosed texture islands; an index-only flood fill
    // mistakes disconnected pieces of the tights for pale skirt patterns.
    const key=`${Math.round(p.x*1e5)},${Math.round(p.y*1e5)},${Math.round(p.z*1e5)}`,first=seams.get(key);
    if(first===undefined)seams.set(key,i);else seamLinks.push([first,i]);
    // The measured source hem reaches 8 cm above the sole (not 17 cm).
    // Stopping above that hem leaves its patterned band on opposite legs.
    if(p.y<.08 || p.y>.49 || Math.abs(p.x)>.24)continue;
    // The generated texture also paints saturated rose onto hidden leg faces.
    // Keep the measured inner lower-leg volume on its original bones even when
    // those pixels resemble cloth; otherwise individual shin triangles move
    // onto the lap and leave the visible white tights torn.
    const legRadius=.065-Math.max(0,p.y-.22)*.20;
    if(p.y<.31&&Math.hypot(Math.abs(p.x)-.055,p.z)<legRadius)continue;
    // Colour alone catches pink highlights on sleeves and hands, pinning them
    // to the pelvis and stretching their triangles into long wrist strands.
    if(Math.abs(p.x)>.115+(.49-p.y)*.30)continue;
    candidate[i]=1;
    const x=Math.min(canvas.width-1,Math.max(0,Math.round(uv.getX(i)*(canvas.width-1))));
    const y=Math.min(canvas.height-1,Math.max(0,Math.round(uv.getY(i)*(canvas.height-1))));
    const off=(y*canvas.width+x)*4,r=pixels[off],g=pixels[off+1],b=pixels[off+2];
    // Pale tights carry a pink baked-light tint. Only saturated rose can seed
    // cloth; the topology fill below recovers its pale embroidered pattern.
    if(g<Math.min(r,b)*.75)cloth[i]=1;
  }
  // Fill pale pattern islands enclosed by the rose cloth in the actual mesh.
  // A radial mask also catches white tights. Their connected region reaches
  // outside the skirt bounds (down to the shoes), so it must keep leg weights.
  const adjacency:number[][]=Array.from({length:position.count},()=>[]),triangles=mesh.geometry.index;
  if(triangles)for(let i=0;i<triangles.count;i+=3){
    const a=triangles.getX(i),b=triangles.getX(i+1),c=triangles.getX(i+2);
    adjacency[a].push(b,c);adjacency[b].push(a,c);adjacency[c].push(a,b);
  }
  for(const [a,b] of seamLinks){adjacency[a].push(b);adjacency[b].push(a);}
  const seen=new Uint8Array(position.count);
  for(let i=0;i<position.count;i++){
    if(!candidate[i]||cloth[i]||seen[i])continue;
    const component:number[]=[],stack=[i];let open=false,border=0;seen[i]=1;
    while(stack.length){const v=stack.pop()!;component.push(v);
      if(adjacency[v].length===0)open=true;
      for(const n of adjacency[v]){
        if(!candidate[n]){open=true;continue;}
        if(cloth[n]){border++;continue;}
        if(!seen[n]){seen[n]=1;stack.push(n);}
      }
    }
    if(!open&&border>0)for(const v of component)cloth[v]=1;
  }
  const skirtVertices:number[]=[];
  for(let i=0;i<position.count;i++)if(cloth[i]){
    indices.set([hip,0,0,0],i*4);weights.set([1,0,0,0],i*4);skirtVertices.push(i);
  }
  mesh.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  mesh.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  mesh.userData.skirtVertices=skirtVertices;
  return skirtVertices.length;
}

/** Subtle local facial deformation over the generated face, preserving the source texture and rest shape. */
function addMashaFace(mesh:THREE.SkinnedMesh,hipY:number,facial=true):(frame:ActorFrame)=>void {
  const positions=mesh.geometry.getAttribute('position');
  const blink=new Float32Array(positions.count*3),mouth=new Float32Array(positions.count*3),seated=new Float32Array(positions.count*3);
  const skirt=new Set<number>(mesh.userData.skirtVertices??[]),cloth=new THREE.Vector3(),axis=new THREE.Vector3(1,0,0);
  const world=new THREE.Vector3(),zero=new THREE.Vector3(),ex=new THREE.Vector3(),ey=new THREE.Vector3(),ez=new THREE.Vector3();
  const matrix=new THREE.Matrix4(),delta=new THREE.Vector3();
  for(let i=0;i<positions.count;i++) {
    mesh.getVertexPosition(i,world).applyMatrix4(mesh.matrixWorld);
    let blinkY=0,mouthY=0;
    for(const [cx,cy] of facial?[[.0556,.7374],[-.053,.7449]]:[]) {
      const radius=Math.hypot((world.x-cx)/.036,(world.y-cy)/.038);
      if(radius<1.3 && world.z>.11){const w=Math.min(1,Math.max(0,(1.3-radius)/.35));blinkY=-(world.y-cy)*w*.98;}
    }
    if(facial&&world.z>.12&&Math.abs(world.x)<.067&&world.y>.59&&world.y<.662){
      const x=Math.max(0,1-(world.x/.067)**4),y=Math.min(1,(.662-world.y)/.012)*Math.min(1,(world.y-.59)/.025);mouthY=-.018*x*y;
    }
    cloth.set(0,0,0);
    if(skirt.has(i)&&world.y<.43){
      // Bend the repaired skirt forward over the lap. Keeping it as a vertical
      // cone lets the bent white thighs punch through its front when seated.
      const blend=Math.min(1,Math.max(0,(.43-world.y)/.08)),angle=-1.18*blend*blend*(3-2*blend);
      cloth.set(world.x,world.y-hipY,world.z).applyAxisAngle(axis,angle);
      cloth.y+=hipY;cloth.sub(world);
    }
    if(!blinkY&&!mouthY&&cloth.lengthSq()===0)continue;
    // Invert this vertex's rest skin transform to express metre-space displacement as local morph deltas.
    mesh.applyBoneTransform(i,zero.set(0,0,0)).applyMatrix4(mesh.matrixWorld);
    mesh.applyBoneTransform(i,ex.set(1,0,0)).applyMatrix4(mesh.matrixWorld).sub(zero);
    mesh.applyBoneTransform(i,ey.set(0,1,0)).applyMatrix4(mesh.matrixWorld).sub(zero);
    mesh.applyBoneTransform(i,ez.set(0,0,1)).applyMatrix4(mesh.matrixWorld).sub(zero);
    matrix.makeBasis(ex,ey,ez).invert();
    if(blinkY){delta.set(0,blinkY,0).applyMatrix4(matrix);blink.set(delta.toArray(),i*3);}
    if(mouthY){delta.set(0,mouthY,0).applyMatrix4(matrix);mouth.set(delta.toArray(),i*3);}
    if(cloth.lengthSq()>0){delta.copy(cloth).applyMatrix4(matrix);seated.set(delta.toArray(),i*3);}
  }
  mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(blink,3),new THREE.Float32BufferAttribute(mouth,3),new THREE.Float32BufferAttribute(seated,3)];
  mesh.geometry.morphTargetsRelative=true;mesh.updateMorphTargets();
  return frame=>{
    const a=mesh.morphTargetInfluences!;a[0]=facial?frame.face.lidClose:0;a[1]=!facial||frame.face.viseme==='rest'?0:frame.face.visemeWeight*(frame.face.viseme==='open_wide'?1:.65);
    const bend=['LeftUpLeg','RightUpLeg'].reduce((sum,name)=>{const q=frame.bones[name];return sum+(q?Math.abs(2*Math.atan2(q[0],q[3])):0);},0)*.5;
    const k=frame.posture==='sit'||frame.posture==='carried'||frame.verb==='stand_up'?Math.min(1,Math.max(0,(bend-.35)/1.05)):0;
    a[2]=k*k*(3-2*k);
  };
}
