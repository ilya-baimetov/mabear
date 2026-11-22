import {createRapierReplay,type BallTransform} from './rapierReplay';
import type {FrameState} from '../api';
import type {Timeline} from '../../shared/schema';
import {releasePoseKey,type ReplayWorkerRequest,type ReplayWorkerResponse} from './replayProtocol';

const scope=self as unknown as {postMessage:(message:ReplayWorkerResponse)=>void;onmessage:((event:MessageEvent<ReplayWorkerRequest>)=>void)|null};
class NeedPose extends Error{
  constructor(readonly key:string,readonly frame:FrameState){super('Loaded rig release pose required');}
}
let job:{id:number;timeline:Timeline;poses:Map<string,BallTransform>;started:number;rounds:number}|null=null;

async function run(){
  const current=job;if(!current)return;
  let replay:Awaited<ReturnType<typeof createRapierReplay>>|undefined;
  try{
    if(++current.rounds>33||performance.now()-current.started>15000)throw Error('Physics preparation limit exceeded');
    replay=await createRapierReplay({sampleBall(frame){
      const key=releasePoseKey(frame),known=current.poses.get(key);
      if(!known)throw new NeedPose(key,frame);
      return known;
    }});
    if(job!==current)return;
    replay.setTimeline(current.timeline);
    // A missing rig pose restarts the bounded deterministic prefix; no partially
    // advanced body or modified ownership can escape to playback.
    const data=replay.preparedData();
    if(job!==current)return;
    scope.postMessage({kind:'ready',id:current.id,data,wallMs:performance.now()-current.started,rounds:current.rounds});
    job=null;
  }catch(error){
    if(job!==current)return;
    if(error instanceof NeedPose){scope.postMessage({kind:'pose',id:current.id,key:error.key,frame:error.frame,round:current.rounds});}
    else{scope.postMessage({kind:'error',id:current.id,message:error instanceof Error?error.message:String(error)});job=null;}
  }finally{replay?.dispose();}
}

scope.onmessage=event=>{
  const message=event.data;
  if(message.kind==='prepare'){
    job={id:message.id,timeline:message.timeline,poses:new Map(),started:performance.now(),rounds:0};
    void run();
  }else if(job&&message.id===job.id){
    job.poses.set(message.key,message.transform);void run();
  }
};
