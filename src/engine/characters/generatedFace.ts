import * as THREE from 'three';
import type {ActorFrame} from '../api';
import type {ActorId,Emotion} from '../../shared/schema';
import {EMOTION_PRESETS,mouthShapeFor, type MouthShape} from './face';
import {emotionWeights} from '../motion/emotion';
import { clamp, smooth } from '../../shared/math';

/** Landmarks measured on the actual height-normalized bind meshes. Animal
 * muzzles and fur stay intact; these are not scaled copies of Masha's face. */
type Eye={x:number;y:number;z:number;rx:number;ry:number};
type Profile={eyes:[Eye,Eye];mouth:{x:number;y:number;z:number;rx:number;ry:number};browY:number;jaw:number};
export const GENERATED_FACE_PROFILES:Partial<Record<ActorId,Profile>>={
 bear:{eyes:[{x:-.0465,y:2.1125,z:.4532,rx:.027,ry:.027},{x:.0535,y:2.1125,z:.4510,rx:.027,ry:.027}],mouth:{x:0,y:1.879,z:.510,rx:.105,ry:.072},browY:.077,jaw:.025},
 lady_bear:{eyes:[{x:-.0283,y:1.9472,z:.3519,rx:.026,ry:.028},{x:.0883,y:1.9438,z:.3514,rx:.027,ry:.028}],mouth:{x:.0208,y:1.7312,z:.4861,rx:.097,ry:.063},browY:.043,jaw:.022},
 hare:{eyes:[{x:-.014,y:.5402,z:.0576,rx:.019,ry:.026},{x:.0376,y:.5378,z:.0574,rx:.020,ry:.026}],mouth:{x:.0092,y:.4377,z:.0922,rx:.038,ry:.027},browY:.034,jaw:.010},
 rosie:{eyes:[{x:-.0161,y:.8940,z:.2436,rx:.0125,ry:.014},{x:.0436,y:.8919,z:.2440,rx:.0125,ry:.014}],mouth:{x:.0126,y:.7621,z:.2659,rx:.071,ry:.036},browY:.025,jaw:.014},
 squirrel:{eyes:[{x:0,y:.4297,z:.0478,rx:.016,ry:.018},{x:.0714,y:.4252,z:.0528,rx:.018,ry:.018}],mouth:{x:.0352,y:.3659,z:.0801,rx:.037,ry:.026},browY:.027,jaw:.009},
 rival_bear:{eyes:[{x:-.0533,y:2.2671,z:.3233,rx:.027,ry:.022},{x:.0506,y:2.2671,z:.3238,rx:.027,ry:.022}],mouth:{x:.0064,y:2.0107,z:.4006,rx:.108,ry:.070},browY:.034,jaw:.027},
};
type Point={p:THREE.Vector3;uv:THREE.Vector2};
function sampler(mesh:THREE.SkinnedMesh,points:Point[],eye:Eye){
 const idx=mesh.geometry.index!,cells=new Map<string,number[]>(),step=eye.rx*.6;
 for(let n=0;n<idx.count;n+=3){const p=[0,1,2].map(k=>points[idx.getX(n+k)].p);
  if(p.some(v=>v.z<eye.z-eye.rx*2)||Math.min(...p.map(v=>v.x))>eye.x+eye.rx*1.8||Math.max(...p.map(v=>v.x))<eye.x-eye.rx*1.8||Math.min(...p.map(v=>v.y))>eye.y+eye.ry*2.2||Math.max(...p.map(v=>v.y))<eye.y-eye.ry*1.6)continue;
  for(let x=Math.floor(Math.min(...p.map(v=>v.x))/step);x<=Math.floor(Math.max(...p.map(v=>v.x))/step);x++)for(let y=Math.floor(Math.min(...p.map(v=>v.y))/step);y<=Math.floor(Math.max(...p.map(v=>v.y))/step);y++){const key=`${x},${y}`,a=cells.get(key)??[];a.push(n);cells.set(key,a);}
 }
 return (x:number,y:number):Point=>{let best:Point|undefined;for(const n of cells.get(`${Math.floor(x/step)},${Math.floor(y/step)}`)??[]){const[a,b,c]=[0,1,2].map(k=>points[idx.getX(n+k)]),den=(b.p.y-c.p.y)*(a.p.x-c.p.x)+(c.p.x-b.p.x)*(a.p.y-c.p.y);if(Math.abs(den)<1e-12)continue;const u=((b.p.y-c.p.y)*(x-c.p.x)+(c.p.x-b.p.x)*(y-c.p.y))/den,v=((c.p.y-a.p.y)*(x-c.p.x)+(a.p.x-c.p.x)*(y-c.p.y))/den,w=1-u-v;if(Math.min(u,v,w)<-.0001)continue;const z=a.p.z*u+b.p.z*v+c.p.z*w;if(!best||z>best.p.z)best={p:new THREE.Vector3(x,y,z),uv:a.uv.clone().multiplyScalar(u).addScaledVector(b.uv,v).addScaledVector(c.uv,w)};}
  if(best)return best;let near=points[0],distance=Infinity;for(const p of points){if(p.p.z<eye.z-eye.rx*2)continue;const d=(p.p.x-x)**2+(p.p.y-y)**2;if(d<distance){near=p;distance=d;}}return{p:new THREE.Vector3(x,y,near.p.z),uv:near.uv.clone()};};
}

