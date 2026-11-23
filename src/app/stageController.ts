import type { StageStats } from "../engine/api";
import type { ActorId } from "../shared/schema";

export interface StageController {
  closeup: (actor: ActorId | null, angle?: number) => void;
  stats: () => StageStats | null;
  wide: (pos: [number, number, number], look: [number, number, number], fov?: number) => void;
  resetRemixCamera: () => void;
}

let activeController: StageController | null = null;

/** Register the mounted 3D stage controller. Returns a cleanup function that only clears its own registration. */
export function registerStageController(controller: StageController): () => void {
  activeController = controller;
  return () => {
    if (activeController === controller) {
      activeController = null;
    }
  };
}

/** Read the currently mounted 3D stage controller, if any. */
export function getStageController(): StageController | null {
  return activeController;
}
