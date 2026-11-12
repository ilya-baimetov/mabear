import {describe,it,expect} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX,type Beat,type BeatScript} from '../../src/shared/schema';
import {isInsideHouse} from '../../src/shared/bible/set';
import {HOUSE_CHILD_COOK_POSITION,HOUSE_PREP_TABLE,housePickupPosition} from '../../src/shared/houseLayout';
import {cookingSupportHeightAt} from '../../src/shared/cookingStation';
import {propPlacementAtMark} from '../../src/shared/propPlacement';
const beat=(actor:Beat['actor'],verb:Beat['verb'],target:Beat['target'],item:Beat['item']=null):Beat=>({actor,verb,target,item,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'auto'});
const script=(beats:Beat[]):BeatScript=>({summary:'Cooking together',time_of_day:'day',mood:'calm',music:{mood:'calm',intensity:'soft',change:'continue'},ambience:null,rule_hits:[],beats});
describe('integrated house story continuity',()=>{
 it('keeps a shared pan with exactly one holder across a kitchen takeover and next scene',()=>{
  const scripts=[script([beat('bear','cook','house_kitchen')]),script([beat('masha','cook','house_kitchen')]),script([beat('masha','take','pancakes','pancakes')])];
  const {timeline,results}=compileEpisode(scripts.map((beatScript,i)=>({paragraphId:`p${i}`,version:1,beatScript,remix:DEFAULT_REMIX})),'en');
  expect(results[1].segment.endState.actors.bear.holding).toBe(null);
  expect(results[1].segment.endState.props.frying_pan.at).toBe('masha');
  const final=evaluate(timeline,timeline.duration-.01);
  expect(final.props.frying_pan.attachedTo).toBe(null);
  expect(final.actors.bear.holding).not.toBe('frying_pan');
  expect(final.props.frying_pan.pos[1]).toBeCloseTo(HOUSE_PREP_TABLE.height);
  const cook=results[1].segment.actorClips.masha.find(c=>c.verb==='cook')!;
  expect(cook.params.from).toEqual(HOUSE_CHILD_COOK_POSITION);
  expect(cookingSupportHeightAt(...cook.params.from!)).toBeCloseTo(.8);
  const food=propPlacementAtMark('pancakes','house_kitchen');
  expect(food.pos[1]).toBe(HOUSE_PREP_TABLE.height);
  expect(isInsideHouse(food.pos[0],food.pos[2])).toBe(true);
 });
 it.each(['pancakes','frying_pan','flour_bag','jam_jar','cake'] as const)('provides real supported access to the %s at the kitchen edge',(item)=>{
  const stance=housePickupPosition(item),prop=propPlacementAtMark(item,'house_kitchen');
  expect(cookingSupportHeightAt(...stance)).toBeCloseTo(.8);
  expect(Math.hypot(stance[0]-prop.pos[0],stance[1]-prop.pos[2])).toBeLessThan(.33);
 });
 it.each(['en','ru'] as const)('moves the server aside before the seated child exits in %s Cozy evening',(lang)=>{
  const f=getFixture('cozy_evening',lang)!;
  const {timeline}=compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang);
  const pickup=timeline.segments.flatMap(s=>s.segment.actorClips.bear).find(c=>c.verb==='take'&&c.params.item==='pancakes')!;
  expect(cookingSupportHeightAt(...pickup.params.from!),'adult pickup must remain on the floor').toBe(0);
  expect(pickup.params.pickUpAt).toBe('house_kitchen');
  const s=timeline.segments.at(-1)!,up=s.segment.actorClips.masha.find(c=>c.verb==='stand_up')!;
  for(let u=.1;u<.95;u+=.05){
   const frame=evaluate(timeline,s.offset+up.start+up.dur*u),a=frame.actors.masha,b=frame.actors.bear;
   expect(Math.hypot(a.pos[0]-b.pos[0],a.pos[2]-b.pos[2])).toBeGreaterThan(.72);
  }
 });
 it.each(['en','ru']as const)('visibly puts down the occupied pan before reaching for pancakes in %s',(lang)=>{
  const fixture=getFixture('cozy_evening',lang)!,{timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`replace-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang);
  const segment=timeline.segments.find(s=>s.segment.actorClips.bear.some(c=>c.params.pickUpAt&&c.params.item==='pancakes'))!,clips=segment.segment.actorClips.bear;
  const pickup=clips.find(c=>c.params.pickUpAt&&c.params.item==='pancakes')!,putDown=clips.find(c=>c.params.putDown&&c.params.item==='frying_pan')!;
  expect(putDown).toBeDefined();expect(putDown.start+putDown.dur).toBeLessThan(pickup.start);
  expect(cookingSupportHeightAt(...putDown.params.from!)).toBe(0);
  const before=evaluate(timeline,segment.offset+putDown.start+putDown.dur*.49),after=evaluate(timeline,segment.offset+putDown.start+putDown.dur*.51);
  const releaseCamera=segment.segment.camera.find(c=>c.start<=putDown.start+putDown.dur*.5&&c.start+c.dur>putDown.start+putDown.dur*.5)!;
  expect(releaseCamera.overridden,'the visible preparation needs its own camera interval').toBe(true);
  expect(releaseCamera.shot).toBe('medium');
  expect(before.actors.bear.holding).toBe('frying_pan');expect(before.props.frying_pan.attachedTo).toBe('bear');
  expect(after.actors.bear.holding).toBeNull();expect(after.props.frying_pan.attachedTo).toBeNull();expect(after.props.frying_pan.pos[1]).toBeCloseTo(HOUSE_PREP_TABLE.height);
  for(const k of [.01,.4,.49]){
   const frame=evaluate(timeline,segment.offset+pickup.start+pickup.dur*k);
   expect(frame.actors.bear.holding).toBeNull();expect(frame.props.frying_pan.attachedTo).toBeNull();
  }
  expect(evaluate(timeline,segment.offset+pickup.start+pickup.dur*.51).actors.bear.holding).toBe('pancakes');
 });
 it('moves the former chair occupant aside before Bear uses the front mounting corridor',()=>{
  const scripts=[script([beat('masha','sit','house_living'),beat('bear','walk_to','house_kitchen')]),script([beat('masha','stand_up',null),beat('bear','walk_to','house_living'),beat('bear','sit','house_living'),beat('masha','walk_to','house_kitchen')])];
  const {timeline}=compileEpisode(scripts.map((beatScript,i)=>({paragraphId:`chair-turn-${i}`,version:1,beatScript,remix:DEFAULT_REMIX})),'en'),segment=timeline.segments[1],mount=segment.segment.actorClips.bear.find(c=>c.verb==='sit')!;
  expect(segment.segment.actorClips.masha.some(c=>c.verb==='walk_to'&&!c.params.target&&c.start+c.dur<=mount.start)).toBe(true);
  for(let k=0;k<=1;k+=.025){
   const frame=evaluate(timeline,segment.offset+mount.start+mount.dur*k),a=frame.actors.masha,b=frame.actors.bear;
   expect(Math.hypot(a.pos[0]-b.pos[0],a.pos[2]-b.pos[2]),`waiting child clearance at ${k}`).toBeGreaterThan(.95);
  }
 });
});
