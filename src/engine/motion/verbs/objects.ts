// Object verbs: procedural arm work layered on the Mixamo idle (the libraries have no prop clips).
// The held prop rides on the RightHand socket; timings match the grammar's foley rules.
import { addLayer, blendLayers, qmul, smooth, window01 } from "../blend";
import { ARMS, arm, byPersona, idleBase, layer, leg, mask, pose, rx, ry, rz, type VerbCtx, type VerbImpl } from "./common";
import type { Pose } from "../blend";
import {CHARACTER_REACH} from '../../../shared/characterReach';

/** Right arm holding something in front of the chest (used between object verbs). */
export function holdArm(): Pose {
  return arm("Right", 0.9, 0.9, 1.4, -0.9);
}

function armsOver(ctx: VerbCtx, bones: Pose, w: number, idleAmount = 0.4) {
  return mask(idleBase(ctx, idleAmount), { bones, hipsOffset: [0, 0, 0] }, ARMS.filter((b) => b in bones), w);
}

/** The contact solver operates the leaf with the free paw. The other arm keeps
 * the jar steady through closing rather than pointing it toward the cupboard. */
export const cupboard:VerbImpl=(_lt,p,ctx)=>p.item?armsOver(ctx,holdArm(),1):idleBase(ctx,.25);

export const take: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  if(_p.putDown){
    // A ground placement needs a real crouch, while a high bench must not make
    // a short actor bend away from the target. The contact rig solves the arm;
    // bent legs and a level ankle keep the body physically supported here.
    const reach=CHARACTER_REACH[ctx.actor],targetY=_p.lookAt?.[1]??reach.shoulder[1],k=window01(u,0,1,.3);
    const crouch=Math.max(0,Math.min(1,(reach.shoulder[1]-targetY-reach.length*.65)/Math.max(.01,ctx.style.hipHeight*.62)));
    const hip=1.45*crouch*k,knee=2.65*crouch*k,bend=(.06+.72*crouch)*k;
    return addLayer(armsOver(ctx,holdArm(),1),pose({Spine:rx(bend),Spine1:rx(bend*.25),Neck:rx(-.2*crouch*k),Head:rx(-.7*crouch*k)},leg('Left',hip,knee,.06*crouch*k,hip-knee),leg('Right',hip,knee,.06*crouch*k,hip-knee)));
  }
  // reach down/forward, grab at 0.5 (prop_pickup), bring it up to the chest
  const reach = window01(u, 0, 0.75, 0.3);
  const hold = smooth((u - 0.5) / 0.4);
  const reachArm = arm("Right", 1.1, 0.8, 0.2);
  const L = armsOver(ctx, reachArm, reach);
  const H = armsOver(ctx, holdArm(), hold);
  const out = blendLayers(L, H, hold);
  if (_p.pickUpAt === 'house_kitchen'||_p.pickUpAt==='cupboard') {
    // The worktop is near hand height (Masha stands on the helper). A floor
    // pickup's crouch put faces into the food and paws through the apron.
    // Keep the body upright; the contact rig reaches the actual table edge.
    return addLayer(out, pose({ Spine: rx(.06 * reach), Spine1: rx(.02 * reach) }));
  }
  const bend = reach * byPersona(ctx.actor, 0.35, 0.6, 0.5);
  return addLayer(out, pose({ Spine: rx(bend), Spine1: rx(bend * 0.4) }, leg("Left", 0.3 * reach, 0.5 * reach), leg("Right", 0.3 * reach, 0.5 * reach)), 1, [0, -0.08 * ctx.style.hipHeight * reach, 0]);
};

export const give: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const ext = window01(u, 0, 0.95, 0.35);
  // Bear offers low (to Masha), Masha offers up (to Bear)
  const down = byPersona(ctx.actor, -0.1, 0.6, 0.3);
  const L = armsOver(ctx, arm("Right", down, 1.35, 0.25 + 0.6 * (1 - ext), -0.3), 1);
  const out = addLayer(L, { Spine: rx(byPersona(ctx.actor, -0.05, 0.25, 0.15) * ext), Head: rz(0.15 * ext) });
  return { ...out, face: { emotion: ctx.emotion === "neutral" ? "happy" : ctx.emotion, browRaise: 0.3 * ext } };
};

