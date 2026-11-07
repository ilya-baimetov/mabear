import {describe,it,expect} from 'vitest';
import {buildBearsYard} from '../../src/engine/set/bearsYard';
import {createMaterials,disposeMaterials} from '../../src/engine/look';

describe('independent scenic locations',()=>{
 it('keeps the house yard, playable interior, pond and ambulance visually isolated across revisits',()=>{
  const materials=createMaterials(),set=buildBearsYard(materials,{skip:['house','beehive']});
  try{
   set.updateView(0,0,'yard');
   expect(set.elements.house.visible).toBe(true);
   expect(set.elements.pond.visible).toBe(false);
   expect(set.elements.pier.visible).toBe(false);
   expect(set.elements.van.visible).toBe(false);
   set.updateView(-4.25,-6.8,'house');
   expect(set.root.children.filter(c=>c.visible).map(c=>c.name)).toEqual(['set:house_interior']);
   set.updateView(-8,10,'pond');
   expect(set.elements.pond.visible&&set.elements.pier.visible).toBe(true);
   expect(set.elements.house.visible||set.elements.van.visible).toBe(false);
   expect(set.root.getObjectByName('set:location:pond')?.visible).toBe(true);
   set.updateView(14,-1,'wolves');
   expect(set.elements.van.visible).toBe(true);
   expect(set.elements.house.visible||set.elements.pond.visible).toBe(false);
   expect(set.root.getObjectByName('set:location:wolves')?.visible).toBe(true);
   set.updateView(0,0,'yard');
   expect(set.elements.house.visible).toBe(true);
   expect(set.root.getObjectByName('set:house_interior')?.visible).toBe(false);
   expect(set.root.getObjectByName('set:location:pond')?.visible).toBe(false);
   // Remote geometry cannot remain baked into the always-visible yard mesh.
   for(const id of ['pond','pier','van'] as const)expect(set.elements[id].userData.merged).not.toBe(true);
  }finally{set.dispose();disposeMaterials(materials);}
 });
});
