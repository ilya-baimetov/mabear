import {isKitchenContainer} from '../../shared/kitchenContainers';
// evaluate(timeline, t) → FrameState (spec §7.4). PURE and deterministic: no Date, no Math.random, no
// globals mutated; blinks and fidgets are functions of t. The renderer applies the result each frame.
import type { ActorFrame, FaceParams, FrameState } from "../api";
import { MARKS } from "../../shared/bible/set";
import { carryLiftRootHeight } from "../../shared/carrySupport";
import { cookingSupportHeightAt } from "../../shared/cookingStation";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import { clamp, clamp01, easeInOut, lerp, lerpAngle, smooth } from "../../shared/math";
import { BENCH_BALL_FALLBACK, ballOriginFromSupport, propPlacementAtMark, propPlacementInState } from "../../shared/propPlacement";
import {
  ACTOR_IDS,
  CARROT_IDS,
  PROP_IDS,
  type ActorClip,
  type ActorId,
  type MarkId,
  type Posture,
  type PropId,
  type PropLocation,
  type Segment,
  type Timeline,
  type Vec2,
  type Vec3,
  type WorldState,
} from "../../shared/schema";
import { CROSSFADE_S, addLayer, blendLayers, qaxis, qmul, type PoseLayer } from "../motion/blend";
import { STYLES, evaluatePose } from "../motion/library";
import { swingAngleAt as clipSwingAngleAt } from "../motion/verbs/objects";
import {
  CALM_VERBS,
  applyLook,
  blink,
  lookFreedom,
  speakerAt,
  storyEmotion,
  talkPose,
  talkWeight,
  visemeAt,
} from "./faceEmotion";
import {
  activeIndex,
  carryEvents,
  carryState,
  clipsOf,
  isActor,
  isMark,
  kinematics,
  makeCtx,
  resolveTrack,
  shoulderSeat,
  stOf,
  startYaws,
  type Kin,
  type Resolved,
} from "./kinematics";
import { propActionTargets, propLocationsAt, propsFrame } from "./propTimeline";
import { DEFAULT_CAMERA, cameraAt, emptySegment, fxAt, lightingAt, objectContactForClip, objectsAt } from "./sceneCues";
import { evaluateActorSpring } from "./spring";

export { PROP_REST_HEIGHT } from "../../shared/propPlacement";
export { DEFAULT_CAMERA };

/** Seconds for enter/exit/door fades. */
const FADE_S = 0.6;

interface ActorCtxIn {
  seg: Segment;
  lt: number;
  t: number;
  track: Resolved[];
  stateAtStart: WorldState["actors"][ActorId];
  /** previous segment's last clip (for a crossfade across the paragraph boundary) */
  prevLast: { r: Resolved; seg: Segment } | null;
}

interface ActorEval {
  frame: ActorFrame;
  carryLift: number;
  mark: MarkId | null;
  lookW: number;
  lookScale: number;
}

const OFFSTAGE_BONES: Record<string, [number, number, number, number]> = {};
const OFFSTAGE_ACTION = { time: 0, duration: 0 };

