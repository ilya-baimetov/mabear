// Body verbs and held postures (sit, lie, carried). Dance uses the RobotExpressive clip for the upper body;
// the rest is procedural on top of the Mixamo idle.
import type { Quat } from "../../api";
import { addLayer, blendLayers, clamp01, easeInOut, qmul, smooth, window01, type PoseLayer } from "../blend";
import {
  UPPER, UPPER_NO_HEAD, arm, byPersona, idleBase, raiseArms, layer, leg, mask, noise1, pose, poseClip, rx, ry, rz,
  sampleClip, type VerbCtx, type VerbImpl,
} from "./common";

/** Lying on the back, head toward the actor's local -x (right), face up — reads in profile from the front camera. */
const LIE: Quat = [-0.5, 0.5, 0.5, 0.5];

// ---------- held postures ----------

export function standPose(ctx: VerbCtx): PoseLayer {
  return idleBase(ctx);
}

export function sitPose(ctx: VerbCtx): PoseLayer {
  const { style, t } = ctx;
  const h = style.hipHeight;
  const breathe = Math.sin(t * style.breathRate * Math.PI * 2) * 0.015;
  const swing = ctx.actor === "masha" ? Math.sin(t * 3.1) * 0.25 : 0; // Masha swings her dangling feet
  if (ctx.seat > 0.15) {
    // on a bench / step: thighs forward, shins hanging
    return layer(pose(
      leg("Left", 1.5, 1.3 + swing, 0.08), leg("Right", 1.5, 1.3 - swing, 0.08),
      arm("Left", 1.0, 0.55, 0.7), arm("Right", 1.0, 0.55, 0.7),
      { Spine: rx(0.05 + breathe), Head: ry(noise1(t * 0.4, 7) * 0.3) },
    ), [0, ctx.seat + 0.04 * h - h, -0.12 * h]);
  }
  // on the ground: legs out in front
  return layer(pose(
    leg("Left", 1.45, 0.25, 0.12), leg("Right", 1.45, 0.3, 0.12),
    arm("Left", 1.1, 0.2, 0.3), arm("Right", 1.1, 0.2, 0.3),
    { Spine: rx(0.12 + breathe), Head: ry(noise1(t * 0.4, 7) * 0.3) },
  ), [0, 0.06 * h - h + style.lieHeight * 0.4, -0.25 * h]);
}

export function liePose(ctx: VerbCtx): PoseLayer {
  const { style, t } = ctx;
  const h = style.hipHeight;
  const br = Math.sin(t * style.breathRate * 0.8 * Math.PI * 2);
  return layer(pose(
    { Hips: LIE, Spine1: rx(-0.04 * br), Spine2: rx(-0.05 * br), Head: qmul(rx(-0.15), ry(0.35)) },
    leg("Left", 0.15, 0.25, 0.06), leg("Right", 0.25, 0.35, 0.04),
    arm("Left", 1.2, 0.7, 0.9), arm("Right", 1.2, 0.7, 0.9),
  ), [0, ctx.seat + style.lieHeight - h, 0], { face: { lidClose: 1, emotion: "sleepy" } });
}

/** Masha riding on Bear's shoulders: legs astride, hands resting on his head. */
export function carriedPose(ctx: VerbCtx): PoseLayer {
  const { t } = ctx;
  const kick = Math.sin(t * 2.4) * 0.15;
  return layer(pose(
    leg("Left", 1.35, 1.4 + kick, 0.55), leg("Right", 1.35, 1.4 - kick, 0.55),
    arm("Left", 0.9, 1.2, 1.0, -0.6), arm("Right", 0.9, 1.2, 1.0, -0.6),
    { Spine: rx(0.1), Head: ry(noise1(t * 0.5, 9) * 0.4) },
  ), [0, -ctx.style.hipHeight * 0.85, 0]);
}

export function postureLayer(posture: string, ctx: VerbCtx): PoseLayer {
  if (posture === "sit") return sitPose(ctx);
  if (posture === "sleep") return liePose(ctx);
  if (posture === "carried") return carriedPose(ctx);
  return standPose(ctx);
}

function transition(from: PoseLayer, to: PoseLayer, k: number): PoseLayer {
  return blendLayers(from, to, easeInOut(k));
}

// ---------- verbs ----------

export const idle: VerbImpl = (_lt, _p, ctx) => idleBase(ctx);

