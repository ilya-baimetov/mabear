import {afterEach,describe,expect,it} from 'vitest';
import {Euler,Quaternion,Vector3} from 'three';
import {createRapierReplay,type RapierReplay,type BallTransform} from '../../src/engine/physics/rapierReplay';
import {BALL_RADIUS} from '../../src/engine/physics/yardColliders';
import {story,beat} from '../../scripts/rapier-trial-fixtures';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {compileEpisode} from '../../src/compiler/episode';
import {BeatScriptSchema,DEFAULT_REMIX,WorldStateSchema} from '../../src/shared/schema';
import recordedDirector from '../../docs/kitchen-bench/director/batch-2.json';
import {evaluatePrepared} from '../../src/engine/physics/preparedReplay';
import type {FrameState} from '../../src/engine/api';
import type {Timeline} from '../../src/shared/schema';

const active:RapierReplay[]=[];
function releasePose(f:FrameState):BallTransform {
 const p=f.actors.masha.putDown;
 return p?{pos:[...p.position],rotation:new Quaternion().setFromEuler(new Euler(...p.rotation,'YXZ')).toArray()}:
  {pos:[f.actors.masha.pos[0]+.1,.4,f.actors.masha.pos[2]+.25],rotation:[0,0,0,1]};
}
async function replay(tl:Timeline){const r=await createRapierReplay({sampleBall:releasePose});active.push(r);r.setTimeline(tl);return r;}
function benchStory(){return story([beat('take',{item:'ball',target:'ball'}),beat('put_down',{item:'ball',target:'bench'}),beat('idle',{delay_s:2}),beat('nudge',{item:'ball',target:'bench'}),beat('idle',{delay_s:8}),beat('take',{item:'ball',target:'ball'})]);}
function support(b:{pos:number[];rotation?:number[]}) {return new Vector3(...b.pos as [number,number,number]).add(new Vector3(0,BALL_RADIUS,0).applyQuaternion(new Quaternion(...b.rotation as [number,number,number,number]))).sub(new Vector3(0,BALL_RADIUS,0));}
afterEach(()=>active.splice(0).forEach(r=>r.dispose()));

