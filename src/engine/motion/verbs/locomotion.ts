// Locomotion verbs: Mixamo walk/run cycles (Xbot clips) driven by the distance actually travelled, with the stride
// length fitted to each rig so planted feet don't slide, plus personality layers: Masha's hops, squash and loose
// arm swing; Bear's heavy footfalls and arms carried clear of his belly. Root motion comes from the compiled path.
import { SPEEDS } from "../../../shared/grammar";
import type { ActorId } from "../../../shared/schema";
import { addLayer, clamp, lerp, qextrap, qmul, qpow, qslerp, smooth, type Pose, type PoseLayer } from "../blend";
import { CLIPS } from "../clips.generated";
import {
  LOWER, STYLES, UPPER, arm, feetPoints, styleLegs, idleBase, mask, persona, poseClip, pose, rx, ry, rz, sampleClip,
  type ActorStyle, type VerbCtx, type VerbImpl,
} from "./common";

/** Legacy per-gait stride factors relative to grammar STRIDE (kept for the compiler's foley spacing). */
export const STRIDE_SCALE = { walk: 1, run: 1.8, tiptoe: 0.6 } as const;

type Gait = "walk" | "run" | "tiptoe";
const CLIP_OF: Record<Gait, string> = { walk: "xbot_walk", run: "xbot_run", tiptoe: "xbot_walk" };

/** Scale the leg swing of a pose (hip and knee rotations) by s — bigger or smaller strides. */
function scaleLegs(bones: Pose, s: number): Pose {
  if (Math.abs(s - 1) < 1e-3) return bones;
  const out: Pose = { ...bones };
  for (const b of ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]) if (out[b]) out[b] = qpow(out[b], b.endsWith("UpLeg") ? s : Math.sqrt(s));
  return out;
}

const SAMPLES = 48;
interface StanceCDF { D: number; cumDist: Float64Array }
const cdfMemo = new Map<string, StanceCDF>();
const contactMemo = new Map<string, number[]>();

/** Per-frame foot samples of a clip cycle on this rig: sole height and fore-aft position of each foot. */
function footTrack(actor: ActorId, clip: string, s: number, kind?: Gait): { h: [number, number]; z: [number, number] }[] {
  const style = STYLES[actor];
  const c = CLIPS[clip];
  const contacts = kind ? contactPhases(actor, clip) : [];
  const out: { h: [number, number]; z: [number, number] }[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const ph = i / SAMPLES;
    const L = sampleClip(clip, ph * c.dur, style, true);
    let bones = scaleLegs(L.bones, s);
    if (kind) bones = styleLegs(gaitLegs(actor, kind, bones, ph, contacts), style);
    const f = feetPoints(bones, [0, 0, 0], style);
    out.push({
      h: [Math.min(f.left[0][1], f.left[1][1]), Math.min(f.right[0][1], f.right[1][1])],
      z: [(f.left[0][2] + f.left[1][2]) / 2, (f.right[0][2] + f.right[1][2]) / 2],
    });
  }
  return out;
}

/**
 * Invertible, strictly monotonic stance arc-length CDF S(ph) integrating the planted-foot backward sweep
 * across each sample interval. Inverting S⁻¹(dist) drives phase at exact local ground speed without mid-stride foot slide.
 */
