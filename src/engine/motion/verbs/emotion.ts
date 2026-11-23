// Emotion verbs: procedural on the Mixamo idle; cry uses the Xbot sad pose as its base.
import { addLayer, clamp, clamp01, qmul, smooth, window01 } from "../blend";
import { ARMS, UPPER, arm, byPersona, idleBase, persona, leg, mask, poseClip, pose, preRotate, rx, ry, rz, type VerbImpl } from "./common";

export const laugh: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.2);
  const f = byPersona(ctx.actor, 7, 4.5, 8.5, 6.5); // the Wolves snicker in quick little shakes
  const bob = Math.sin(lt * f * Math.PI) * k;
  const base = idleBase(ctx, 0.3);
  const p = persona(ctx.actor);
  // Masha/Hare/Squirrel: hands to cheeks/belly, bouncing; Bears: paws on belly, slow shoulder shakes
  const arms = p === "bear"
    ? pose(arm("Left", 0.95, 0.9, 1.3), arm("Right", 0.95, 0.9, 1.3))
    : p === "wolf"
    ? pose(arm("Left", 0.65, 1.1, 2.1, -1.0), arm("Right", 1.0, 0.7, 1.2)) // paw over the snout, the other on the belly
    : pose(arm("Left", 0.8, 0.8, 1.6, -0.8), arm("Right", 0.8, 0.8, 1.6, -0.8));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  const out = addLayer(L, {
    Spine: rx(0.08 * bob - 0.06 * k),
    Spine2: rx(-0.08 * k),
    Head: rx(-0.15 * k + 0.08 * bob),
    LeftShoulder: rz(0.06 * bob), RightShoulder: rz(-0.06 * bob),
  });
  return { ...out, lift: Math.abs(bob) * byPersona(ctx.actor, 0.02, 0.008, 0.012, 0.016), face: { emotion: "happy", viseme: "open_wide", visemeWeight: 0.5 + 0.5 * Math.abs(bob), lidClose: 0.45 * k } };
};

export const cry: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.3);
  const sad = mask(idleBase(ctx, 0.2), poseClip("xbot_sad", ctx.style), UPPER, 0.3);
  const sob = Math.max(0, Math.sin(lt * 9)) * k;
  // fists to eyes
  const arms = pose(arm("Left", 0.6, 1.2, 2.2, -1.4), arm("Right", 0.6, 1.2, 2.2, -1.4));
  const L = mask(sad, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  return {
    ...addLayer(L, { Spine2: rx(0.1 * sob), LeftShoulder: rz(0.12 * sob), RightShoulder: rz(-0.12 * sob), Head: rx(0.05 * k) }),
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
  const s = clamp01(u / 0.32);
  const hop = u < 0.32 ? 4 * s * (1 - s) : 0; // ballistic startle hop parabola
  const landTau = Math.max(0, lt - 0.32 * ctx.dur);
  const landAbsorb = u >= 0.32 ? Math.exp(-8 * landTau) * Math.sin(16 * landTau) * window01(u, 0.32, 0.9, 0.06) : 0;
  const base = idleBase(ctx, 0.2);
  const arms = pose(arm("Left", -0.2, 0.5, 1.2, -1.2), arm("Right", -0.2, 0.5, 1.2, -1.2));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, jolt);
  const settleK = Math.max(0, landAbsorb);
  return {
    ...addLayer(L, pose(
      { Spine: rx(-0.2 * jolt + 0.14 * landAbsorb), Head: rx(-0.15 * jolt + 0.1 * landAbsorb) },
      leg("Left", 0.22 * settleK, 0.45 * settleK),
      leg("Right", 0.22 * settleK, 0.45 * settleK),
    ), 1, [0, 0, -0.03 * jolt]),
    lift: hop * byPersona(ctx.actor, 0.08, 0.04, 0.09, 0.065),
    face: { emotion: "surprised", browRaise: jolt, viseme: "o", visemeWeight: jolt },
  };
};

export const scared: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const cower = window01(u, 0, 1, 0.15);
  const peekOut = smooth((u - 0.6) / 0.25);
  // Crisp initial recoil impulse before settling into cower
  const startle = u < 0.28 ? Math.exp(-10 * lt) * Math.sin((u / 0.28) * Math.PI * 2) : 0;
  const base = idleBase(ctx, 0.1);
  const arms = pose(arm("Left", 0.2, 1.3, 2.0 - peekOut, -1.2), arm("Right", 0.2, 1.3, 2.0 - peekOut, -1.2));
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, cower);
  const crouchK = cower * (1 - 0.5 * peekOut);
  const shiver = Math.sin(lt * (ctx.style.springFreq * Math.PI * 3.5)) * 0.004 * (1 - ctx.style.springDamping * 0.4) * cower;
  return {
    ...addLayer(L, pose(
      leg("Left", 0.5 * crouchK, 1.0 * crouchK, 0.1), leg("Right", 0.5 * crouchK, 1.0 * crouchK, 0.1),
      {
        Spine: rx(0.35 * crouchK - 0.18 * startle),
        Head: qmul(rx(0.3 * crouchK - 0.2 * peekOut - 0.1 * startle), ry(0.3 * Math.sin(lt * 5) * peekOut)),
        LeftShoulder: rz(0.22 * crouchK + 0.06 * Math.abs(startle)), RightShoulder: rz(-0.22 * crouchK - 0.06 * Math.abs(startle)),
      },
    ), 1, [0, -0.2 * ctx.style.hipHeight * crouchK + shiver, -0.04 * Math.max(0, startle)]),
    face: { emotion: "scared", browRaise: 0.8 * cower },
  };
};

