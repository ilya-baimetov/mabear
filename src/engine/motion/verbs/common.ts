// Shared pieces for verb implementations: actor motion styles, clip sampling, base poses.
// A verb implementation is pure: (localT, params, ctx) → PoseLayer (spec §7.4).
import type { Quat } from "../../api";
import type { ActorClip, ActorId, Emotion, Posture, PropId, Vec3 } from "../../../shared/schema";
import { GENERATED_PROPORTIONS } from "../generatedProportions";
export {SEAT_HEIGHT} from '../../../shared/bible/set';
import { CLIPS } from "../clips.generated";
import {
  IDENTITY, addLayer, clamp01, overrideLayer, qaxis, qeuler, qmul, qnorm, qrot, qslerp, smooth,
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
  /** constant Hips drop (m): Bears carry their weight low (drops standing hips via knee bend) */
  hipsDrop: number;
  /** body thickness lying down (m) — hips height when lying flat */
  lieHeight: number;
  /** Root height for a shoulder ride (m), calibrated to keep the rider clear of the stylized head. */
  shoulderHeight: number;
  breathRate: number;
  breathDepth: number;
  /** leg proportions of the rig (metres; mirrors src/engine/characters/*.ts skeleton) for foot FK / ground lock */
  leg: { x: number; y: number; thigh: number; shin: number; ankle: number; toe: number };
  /** natural gait cadence (cycles/s = two steps) the stride length adapts to */
  cadence: { walk: number; run: number; tiptoe: number };
  /** approximate body mass (kg) driving acceleration ramp, jump crouch, and fall restitution */
  mass: number;
  /** nominal locomotion accel/decel ramp duration (s) */
  accelRamp: number;
  /** yaw turn inertia multiplier relative to Masha (1.0) */
  turnScale: number;
  /** natural secondary spring frequency (Hz) */
  springFreq: number;
  /** 2nd-order spring damping ratio ζ ∈ (0, 1) */
  springDamping: number;
  /** lateral turn banking and longitudinal accel lean multiplier */
  bankGain: number;
}

export const STYLES: Record<ActorId, ActorStyle> = {
  masha: {
    height: 1.0, hipHeight: 0.36, timeScale: 1.15, bounce: 1.0, stance: 0.02, armOut: 0.14, hipsDrop: 0, lieHeight: 0.1,
    shoulderHeight: 0.58, breathRate: 0.32, breathDepth: 0.8,
    leg: { x: 0.062, y: -0.02, thigh: 0.15, shin: 0.14, ankle: 0.05, toe: 0.06 },
    cadence: { walk: 1.6, run: 2.3, tiptoe: 1.1 },
    mass: 22, accelRamp: 0.24, turnScale: 1.0, springFreq: 3.5, springDamping: 0.36, bankGain: 1.1,
  },
  bear: {
    height: 2.4, hipHeight: 0.72, timeScale: 0.8, bounce: 0.35, stance: 0.09, armOut: 0.46, hipsDrop: 0.035, lieHeight: 0.32,
    shoulderHeight: 2.28, breathRate: 0.2, breathDepth: 1.3,
    leg: { x: 0.22, y: -0.03, thigh: 0.32, shin: 0.27, ankle: 0.1, toe: 0.15 },
    cadence: { walk: 0.72, run: 1.15, tiptoe: 0.6 },
    mass: 280, accelRamp: 0.50, turnScale: 1.8, springFreq: 1.9, springDamping: 0.50, bankGain: 0.55,
  },
  // the Wolves (stand-ins on Bear's rig, lanky): long light legs, quick sneaky cadence, a slight hunch (knees soft)
  wolf_a: wolfStyle(2.05, 62, 0.30, 0.85, 3.1, 0.40, 1.0),
  wolf_b: wolfStyle(1.93, 52, 0.28, 0.82, 3.3, 0.38, 1.05),
  lady_bear: guestStyle(2.15, 0.9, 0.35, 0.4, {
    hipsDrop: 0.055, stance: 0.075, breathRate: 0.22, breathDepth: 1.15,
    mass: 220, accelRamp: 0.46, turnScale: 1.65, springFreq: 2.1, springDamping: 0.52, bankGain: 0.65,
  }),
  hare: guestStyle(0.85, 1.35, 1.2, 0.18, {
    stance: 0.03, breathRate: 0.36, breathDepth: 0.85,
    mass: 10, accelRamp: 0.20, turnScale: 0.75, springFreq: 4.0, springDamping: 0.32, bankGain: 1.2,
  }),
  rosie: guestStyle(1.05, 1.0, 0.85, 0.32, {
    stance: 0.055, breathRate: 0.30, breathDepth: 1.05,
    mass: 36, accelRamp: 0.28, turnScale: 1.15, springFreq: 2.8, springDamping: 0.30, bankGain: 0.9,
  }),
  squirrel: guestStyle(0.65, 1.5, 1.3, 0.16, {
    stance: 0.025, breathRate: 0.40, breathDepth: 0.8,
    mass: 4, accelRamp: 0.18, turnScale: 0.70, springFreq: 4.4, springDamping: 0.34, bankGain: 1.25,
  }),
  rival_bear: guestStyle(2.55, 1.0, 0.4, 0.46, {
    hipsDrop: 0.065, stance: 0.085, breathRate: 0.21, breathDepth: 1.3,
    mass: 310, accelRamp: 0.45, turnScale: 1.70, springFreq: 2.2, springDamping: 0.55, bankGain: 0.70,
  }),
};

