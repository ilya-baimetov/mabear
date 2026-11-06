import type { ActorFrame, CharacterRig } from "../engine/api";
import type { CamKey } from "../shared/schema";

/** Frame the rendered head: its world transform includes posture, carrying, and ground elevation. */
export function castCloseup(rig: CharacterRig, actor: ActorFrame, angle = 0): CamKey {
  const head = rig.bones.Head;
  const leftEye = rig.root.getObjectByName("eyeL");
  const rightEye = rig.root.getObjectByName("eyeR");
  // Use the actual facial features: skull-base offsets differ between rigs and the scaled Bear head.
  const centre = leftEye && rightEye
    ? leftEye.getWorldPosition(head.position.clone()).add(rightEye.getWorldPosition(head.position.clone())).multiplyScalar(0.5)
    : head.localToWorld(head.position.clone().set(0, rig.height * 0.12, rig.height * 0.03));
  centre.y -= rig.height * 0.025;
  const dist = rig.height < 1.3 ? 1.15 : rig.height * 0.96;
  const yaw = actor.yaw + angle;
  return {
    pos: [centre.x + Math.sin(yaw) * dist, centre.y + (actor.posture === "carried" ? 0.8 : rig.height * 0.04), centre.z + Math.cos(yaw) * dist],
    look: [centre.x, centre.y, centre.z],
    fov: 35,
  };
}
