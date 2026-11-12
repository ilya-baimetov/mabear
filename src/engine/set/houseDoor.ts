import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {HOUSE_DOOR} from '../../shared/interactiveObjects';

/** Two representations of one logical object. No joints or runtime simulation. */
export function buildHouseDoor(inside=false):THREE.Group {
  const d=inside?HOUSE_DOOR.interior:HOUSE_DOOR.exterior;
  const root=new THREE.Group();root.name=`object:house_door:${inside?'inside':'outside'}`;
  root.position.set(d.center[0],d.base,d.center[1]);root.rotation.y=d.yaw;
  const wood=new THREE.MeshStandardMaterial({color:0x795336,roughness:.9});wood.userData.setOwned=true;
  const trim=new THREE.MeshStandardMaterial({color:0x543b27,roughness:.9});trim.userData.setOwned=true;
  const box=(parent:THREE.Object3D,w:number,h:number,depth:number,x:number,y:number,z:number,mat:THREE.Material)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,depth,2,.018),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  for(const side of [-1,1])box(root,.16,d.height+.2,.23,side*(d.width/2+.08),d.height/2,.01,trim);
  box(root,d.width+.32,.18,.23,0,d.height+.07,.01,trim);
  const pivot=new THREE.Group();pivot.name='object:house_door:panel';pivot.position.x=-d.width/2;root.add(pivot);
  box(pivot,d.width,d.height,.12,d.width/2,d.height/2,0,wood);
  for(const y of [.22,d.height-.22])box(pivot,d.width-.12,.14,.17,d.width/2,y,0,trim);
  // Low relief planks keep the panel readable without inventing detailed hardware.
  for(let i=1;i<6;i++)box(pivot,.014,d.height-.42,.126,d.width*i/6,d.height/2,0,trim);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.085,.016,6,18),trim);handle.position.set(d.width-.18,1.18,inside?-.09:.09);pivot.add(handle);
  if(!inside){
    const dark=new THREE.MeshStandardMaterial({color:0x302c22,roughness:1});dark.userData.setOwned=true;
    box(root,d.width,d.height,.06,0,d.height/2,-1.15,dark);
    for(const side of [-1,1])box(root,.08,d.height,1.15,side*d.width/2,d.height/2,-.57,wood);
    box(root,d.width,.06,1.15,0,0,-.57,wood);
  }
  root.userData.panel=pivot;root.userData.inside=inside;
  return root;
}
export function updateHouseDoor(root:THREE.Group,open:number):void {
  (root.userData.panel as THREE.Group).rotation.y=(root.userData.inside?-1:1)*Math.max(0,Math.min(1,open))*Math.PI*.53;
  root.userData.open=open;
}

/** The generated tree-house is a fused mesh. Cut only its doorway volume so
 * the new panel can uncover a real opening. Clip shadows as well as color. */
export function openHouseAperture(model:THREE.Object3D):void {
  const d=HOUSE_DOOR.exterior,[x,z]=d.center,w=d.width/2;
  const planes=[
    new THREE.Plane(new THREE.Vector3(-1,0,0),x-w),new THREE.Plane(new THREE.Vector3(1,0,0),-x-w),
    new THREE.Plane(new THREE.Vector3(0,-1,0),d.base-.015),new THREE.Plane(new THREE.Vector3(0,1,0),-d.base-d.height),
    new THREE.Plane(new THREE.Vector3(0,0,-1),z-1.1),new THREE.Plane(new THREE.Vector3(0,0,1),-z-.8),
  ];
  model.traverse(o=>{if(o instanceof THREE.Mesh){
    for(const m of Array.isArray(o.material)?o.material:[o.material]){m.clippingPlanes=planes;m.clipIntersection=true;m.clipShadows=true;m.needsUpdate=true;}
  }});
}
