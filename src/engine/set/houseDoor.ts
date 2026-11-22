import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {HOUSE_DOOR} from '../../shared/interactiveObjects';
import {castIronMaterial, honeyWalnutMaterial} from './interiorDecor';

/** Merge same-material static meshes within a door group so forged rivets and hinges stay one draw call. */
function mergeGroupByMaterial(group:THREE.Group):void {
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of group.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
    const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);
  }
  for(const [mat,meshes] of batches){
    if(meshes.length<2)continue;
    const parts=meshes.map(m=>{
      m.updateMatrix();
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
      for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')g.deleteAttribute(k);
      if(!g.hasAttribute('normal'))g.computeVertexNormals();
      g.applyMatrix4(m.matrix);g.clearGroups();return g;
    });
    const merged=mergeGeometries(parts);
    for(const p of parts)p.dispose();
    if(!merged)continue;
    const batch=new THREE.Mesh(merged,mat);
    batch.castShadow=meshes.some(m=>m.castShadow);
    batch.receiveShadow=meshes.some(m=>m.receiveShadow);
    for(const m of meshes){group.remove(m);m.geometry.dispose();}
    group.add(batch);
  }
}

/** Two representations of one logical object. No joints or runtime simulation. */
export function buildHouseDoor(inside=false):THREE.Group {
  const d=inside?HOUSE_DOOR.interior:HOUSE_DOOR.exterior;
  const root=new THREE.Group();root.name=`object:house_door:${inside?'inside':'outside'}`;
  root.position.set(d.center[0],d.base,d.center[1]);root.rotation.y=d.yaw;
  const wood=honeyWalnutMaterial({planked:true,color:'#8a613c',roughness:.68,name:'door planked wood'});
  const trim=honeyWalnutMaterial({planked:false,color:'#64442a',roughness:.74,name:'door frame timber'});
  const iron=castIronMaterial('#2b2d30',.78,.40,'door forged iron');
  const mesh=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,x:number,y:number,z:number,mat:THREE.Material)=>{
    const item=new THREE.Mesh(geometry,mat);item.position.set(x,y,z);item.castShadow=item.receiveShadow=true;parent.add(item);return item;
  };
  const box=(parent:THREE.Object3D,w:number,h:number,depth:number,x:number,y:number,z:number,mat:THREE.Material,radius=.018)=>{
    return mesh(parent,new RoundedBoxGeometry(w,h,depth,2,Math.min(radius,w/3,h/3,depth/3)),x,y,z,mat);
  };
  for(const side of [-1,1])box(root,.16,d.height+.2,.23,side*(d.width/2+.08),d.height/2,.01,trim);
  box(root,d.width+.32,.18,.23,0,d.height+.07,.01,trim);
  const pivot=new THREE.Group();pivot.name='object:house_door:panel';pivot.position.x=-d.width/2;root.add(pivot);
  box(pivot,d.width,d.height,.12,d.width/2,d.height/2,0,wood);
  for(const y of [.22,d.height-.22]){
    box(pivot,d.width-.12,.14,.17,d.width/2,y,0,trim);
    // Forged-iron hinge barrel + strap hinges with dome rivets along the batten.
    const barrel=mesh(pivot,new THREE.CylinderGeometry(.022,.022,.16,12),.025,y,inside?-.072:.072,iron);
    barrel.castShadow=true;
    for(const zSign of [-1,1]){
      const fz=zSign*.090;
      box(pivot,.56,.068,.012,.30,y,fz,iron,.004);
      const tip=mesh(pivot,new THREE.CylinderGeometry(.046,.046,.012,14),.58,y,fz,iron);
      tip.rotation.x=Math.PI/2;
      for(const rx of [.13,.33,.53]){
        mesh(pivot,new THREE.SphereGeometry(.013,8,6),rx,y,fz+zSign*.005,iron);
      }
    }
  }
  // Low relief planks reinforce the vertical planked grain on the slab.
  for(let i=1;i<6;i++)box(pivot,.014,d.height-.42,.126,d.width*i/6,d.height/2,0,trim,.004);
  // Dark forged-iron escutcheon plate and drop-ring handle on both faces of the door.
  for(const zSign of [-1,1]){
    const hx=d.width-.18;
    box(pivot,.09,.30,.014,hx,1.18,zSign*.065,iron,.005);
    const boss=mesh(pivot,new THREE.CylinderGeometry(.024,.028,.022,12),hx,1.24,zSign*.074,iron);
    boss.rotation.x=Math.PI/2;
    mesh(pivot,new THREE.TorusGeometry(.078,.015,8,20),hx,1.155,zSign*.088,iron);
    box(pivot,.026,.055,.018,hx,1.29,zSign*.073,iron,.004);
  }
  if(!inside){
    const dark=new THREE.MeshStandardMaterial({color:0x302c22,roughness:1});dark.userData.setOwned=true;
    box(root,d.width,d.height,.06,0,d.height/2,-1.15,dark);
    for(const side of [-1,1])box(root,.08,d.height,1.15,side*d.width/2,d.height/2,-.57,wood);
    box(root,d.width,.06,1.15,0,0,-.57,wood);
  }
  mergeGroupByMaterial(pivot);
  mergeGroupByMaterial(root);
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
