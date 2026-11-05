// Gesture verbs. wave = RobotExpressive clip (upper body); nod / shake_head = Mixamo Xbot clips;
// the rest (clap, point, shrug, Bear's signature facepalm, hug) are procedural on the idle base.
import { addLayer, clamp, qfromTo, qmul, window01, type PoseLayer } from "../blend";
import {
  ARMS, UPPER, UPPER_NO_HEAD, arm, idleBase, mask, pose, rx, ry, rz, sampleClip, type VerbCtx, type VerbImpl,
} from "./common";

/** Play a gesture clip over the idle lower body. Bear plays clips slower. */
function gestureClip(name: string, lt: number, ctx: VerbCtx, bones = UPPER, loop?: boolean): PoseLayer {
  const rate = ctx.style.timeScale;
  const top = sampleClip(name, lt * rate, ctx.style, loop);
  return mask(idleBase(ctx, 0.4), top, bones, 1);
}

export const wave: VerbImpl = (lt, _p, ctx) => {
  // the robot wave raises the right arm; loop the clip's middle (the waving part) for long beats
  const L = gestureClip("robot_wave", lt, ctx, UPPER_NO_HEAD, true);
  const out = addLayer(L, ctx.actor === "masha" ? { Spine: rz(Math.sin(lt * 6) * 0.05) } : {}, 1, [0, ctx.actor === "masha" ? Math.abs(Math.sin(lt * 6)) * 0.015 : 0, 0]);
  return { ...out, face: { browRaise: 0.3 } };
};

export const clap: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.2);
  const period = ctx.actor === "masha" ? 0.3 : 0.42;
  const open = 0.5 + 0.5 * Math.cos((lt / period) * Math.PI * 2); // 0 = hands together
  const base = idleBase(ctx, 0.5);
  const arms = pose(arm("Left", 0.55, 1.05 - 0.35 * open, 0.85 + 0.25 * open, -0.6), arm("Right", 0.55, 1.05 - 0.35 * open, 0.85 + 0.25 * open, -0.6));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return { ...addLayer(L, {}, 1, [0, ctx.actor === "masha" ? Math.abs(Math.sin(lt * 5)) * 0.012 : 0, 0]), face: { emotion: "happy" } };
};

/** Arm pointing toward a local-frame direction (from the shoulder). */
function pointArm(dir: [number, number, number], side: "Left" | "Right") {
  const rest: [number, number, number] = side === "Left" ? [1, 0, 0] : [-1, 0, 0];
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return qfromTo(rest, [dir[0] / l, dir[1] / l, dir[2] / l]);
}

export const point_at: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.25);
  const d = ctx.targetLocal ?? [0, 0.2, 1];
  // point with the arm on the target's side; keep the elevation modest
  const side = d[0] >= 0 ? "Left" : "Right";
  const dir: [number, number, number] = [d[0], clamp(d[1], -0.4, 0.8), Math.max(0.2, d[2])];
  const base = idleBase(ctx, 0.5);
  const q = pointArm(dir, side);
  const over = { [`${side}Arm`]: q, [`${side}ForeArm`]: [0, 0, 0, 1] as [number, number, number, number] };
  const L = mask(base, { bones: over, hipsOffset: [0, 0, 0] }, [`${side}Arm`, `${side}ForeArm`], k);
  return { ...L, face: { browRaise: 0.4 * k } };
};

export const look_at: VerbImpl = (_lt, _p, ctx) => {
  // evaluate() turns the head toward params.lookAt; the body leans in a little
  const base = idleBase(ctx, 0.4);
  const d = ctx.targetLocal;
  const turn = d ? clamp(Math.atan2(d[0], d[2]), -0.8, 0.8) * 0.3 : 0;
  return addLayer(base, { Spine1: ry(turn), Spine2: ry(turn * 0.5) });
};

export const nod: VerbImpl = (lt, _p, ctx) => gestureClip("xbot_agree", lt, ctx, ["Spine2", "Neck", "Head"]);
export const shake_head: VerbImpl = (lt, _p, ctx) => {
  const L = gestureClip("xbot_headshake", lt, ctx, ["Spine2", "Neck", "Head"]);
  // exaggerate a bit for cartoon readability
  const k = window01(lt, 0, ctx.dur, 0.15);
  return addLayer(L, { Head: ry(Math.sin(lt * (ctx.actor === "masha" ? 14 : 8)) * 0.25 * k) });
};

export const shrug: VerbImpl = (lt, _p, ctx) => {
  const s = window01(lt / ctx.dur, 0.05, 0.95, 0.3);
  const base = idleBase(ctx, 0.4);
  const arms = pose(arm("Left", 1.0, 0.35, 1.3, 0.9), arm("Right", 1.0, 0.35, 1.3, 0.9), { LeftShoulder: rz(0.35), RightShoulder: rz(-0.35) });
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, s);
  return { ...addLayer(L, { Head: rz(0.2 * s), Neck: rx(-0.1 * s) }), face: { browRaise: 0.8 * s } };
};

export const facepalm: VerbImpl = (lt, _p, ctx) => {
  // Bear's signature: paw slowly up to the face, head sinks into it and shakes, long-suffering
  const u = lt / ctx.dur;
  const up = window01(u, 0.0, 0.92, 0.25);
  const base = idleBase(ctx, 0.3);
  const shake = Math.sin(lt * 4) * 0.12 * window01(u, 0.3, 0.8, 0.1);
  const arms = pose(arm("Right", 0.15, 1.35, 2.3, -1.45), { RightHand: rz(0.3) });
  let L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ["RightArm", "RightForeArm", "RightHand"], up);
  L = addLayer(L, { Spine2: rx(0.12 * up), Neck: rx(0.25 * up), Head: qmul(rx(0.2 * up), ry(shake)), LeftShoulder: rz(-0.1 * up) });
  return { ...L, face: { lidClose: 0.85 * up, emotion: "annoyed" } };
};

export const hug: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const k = window01(u, 0, 1, 0.2);
  const squeeze = 0.12 * Math.sin(u * Math.PI * 3) * k;
  const base = idleBase(ctx, 0.2);
  // Bear bends down to Masha; Masha reaches up
  const reachDown = ctx.actor === "bear" ? 0.45 : -0.35;
  const arms = pose(arm("Left", reachDown * 0.8, 1.2, 1.1 + squeeze), arm("Right", reachDown * 0.8, 1.2, 1.1 + squeeze));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return { ...addLayer(L, { Spine: rx((ctx.actor === "bear" ? 0.4 : -0.1) * k), Head: rz(0.2 * k) }), face: { emotion: "happy", lidClose: 0.5 * k } };
};

