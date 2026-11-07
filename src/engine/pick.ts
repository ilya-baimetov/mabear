// Screen → character picking for tap-to-react (D9). No React.
import * as THREE from "three";
import type { ActorId } from "../shared/schema";
import type { CharacterRig, StageHandle } from "./api";

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** Which character (if any) is under normalized canvas coords (0..1, y down). */
export function pickActor(stage: StageHandle & { rigs?: Record<ActorId, CharacterRig> }, u: number, v: number): ActorId | null {
  if (!stage.rigs) return null;
  ndc.set(u * 2 - 1, -(v * 2 - 1));
  ray.setFromCamera(ndc, stage.camera);
  let best: { id: ActorId; d: number } | null = null;
  for (const id of Object.keys(stage.rigs) as ActorId[]) {
    const root=stage.rigs[id].root;
    if (!root.visible) continue;
    const hits = ray.intersectObject(root, true).filter(hit => {
      for (let node: THREE.Object3D | null = hit.object; node; node=node.parent) if (!node.visible) return false;
      return true;
    });
    if (hits.length && (!best || hits[0].distance < best.d)) best = { id, d: hits[0].distance };
  }
  return best?.id ?? null;
}
