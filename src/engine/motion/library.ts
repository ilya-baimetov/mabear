// Motion library (spec §7.4): Verb → implementation (clip | procedural | clip + additive procedural),
// posture holding (sit / sleep / carried), per-character style (Bear's weight, Masha's bounce) and breathing.
// Pure: evaluatePose(verb, localT, params, ctx) depends only on its arguments.
import type { Verb } from "../../shared/schema";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import { addLayer, breathingPose, clamp01, qmul, type Pose, type PoseLayer } from "./blend";
import { UPPER, lowestFoot, mask, rx, rz, type ClipParams, type VerbCtx, type VerbImpl, type VerbKind } from "./verbs/common";
import * as loco from "./verbs/locomotion";
import * as body from "./verbs/body";
import * as gesture from "./verbs/gesture";
import * as emotion from "./verbs/emotion";
import * as objects from "./verbs/objects";

export type { VerbCtx, VerbImpl, VerbKind } from "./verbs/common";
export { STYLES, SEAT_HEIGHT } from "./verbs/common";

/** Every verb in VERBS has an implementation (unit-tested). */
export const VERB_IMPLS: Record<Verb, VerbImpl> = {
  walk_to: loco.walk_to, run_to: loco.run_to, tiptoe_to: loco.tiptoe_to, chase: loco.chase, enter: loco.enter, exit: loco.exit,
  idle: body.idle, jump: body.jump, spin: body.spin, dance: body.dance, sit: body.sit, stand_up: body.stand_up,
  fall_down: body.fall_down, sleep: body.sleep, wake_up: body.wake_up, yawn_stretch: body.yawn_stretch, hide: body.hide, peek: body.peek,
  wave: gesture.wave, clap: gesture.clap, point_at: gesture.point_at, look_at: gesture.look_at, nod: gesture.nod,
  shake_head: gesture.shake_head, shrug: gesture.shrug, facepalm: gesture.facepalm, hug: gesture.hug,
  laugh: emotion.laugh, cry: emotion.cry, sulk: emotion.sulk, surprised: emotion.surprised, scared: emotion.scared,
  angry_stomp: emotion.angry_stomp, sneeze: emotion.sneeze, sigh: emotion.sigh,
  take: objects.take, give: objects.give, eat: objects.eat, throw: objects.throw_, cook: objects.cook, fish: objects.fish,
  swing: objects.swing, carry: objects.carry, water_plants: objects.water_plants,
};

/** How each verb is realized — shown in the Behind-the-scenes data view (honesty labels, spec §2). */
export const VERB_KIND: Record<Verb, VerbKind> = {
  walk_to: "clip+procedural", run_to: "clip+procedural", tiptoe_to: "clip+procedural", chase: "clip+procedural",
  enter: "clip+procedural", exit: "clip+procedural",
  idle: "clip+procedural", jump: "procedural", spin: "procedural", dance: "clip+procedural", sit: "procedural",
  stand_up: "procedural", fall_down: "procedural", sleep: "procedural", wake_up: "procedural", yawn_stretch: "procedural",
  hide: "clip+procedural", peek: "clip+procedural",
  wave: "clip+procedural", clap: "procedural", point_at: "procedural", look_at: "clip+procedural", nod: "clip",
  shake_head: "clip+procedural", shrug: "procedural", facepalm: "procedural", hug: "procedural",
  laugh: "procedural", cry: "clip+procedural", sulk: "procedural", surprised: "procedural", scared: "procedural",
  angry_stomp: "procedural", sneeze: "procedural", sigh: "procedural",
  take: "procedural", give: "procedural", eat: "procedural", throw: "procedural", cook: "procedural", fish: "procedural",
  swing: "procedural", carry: "procedural", water_plants: "procedural",
};

/** Source clip(s) each clip-based verb draws on (for the data view and docs/ASSETS.md). */
export const VERB_CLIPS: Partial<Record<Verb, string[]>> = {
  walk_to: ["xbot_walk"], run_to: ["xbot_run"], tiptoe_to: ["xbot_walk", "xbot_sneak"], chase: ["xbot_run"],
  enter: ["xbot_walk"], exit: ["xbot_walk"], idle: ["xbot_idle"], dance: ["robot_dance"], hide: ["xbot_sneak"],
  peek: ["xbot_sneak"], wave: ["robot_wave"], look_at: ["xbot_idle"], nod: ["xbot_agree"], shake_head: ["xbot_headshake"],
  cry: ["xbot_sad"],
};

/** Verbs that change posture themselves (they own the whole body even when sitting/lying). */
const POSTURE_VERBS = new Set<Verb>(["sit", "stand_up", "sleep", "wake_up", "fall_down", "swing", "jump", "spin", "dance", "hide", "peek", ...LOCOMOTION_VERBS]);

/** Verbs that manage their own height (lying, sitting, airborne, getting up): no ground lock. */
const FREE_VERBS = new Set<Verb>(["sit", "sleep", "fall_down", "swing", "jump", "wake_up", "stand_up"]);

