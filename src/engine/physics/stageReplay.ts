import type { Quat, FrameState } from '../api';
import type { StageHandleEx } from '../stage';
import { walkHeightAt } from '../set/bearsYard';
import type { ActorId, PropId, Vec3 } from '../../shared/schema';
import { createRapierReplay, type PropTransform } from './rapierReplay';

/**
 * Sample the exact rig/socket/prop transform used by the stage for any actor and prop.
 * Only one pose application per release; no GPU render, wall clock, or per-frame feedback.
 */
export function createStageReplay(stage: StageHandleEx) {
  const sampleProp = (frame: FrameState, actor: ActorId, prop: PropId): PropTransform => {
    const a = frame.actors[actor];
    const rig = stage.rigs[actor];
    const lift = a.physicsRoot ? 0 : walkHeightAt(a.pos[0], a.pos[2]);
    const contactFrame =
      lift !== 0
        ? {
            ...a,
            ...(a.putDown
              ? { putDown: { ...a.putDown, position: [a.putDown.position[0], a.putDown.position[1] - lift, a.putDown.position[2]] as Vec3 } }
              : {}),
            ...(a.pickup
              ? { pickup: { ...a.pickup, position: [a.pickup.position[0], a.pickup.position[1] - lift, a.pickup.position[2]] as Vec3 } }
              : {}),
            face: {
              ...a.face,
              lookAt: a.face.lookAt ? ([a.face.lookAt[0], a.face.lookAt[1] - lift, a.face.lookAt[2]] as Vec3) : null,
            },
          }
        : a;
    rig.apply(contactFrame);
    if (lift !== 0) rig.root.position.y += lift;
    rig.root.updateMatrixWorld(true);
    const cur = frame.props[prop];
    const props =
      cur?.attachedTo === actor && cur.visible
        ? frame.props
        : { ...frame.props, [prop]: { visible: true, attachedTo: actor, pos: a.pos } };
    stage.props.apply(props, { [actor]: rig.handSocket }, { [actor]: a.yaw }, frame.actors);
    const obj = stage.props.objects[prop];
    return { pos: obj.position.toArray() as Vec3, rotation: obj.quaternion.toArray() as Quat };
  };

  return createRapierReplay({
    background: true,
    sampleProp,
    sampleBall: (frame) => sampleProp(frame, 'masha', 'ball'),
  });
}