for (const [id, proportions] of Object.entries(GENERATED_PROPORTIONS)) Object.assign(STYLES[id as ActorId],proportions);

/** Personality defaults; geometric dimensions are calibrated above from the shipped models. */
function guestStyle(
  height: number,
  timeScale: number,
  bounce: number,
  armOut: number,
  phys: Partial<ActorStyle> = {},
): ActorStyle {
  const k = height;
  return {
    height, hipHeight: .38*k, timeScale, bounce, stance: .04, armOut, hipsDrop: 0,
    lieHeight: .13*k, shoulderHeight: .72*k, breathRate: .28, breathDepth: 1,
    leg: { x: .08*k, y: -.02*k, thigh: .16*k, shin: .15*k, ankle: .05*k, toe: .08*k },
    cadence: { walk: timeScale, run: timeScale*1.6, tiptoe: timeScale*.7 },
    mass: 40*k, accelRamp: .28, turnScale: 1, springFreq: 3.0, springDamping: .40, bankGain: 1.0,
    ...phys,
  };
}

/** Wolf style at a variant height; leg lengths mirror src/engine/characters/wolf.ts (base 2.0 m, scaled uniformly). */
function wolfStyle(
  height: number,
  mass: number,
  accelRamp: number,
  turnScale: number,
  springFreq: number,
  springDamping: number,
  bankGain: number,
): ActorStyle {
  const k = height / 2.0;
  const r = (n: number) => Math.round(n * k * 1000) / 1000;
  return {
    height, hipHeight: r(.8), timeScale: 1.05, bounce: .65, stance: .065, armOut: .24, hipsDrop: .015, lieHeight: r(.23),
    shoulderHeight: r(1.375), breathRate: .3, breathDepth: 1,
    leg: { x: r(.135), y: r(-.05), thigh: r(.35), shin: r(.33), ankle: r(.07), toe: r(.185) },
    cadence: { walk: .95, run: 1.5, tiptoe: .8 },
    mass, accelRamp, turnScale, springFreq, springDamping, bankGain,
  };
}

