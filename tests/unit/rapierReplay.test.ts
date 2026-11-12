import {describe,it,expect,beforeAll,afterEach} from 'vitest';
import {createRapierReplay,type RapierReplay} from '../../src/engine/physics/rapierReplay';
import {trialStories,story,beat} from '../../scripts/rapier-trial-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {initialWorldState} from '../../src/compiler/worldState';
import type {Timeline} from '../../src/shared/schema';
const stories=trialStories();
const active:RapierReplay[]=[];
async function replay(tl:Timeline,release:[number,number,number]=[2,.9,3]){
 const r=await createRapierReplay({sampleBall:()=>({pos:release,rotation:[0,0,0,1]})});r.setTimeline(tl);active.push(r);return r;
}
afterEach(()=>{active.splice(0).forEach(r=>r.dispose());});
describe('bounded Rapier behavior (real WASM)',()=>{
 it('keeps a drop followed by pickup on animation until pickup retargeting exists',async()=>{
  const tl=structuredClone(stories.drop),last=tl.segments[0].segment;
  last.actorClips.masha.push({start:last.duration,dur:1,verb:'take',emotion:'neutral',params:{item:'ball',target:'ball'}});last.duration+=1;tl.duration+=1;
  const r=await replay(tl);
  for(const t of [2,2.5,6,tl.duration])expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('retains animation for a guest character hugging Masha',async()=>{
  const tl=structuredClone(stories.obstacle),seg=tl.segments[0].segment;
  seg.actorClips.lady_bear=[{start:6,dur:2,verb:'hug',emotion:'happy',params:{target:'masha'}}];
  const r=await replay(tl);expect(r.evaluate(tl,2)).toEqual(evaluate(tl,2));
 });
 it('background preparation and synchronous queries agree, and edited work cancels the previous preparation',async()=>{
  const r=await createRapierReplay({background:true,sampleBall:()=>({pos:[2,.9,3],rotation:[0,0,0,1]})});active.push(r);
  r.setTimeline(stories.drop);await new Promise(resolve=>setTimeout(resolve,30));
  const expected=await replay(stories.drop);expect(r.evaluate(stories.drop,3.17)).toEqual(expected.evaluate(stories.drop,3.17));
  r.setTimeline(stories.regression);await new Promise(resolve=>setTimeout(resolve,30));
  expect(r.evaluate(stories.regression,40)).toEqual(evaluate(stories.regression,40));
 });
 it('stops at the bench, slides around its end and stays supported',async()=>{
  const tl=stories.obstacle,r=await replay(tl);let contact=false,sliding=false;
  for(let t=.1;t<tl.duration;t+=1/60){const raw=evaluate(tl,t),f=r.evaluate(tl,t),p=f.actors.masha.pos;
   expect(p[1]).toBeGreaterThan(-.008);expect(p[1]).toBeLessThan(.015);
   // Capsule may not cross the broad front face while its centre is over the seat.
   if(p[0]>1.2&&p[0]<2.8)expect(p[2]).toBeGreaterThan(3.37);
   if(Math.abs(raw.actors.masha.pos[2]-p[2])>.25)contact=true;
   if(contact&&p[0]<1.1)sliding=true;
  }
  expect(contact).toBe(true);expect(sliding).toBe(true);
 });
 it('drops from a release pose, hits the bench, rebounds, and sleeps on it',async()=>{
  const tl=stories.drop,r=await replay(tl),release=2;
  const at=r.evaluate(tl,release).props.ball;
  at.pos.forEach((v,i)=>expect(v).toBeCloseTo([2,.9,3][i],6));
  expect(r.evaluate(tl,release-.001).props.ball.attachedTo).toBe('masha');
  const ys:number[]=[];for(let t=release;t<tl.duration;t+=1/60){const f=r.evaluate(tl,t);ys.push(f.props.ball.pos[1]);expect(f.props.ball.rotation).toBeDefined();}
  expect(Math.min(...ys)).toBeGreaterThan(.45);
  expect(ys.some((y,i)=>i>1&&y>ys[i-1]+.002)).toBe(true);
  expect(r.inspect(tl,tl.duration).sleeping).toBe(true);
  expect(r.evaluate(tl,tl.duration).props.ball.pos[1]).toBeCloseTo(.47,2);
 });
 it('returns identical poses after arbitrary seek order and replay, including non-grid times',async()=>{
  const tl=stories.drop,a=await replay(tl),b=await replay(tl);
  const times=[0,1.99,2,2.007,2.337,4.123,8.79,tl.duration];
  const expected=times.map(t=>a.evaluate(tl,t));
  for(const i of [7,2,6,1,5,0,4,3,7])expect(b.evaluate(tl,times[i])).toEqual(expected[i]);
  const count=b.inspect(tl,tl.duration).steps;
  expect(b.evaluate(tl,2.337)).toEqual(expected[4]);
  expect(b.inspect(tl,tl.duration).steps).toBe(count);
 });
 it('holds physical transforms beyond the endpoint, also after a direct seek',async()=>{
  const tl=stories.drop,r=await replay(tl),end=r.evaluate(tl,tl.duration);
  for(const t of [tl.duration+1,tl.duration+100]){
   const f=r.evaluate(tl,t);expect(f.props.ball).toEqual(end.props.ball);expect(f.actors.masha.pos).toEqual(end.actors.masha.pos);
  }
 });
 it('invalidates on in-place edits and keeps preview wrappers from changing the revision',async()=>{
  const tl=structuredClone(stories.drop),r=await replay(tl);const original=r.evaluate(tl,6),rev=r.revision;
  const preview={...tl,duration:3.17};r.evaluate(preview,3.17);r.setTimeline(tl);expect(r.revision).toBe(rev);
  const clip=tl.segments[0].segment.actorClips.masha.find(c=>c.verb==='drop')!;clip.start+=4;
  r.setTimeline(tl);expect(r.revision).toBe(rev+1);expect(r.evaluate(tl,3).props.ball.attachedTo).toBe('masha');
  expect(r.evaluate(tl,6).props.ball).not.toEqual(original.props.ball);
 });
 it('preserves every existing actor and prop in the hug/shoulder ride story',async()=>{
  const tl=stories.regression,r=await replay(tl);
  for(let t=0;t<=tl.duration;t+=.37)expect(r.evaluate(tl,t)).toEqual(evaluate(tl,t));
 });
 it('uses canonical ownership in an early preview when a later scene has paired choreography',async()=>{
  const tl=structuredClone(stories.obstacle),tail=structuredClone(stories.regression.segments[0]);tail.offset=tl.duration;tl.segments.push(tail);tl.duration+=tail.segment.duration;
  const preview={segments:tl.segments.slice(0,1),duration:tail.offset},r=await replay(tl);
  expect(r.evaluate(preview,2).actors.masha).toEqual(r.evaluate(tl,2).actors.masha);
 });
 it('does not override raised supports beyond the covered central yard',async()=>{
  const ws=initialWorldState();ws.actors.masha.pos=[12,9];ws.actors.masha.mark='creek';
  const tl=story([beat('idle')],ws),r=await replay(tl);
  expect(r.evaluate(tl,1)).toEqual(evaluate(tl,1));
 });
 it('holds the prior moment at an exact boundary where the next scene hides the ball',async()=>{
  const tl=structuredClone(stories.drop),tail=structuredClone(tl.segments[0]);tail.offset=tl.duration;
  tail.segment.startState=structuredClone(tl.segments[0].segment.endState);tail.segment.startState.props.ball.at='hidden';tail.segment.endState=structuredClone(tail.segment.startState);tail.segment.actorClips.masha=[];tail.segment.duration=2;
  const preview={segments:[tl.segments[0]],duration:tl.duration};tl.segments.push(tail);tl.duration+=2;
  const r=await replay(tl);
  expect(r.evaluate(tl,tail.offset).props.ball.visible).toBe(false);
  const held=r.evaluate(preview,tail.offset+10).props.ball;
  expect(held.visible).toBe(true);expect(held.rotation).toBeDefined();expect(held.pos[1]).toBeCloseTo(.47,2);
 });
 it('does not bypass the trial duration limit through a short preview',async()=>{
  const tl=structuredClone(stories.drop);tl.duration=181;tl.segments[0].segment.duration=181;
  const r=await replay(tl),preview={...tl,duration:5};
  expect(r.evaluate(preview,3)).toEqual(evaluate(preview,3));expect(r.inspect(preview,3).reason).toContain('trial limit');
 });
 it('declines root control when the authored spawn intersects furniture',async()=>{
  const ws=initialWorldState();ws.actors.masha.pos=[2,3];ws.actors.masha.mark='bench';
  const tl=story([beat('idle')],ws),r=await replay(tl);expect(r.evaluate(tl,1)).toEqual(evaluate(tl,1));
  expect(r.inspect(tl,1).reason).toContain('overlaps');
 });
 it('keeps a free ball across paragraphs instead of snapping back to a semantic mark',async()=>{
  const tl=structuredClone(stories.drop),tail=structuredClone(tl.segments[0]);tail.offset=tl.duration;
  tail.segment.startState=structuredClone(tl.segments[0].segment.endState);tail.segment.actorClips.masha=[];tail.segment.duration=3;
  tl.segments.push(tail);tl.duration+=3;const r=await replay(tl);
  expect(r.evaluate(tl,tl.duration).props.ball.pos).toEqual(r.evaluate(tl,tail.offset-.01).props.ball.pos);
 });
});