/** Bear's weight / Masha's lightness, applied after every verb while standing. */
function applyStyle(L: PoseLayer, ctx: VerbCtx, standing: boolean): PoseLayer {
  const s = ctx.style;
  const bones: Pose = { ...L.bones };
  const pre = (b: string, q: [number, number, number, number]) => {
    bones[b] = qmul(q, bones[b] ?? [0, 0, 0, 1]);
  };
  // arms clear the body (Bear's belly, Masha's dress) — in every verb
  pre("LeftArm", rz(s.armOut));
  pre("RightArm", rz(-s.armOut));
  if (standing) {
    pre("LeftUpLeg", rz(s.stance));
    pre("RightUpLeg", rz(-s.stance));
    if (s.hipsDrop > 0) {
      // carry the weight low: knees bent (the ground lock then lowers the hips with the feet planted)
      const a = Math.acos(Math.max(-1, 1 - s.hipsDrop / s.hipHeight));
      for (const side of ["Left", "Right"]) {
        pre(`${side}UpLeg`, rx(-a));
        bones[`${side}Leg`] = qmul(bones[`${side}Leg`] ?? [0, 0, 0, 1], rx(2 * a));
        bones[`${side}Foot`] = qmul(bones[`${side}Foot`] ?? [0, 0, 0, 1], rx(-a));
      }
    }
  }
  return { ...L, bones };
}

/** Small alternating steps while turning on the spot, so feet re-plant instead of skating round. */
function shuffle(L: PoseLayer, ctx: VerbCtx): PoseLayer {
  const rate = Math.abs(ctx.turnRate ?? 0);
  if (rate < 0.15) return L;
  const w = clamp01((rate - 0.15) / 1.2);
  const stepAngle = ctx.actor === "bear" ? 0.4 : 0.5;
  const p = (ctx.turned ?? 0) / stepAngle;
  const i = Math.floor(p);
  const lift = Math.sin((p - i) * Math.PI) * w;
  const side = i % 2 === 0 ? "Left" : "Right";
  return addLayer(L, { [`${side}UpLeg`]: rx(-0.35 * lift), [`${side}Leg`]: rx(0.7 * lift), [`${side}Foot`]: rx(0.2 * lift) });
}

/**
 * Full pose for an actor playing `verb` at clip-local time `localT`, honouring held postures:
 * sleeping actors stay lying (only wake_up/stand_up move them), sitting/carried actors gesture with the
 * upper body only. Standing poses are ground-locked by foot FK (no floating, no sinking). Returns the layer plus
 * the breathing driver.
 */
export function evaluatePose(verb: Verb, localT: number, params: ClipParams, ctx: VerbCtx): { layer: PoseLayer; breathe: number } {
  const impl = VERB_IMPLS[verb] ?? VERB_IMPLS.idle;
  const held = ctx.fromPosture;
  let L: PoseLayer;
  const seatedLean = (held === "sit" || held === "carried") && (verb === "peek" || verb === "hide");
  let upright = false;
  if ((POSTURE_VERBS.has(verb) && !seatedLean) || held === "stand" || held === "offstage") {
    L = impl(localT, params, ctx);
    upright = true;
  } else if (held === "sleep" && ctx.posture !== "sleep") {
    // startled awake (surprised / scared while asleep): get up like wake_up, keeping the verb's face
    const w = VERB_IMPLS.wake_up(localT, params, ctx);
    L = { ...w, face: { ...w.face, ...impl(localT, params, ctx).face, lidClose: w.face?.lidClose } };
  } else if (held === "sleep") {
    L = body.liePose(ctx);
  } else {
    // sit / carried: upper body acts, lower body holds
    const base = body.postureLayer(held, ctx);
    const top = impl(localT, params, ctx);
    L = { ...mask(base, top, UPPER), face: top.face, yawOffset: 0 };
  }
  const standing = upright && !FREE_VERBS.has(verb);
  L = applyStyle(L, ctx, standing);
  if (standing && !LOCOMOTION_VERBS.includes(verb)) L = shuffle(L, ctx);
  const br = breathingPose(ctx.t, ctx.style.breathRate, ctx.style.breathDepth);
  L = addLayer(L, br.pose);
  // ground contact: pin the lowest sole to the floor (or only keep it from sinking during run flight phases)
  const mode = L.ground ?? (standing ? "lock" : "free");
  if (mode !== "free") {
    const low = lowestFoot(L.bones, L.hipsOffset, ctx.style);
    if (mode === "lock" || low < 0) L = { ...L, hipsOffset: [L.hipsOffset[0], L.hipsOffset[1] - low, L.hipsOffset[2]] };
  }
  if (L.lift) L = { ...L, hipsOffset: [L.hipsOffset[0], L.hipsOffset[1] + L.lift, L.hipsOffset[2]] };
  return { layer: L, breathe: br.breathe };
}

export { body };
