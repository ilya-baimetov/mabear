import {describe,it,expect} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {parseParagraph} from '../../src/director/offline/parser';
import {initialWorldState} from '../../src/compiler/worldState';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {evaluate} from '../../src/engine/player/evaluate';
import {MARKS,sceneLocationAt} from '../../src/shared/bible/set';
import {cameraAt} from '../../src/compiler/camera';

describe('separate story locations',()=>{
 it('keeps persistent marks in the correct rendered location',()=>{
  for(const [mark,scene] of [['clearing','yard'],['house_kitchen','house'],['house_living','house'],['pier','pond'],['pond_shore','pond'],['van','wolves']] as const)
   expect(sceneLocationAt(...MARKS[mark].pos)).toBe(scene);
 });
 it('uses a brief hidden handoff when going to the pond, and cuts the camera without flying across the yard',()=>{
  const {timeline}=compileEpisode([{paragraphId:'p',version:1,remix:DEFAULT_REMIX,beatScript:parseParagraph('Bear walks to the pier and goes fishing.','en',initialWorldState())}],'en');
  const seg=timeline.segments[0].segment,walk=seg.actorClips.bear.find(c=>c.verb==='walk_to'&&c.params.target==='pier')!;
  expect(walk.params.sceneCut).toBe(true);expect(walk.dur).toBeLessThanOrEqual(1);
  for(const [progress,place] of [[.25,'yard'],[.75,'pond']] as const){
   const frame=evaluate(timeline,walk.start+walk.dur*progress);
   expect(sceneLocationAt(frame.actors.bear.pos[0],frame.actors.bear.pos[2])).toBe(place);
  }
  const midpoint=evaluate(timeline,walk.start+walk.dur*.5);
  expect(midpoint.actors.bear.opacity).toBeLessThan(.001);
  const cut=seg.camera.find(c=>c.from.location!==c.to.location)!;expect(cut).toBeDefined();
  expect(cameraAt([cut],cut.cutAt!-.001)).toEqual(cut.from);
  expect(cameraAt([cut],cut.cutAt!+.001)).toEqual(cut.to);
  expect(evaluate(timeline,cut.cutAt!-.001).camera.location).toBe(cut.from.location);
  expect(evaluate(timeline,cut.cutAt!+.001).camera.location).toBe(cut.to.location);
 });
});
