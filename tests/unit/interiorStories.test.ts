import {describe,it,expect} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {compile,standPos} from '../../src/compiler/compile';
import {initialWorldState} from '../../src/compiler/worldState';
import {EMPTY_CARRY} from '../../src/compiler/audioCues';
import {parseParagraph} from '../../src/director/offline/parser';
import {getFixture} from '../../src/director/fixtures';
import {isInsideHouse,MARKS} from '../../src/shared/bible/set';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import {planPath} from '../../src/compiler/path';
import {evaluate} from '../../src/engine/player/evaluate';
import {SEAT_HEIGHT} from '../../src/engine/motion/verbs/common';

describe('usable house stories',()=>{
 it.each([
  ['en','Bear cooks pancakes in the kitchen.','house_kitchen','cook'],
  ['en','Masha sits in the living room.','house_living','sit'],
  ['ru','Медведь готовит блины на кухне.','house_kitchen','cook'],
  ['ru','Маша садится в кресло в гостиной.','house_living','sit'],
 ] as const)('parses %s authored indoor action: %s',(lang,text,target,verb)=>{
  const parsed=parseParagraph(text,lang,initialWorldState());
  expect(parsed.beats.some(b=>b.verb===verb&&b.target===target)).toBe(true);
  const compiled=compile(parsed,initialWorldState(),{paragraphId:'indoor',version:1,lang,remix:DEFAULT_REMIX,isFirst:true,carry:EMPTY_CARRY});
  const actor=verb==='cook'?'bear':'masha';
  expect(compiled.segment.endState.actors[actor].mark).toBe(target);
  expect(compiled.segment.endState.actors[actor].posture).not.toBe('offstage');
  if(verb==='cook')expect(compiled.segment.endState.props.pancakes.at).toBe('house_kitchen');
 });
 it.each([['en','Bear cooks inside the house.'],['ru','Медведь готовит дома.']] as const)('keeps general %s home cooking indoors',(lang,text)=>{
  const bs=parseParagraph(text,lang,initialWorldState());
  const {timeline}=compileEpisode([{paragraphId:'home',version:1,remix:DEFAULT_REMIX,beatScript:bs}],lang);
  expect(timeline.segments[0].segment.endState.actors.bear.mark).toBe('house_kitchen');
  expect(timeline.segments[0].segment.endState.props.pancakes.at).toBe('house_kitchen');
 });
 it('routes both boundary crossings through the door, never through a side wall',()=>{
  for(const outside of [[0,0],[-12,-7],[0,-12]] as [number,number][]){
   for(const mark of ['house_kitchen','house_living'] as const){
    const inside=standPos(mark);expect(inside).toEqual(MARKS[mark].pos);
    for(const path of [planPath(outside,inside),planPath(inside,outside)]){
     expect(path).toContainEqual(MARKS.door.pos);
     for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      if(isInsideHouse(...a)!==isInsideHouse(...b))expect(a[0]).toBe(-6);
     }
    }
   }
  }
 });
 it.each(['en','ru'] as const)('plays the %s indoor sample inside, eats there, and returns outside',(lang)=>{
  const fixture=getFixture('cozy_evening',lang)!;
  const {results,timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang);
  expect(results.flatMap(r=>r.errors)).toEqual([]);
  expect(results[0].segment.endState.actors.bear.mark).toBe('house_kitchen');
  expect(results[0].segment.endState.actors.masha.mark).toBe('house_living');
  expect(results[0].segment.endState.props.pancakes.at).toBe('house_kitchen');
  const pickup=results[1].segment.actorClips.bear.find(c=>c.verb==='take')!;
  const pickupFrame=evaluate(timeline,timeline.segments[1].offset+pickup.start+pickup.dur*.51);
  expect(pickupFrame.props.pancakes.attachedTo).toBe('bear');
  expect(pickupFrame.props.frying_pan.attachedTo).toBeNull();
  const eat=results[1].segment.actorClips.masha.find(c=>c.verb==='eat')!;
  const frame=evaluate(timeline,timeline.segments[1].offset+eat.start+eat.dur*.45);
  expect(isInsideHouse(frame.actors.masha.pos[0],frame.actors.masha.pos[2])).toBe(true);
  expect(frame.actors.masha.posture).toBe('sit');
  expect(frame.actors.masha.opacity).toBe(1);
  expect(SEAT_HEIGHT.house_living).toBe(.47);
  expect(frame.camera.pos[2]).toBeGreaterThan(frame.camera.look[2]);
  for(const actor of ['masha','bear'] as const){
   const end=results[2].segment.endState.actors[actor];
   expect(isInsideHouse(...end.pos)).toBe(false);expect(end.posture).toBe('stand');
  }
 });
});
