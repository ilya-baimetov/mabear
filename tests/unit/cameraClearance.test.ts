import {describe,it,expect} from 'vitest';
import {clearForeground,INTERIOR_CAMERA_MAX_Y} from '../../src/engine/cameraClearance';
import {evaluate} from '../../src/engine/player/evaluate';
import type {CamKey} from '../../src/shared/schema';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {getFixture} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {sceneLocationAt} from '../../src/shared/bible/set';
import {houseWorld} from '../../src/shared/houseLayout';
const camera:CamKey={pos:[0,1,5],look:[0,.8,0],fov:35};
describe('foreground cast clearance',()=>{
 it('raises a low camera above an intervening bear while retaining the focal point',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.rival_bear,{opacity:1,pos:[0,0,3]});const c=clearForeground(camera,actors);expect(c.pos[1]).toBeGreaterThan(2.5);expect(c.look).toEqual(camera.look);expect(clearForeground(camera,actors)).toEqual(c);});
 it('does not treat the focal actor or offstage cast as obstructions',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.masha,{opacity:1,pos:[0,0,0]});expect(clearForeground(camera,actors)).toEqual(camera);});
 it('follows the evaluated carrier without changing the orbit or accumulating seek drift',()=>{
  const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;
  const authored:CamKey={pos:[-7,2.4,7],look:[-10,1.25,2],fov:45,location:'yard',followActor:'bear'},saved=structuredClone(authored);
  for(const pos of [[-12,0,1],[-12.6,0,.4],[-9.8,0,-2.5],[-6.3,0,.8],[-12,0,1]] as [number,number,number][]){
   Object.assign(actors.bear,{opacity:1,posture:'stand',pos});
   const result=clearForeground(authored,actors);
   expect(result.look).toEqual([pos[0],1.25,pos[2]]);
   expect(result.pos).toEqual([pos[0]+3,2.4,pos[2]+5]);
   expect(result.fov).toBe(authored.fov);expect(authored).toEqual(saved);
  }
  actors.bear.opacity=0;expect(clearForeground(authored,actors)).toEqual(authored);
 });
 it('keeps the actual Cozy evening location cut below the roof and caps a real indoor obstruction',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='walk_to'&&c.params.target==='house_living'))!;
  const entry=segment.segment.actorClips.masha.find(c=>c.verb==='walk_to'&&c.params.target==='house_living')!;
  let indoorFrames=0;
  // The house transition is now a scene cut, so an obstruction need not occur.
  // Check every actual indoor entry frame, then exercise a blocked indoor ray
  // separately instead of requiring the old route's accidental obstruction.
  for(let t=segment.offset+entry.start;t<segment.offset+entry.start+entry.dur;t+=1/60){
   const frame=evaluate(timeline,t);if(frame.camera.location!=='house')continue;indoorFrames++;
   const actors=Object.fromEntries(Object.entries(frame.actors).filter(([id,a])=>(!frame.cast||frame.cast.includes(id as keyof typeof frame.actors))&&sceneLocationAt(a.pos[0],a.pos[2])==='house'));
   const result=clearForeground(frame.camera,actors as typeof frame.actors);
   expect(result.pos[1]).toBeLessThanOrEqual(INTERIOR_CAMERA_MAX_Y);
   expect(result.look).toEqual(frame.camera.look);expect(result.pos[0]).toBe(frame.camera.pos[0]);expect(result.pos[2]).toBe(frame.camera.pos[2]);
   // Legacy camera keys without an explicit location get the same indoor bound.
   expect(clearForeground({...frame.camera,location:undefined},actors as typeof frame.actors).pos[1]).toBeLessThanOrEqual(INTERIOR_CAMERA_MAX_Y);
  }
  expect(indoorFrames).toBeGreaterThan(10);
  const local=houseWorld([1,.5]),actors=evaluate({segments:[],duration:0},0).actors;
  for(const a of Object.values(actors))a.opacity=0;
  Object.assign(actors.rival_bear,{opacity:1,pos:[local[0],0,local[1]+1],posture:'stand'});
  const blocked:CamKey={pos:[local[0],1,local[1]+2],look:[local[0],.8,local[1]-.8],fov:35,location:'house'};
  const cleared=clearForeground(blocked,actors);
  expect(cleared.pos[1]).toBeGreaterThan(blocked.pos[1]);
  expect(cleared.pos[1]).toBeLessThanOrEqual(INTERIOR_CAMERA_MAX_Y);
  expect(cleared.look).toEqual(blocked.look);
 });
});