function textureColor(source:THREE.MeshStandardMaterial){
 const image=source.map?.image as ImageBitmap|undefined;
 if(!image||typeof document==='undefined')return ()=>new THREE.Color('#808080');
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return ()=>new THREE.Color('#808080');
 ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 return(uv:THREE.Vector2)=>{const x=clamp(Math.round(uv.x*(canvas.width-1)),0,canvas.width-1),y=clamp(Math.round(uv.y*(canvas.height-1)),0,canvas.height-1),n=(y*canvas.width+x)*4;return new THREE.Color().setRGB(pixels[n]/255,pixels[n+1]/255,pixels[n+2]/255,THREE.SRGBColorSpace);};
}
function movingLid(eye:Eye,top:boolean,sample:ReturnType<typeof sampler>,material:THREE.Material,colorAt:(uv:THREE.Vector2)=>THREE.Color){
 const columns=40,rows=8,positions=new Float32Array((columns+1)*(rows+1)*3),colors=new Float32Array((columns+1)*(rows+1)*4),indices:number[]=[];
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
 const surface:(Point[])[]=[];
 const left=colorAt(sample(eye.x-eye.rx*1.55,eye.y+(top?1:-1)*eye.ry*.65).uv),right=colorAt(sample(eye.x+eye.rx*1.55,eye.y+(top?1:-1)*eye.ry*.65).uv);
 for(let i=0;i<=columns;i++){const u=i/columns*2-1,x=eye.x+u*eye.rx*1.22,extent=Math.sqrt(Math.max(0,1-u*u));
  surface.push(Array.from({length:65},(_,j)=>sample(x,eye.y+eye.ry*1.24*extent*(1-j/32))));
  for(let j=0;j<=rows;j++){const k=j*(columns+1)+i,color=left.clone().lerp(right,(u+1)/2);color.toArray(colors,k*4);colors[k*4+3]=.22*smooth(j/rows)*Math.sqrt(Math.max(0,1-u*u));if(j<rows&&i<columns){const a=k,b=a+1,c=a+columns+1,d=c+1;indices.push(a,b,c,b,d,c);}}
 }
 geometry.setIndex(indices);const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name=top?'upper-lid':'lower-lid';
 const edgePos=new Float32Array((columns+1)*2*3),edgeColors=new Float32Array(edgePos.length),edgeIndices:number[]=[];
 for(let i=0;i<=columns;i++){const color=left.clone().lerp(right,i/columns).multiplyScalar(.52);color.toArray(edgeColors,i*6);color.toArray(edgeColors,i*6+3);if(i<columns){const k=i*2;edgeIndices.push(k,k+1,k+2,k+1,k+3,k+2);}}
 const edgeGeom=new THREE.BufferGeometry();edgeGeom.setAttribute('position',new THREE.BufferAttribute(edgePos,3));edgeGeom.setAttribute('color',new THREE.BufferAttribute(edgeColors,3));edgeGeom.setIndex(edgeIndices);const edge=new THREE.Mesh(edgeGeom,material);edge.frustumCulled=false;edge.name='lid-crease';mesh.add(edge);
 let priorClose=NaN;
 return{mesh,update(close:number){if(close===priorClose)return;priorClose=close;mesh.visible=close>.001;edge.visible=top&&close>.22;for(let i=0;i<=columns;i++){const u=i/columns*2-1,extent=Math.sqrt(Math.max(0,1-u*u));for(let j=0;j<=rows;j++){const v=j/rows,closed=close*(top?.72:.28),f=top?closed*v:1-closed*v,at=clamp(f*64,0,64),lo=Math.floor(at),p=surface[i][lo].p.clone().lerp(surface[i][Math.min(64,lo+1)].p,at-lo);p.z+=eye.rx*(.018+.05*Math.sin(v*Math.PI))*extent;p.toArray(positions,(j*(columns+1)+i)*3);if(j===rows){const width=eye.ry*.035*extent;p.z+=eye.rx*.018;p.y+=width;p.toArray(edgePos,i*6);p.y-=width*2;p.toArray(edgePos,i*6+3);}}}geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();edgeGeom.attributes.position.needsUpdate=true;edgeGeom.computeVertexNormals();},dispose(){geometry.dispose();edgeGeom.dispose();}};
}

