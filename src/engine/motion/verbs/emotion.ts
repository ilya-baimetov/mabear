// Emotion verbs: procedural on the Mixamo idle; cry uses the Xbot sad pose as its base.
import { addLayer, qmul, smooth, window01 } from "../blend";
import { ARMS, UPPER, arm, idleBase, leg, mask, poseClip, pose, rx, ry, rz, type VerbImpl } from "./common";

export const laugh: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.2);
  const f = ctx.actor === "masha" ? 7 : 4.5;
  const bob = Math.sin(lt * f * Math.PI) * k;
  const base = idleBase(ctx, 0.3);
  // Masha: hands to cheeks/belly, bouncing; Bear: paws on belly, slow shoulder shakes
  const arms = ctx.actor === "bear"
    ? pose(arm("Left", 0.95, 0.9, 1.3), arm("Right", 0.95, 0.9, 1.3))
    : pose(arm("Left", 0.8, 0.8, 1.6, -0.8), arm("Right", 0.8, 0.8, 1.6, -0.8));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  const out = addLayer(L, {
    Spine: rx(0.08 * bob - 0.06 * k),
    Spine2: rx(-0.08 * k),
    Head: rx(-0.25 * k + 0.08 * bob),
    LeftShoulder: rz(0.06 * bob), RightShoulder: rz(-0.06 * bob),
  }, 1, [0, Math.abs(bob) * (ctx.actor === "masha" ? 0.02 : 0.015), 0]);
  return { ...out, face: { emotion: "happy", viseme: "open_wide", visemeWeight: 0.5 + 0.5 * Math.abs(bob), lidClose: 0.45 * k } };
};

export const cry: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.3);
  const sad = mask(idleBase(ctx, 0.2), poseClip("xbot_sad", ctx.style), UPPER, 0.5);
  const sob = Math.max(0, Math.sin(lt * 9)) * k;
  // fists to eyes
  const arms = pose(arm("Left", 0.6, 1.2, 2.2, -1.4), arm("Right", 0.6, 1.2, 2.2, -1.4));
  const L = mask(sad, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return {
    ...addLayer(L, { Spine2: rx(0.1 * sob), LeftShoulder: rz(0.12 * sob), RightShoulder: rz(-0.12 * sob), Head: rx(0.15 * k) }),
    face: { emotion: "sad", viseme: "frown", visemeWeight: 0.7 * k },
  };
};

export const sulk: VerbImpl = (lt, _p, ctx) => {
  const k = smooth(lt / 0.5) * smooth((ctx.dur - lt) / 0.3 + 0.0001);
  const base = idleBase(ctx, 0.2);
  // arms crossed, chin up and away, turned from the others
  const arms = pose(arm("Left", 0.9, 1.25, 1.75), arm("Right", 0.85, 1.3, 1.65));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  const out = addLayer(L, { Head: qmul(ry(0.4 * k), rx(-0.15 * k)), Spine: rx(-0.05 * k) });
  out.yawOffset = 0.6 * smooth(lt / 0.6);
  return { ...out, face: { emotion: "annoyed", viseme: "frown", visemeWeight: 0.6 * k } };
};

export const surprised: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const jolt = window01(u, 0, 1, 0.12);
  const hop = Math.max(0, Math.sin(Math.min(1, u / 0.3) * Math.PI));
  const base = idleBase(ctx, 0.2);
  const arms = pose(arm("Left", -0.2, 0.5, 1.2, -1.2), arm("Right", -0.2, 0.5, 1.2, -1.2));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, jolt);
  return {
    ...addLayer(L, { Spine: rx(-0.2 * jolt), Head: rx(-0.15 * jolt) }, 1, [0, hop * (ctx.actor === "masha" ? 0.08 : 0.05), -0.03 * jolt]),
    face: { emotion: "surprised", browRaise: jolt, viseme: "o", visemeWeight: jolt },
  };
};