function stanceCDF(actor: ActorId, clip: string, s: number, kind: Gait): StanceCDF {
  const key = `${actor}|${clip}|${s.toFixed(2)}|${kind}`;
  const hit = cdfMemo.get(key);
  if (hit) return hit;
  const style = STYLES[actor];
  const tr = footTrack(actor, clip, s, kind);
  const eps = 0.025 * style.height;
  const hScale = 0.008 * style.height;
  const rawSteps = new Float64Array(SAMPLES);
  const positive: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = tr[i];
    const b = tr[(i + 1) % SAMPLES];
    const lowA = Math.min(a.h[0], a.h[1]);
    const lowB = Math.min(b.h[0], b.h[1]);
    let num = 0;
    let den = 0;
    for (const f of [0, 1] as const) {
      const dh = 0.5 * ((a.h[f] - lowA) + (b.h[f] - lowB));
      const dz = a.z[f] - b.z[f]; // backward sweep of planted foot in actor-local +Z frame
      if (dh < eps && dz > 0) {
        const w = Math.exp(-dh / hScale);
        num += w * dz;
        den += w;
      }
    }
    const step = den > 1e-6 ? num / den : 0;
    rawSteps[i] = step;
    if (step > 0) positive.push(step);
  }
  positive.sort((x, y) => x - y);
  const medianStep = positive.length ? positive[Math.floor(positive.length / 2)] : (0.1 * style.hipHeight) / SAMPLES;
  const floorStep = Math.max(medianStep * 0.25, (0.1 * style.hipHeight) / SAMPLES);
  const cumDist = new Float64Array(SAMPLES + 1);
  for (let i = 0; i < SAMPLES; i++) {
    // Only clamp airborne/zero-sweep samples so planted stance intervals preserve exact foot-ground speed.
    const ds = rawSteps[i] > floorStep ? rawSteps[i] : floorStep;
    cumDist[i + 1] = cumDist[i] + ds;
  }
  const D = Math.max(cumDist[SAMPLES], 0.1 * style.hipHeight);
  const res = { D, cumDist };
  cdfMemo.set(key, res);
  return res;
}

/** Invert S(ph) via binary search so planted feet track world travel `dist` without mid-stride sliding. */
export function phaseAtDistance(actor: ActorId, clip: string, s: number, kind: Gait, dist: number): number {
  const { D, cumDist } = stanceCDF(actor, clip, s, kind);
  const rem = ((dist % D) + D) % D;
  let lo = 0;
  let hi = SAMPLES - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumDist[mid] <= rem) lo = mid;
    else hi = mid - 1;
  }
  const span = cumDist[lo + 1] - cumDist[lo];
  const frac = span > 1e-9 ? (rem - cumDist[lo]) / span : 0;
  return (lo + frac) / SAMPLES;
}

/** Ground distance covered by one gait cycle of `clip` on this rig with leg scale s (integrated stance sweep). */
export function cycleDistance(actor: ActorId, clip: string, s: number, kind: Gait = clip === "xbot_run" ? "run" : "walk"): number {
  return stanceCDF(actor, clip, s, kind).D;
}

/** Phases (0..1) of the two heel strikes in the clip's cycle (each foot at its most forward point). */
export function contactPhases(actor: ActorId, clip: string): number[] {
  const key = `${actor}|${clip}`;
  const hit = contactMemo.get(key);
  if (hit) return hit;
  const tr = footTrack(actor, clip, 1);
  const res = [0, 1].map((f) => {
    let best = 0;
    for (let i = 1; i < SAMPLES; i++) if (tr[i].z[f] > tr[best].z[f]) best = i;
    return best / SAMPLES;
  }).sort((x, y) => x - y);
  contactMemo.set(key, res);
  return res;
}

/** 1 right at a foot contact, decaying over ~`width` of a cycle (impact / squash driver). */
function impact(ph: number, contacts: number[], width: number): number {
  let v = 0;
  for (const c of contacts) {
    const d = (((ph - c) % 1) + 1) % 1;
    v = Math.max(v, Math.exp(-d / width));
  }
  return v;
}
/** Flight driver: 0 through the stance after each contact, rising to 1 in the airborne part before the next. */
function flight(ph: number, contacts: number[], stance: number): number {
  let best = 1;
  let gap = 0.5;
  for (let i = 0; i < contacts.length; i++) {
    const d = (((ph - contacts[i]) % 1) + 1) % 1;
    if (d < best) {
      best = d;
      const next = contacts[(i + 1) % contacts.length];
      gap = ((((next - contacts[i]) % 1) + 1) % 1) || 0.5;
    }
  }
  const u = Math.min(1, best / gap);
  if (u < stance) return 0;
  const q = (u - stance) / (1 - stance);
  return 4 * q * (1 - q);
}