/** The generated eyes are painted into a continuous textured face. Occlude
 * their source pixels beneath the geometric lids as well, including side views
 * where a shallow lid shell alone cannot hide the original bulging eye surface. */
function sourceBlink(source:THREE.MeshStandardMaterial,mesh:THREE.SkinnedMesh,points:Point[],profile:Profile,colorAt:(uv:THREE.Vector2)=>THREE.Color,id:ActorId){
 const position=new Float32Array(points.length*3);points.forEach((p,i)=>p.p.toArray(position,i*3));mesh.geometry.setAttribute('animalFaceBindPosition',new THREE.BufferAttribute(position,3));
 const close={value:0},colors=profile.eyes.flatMap(eye=>{const sample=sampler(mesh,points,eye);return[-1,1].flatMap(y=>[-1,1].map(x=>colorAt(sample(eye.x+x*eye.rx*1.55,eye.y+y*eye.ry*.85).uv)));});
 const previous=source.onBeforeCompile,previousKey=source.customProgramCacheKey;
 const f=(n:number)=>Number(n).toFixed(8);
 source.onBeforeCompile=(shader,renderer)=>{previous?.call(source,shader,renderer);shader.uniforms.animalBlink=close;colors.forEach((color,i)=>shader.uniforms[`animalLidColor${i}`]={value:color});
  if(shader.vertexShader.includes('#include <begin_vertex>')){
   shader.vertexShader='attribute vec3 animalFaceBindPosition; varying vec3 vAnimalFaceBind;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAnimalFaceBind = animalFaceBindPosition;');
  }
  if(shader.fragmentShader.includes('#include <map_fragment>')){
   shader.fragmentShader='varying vec3 vAnimalFaceBind; uniform float animalBlink; '+colors.map((_,i)=>`uniform vec3 animalLidColor${i};`).join(' ')+'\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat animalLidMask = 0.0;\n'+profile.eyes.map((eye,i)=>`{
   vec2 lidXY = (vAnimalFaceBind.xy - vec2(${f(eye.x)}, ${f(eye.y)})) / vec2(${f(eye.rx*1.32)}, ${f(eye.ry*1.3)});
   float lidRadius = length(lidXY);
   float lidRegion = (1.0-smoothstep(0.91,1.15,lidRadius))*smoothstep(${f(eye.z-eye.rx*2.2)},${f(eye.z-eye.rx*1.8)},vAnimalFaceBind.z);
   float topCover=smoothstep(1.0-1.44*animalBlink-.035,1.0-1.44*animalBlink+.035,lidXY.y);
   float lowCover=1.0-smoothstep(-1.0+.56*animalBlink-.035,-1.0+.56*animalBlink+.035,lidXY.y);
   float lidMask=lidRegion*max(topCover,lowCover)*smoothstep(0.0,.025,animalBlink);
   animalLidMask = max(animalLidMask, lidMask);
   vec2 skinBlend=clamp(lidXY*.5+.5,0.0,1.0);
   vec3 lidSkin=mix(mix(animalLidColor${i*4},animalLidColor${i*4+1},skinBlend.x),mix(animalLidColor${i*4+2},animalLidColor${i*4+3},skinBlend.x),skinBlend.y);
   diffuseColor.rgb=mix(diffuseColor.rgb,lidSkin,lidMask);
  }`).join('\n'));
  }
  if(shader.fragmentShader.includes('#include <roughnessmap_fragment>')&&shader.fragmentShader.includes('animalLidMask')){
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.94, animalLidMask);');
  }
 };
 source.customProgramCacheKey=()=>{const pk=previousKey&&previousKey!==THREE.Material.prototype.customProgramCacheKey?previousKey.call(source):'';return pk?`${pk}:animal-face-blink:${id}`:`animal-face-blink:${id}`;};source.needsUpdate=true;
 return{close,dispose(){source.onBeforeCompile=previous;source.customProgramCacheKey=previousKey;mesh.geometry.deleteAttribute('animalFaceBindPosition');}};
}