/** Motion family of an actor: Masha (small, agile), Bear (big, weighty), Wolf (lanky, sneaky) or Rosie (buoyant pig). */
export type Persona = "masha" | "bear" | "wolf" | "rosie";
export function persona(actor: ActorId): Persona {
  if (actor === "rosie") return "rosie";
  return ["masha", "hare", "squirrel"].includes(actor) ? "masha" : ["bear", "lady_bear", "rival_bear"].includes(actor) ? "bear" : "wolf";
}
/** Pick a per-persona value (so light visitors and Rosie never fall into Bear's heavy branch by accident). */
export function byPersona<T>(actor: ActorId, masha: T, bear: T, wolf: T, rosie?: T): T {
  const p = persona(actor);
  if (p === "rosie") return rosie !== undefined ? rosie : masha;
  return p === "masha" ? masha : p === "bear" ? bear : wolf;
}

// ---------- leg forward kinematics (actor-local frame: x = left, y = up, z = forward) ----------

/** Lowest sole point of each foot (heel / ball) for a pose, in the actor's local frame. */
export function feetPoints(bones: Pose, hipsOffset: Vec3, style: ActorStyle): { left: Vec3[]; right: Vec3[] } {
  const L = style.leg;
  const H = bones.Hips ?? IDENTITY;
  const hip: Vec3 = [hipsOffset[0], style.hipHeight + hipsOffset[1], hipsOffset[2]];
  const side = (s: 1 | -1, n: "Left" | "Right"): Vec3[] => {
    const add = (a: Vec3, q: Quat, v: Vec3): Vec3 => {
      const r = qrot(q, v);
      return [a[0] + r[0], a[1] + r[1], a[2] + r[2]];
    };
    const up = add(hip, H, [s * L.x, L.y, 0]);
    const R1 = qmul(H, bones[`${n}UpLeg`] ?? IDENTITY);
    const knee = add(up, R1, [0, -L.thigh, 0]);
    const R2 = qmul(R1, bones[`${n}Leg`] ?? IDENTITY);
    const ankle = add(knee, R2, [0, -L.shin, 0]);
    const R3 = qmul(R2, bones[`${n}Foot`] ?? IDENTITY);
    return [add(ankle, R3, [0, -L.ankle, -0.35 * L.toe]), add(ankle, R3, [0, -L.ankle, L.toe])];
  };
  return { left: side(1, "Left"), right: side(-1, "Right") };
}

/** Standing leg style: stance widened (hip abduction) and, for Bear, knees bent to carry the weight low. */
export function styleLegs(bones: Pose, style: ActorStyle): Pose {
  const out: Pose = { ...bones };
  const pre = (b: string, q: Quat) => { out[b] = qmul(q, out[b] ?? IDENTITY); };
  const post = (b: string, q: Quat) => { out[b] = qmul(out[b] ?? IDENTITY, q); };
  pre("LeftUpLeg", rz(style.stance));
  pre("RightUpLeg", rz(-style.stance));
  if (style.hipsDrop > 0) {
    const a = Math.acos(Math.max(-1, 1 - style.hipsDrop / style.hipHeight));
    for (const side of ["Left", "Right"]) {
      pre(`${side}UpLeg`, rx(-a));
      post(`${side}Leg`, rx(2 * a));
      post(`${side}Foot`, rx(-a));
    }
  }
  return out;
}

/** Height of the lowest sole point (0 = touching the ground). */
export function lowestFoot(bones: Pose, hipsOffset: Vec3, style: ActorStyle): number {
  const f = feetPoints(bones, hipsOffset, style);
  let m = Infinity;
  for (const p of [...f.left, ...f.right]) m = Math.min(m, p[1]);
  return m;
}