function evalActor(
  actor: ActorId,
  inp: ActorCtxIn,
  bear: ActorFrame | null,
  carry: { k: number } | null,
  holding: PropId | null,
  segs: Timeline["segments"],
  segmentIndex: number,
  trackFor: (segIdx: number, a: ActorId) => Resolved[],
): ActorEval {
  const { seg, lt, t, track } = inp;
  const st = inp.stateAtStart;
  const carried = actor === "masha" && carry !== null && bear !== null;
  if (track.length === 0 && st.posture === "offstage" && !inp.prevLast && !carried && !holding) {
    const breathe = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * STYLES[actor].breathRate);
    const jiggle = clamp01(0.5 + 0.04 * Math.sin(t * 2 * Math.PI * STYLES[actor].breathRate - 0.8));
    return {
      frame: {
        pos: [st.pos[0], 0, st.pos[1]],
        yaw: st.facing,
        opacity: 0,
        bones: OFFSTAGE_BONES,
        hipsOffset: [0, 0, 0],
        groundWeight: 1,
        face: {
          emotion: "neutral",
          lidClose: 0,
          viseme: "rest",
          visemeWeight: 0,
          lookAt: null,
          browRaise: 0,
        },
        holding: null,
        posture: "offstage",
        verb: "idle",
        action: OFFSTAGE_ACTION,
        secondary: { sway: 0.5, jiggle, breathe },
        spring: { swayX: 0, swayZ: 0, bounceY: 0, yawVel: 0, time: t },
      },
      carryLift: 0,
      mark: st.mark,
      lookW: 0,
      lookScale: 1,
    };
  }
  const idx = activeIndex(track, lt);
  const r = idx >= 0 ? track[idx] : null;
  const inClip = r ? lt < r.end : false;
  let pos: Vec2;
  let yaw: number;
  let kin: Kin;
  let posture: Posture;
  let fromPosture: Posture;
  let mark: MarkId | null;
  let verb: ActorClip["verb"];
  let clipLt: number;
  if (!r) {
    pos = [st.pos[0], st.pos[1]];
    yaw = st.facing;
    kin = { pos, yaw, dist: 0, turned: 0 };
    posture = fromPosture = st.posture;
    mark = st.mark;
    verb = "idle";
    clipLt = lt;
  } else if (inClip) {
    kin = kinematics(r, lt - r.clip.start);
    pos = kin.pos;
    yaw = kin.yaw;
    posture = r.posture;
    fromPosture = r.fromPosture;
    mark = r.mark;
    verb = r.clip.verb;
    clipLt = lt - r.clip.start;
  } else {
    // gap after the clip (or past the episode end): hold the last pose's position, idle in the held posture
    pos = r.endPos;
    yaw = r.endYaw;
    kin = { pos, yaw, dist: 0, turned: 0 };
    posture = fromPosture = r.posture;
    mark = r.mark;
    verb = "idle";
    clipLt = lt - r.end;
  }
  // The living-room chair fixes the seated body's orientation. Turning the
  // floor-level root toward a speaker also rotates its forward seat offset,
  // sliding the child sideways through the cushion. Gaze remains independent.
  if (mark === "house_living" && posture === "sit") {
    yaw = MARKS.house_living.facing;
    kin = { ...kin, yaw, turned: 0, turnRate: 0, omega: 0 };
  }
  // Bear's carry lifts Masha onto his shoulders
  if (carried) {
    if (!inClip || !r || !LOCOMOTION_VERBS.includes(r.clip.verb)) {
      fromPosture = carry.k >= 1 ? "carried" : fromPosture;
      posture = "carried";
    }
  }
  const ctx = makeCtx(actor, inClip ? r : null, kin, t, posture, fromPosture, mark, yaw, pos, holding);
  const poseTime = (clip: ActorClip | undefined, local: number) => clip?.params.putDown ? Math.max(0, clip.dur - local) : local;
  let ev = evaluatePose(verb, poseTime(inClip ? r?.clip : undefined, clipLt), inClip && r ? r.clip.params : {}, ctx);
  // A previous seated idle has no groundW field. Body blending defaults that
  // absent value to 1, so retain the getting-up verb's explicit support ramp.
  const transitionGroundWeight = verb === "sit" && r?.clip.params.target === "house_living" && r.clip.params.to
    ? ev.layer.groundW
    : (verb === "stand_up" || verb === "wake_up" || r?.clip.params.target === "hammock" && r.clip.params.to) && fromPosture !== "stand" && fromPosture !== "offstage"
      ? ev.layer.groundW
      : undefined;
  // 0.2 s crossfade from the previous clip (or from the clip that just ended)
  let prevR: Resolved | null = null;
  let since = 0;
  if (inClip && r) {
    since = lt - r.clip.start;
    prevR = idx > 0 ? track[idx - 1] : inp.prevLast?.r ?? null;
  } else if (r) {
    since = lt - r.end;
    prevR = r;
  }
  if (prevR && since < CROSSFADE_S) {
    const pMoveDur = Math.max(1e-3, prevR.clip.dur - prevR.turnDur);
    const pctx = makeCtx(
      actor, prevR,
      { pos: prevR.endPos, yaw: prevR.endYaw, dist: prevR.length, turned: 0, moveT: pMoveDur, moveDur: pMoveDur, vel: 0, aLong: 0, aLat: 0, omega: 0 },
      t, prevR.posture, prevR.fromPosture, prevR.mark, prevR.endYaw, prevR.endPos, holding,
    );
    const prev = evaluatePose(prevR.clip.verb, poseTime(prevR.clip, prevR.clip.dur), prevR.clip.params, pctx);
    const k = smooth(since / CROSSFADE_S);
    ev = { layer: blendLayers(prev.layer, ev.layer, k), breathe: ev.breathe };
  }
  let L: PoseLayer = ev.layer;
  // talking: small head bobs and a hand gesture on top of calm verbs while a line is spoken
  const talk = visemeAt(seg, actor, lt);
  const tw = talkWeight(seg, actor, lt);
  if (tw > 0 && CALM_VERBS.has(verb) && posture !== "sleep") L = addLayer(L, talkPose(actor, t, tw));
  // posture-based root placement
  let pos3: Vec3 = [pos[0], 0, pos[1]];
  let finalYaw = yaw + (L.yawOffset ?? 0);
  if (carried && bear && carry) {
    const shoulder = shoulderSeat(bear);
    const k = easeInOut(carry.k);
    const height = carryLiftRootHeight(k, shoulder[1]);
    pos3 = [lerp(pos3[0], shoulder[0], k), height, lerp(pos3[2], shoulder[2], k)];
    finalYaw = lerpAngle(finalYaw, bear.yaw, k);
    if (k < 1) {
      const stand = evaluatePose("idle", clipLt, {}, { ...ctx, fromPosture: "stand", posture: "stand" }).layer;
      const ride = evaluatePose("idle", clipLt, {}, { ...ctx, fromPosture: "carried", posture: "carried" }).layer;
      L = blendLayers(stand, ride, k);
    }
  }
  // hopping down from Bear's shoulders: ballistic 4 * s * (1 - s) parabola
  if (!carried && bear && inClip && r && r.fromPosture === "carried" && posture !== "carried") {
    const shoulder = shoulderSeat(bear);
    const hopDur = clamp(r.clip.dur, 0.2, 0.85);
    const s = clamp01((lt - r.clip.start) / hopDur);
    const arc = 4 * s * (1 - s) * 0.25;
    pos3 = [lerp(shoulder[0], pos3[0], smooth(s)), lerp(shoulder[1], 0, s) + arc, lerp(shoulder[2], pos3[2], smooth(s))];
  }
  // opacity: enter/exit fades, door exits, offstage holds
  let opacity = 1;
  if (r?.clip.params.sceneCut && !r.clip.params.portal) {
    const progress = clamp01((lt - r.clip.start) / r.clip.dur);
    opacity = smooth(Math.abs(progress - 0.5) * 2);
  }
  if (inClip && r) {
    const u = lt - r.clip.start;
    if (r.clip.verb === "enter" || (r.fromPosture === "offstage" && r.posture !== "offstage")) opacity = smooth(u / FADE_S);
    if (r.clip.verb === "exit" || (r.posture === "offstage" && r.fromPosture !== "offstage")) opacity = Math.min(opacity, smooth((r.clip.dur - u) / FADE_S));
    if (r.fromPosture === "offstage" && r.posture === "offstage") opacity = 0;
  } else if (posture === "offstage") opacity = 0;
  // look-at: explicit target, else the current speaker, else the speaker looks at the other actor
  const lookAt: Vec3 | null = inClip && r?.clip.params.lookAt ? r.clip.params.lookAt : null;
  const lookW = lookAt && r ? Math.min(smooth(clipLt / 0.35), smooth((r.clip.dur - clipLt) / 0.35)) : 0;
  // how free the head is to look around (0 while lying down / spinning), crossfaded like the pose
  let lookScale = lookFreedom(verb, fromPosture, inClip && r ? clipLt / Math.max(r.clip.dur, 1e-3) : 1);
  if (prevR && since < CROSSFADE_S) lookScale = lerp(lookFreedom(prevR.clip.verb, prevR.fromPosture, 1), lookScale, smooth(since / CROSSFADE_S));
  const face = L.face ?? {};
  // (speaker-based look-at is resolved by the caller, which knows both actors)
  const vis = talk;
  const sleeping = posture === "sleep" && verb !== "wake_up" && verb !== "stand_up";
  const lid = sleeping ? 1 : Math.max(blink(actor, t), face.lidClose ?? 0);
  const faceOut: FaceParams = {
    emotion: face.emotion ?? (inClip && r ? r.clip.emotion : "neutral"),
    lidClose: clamp01(lid),
    viseme: vis ? vis.v : face.viseme ?? "rest",
    visemeWeight: vis ? vis.w : face.visemeWeight ?? 0,
    lookAt,
    browRaise: clamp((face.browRaise ?? 0) + (vis ? 0.15 * vis.w * Math.max(0, Math.sin(t * 7)) : 0), -1, 1),
  };

  const { spring, secondary } = evaluateActorSpring(segs, trackFor, actor, t, segmentIndex, kin, inClip, r, verb, clipLt, L.bones.Hips, ev.breathe);
  const propTargets = propActionTargets(r, inClip);
  const activeContact = objectContactForClip(seg, lt, r, inClip, verb, pos, finalYaw, clipLt, holding);

  const frame: ActorFrame = {
    pos: pos3,
    yaw: finalYaw,
    opacity,
    bones: L.bones,
    hipsOffset: L.hipsOffset,
    groundWeight: transitionGroundWeight ?? L.groundW ?? 1,
    face: faceOut,
    holding,
    posture,
    verb,
    action: { time: clipLt, duration: inClip && r ? r.clip.dur : 0, ...(inClip && r && verb === "fish" && (r.clip.params.catchesFish === true || r.clip.params.catchesFish === undefined && seg.endState.props.fish?.at === actor) ? { contactEnd: r.clip.dur * 0.7 } : {}) },
    ...(inClip && r && verb === "hug" && isActor(r.clip.params.target) ? { interaction: { kind: "hug" as const, partner: r.clip.params.target } } : {}),
    ...propTargets,
    ...activeContact,
    ...(carried && carry ? { riding: { carrier: "bear" as const, progress: easeInOut(carry.k) } } : {}),
    secondary,
    spring,
  };
  return { frame, carryLift: carry?.k ?? 0, mark, lookW, lookScale };
}

