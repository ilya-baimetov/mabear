import {splitCameraCue} from '../../src/compiler/camera';
import {describe,it,expect} from 'vitest';
import {compile} from '../../src/compiler/compile';
import {EMPTY_CARRY} from '../../src/compiler/audioCues';
import {DEFAULT_REMIX,type Beat,type BeatScript} from '../../src/shared/schema';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {CARROT_IDS,WorldStateSchema,SegmentSchema,type Timeline} from '../../src/shared/schema';
import {GARDEN_CARROTS,numberedCarrot} from '../../src/shared/gardenCarrots';
import {initialWorldState,worldStateDigest} from '../../src/compiler/worldState';
import {materialDigest} from '../../src/app/store';
import {evaluate} from '../../src/engine/player/evaluate';
import {PROP_CONTACTS} from '../../src/shared/propContacts';
import {propGripWorld} from '../../src/shared/propPlacement';
const EN=['Masha picks carrot number 2 from the garden.','Masha walks to the bench and puts carrot number 2 on the bench.','Masha walks to the clearing.','Masha picks carrot number 2 from the bench. Masha waves.'];
const RU=['Маша берёт морковку номер 2 с грядки.','Маша идёт к скамейке и кладёт морковку номер 2 на скамейку.','Маша идёт на поляну.','Маша берёт морковку номер 2 со скамейки. Маша машет.'];
const final=(tl:Timeline)=>evaluate(tl,tl.duration);
describe('individually addressable garden carrots in actual text stories',()=>{
 it.each([['en',EN],['ru',RU]] as const)('%s harvests, places, leaves and retrieves the same carrot',(lang,texts)=>{
  const tl=textStory([...texts],lang);for(const {segment} of tl.segments)expect(SegmentSchema.safeParse(segment).success).toBe(true);
  const baseline=evaluate(tl,0),states=tl.segments.map(s=>s.segment.endState.props.carrot_2.at);
  expect(states).toEqual(['masha','bench','bench','masha']);
  expect(baseline.props.carrot_2.pos).toEqual(GARDEN_CARROTS[1].position);
  let transitions=0,owner=baseline.props.carrot_2.attachedTo;
  for(let t=0;t<=tl.duration;t+=.071){
   const f=evaluate(tl,t);expect(f.props.carrot_2.visible).toBe(true);
   if(owner!==f.props.carrot_2.attachedTo){transitions++;owner=f.props.carrot_2.attachedTo;}
   for(const id of CARROT_IDS.filter(id=>id!=='carrot_2'))expect(f.props[id]).toEqual(baseline.props[id]);
   if(f.actors.masha.pickup?.item==='carrot_2'){
    if(f.actors.masha.pickup.position[2]<-5)expect(f.actors.masha.pos[2]).toBeGreaterThanOrEqual(-5.291);
    const contact=f.actors.masha.pickup,grip=propGripWorld(contact.position,contact.rotation,PROP_CONTACTS.carrot_2.point);
    expect(Math.hypot(grip[0]-f.actors.masha.pos[0],grip[2]-f.actors.masha.pos[2])).toBeLessThan(.43);
   }
  }
  expect(transitions).toBe(3);expect(final(tl).props.carrot_2.attachedTo).toBe('masha');
  expect(tl.segments[2].segment.endState.props.carrot_2.planted).toBe(false);
 });
 it('moves ownership at the measured pickup and put-down contact, not at paragraph boundaries',()=>{
  const tl=textStory(EN);
  for(const {segment,offset} of tl.segments)for(const c of segment.actorClips.masha.filter(c=>c.params.item==='carrot_2'&&(c.verb==='take'||c.verb==='put_down'))){
   const t=offset+c.start+c.dur*.5,left=evaluate(tl,t-.00001),right=evaluate(tl,t+.00001);
   expect(left.props.carrot_2.attachedTo).toBe(c.verb==='take'?null:'masha');expect(right.props.carrot_2.attachedTo).toBe(c.verb==='take'?'masha':null);
   const target=c.verb==='take'?c.params.pickUpPosition:c.params.putDownPosition;
   expect(target).toEqual(c.verb==='take'?left.props.carrot_2.pos:right.props.carrot_2.pos);
  }
 });
 it('reconstructs planting and ownership across arbitrary seek order and replay',()=>{
  const tl=textStory(EN),times=Array.from({length:41},(_,i)=>tl.duration*i/40),expected=times.map(t=>evaluate(tl,t));
  for(const i of [40,3,30,5,20,0,39,18,1,40,0,...times.map((_,i)=>i)])expect(evaluate(tl,times[i])).toEqual(expected[i]);
 });
 it('scene replacement/deletion restores only the relevant object state',()=>{
  const original=textStory(EN),deleted=textStory(EN.slice(2)),edited=textStory(['Masha picks carrot number 3.',...EN.slice(1)]);
  expect(final(original).props.carrot_2.attachedTo).toBe('masha');
  expect(evaluate(deleted,0).props.carrot_2.pos).toEqual(GARDEN_CARROTS[1].position);
  expect(edited.segments[0].segment.endState.props.carrot_2.planted).toBe(true);
  const a=initialWorldState(),b=structuredClone(a);b.props.carrot_2={at:'bench',planted:false};
  expect(materialDigest(a)).not.toBe(materialDigest(b));expect(worldStateDigest(a)).not.toBe(worldStateDigest(b));
 });
 it('a harvested carrot placed in the garden lies loose and never replants',()=>{
  const tl=textStory(['Masha picks carrot number 2. Masha puts carrot number 2 in the garden.']);
  const f=final(tl);expect(f.props.carrot_2.attachedTo).toBeNull();expect(f.props.carrot_2.pos).not.toEqual(GARDEN_CARROTS[1].position);
  expect(tl.segments[0].segment.endState.props.carrot_2).toEqual({at:'garden',planted:false});
  const continued=textStory(['Masha waves.'],'en',tl.segments[0].segment.endState);expect(final(continued).props.carrot_2).toEqual(f.props.carrot_2);
 });
 it('never steals an owned carrot or regrows an explicitly numbered eaten carrot',()=>{
  const stolen=textStory(['Masha picks carrot number 2.','Hare takes carrot number 2.']);
  expect(final(stolen).props.carrot_2.attachedTo).toBe('masha');
  const eaten=textStory(['Masha eats carrot number 2.','Masha takes carrot number 2.']);
  expect(final(eaten).props.carrot_2.visible).toBe(false);expect(final(eaten).actors.masha.holding).toBeNull();
 });
 it('generic requests find an available carrot rather than resurrecting the first',()=>{
  const tl=textStory(['Hare eats a carrot.','Hare takes a carrot.']);
  expect(final(tl).props.carrot.visible).toBe(false);expect(final(tl).props.carrot_2.attachedTo).toBe('hare');
 });
 it('a new generic garden harvest leaves the previously placed carrot on the bench',()=>{
  const tl=textStory(['Masha picks a carrot from the garden. Masha puts it on the bench.','Masha picks a carrot from the garden.']);
  expect(final(tl).props.carrot.attachedTo).toBeNull();expect(tl.segments.at(-1)!.segment.endState.props.carrot.at).toBe('bench');
  expect(final(tl).props.carrot_2.attachedTo).toBe('masha');
 });
 it('refuses invalid identifiers and unowned placement without changing the crop',()=>{
  const ws=initialWorldState();
  for(const text of ['Masha picks carrot number 10.','Маша берёт морковку номер 10.','Masha puts carrot number 2 on the bench.']){
   const tl=textStory([text]);for(const id of CARROT_IDS)expect(tl.segments[0].segment.endState.props[id]).toEqual(ws.props[id]);
  }
 });
 it('refuses impossible pickup prerequisites instead of hanging the compiler',()=>{
  for(const verb of ['eat','give','throw','drop'] as const){
   const beat:Beat={actor:'masha',verb,item:'pantry_honey',target:verb==='give'?'bear':null,line:null,emote:null,sfx:null,emotion:'neutral',with_previous:false,delay_s:0,shot:'auto'};
   const bs:BeatScript={summary:'Impossible cupboard action',time_of_day:null,mood:'playful',music:{mood:'playful',intensity:'soft',change:'continue'},ambience:null,beats:[beat],rule_hits:[]};
   const r=compile(bs,initialWorldState(),{paragraphId:'p',version:1,lang:'en',remix:DEFAULT_REMIX,isFirst:true,carry:EMPTY_CARRY});
   expect(Number.isFinite(r.segment.duration)).toBe(true);expect(r.segment.endState.props.pantry_honey.at).toBe('cupboard');
  }
 });
 it('throwing or releasing the legacy first carrot cannot replant it at a scene boundary',()=>{
  for(const action of ['throws carrot number 1 to the garden','drops carrot number 1']){
   const tl=textStory([`Masha picks carrot number 1. Masha ${action}.`,'Masha waves.']);
   const first=tl.segments[0].segment.endState.props.carrot,second=tl.segments[1].segment.startState.props.carrot;
   expect(first).toEqual({at:'garden',planted:false});expect(second).toEqual(first);
   expect(final(tl).props.carrot.pos).not.toEqual(GARDEN_CARROTS[0].position);
  }
 });
 it.each([['en','Masha takes the ball. Masha drops it.'],['ru','Маша берёт мяч. Маша роняет его.']] as const)('%s typed ball drop is a release, not a throw',(lang,text)=>{
  const tl=textStory([text],lang),clips=tl.segments[0].segment.actorClips.masha;
  expect(clips.some(c=>c.verb==='drop'&&c.params.item==='ball')).toBe(true);expect(clips.some(c=>c.verb==='throw')).toBe(false);expect(final(tl).props.ball.attachedTo).toBeNull();
 });
 it('camera chunks continue a moving shot instead of restarting the move',()=>{
  const tl=textStory(['Masha waves.']),s=tl.segments[0].segment;
  s.duration=14;tl.duration=14;
  s.camera=splitCameraCue({start:0,dur:14,shot:'tracking',overridden:false,from:{pos:[0,2,8],look:[0,1,0],fov:40,location:'yard'},to:{pos:[8,3,5],look:[4,1,0],fov:45,location:'yard'}});
  for(const c of s.camera.slice(1)){
   const a=evaluate(tl,c.start-.0001).camera,b=evaluate(tl,c.start+.0001).camera;
   expect(Math.hypot(...a.pos.map((v,i)=>v-b.pos[i]))).toBeLessThan(.001);
  }
 });
 it('refuses an occupied bench slot and keeps the second carrot in the hand',()=>{
  const tl=textStory(['Masha picks carrot number 2. Masha puts it on the bench.','Masha picks carrot number 3. Masha puts it on the bench.']);
  const end=tl.segments.at(-1)!.segment.endState;
  expect(end.props.carrot_2.at).toBe('bench');expect(end.props.carrot_3.at).toBe('masha');
  expect(final(tl).props.carrot_3.attachedTo).toBe('masha');
 });
 it('makes the bench slot available after retrieving its carrot',()=>{
  const tl=textStory(['Masha picks carrot number 2. Masha puts it on the bench.','Masha takes carrot number 2. Masha puts it in the garden.','Masha picks carrot number 3. Masha puts it on the bench.']);
  expect(tl.segments.at(-1)!.segment.endState.props.carrot_2.at).toBe('garden');expect(tl.segments.at(-1)!.segment.endState.props.carrot_3.at).toBe('bench');
 });
 it('release near the bench does not send Masha back to the garden',()=>{
  const tl=textStory(['Masha picks carrot number 2. Masha walks to the bench.','Masha drops it.']);
  expect(tl.segments[1].segment.endState.props.carrot_2.at).toBe('bench');
  expect(tl.segments[1].segment.actorClips.masha.every(c=>!c.params.to||c.params.to[1]>0)).toBe(true);
 });
 it('clapping with a second carrot does not overlap the occupied bench slot',()=>{
  const tl=textStory(['Masha picks carrot number 2. Masha puts it on the bench.','Masha picks carrot number 3. Masha walks to the bench. Masha claps.']);
  const props=tl.segments.at(-1)!.segment.endState.props;
  expect(props.carrot_2.at).toBe('bench');expect(props.carrot_3.at).toBe('clearing');expect(props.carrot_3.planted).toBe(false);
  expect(final(tl).actors.masha.holding).toBeNull();
 });
 it('occupied-hand acquisition prerequisites terminate and preserve the held identity',()=>{
  for(const initial of ['Masha takes the ball.','Masha picks carrot number 2.'])for(const verb of ['eats','gives','throws','drops']){
   const text=`Masha ${verb} carrot number 3${verb==='gives'?' to Bear':verb==='throws'?' to the garden':''}.`;
   const tl=textStory([initial,text]);
   expect(Number.isFinite(tl.duration)).toBe(true);
   expect(final(tl).props[initial.includes('ball')?'ball':'carrot_2'].attachedTo).toBe('masha');
   expect(tl.segments.at(-1)!.segment.endState.props.carrot_3).toEqual({at:'garden',planted:true});
  }
 });
 it('foreign-item prerequisites while holding a carrot finish through a visible put-aside',()=>{
  for(const verb of ['eats','gives','throws','drops']){
   const item=verb==='drops'?'ball':'pancakes',text=`Masha ${verb} the ${item}${verb==='gives'?' to Bear':verb==='throws'?' to the clearing':''}.`;
   const tl=textStory(['Masha picks carrot number 2.',text]);
   expect(Number.isFinite(tl.duration)).toBe(true);
   expect(tl.segments.at(-1)!.segment.endState.props.carrot_2.planted).toBe(false);
   expect(tl.segments[1].segment.actorClips.masha.some(c=>c.params.putDown&&c.params.item==='carrot_2')).toBe(true);
  }
 });
 it('plants carrot crowns inside the soil rather than in the front board',()=>{
   // Soil front edge=-5.495; exposed orange crown radius is <5cm at this asset scale.
   for(const slot of GARDEN_CARROTS)expect(slot.position[2]+.05).toBeLessThan(-5.495);
 });
 it('approaches and leaves the bench around its front without walking through its seat',()=>{
  const tl=textStory(EN);
  for(let t=0;t<=tl.duration;t+=.031){
   const f=evaluate(tl,t),[x,,z]=f.actors.masha.pos;
   expect(x>1.10&&x<2.90&&z>2.77&&z<3.23,`bench footprint at ${t}: ${x},${z}`).toBe(false);
  }
  const arrival=tl.segments[1].segment.actorClips.masha.find(c=>c.verb==='walk_to'&&c.params.target==='bench');
  expect(arrival?.params.to?.[1]).toBeGreaterThanOrEqual(3.5);
 });
 it('reads ordinal and numbered names consistently',()=>{
  for(const s of ['second carrot','carrot number 2','carrot 2','вторую морковку','морковку номер 2'])expect(numberedCarrot(s)).toBe('carrot_2');
 });
 it('normalizes legacy saves additively without refilling missing/held first carrots',()=>{
  const old:any=initialWorldState();for(const id of CARROT_IDS.slice(1))delete old.props[id];delete old.props.carrot.planted;
  const parsed=WorldStateSchema.parse(old);expect(parsed.props.carrot.planted).toBe(true);expect(parsed.props.carrot_9.planted).toBe(true);
  old.props.carrot={at:'hidden'};expect(WorldStateSchema.parse(old).props.carrot.at).toBe('hidden');
 });
});
