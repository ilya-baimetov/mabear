import type { Vec3 } from "../../shared/schema";
import type { ActorFrame } from "../api";

/**
 * Contacts solve before the stage lifts the complete rig onto decking.
 * Convert resting prop and look-at world targets into that same pre-lift coordinate space.
 */
export function liftActorFrame(actor: ActorFrame, lift: number): ActorFrame {
  if (lift === 0) return actor;
  return {
    ...actor,
    ...(actor.putDown
      ? { putDown: { ...actor.putDown, position: [actor.putDown.position[0], actor.putDown.position[1] - lift, actor.putDown.position[2]] as Vec3 } }
      : {}),
    ...(actor.pickup
      ? { pickup: { ...actor.pickup, position: [actor.pickup.position[0], actor.pickup.position[1] - lift, actor.pickup.position[2]] as Vec3 } }
      : {}),
    face: {
      ...actor.face,
      lookAt: actor.face.lookAt ? ([actor.face.lookAt[0], actor.face.lookAt[1] - lift, actor.face.lookAt[2]] as Vec3) : null,
    },
  };
}