/** Source-preserving facial articulation for the generated animal cast. The
 * original muzzle stays closed; its chin/cheeks articulate without inventing
 * human teeth or tearing a cavity through arbitrary generated topology. */
export function createGeneratedFace(id:ActorId,meshes:THREE.SkinnedMesh[],bones:Record<string,THREE.Bone>,root:THREE.Object3D){
 const profile=GENERATED_FACE_PROFILES[id];if(!profile)return null;
 const mesh=meshes.reduce((a,b)=>a.geometry.attributes.position.count>b.geometry.attributes.position.count?a:b),pos=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
 const points:Point[]=Array.from({length:pos.count},(_,i)=>({p:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),uv:new THREE.Vector2(uv.getX(i),uv.getY(i))}));
 const names=['browL','browR','tilt','smile','jaw'] as const,arrays=names.map(()=>new Float32Array(pos.count*3));
 const zero=new THREE.Vector3(),ex=new THREE.Vector3(),ey=new THREE.Vector3(),ez=new THREE.Vector3(),matrix=new THREE.Matrix4(),delta=new THREE.Vector3();let active=0;
 for(let i=0;i<points.length;i++){
  const p=points[i].p,dy=[0,0,0,0,0],dx=[0,0,0,0,0];
  profile.eyes.forEach((e,side)=>{if(p.z<e.z-e.rx*2)return;const x=(p.x-e.x)/(e.rx*1.75),y=(p.y-e.y-profile.browY)/(e.ry*1.55),mask=smooth(1-Math.hypot(x,y));dy[side===0?1:0]+=mask*e.ry*.65;dy[2]+=-Math.sign(e.x-profile.mouth.x)*x*mask*e.ry*.55;});
  const m=profile.mouth;if(p.z>m.z-m.rx*1.6){const nx=(p.x-m.x)/m.rx,ny=(p.y-m.y)/m.ry,mask=smooth(1-Math.hypot(nx,ny));dy[3]=mask*Math.abs(nx)*m.ry*.4;dx[3]=mask*nx*m.rx*.10;dy[4]=-mask*profile.jaw*smooth((m.y+m.ry*.3-p.y)/(m.ry*.6));}
  if(!dy.some(Boolean)&&!dx.some(Boolean))continue;active++;
  mesh.applyBoneTransform(i,zero.set(0,0,0)).applyMatrix4(mesh.matrixWorld);mesh.applyBoneTransform(i,ex.set(1,0,0)).applyMatrix4(mesh.matrixWorld).sub(zero);mesh.applyBoneTransform(i,ey.set(0,1,0)).applyMatrix4(mesh.matrixWorld).sub(zero);mesh.applyBoneTransform(i,ez.set(0,0,1)).applyMatrix4(mesh.matrixWorld).sub(zero);matrix.makeBasis(ex,ey,ez).invert();
  names.forEach((_,n)=>{delta.set(dx[n],dy[n],0).applyMatrix4(matrix).toArray(arrays[n],i*3);});
 }
 const offset=mesh.geometry.morphAttributes.position?.length??0;mesh.geometry.morphAttributes.position=[...(mesh.geometry.morphAttributes.position??[]),...arrays.map(a=>new THREE.BufferAttribute(a,3))];mesh.geometry.morphTargetsRelative=true;mesh.updateMorphTargets();
 const space=new THREE.Group();space.name=`${id}:facial-articulation`;space.matrixAutoUpdate=false;space.matrix.copy(bones.Head.matrixWorld).invert();bones.Head.add(space);
 const source=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as THREE.MeshStandardMaterial,material=source.clone();material.side=THREE.DoubleSide;material.forceSinglePass=true;material.map=null;material.vertexColors=true;material.normalMap=null;material.roughnessMap=null;material.aoMap=null;material.transparent=true;material.roughness=.9;
 const colorAt=textureColor(source),blinkSurface=sourceBlink(source,mesh,points,profile,colorAt,id);
 const lids=profile.eyes.flatMap(eye=>{const sample=sampler(mesh,points,eye);return[true,false].map(top=>{const lid=movingLid(eye,top,sample,material,colorAt);space.add(lid.mesh);return lid;});});
 const metrics={type:'source-preserving animal face',activeVertices:active,lidClose:0,browL:0,browR:0,jaw:0};root.userData.facialPerformance=metrics;
 return{update(frame:ActorFrame){const weights=Object.entries(emotionWeights(frame.face));const blend=(select:(p:typeof EMOTION_PRESETS[Emotion])=>number)=>weights.reduce((n,[emotion,w])=>n+(w??0)*select(EMOTION_PRESETS[emotion as Emotion]),0);const mouth={}as MouthShape;for(const key of Object.keys(EMOTION_PRESETS.neutral.mouth) as (keyof MouthShape)[])mouth[key]=weights.reduce((n,[emotion,w])=>n+(w??0)*mouthShapeFor(emotion as Emotion,frame.face.viseme,frame.face.visemeWeight)[key],0);
  const browL=blend(p=>p.browL)+frame.face.browRaise*.3,browR=blend(p=>p.browR)+frame.face.browRaise*.3,tilt=blend(p=>p.tilt),smile=mouth.smile-.35,jaw=mouth.open*.65;
  const influences=mesh.morphTargetInfluences!;[browL,browR,tilt,smile,jaw].forEach((v,i)=>influences[offset+i]=v);
  const emotionLid=clamp(blend(p=>p.lid)*.7+Math.max(0,mouth.smile-.35)*.12,0,.65),close=frame.posture==='sleep'?1:emotionLid+(1-emotionLid)*clamp(frame.face.lidClose,0,1);blinkSurface.close.value=close;lids.forEach(lid=>lid.update(close));material.opacity=frame.opacity;material.depthWrite=false;Object.assign(metrics,{lidClose:close,browL,browR,jaw});
 },dispose(){blinkSurface.dispose();lids.forEach(l=>l.dispose());material.dispose();space.removeFromParent();}};
}