export function evaluate(timeline: Timeline, t: number): FrameState {
  const segs = timeline.segments;
  let segmentIndex = 0;
  let seg: Segment;
  let offset = 0;
  if (segs.length === 0) {
    seg = emptySegment();
  } else {
    segmentIndex = segs.length - 1;
    for (let i = 0; i < segs.length; i++) {
      if (t < segs[i].offset + segs[i].segment.duration) { segmentIndex = i; break; }
    }
    seg = segs[segmentIndex].segment;
    offset = segs[segmentIndex].offset;
  }
  // actors run on unclamped local time (gaps and past-the-end hold the final pose with idle fidgets);
  // camera/lighting/fx clamp to the segment
  const lt = t - offset;
  const ltc = clamp(lt, 0, seg.duration);
  const prevSeg = segmentIndex > 0 ? segs[segmentIndex - 1].segment : null;

  // facing is chained across segments so yaw stays continuous at paragraph boundaries
  const yaws = startYaws(segs, segmentIndex);
  const yawMemo: (Record<ActorId, number> | undefined)[] = new Array(segs.length);
  yawMemo[segmentIndex] = yaws;
  const yawsAt = (sIdx: number): Record<ActorId, number> => {
    let hit = yawMemo[sIdx];
    if (!hit) { hit = startYaws(segs, sIdx); yawMemo[sIdx] = hit; }
    return hit;
  };
  const trackMemo: (Partial<Record<ActorId, Resolved[]>> | undefined)[] = new Array(segs.length);
  const trackFor = (sIdx: number, actor: ActorId): Resolved[] => {
    const s = segs[sIdx].segment;
    if (clipsOf(s, actor).length === 0) return resolveTrack(s, actor, []);
    let row = trackMemo[sIdx];
    if (!row) { row = {}; trackMemo[sIdx] = row; }
    let tr = row[actor];
    if (!tr) {
      tr = resolveTrack(s, actor, actor === "masha" ? carryEvents(s) : [], yawsAt(sIdx)[actor]);
      row[actor] = tr;
    }
    return tr;
  };
  const tracks = { bear: segs.length ? trackFor(segmentIndex, "bear") : [], masha: segs.length ? trackFor(segmentIndex, "masha") : [] };
  const prevLast = (a: ActorId) => {
    if (!prevSeg) return null;
    const tr = trackFor(segmentIndex - 1, a);
    return tr.length ? { r: tr[tr.length - 1], seg: prevSeg } : null;
  };
  // Compute prop ownership before actor evaluation so heavy-carry counter-lean and door handle side know held props
  const { at, flights } = segs.length === 0 ? { at: Object.fromEntries(PROP_IDS.map((id) => [id, seg.startState.props[id]?.at ?? "hidden"])) as Record<PropId, PropLocation>, flights: new Map() } : propLocationsAt(seg, Math.min(lt, seg.duration + 1e-6));
  const heldMap: Partial<Record<ActorId, PropId>> = {};
  for (let i = 0; i < PROP_IDS.length; i++) {
    const id = PROP_IDS[i];
    const loc = at[id];
    if (isActor(loc) && !heldMap[loc]) heldMap[loc] = id;
  }
  const heldBy = (a: ActorId): PropId | null => heldMap[a] ?? null;

  const startOf = (a: ActorId) => ({ ...stOf(seg.startState, a), facing: yaws[a] });
  const bear = evalActor("bear", { seg, lt, t, track: tracks.bear, stateAtStart: startOf("bear"), prevLast: lt < CROSSFADE_S ? prevLast("bear") : null }, null, null, heldBy("bear"), segs, segmentIndex, trackFor);
  const carry = carryState(seg, lt, tracks.masha);
  const masha = evalActor("masha", { seg, lt, t, track: tracks.masha, stateAtStart: startOf("masha"), prevLast: lt < CROSSFADE_S ? prevLast("masha") : null }, bear.frame, carry, heldBy("masha"), segs, segmentIndex, trackFor);
  const guest = (a: ActorId) => evalActor(a, { seg, lt, t, track: segs.length ? trackFor(segmentIndex, a) : [], stateAtStart: startOf(a), prevLast: lt < CROSSFADE_S ? prevLast(a) : null }, null, null, heldBy(a), segs, segmentIndex, trackFor);
  const evals = Object.fromEntries(ACTOR_IDS.map((a) => [a, a === "masha" ? masha : a === "bear" ? bear : guest(a)])) as Record<ActorId, ActorEval>;
  const actors = Object.fromEntries(ACTOR_IDS.map((a) => [a, evals[a].frame])) as Record<ActorId, ActorFrame>;
  if (segs.length) for (const actor of ACTOR_IDS) Object.assign(actors[actor].face, storyEmotion(timeline, actor, t));

  // look-at: explicit params.lookAt, else toward the current speaker; the speaker looks at the other actor
  // attention carries across paragraph boundaries (a line's tail / the next line's lead-in)
  let speaker = segs.length === 0 ? null : speakerAt(seg, lt);
  const nextSeg = segmentIndex + 1 < segs.length ? segs[segmentIndex + 1].segment : null;
  for (const cand of [prevSeg ? speakerAt(prevSeg, lt + prevSeg.duration) : null, nextSeg ? speakerAt(nextSeg, lt - seg.duration) : null]) {
    if (cand && (!speaker || cand.w > speaker.w)) speaker = cand;
  }
  for (const a of ACTOR_IDS) {
    const f = actors[a];
    if (f.opacity === 0 && f.posture === "offstage") continue;
    // partner for speaker attention: Masha ↔ Bear; the Wolves watch whoever is talking (else each other)
    const other: ActorId = a === "masha" ? "bear" : a === "bear" ? "masha" : speaker && speaker.actor !== a ? speaker.actor : a === "wolf_a" ? "wolf_b" : a === "wolf_b" ? "wolf_a" : "masha";
    const o = actors[other];
    const otherHead: Vec3 = [o.pos[0], o.pos[1] + cookingSupportHeightAt(o.pos[0], o.pos[2]) + STYLES[other].height * 0.8, o.pos[2]];
    const explicit = f.face.lookAt;
    const ev = evals[a];
    const ew = explicit ? ev.lookW : 0;
    const sw = speaker && o.opacity > 0.5 && (speaker.actor === other || speaker.actor === a) ? speaker.w * (1 - ew) : 0;
    // speaker attention first, explicit target on top: weights fade, so heads turn rather than snap
    f.face = { ...f.face, lookAt: null };
    // Once seated, neither performer twists their head through the other's
    // face to satisfy the generic conversation gaze. They look along the ride.
    const rideGaze = (a === "bear" || a === "masha") && carry ? 1 - smooth((carry.k - 0.4) / 0.4) : 1;
    if (sw > 0) applyLook(f, a, otherHead, sw * ev.lookScale * rideGaze);
    if (explicit && ew > 0) applyLook(f, a, explicit, ew * ev.lookScale * rideGaze);
  }

  // props frame
  for (const actor of ACTOR_IDS) actors[actor].holding = heldBy(actor) ?? actors[actor].holding;
  const props = propsFrame(at, flights, actors, ltc);
  // Optional authored resting poses keep the non-physics fallback continuous
  // across scene boundaries. A new ownership event supersedes the old pose.
  if (!props.ball.attachedTo && !flights.has("ball")) {
    const events = ACTOR_IDS.flatMap((a) =>
      clipsOf(seg, a)
        .filter((c) => c.params.item === "ball" && ["take", "give", "throw", "drop", "put_down", "nudge"].includes(c.verb))
        .map((c) => ({ c, t: c.start + c.dur * 0.5 })),
    )
      .filter((e) => e.t <= ltc)
      .sort((a, b) => a.t - b.t);
    const last = events.at(-1);
    const saved = last?.c.verb === "nudge" ? seg.endState.props.ball : events.length ? null : seg.startState.props.ball;
    if (saved?.position) {
      const p = saved.position;
      const rot = saved.rotation ?? [0, 0, 0];
      props.ball = {
        visible: true,
        attachedTo: null,
        pos: [...p],
        rotation: qmul(qmul(qaxis([0, 1, 0], rot[1]), qaxis([1, 0, 0], rot[0])), qaxis([0, 0, 1], rot[2])),
      };
    }
    if (last?.c.verb === "nudge") {
      const from = last.c.params.nudgePosition ?? propPlacementAtMark("ball", "bench").pos;
      const age = Math.max(0, ltc - last.t);
      const travel = Math.min(age / BENCH_BALL_FALLBACK.rollSeconds, 1);
      const fall = Math.max(0, age - BENCH_BALL_FALLBACK.edgeSeconds);
      const x = from[0] + (BENCH_BALL_FALLBACK.support[0] - from[0]) * travel;
      const y = fall === 0 ? from[1] : Math.max(0, from[1] - 4.905 * fall * fall);
      const rotation = -(from[0] - x) / 0.15;
      props.ball = {
        visible: true,
        attachedTo: null,
        pos: ballOriginFromSupport([x, y, from[2]], [0, 0, rotation]),
        rotation: [0, 0, Math.sin(rotation / 2), Math.cos(rotation / 2)],
      };
    }
    // Exact table/bench base origins bypass the renderer's semantic nearest-mark snap.
    if (at.ball === "bench" && !last?.c.params.nudgeAt) {
      const p = propPlacementAtMark("ball", "bench");
      props.ball = { visible: true, attachedTo: null, pos: p.pos, rotation: [0, 0, 0, 1] };
    }
  }
  for (const id of CARROT_IDS) {
    const loc = at[id];
    if (!isMark(loc) || flights.has(id)) continue;
    const picked = ACTOR_IDS.some((a) => clipsOf(seg, a).some((c) => c.params.item === id && c.verb === "take" && !c.params.putDown && ltc >= c.start + c.dur * 0.5));
    const planted = loc === "garden" && !!seg.startState.props[id]?.planted && !picked;
    const placement = propPlacementInState(id, { at: loc, planted });
    const [x, y, z] = placement.rot;
    if (loc === "kitchen_pot") {
      const deposit = ACTOR_IDS.flatMap((a) => clipsOf(seg, a))
        .filter((c) => c.params.item === id && c.params.putDown === "kitchen_pot" && c.params.putDownPosition && ltc >= c.start + c.dur * 0.5)
        .at(-1);
      if (deposit) {
        const releaseY = deposit.params.putDownPosition![1];
        const age = ltc - deposit.start - deposit.dur * 0.5;
        placement.pos[1] = Math.max(placement.pos[1], releaseY - 4.905 * age * age);
      }
    }
    // Quaternion in the renderer's YXZ order, independent of the generic resting-mark snap.
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    props[id] = {
      visible: true,
      pos: placement.pos,
      attachedTo: null,
      rotation: [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
      ],
    };
  }

  return {
    t,
    segmentIndex,
    objects: objectsAt(seg, ltc),
    localT: segs.length === 0 ? t : ltc,
    actors,
    ...(segs.length ? { cast: seg.cast ?? ACTOR_IDS.filter((a) => segs.slice(0, segmentIndex + 1).some((s) => clipsOf(s.segment, a).some((c) => !c.params.ambient))) } : {}),
    camera: cameraAt(seg, ltc),
    lighting: segs.length === 0 ? { from: "day", to: "day", k: 1 } : lightingAt(seg, ltc),
    props,
    fx: segs.length === 0 || lt > seg.duration ? [] : fxAt(seg, ltc),
  };
}

/**
 * Angle for the set's rope swing (SetHandle.setSwing) at episode time t: follows Masha while she plays a
 * `swing` clip, 0 otherwise.
 * Set convention (`bearsYard.ts`): `+angle` rotates `swingPivot` about local `+X` right-hand rule (moving seat `(0,-L,0)`
 * toward `-Z`). Since `clipSwingAngleAt(...)` produces `+angle` for forward `+Z` actor displacement, we negate by `-cos(yaw)`
 * so the seat mesh tracks the swinger synchronously.
 */
export function swingAngleAt(timeline: Timeline, t: number): number {
  for (const { offset, segment } of timeline.segments) {
    const lt = t - offset;
    if (lt < 0 || lt > segment.duration) continue;
    for (const a of ACTOR_IDS) {
      for (const c of clipsOf(segment, a)) {
        if (c.verb !== "swing" || lt < c.start || lt > c.start + c.dur) continue;
        const yaw = c.params.facing ?? MARKS.swing.facing;
        return -clipSwingAngleAt(lt - c.start, c.dur) * Math.cos(yaw);
      }
    }
  }
  return 0;
}
