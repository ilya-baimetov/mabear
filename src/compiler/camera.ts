// Auto-cinematographer (spec §7.5). Pure and deterministic (seeded PRNG).
import type { ActorId, CameraCue, Shot, Vec2 } from "../shared/schema";

export interface CameraBeatInfo {
  start: number;
  dur: number;
  actor: ActorId;
  verb: string;
  shot: Shot;
  /** actor position at beat start / end */
  from: Vec2;
  to: Vec2;
  /** the other actor's position during the beat */
  other: Vec2;
  hasLine: boolean;
  emotion: string;
}

export interface CameraPlanInput {
  duration: number;
  beats: CameraBeatInfo[];
  /** actor positions at segment start */
  start: Record<ActorId, Vec2>;
  isFirst: boolean;
  cameraSeed: number;
}

export function planCamera(input: CameraPlanInput): CameraCue[] {
  return [];
}
