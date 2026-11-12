// Gesture verbs. wave = RobotExpressive clip (upper body); nod / shake_head = Mixamo Xbot clips;
// the rest (clap, point, shrug, Bear's signature facepalm, hug) are procedural on the idle base.
import { addLayer, clamp, qfromTo, qmul, window01, type PoseLayer } from "../blend";
import {
  ARMS, STYLES, UPPER, UPPER_NO_HEAD, arm, byPersona, idleBase, leg, mask, pose, rx, ry, rz, sampleClip, type VerbCtx, type VerbImpl,
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
  const out = addLayer(L, ctx.actor === "masha" ? { Spine: rz(Math.sin(lt * 6) * 0.05), LeftLeg: rx(0.25 * Math.abs(Math.sin(lt * 6))), RightLeg: rx(0.25 * Math.abs(Math.sin(lt * 6))) } : {});
  return { ...out, lift: ctx.actor === "masha" ? Math.abs(Math.sin(lt * 6 + 0.6)) * 0.012 : 0, face: { browRaise: 0.3 } };
};

export const clap: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.2);
  const period = byPersona(ctx.actor, 0.3, 0.42, 0.32);
  const open = 0.5 + 0.5 * Math.cos((lt / period) * Math.PI * 2); // 0 = hands together
  const base = idleBase(ctx, 0.5);
  const arms = pose(arm("Left", 0.55, 1.05 - 0.35 * open, 0.85 + 0.25 * open, -0.6), arm("Right", 0.55, 1.05 - 0.35 * open, 0.85 + 0.25 * open, -0.6));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return { ...L, lift: ctx.actor === "masha" ? Math.abs(Math.sin(lt * 5)) * 0.015 : 0, face: { emotion: "happy" } };
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
  return addLayer(L, { Head: ry(Math.sin(lt * byPersona(ctx.actor, 14, 8, 12)) * 0.25 * k) });
};

export const shrug: VerbImpl = (lt, _p, ctx) => {
  const s = window01(lt / ctx.dur, 0.05, 0.95, 0.3);
  const base = idleBase(ctx, 0.4);
  // shoulders up, elbows at the sides, forearms and palms turned out (upper arms stay down: no T-pose)
  const arms = pose(arm("Left", 1.35, 0.3, 1.35, 0.9), arm("Right", 1.35, 0.3, 1.35, 0.9), { LeftShoulder: rz(0.3), RightShoulder: rz(-0.3) });
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

export const hug: VerbImpl = (lt, p, ctx) => {
  const u = lt / ctx.dur;
  const k = window01(u, 0, 1, 0.22);
  const base = idleBase(ctx, 0.15);
  const partner=p.target&&p.target in STYLES?STYLES[p.target as keyof typeof STYLES]:null;
  if (partner&&ctx.style.height>partner.height*1.4) {
    // Lower to the smaller partner with the knees. A large forward torso bend
    // buried the child's face even when the roots were correctly separated.
    const rock = Math.sin(lt * 2.2) * 0.018 * k;
    const squeeze = 0.08 * Math.sin(u * Math.PI) * k;
    const arms = pose(arm("Left", 0.55, 1.15, 1.25 + squeeze, -0.2), arm("Right", 0.55, 1.15, 1.25 + squeeze, -0.2));
    const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
    const out = addLayer(L, {
      ...leg('Left',1.18*k,2.36*k,.04*k,-1.18*k),...leg('Right',1.18*k,2.36*k,.04*k,-1.18*k),
      Spine: rx((ctx.fromPosture==='sit'?.44:.07) * k), Spine1: rz(rock), Spine2: rz(rock * 0.6),
      Neck: rx(0.12 * k), Head: qmul(rz(0.12 * k), rx(0.1 * k)),
    });
    return { ...out, face: { emotion: "happy", lidClose: 0.8 * k } };
  }
  // Hands are fitted to the partner's visible body after both rigs are posed.
  const squeeze = 0.15 * Math.sin(u * Math.PI * 3) * k;
  const arms = pose(arm("Left", -0.35, 1.15, 1.0 + squeeze), arm("Right", -0.35, 1.15, 1.0 + squeeze));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  const out = addLayer(L, { Spine: rx(0.03 * k), Head: qmul(rz(0.12 * k), rx(-0.1 * k)) });
  return { ...out, face: { emotion: "happy", lidClose: 0.6 * k } };
};

