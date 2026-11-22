import * as THREE from 'three';
import { loadGltf, normalizeStatic } from '../assets';
import type { SetElementId } from './bearsYard';
interface Spot { x:number; z:number; y?:number; h:number; yaw?:number }

/** Reuse each exported mesh and texture across the garden; one draw per material, not per plant. */
export async function loadGeneratedYard(anchors:Record<SetElementId,THREE.Group>, isDisposed:()=>boolean):Promise<void> {
  async function plant(id:string,parent:THREE.Group,spots:Spot[]) {
    const loaded=await loadGltf(`assets/generated/${id}.glb`);
    const model=normalizeStatic(loaded.scene,1);model.updateMatrixWorld(true);
    const parts:THREE.Mesh[]=[];model.traverse(o=>{if((o as THREE.Mesh).isMesh)parts.push(o as THREE.Mesh)});
    if(isDisposed()){for(const part of parts){part.geometry.dispose();for(const m of Array.isArray(part.material)?part.material:[part.material]){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();m.dispose();}}return;}
    for(const part of parts){
      const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);part.geometry.dispose();
      const mesh=new THREE.InstancedMesh(geometry,part.material,spots.length);mesh.name=`generated:${id}`;
      const transform=new THREE.Matrix4();
      spots.forEach((sp,i)=>{transform.compose(new THREE.Vector3(sp.x,sp.y??(id==='daisies'?-.075:0),sp.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sp.yaw??0),new THREE.Vector3(sp.h,sp.h,sp.h));mesh.setMatrixAt(i,transform);});
      mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=id!=='carrot'&&id!=='daisies';mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);
    }
  }
  await Promise.all([
    plant('orchard_tree',anchors.ground,[{x:1,z:-12,h:6.3,yaw:-.25},{x:10.5,z:-13,h:5.6,yaw:.6}]),
    plant('beehive',anchors.beehive,[{x:-1.65,z:-1.1,h:1.25,yaw:.15},{x:1.55,z:-1.2,h:1.35,yaw:-.1}]),
    plant('carrot',anchors.garden,[-1.2].flatMap((z,row)=>Array.from({length:9},(_,k)=>({x:-1.7+k*.42,z:z+(k%2?.1:-.1),y:-.13,h:.48+(k%3)*.025,yaw:k*1.7+row})))),
    plant('daisies',anchors.ground,[{x:-8.9,z:-2,h:.68},{x:-9.5,z:-2.3,h:.61},{x:-3.3,z:-2.5,h:.7},{x:-2.8,z:-3,h:.55},{x:3,z:-5.2,h:.55},{x:7.9,z:-5.4,h:.63},{x:8.3,z:-5.7,h:.57},{x:9,z:-8,h:.6}]),
  ]);
}