/** Surface heights (m) an actor sits or lies on at a mark; everything else is the ground. */
/** (Porch and pier are 0: the stage already raises actors standing on them — walkHeightAt.) */

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
  /** mean path speed of the locomotion clip (m/s); 0 when unknown */
  speed?: number;
  /** yaw rate (rad/s) of an in-place turn — drives the foot shuffle */
  turnRate?: number;
  /** move-phase local time after pre-walk turnDur (s) */
  moveT?: number;
  /** duration of move phase after pre-walk turnDur (s) */
  moveDur?: number;
  /** instantaneous path speed (m/s) */
  vel?: number;
  /** longitudinal acceleration along path (m/s²) */
  aLong?: number;
  /** lateral centripetal acceleration v²κ (m/s²) */
  aLat?: number;
  /** yaw angular velocity vκ or turnRate (rad/s) */
  omega?: number;
  /** prop currently held by the actor (for heavy-carry counter-lean) */
  holding?: PropId | null;
  /** posture before the clip and after it */
  fromPosture: Posture;
  posture: Posture;
  /** target direction in the actor's local frame (x = left, y = up, z = forward), or null */
  targetLocal: Vec3 | null;
  /** height of the surface under the actor (bench, hammock…) for sit/sleep */
  seat: number;
  /** Furniture-specific pelvis and leg fit, calibrated against shipped meshes. */
  seatProfile?: 'armchair';
  seatClearance?: number;
  seatForward?: number;
  /** Back-surface clearance for a raised lying support. */
  lieClearance?: number;
}

export type VerbImpl = (localT: number, params: ClipParams, ctx: VerbCtx) => PoseLayer;
export type VerbKind = "clip" | "procedural" | "clip+procedural";

// ---------- clip sampling (no AnimationMixer: pure function of time) ----------

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
/** Upper body without the head: RobotExpressive's head moves are robotic (full head spins), so heads stay procedural. */
export const UPPER_NO_HEAD = UPPER.filter((b) => b !== "Head" && b !== "Neck");
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

/**
 * Both arms raised along a FORWARD arc (never out to the sides through a T-pose): s = 0 hanging at the sides,
 * 1 overhead with the elbows bent. `reach` 0..1 = how far overhead (1 ≈ straight up).
 */
export function raiseArms(s: number, reach = 1, elbowEnd = 0.9): Pose {
  const k = Math.max(0, Math.min(1, s));
  const down = 1.25 + (-1.2 * reach - 1.25) * k; // elevation below horizontal: 1.25 (down) → about -1.2 (up)
  const fwd = 0.1 + 1.25 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - 0.6 * k) + 0.35 * k; // swing up in front
  const elbow = 0.3 + (elbowEnd - 0.3) * k;
  return pose(arm("Left", down, fwd, elbow), arm("Right", down, fwd, elbow));
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

/** Smoothly stepped noise: holds a random value for ~`period` s, then eases to the next (looking around). */
export function steppedNoise(t: number, period: number, seed: number): number {
  const x = t / period;
  const i = Math.floor(x);
  const f = smooth(clamp01((x - i) / 0.35));
  const a = hash1(i * 7.13 + seed * 31.7) * 2 - 1;
  const b = hash1((i + 1) * 7.13 + seed * 31.7) * 2 - 1;
  return a + (b - a) * f;
}

/** Standing base: the Mixamo idle clip, with persona-tuned fidgets (light agile Masha/Hare/Squirrel,
 *  buoyant Rosie, sneaky Wolves, or slow weighty Bears). */
