import type {ActorFrame,FrameState} from '../api';
import type {Timeline,Vec3} from '../../shared/schema';
import {evaluate} from '../player/evaluate';
import {qslerp} from '../motion/blend';
import type {PreparedReplayData,ReplaySample} from './rapierReplay';

const MOVE_VERBS=new Set(['walk_to','run_to','tiptoe_to']);
const mix=(a:Vec3,b:Vec3,k:number)=>a.map((v,i)=>v+(b[i]-v)*k) as Vec3;

/** Read an already-completed canonical cache. This module never loads Rapier. */
export function samplePrepared(data:PreparedReplayData,view:Timeline,time:number):ReplaySample{
  const t=Math.max(0,Math.min(time,view.duration,data.view.duration));
  const last=view.segments.at(-1);
  const left=view.segments.length<data.source.segments.length&&t===view.duration&&last&&Math.abs(last.offset+last.segment.duration-t)<1e-7;
  const first=data.samples[0];
  if(data.failure)return{...first,t,root:null,ball:null};
  if(data.reason&&data.dropsCount===0)return{...first,t};
  let lo=0,hi=data.samples.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(data.samples[mid].t<=t+1e-9)lo=mid;else hi=mid-1;}
  const a=data.samples[lo],b=data.samples[Math.min(lo+1,data.samples.length-1)];
  const k=b.t>a.t&&Math.abs(t-a.t)>1e-9?Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))):0;
  const rightBall=b.ballBefore===undefined?b.ball:b.ballBefore;
  const ball=left&&Math.abs(t-a.t)<1e-8&&a.ballBefore!==undefined?a.ballBefore:
    a.ball&&rightBall?{pos:mix(a.ball.pos,rightBall.pos,k),rotation:qslerp(a.ball.rotation,rightBall.rotation,k)}:a.ball;
  return{...a,t,root:a.root&&b.root?mix(a.root,b.root,k):a.root,stride:a.stride+(b.stride-a.stride)*k,ball};
}

export function evaluatePrepared(data:PreparedReplayData,view:Timeline,t:number):FrameState{
  const s=samplePrepared(data,view,t);
  const frame=data.continuity&&!data.reason
    ?evaluate({segments:data.view.segments.slice(0,view.segments.length),duration:view.duration},t)
    :evaluate(view,t);
  if(s.root){
    const actor:ActorFrame={...frame.actors.masha,pos:s.root,physicsRoot:true};
    if(MOVE_VERBS.has(actor.verb)&&s.stride<.999){
      actor.bones={...actor.bones};
      for(const name of ['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'])
        if(actor.bones[name])actor.bones[name]=qslerp([0,0,0,1],actor.bones[name],s.stride);
      actor.hipsOffset=actor.hipsOffset.map(v=>v*s.stride) as Vec3;
    }
    frame.actors={...frame.actors,masha:actor};
  }
  if(s.ball&&!frame.props.ball.attachedTo&&frame.props.ball.visible)frame.props={...frame.props,ball:{visible:true,attachedTo:null,...s.ball}};
  return frame;
}

export function inspectPrepared(data:PreparedReplayData,view:Timeline,t:number){
  return{...samplePrepared(data,view,t),reason:data.reason,steps:data.steps,computeMs:data.computeMs,samples:data.samples.length,caches:1,revision:data.revision,continuity:data.continuity,routes:data.routes,pickups:data.pickups,...('impulses'in data?{impulses:data.impulses}:{})};
}

export function authoredPrepared(source:Timeline,reason:string,revision:number):PreparedReplayData{
  return{source,view:source,samples:[{t:0,root:null,grounded:false,stride:1,ball:null,sleeping:false}],reason,failure:false,continuity:false,dropsCount:0,routes:[],pickups:[],impulses:[],steps:0,computeMs:0,revision};
}
