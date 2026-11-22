import {afterEach,describe,expect,it,vi} from 'vitest';
import {Euler,Quaternion,Vector3} from 'three';
import {createRapierReplay,type RapierReplay} from '../../src/engine/physics/rapierReplay';
import {BALL_RADIUS} from '../../src/engine/physics/yardColliders';
import {parallelStories} from '../../scripts/parallel-interactions-fixtures';
import {story,beat} from '../../scripts/rapier-trial-fixtures';
import {textStory} from '../../scripts/interactive-objects-fixtures';
import {initialWorldState} from '../../src/compiler/worldState';
import {evaluate} from '../../src/engine/player/evaluate';
import type {Timeline} from '../../src/shared/schema';
const active:RapierReplay[]=[];
async function setup(tl:Timeline,rotated=false){
 const q=new Quaternion().setFromEuler(new Euler(rotated?.9:0,rotated?.3:0,rotated?1.1:0));
 const r=await createRapierReplay({sampleBall:f=>({pos:[f.actors.masha.pos[0]+.1,.4,f.actors.masha.pos[2]+.25],rotation:q.toArray()})});
 active.push(r);r.setTimeline(tl);return r;
}
afterEach(()=>active.splice(0).forEach(r=>r.dispose()));
describe('drop → obstacle route → physical pickup (compiled actual story)',()=>{
 it.each([
  ['en',['Masha takes the ball and walks to the bench.','Masha drops the ball and waits.','Masha walks to the clearing. Masha waits. Masha takes the ball.']],
  ['ru',['Маша берёт мяч и идёт к скамейке.','Маша роняет мяч и ждёт.','Маша идёт на поляну. Маша ждёт. Маша берёт мяч.']],
 ] as const)('supports a direct %s text story through the ordinary parser/compiler',async(lang,texts)=>{
  const tl=textStory([...texts],lang),r=await setup(tl),proof=r.inspect(tl,tl.duration);
  expect(proof.reason).toBeNull();expect(proof.pickups).toHaveLength(1);expect(r.evaluate(tl,tl.duration).props.ball.attachedTo).toBe('masha');
 });
 it('walks around the bench, remains supported, and retrieves the actual settled ball',async()=>{
  const tl=parallelStories().continuity,r=await setup(tl),proof=r.inspect(tl,tl.duration);
  expect(proof.reason).toBeNull();expect(proof.continuity).toBe(true);expect(proof.pickups).toHaveLength(1);
  const route=proof.routes.at(-1)!;expect(route.target).toBe('ball');expect(route.path.length).toBeGreaterThan(2);
  for(let t=0;t<tl.duration;t+=1/60){
   const p=r.evaluate(tl,t).actors.masha.pos;expect(p[1]).toBeGreaterThan(-.0001);expect(p[1]).toBeLessThan(.02);
   // Actual capsule footprint, independently measured from the bench seat.
   expect(p[0]>1.15-.21&&p[0]<2.85+.21&&p[2]>2.81-.21&&p[2]<3.19+.21).toBe(false);
   expect(Math.hypot(p[0]-2,p[2]-1.5)).toBeGreaterThan(.95);
  }
  const pickup=proof.pickups[0],before=r.evaluate(tl,pickup.attach-.001),after=r.evaluate(tl,pickup.attach+.001);
  expect(before.props.ball.attachedTo).toBeNull();expect(after.props.ball.attachedTo).toBe('masha');
  expect(before.props.ball.pos).toEqual(pickup.position);expect(after.actors.masha.pickup?.position).toEqual(pickup.position);
  expect(Math.hypot(before.actors.masha.pos[0]-pickup.position[0],before.actors.masha.pos[2]-pickup.position[2])).toBeLessThan(.3);
  expect(Math.hypot(evaluate(tl,pickup.attach-.001).props.ball.pos[0]-pickup.position[0],evaluate(tl,pickup.attach-.001).props.ball.pos[2]-pickup.position[2])).toBeGreaterThan(.3);
  expect(r.evaluate(tl,tl.duration).props.ball.attachedTo).toBe('masha');
 });
 it('uses sphere support rather than its rotated base origin for a rolling-ball pickup',async()=>{
  const tl=parallelStories().continuity,r=await setup(tl,true),proof=r.inspect(tl,tl.duration);
  expect(proof.reason).toBeNull();expect(proof.pickups).toHaveLength(1);
  const event=proof.pickups[0],f=r.evaluate(tl,event.attach-.001),b=f.props.ball;
  const support=new Vector3(...b.pos).add(new Vector3(0,BALL_RADIUS,0).applyQuaternion(new Quaternion(...b.rotation!))).sub(new Vector3(0,BALL_RADIUS,0));
  expect(support.y).toBeCloseTo(0,2);
  expect(Math.hypot(f.actors.masha.pos[0]-support.x,f.actors.masha.pos[2]-support.z)).toBeLessThan(.3);
  const contact=f.actors.masha.pickup!;expect(contact.position).toEqual(b.pos);
  expect(new Quaternion().setFromEuler(new Euler(...contact.rotation,'YXZ')).angleTo(new Quaternion(...b.rotation!))).toBeLessThan(1e-6);
 });
 it('preserves clip and scene continuity, arbitrary seek order, preview endpoints and replay',async()=>{
  const tl=parallelStories().continuity,a=await setup(tl),b=await setup(tl);
  const times=new Set([0,tl.duration,tl.duration+30,2.337]);
  for(const {offset,segment} of tl.segments)for(const clip of segment.actorClips.masha)for(const at of [offset+clip.start,offset+clip.start+clip.dur,offset+clip.start+clip.dur*.5])for(const d of [-.0001,0,.0001])times.add(Math.max(0,at+d));
  const sorted=[...times].sort((x,y)=>x-y),frames=sorted.map(t=>a.evaluate(tl,t));
  for(let i=sorted.length-1;i>=0;i--)expect(b.evaluate(tl,sorted[i])).toEqual(frames[i]);
  for(const {offset,segment} of tl.segments)for(const clip of segment.actorClips.masha){const t=offset+clip.start,prev=a.evaluate(tl,Math.max(0,t-.0001)),next=a.evaluate(tl,t+.0001);expect(new Vector3(...prev.actors.masha.pos).distanceTo(new Vector3(...next.actors.masha.pos))).toBeLessThan(.005);}
  const preview={segments:tl.segments.slice(0,1),duration:tl.segments[1].offset};
  expect(a.evaluate(preview,preview.duration).actors.masha.pos).toEqual(a.evaluate(tl,preview.duration).actors.masha.pos);
  expect(a.evaluate(tl,tl.duration+30).actors.masha.pos).toEqual(a.evaluate(tl,tl.duration).actors.masha.pos);
 });
 it('invalidates all reconciled paths and ball contacts after an actual source-timeline edit',async()=>{
  const tl=parallelStories().continuity,r=await setup(tl),before=r.inspect(tl,tl.duration),revision=r.revision;
  const edited=structuredClone(tl);edited.segments[0].segment.startState.actors.masha.pos=[-.2,.5];
  const first=edited.segments[0].segment.actorClips.masha[0];first.params.from=[-.2,.5];if(first.params.path)first.params.path[0]=[-.2,.5];
  r.setTimeline(edited);expect(r.revision).toBe(revision+1);const after=r.inspect(edited,edited.duration);
  expect(after.routes[0].path[0]).not.toEqual(before.routes[0].path[0]);
  const fresh=await setup(edited);for(const t of [2.337,12.1,edited.duration])expect(r.evaluate(edited,t)).toEqual(fresh.evaluate(edited,t));
 });
 it('falls back atomically for an impossible short retrieval instead of teleporting late',async()=>{
  const tl=parallelStories().continuity,seg=tl.segments.at(-1)!.segment;
  const approach=[...seg.actorClips.masha].reverse().find(c=>['walk_to','run_to'].includes(c.verb)&&c.params.target==='ball')!;
  const prior=seg.actorClips.masha[seg.actorClips.masha.indexOf(approach)-1];prior.verb='wave';approach.dur=.05;
  const r=await setup(tl);expect(r.evaluate(tl,0)).toEqual(evaluate(tl,0));expect(r.inspect(tl,0).reason).toContain('too short');
  for(const t of [5,tl.duration,2,17])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('stops background callbacks after a failed atomic chain while playback is paused',async()=>{
  const tl=parallelStories().continuity,seg=tl.segments.at(-1)!.segment;
  const approach=[...seg.actorClips.masha].reverse().find(c=>['walk_to','run_to'].includes(c.verb)&&c.params.target==='ball')!;
  seg.actorClips.masha[seg.actorClips.masha.indexOf(approach)-1].verb='wave';approach.dur=.05;
  const r=await createRapierReplay({background:true,sampleBall:f=>({pos:[f.actors.masha.pos[0]+.1,.4,f.actors.masha.pos[2]+.25],rotation:[0,0,0,1]})});
  active.push(r);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try{
   r.setTimeline(tl);expect(vi.getTimerCount()).toBe(1);
   vi.advanceTimersByTime(0);
   const proof=r.inspect(tl,0);expect(proof.reason).toContain('too short');expect(proof.steps).toBeGreaterThan(0);
   expect(vi.getTimerCount()).toBe(0);
   vi.advanceTimersByTime(1000);expect(vi.getTimerCount()).toBe(0);expect(r.inspect(tl,0).steps).toBe(proof.steps);
   expect(r.evaluate(tl,12)).toEqual(evaluate(tl,12));
  }finally{r.dispose();vi.useRealTimers();}
 });
 it('still simulates an ordinary initial pickup followed by a drop without a later retrieval',async()=>{
  const tl=story([beat('take',{item:'ball',target:'ball'}),beat('drop',{item:'ball'}),beat('idle',{delay_s:6})]),r=await setup(tl);
  const proof=r.inspect(tl,tl.duration);expect(proof.reason).toBeNull();expect(proof.continuity).toBe(false);expect(proof.sleeping).toBe(true);
  expect(r.evaluate(tl,tl.duration).props.ball.rotation).toBeDefined();expect(r.evaluate(tl,tl.duration).props.ball.attachedTo).toBeNull();
 });
 it('declines unsupported ball participation as one coherent story before any physics takeover',async()=>{
  const tl=parallelStories().continuity,seg=tl.segments[1].segment;
  seg.actorClips.bear.push({start:2,dur:1,verb:'look_at',emotion:'neutral',params:{target:'ball'}});
  const r=await setup(tl);expect(r.inspect(tl,0).reason).toBe('unsupported ball choreography');expect(r.inspect(tl,0).continuity).toBe(false);
  for(const t of [0,8,tl.duration,2])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('bounds atomic continuity preparation and keeps a longer chain authored',async()=>{
  const tl=parallelStories().continuity;tl.segments.at(-1)!.segment.duration+=61-tl.duration;tl.duration=61;
  const r=await setup(tl);expect(r.inspect(tl,0).reason).toContain('preparation limit');expect(r.inspect(tl,0).steps).toBe(0);
  expect(r.evaluate(tl,40)).toEqual(evaluate(tl,40));
 });
 it('rejects a still-moving acquisition before any frame rather than grabbing a stale target',async()=>{
  const ws=initialWorldState();ws.actors.masha.holding='ball';ws.props.ball.at='masha';
  const tl=story([beat('drop',{item:'ball'})],ws),seg=tl.segments[0].segment;
  seg.actorClips.masha=seg.actorClips.masha.filter(c=>c.start<1.2);
  seg.actorClips.masha.push({start:1.2,dur:2.2,verb:'take',emotion:'neutral',params:{item:'ball',target:'ball'}});
  seg.duration=3.4;tl.duration=3.4;seg.endState.props.ball.at='masha';seg.endState.actors.masha.holding='ball';
  const r=await setup(tl);expect(r.inspect(tl,0).reason).toContain('settled contact');
  for(const t of [0,.6,2.3,tl.duration])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('leaves the complete hug/shoulder-ride and cupboard stories authored',async()=>{
  for(const tl of [parallelStories().regression,parallelStories().cupboard]){const r=await setup(tl);for(let t=0;t<=tl.duration;t+=.417)expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));}
 });
});
