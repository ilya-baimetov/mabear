import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {PROP_IDS,isCarrot,type MarkId} from '../../src/shared/schema';
import {propGripWorld,propPlacementAtMark,propRestPosition} from '../../src/shared/propPlacement';
import {restPlacement} from '../../src/engine/props/props';
import {PROP_CONTACTS} from '../../src/shared/propContacts';

describe('shared physical release placement',()=>{
 it('every authored release surface matches the transform of the rendered resting prop',()=>{
  for(const mark of ['table','bench','house_living','house_kitchen','clearing'] as MarkId[])for(const id of PROP_IDS){
   const shared=propPlacementAtMark(id,mark),rendered=restPlacement(id,propRestPosition(id,mark));
   expect(shared,`${id} at ${mark}`).toEqual(rendered);
   const point=new THREE.Vector3(...PROP_CONTACTS[id].point).applyEuler(new THREE.Euler(...rendered.rot,'YXZ')).add(new THREE.Vector3(...rendered.pos));
   expect(point.distanceTo(new THREE.Vector3(...propGripWorld(shared.pos,shared.rot,PROP_CONTACTS[id].point)))).toBeLessThan(1e-10);
  }
 });
 it('non-home bench placements remain on its narrow seat',()=>{
  for(const id of PROP_IDS){const p=restPlacement(id,propRestPosition(id,'bench')).pos;expect(Math.abs(p[0]-2)).toBeLessThan(.8);expect(Math.abs(p[2]-3)).toBeLessThan(.2);expect(p[1]-(isCarrot(id)?.136:0)).toBeCloseTo(.47,6);}
 });
});
