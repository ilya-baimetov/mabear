// Locomotion verbs: Mixamo walk/run cycles (Xbot clips) driven by distance travelled, plus procedural
// personality layers (Masha's bounce, Bear's waddle, tiptoe crouch). Root motion comes from the compiled path.
import { SPEEDS, STRIDE } from "../../../shared/grammar";
import { addLayer, lerp, smooth } from "../blend";
import { CLIPS } from "../clips.generated";
import {
  LOWER, UPPER, arm, idleBase, mask, poseClip, pose, rx, ry, rz, sampleClip,
  type VerbCtx, type VerbImpl,
} from "./common";

/** Metres per foot contact relative to grammar STRIDE, per gait (one gait cycle = 2 contacts). */
export const STRIDE_SCALE = { walk: 1, run: 1.8, tiptoe: 0.6 } as const;

function gaitTime(clip: string, dist: number, stride: number): number {
  const c = CLIPS[clip];
  const cycles = dist / (2 * stride);
  return cycles * (c ? c.dur : 1);
}

/** Leg cycle phase in [0,1) for a gait (for bounce layers). */
function phase(dist: number, stride: number): number {
  const p = dist / (2 * stride);
  return p - Math.floor(p);
}

function gait(kind0: "walk" | "run" | "tiptoe", ctx: VerbCtx, localT: number) {
  // a walk hurried well past its natural speed (long paths squeezed in time) becomes a run
  const natural = SPEEDS[ctx.actor].walk_to;
  const kind = kind0 === "walk" && (ctx.speed ?? 0) > natural * 1.7 ? "run" : kind0;
  const stride = STRIDE[ctx.actor] * STRIDE_SCALE[kind];
  // turning in place before moving: shuffle the feet proportionally to the turn
  const d = ctx.dist + ctx.turned * 0.25 * ctx.style.hipHeight;
  const clip = kind === "run" ? "xbot_run" : "xbot_walk";
  let L = sampleClip(clip, gaitTime(clip, d, stride), ctx.style, true);
  const ph = phase(d, stride);
  const moving = ctx.dist > 0.01 || ctx.turned > 0.01;
  if (!moving) {
    return idleBase(ctx);
  }
  // blend from idle at the very start so the first step doesn't pop
  const startW = smooth(localT / 0.25);
  if (ctx.actor === "masha") {
    // bouncy, quick: extra hop on every step, arms swing wider
    const hop = Math.abs(Math.sin(ph * Math.PI * 2)) * (kind === "run" ? 0.04 : 0.025) * ctx.style.bounce;
    L = addLayer(L, {
      LeftArm: rz(0.12), RightArm: rz(-0.12),
      Head: rz(Math.sin(ph * Math.PI * 2) * 0.06),
    }, 1, [0, hop, 0]);
  } else {
    // weighty waddle: hips roll side to side, torso counter-sways, heavier knees
    const roll = Math.sin(ph * Math.PI * 2) * (kind === "run" ? 0.05 : 0.08);
    L = addLayer(L, {
      Hips: rz(roll),
      Spine1: rz(-roll * 0.7),
      Head: rz(-roll * 0.3),
      LeftLeg: rx(0.08), RightLeg: rx(0.08),
    }, 1, [0, -Math.abs(Math.sin(ph * Math.PI * 2)) * 0.03, 0]);
  }
  if (kind === "tiptoe") {
    // sneaky: crouched upper body from the Mixamo sneak pose, small high-knee steps, on the toes
    const sneak = poseClip("xbot_sneak", ctx.style);
    L = mask(L, sneak, UPPER, 0.85);
    L = addLayer(L, {
      LeftUpLeg: rx(-0.25), RightUpLeg: rx(-0.25),
      LeftLeg: rx(0.35), RightLeg: rx(0.35),
      LeftFoot: rx(0.35), RightFoot: rx(0.35),
      ...pose(arm("Left", 0.6, 0.9, 1.2, -1.2), arm("Right", 0.6, 0.9, 1.2, -1.2)),
    }, 0.6, [0, -0.08 * ctx.style.hipHeight, 0]);
  }
  // …and settle back into idle as the path eases to a stop
  const w = Math.min(startW, smooth((ctx.dur - localT) / 0.3));
  if (w < 1) {
    const idle = idleBase(ctx);
    const out = mask(idle, L, [...UPPER, ...LOWER], w);
    out.hipsOffset = [lerp(idle.hipsOffset[0], L.hipsOffset[0], w), lerp(idle.hipsOffset[1], L.hipsOffset[1], w), lerp(idle.hipsOffset[2], L.hipsOffset[2], w)];
    return out;
  }
  return L;
}

export const walk_to: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);
export const run_to: VerbImpl = (lt, _p, ctx) => gait("run", ctx, lt);
export const tiptoe_to: VerbImpl = (lt, _p, ctx) => gait("tiptoe", ctx, lt);
export const chase: VerbImpl = (lt, _p, ctx) => {
  const L = gait("run", ctx, lt);
  // arms reaching forward a little: playful pursuit
  return addLayer(L, { Spine1: rx(0.08), Head: ry(Math.sin(ctx.t * 3) * 0.1) });
};
export const enter: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);
export const exit: VerbImpl = (lt, _p, ctx) => gait("walk", ctx, lt);
