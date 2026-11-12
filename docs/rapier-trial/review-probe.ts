import {createRapierReplay} from '../../src/engine/physics/rapierReplay';
import {trialStories,beat,story} from '../../scripts/rapier-trial-fixtures';
import {initialWorldState} from '../../src/compiler/worldState';
import {evaluate} from '../../src/engine/player/evaluate';
import {walkHeightAt} from '../../src/engine/set/bearsYard';
const sampleBall=(f:any)=>({pos:[f.actors.masha.pos[0],1,f.actors.masha.pos[2]] as [number,number,number],rotation:[0,0,0,1] as [number,number,number,number]});
const stories=trialStories(), first=structuredClone(stories.obstacle), later=structuredClone(stories.regression.segments[0]);later.offset=first.duration;
const all={segments:[...first.segments,later],duration:first.duration+later.segment.duration};
const replay=await createRapierReplay({sampleBall});replay.setTimeline(all);
let max=0,at:any=null;
for(let t=0;t<first.duration;t+=.05){const full=replay.evaluate(all,t),part=replay.evaluate(first,t);const distance=Math.hypot(...full.actors.masha.pos.map((x,i)=>x-part.actors.masha.pos[i]));if(distance>max){max=distance;at={t,full:full.actors.masha.pos,preview:part.actors.masha.pos,fullReason:replay.inspect(all,t).reason,previewReason:replay.inspect(first,t).reason};}}
console.log('preview consistency',max,at);replay.dispose();
const initial=initialWorldState();initial.actors.masha={...initial.actors.masha,pos:[12,9],mark:'creek',facing:0};
const bridge=story([beat('idle'),beat('wave')],initial),replay2=await createRapierReplay({sampleBall});replay2.setTimeline(bridge);
const f=replay2.evaluate(bridge,1);console.log('bridge support',{reason:replay2.inspect(bridge,1).reason,root:f.actors.masha.pos,physicsRoot:f.actors.masha.physicsRoot,legacyLift:walkHeightAt(f.actors.masha.pos[0],f.actors.masha.pos[2])});replay2.dispose();
const drop=stories.drop,replay3=await createRapierReplay({sampleBall});replay3.setTimeline(drop);
for(const duration of [3.14159,3.24244,4.15555]){const part={segments:drop.segments,duration},a=replay3.evaluate(drop,duration),b=replay3.evaluate(part,duration);console.log('partial endpoint',duration,JSON.stringify(a.props.ball),JSON.stringify(b.props.ball));}
replay3.dispose();