/** Release at 50%; no crouch or throw impulse. Keep the hand steady at release. */
export const drop: VerbImpl = (lt, _p, ctx) => {
  const u=lt/ctx.dur,extend=smooth(u/.35),release=1-smooth((u-.5)/.35);
  // Offer the ball clear of the skirt before releasing it. Reuse the ordinary
  // arm layer; the physics trial deliberately excludes character/ball contact.
  const reach=arm("Right",-.6,0,.1,0);
  return blendLayers(armsOver(ctx,holdArm(),release),armsOver(ctx,reach,release),extend);
};

export const eat: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.3);
  const period = byPersona(ctx.actor, 0.9, 1.2, 0.75); // the hungry Wolves gobble
  const toMouth = 0.5 - 0.5 * Math.cos((lt / period) * Math.PI * 2);
  const L = armsOver(ctx, arm("Right", 0.7 - 0.5 * toMouth, 1.1, 1.5 + 0.8 * toMouth, -1.2), k);
  const chew = Math.abs(Math.sin(lt * 9));
  return {
    ...addLayer(L, { Head: rx(-0.08 * toMouth * k + 0.03 * chew * k) }),
    face: { emotion: "happy", viseme: "open_small", visemeWeight: 0.6 * chew * k, lidClose: 0.3 * toMouth * k },
  };
};

export const throw_: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  // wind up 0–0.35, release at 0.4, follow-through
  const wind = smooth(u / 0.3) * (1 - smooth((u - 0.32) / 0.1));
  const follow = window01(u, 0.34, 1, 0.12);
  const side = ctx.targetLocal ? Math.atan2(ctx.targetLocal[0], ctx.targetLocal[2]) * 0.4 : 0;
  const armPose = arm("Right", -0.9 * wind + 0.4 * follow, -0.4 * wind + 1.3 * follow, 1.6 * wind + 0.2 * follow, -1.2);
  const L = armsOver(ctx, armPose, Math.max(wind, follow, 0.001), 0.2);
  return addLayer(L, pose({ Spine: qmul(ry(-0.4 * wind + 0.35 * follow + side), rx(-0.1 * wind + 0.25 * follow)) }, leg("Left", 0.35 * follow, 0.2)), 1, [0, 0, 0.04 * follow]);
};

export const cook: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.3);
  const flipT = (lt % 1.6) / 1.6;
  const flip = window01(flipT, 0.55, 0.8, 0.08);
  const stir = Math.sin(lt * 4) * 0.08;
  const arms = pose(arm("Right", 0.6 - 0.3 * flip, 1.1, 1.2 + 0.5 * flip, -0.9), arm("Left", 0.75, 1.0 + stir, 1.3, -0.6));
  const L = armsOver(ctx, arms, k, 0.2);
  return { ...addLayer(L, { Spine: rx(0.12 * k), Head: rx(0.2 * k), Hips: rz(Math.sin(lt * 2.2) * 0.04 * k) }), face: { emotion: ctx.emotion === "neutral" ? "happy" : ctx.emotion } };
};

export const fish: VerbImpl = (lt, _p, ctx) => {
  const u = lt / ctx.dur;
  const k = window01(lt, 0, ctx.dur, 0.3);
  // cast in the first 30% (splash_small at 0.3), then hold the rod with a gentle bob
  const back = window01(u, 0.02, 0.22, 0.08);
  const cast = window01(u, 0.18, 0.34, 0.06);
  const bob = Math.sin(lt * 1.7) * 0.05;
  const raise = -0.3 * back + 0.25 * cast;
  const arms = pose(arm("Right", 0.55 + raise + bob, 1.2, 1.0 + 0.6 * back, -1.0), arm("Left", 0.75 + raise + bob, 1.3, 0.9, -0.8));
  const L = armsOver(ctx, arms, k, 0.2);
  return addLayer(L, { Spine: rx(-0.15 * back + 0.15 * cast), Head: rx(0.15 * k) });
};

