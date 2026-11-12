import * as THREE from 'three';
import { GeoBag, rng, xf, type LookMaterials } from '../look';
import { NatureAssets, type NatureId } from './nature';
import {FOREST_GROUND_SEGMENTS,forestHeightAt,forestNatureLayout} from '../../shared/forestLayout';

/** Self-contained woodland locations. Coordinates remain stable for action contacts, but
 * neither location shares visible dressing with Bear's garden. */
export function buildForestLocation(kind:'pond'|'wolves',mats:LookMaterials,nature:NatureAssets,waterRadius?:(angle:number)=>number):THREE.Group {
  const root=new THREE.Group();root.name=`set:location:${kind}`;
  const b=new GeoBag(),r=rng(kind==='pond'?915:1015);
  const cx=kind==='pond'?-8:14,cz=kind==='pond'?10:-1;
  const ground=new THREE.PlaneGeometry(120,120,FOREST_GROUND_SEGMENTS,FOREST_GROUND_SEGMENTS);ground.rotateX(-Math.PI/2);ground.translate(cx,-.025,cz);
  const colors:number[]=[],p=ground.attributes.position;
  const heightAt=(x:number,z:number)=>forestHeightAt(kind,x,z);
  const base=new THREE.Color(kind==='pond'?0x648646:0x789449),shade=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),distance=Math.hypot(x-cx,z-cz);
    p.setY(i,heightAt(x,z));
    shade.copy(base).multiplyScalar(.91+.07*Math.sin(x*.8+z*.3)+r()*.14);colors.push(shade.r,shade.g,shade.b);
  }
  ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ground.computeVertexNormals();
  const groundUv=ground.attributes.uv;for(let i=0;i<groundUv.count;i++)groundUv.setXY(i,groundUv.getX(i)*50,groundUv.getY(i)*50);
  const neutralMap=new THREE.DataTexture(new Uint8Array([217,217,217,255]),1,1,THREE.RGBAFormat);neutralMap.colorSpace=THREE.SRGBColorSpace;neutralMap.needsUpdate=true;
  const normalMap=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1,THREE.RGBAFormat);normalMap.needsUpdate=true;
  const groundMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,map:neutralMap,normalMap});groundMat.color.setRGB(1.44,1.44,1.44);groundMat.normalScale.set(.22,.22);groundMat.userData.setOwned=true;
  groundMat.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    #ifdef USE_MAP
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb/max(sampledDiffuseColor.rgb,vec3(.01))*.694,.45);
    #endif`);};groundMat.customProgramCacheKey=()=>`remote-ground-soft-detail`;
  const groundMesh=new THREE.Mesh(ground,groundMat);groundMesh.name=`set:location:${kind}:ground`;groundMesh.receiveShadow=true;root.add(groundMesh);root.userData.groundMaterial=groundMat;
  // Light, worn sand leads to the pond. The ambulance has two interrupted wheel tracks.
  const trail=(points:[number,number][],width:number)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,.008,z)));
    const ps=curve.getPoints(70),verts:number[]=[],indices:number[]=[];
    for(let i=0;i<ps.length;i++){
      const a=ps[Math.max(0,i-1)],c=ps[Math.min(ps.length-1,i+1)],dx=c.x-a.x,dz=c.z-a.z,len=Math.hypot(dx,dz)||1;
      const w=width*(.9+.08*Math.sin(i*1.2));
      verts.push(ps[i].x-dz/len*w,ps[i].y,ps[i].z+dx/len*w,ps[i].x+dz/len*w,ps[i].y,ps[i].z-dx/len*w);
      if(i)indices.push(i*2-2,i*2,i*2-1,i*2-1,i*2,i*2+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();
    b.add(kind==='pond'?'paint':'foliage',g,kind==='pond'?0xc9b57f:0x909660,undefined,{jitter:.07});
  };
  if(kind==='pond'){
    trail([[-6,8],[-3.5,6.2],[-1.3,4.1],[.5,1.7],[2,-5],[1,-13]],.70);
    // Rough plank bench seen by the water in the reference episode, separate from the pier.
    b.add('bark',new THREE.CylinderGeometry(.22,.24,2.6,14,1,false,0,Math.PI),0x6b6450,xf([-4.1,.39,5.8],[0,0,Math.PI/2]),{jitter:.08});
    b.add('wood',new THREE.BoxGeometry(2.6,.07,.48),0xa99e7e,xf([-4.1,.5,5.8]),{jitter:.08});
    for(const x of [-5.1,-3.2])b.add('bark',new THREE.CylinderGeometry(.17,.21,.48,10),0x67533b,xf([x,.24,5.8]));
    b.add('bark',new THREE.CylinderGeometry(.28,.36,.4,13),0x6b6550,xf([-2.28,.19,5.9]),{capColor:0xa69875,capAxis:'y'});
  }else{
    for(const offset of [-.6,.6])trail([[14+offset,1],[13+offset,3.5],[11+offset,6],[10+offset,10],[11+offset,15]],.14);
    // Repair yard: quiet storytelling details, explicitly an adaptation rather than episode-exact props.
    for(const [x,z,angle] of [[10.2,-3.7,.35],[17,-1.3,-.3]] as const){
      b.add('bark',new THREE.CylinderGeometry(.21,.27,2.05,12),0x796041,xf([x,.25,z],[Math.PI/2,0,angle]),{capColor:0xc3a16c,capAxis:'y'});
    }
    for(let k=0;k<2;k++){
      const x=16.2+k*.65,z=-3.6;
      b.add('wood',new THREE.BoxGeometry(.58,.48,.6),0x9c7f54,xf([x,.24,z]),{jitter:.1});
      for(const y of [.07,.4])b.add('wood',new THREE.BoxGeometry(.61,.05,.64),0x6b5a40,xf([x,y,z]));
    }
  }
  const staticGroup=b.build(mats,`set:location:${kind}:dressing`);b.dispose();root.add(staticGroup);
  // The remote scenes have their own terrain-following grass. Reusing yard tufts made
  // sparse pale spikes float on these hills and left the immediate shoreline bare.
  const grassPos:number[]=[],grassColors:number[]=[],grassIndices:number[]=[];
  const grassLow=new THREE.Color(0x567a38),grassHigh=new THREE.Color(0x92aa5a);
  for(let blade=0;blade<4;blade++){
    const a=blade*Math.PI*.5,dx=Math.cos(a),dz=Math.sin(a),o=blade*5;
    grassPos.push(-dz*.07,0,dx*.07,dz*.07,0,-dx*.07,dx*.17-dz*.04,.58,dz*.17+dx*.04,dx*.17+dz*.04,.58,dz*.17-dx*.04,dx*.35,1,dz*.35);
    for(const k of [0,0,.55,.55,1]){const col=grassLow.clone().lerp(grassHigh,k);grassColors.push(col.r,col.g,col.b);}
    grassIndices.push(o,o+1,o+2,o+1,o+3,o+2,o+2,o+3,o+4);
  }
  const grassG=new THREE.BufferGeometry();grassG.setAttribute('position',new THREE.Float32BufferAttribute(grassPos,3));grassG.setAttribute('color',new THREE.Float32BufferAttribute(grassColors,3));grassG.setIndex(grassIndices);
  const grassNormals=new Float32Array(grassPos.length);for(let i=1;i<grassNormals.length;i+=3)grassNormals[i]=1;grassG.setAttribute('normal',new THREE.BufferAttribute(grassNormals,3));
  const grassM=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});grassM.userData.setOwned=true;
  grassM.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');};grassM.customProgramCacheKey=()=>`remote-grass-up-normal`;
  const matrices:THREE.Matrix4[]=[];const grassRandom=rng(kind==='pond'?583:584);
  for(let i=0;i<40000&&matrices.length<18000;i++){
    const x=cx+(grassRandom()-.5)*30,z=cz+(grassRandom()-.5)*30;
    const distance=Math.hypot(x-cx,z-cz),a=Math.atan2(z-cz,x-cx);
    if(kind==='pond'&&distance<(waterRadius?.(a)??3.5)+.10)continue;
    if(kind==='wolves'&&x>13&&x<15.2&&z>-3.2&&z<1.2)continue;
    if(kind==='pond'&&x>-6.2&&x<2&&z<9&&z>-2&&Math.abs(x-(-3.6+(6-z)*.8))<.8)continue;
    const patch=.5+.5*Math.sin(x*1.8+Math.cos(z))*Math.cos(z*1.7);
    if(grassRandom()>.55+patch*.4)continue;
    const h=.065+grassRandom()*.09+(kind==='wolves'&&x>13?.035:0);
    matrices.push(xf([x,heightAt(x,z)+.028,z],[0,grassRandom()*Math.PI*2,0],[h*1.2,h,h*1.2]));
  }
  const grass=new THREE.InstancedMesh(grassG,grassM,matrices.length);matrices.forEach((m,i)=>grass.setMatrixAt(i,m));grass.instanceMatrix.needsUpdate=true;grass.computeBoundingSphere();grass.receiveShadow=true;grass.name=`set:location:${kind}:grass`;root.add(grass);
  // A distinct deciduous grove: near birches, leafy understorey and deeper pine silhouettes.
  const spots=forestNatureLayout(kind,waterRadius);
  for(const [id,ss]of Object.entries(spots))nature.add(root,id as NatureId,ss, id.startsWith('Pine')||id.startsWith('Birch'));
  root.visible=false;
  return root;
}