export const jump: VerbImpl = (lt, _p, ctx) => jumpPose(lt, ctx);
function jumpPose(lt: number, ctx: VerbCtx): PoseLayer {
  const u = lt / ctx.dur;
  const h = ctx.style.hipHeight;
  const peak = byPersona(ctx.actor, 0.28, 0.2, 0.3);
  const crouch = window01(u, 0, 0.36, 0.12) + window01(u, 0.7, 1, 0.12);
  const air = u > 0.32 && u < 0.76 ? Math.sin(((u - 0.32) / 0.44) * Math.PI) : 0;
  const base = mask(idleBase(ctx, 0.3), { bones: raiseArms(air, 0.8, 0.4), hipsOffset: [0, 0, 0] }, ["LeftArm", "LeftForeArm", "RightArm", "RightForeArm"], smooth(Math.min(1, u * 8)));
  const tuck = air * 0.6;
  const L0 = addLayer(base, pose(
    leg("Left", 0.6 * crouch + tuck, 1.2 * crouch + tuck * 1.2), leg("Right", 0.6 * crouch + tuck, 1.2 * crouch + tuck * 1.2),
    { Spine: rx(0.25 * crouch - 0.1 * air), LeftArm: rz(-0.3 * crouch), RightArm: rz(0.3 * crouch) },
  ));
  // crouch and landing are ground-locked (knees bent lower the hips); the flight is a lift on top
  void h;
  return { ...L0, ground: "lock", lift: peak * air };
}

export const spin: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const turn = easeInOut((u - 0.08) / 0.84) * Math.PI * 2;
  const out = window01(u, 0, 1, 0.15);
  const base = idleBase(ctx, 0.2);
  const L = addLayer(base, pose(
    { LeftArm: rz(0.6 * out), RightArm: rz(-0.6 * out), Head: ry(-0.3 * Math.sin(u * Math.PI)), Spine: rz(0.1 * Math.sin(u * Math.PI * 2)) },
  ));
  L.lift = Math.sin(u * Math.PI) * 0.04 * ctx.style.bounce;
  L.yawOffset = turn;
  return L;
};

export const dance: VerbImpl = (lt, _p, ctx) => {
  const rate = byPersona(ctx.actor, 1.1, 0.75, 1.0);
  const top = sampleClip("robot_dance", lt * rate, ctx.style, true);
  const beat = byPersona(ctx.actor, 2.2, 1.4, 2.0); // knee bounces per second
  const b = Math.abs(Math.sin(lt * beat * Math.PI));
  const sway = Math.sin(lt * beat * Math.PI * 0.5) * 0.12;
  const legs = layer(pose(
    { Hips: rz(sway) },
    leg("Left", 0.25 * b, 0.5 * b, 0.06 - sway * 0.5), leg("Right", 0.25 * b, 0.5 * b, 0.06 + sway * 0.5),
  ), [Math.sin(lt * beat * Math.PI * 0.5) * 0.04 * ctx.style.hipHeight, -0.07 * ctx.style.hipHeight * b, 0]);
  const L = mask(legs, top, UPPER_NO_HEAD);
  L.bones.Head = qmul(rz(Math.sin(lt * beat * Math.PI) * 0.18), rx(0.08 * b));
  if (ctx.actor === "bear") L.yawOffset = Math.sin(lt * 0.8) * 0.5; // the old circus routine: slow turns
  return L;
};

export const sit: VerbImpl = (lt, _p, ctx) => {
  const seated = ctx.fromPosture === "sit";
  const from = seated ? sitPose(ctx) : standPose(ctx);
  const k = lt / Math.min(0.9, ctx.dur);
  return { ...transition(from, sitPose(ctx), k), groundW: seated ? 0 : 1 - easeInOut(k) };
};

export const stand_up: VerbImpl = (lt, _p, ctx) => {
  if (ctx.fromPosture === "stand" || ctx.fromPosture === "offstage") return idleBase(ctx); // already up
  const from = ctx.fromPosture === "sleep" ? liePose(ctx) : ctx.fromPosture === "sit" ? sitPose(ctx) : sitPose({ ...ctx, seat: 0 });
  const L = transition(from, standPose(ctx), lt / ctx.dur);
  // a push-up effort lean forward halfway
  return { ...addLayer(L, { Spine: rx(0.35 * window01(lt / ctx.dur, 0, 1, 0.4)) }), groundW: easeInOut(lt / ctx.dur) };
};

export const fall_down: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const h = ctx.style.hipHeight;
  const stand = idleBase(ctx, 0.2);
  const down = sitPose({ ...ctx, seat: 0 });
  // 0–0.4: slip with flailing arms; 0.4: bump; 0.4–0.75 dazed; then get up unless the posture stays sit
  const flail = window01(u, 0, 0.5, 0.1);
  const slip = addLayer(stand, pose(
    { Spine: rx(-0.4 * flail), LeftArm: rz(1.4 * flail + Math.sin(lt * 18) * 0.4 * flail), RightArm: rz(-1.4 * flail - Math.sin(lt * 18) * 0.4 * flail) },
    leg("Left", 0.9 * flail, 0.2), leg("Right", 0.5 * flail, 0.3),
  ), 1, [0, 0.03 * flail, 0]);
  const fallK = smooth((u - 0.15) / 0.25);
  const getUp = ctx.posture === "sit" ? 0 : smooth((u - 0.75) / 0.25);
  let L = blendLayers(slip, down, fallK);
  // dazed head wobble
  const daze = window01(u, 0.4, 0.85, 0.08);
  L = addLayer(L, { Head: qmul(rz(Math.sin(lt * 9) * 0.2 * daze), rx(0.1 * daze)) }, 1, [0, Math.max(0, Math.sin((u - 0.4) * 30)) * 0.03 * h * daze, 0]);
  if (getUp > 0) L = blendLayers(L, stand, getUp);
  return { ...L, groundW: (1 - fallK) * (1 - getUp) + getUp, face: { browRaise: 0.6 * daze } };
};

