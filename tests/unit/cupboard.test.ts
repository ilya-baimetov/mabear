import {describe,it,expect} from 'vitest';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {CUPBOARD_TEXTS,CUPBOARD_RU} from '../../scripts/cupboard-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {initialWorldState,worldStateDigest} from '../../src/compiler/worldState';
import {materialDigest} from '../../src/app/store';
import {WorldStateSchema,SegmentSchema,type Timeline} from '../../src/shared/schema';
import {sceneLocationAt} from '../../src/shared/bible/set';

const finish=(tl:Timeline)=>evaluate(tl,tl.duration);
const cupboardCues=(tl:Timeline)=>tl.segments.flatMap(({segment,offset})=>(segment.objectCues??[]).filter(c=>c.object==='kitchen_cupboard').map(c=>({...c,start:c.start+offset})));

describe('cupboard in actual text stories',()=>{
 it.each([['en',CUPBOARD_TEXTS],['ru',CUPBOARD_RU]] as const)('%s opens, retrieves one jar, closes and carries it into the living room',(lang,texts)=>{
  const tl=textStory([...texts],lang),cues=cupboardCues(tl);
  for(const {segment} of tl.segments)expect(SegmentSchema.safeParse(segment).success).toBe(true);
  expect(cues.map(c=>c.to)).toEqual([1,0]);
  let attached=false,transfers=0;
  for(let t=0;t<=tl.duration;t+=.043){
   const f=evaluate(tl,t),held=f.props.pantry_honey.attachedTo==='bear';
   if(held!==attached){transfers++;attached=held;expect(f.objects!.kitchen_cupboard).toBe(1);}
   if(f.actors.bear.verb==='take'&&f.actors.bear.pickup?.item==='pantry_honey'){
    expect(f.camera.location).toBe('house');expect(sceneLocationAt(f.actors.bear.pos[0],f.actors.bear.pos[2])).toBe('house');
   }
   expect(f.props.pantry_honey.visible).toBe(true);
   expect(f.props.honey_pot.attachedTo).toBeNull(); // outdoor honey remains a different object
  }
  expect(transfers).toBe(1);
  const closing=tl.segments[1],endOfAction=closing.offset+cues[1].dur+cues[1].start-closing.offset;
  expect(evaluate(tl,closing.offset+closing.segment.duration-.001).camera).toEqual(evaluate(tl,endOfAction-.001).camera);
  const final=finish(tl);expect(final.objects!.kitchen_cupboard).toBe(0);expect(final.props.pantry_honey.attachedTo).toBe('bear');
  expect(final.actors.bear.holding).toBe('pantry_honey');expect(final.camera.location).toBe('house');
 });
 it.each(['Bear takes something out of the cupboard. Bear closes it.','Bear opens the cupboard door, takes a jar of honey and closes it.'])('understands %s',(text)=>{
  const tl=textStory([text]);expect(cupboardCues(tl).map(c=>c.to)).toEqual([1,0]);expect(finish(tl).props.pantry_honey.attachedTo).toBe('bear');
 });
 it('continues the same object across scene boundaries and does not manufacture a second jar',()=>{
  const tl=textStory(['Bear opens the cupboard.','Bear takes a jar of honey.','Bear closes it.','Bear opens the cupboard and takes another jar of honey.']);
  expect(cupboardCues(tl).map(c=>c.to)).toEqual([1,0,1]);
  expect(tl.segments.flatMap(s=>s.segment.actorClips.bear).filter(c=>c.verb==='take'&&c.params.item==='pantry_honey')).toHaveLength(1);
  expect(finish(tl).props.pantry_honey.attachedTo).toBe('bear');
  const reopen=tl.segments[3],clip=reopen.segment.actorClips.bear.find(c=>c.verb==='open')!;
  const f=evaluate(tl,reopen.offset+clip.start+clip.dur*.5);
  expect(f.actors.bear.objectContact?.side).toBe(1); // free left paw; jar remains in the right
 });
 it('does not steal the jar from a different actor',()=>{
  const ws=initialWorldState();ws.props.pantry_honey.at='masha';ws.actors.masha.holding='pantry_honey';
  const tl=textStory(['Bear opens the cupboard and takes a jar of honey.'],'en',ws);
  expect(finish(tl).props.pantry_honey.attachedTo).toBe('masha');expect(finish(tl).actors.bear.holding).toBeNull();
 });
 it('does not refill a consumed jar or stuff a previously held item into the occupied shelf',()=>{
  const gone=initialWorldState();gone.props.pantry_honey.at='hidden';
  expect(finish(textStory(['Bear takes honey from the cupboard.'],'en',gone)).props.pantry_honey.visible).toBe(false);
  const holding=initialWorldState();holding.props.book.at='bear';holding.actors.bear.holding='book';
  const tl=textStory(['Bear opens the cupboard and takes honey. Bear closes it.'],'en',holding),end=tl.segments.at(-1)!.segment.endState;
  expect(end.props.book.at).toBe('house_kitchen');expect(end.props.pantry_honey.at).toBe('bear');
 });
 it('does not stretch Masha to an upper cupboard she cannot reach',()=>{
  const tl=textStory(['Masha opens the cupboard, takes honey from the cupboard and closes it.']);
  expect(cupboardCues(tl)).toHaveLength(0);expect(finish(tl).props.pantry_honey.attachedTo).toBeNull();
 });
 it('reconstructs door, jar and actors identically after forward/backward seeks and replay',()=>{
  const tl=textStory(CUPBOARD_TEXTS),cues=cupboardCues(tl),scene=tl.segments[1],take=scene.segment.actorClips.bear.find(c=>c.verb==='take')!;
  const attachment=scene.offset+take.start+take.dur/2;
  const times=[0,cues[0].start+.3,attachment-.0001,attachment+.0001,cues[1].start+.4,tl.duration];
  const expected=times.map(t=>evaluate(tl,t));
  for(const i of [5,1,4,0,3,2,5,0,1,2,3,4,5])expect(evaluate(tl,times[i])).toEqual(expected[i]);
  expect(expected[2].props.pantry_honey.attachedTo).toBeNull();expect(expected[3].props.pantry_honey.attachedTo).toBe('bear');
 });
 it('removing or replacing the cupboard scene resets the jar and panel',()=>{
  const before=textStory(CUPBOARD_TEXTS),removed=textStory([CUPBOARD_TEXTS[0],CUPBOARD_TEXTS[2]]),edited=textStory([CUPBOARD_TEXTS[0],'Bear waves.',CUPBOARD_TEXTS[2]]);
  expect(finish(before).props.pantry_honey.attachedTo).toBe('bear');
  for(const tl of [removed,edited]){expect(finish(tl).objects!.kitchen_cupboard).toBe(0);expect(finish(tl).props.pantry_honey.attachedTo).toBeNull();}
  const a=initialWorldState(),open=structuredClone(a),taken=structuredClone(a);open.objects={house_door:0,kitchen_cupboard:1};taken.props.pantry_honey.at='house_living';
  for(const ws of [open,taken]){expect(worldStateDigest(ws)).not.toBe(worldStateDigest(a));expect(materialDigest(ws)).not.toBe(materialDigest(a));}
 });
 it('loads a world saved before the cupboard existed',()=>{
  const old:any=initialWorldState();delete old.props.pantry_honey;delete old.objects;
  const restored=WorldStateSchema.parse(old);expect(restored.props.pantry_honey.at).toBe('cupboard');
  const tl=textStory(['Bear takes honey from the cupboard.'],'en',old);expect(finish(tl).props.pantry_honey.attachedTo).toBe('bear');
 });
 it('repeated opening is idempotent and does not reset the entrance door',()=>{
  const tl=textStory(['Bear enters the house and closes the door.','Bear opens the cupboard.','Bear opens the cupboard.','Bear closes the cupboard.']);
  expect(cupboardCues(tl).map(c=>c.to)).toEqual([1,0]);expect(finish(tl).objects!.house_door).toBe(0);
 });
});
