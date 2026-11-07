import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {FIXTURES} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {DEFAULT_REMIX,type PropId} from '../../src/shared/schema';
import {FISHING_WATER_TARGET,MARKS} from '../../src/shared/bible/set';
import {createProps} from '../../src/engine/props/props';
import {createMaterials,disposeMaterials} from '../../src/engine/look';
import {pondRadius,walkHeightAt} from '../../src/engine/set/bearsYard';
import {restFrame} from '../../src/engine/characters/rig';
import type {PropFrame} from '../../src/engine/api';
import {evaluate} from '../../src/engine/player/evaluate';

describe('fishing water contact',()=>{
 it('casts both real language fixtures into the pond from the elevated pier',()=>{
  for(const fixture of FIXTURES.filter(f=>f.id==='fishing_trip')){
   const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),fixture.lang);
   const segment=timeline.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='fish'))!.segment;
   const clip=segment.actorClips.bear.find(c=>c.verb==='fish')!;
   const from=clip.params.from!,facing=clip.params.facing!;
   expect(walkHeightAt(from[0],from[1])).toBeGreaterThan(.2);
   const dx=FISHING_WATER_TARGET[0]-from[0],dz=FISHING_WATER_TARGET[2]-from[1];
   expect((Math.sin(facing)*dx+Math.cos(facing)*dz)/Math.hypot(dx,dz)).toBeGreaterThan(.999);
   const splash=segment.fx.find(f=>f.id==='splash'&&Math.abs(f.start-(clip.start+clip.dur*.3))<.001)!;
   expect(splash.at).toEqual([...FISHING_WATER_TARGET]);
   expect(Math.hypot(splash.at[0]+8,splash.at[2]-10)).toBeLessThan(pondRadius(Math.atan2(splash.at[2]-10,splash.at[0]+8)));
   const offset=timeline.segments.find(s=>s.segment===segment)!.offset;
   const before=evaluate(timeline,offset+clip.start+clip.dur*.69),after=evaluate(timeline,offset+clip.start+clip.dur*.71);
   expect(before.props.fishing_rod.attachedTo).toBe('bear');expect(before.props.fish.attachedTo).toBeNull();
   expect(after.props.fishing_rod.attachedTo).toBeNull();expect(after.props.fish.attachedTo).toBe('bear');
   expect(after.actors.bear.holding).toBe('fish');
  }
 });
 it('joins the actual rod tip to a float on water across hand movement and deterministic seeking',()=>{
  const materials=createMaterials(),props=createProps(materials),socket=new THREE.Object3D();
  const frame=restFrame({pos:[MARKS.pier.pos[0],0,MARKS.pier.pos[1]],yaw:MARKS.pier.facing,verb:'fish',posture:'sit'});
  const states={fishing_rod:{visible:true,pos:[0,0,0],attachedTo:'bear'}} as Record<PropId,PropFrame>;
  const rod=props.objects.fishing_rod,line=rod.getObjectByName('fishing-line')!,float=rod.getObjectByName('fishing-float')!;
  for(const y of [1.3,1.5,.9,1.3]){
   socket.position.set(-5.5,y,9.5);socket.updateMatrixWorld(true);
   props.apply(states,{bear:socket},{bear:frame.yaw},{bear:frame});props.root.updateMatrixWorld(true);
   const actual=float.getWorldPosition(new THREE.Vector3());expect(actual.distanceTo(new THREE.Vector3(...FISHING_WATER_TARGET))).toBeLessThan(1e-10);
   const a=line.localToWorld(new THREE.Vector3(0,-.5,0)),b=line.localToWorld(new THREE.Vector3(0,.5,0));
   const tip=rod.localToWorld(new THREE.Vector3(0,1.5,0));
   expect(Math.min(a.distanceTo(tip),b.distanceTo(tip))).toBeLessThan(1e-10);
   expect(Math.min(a.distanceTo(actual),b.distanceTo(actual))).toBeLessThan(1e-10);
  }
  props.dispose();disposeMaterials(materials);
 });
});