export const angry_stomp: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const k = window01(u, 0, 1, 0.12);
  // stomps land at 0.3 and 0.7 (matches the grammar's ground_thump foley)
  const lift = (c: number) => Math.max(0, Math.sin(clamp01((u - (c - 0.15)) / 0.15) * Math.PI));
  const recoil = (c: number) => {
    const tau = lt - c * ctx.dur;
    return tau > 0 && u < c + 0.25 ? Math.exp(-13 * tau) * Math.sin(24 * tau) * smooth((c + 0.25 - u) / 0.06) : 0;
  };
  const lL = u < 0.5 ? lift(0.3) : 0;
  const lR = u >= 0.5 ? lift(0.7) : 0;
  const imp = recoil(0.3) + recoil(0.7);
  const weight = clamp(0.7 + 0.35 * Math.sqrt(ctx.style.mass / 60), 0.7, 1.4);
  const base = idleBase(ctx, 0.1);
  const arms = pose(arm("Left", 1.2, -0.25, 0.3), arm("Right", 1.2, -0.25, 0.3), { LeftShoulder: rz(0.15), RightShoulder: rz(-0.15) });
  const L = mask(base, { bones: arms, hipsOffset: [0, 0, 0] }, ARMS, k);
  const absorb = Math.max(0, imp) * weight;
  return {
    ...addLayer(L, pose(
      leg("Left", 0.9 * lL + 0.12 * absorb, 1.3 * lL + 0.24 * absorb),
      leg("Right", 0.9 * lR + 0.12 * absorb, 1.3 * lR + 0.24 * absorb),
      { Spine: rx(0.15 * k + 0.08 * imp * weight), Spine2: rx(0.06 * imp), Head: rx(0.1 * k + 0.1 * imp) },
    ), 1, [0, 0.02 * (lL + lR) - 0.012 * absorb * ctx.style.hipHeight, 0]),
    face: { emotion: "angry", browRaise: -0.8 * k, viseme: "frown", visemeWeight: 0.7 * k },
  };
};

export const sneeze: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const windUp = smooth(u / 0.52) * (1 - smooth((u - 0.52) / 0.06));
  const snap = window01(u, 0.53, 0.95, 0.05);
  const tau = Math.max(0, lt - 0.55 * ctx.dur);
  const recoil = u > 0.55 ? Math.exp(-6.5 * tau) * Math.sin(14 * tau) * smooth((1 - u) / 0.12) : 0;
  const base = idleBase(ctx, 0.2);
  const kneeDip = Math.max(0, snap * 0.22 + recoil * 0.15);
  const L = addLayer(base, pose(
    {
      Spine: rx(-0.18 * windUp + 0.36 * snap + 0.12 * recoil),
      Spine2: rx(-0.12 * windUp + 0.16 * snap + 0.08 * recoil),
      Head: rx(-0.36 * windUp + 0.36 * snap + 0.16 * recoil),
      LeftShoulder: rz(0.16 * windUp), RightShoulder: rz(-0.16 * windUp),
      LeftFoot: rx(-0.12 * windUp), RightFoot: rx(-0.12 * windUp),
    },
    leg("Left", kneeDip * 0.5, kneeDip), leg("Right", kneeDip * 0.5, kneeDip),
  ), 1, [0, 0.015 * windUp - 0.02 * kneeDip, 0.035 * snap]);
  return { ...L, face: { lidClose: Math.max(0.6 * windUp, snap), viseme: snap > 0.1 ? "open_wide" : "o", visemeWeight: Math.max(windUp * 0.6, snap) } };
};

export const sigh: VerbImpl = (lt, _p, ctx) => {
  // a long-suffering sigh: a deep breath in (chest swells, shoulders rise high, head tips back), held a beat,
  // then everything sags out further than it started (Bears are big and slow)
  const u = lt / ctx.dur;
  const big = ctx.actor === "bear" ? 1.4 : byPersona(ctx.actor, 1, 1.3, 1, 1.1);
  const rise = smooth(u / 0.38) * (1 - smooth((u - 0.48) / 0.3));
  const slump = smooth((u - 0.5) / 0.3) * (1 - smooth((u - 0.9) / 0.1));
  const base = idleBase(ctx, 0.15);
  const L = addLayer(base, {
    LeftShoulder: rz((0.32 * rise - 0.1 * slump) * big), RightShoulder: rz((-0.32 * rise + 0.1 * slump) * big),
    // arms keep hanging while the shoulders lift (counter-rotate so they don't flare out)
    LeftArm: rz(-(0.32 * rise) * big * 0.9), RightArm: rz((0.32 * rise) * big * 0.9),
    Spine1: rx((-0.07 * rise + 0.12 * slump) * big),
    Spine2: rx((-0.08 * rise + 0.08 * slump) * big),
    Neck: rx((-0.05 * rise + 0.1 * slump) * big),
    Head: qmul(rx((-0.16 * rise + 0.22 * slump) * big), rz(0.06 * slump)),
  });
  // arms hang heavier as the breath goes out
  const out = preRotate(L, { LeftArm: rz(-0.12 * slump * big), RightArm: rz(0.12 * slump * big) });
  return { ...out, face: { emotion: "annoyed", lidClose: 0.2 * rise + 0.6 * slump, browRaise: 0.4 * rise - 0.3 * slump, viseme: "o", visemeWeight: 0.5 * slump } };
};

