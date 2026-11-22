import type {StageHandleEx} from '../stage';
import {ResponsiveReplay} from './responsiveReplay';
import {walkHeightAt} from '../set/bearsYard';
import type {FrameState,Quat} from '../api';
import type {Vec3} from '../../shared/schema';

/** Sample the same rig/socket/prop transform used by the stage. Only one pose
 * application per release; no GPU render, wall clock or per-frame feedback. */
function stageBallSampler(stage:StageHandleEx){
  return (frame:FrameState)=>{
    const a=frame.actors.masha,rig=stage.rigs.masha;
    rig.apply(a);
    if(!a.physicsRoot)rig.root.position.y+=walkHeightAt(a.pos[0],a.pos[2]);
    rig.root.updateMatrixWorld(true);
    stage.props.apply(frame.props,{masha:rig.handSocket},{masha:a.yaw},frame.actors);
    const ball=stage.props.objects.ball;
    return {pos:ball.position.toArray() as Vec3,rotation:ball.quaternion.toArray() as Quat};
  };
}

/** Synchronous diagnostic evaluator. Production playback uses the worker below. */
export async function createStageReplay(stage:StageHandleEx){
  const {createRapierReplay}=await import('./rapierReplay');
  return createRapierReplay({background:true,sampleBall:stageBallSampler(stage)});
}

export function createResponsiveStageReplay(stage:StageHandleEx){
  return new ResponsiveReplay({sampleBall:stageBallSampler(stage),
    createWorker:()=>new Worker(new URL('./replayWorker.ts',import.meta.url),{type:'module'})});
}
