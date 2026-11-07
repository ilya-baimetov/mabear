import {describe,it,expect} from 'vitest';
import {clearForeground,INTERIOR_CAMERA_MAX_Y} from '../../src/engine/cameraClearance';
import {evaluate} from '../../src/engine/player/evaluate';
import type {CamKey} from '../../src/shared/schema';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {getFixture} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {sceneLocationAt} from '../../src/shared/bible/set';
const camera:CamKey={pos:[0,1,5],look:[0,.8,0],fov:35};
describe('foreground cast clearance',()=>{
 it('raises a low camera above an intervening bear while retaining the focal point',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.rival_bear,{opacity:1,pos:[0,0,3]});const c=clearForeground(camera,actors);expect(c.pos[1]).toBeGreaterThan(2.5);expect(c.look).toEqual(camera.look);expect(clearForeground(camera,actors)).toEqual(c);});
 it('does not treat the focal actor or offstage cast as obstructions',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.masha,{opacity:1,pos:[0,0,0]});expect(clearForeground(camera,actors)).toEqual(camera);});
 it('keeps Cozy evening entry clearance below the roof instead of jumping to 5.3 m',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  let raised=0;
  // During this actual sample transition Bear crosses the foreground. Outdoor
  // clearance formerly lifted the camera through the wooden ceiling for ~0.6 s.
  for(let t=8.9;t<10.5;t+=1/60){
   const frame=evaluate(timeline,t);if(frame.camera.location!=='house')continue;
   const actors=Object.fromEntries(Object.entries(frame.actors).filter(([id,a])=>(!frame.cast||frame.cast.includes(id as keyof typeof frame.actors))&&sceneLocationAt(a.pos[0],a.pos[2])==='house'));
   const result=clearForeground(frame.camera,actors as typeof frame.actors);
   expect(result.pos[1]).toBeLessThanOrEqual(INTERIOR_CAMERA_MAX_Y);
   expect(result.look).toEqual(frame.camera.look);expect(result.pos[0]).toBe(frame.camera.pos[0]);expect(result.pos[2]).toBe(frame.camera.pos[2]);
   if(result.pos[1]>frame.camera.pos[1]+.01)raised++;
   // Legacy camera keys without an explicit location get the same indoor bound.
   expect(clearForeground({...frame.camera,location:undefined},actors as typeof frame.actors).pos[1]).toBeLessThanOrEqual(INTERIOR_CAMERA_MAX_Y);
  }
  expect(raised).toBeGreaterThan(10);
 });
});
