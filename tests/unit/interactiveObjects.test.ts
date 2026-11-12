import {describe,it,expect} from 'vitest';
import {textStory,ENTRY_TEXT,ENTRY_RU,objectStories} from '../../scripts/interactive-objects-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {sceneLocationAt} from '../../src/shared/bible/set';
import {SegmentSchema} from '../../src/shared/schema';
import {initialWorldState,worldStateDigest} from '../../src/compiler/worldState';
import {materialDigest} from '../../src/app/store';

describe('interactive house stories',()=>{
 it.each([['en',ENTRY_TEXT],['ru',ENTRY_RU]] as const)('shows %s approach, opening and interior continuation',(lang,text)=>{
  const tl=textStory([text],lang),seg=tl.segments[0].segment;
  expect(SegmentSchema.safeParse(seg).success).toBe(true);
  expect(seg.endState.actors.bear.posture).toBe('stand');
  expect(sceneLocationAt(...seg.endState.actors.bear.pos)).toBe('house');
  let opening=false,exteriorCross=false,inside=false;
  for(let t=0;t<tl.duration;t+=.025){
    const f=evaluate(tl,t),a=f.actors.bear,place=sceneLocationAt(a.pos[0],a.pos[2]);
    expect(a.opacity).toBe(1);
    if(f.objects!.house_door>0&&f.objects!.house_door<1)opening=true;
    if(a.pos[2]<-4.8&&place==='yard'){exteriorCross=true;expect(f.objects!.house_door).toBeCloseTo(1);}
    if(place==='house'){inside=true;expect(f.camera.location).toBe('house');}
  }
  expect([opening,exteriorCross,inside]).toEqual([true,true,true]);
 });
 it('only approaching the door does not hide Bear or open it',()=>{
  const tl=textStory(['Bear walks to the door.']),f=evaluate(tl,tl.duration);
  expect(f.actors.bear.opacity).toBe(1);expect(f.actors.bear.posture).toBe('stand');expect(f.objects!.house_door).toBe(0);
 });
 it('resolves comes in after opening the door in an earlier scene',()=>{
  const tl=textStory(['Bear opens the door.','Bear comes in.']);
  expect(tl.segments[0].segment.endState.actors.bear.mark).toBe('door');
  const f=evaluate(tl,tl.duration);expect(sceneLocationAt(f.actors.bear.pos[0],f.actors.bear.pos[2])).toBe('house');
  expect(f.actors.bear.opacity).toBe(1);
 });
 it('operates the cupboard independently of the entrance door',()=>{
  const tl=textStory(['Bear enters the house. Bear closes the door.','Bear opens the cupboard.']);
  expect(evaluate(tl,tl.duration).objects).toEqual({house_door:0,kitchen_cupboard:1});
 });
 it('persists open/closed state, supports repeated requests and is independent of seek order',()=>{
  const tl=textStory(['Bear opens the door.','Bear opens the door.','Bear closes the door.']);
  expect(tl.segments[1].segment.startState.objects?.house_door).toBe(1);
  expect(tl.segments[1].segment.objectCues??[]).toHaveLength(0);
  const times=[0,tl.segments[1].offset-.3,tl.segments[2].offset,tl.duration];
  const expected=times.map(t=>evaluate(tl,t));
  for(const i of [3,0,2,1,3,1])expect(evaluate(tl,times[i])).toEqual(expected[i]);
  expect(expected.at(-1)!.objects!.house_door).toBe(0);
 });
 it('removing an opening scene removes its persistent state; state changes invalidate both caches',()=>{
  const before=textStory(['Bear opens the door.','Bear waves.']),after=textStory(['Bear waves.']);
  expect(evaluate(before,before.duration).objects!.house_door).toBe(1);
  expect(evaluate(after,after.duration).objects!.house_door).toBe(0);
  const a=initialWorldState(),b=structuredClone(a);b.objects={house_door:1};
  expect(worldStateDigest(a)).not.toBe(worldStateDigest(b));expect(materialDigest(a)).not.toBe(materialDigest(b));
 });
 it('continues holding the same book through the threshold and later interior action',()=>{
  const tl=objectStories().held;
  for(let t=0;t<tl.duration;t+=.071){const f=evaluate(tl,t);expect(f.props.book.attachedTo).toBe('bear');expect(f.actors.bear.opacity).toBe(1);}
 });
 it('reopens a closed door when leaving and finishes outside with the door closed',()=>{
  const tl=objectStories().roundtrip,f=evaluate(tl,tl.duration);
  expect(sceneLocationAt(f.actors.bear.pos[0],f.actors.bear.pos[2])).toBe('yard');
  expect(f.objects!.house_door).toBe(0);expect(f.actors.bear.opacity).toBe(1);
 });
 it('does not hide the cooking beat behind another actor entering in Cozy evening',()=>{
  const tl=objectStories().cozy,seg=tl.segments[0].segment,cook=seg.actorClips.bear.find(c=>c.verb==='cook')!;
  const lastCross=seg.actorClips.masha.find(c=>c.params.portal)!;
  expect(cook.start).toBeGreaterThan(lastCross.start+lastCross.dur);
  const f=evaluate(tl,cook.start+cook.dur*.5);
  expect(f.camera.location).toBe('house');
  expect(Math.hypot(f.camera.look[0]-f.actors.bear.pos[0],f.camera.look[2]-f.actors.bear.pos[2])).toBeLessThan(3.2);
 });
});