/** Rope swing geometry (matches the set: pivot 3.42 m up, 2.97 m ropes, seat at 0.45 m). */
export const SWING_ROPE = 2.97;
export const SWING_SEAT = 0.45;
export const SWING_PERIOD = 2.4; // s — rope_creak every 1.2 s

/** Pendulum angle (rad, + = toward the swinger's front) at clip-local time lt of a swing clip lasting dur. */
export function swingAngle(lt: number, dur: number): number {
  const k = smooth(lt / 0.8) * smooth((dur - lt) / 0.8 + 1e-4);
  return Math.sin((lt / SWING_PERIOD) * Math.PI * 2) * 0.38 * k;
}

export const swing: VerbImpl = (lt, _p, ctx) => {
  // seated on the rope swing, riding the pendulum and pumping the legs
  const a = swingAngle(lt, ctx.dur);
  const h = ctx.style.hipHeight;
  const bones = pose(
    leg("Left", 1.4 - a * 0.8, 1.2 + a * 1.1, 0.05), leg("Right", 1.4 - a * 0.8, 1.2 + a * 1.1, 0.05),
    arm("Left", -0.9, 0.5, 1.4, -1.2), arm("Right", -0.9, 0.5, 1.4, -1.2),
    { Hips: rx(-a * 0.8), Spine: rx(a * 0.3), Head: rx(-a * 0.2) },
  );
  const z = Math.sin(a) * SWING_ROPE;
  const y = (1 - Math.cos(a)) * SWING_ROPE;
  const swingL = layer(bones, [0, SWING_SEAT + 0.04 * h - h + y, -0.05 * h + z]);
  return { ...blendLayers(idleBase(ctx, 0.3), swingL, smooth(lt / 0.4)), face: { emotion: "excited", viseme: a > 0.25 ? "open_wide" : "grin", visemeWeight: Math.min(1, Math.abs(a) * 2.5) } };
};

export const carry: VerbImpl = (lt, _p, ctx) => {
  // Bear lifts Masha onto his shoulders, carefully: squat and reach (0–0.35), lift with a grunt (0.3–0.6),
  // then hold her ankles, glancing up at her and swaying gently
  const u = lt / ctx.dur;
  const squat = window01(u, 0, 0.55, 0.15);
  const lift = smooth((u - 0.3) / 0.3);
  const settled = smooth((u - 0.55) / 0.2);
  const reach = pose(arm("Left", 0.9 * (1 - lift), 1.2, 0.4), arm("Right", 0.9 * (1 - lift), 1.2, 0.4));
  const hold = pose(arm("Left", -0.75, 0.3, 1.95, -1.4), arm("Right", -0.75, 0.3, 1.95, -1.4));
  const arms = blendLayers({ bones: reach, hipsOffset: [0, 0, 0] }, { bones: hold, hipsOffset: [0, 0, 0] }, lift).bones;
  const L = armsOver(ctx, arms, 1, 0.3);
  const sway = Math.sin(lt * 1.6) * 0.04 * settled;
  const out = addLayer(L, pose(
    { Spine: rx(0.45 * squat * (1 - lift) - 0.04 * settled), Spine1: rz(sway), Neck: rx(-0.12 * settled), Head: qmul(rx(-0.18 * settled), ry(0.15 * Math.sin(lt * 0.9) * settled)) },
    leg("Left", 1.22 * squat, 2.4 * squat), leg("Right", 1.22 * squat, 2.4 * squat),
  ));
  return { ...out, face: { emotion: ctx.emotion === "neutral" ? "happy" : ctx.emotion, browRaise: 0.3 * settled } };
};

export const water_plants: VerbImpl = (lt, _p, ctx) => {
  const k = window01(lt, 0, ctx.dur, 0.35);
  const pour = 0.5 + 0.5 * Math.sin(lt * 1.3);
  const arms = pose(arm("Right", 0.7, 1.0, 0.5, 0.4 * pour), { RightHand: rx(0.5 * pour) });
  const L = armsOver(ctx, arms, k, 0.3);
  return { ...addLayer(L, { Spine: rx(0.15 * k), Hips: ry(Math.sin(lt * 0.7) * 0.15 * k), Head: rx(0.2 * k) }), face: { emotion: ctx.emotion === "neutral" ? "happy" : ctx.emotion } };
};
