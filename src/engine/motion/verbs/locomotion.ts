// Locomotion verbs: Mixamo walk/run cycles (Xbot clips) driven by the distance actually travelled, with the stride
// length fitted to each rig so planted feet don't slide, plus personality layers: Masha's hops, squash and loose
// arm swing; Bear's heavy footfalls and arms carried clear of his belly. Root motion comes from the compiled path.
import { SPEEDS } from "../../../shared/grammar";
import type { ActorId } from "../../../shared/schema";
import { addLayer, clamp, lerp, qextrap, qpow, qslerp, smooth, type Pose, type PoseLayer } from "../blend";
import { CLIPS } from "../clips.generated";
import {
  LOWER, STYLES, UPPER, arm, feetPoints, styleLegs, idleBase, mask, poseClip, pose, rx, ry, rz, sampleClip,
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
const strideMemo = new Map<string, number>();
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
 * Ground distance covered by one gait cycle of `clip` on this rig with leg scale s: the backward sweep speed of
 * a planted foot (relative to the hips) × one cycle — playing the cycle at distance/D keeps planted feet still.
 */
export function cycleDistance(actor: ActorId, clip: string, s: number, kind: Gait = clip === "xbot_run" ? "run" : "walk"): number {
  const key = `${actor}|${clip}|${s.toFixed(2)}|${kind}`;
  const hit = strideMemo.get(key);
  if (hit !== undefined) return hit;
  const style = STYLES[actor];
  const tr = footTrack(actor, clip, s, kind);
  const eps = 0.012 * style.height;
  const v: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = tr[i];
    const b = tr[(i + 1) % SAMPLES];
    const low = Math.min(a.h[0], a.h[1]);
    for (const f of [0, 1]) {
      if (a.h[f] - low < eps && b.h[f] - Math.min(b.h[0], b.h[1]) < eps) {
        const dz = (a.z[f] - b.z[f]) * SAMPLES; // backward sweep per cycle
        if (dz > 0) v.push(dz);
      }
    }
  }
  v.sort((x, y) => x - y);
  const d = Math.max(v.length ? v[Math.floor(v.length / 2)] : 0, 0.1 * style.hipHeight);
  strideMemo.set(key, d);
  return d;
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
  return u < stance ? 0 : Math.sin(((u - stance) / (1 - stance)) * Math.PI);
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

/** Leg-only personality on top of the clip: Masha's knees give on contact (squash) and toes point in flight;
 *  Bear's knees absorb each heavy footfall; tiptoe walks on the toes with high knees. Used for the pose AND for
 *  measuring the stride, so the cadence stays matched to the ground. */
function gaitLegs(actor: ActorId, kind: Gait, bones: Pose, ph: number, contacts: number[]): Pose {
  const out: Pose = { ...bones };
  const post = (b: string, a: number) => { if (a) out[b] = qmul2(out[b] ?? [0, 0, 0, 1], rx(a)); };
  const imp = impact(ph, contacts, kind === "run" ? 0.06 : 0.08);
  if (actor === "masha") {
    const sq = imp * (kind === "run" ? 1 : 0);
    // runs: toes point in flight; walks: a light heel-to-toe roll through each step
    const fl = kind === "run" ? flight(ph, contacts, 0.4) : 0.8 * between(ph, contacts);
    for (const side of ["Left", "Right"]) {
      post(`${side}Leg`, 0.22 * sq);
      post(`${side}UpLeg`, -0.1 * sq);
      post(`${side}Foot`, 0.25 * fl);
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
  const moving = ctx.dist > 0.01 || ctx.turned > 0.01;
  if (!moving || !c) return idleBase(ctx);
  const s = legScale(style, actor, kind, speed);
  const D = cycleDistance(actor, clip, s, kind);
  // phase follows the ground actually covered (eased starts/stops included) → planted feet stay put;
  // turning in place before moving shuffles ~2 steps per radian
  const cyc = ctx.dist / D + ctx.turned / (actor === "bear" ? 1.6 : 1.2);
  const ph = cyc - Math.floor(cyc);
  const base = sampleClip(clip, ph * c.dur, style, true);
  const contacts = contactPhases(actor, clip);
  let L: PoseLayer = { bones: gaitLegs(actor, kind, scaleLegs(base.bones, s), ph, contacts), hipsOffset: base.hipsOffset, ground: "lock" };
  const imp = impact(ph, contacts, kind === "run" ? 0.06 : 0.08);
  const air = between(ph, contacts);

  if (actor === "masha") {
    // loose arms with overlap: they trail the legs a little and swing wider
    const lag = sampleClip(clip, (ph - 0.06) * c.dur, style, true).bones;
    const amp = kind === "run" ? 1.25 : 1.5;
    const ref = pose(arm("Left", 1.2, 0.1, 0.4), arm("Right", 1.2, 0.1, 0.4));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qextrap(ref[b], lag[b] ?? ref[b], amp);
    L = { ...L, bones: { ...L.bones, ...arms } };
    // squash on each contact (knees give, chest dips), stretch in between (tall, toes pointed); little hops
    const sq = imp * (kind === "run" ? 1 : 0.6);
    L = addLayer(L, {
      Spine: rx(0.1 * sq - 0.05 * air),
      Spine2: rx(-0.04 * air),
      Head: qmul2(rx(0.06 * sq), rz(0.05 * Math.sin(ph * Math.PI * 2))),
    });
    // little hops: flight between run contacts (a walk's bob comes from the legs alone)
    L.lift = kind === "run" ? 0.05 * flight(ph, contacts, 0.4) * style.bounce : 0;
  } else {
    // heavy footfalls: knees absorb each contact, the torso and head settle a beat later
    const settle = impact(ph - 0.06, contacts, 0.12);
    const roll = Math.sin(ph * Math.PI * 2) * (kind === "run" ? 0.05 : 0.075);
    // arms carried forward and clear of the belly, swinging less behind the body
    const ref = pose(arm("Left", 1.15, 0.35, 0.45), arm("Right", 1.15, 0.35, 0.45));
    const arms: Pose = {};
    for (const b of ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]) arms[b] = qslerp(ref[b], base.bones[b] ?? ref[b], 0.6);
    L = { ...L, bones: { ...L.bones, ...arms } };
    L = addLayer(L, {
      Hips: rz(roll),
      Spine1: qmul2(rz(-roll * 0.7), rx(0.05 * settle)),
      Spine2: rx(0.03 * settle),
      Head: qmul2(rz(-roll * 0.3), rx(0.07 * settle)),
    });
    if (kind === "run") L.lift = 0.025 * flight(ph, contacts, 0.45);
  }
  if (kind === "tiptoe") {
    // sneaky: crouched upper body from the Mixamo sneak pose, high knees, up on the toes
    const sneak = poseClip("xbot_sneak", style);
    L = mask(L, sneak, UPPER, 0.85);
    L = addLayer(L, pose(arm("Left", 0.6, 0.9, 1.2, -1.2), arm("Right", 0.6, 0.9, 1.2, -1.2)), 0.6);
    L.lift = 0;
  }
  // blend in from idle as the first step starts, and settle back into idle as the path eases to a stop
  const w = Math.min(smooth(localT / 0.25), smooth((ctx.dur - localT) / 0.3));
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

function qmul2(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
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

