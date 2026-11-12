import type {StageHandleEx} from '../stage';
import {createRapierReplay} from './rapierReplay';
import {walkHeightAt} from '../set/bearsYard';
import type {Quat} from '../api';
import type {Vec3} from '../../shared/schema';

/** Sample the same rig/socket/prop transform used by the stage. Only one pose
 * application per release; no GPU render, wall clock or per-frame feedback. */
export function createStageReplay(stage:StageHandleEx){
  return createRapierReplay({background:true,sampleBall(frame){
    const a=frame.actors.masha,rig=stage.rigs.masha;
    rig.apply(a);
    if(!a.physicsRoot)rig.root.position.y+=walkHeightAt(a.pos[0],a.pos[2]);
    rig.root.updateMatrixWorld(true);
    stage.props.apply(frame.props,{masha:rig.handSocket},{masha:a.yaw},frame.actors);
    const ball=stage.props.objects.ball;
    return {pos:ball.position.toArray() as Vec3,rotation:ball.quaternion.toArray() as Quat};
  }});
}