export const sleep: VerbImpl = (lt, _p, ctx) => {
  const from = ctx.fromPosture === "sleep" ? liePose(ctx) : ctx.fromPosture === "sit" ? sitPose(ctx) : standPose(ctx);
  const k = ctx.fromPosture === "sleep" ? 1 : lt / Math.min(1.4, ctx.dur * 0.4);
  const L = transition(from, liePose(ctx), k);
  return { ...L, groundW: ctx.fromPosture === "stand" ? 1 - easeInOut(k) : 0, face: { lidClose: smooth(k), emotion: "sleepy" } };
};

export const wake_up: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const lie = ctx.fromPosture === "sleep" ? liePose(ctx) : standPose(ctx);
  const sitUp = sitPose({ ...ctx, seat: ctx.fromPosture === "sleep" ? ctx.seat : 0 });
  const stand = standPose(ctx);
  let L = u < 0.45 ? transition(lie, sitUp, u / 0.45) : transition(sitUp, stand, (u - 0.45) / 0.4);
  const stretch = window01(u, 0.55, 1, 0.15);
  L = mask(L, { bones: raiseArms(stretch, 0.95, 1.0), hipsOffset: [0, 0, 0] }, ["LeftArm", "LeftForeArm", "RightArm", "RightForeArm"], smooth(stretch * 4));
  L = addLayer(L, { Spine1: rx(-0.2 * stretch), Head: rx(-0.25 * stretch) });
  const gw = ctx.fromPosture === "sleep" ? (u < 0.45 ? 0 : easeInOut((u - 0.45) / 0.4)) : 1;
  return { ...L, groundW: gw, face: { lidClose: 1 - smooth(u / 0.4), emotion: "sleepy", viseme: "o", visemeWeight: stretch } };
};

export const yawn_stretch: VerbImpl = (lt, _p, ctx) => {
  // arms swing up in front and overhead (elbows bent), the back arches, a big yawn, then everything lowers
  const u = lt / ctx.dur;
  const s = easeInOut(clamp01((u - 0.05) / 0.35)) * (1 - easeInOut(clamp01((u - 0.72) / 0.26)));
  const take = smooth(u / 0.06) * smooth((1 - u) / 0.04);
  const base = mask(idleBase(ctx, 0.3), { bones: raiseArms(s, 1, 1.0), hipsOffset: [0, 0, 0] }, ["LeftArm", "LeftForeArm", "RightArm", "RightForeArm"], take);
  const arch = s * (ctx.actor === "bear" ? 1.1 : 1);
  const L = addLayer(base, {
    Spine: rx(-0.14 * arch), Spine1: rx(-0.12 * arch), Spine2: rx(-0.08 * arch), Neck: rx(-0.1 * arch), Head: rx(-0.25 * arch),
    LeftShoulder: rz(0.15 * s), RightShoulder: rz(-0.15 * s),
    LeftFoot: rx(0.25 * s), RightFoot: rx(0.25 * s),
  });
  return { ...L, face: { viseme: "o", visemeWeight: s, lidClose: 0.7 * s } };
};

function crouch(ctx: VerbCtx, depth: number): PoseLayer {
  const sneak = poseClip("xbot_sneak", ctx.style);
  const base = idleBase(ctx, 0.15);
  const L = mask(base, sneak, UPPER, 0.9);
  return addLayer(L, pose(
    leg("Left", 1.0 * depth, 1.9 * depth, 0.15), leg("Right", 1.0 * depth, 1.9 * depth, 0.15),
    { LeftFoot: rx(-0.6 * depth), RightFoot: rx(-0.6 * depth), Spine: rx(0.35 * depth), Head: rx(-0.2 * depth) },
    arm("Left", 0.8, 1.0, 1.4 * depth, -1.0), arm("Right", 0.8, 1.0, 1.4 * depth, -1.0),
  ), 1, [0, -0.45 * ctx.style.hipHeight * depth, 0]);
}

export const hide: VerbImpl = (lt, _p, ctx) => {
  const k = smooth(lt / 0.5);
  const L = blendLayers(idleBase(ctx), crouch(ctx, 1), k);
  // nervous little glances
  return addLayer(L, { Head: ry(noise1(ctx.t * 0.9, 11) * 0.35) });
};

export const peek: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const side = ctx.targetLocal && ctx.targetLocal[0] < 0 ? -1 : 1;
  const lean = window01(u, 0.1, 0.95, 0.25);
  const base = ctx.fromPosture === "stand" ? blendLayers(idleBase(ctx), crouch(ctx, 0.6), 0.6) : crouch(ctx, 0.6);
  return addLayer(base, { Spine: rz(-0.35 * side * lean), Spine1: rz(-0.2 * side * lean), Head: rz(0.4 * side * lean) }, 1, [0.08 * side * lean * ctx.style.hipHeight, 0, 0]);
};

