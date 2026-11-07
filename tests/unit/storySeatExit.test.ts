import {describe,it,expect} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {initialWorldState} from '../../src/compiler/worldState';
import {DEFAULT_REMIX,type Beat,type BeatScript} from '../../src/shared/schema';

const beat=(verb:Beat['verb'],target:Beat['target']=null):Beat=>({actor:'masha',verb,target,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'auto'});
const script=(beats:Beat[]):BeatScript=>({summary:'Masha gets up',time_of_day:null,mood:'calm',music:{mood:'calm',intensity:'soft',change:'continue'},ambience:null,rule_hits:[],beats});
describe('furniture exit in compiled stories',()=>{
 it('moves Masha beyond the armchair before lowering her and starts the following walk there',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments[2],clips=segment.segment.actorClips.masha,up=clips.find(c=>c.verb==='stand_up')!;
  expect(clips.filter(c=>c.verb==='stand_up')).toHaveLength(1);
  expect(up.params.target).toBe('house_living');
  expect(up.params.to![1]-up.params.from![1]).toBeCloseTo(.9,5);
  const middle=evaluate(timeline,segment.offset+up.start+up.dur*.5).actors.masha;
  // The cushion front is 0.48m ahead of the mark. Include a 0.12m
  // pelvis/cloth margin rather than asserting the compiler's own endpoint.
  expect(middle.pos[2]+middle.hipsOffset[2]-.12).toBeGreaterThan(-5.8+.48);
  const walk=clips.find(c=>c.verb==='walk_to'&&c.start>=up.start+up.dur-1e-5)!;
  expect(walk.params.from).toEqual(up.params.to);
  const camera=evaluate(timeline,segment.offset+up.start+up.dur*.5).camera;
  expect(camera.location).toBe('house');
  expect(camera.pos[0]).toBeGreaterThan(-9.4);
  expect(camera.pos[0]).toBeLessThan(-2.6);
  expect(camera.pos[2]).toBeGreaterThan(camera.look[2]);
  expect(evaluate(timeline,segment.offset+up.start+up.dur*.5).actors.masha).toEqual(middle);
 });
 it('persists an automatically inserted bench exit into the next paragraph',()=>{
  const state=initialWorldState();state.actors.masha={...state.actors.masha,pos:[2,3],mark:'bench',facing:Math.PI,posture:'sit'};
  const {timeline}=compileEpisode([
   {paragraphId:'a',version:1,beatScript:script([beat('jump')]),remix:DEFAULT_REMIX},
   {paragraphId:'b',version:1,beatScript:script([beat('wave')]),remix:DEFAULT_REMIX},
  ],'en',state);
  const first=timeline.segments[0].segment,up=first.actorClips.masha.find(c=>c.verb==='stand_up')!;
  // The neighbouring table constrains the step; the bench is only 0.38m
  // deep, so the walkable target must still clear its front edge.
  expect(up.params.to![1]).toBeLessThan(3-.19);
  expect(Math.hypot(up.params.to![0]-2,up.params.to![1]-1.5)).toBeGreaterThanOrEqual(1.2-1e-6);
  expect(first.endState.actors.masha.pos).toEqual(up.params.to);
  expect(first.endState.actors.masha.mark).toBe(null);
  expect(timeline.segments[1].segment.startState.actors.masha.pos).toEqual(up.params.to);
 });
 it('does not introduce a furniture step for a character sitting on the ground',()=>{
  const state=initialWorldState();state.actors.masha.posture='sit';state.actors.masha.mark='clearing';
  const {timeline}=compileEpisode([{paragraphId:'a',version:1,beatScript:script([beat('stand_up')]),remix:DEFAULT_REMIX}],'en',state);
  expect(timeline.segments[0].segment.actorClips.masha.find(c=>c.verb==='stand_up')!.params.to).toBeUndefined();
 });
});