/** 0 at contacts, 1 halfway to the next contact (flight / bounce driver). */
function between(ph: number, contacts: number[]): number {
  let best = 1;
  let gap = 0.5;
  for (let i = 0; i < contacts.length; i++) {
    const d = (((ph - contacts[i]) % 1) + 1) % 1;
    if (d < best) {
      best = d;
      const next = contacts[(i + 1) % contacts.length];
      gap = ((((next - contacts[i]) % 1) + 1) % 1) || 0.5;
    }
  }
  return Math.sin(Math.min(1, best / gap) * Math.PI);
}

/** Leg-only personality on top of the clip: Masha/Hare/Squirrel knees give on contact and point toes in flight;
 *  Rosie has a buoyant pig trot; Bears absorb heavy footfalls; Wolves have lanky springy rolls. */
function gaitLegs(actor: ActorId, kind: Gait, bones: Pose, ph: number, contacts: number[]): Pose {
  const out: Pose = { ...bones };
  const post = (b: string, a: number) => { if (a) out[b] = qmul(out[b] ?? [0, 0, 0, 1], rx(a)); };
  const imp = impact(ph, contacts, kind === "run" ? 0.06 : 0.08);
  const p = persona(actor);
  if (p === "masha") {
    const sq = imp * (kind === "run" ? 1 : 0);
    // runs: toes point in flight; walks: a light heel-to-toe roll through each step
    const fl = kind === "run" ? flight(ph, contacts, 0.4) : 0.8 * between(ph, contacts);
    for (const side of ["Left", "Right"]) {
      post(`${side}Leg`, 0.22 * sq);
      post(`${side}UpLeg`, -0.1 * sq);
      post(`${side}Foot`, 0.25 * fl);
    }
  } else if (p === "wolf") {
    // lanky and light: springy knees on contact, a long heel-to-toe roll, feet barely thump
    for (const side of ["Left", "Right"]) {
      post(`${side}Leg`, 0.12 * imp);
      post(`${side}UpLeg`, -0.05 * imp);
      post(`${side}Foot`, 0.2 * between(ph, contacts));
    }
  } else if (p === "rosie") {
    // buoyant bouncy pig trot: lively knee rebound and crisp hoof/toe roll
    for (const side of ["Left", "Right"]) {
      post(`${side}Leg`, 0.14 * imp);
      post(`${side}UpLeg`, -0.06 * imp);
      post(`${side}Foot`, 0.22 * between(ph, contacts));
    }
  } else {
    for (const side of ["Left", "Right"]) {
      post(`${side}Leg`, 0.08 * imp);
      post(`${side}UpLeg`, -0.035 * imp);
      post(`${side}Foot`, 0.12 * between(ph, contacts));
    }
  }
  if (kind === "tiptoe") {
    for (const side of ["Left", "Right"]) {
      post(`${side}UpLeg`, -0.15);
      post(`${side}Leg`, 0.21);
      post(`${side}Foot`, 0.27);
    }
  }
  return out;
}

/** Leg scale that brings the cadence near the character's natural rhythm for this speed. */
function legScale(style: ActorStyle, actor: ActorId, gait: Gait, speed: number): number {
  const d1 = cycleDistance(actor, CLIP_OF[gait], 1, gait);
  const s = speed / (d1 * style.cadence[gait]);
  return Math.round(clamp(s, 0.7, gait === "run" ? 1.5 : 1.35) * 20) / 20;
}

