import {describe,it,expect} from 'vitest';
import {evaluate} from '../../src/engine/player/evaluate';
import {emotionWeights} from '../../src/engine/motion/emotion';
import {initialWorldState} from '../../src/compiler/worldState';
import {compileEpisode} from '../../src/compiler/episode';
import {FIXTURES} from '../../src/director/fixtures';
import {ACTOR_IDS,DEFAULT_REMIX,type ActorClip,type Segment,type Timeline} from '../../src/shared/schema';

function timeline(tracks:ActorClip[][],durations:number[]):Timeline{
 let offset=0;
 return {duration:durations.reduce((a,b)=>a+b,0),segments:tracks.map((clips,i)=>{
  const state=initialWorldState(),segment:Segment={paragraphId:`p${i}`,version:1,duration:durations[i],startState:state,endState:state,actorClips:Object.fromEntries(ACTOR_IDS.map(id=>[id,id==='masha'?clips:[]])) as Segment['actorClips'],dialogue:[],emotes:[],foley:[],camera:[],sfx:[],music:[],ambience:[],ducking:[],lighting:[],fx:[]};
  const result={offset,segment};offset+=segment.duration;return result;
 })};
}
const clip=(start:number,dur:number,emotion:ActorClip['emotion']):ActorClip=>({start,dur,verb:'idle',emotion,params:{}});
const weights=(tl:Timeline,t:number)=>emotionWeights(evaluate(tl,t).actors.masha.face);
const distance=(a:ReturnType<typeof weights>,b:ReturnType<typeof weights>)=>[...new Set([...Object.keys(a),...Object.keys(b)])].reduce((sum,key)=>sum+Math.abs((a[key as keyof typeof a]??0)-(b[key as keyof typeof b]??0)),0);

describe('production story expressions',()=>{
 it('blends first impressions and subsequent emotional beats instead of switching halfway through a body fade',()=>{
  const tl=timeline([[clip(0,2,'happy'),clip(2,2,'surprised')]], [4]);
  expect(weights(tl,0)).toEqual({neutral:1,happy:0});
  expect(weights(tl,1)).toEqual({happy:1});
  const halfway=weights(tl,2.12);
  expect(halfway.happy).toBeCloseTo(.5);expect(halfway.surprised).toBeCloseTo(.5);
  expect(weights(tl,2.3)).toEqual({surprised:1});
 });

 it('preserves the displayed mixture through interruptions, gaps and paragraph changes',()=>{
  const tl=timeline([[clip(0,.1,'happy'),clip(.1,.08,'surprised'),clip(.23,.12,'sad')],[clip(0,1,'angry')]], [.35,1]);
  for(const boundary of [.1,.18,.23,.35])expect(distance(weights(tl,boundary-1e-6),weights(tl,boundary+1e-6)),`continuity at ${boundary}s`).toBeLessThan(.0001);
  expect(Object.values(weights(tl,.15)).filter(n=>n!>0).length).toBeGreaterThan(2);
  const times=[0,.1,.12,.18,.2,.23,.35,.48,.7];
  const forward=times.map(t=>evaluate(tl,t));
  expect([...times].reverse().map(t=>evaluate(tl,t)).reverse()).toEqual(forward);
 });

 it('invalidates the semantic cue cache when an editor changes a clip in place',()=>{
  const tl=timeline([[clip(0,2,'happy')]], [2]);
  expect(weights(tl,1)).toEqual({happy:1});
  tl.segments[0].segment.actorClips.masha[0].emotion='sad';
  expect(weights(tl,1)).toEqual({sad:1});
 });

 it('compiles every actual example and preserves finite normalized expressions under reverse seeking',()=>{
  for(const fixture of FIXTURES){
   const {results,timeline:tl}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`${fixture.id}-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),fixture.lang);
   expect(results.flatMap(r=>r.errors),`${fixture.id}/${fixture.lang} compilation`).toEqual([]);
   const times=tl.segments.flatMap(s=>[s.offset,...s.segment.actorClips.masha.flatMap(c=>[s.offset+c.start,s.offset+c.start+.1,s.offset+c.start+c.dur*.5])]);
   const forward=times.map(t=>evaluate(tl,t));
   expect([...times].reverse().map(t=>evaluate(tl,t)).reverse(),`${fixture.id}/${fixture.lang} seeks`).toEqual(forward);
   for(const frame of forward)for(const actor of ACTOR_IDS){
    const ws=emotionWeights(frame.actors[actor].face),values=Object.values(ws);
    expect(values.every(w=>Number.isFinite(w)&&w>=0&&w<=1)).toBe(true);
    expect(values.reduce((a,b)=>a+b,0)).toBeCloseTo(1,10);
   }
  }
 });
});