export function idleBase(ctx: VerbCtx, amount = 1): PoseLayer {
  const { style, t, actor } = ctx;
  const p = persona(actor);
  let base = sampleClip("xbot_idle", t * byPersona(actor, 1.25, 0.7, 1.0, 1.05), style, true);
  const seed = actor === "wolf_b" ? 9 : actor === "hare" ? 17 : actor === "squirrel" ? 29 : actor === "lady_bear" ? 13 : actor === "rival_bear" ? 23 : 0;
  if (p === "wolf") {
    // sneaky and twitchy: a soft hunch, quick glances over the shoulder, restless weight shifts, a foot tap now and then
    const a = amount;
    const look = steppedNoise(t, 1.1, 7 + seed) * 0.6 * a;
    const tilt = steppedNoise(t + 0.4, 1.7, 8 + seed) * 0.14 * a;
    const shift = (0.7 * noise1(t * 0.9, 11 + seed) + 0.3 * Math.sin(t * 1.9)) * a;
    const tapPh = (t * 0.29 + seed * 0.13) % 1;
    const tap = tapPh > 0.85 ? Math.abs(Math.sin(((tapPh - 0.85) / 0.15) * Math.PI * 3)) * a : 0;
    base = addLayer(base, {
      Hips: rz(0.04 * shift),
      Spine: rx(0.05),
      Spine1: qmul(rx(0.08), rz(-0.04 * shift)),
      Spine2: qmul(rx(0.04), ry(look * 0.12)),
      Neck: qmul(rx(-0.08), ry(look * 0.35)),
      Head: qmul(ry(look * 0.5), rz(tilt)),
      LeftLeg: rx(0.1 * Math.max(0, -shift)), RightLeg: rx(0.1 * Math.max(0, shift) + 0.25 * tap),
      RightUpLeg: rx(-0.12 * tap),
      RightFoot: rx(-0.3 * tap),
    });
    // hands held a little forward (scheming paws), fingers-to-chin readiness without a full gesture
    base = preRotate(base, { LeftArm: rx(-0.18 - 0.05 * noise1(t * 0.7, 13 + seed)), RightArm: rx(-0.16 - 0.05 * noise1(t * 0.7, 14 + seed)) });
  } else if (p === "masha") {
    // never still: Masha, Hare and Squirrel share light agile rocking, quick alert head snaps and occasional spot hops
    const a = amount;
    const quick = actor === "squirrel" ? 1.25 : actor === "hare" ? 1.12 : 1.0;
    const rockW = 0.5 + 0.5 * noise1(t * 0.23, 5 + seed); // phases of rocking vs. looking around
    const rock = Math.sin(t * 3.4 * quick + seed) * rockW * a;
    const shift = (0.6 * noise1(t * 0.6 * quick, 1 + seed) + 0.4 * Math.sin(t * 1.3 * quick)) * a;
    const look = steppedNoise(t, 1.4 / quick, 2 + seed) * 0.55 * a;
    const tilt = steppedNoise(t + 0.7, 1.9 / quick, 3 + seed) * 0.16 * a;
    const armSwing = (Math.sin(t * 3.4 * quick - 0.5 + seed) * 0.18 * rockW + noise1(t * 0.8, 6 + seed) * 0.1) * a;
    base = addLayer(base, {
      Hips: qmul(rx(0.03 * rock), rz(0.05 * shift)),
      Spine: qmul(rz(-0.05 * shift), rx(-0.03 * rock)),
      Spine2: ry(look * 0.15),
      Neck: ry(look * 0.35),
      Head: qmul(ry(look * 0.5), rz(tilt)),
      LeftFoot: rx(Math.max(0, rock) * 0.45 - Math.max(0, -rock) * 0.2),
      RightFoot: rx(Math.max(0, rock) * 0.45 - Math.max(0, -rock) * 0.2),
      LeftLeg: rx(Math.max(0, -shift) * 0.25), RightLeg: rx(Math.max(0, shift) * 0.25),
      LeftUpLeg: rx(-Math.max(0, -shift) * 0.12), RightUpLeg: rx(-Math.max(0, shift) * 0.12),
    });
    // arms swing with the rocking, elbows loose (pre-rotation about the body's x axis = forward/back)
    base = preRotate(base, { LeftArm: rx(-armSwing), RightArm: rx(-armSwing * 0.8), LeftForeArm: ry(-0.15 - 0.1 * rockW * a), RightForeArm: ry(0.15 + 0.1 * rockW * a) });
    // an occasional little bounce on the spot (knees dip, then a lift)
    const hopPh = (t * 0.37 + seed * 0.11) % 1;
    const hop = hopPh > 0.9 ? Math.sin(((hopPh - 0.9) / 0.1) * Math.PI) * a : 0;
    base = addLayer(base, { LeftLeg: rx(0.35 * hop), RightLeg: rx(0.35 * hop), LeftUpLeg: rx(-0.18 * hop), RightUpLeg: rx(-0.18 * hop) });
    base.lift = (base.lift ?? 0) + Math.max(0, Math.sin(((hopPh - 0.9) / 0.1) * Math.PI * 2 - 0.6)) * 0.03 * style.bounce * a * (hopPh > 0.9 ? 1 : 0);
  } else if (p === "rosie") {
    // buoyant bouncy pig weight: upbeat rhythmic sway, soft springy knee bob, cheerful head tilts
    const a = amount;
    const sway = Math.sin(t * 2.1) * a;
    const bounce = Math.abs(Math.sin(t * 2.1)) * a;
    const look = steppedNoise(t, 2.0, 19) * 0.4 * a;
    base = addLayer(base, {
      Hips: qmul(rz(0.042 * sway), rx(0.02 * (bounce - 0.5))),
      Spine: rz(-0.032 * sway),
      Spine2: rx(-0.025 + 0.02 * bounce),
      Neck: ry(look * 0.35),
      Head: qmul(ry(look * 0.55), rz(0.08 * Math.sin(t * 1.05))),
      LeftLeg: rx(0.12 * bounce + 0.08 * Math.max(0, -sway)),
      RightLeg: rx(0.12 * bounce + 0.08 * Math.max(0, sway)),
      LeftUpLeg: rx(-0.06 * bounce),
      RightUpLeg: rx(-0.06 * bounce),
    });
    base = preRotate(base, { LeftArm: rx(-0.08 * sway), RightArm: rx(0.08 * sway) });
    base.lift = (base.lift ?? 0) + bounce * 0.008 * a;
  } else {
    // patient and heavy Bears (bear, lady_bear, rival_bear): slow weight shift side to side, settling sway
    const sway = Math.sin(t * 0.8) * amount;
    const look = steppedNoise(t, 3.2, 4 + seed) * 0.3 * amount;
    base = addLayer(base, {
      Hips: rz(0.03 * sway),
      Spine1: rz(-0.022 * sway),
      Spine2: rx(-0.02),
      Neck: ry(look * 0.4),
      Head: qmul(ry(look * 0.6), rz(0.04 * Math.sin(t * 0.37))),
      LeftLeg: rx(0.08 * Math.max(0, -sway)), RightLeg: rx(0.08 * Math.max(0, sway)),
    });
  }
  return relaxArms(base, actor);
}