describe('bench support → visible nudge → ground retrieval',()=>{
 it.each([
  ['en',['Masha takes the ball and puts it on the bench.','Masha nudges the ball off the bench and waits.','Masha walks to the clearing, waits, and picks up the ball.']],
  ['ru',['Маша берёт мяч и кладёт его на скамейку.','Маша толкает мяч со скамейки и ждёт.','Маша идёт на поляну, ждёт и поднимает мяч.']],
 ] as const)('runs the ordinary %s three-scene text story with physical placement and pickup',async(lang,texts)=>{
  const tl=textStory([...texts],lang),r=await replay(tl),proof=r.inspect(tl,tl.duration);
  expect(proof.reason).toBeNull();expect(proof.impulses).toHaveLength(1);expect(proof.pickups).toHaveLength(1);
  expect(r.evaluate(tl,tl.duration).props.ball.attachedTo).toBe('masha');
 });
 it.each(['ball-en','ball-ru'])('keeps the recorded live AI plan %s physical despite spectator acting',async id=>{
  const result=recordedDirector.results.find(r=>r.id===id)!;
  const script=BeatScriptSchema.parse(result.response.beatScript),initial=WorldStateSchema.parse(result.request.worldState);
  const tl=compileEpisode([{paragraphId:id,version:1,beatScript:script,remix:DEFAULT_REMIX}],result.request.lang as 'en'|'ru',initial).timeline,r=await replay(tl);
  expect(r.inspect(tl,tl.duration).reason).toBeNull();expect(r.inspect(tl,tl.duration).pickups).toHaveLength(1);
 });
 it('allows spectators to watch the loose ball but rejects another actor nudging or taking it',async()=>{
  const tl=benchStory(),segment=tl.segments[0].segment,at=segment.actorClips.masha.find(c=>c.verb==='nudge')!.start+.2;
  segment.actorClips.bear.push({start:at,dur:1,verb:'look_at',emotion:'curious',params:{target:'ball'}});
  const watched=await replay(tl);expect(watched.inspect(tl,tl.duration).reason).toBeNull();expect(watched.inspect(tl,tl.duration).impulses).toHaveLength(1);
  for(const verb of ['take','nudge','throw'] as const){
   const conflict=structuredClone(tl);conflict.segments[0].segment.actorClips.bear.at(-1)!.verb=verb;
   const r=await replay(conflict);expect(r.inspect(conflict,0).reason).toBe('unsupported ball choreography');
   for(const t of [conflict.duration,0,at])expect(r.evaluate(conflict,t)).toEqual(evaluate(conflict,t));
  }
 });
 it('rests on the bench until contact, rolls off its left edge and retrieves its actual landing',async()=>{
  const tl=benchStory(),r=await replay(tl),proof=r.inspect(tl,tl.duration);
  expect(proof.reason).toBeNull();expect(proof.impulses).toHaveLength(1);expect(proof.pickups).toHaveLength(1);
  const nudge=proof.impulses[0],before=r.evaluate(tl,nudge.time-.001),rest=support(before.props.ball);
  expect(rest.x).toBeCloseTo(1.90,2);expect(rest.y).toBeCloseTo(.47,2);expect(rest.z).toBeGreaterThan(2.86);expect(rest.z).toBeLessThan(3.14);
  expect(before.actors.masha.nudge?.position).toEqual(before.props.ball.pos);
  let airborne=false,left=false;
  for(let t=nudge.time;t<proof.pickups[0].attach;t+=1/60){
   const f=r.evaluate(tl,t),b=support(f.props.ball),p=f.actors.masha.pos;
   if(b.x<1.15&&b.y>.03&&b.y<.42)airborne=true;
   if(b.x<1.0)left=true;
   expect(b.y).toBeGreaterThan(-.012);expect(p[1]).toBeGreaterThan(-.001);expect(p[1]).toBeLessThan(.02);
   expect(p[0]>1.15-.21&&p[0]<2.85+.21&&p[2]>2.81-.21&&p[2]<3.19+.21).toBe(false);
   expect(Math.hypot(p[0]-2,p[2]-1.5)).toBeGreaterThan(.95);
  }
  expect(airborne).toBe(true);expect(left).toBe(true);
  const pickup=proof.pickups[0],landed=r.evaluate(tl,pickup.attach-.001),after=r.evaluate(tl,pickup.attach+.001),ground=support(landed.props.ball);
  expect(ground.y).toBeCloseTo(0,2);expect(landed.props.ball.pos).toEqual(pickup.position);expect(after.props.ball.attachedTo).toBe('masha');
  expect(after.actors.masha.pickup?.position).toEqual(pickup.position);
  expect(Math.hypot(landed.actors.masha.pos[0]-ground.x,landed.actors.masha.pos[2]-ground.z)).toBeLessThan(.3);
 });
 it('exports a complete serializable trajectory with one impulse and deterministic reverse seeks',async()=>{
  const tl=benchStory(),a=await replay(tl),b=await replay(tl),data=a.preparedData();
  expect(data.reason).toBeNull();expect(data.samples.at(-1)!.t).toBe(tl.duration);expect(data.impulses).toHaveLength(1);
  expect(structuredClone(data)).toEqual(data);
  const event=data.impulses[0].time,times=[0,event-.001,event,event+.001,event+.237,tl.duration];
  const transported=structuredClone(data),frames=times.map(t=>a.evaluate(tl,t));for(let i=times.length-1;i>=0;i--){expect(b.evaluate(tl,times[i])).toEqual(frames[i]);expect(evaluatePrepared(transported,tl,times[i])).toEqual(frames[i]);}
  const steps=a.inspect(tl,0).steps;for(let i=0;i<5;i++)a.evaluate(tl,event);expect(a.inspect(tl,0).steps).toBe(steps);
 });
 it('keeps actual bench and landing poses at scene-preview boundaries and replays the same acquisition',async()=>{
  const tl=textStory(['Masha takes the ball and puts it on the bench.','Masha nudges the ball off the bench and waits.','Masha walks to the clearing, waits, and picks up the ball.']),r=await replay(tl),data=structuredClone(r.preparedData());
  expect(data.reason).toBeNull();
  for(let i=1;i<tl.segments.length;i++){
   const view={segments:tl.segments.slice(0,i),duration:tl.segments[i].offset};
   for(const t of [view.duration-.001,view.duration,view.duration+10])expect(evaluatePrepared(data,view,t)).toEqual(r.evaluate(view,t));
   const a=r.evaluate(view,view.duration),b=r.evaluate(tl,view.duration);
   expect(a.props.ball.pos).toEqual(b.props.ball.pos);expect(new Vector3(...a.actors.masha.pos).distanceTo(new Vector3(...b.actors.masha.pos))).toBeLessThan(.001);
  }
  const attach=data.pickups[0].attach;
  for(const t of [attach+.001,attach-.001,tl.duration,0,attach])expect(evaluatePrepared(data,tl,t)).toEqual(r.evaluate(tl,t));
 });
 it('recomputes the actual landing and pickup after editing nudge strength',async()=>{
  const tl=benchStory(),r=await replay(tl),before=r.preparedData(),revision=r.revision,edited=structuredClone(tl);
  edited.segments[0].segment.actorClips.masha.find(c=>c.verb==='nudge')!.params.nudgeImpulse=[-1.05,0,0];
  r.setTimeline(edited);const after=r.preparedData(),fresh=await replay(edited);
  expect(r.revision).toBe(revision+1);expect(after.reason).toBeNull();expect(after.impulses[0].impulse).toEqual([-1.05,0,0]);
  expect(new Vector3(...before.pickups[0].position).distanceTo(new Vector3(...after.pickups[0].position))).toBeGreaterThan(.05);
  for(const t of [edited.duration,after.impulses[0].time+.7,0,after.pickups[0].attach])expect(r.evaluate(edited,t)).toEqual(fresh.evaluate(edited,t));
 });
 it('rejects an unsupported nudge as a coherent authored story, before any physics takeover',async()=>{
  const tl=benchStory(),nudge=tl.segments[0].segment.actorClips.masha.find(c=>c.verb==='nudge')!;
  nudge.params.nudgeImpulse=[0,0,1];const r=await replay(tl);
  expect(r.inspect(tl,0).reason).toContain('unsupported bench nudge direction');
  for(const t of [0,5,tl.duration,2])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('rejects a missed loaded-hand release even when the erroneous ball would still be above the seat',async()=>{
  const tl=benchStory(),r=await createRapierReplay({sampleBall:f=>{const b=releasePose(f);return f.actors.masha.putDown?{...b,pos:[b.pos[0]+.025,b.pos[1],b.pos[2]]}:b;}});active.push(r);r.setTimeline(tl);
  expect(r.inspect(tl,0).reason).toContain('held ball does not reach the bench surface');
  for(const t of [tl.duration,0,5])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
});