function gait(kind0: Gait, ctx: VerbCtx, localT: number): PoseLayer {
  const { actor, style } = ctx;
  const natural = SPEEDS[actor].walk_to;
  const speed = ctx.speed && ctx.speed > 0 ? ctx.speed : kind0 === "run" ? SPEEDS[actor].run_to : kind0 === "tiptoe" ? SPEEDS[actor].tiptoe_to : natural;
  // a walk hurried well past its natural speed (long paths squeezed in time) becomes a run
  const kind: Gait = kind0 === "walk" && speed > natural * 1.7 ? "run" : kind0;
  const clip = CLIP_OF[kind];
  const c = CLIPS[clip];
  // Pre-walk in-place turns emit dist=0 + turnRate and route into shuffle() instead of moonwalking strides.
  if (ctx.dist <= 0.002 || !c) return idleBase(ctx);
  const s = legScale(style, actor, kind, speed);
  const ph = phaseAtDistance(actor, clip, s, kind, ctx.dist);
  const base = sampleClip(clip, ph * c.dur, style, true);
  const contacts = contactPhases(actor, clip);
  let L: PoseLayer = { bones: gaitLegs(actor, kind, scaleLegs(base.bones, s), ph, contacts), hipsOffset: base.hipsOffset, ground: "lock" };
  const imp = impact(ph, contacts, kind === "run" ? 0.06 : 0.08);
  const air = between(ph, contacts);
  const p = persona(actor);

  if (p === "masha") {
    // Masha, Hare and Squirrel: loose energetic arms with overlap, torso squash/stretch, springy hops
    const lag = sampleClip(clip, (ph - 0.06) * c.dur, style, true).bones;
    const amp = kind === "run" ? 1.25 : 1.5;
    const ref = pose(arm("Left", 1.2, 0.1, 0.4), arm("Right", 1.2, 0.1, 0.4));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qextrap(ref[b], lag[b] ?? ref[b], amp);
    L = { ...L, bones: { ...L.bones, ...arms } };
    const sq = imp * (kind === "run" ? 1 : 0.6);
    L = addLayer(L, {
      Spine: rx(0.1 * sq - 0.05 * air),
      Spine2: rx(-0.04 * air),
      Head: qmul(rx(0.06 * sq), rz(0.05 * Math.sin(ph * Math.PI * 2))),
    });
    L.lift = kind === "run" ? 0.05 * flight(ph, contacts, 0.4) * style.bounce : 0;
  } else if (p === "wolf") {
    // lanky: long loose arms swinging with overlap, shoulders hunched forward, head bobbing ahead of the body
    const lag = sampleClip(clip, (ph - 0.05) * c.dur, style, true).bones;
    const amp = kind === "run" ? 1.35 : 1.2;
    const ref = pose(arm("Left", 1.2, 0.2, 0.5), arm("Right", 1.2, 0.2, 0.5));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qextrap(ref[b], lag[b] ?? ref[b], amp);
    L = { ...L, bones: { ...L.bones, ...arms } };
    const sq = imp * (kind === "run" ? 0.8 : 0.4);
    L = addLayer(L, {
      Spine1: rx(0.1 + 0.06 * sq + (kind === "run" ? 0.08 : 0)),
      Neck: rx(-0.08),
      Head: qmul(rx(0.05 * sq - 0.03 * air), rz(0.04 * Math.sin(ph * Math.PI * 2))),
    });
    L.lift = kind === "run" ? 0.04 * flight(ph, contacts, 0.42) * style.bounce : 0;
  } else if (p === "rosie") {
    // buoyant bouncy pig trot: cheerful arm swing, jaunty hip waddle, springy run bounce
    const lag = sampleClip(clip, (ph - 0.05) * c.dur, style, true).bones;
    const ref = pose(arm("Left", 1.15, 0.25, 0.45), arm("Right", 1.15, 0.25, 0.45));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qslerp(ref[b], lag[b] ?? ref[b], 0.9);
    L = { ...L, bones: { ...L.bones, ...arms } };
    const roll = Math.sin(ph * Math.PI * 2) * (kind === "run" ? 0.055 : 0.07);
    const sq = imp * (kind === "run" ? 0.85 : 0.45);
    L = addLayer(L, {
      Hips: rz(roll),
      Spine: rx(0.07 * sq - 0.04 * air),
      Spine1: rz(-roll * 0.65),
      Head: qmul(rz(-roll * 0.35), rx(0.05 * sq - 0.04 * air)),
    });
    L.lift = kind === "run" ? 0.04 * flight(ph, contacts, 0.42) * style.bounce : 0.008 * air * style.bounce;
  } else {
    // heavy Bears (bear, lady_bear, rival_bear): knees absorb contact, torso and head settle a beat later
    const settle = impact(ph - 0.06, contacts, 0.12);
    const roll = Math.sin(ph * Math.PI * 2) * (kind === "run" ? 0.05 : 0.075);
    const ref = pose(arm("Left", 1.15, 0.35, 0.45), arm("Right", 1.15, 0.35, 0.45));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qslerp(ref[b], base.bones[b] ?? ref[b], 0.6);
    L = { ...L, bones: { ...L.bones, ...arms } };
    L = addLayer(L, {
      Hips: rz(roll),
      Spine1: qmul(rz(-roll * 0.7), rx(0.05 * settle)),
      Spine2: rx(0.03 * settle),
      Head: qmul(rz(-roll * 0.3), rx(0.07 * settle)),
    });
    if (kind === "run") L.lift = 0.025 * flight(ph, contacts, 0.45);
  }
  if (kind === "tiptoe") {
    // sneaky: crouched upper body from the Mixamo sneak pose, high knees, up on the toes
    const sneak = poseClip("xbot_sneak", style);
    L = mask(L, sneak, UPPER, 0.85);
    L = addLayer(L, pose(arm("Left", 0.6, 0.9, 1.2, -1.2), arm("Right", 0.6, 0.9, 1.2, -1.2)), 0.6);
    if (p === "wolf") {
      const lift2 = between(ph, contacts);
      L = addLayer(L, { Spine1: rx(0.12), Neck: rx(-0.12), LeftUpLeg: rx(-0.18 * lift2), RightUpLeg: rx(-0.18 * lift2) });
    }
    L.lift = 0;
  }
  // Dynamic lean (accel/brake), lateral banking into curved turns, and head/neck turn lead
  const pitchLean = clamp(((ctx.aLong ?? 0) / 9.81) * 0.15 * (0.7 + 0.3 * style.bankGain), -0.18, 0.22);
  const bankLean = clamp(((ctx.aLat ?? 0) / 9.81) * 0.26 * style.bankGain, -0.26, 0.26);
  const headLead = clamp((ctx.omega ?? 0) * 0.14, -0.35, 0.35);
  if (pitchLean !== 0 || bankLean !== 0 || headLead !== 0) {
    L = addLayer(L, {
      Spine: qmul(rx(pitchLean * 0.55), rz(-bankLean * 0.5)),
      Spine1: qmul(rx(pitchLean * 0.45), rz(-bankLean * 0.35)),
      Spine2: rz(-bankLean * 0.15),
      Neck: ry(headLead * 0.4),
      Head: ry(headLead * 0.6),
    });
  }
  // Align gait start/stop blend cleanly with moveT (after pre-walk turnDur)
  const moveT = ctx.moveT ?? localT;
  const moveDur = ctx.moveDur ?? ctx.dur;
  const w = Math.min(smooth(moveT / 0.25), smooth((moveDur - moveT) / 0.3));
  if (w < 1) {
    const idle = idleBase(ctx);
    const out = mask(idle, L, [...UPPER, ...LOWER], w);
    out.hipsOffset = [lerp(idle.hipsOffset[0], L.hipsOffset[0], w), lerp(idle.hipsOffset[1], L.hipsOffset[1], w), lerp(idle.hipsOffset[2], L.hipsOffset[2], w)];
    out.lift = lerp(idle.lift ?? 0, L.lift ?? 0, w);
    out.ground = w > 0.5 ? L.ground : "lock";
    return out;
  }
  return L;
}

export const walk_to: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);
export const run_to: VerbImpl = (lt, _p, ctx) => gait("run", ctx, lt);
export const tiptoe_to: VerbImpl = (lt, _p, ctx) => gait("tiptoe", ctx, lt);
export const chase: VerbImpl = (lt, _p, ctx) => {
  const L = gait("run", ctx, lt);
  // leaning into the pursuit, glancing at the target
  return addLayer(L, { Spine1: rx(0.08), Head: ry(Math.sin(ctx.t * 3) * 0.1) });
};
export const enter: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);
export const exit: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);

