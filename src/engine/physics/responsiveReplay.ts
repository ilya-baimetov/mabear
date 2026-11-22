import type {FrameState} from '../api';
import type {Timeline} from '../../shared/schema';
import type {BallTransform,PlaybackEvaluator,PreparedReplayData} from './rapierReplay';
import type {ReplayWorkerRequest,ReplayWorkerResponse} from './replayProtocol';
import {authoredPrepared,evaluatePrepared,inspectPrepared} from './preparedReplay';
import {immediateAuthoredReason} from './authoredFallback';

export interface ReplayWorkerPort{
  postMessage(message:ReplayWorkerRequest):void;
  terminate():void;
  onmessage:((event:MessageEvent<ReplayWorkerResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
}
export interface ResponsiveEvaluator extends PlaybackEvaluator{
  readonly ready:boolean;
  whenReady():Promise<void>;
}
export class PhysicsPreparationPending extends Error{
  constructor(){super('Physics trajectory is still being prepared');}
}

/** Main-thread facade: exact loaded-rig samples plus a read-only completed cache.
 * Cancellation terminates active work, rather than letting stale simulations run. */
export class ResponsiveReplay implements ResponsiveEvaluator{
  private worker:ReplayWorkerPort|null=null;
  private fingerprint='';
  private source:Timeline={segments:[],duration:0};
  private data:PreparedReplayData=authoredPrepared(this.source,'empty timeline',0);
  private pending=false;
  private disposed=false;
  private done:Promise<void>=Promise.resolve();
  private finish:(()=>void)|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private started=0;
  private preparationError:string|null=null;
  private metrics={wallMs:0,workerMs:0,poseMs:0,poseRequests:0,rounds:0};
  revision=0;
  constructor(private options:{sampleBall:(frame:FrameState)=>BallTransform;createWorker:()=>ReplayWorkerPort;timeoutMs?:number}){}
  get ready(){return !this.pending;}
  async whenReady(){while(this.pending&&!this.disposed)await this.done;}

  setTimeline(timeline:Timeline):void{
    if(this.disposed)return;
    const key=JSON.stringify(timeline);if(key===this.fingerprint)return;
    const wasPending=this.pending;
    this.complete();
    if(wasPending)this.stopWorker();
    this.fingerprint=key;this.source=JSON.parse(key);this.revision++;
    this.metrics={wallMs:0,workerMs:0,poseMs:0,poseRequests:0,rounds:0};
    this.preparationError=null;
    const reason=immediateAuthoredReason(this.source);
    if(reason){this.data=authoredPrepared(this.source,reason,this.revision);return;}
    this.pending=true;this.started=performance.now();
    this.done=new Promise(resolve=>{this.finish=resolve;});
    try{
      if(!this.worker){
        const worker=this.options.createWorker();this.worker=worker;
        worker.onmessage=e=>{if(this.worker===worker)this.receive(e.data);};
        worker.onerror=e=>{if(this.worker!==worker)return;e.preventDefault?.();this.fail('Physics worker could not prepare this story');};
      }
      this.timer=setTimeout(()=>this.fail('Physics preparation timed out'),this.options.timeoutMs??15000);
      this.worker.postMessage({kind:'prepare',id:this.revision,timeline:this.source});
    }catch(error){this.fail(error instanceof Error?error.message:String(error));}
  }

  private receive(message:ReplayWorkerResponse){
    if(this.disposed||!this.pending||message.id!==this.revision)return;
    if(message.kind==='pose'){
      if(++this.metrics.poseRequests>32){this.fail('Physics release-pose limit exceeded');return;}
      try{
        const start=performance.now(),transform=this.options.sampleBall(message.frame);
        this.metrics.poseMs+=performance.now()-start;
        if(![...transform.pos,...transform.rotation].every(Number.isFinite))throw Error('Invalid loaded-rig release pose');
        this.worker!.postMessage({kind:'pose',id:message.id,key:message.key,transform});
      }catch(error){this.fail(error instanceof Error?error.message:String(error));}
    }else if(message.kind==='ready'){
      this.data={...message.data,revision:this.revision};
      this.metrics.workerMs=message.wallMs;this.metrics.rounds=message.rounds;this.metrics.wallMs=performance.now()-this.started;
      this.complete();
    }else this.fail(message.message);
  }
  private fail(message:string){
    if(!this.pending)return;
    this.preparationError=message;
    this.data=authoredPrepared(this.source,`physics preparation fallback: ${message}`,this.revision);
    this.metrics.wallMs=performance.now()-this.started;this.stopWorker();this.complete();
  }
  private complete(){
    if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;
    this.pending=false;this.finish?.();this.finish=null;
  }
  private stopWorker(){if(this.worker){this.worker.onmessage=null;this.worker.onerror=null;this.worker.terminate();this.worker=null;}}
  evaluate(view:Timeline,t:number){if(this.pending)throw new PhysicsPreparationPending();return evaluatePrepared(this.data,view,t);}
  inspect(view:Timeline,t:number){
    if(this.pending)return{preparing:true,reason:'preparing physics',revision:this.revision,samples:0,steps:0,ball:null,root:null,continuity:false,preparation:{...this.metrics,wallMs:performance.now()-this.started}};
    return{...inspectPrepared(this.data,view,t),preparing:false,preparation:{...this.metrics,error:this.preparationError}};
  }
  dispose(){this.disposed=true;this.stopWorker();this.complete();}
}
