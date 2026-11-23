// Lighting blend, interactive objects (door/cupboard), FX cues, and camera evaluation.
import type { FrameState, FxFrame, ObjectContact } from "../api";
import { isInsideHouse } from "../../shared/bible/set";
import { doorHandleAt, doorOpenAt, objectOpenAt, cupboardHandleAt } from "../../shared/interactiveObjects";
import { clamp01, easeInOut, lerp, smooth } from "../../shared/math";
import { ACTOR_IDS, type ActorClip, type CamKey, type PropId, type Segment, type TimeOfDay, type Vec2 } from "../../shared/schema";
import { initialWorldState } from "../../shared/worldState";
import { qaxis, qrot } from "../motion/blend";
import type { Resolved } from "./kinematics";

/** Default wide camera of the yard (empty timeline, or a segment without camera cues). */
export const DEFAULT_CAMERA: CamKey = { pos: [1.4, 2.4, 7.8], look: [-0.8, 1.1, 0.15], fov: 43 };

export function cameraAt(seg: Segment, lt: number): CamKey {
  const cues = seg.camera;
  if (cues.length === 0) return DEFAULT_CAMERA;
  let cue = cues[0];
  for (const c of cues) if (c.start <= lt) cue = c;
  if (lt < cue.start) return cue.from;
  if (cue.from.location && cue.to.location && cue.from.location !== cue.to.location) {
    return lt < (cue.cutAt ?? cue.start + cue.dur * 0.5) ? cue.from : cue.to;
  }
  const k = easeInOut(cue.dur > 0 ? (lt - cue.start) / cue.dur : 1);
  return {
    pos: [lerp(cue.from.pos[0], cue.to.pos[0], k), lerp(cue.from.pos[1], cue.to.pos[1], k), lerp(cue.from.pos[2], cue.to.pos[2], k)],
    look: [lerp(cue.from.look[0], cue.to.look[0], k), lerp(cue.from.look[1], cue.to.look[1], k), lerp(cue.from.look[2], cue.to.look[2], k)],
    fov: lerp(cue.from.fov, cue.to.fov, k),
    location: cue.from.location ?? cue.to.location,
    followActor: cue.from.followActor ?? cue.to.followActor,
  };
}

export function lightingAt(seg: Segment, lt: number): FrameState["lighting"] {
  let from: TimeOfDay = seg.startState.timeOfDay;
  let to: TimeOfDay = from;
  let k = 1;
  const cues = [...seg.lighting].sort((a, b) => a.start - b.start);
  for (const c of cues) {
    if (c.start > lt) break;
    from = k >= 1 ? to : from;
    to = c.timeOfDay;
    k = c.transition > 0 ? clamp01((lt - c.start) / c.transition) : 1;
  }
  if (from === to) k = 1;
  return { from, to, k };
}

export function fxAt(seg: Segment, lt: number): FxFrame[] {
  const out: FxFrame[] = [];
  for (const f of seg.fx) {
    if (lt >= f.start && lt < f.start + f.dur) out.push({ id: f.id, at: f.at, k: f.dur > 0 ? (lt - f.start) / f.dur : 1 });
  }
  return out;
}

export function objectsAt(seg: Segment, lt: number): NonNullable<FrameState["objects"]> {
  return {
    house_door: doorOpenAt(seg, lt),
    kitchen_cupboard: objectOpenAt(seg, lt, "kitchen_cupboard"),
  };
}

function doorContact(seg: Segment, lt: number, pos: Vec2, yaw: number, clipLt: number, dur: number, holding: PropId | null): ObjectContact {
  const inside = isInsideHouse(pos[0], pos[1]);
  const position = doorHandleAt(doorOpenAt(seg, lt), inside);
  let side: 1 | -1 = 1;
  if (!holding) {
    const local = qrot(qaxis([0, 1, 0], -yaw), [position[0] - pos[0], 0, position[2] - pos[1]]);
    side = local[0] >= 0 ? 1 : -1;
  }
  return { position, side, strength: Math.min(smooth(clipLt / 0.25), smooth((dur - clipLt) / 0.25)) };
}

export function objectContactForClip(
  seg: Segment,
  lt: number,
  r: Resolved | null,
  inClip: boolean,
  verb: ActorClip["verb"],
  pos: Vec2,
  finalYaw: number,
  clipLt: number,
  holding: PropId | null,
): { objectContact: ObjectContact } | Record<string, never> {
  if (!inClip || !r || (verb !== "open" && verb !== "close")) return {};
  const contactTarget = r.clip.params.target;
  if (contactTarget === "cupboard") {
    return {
      objectContact: {
        position: cupboardHandleAt(objectOpenAt(seg, lt, "kitchen_cupboard")),
        side: 1 as const,
        strength: Math.min(smooth(clipLt / 0.3), smooth((r.clip.dur - clipLt) / 0.3)),
      },
    };
  }
  if (contactTarget === "door" || contactTarget === "house_door") {
    return { objectContact: doorContact(seg, lt, pos, finalYaw, clipLt, r.clip.dur, holding) };
  }
  return {};
}

export function emptySegment(): Segment {
  const ws = initialWorldState();
  return {
    paragraphId: "", version: 0, duration: 0, startState: ws, endState: ws,
    actorClips: Object.fromEntries(ACTOR_IDS.map((id) => [id, [] as ActorClip[]])) as Segment["actorClips"], dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [],
    ambience: [], ducking: [], lighting: [], fx: [],
  };
}
