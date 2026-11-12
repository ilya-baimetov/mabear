import {createRapierReplay} from '../../src/engine/physics/rapierReplay';
import {trialStories,beat,story} from '../../scripts/rapier-trial-fixtures';
import {initialWorldState} from '../../src/compiler/worldState';
import {evaluate} from '../../src/engine/player/evaluate';
const sampleBall=(f:any)=>({pos:[f.actors.masha.pos[0],1,f.actors.masha.pos[2]] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]});
const {drop}=trialStories(),replay=await createRapierReplay({sampleBall});replay.setTimeline(drop);
const dc=drop.segments[0].segment.actorClips.masha.find(c=>c.verb==='drop')!,release=dc.start+dc.dur*.5;
console.log('release',release);
for(const duration of [release+.01731,release+.14731,release+.26731]){const part={segments:drop.segments,duration},a=replay.evaluate(drop,duration),b=replay.evaluate(part,duration);console.log('partial endpoint',duration,JSON.stringify(a.props.ball),JSON.stringify(b.props.ball));}
replay.dispose();
// Explicit reattachment on an off-grid time, followed by a second drop.
const initial=initialWorldState();initial.actors.masha={...initial.actors.masha,pos:[3,4],mark:'clearing',holding:'ball'};initial.props.ball={at:'masha'};
const two=story([beat('drop',{item:'ball'}),beat('idle'),beat('take',{item:'ball',target:'ball'}),beat('drop',{item:'ball'}),beat('idle',{delay_s:3})],initial);
console.log('two clips',two.segments[0].segment.actorClips.masha.filter(c=>!c.params.ambient));
const rr=await createRapierReplay({sampleBall});rr.setTimeline(two);
let maxDiff=0;
const seq=new Map<number,string>();for(let i=0;i<Math.ceil(two.duration*70);i++){let t=Math.min(two.duration,i/70);seq.set(t,JSON.stringify(rr.evaluate(two,t).props.ball));}
for(const [t,value] of [...seq].reverse())if(JSON.stringify(rr.evaluate(two,t).props.ball)!==value){maxDiff++;console.log('reverse mismatch',t,value,JSON.stringify(rr.evaluate(two,t).props.ball));}
console.log('reverse diffs',maxDiff);rr.dispose();
// Probe cache-eviction equality when old previews are rebuilt.
const r=await createRapierReplay({sampleBall});r.setTimeline(drop);const a=r.evaluate(drop,release+.2333);for(let j=1;j<7;j++)r.evaluate({segments:drop.segments,duration:release+j*.07},release+j*.07);const b=r.evaluate(drop,release+.2333);console.log('eviction equality',JSON.stringify(a)===JSON.stringify(b));r.dispose();
