// Shared pieces for verb implementations: actor motion styles, clip sampling, base poses.
// A verb implementation is pure: (localT, params, ctx) → PoseLayer (spec §7.4).
import type { Quat } from "../../api";
import type { ActorClip, ActorId, Emotion, Posture, Vec3 } from "../../../shared/schema";
import { CLIPS } from "../clips.generated";
import {
  IDENTITY, addLayer, clamp01, overrideLayer, qaxis, qeuler, qmul, qnorm, qslerp, smooth,
  type Pose, type PoseLayer,
} from "../blend";

export type ClipParams = ActorClip["params"];

/** Motion personality per character (spec §7.3): Masha quick and bouncy, Bear slow and weighty. */
export interface ActorStyle {
  height: number;
  /** Hips height above the ground at rest (metres) — scales clip root motion and posture offsets */
  hipHeight: number;
  /** playback rate for gesture clips (Bear < 1 = slower, weightier) */
  timeScale: number;
  /** extra vertical bounce multiplier for gaits and idle */
  bounce: number;
  /** stance widening (rad, hip abduction) */
  stance: number;
  /** arm abduction so arms clear the body (rad) */
  armOut: number;
  /** constant Hips drop (m): Bear carries his weight low */
  hipsDrop: number;
  /** body thickness lying down (m) — hips height when lying flat */
  lieHeight: number;
  /** shoulder height (m) — where Masha rides when carried */
  shoulderHeight: number;
  breathRate: number;
  breathDepth: number;
}

export const STYLES: Record<ActorId, ActorStyle> = {
  masha: { height: 1.0, hipHeight: 0.36, timeScale: 1.15, bounce: 1.0, stance: 0.02, armOut: 0.12, hipsDrop: 0, lieHeight: 0.1, shoulderHeight: 0.58, breathRate: 0.32, breathDepth: 0.8 },
  bear: { height: 2.4, hipHeight: 0.92, timeScale: 0.8, bounce: 0.35, stance: 0.08, armOut: 0.22, hipsDrop: 0.035, lieHeight: 0.32, shoulderHeight: 1.72, breathRate: 0.2, breathDepth: 1.2 },
};

/** Surface heights (m) an actor sits or lies on at a mark; everything else is the ground. */
export const SEAT_HEIGHT: Record<string, number> = { bench: 0.45, porch: 0.3, hammock: 0.62, swing: 0.45, table: 0.45, woodpile: 0.4 };

export interface VerbCtx {
  actor: ActorId;
  style: ActorStyle;
  /** clip duration (s) */
  dur: number;
  emotion: Emotion;
  /** global episode time — drives fidgets and noise continuously across clips */
  t: number;
  /** metres travelled along the path at localT (locomotion) */
  dist: number;
  /** radians turned so far during the turn-in-place (locomotion) */
  turned: number;
  /** posture before the clip and after it */
  fromPosture: Posture;
  posture: Posture;
  /** target direction in the actor's local frame (x = left, y = up, z = forward), or null */
  targetLocal: Vec3 | null;
  /** height of the surface under the actor (bench, hammock…) for sit/sleep */
  seat: number;
}

export type VerbImpl = (localT: number, params: ClipParams, ctx: VerbCtx) => PoseLayer;
export type VerbKind = "clip" | "procedural" | "clip+procedural";

// ---------- clip sampling (no AnimationMixer: pure function of time) ----------

export function hasClip(name: string): boolean {
  return name in CLIPS;
}

/** Sample a baked clip at time `time` (s). Loops wrap; one-shots clamp. Hips offset in metres for `style`. */
export function sampleClip(name: string, time: number, style: ActorStyle, loop?: boolean): PoseLayer {
  const c = CLIPS[name];
  if (!c) return { bones: {}, hipsOffset: [0, 0, 0] };
  const isLoop = loop ?? c.loop;
  let u = time / c.dur;
  if (isLoop) u = u - Math.floor(u);
  else u = clamp01(u);
  const fpos = u * (c.frames - 1);
  const f0 = Math.min(c.frames - 1, Math.floor(fpos));
  const f1 = Math.min(c.frames - 1, f0 + 1);
  const k = fpos - f0;
  const bones: Pose = {};
  for (const b of Object.keys(c.bones)) {
    const a = c.bones[b];
    if (a.length === 4) {
      bones[b] = [a[0], a[1], a[2], a[3]];
      continue;
    }
    const q0: Quat = [a[f0 * 4], a[f0 * 4 + 1], a[f0 * 4 + 2], a[f0 * 4 + 3]];
    const q1: Quat = [a[f1 * 4], a[f1 * 4 + 1], a[f1 * 4 + 2], a[f1 * 4 + 3]];
    bones[b] = qslerp(q0, q1, k);
  }
  const h = c.hips;
  const hk = (i: number) => (h[f0 * 3 + i] + (h[f1 * 3 + i] - h[f0 * 3 + i]) * k) * style.hipHeight;
  return { bones, hipsOffset: [hk(0), hk(1), hk(2)] };
}

