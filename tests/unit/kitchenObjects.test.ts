import {describe,it,expect} from 'vitest';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {initialWorldState,worldStateDigest} from '../../src/compiler/worldState';
import {CARROT_IDS,SegmentSchema,WorldStateSchema,type Timeline} from '../../src/shared/schema';
import {KITCHEN_CONTAINERS} from '../../src/shared/kitchenContainers';
import {HOUSE_COOKING_HELPER,HOUSE_PREP_TABLE,houseCookingSupportHeightAt,housePickupPosition,isHousePoint} from '../../src/shared/houseLayout';
import {interiorSegmentClear} from '../../src/compiler/path';
import {sceneLocationAt} from '../../src/shared/bible/set';
import {parseParagraph} from '../../src/director/offline/parser';
import {compile} from '../../src/compiler/compile';
import {EMPTY_CARRY} from '../../src/compiler/audioCues';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {Quaternion,Vector3,MeshStandardMaterial,PerspectiveCamera} from 'three';
import {propPlacementAtMark,propRestPosition} from '../../src/shared/propPlacement';
import {restPlacement,buildPropMesh} from '../../src/engine/props/props';
import type {LookMaterials} from '../../src/engine/look';
import {STYLES} from '../../src/engine/motion/verbs/common';
import {cookingSupportHeightAt} from '../../src/shared/cookingStation';

const EN=['Masha picks carrot number 2 from the garden.','Masha carries carrot number 2 into the kitchen.','Masha puts carrot number 2 in the bowl.','Bear takes carrot number 2 from the bowl and puts it into the pot.'];
const RU=['Маша выдёргивает морковку номер 2 из грядки.','Маша несёт морковку номер 2 на кухню.','Маша кладёт морковку номер 2 в миску.','Медведь берёт морковку номер 2 из миски и кладёт её в кастрюлю.'];
const finish=(t:Timeline)=>evaluate(t,t.duration);