/** Natural standing arms: elbows never dead straight, upper arms slightly away from the body (likeness review). */
export const RELAXED_ELBOW: Record<Persona, number> = { masha: 0.22, bear: 0.3, wolf: 0.32, rosie: 0.26 };
export const RELAXED_ABDUCTION: Record<Persona, number> = { masha: 0.06, bear: 0.05, wolf: 0.07, rosie: 0.08 };
export function relaxArms(L: PoseLayer, actor: ActorId): PoseLayer {
  const p = persona(actor);
  const e = RELAXED_ELBOW[p];
  const ab = RELAXED_ABDUCTION[p];
  const bones: Pose = { ...L.bones };
  bones.LeftForeArm = qmul(bones.LeftForeArm ?? IDENTITY, ry(-e));
  bones.RightForeArm = qmul(bones.RightForeArm ?? IDENTITY, ry(e));
  bones.LeftArm = qmul(rz(ab), bones.LeftArm ?? IDENTITY);
  bones.RightArm = qmul(rz(-ab), bones.RightArm ?? IDENTITY);
  return { ...L, bones };
}

/** Pre-multiply rotations (in the parent's frame): swings a limb without changing its own bend. */
export function preRotate(L: PoseLayer, pre: Pose): PoseLayer {
  const bones: Pose = { ...L.bones };
  for (const b of Object.keys(pre)) bones[b] = qmul(pre[b], bones[b] ?? IDENTITY);
  return { ...L, bones };
}

/** Ramp in over `a` seconds and out over `b` seconds within a clip of length dur. */
export function envelope(localT: number, dur: number, a = 0.25, b = 0.25): number {
  return Math.min(smooth(localT / Math.max(a, 1e-3)), smooth((dur - localT) / Math.max(b, 1e-3)));
}