export const scared: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const cower = window01(u, 0, 1, 0.15);
  const peekOut = smooth((u - 0.6) / 0.25);
  const base = idleBase(ctx, 0.1);
  const arms = pose(arm("Left", 0.2, 1.3, 2.0 - peekOut, -1.2), arm("Right", 0.2, 1.3, 2.0 - peekOut, -1.2));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, cower);
  const crouchK = cower * (1 - 0.5 * peekOut);
  return {
    ...addLayer(L, pose(
      leg("Left", 0.5 * crouchK, 1.0 * crouchK, 0.1), leg("Right", 0.5 * crouchK, 1.0 * crouchK, 0.1),
      { Spine: rx(0.35 * crouchK), Head: qmul(rx(0.3 * crouchK - 0.2 * peekOut), ry(0.3 * Math.sin(lt * 5) * peekOut)), LeftShoulder: rz(0.2 * crouchK), RightShoulder: rz(-0.2 * crouchK) },
    ), 1, [0, -0.2 * ctx.style.hipHeight * crouchK + Math.sin(lt * 40) * 0.004 * cower, 0]),
    face: { emotion: "scared", browRaise: 0.8 * cower },
  };
};

export const angry_stomp: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const k = window01(u, 0, 1, 0.12);
  // stomps land at 0.3 and 0.7 (matches the grammar's ground_thump foley)
  const lift = (c: number) => Math.max(0, Math.sin(Math.max(0, Math.min(1, (u - (c - 0.15)) / 0.15)) * Math.PI));
  const lL = u < 0.5 ? lift(0.3) : 0;
  const lR = u >= 0.5 ? lift(0.7) : 0;
  const base = idleBase(ctx, 0.1);
  const arms = pose(arm("Left", 1.2, -0.25, 0.3), arm("Right", 1.2, -0.25, 0.3), { LeftShoulder: rz(0.15), RightShoulder: rz(-0.15) });
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return {
    ...addLayer(L, pose(
      leg("Left", 0.9 * lL, 1.3 * lL), leg("Right", 0.9 * lR, 1.3 * lR),
      { Spine: rx(0.15 * k), Head: rx(0.1 * k) },
    ), 1, [0, 0.02 * (lL + lR), 0]),
    face: { emotion: "angry", browRaise: -0.8 * k, viseme: "frown", visemeWeight: 0.7 * k },
  };
};

export const sneeze: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const windUp = smooth(u / 0.55) * (1 - smooth((u - 0.55) / 0.06));
  const snap = window01(u, 0.55, 0.95, 0.06);
  const base = idleBase(ctx, 0.2);
  const L = addLayer(base, {
    Spine: rx(-0.15 * windUp + 0.35 * snap),
    Spine2: rx(-0.1 * windUp + 0.15 * snap),
    Head: rx(-0.35 * windUp + 0.35 * snap),
    LeftShoulder: rz(0.15 * windUp), RightShoulder: rz(-0.15 * windUp),
  }, 1, [0, 0.015 * windUp, 0.03 * snap]);
  return { ...L, face: { lidClose: Math.max(0.6 * windUp, snap), viseme: snap > 0.1 ? "open_wide" : "o", visemeWeight: Math.max(windUp * 0.6, snap) } };
};

export const sigh: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const rise = smooth(u / 0.4) * (1 - smooth((u - 0.4) / 0.4));
  const slump = smooth((u - 0.45) / 0.35) * (1 - smooth((u - 0.9) / 0.1));
  const base = idleBase(ctx, 0.2);
  const L = addLayer(base, {
    LeftShoulder: rz(0.25 * rise - 0.08 * slump), RightShoulder: rz(-0.25 * rise + 0.08 * slump),
    Spine1: rx(-0.08 * rise + 0.12 * slump),
    Head: rx(-0.15 * rise + 0.25 * slump),
  }, 1, [0, 0.01 * rise - 0.015 * slump, 0]);
  return { ...L, face: { emotion: "annoyed", lidClose: 0.5 * slump, viseme: "o", visemeWeight: 0.4 * slump } };
};

