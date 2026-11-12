import {describe,it,expect} from 'vitest';
import {Box3,Mesh,PerspectiveCamera,Vector3} from 'three';
import {planPath,pathLength,pointAlong} from '../../src/compiler/path';
import {planCamera} from '../../src/compiler/camera';
import {MARKS,isInsideHouse} from '../../src/shared/bible/set';
import {HOUSE_COOKING_HELPER,HOUSE_LIVING_MARK,houseWorld} from '../../src/shared/houseLayout';
import {buildHouseInterior} from '../../src/engine/set/houseInterior';
import {createMaterials,disposeMaterials} from '../../src/engine/look';
import type {ActorId,Vec2} from '../../src/shared/schema';

describe('revised interior navigation and staging',()=>{
 it('walks between the stove, armchair and helper without crossing the actual table meshes',()=>{
  const materials=createMaterials(),interior=buildHouseInterior(materials);
  interior.updateMatrixWorld(true);
  try{
   const tables=['rounded low checkers table','Turned-leg preparation table'].map(name=>{
    const object=interior.getObjectByName(name);expect(object,name).toBeDefined();return new Box3().setFromObject(object!);
   });
   const paths=[
    planPath(MARKS.house_kitchen.pos,HOUSE_LIVING_MARK),
    planPath(HOUSE_LIVING_MARK,MARKS.house_kitchen.pos),
    planPath(HOUSE_COOKING_HELPER.entry,HOUSE_LIVING_MARK),
    planPath(MARKS.house_kitchen.pos,houseWorld([1,-.2])),
   ];
   for(const path of paths){
    expect(pathLength(path)).toBeGreaterThan(1);
    expect(path.at(-1)).not.toEqual(path[0]);
    for(let distance=.03;distance<pathLength(path);distance+=.06){
     const p=pointAlong(path,distance);expect(isInsideHouse(...p)).toBe(true);
     for(const box of tables){
      const inside=p[0]>box.min.x-.18&&p[0]<box.max.x+.18&&p[1]>box.min.z-.18&&p[1]<box.max.z+.18;
      expect(inside,`walk ${p} through table ${box.min.toArray()}`).toBe(false);
     }
    }
   }
  }finally{
   const geometries=new Set<any>(),materialsOwned=new Set<any>();
   interior.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materialsOwned.add(m);}});
   geometries.forEach(g=>g.dispose());materialsOwned.forEach(m=>m.dispose());disposeMaterials(materials);
  }
 });
 it('establishes the wrapping kitchen and reading group together instead of framing the old room centre',()=>{
  const positions:Record<string,Vec2>={bear:MARKS.house_kitchen.pos,masha:HOUSE_LIVING_MARK};
  const posAt=(actor:ActorId)=>positions[actor]??[0,0] as Vec2;
  const cue=planCamera({duration:3,isFirst:true,cameraSeed:0,dialogue:[],posAt,
   visibleAt:a=>a==='bear'||a==='masha',facingAt:a=>MARKS[a==='bear'?'house_kitchen':'house_living'].facing,
   beats:[{start:0,dur:3,actor:'bear',verb:'cook',shot:'wide',from:positions.bear,to:positions.bear,hasLine:false,lineStart:0,lineDur:0,punchline:false,emotion:'happy'}],
  })[0];
  expect(cue.from.location).toBe('house');
  const camera=new PerspectiveCamera(cue.from.fov,16/9,.05,100);camera.position.fromArray(cue.from.pos);camera.lookAt(new Vector3(...cue.from.look));camera.updateMatrixWorld();
  // Fridge, kitchen window, chair, bookcase and flat return remain visible;
  // the extreme pantry edge may crop to keep the foreground floor edge out.
  for(const local of [[-6.8,-.2],[-5.75,-1.87],[.65,-1.275],[2.75,-2.3],[-3.80,-.55]]){
   const p=houseWorld(local),projected=new Vector3(p[0],1.3,p[1]).project(camera);
   expect(Math.abs(projected.x)).toBeLessThan(.97);expect(Math.abs(projected.y)).toBeLessThan(.92);expect(projected.z).toBeLessThan(1);
  }
  expect(cue.from.pos[1]).toBeLessThanOrEqual(3.05);
 });
});