describe('garden to kitchen in actual text stories',()=>{
 it.each([['en',EN],['ru',RU]] as const)('%s preserves the one harvested carrot through the doorway, bowl, Bear and pot',(lang,texts)=>{
  const t=textStory([...texts],lang),initial=evaluate(t,0);
  expect(t.segments.map(s=>s.segment.endState.props.carrot_2.at)).toEqual(['masha','masha','kitchen_bowl','kitchen_pot']);
  const states:string[]=[];let last='';
  for(let time=0;time<=t.duration;time+=.053){
   const f=evaluate(t,time),owner=f.props.carrot_2.attachedTo??(f.props.carrot_2.pos[1]>.1?'container':'garden');
   if(owner!==last){states.push(owner);last=owner;}
   for(const id of CARROT_IDS.filter(id=>id!=='carrot_2'))expect(f.props[id]).toEqual(initial.props[id]);
   expect(f.props.carrot_2.visible).toBe(true);
   for(const actor of ['masha','bear'] as const){const a=f.actors[actor],contact=a.pickup??a.putDown;if(contact?.container){expect(f.camera.location).toBe('house');expect(sceneLocationAt(a.pos[0],a.pos[2])).toBe('house');}}
  }
  expect(states).toEqual(['garden','masha','container','bear','container']);
  expect(finish(t).props.carrot_2.pos).toEqual(KITCHEN_CONTAINERS.kitchen_pot.carrotPosition);
  expect(t.segments[1].segment.objectCues?.some(c=>c.object==='house_door'&&c.to===1)).toBe(true);
  expect(t.segments.flatMap(s=>s.segment.actorClips.bear).some(c=>c.verb==='carry')).toBe(false);
  for(const {segment} of t.segments)expect(SegmentSchema.safeParse(segment).success).toBe(true);
 });
 it('changes ownership only at a contacted surface, and reaches the real rear counter',()=>{
  const t=textStory(EN);
  for(const {segment,offset} of t.segments)for(const actor of ['masha','bear'] as const)for(const c of segment.actorClips[actor]){
   if(!c.params.putDown&&!c.params.pickUpAt||c.params.item!=='carrot_2')continue;
   const at=offset+c.start+c.dur*.5,before=evaluate(t,at-.00001),after=evaluate(t,at+.00001);
   expect(before.props.carrot_2.attachedTo).toBe(c.verb==='take'?null:actor);
   expect(after.props.carrot_2.attachedTo).toBe(c.verb==='take'?actor:null);
   if(c.params.putDown==='kitchen_pot')expect(c.params.from).toEqual(KITCHEN_CONTAINERS.kitchen_pot.approaches.bear.position);
  }
  const bearPaths=t.segments[3].segment.actorClips.bear.filter(c=>c.params.path&&c.params.path.every(p=>sceneLocationAt(...p)==='house'));
  for(const c of bearPaths)for(let i=1;i<c.params.path!.length;i++)expect(interiorSegmentClear(c.params.path![i-1],c.params.path![i])).toBe(true);
 });
 it('reconstructs the same prop, ownership and contacts in arbitrary seek/replay order',()=>{
  const t=textStory(EN),times=Array.from({length:65},(_,i)=>t.duration*i/64),expected=times.map(x=>evaluate(t,x));
  for(const i of [64,0,36,12,52,3,60,22,64,0,...times.map((_,i)=>i)])expect(evaluate(t,times[i])).toEqual(expected[i]);
  const saved=JSON.parse(JSON.stringify(t)) as Timeline;expect(finish(saved)).toEqual(finish(t));
 });
 it('keeps the camera inside the house through every kitchen contact preparation and boundary',()=>{
  const t=textStory(EN);
  for(const e of t.segments)for(const actor of ['masha','bear'] as const)for(const c of e.segment.actorClips[actor]){
   if(!['kitchen_bowl','kitchen_pot'].includes(c.params.pickUpAt??c.params.putDown??''))continue;
   const turn=e.segment.actorClips[actor].find(p=>p.verb==='look_at'&&Math.abs(p.start+p.dur-c.start)<.002),from=turn?.start??c.start;
   const times=[from-.0005,from,from+.0005,c.start-.0005,c.start,c.start+.0005,c.start+c.dur-.0005];
   for(let at=from;at<c.start+c.dur;at+=.025)times.push(at);
   for(const at of times){const f=evaluate(t,e.offset+at);expect(f.camera.location).toBe('house');expect(isHousePoint(f.camera.pos[0],f.camera.pos[2]),`${actor} ${c.params.pickUpAt??c.params.putDown} at ${e.offset+at}`).toBe(true);}
  }
 });
 it('keeps the travelling actor framed across the complete garden-to-pot story',()=>{
  const t=textStory(EN),camera=new PerspectiveCamera(50,16/9,.05,100),v=new Vector3();
  for(const e of t.segments)for(const actor of ['masha','bear'] as const)for(const c of e.segment.actorClips[actor]){
   if(c.verb!=='walk_to'||c.params.ambient||c.params.sceneCut)continue;
   for(let u=.01;u<1;u+=.025){
    const at=e.offset+c.start+c.dur*u,f=evaluate(t,at),a=f.actors[actor];if(a.opacity<.99)continue;
    camera.fov=f.camera.fov;camera.position.fromArray(f.camera.pos);camera.lookAt(...f.camera.look);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const support=cookingSupportHeightAt(a.pos[0],a.pos[2]);
    // Medium travelling shots may crop feet, but must retain torso and face.
    for(const y of [STYLES[actor].height*.55,STYLES[actor].height*.92]){
     v.set(a.pos[0],a.pos[1]+support+y,a.pos[2]).project(camera);
     expect(Math.abs(v.x),`${actor} horizontal frame at ${at}`).toBeLessThan(1);
     expect(Math.abs(v.y),`${actor} vertical frame at ${at}`).toBeLessThan(1);
     expect(v.z).toBeLessThan(1);expect(v.z).toBeGreaterThan(-1);
    }
   }
  }
 });
 it('releases over the pot and settles the same carrot continuously',()=>{
  const t=textStory(EN),e=t.segments[3],c=e.segment.actorClips.bear.find(c=>c.params.putDown==='kitchen_pot')!,at=e.offset+c.start+c.dur*.5;
  const before=evaluate(t,at-.00001),released=evaluate(t,at+.00001),falling=evaluate(t,at+.12),settled=evaluate(t,at+.3);
  expect(before.props.carrot_2.attachedTo).toBe('bear');expect(released.props.carrot_2.attachedTo).toBeNull();
  expect(c.params.putDownPosition![1]).toBeGreaterThan(KITCHEN_CONTAINERS.kitchen_pot.carrotPosition[1]+.3);
  expect(released.props.carrot_2.pos[1]).toBeCloseTo(c.params.putDownPosition![1],6);
  expect(falling.props.carrot_2.pos[1]).toBeLessThan(released.props.carrot_2.pos[1]);
  expect(settled.props.carrot_2.pos).toEqual(KITCHEN_CONTAINERS.kitchen_pot.carrotPosition);
  for(const time of [at+.3,at,at+.12,at-.00001,at+.3])expect(evaluate(t,time)).toEqual(evaluate(JSON.parse(JSON.stringify(t)),time));
 });
 it('deleting a deposit does not let a later take from the bowl steal a carrot elsewhere',()=>{
  const t=textStory([EN[0],EN[1],EN[3]]);expect(t.segments.at(-1)!.segment.endState.props.carrot_2.at).toBe('masha');
  const changed=textStory(['Masha picks carrot number 3.',...EN.slice(1)]);
  expect(changed.segments.at(-1)!.segment.endState.props.carrot_3.at).toBe('masha');
  expect(changed.segments.at(-1)!.segment.endState.props.carrot_2).toEqual({at:'garden',planted:true});
 });
 it('one-slot containers refuse a second carrot without losing either object',()=>{
  const t=textStory([...EN.slice(0,3),'Bear takes carrot number 3 and puts it in the bowl.']);
  const w=t.segments.at(-1)!.segment.endState;expect(w.props.carrot_2.at).toBe('kitchen_bowl');expect(w.props.carrot_3.at).toBe('bear');
  expect(w.actors.bear.holding).toBe('carrot_3');
 });
 it('serializes concurrent container beats before switching the unique object owner',()=>{
  const ws=initialWorldState();ws.actors.masha.holding='carrot_2';ws.props.carrot_2={at:'masha',planted:false};
  ws.actors.masha.pos=[...KITCHEN_CONTAINERS.kitchen_bowl.approaches.masha.position];ws.actors.masha.mark='house_kitchen';
  ws.actors.bear.pos=[...KITCHEN_CONTAINERS.kitchen_bowl.approaches.bear.position];ws.actors.bear.mark='house_kitchen';
  const script=parseParagraph('Masha puts carrot number 2 into the bowl. Bear takes carrot number 2 from the bowl.','en',ws);
  const taking=script.beats.find(b=>b.actor==='bear'&&b.verb==='take')!;taking.with_previous=true;
  const {segment}=compile(script,ws,{paragraphId:'concurrent-bowl',version:1,lang:'en',remix:DEFAULT_REMIX,isFirst:true,carry:EMPTY_CARRY});
  const put=segment.actorClips.masha.find(c=>c.verb==='put_down')!,take=segment.actorClips.bear.find(c=>c.verb==='take')!;
  expect(take.start).toBeGreaterThanOrEqual(put.start+put.dur);
  const t={segments:[{offset:0,segment}],duration:segment.duration};
  expect(evaluate(t,put.start+put.dur*.5+.001).props.carrot_2.attachedTo).toBeNull();
  expect(finish(t).props.carrot_2.attachedTo).toBe('bear');
 });
 it('container references resolve their actual contents across scene boundaries',()=>{
  const t=textStory([...EN.slice(0,3),'Bear takes it from the bowl.','Bear puts it into the pot.']);
  expect(t.segments.at(-1)!.segment.endState.props.carrot_2.at).toBe('kitchen_pot');
 });
 it('does not teleport short actors to the tall counter or substitute another carrot',()=>{
  const t=textStory([...EN.slice(0,2),'Masha puts carrot number 2 into the pot.']);
  expect(finish(t).props.carrot_2.attachedTo).toBe('masha');
  const eaten=textStory(['Masha picks carrot number 2 and eats it.','Bear takes carrot number 2 from the bowl.']);
  expect(finish(eaten).props.carrot_2.visible).toBe(false);
 });
 it('refuses unimplemented pot retrieval without moving or consuming its carrot',()=>{
  for(const ending of ['Bear takes carrot number 2 from the pot.','Bear eats carrot number 2.']){
   const t=textStory([...EN,ending]),end=t.segments.at(-1)!.segment;
   expect(end.endState.props.carrot_2.at).toBe('kitchen_pot');expect(end.endState.actors.bear.holding).toBeNull();
   expect(end.actorClips.bear.some(c=>c.verb==='take'||c.verb==='eat')).toBe(false);
  }
 });
 it('the reachable bowl stays on the actual table and Masha has full helper support',()=>{
  const bowl=KITCHEN_CONTAINERS.kitchen_bowl,table=HOUSE_PREP_TABLE;
  expect(Math.abs(bowl.position[0]-table.position[0])+bowl.radius).toBeLessThan(table.width/2);
  expect(Math.abs(bowl.position[1]-table.position[1])+bowl.radius).toBeLessThan(table.depth/2);
  expect(bowl.baseY).toBe(table.height);
  expect(houseCookingSupportHeightAt(...bowl.approaches.masha.position)).toBeCloseTo(HOUSE_COOKING_HELPER.height,6);
  const cook=textStory(['Masha goes into the kitchen and cooks pancakes.']);
  const c=cook.segments[0].segment.actorClips.masha.find(c=>c.verb==='cook')!;
  expect(houseCookingSupportHeightAt(...c.params.from!)).toBeCloseTo(HOUSE_COOKING_HELPER.height,6);
  expect(cook.segments[0].segment.endState.props.pancakes.at).toBe('house_kitchen');
 });
 it('renders container rest slots at the same physical transform used by contacts',()=>{
  for(const mark of ['kitchen_bowl','kitchen_pot'] as const)for(const id of CARROT_IDS){
   expect(restPlacement(id,propRestPosition(id,mark))).toEqual(propPlacementAtMark(id,mark));
  }
 });
 it('keeps the bowl clear of the food and pan meshes on the preparation table',()=>{
  const bowl=KITCHEN_CONTAINERS.kitchen_bowl,pan=propPlacementAtMark('frying_pan','house_kitchen').pos;
  const material=new MeshStandardMaterial(),materials={paint:material,metal:material} as LookMaterials;
  const footprint=(id:'pancakes'|'cake'|'jam_jar'|'frying_pan')=>{const mesh=buildPropMesh(id,materials),p=mesh.geometry.attributes.position;let radius=0;for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));mesh.geometry.dispose();return radius;};
  const panRadius=footprint('frying_pan');
  for(const id of ['pancakes','cake','jam_jar'] as const){
   const radius=footprint(id);
   const p=propPlacementAtMark(id,'house_kitchen').pos;
   expect(Math.hypot(p[0]-bowl.position[0],p[2]-bowl.position[1])-radius-bowl.radius).toBeGreaterThan(.04);
   expect(Math.hypot(p[0]-pan[0],p[2]-pan[2])-radius-panRadius).toBeGreaterThan(.04);
   expect(Math.abs(p[2]-HOUSE_PREP_TABLE.position[1])+radius).toBeLessThan(HOUSE_PREP_TABLE.depth/2);
   expect(houseCookingSupportHeightAt(...housePickupPosition(id))).toBeCloseTo(.8,6);
  }
  material.dispose();
 });
 it('preserves honey-pot and shoulder-ride meanings',()=>{
  const honey=textStory(['Bear takes the honey pot.']);expect(finish(honey).props.honey_pot.attachedTo).toBe('bear');
  const ride=textStory(['Bear carries Masha to the clearing.']);expect(ride.segments[0].segment.actorClips.bear.some(c=>c.verb==='carry')).toBe(true);
 });
 it('serializes optional free-ball rest poses and makes them part of the director cache key',()=>{
  const a=initialWorldState(),b=structuredClone(a);b.props.ball={at:'clearing',position:[.62,0,3],rotation:[0,0,0]};
  expect(WorldStateSchema.parse(b).props.ball).toEqual(b.props.ball);expect(worldStateDigest(a)).not.toBe(worldStateDigest(b));
 });
 it('keeps the rotating animation-only ball above the ground and continuous between scenes',()=>{
  const t=textStory(['Masha takes the ball and puts it on the bench.','Masha nudges the ball off the bench and waits.','Masha walks to the clearing, waits, and picks up the ball.']);
  for(let time=0;time<t.duration;time+=.021){
   const b=evaluate(t,time).props.ball;if(b.attachedTo)continue;
   const centre=new Vector3(0,.15,0).applyQuaternion(new Quaternion(...(b.rotation??[0,0,0,1]))).add(new Vector3(...b.pos));
   expect(centre.y-.15).toBeGreaterThanOrEqual(-.000001);
  }
  const boundary=t.segments[2].offset,a=evaluate(t,boundary-.000001).props.ball,b=evaluate(t,boundary+.000001).props.ball;
  expect(new Vector3(...a.pos).distanceTo(new Vector3(...b.pos))).toBeLessThan(.00001);
  expect(new Quaternion(...a.rotation!).angleTo(new Quaternion(...b.rotation!))).toBeLessThan(.00001);
  const c=t.segments[2].segment.actorClips.masha.find(c=>c.verb==='take')!;
  const before=evaluate(t,t.segments[2].offset+c.start+c.dur*.5-.00001);
  expect(before.props.ball.pos).toEqual(c.params.pickUpPosition);
  expect(finish(t).props.ball.attachedTo).toBe('masha');
 });
});