/** Last frame of a pose clip (Xbot sad/sneak poses store a neutral frame 0 and the pose in the last frame). */
export function poseClip(name: string, style: ActorStyle): PoseLayer {
  const c = CLIPS[name];
  return sampleClip(name, c ? c.dur : 0, style, false);
}

export const UPPER = ["Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"];
export const LOWER = ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"];
export const ARMS = ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"];

/** Take `bones` of `top` over `base` (weight w). Upper-body-only clips (RobotExpressive) use this. */
export function mask(base: PoseLayer, top: PoseLayer, bones: string[], w = 1): PoseLayer {
  const over: Pose = {};
  for (const b of bones) over[b] = top.bones[b] ?? IDENTITY;
  return overrideLayer(base, over, w);
}

// ---------- tiny deterministic noise (no Math.random) ----------

export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
/** Smooth value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 57.3);
  const b = hash1(i + 1 + seed * 57.3);
  return (a + (b - a) * smooth(f)) * 2 - 1;
}

// ---------- named rotations in our rest frame (T-pose, +z forward, +x = character's left) ----------

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
export const rx = (a: number) => qaxis(X, a);
export const ry = (a: number) => qaxis(Y, a);
export const rz = (a: number) => qaxis(Z, a);
export { qeuler, qmul, qnorm };

/** Arm pose for one side: `down` lowers from T-pose (rad), `fwd` swings forward, `elbow` flexes, `twist` rolls. */
export function arm(side: "Left" | "Right", down: number, fwd: number, elbow: number, twist = 0): Pose {
  const s = side === "Left" ? 1 : -1;
  // swing forward about Y first (in the horizontal plane), then lower about the body's Z… expressed as
  // pre-multiplied world-ish rotations so parameters stay intuitive.
  const upper = qmul(ry(-s * fwd), qmul(rz(-s * down), rx(twist)));
  return {
    [`${side}Arm`]: upper,
    [`${side}ForeArm`]: ry(-s * elbow),
  };
}

/** Leg pose: hip flexion (thigh forward, rad), knee flexion, hip abduction (outward), ankle. */
export function leg(side: "Left" | "Right", hip: number, knee: number, out = 0, ankle = 0): Pose {
  const s = side === "Left" ? 1 : -1;
  return {
    [`${side}UpLeg`]: qmul(rz(s * out), rx(-hip)),
    [`${side}Leg`]: rx(knee),
    [`${side}Foot`]: rx(ankle),
  };
}

export function pose(...parts: Pose[]): Pose {
  return Object.assign({}, ...parts);
}

export function layer(bones: Pose, hipsOffset: Vec3 = [0, 0, 0], extra: Partial<PoseLayer> = {}): PoseLayer {
  return { bones, hipsOffset, ...extra };
}

/** Relaxed standing arms (arms down at the sides, slight elbow bend). */
export function armsDown(elbow = 0.15): Pose {
  return pose(arm("Left", 1.25, 0.05, elbow), arm("Right", 1.25, 0.05, elbow));
}

/** Standing base: the Mixamo idle clip, with Masha's fidget loop or Bear's slow sway layered on. */
export function idleBase(ctx: VerbCtx, amount = 1): PoseLayer {
  const { style, t, actor } = ctx;
  let base = sampleClip("xbot_idle", t * (actor === "masha" ? 1.25 : 0.75), style, true);
  if (actor === "masha") {
    // rocking on heels, weight shifts, looking around (a never-still fidget loop)
    const rock = Math.sin(t * 2.6) * 0.06 * amount;
    const shift = noise1(t * 0.7, 1) * 0.06 * amount;
    const look = noise1(t * 0.45, 2) * 0.5 * amount;
    const tilt = noise1(t * 0.6, 3) * 0.12 * amount;
    base = addLayer(base, {
      Hips: qmul(rx(rock * 0.5), rz(shift)),
      Spine: rz(-shift * 0.8),
      Neck: ry(look * 0.4),
      Head: qmul(ry(look * 0.6), rz(tilt)),
      LeftFoot: rx(Math.max(0, rock) * 2),
      RightFoot: rx(Math.max(0, rock) * 2),
    }, 1, [0, Math.abs(Math.sin(t * 2.6)) * 0.008 * amount, 0]);
  } else {
    // patient, heavy sway; head drifts slowly
    const sway = Math.sin(t * 0.9) * 0.025 * amount;
    const look = noise1(t * 0.25, 4) * 0.25 * amount;
    base = addLayer(base, { Hips: rz(sway), Spine1: rz(-sway * 0.6), Head: ry(look) });
  }
  return base;
}

/** Ramp in over `a` seconds and out over `b` seconds within a clip of length dur. */
export function envelope(localT: number, dur: number, a = 0.25, b = 0.25): number {
  return Math.min(smooth(localT / Math.max(a, 1e-3)), smooth((dur - localT) / Math.max(b, 1e-3)));
}
