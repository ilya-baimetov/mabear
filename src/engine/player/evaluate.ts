// evaluate(timeline, t) → FrameState (spec §7.4). PURE and deterministic: no Date, no Math.random, no
// globals mutated; blinks and fidgets are functions of t. The renderer applies the result each frame.
import type { ActorFrame, FaceParams, FrameState, FxFrame, PropFrame } from "../api";
import {
  ACTOR_IDS, MARK_IDS, PROP_IDS, ADDED_ACTOR_START,
  type ActorClip, type ActorId, type CamKey, type MarkId, type Posture, type PropId, type PropLocation,
  type Segment, type TimeOfDay, type Timeline, type Vec2, type Vec3, type Viseme, type WorldState,
} from "../../shared/schema";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import { MARKS } from "../../shared/bible/set";
import { initialWorldState } from "../../compiler/worldState";
import { CROSSFADE_S, addLayer, applyLookAt, blendLayers, qmul, clamp, clamp01, easeInOut, lerp, lookAtPose, qrot, qaxis, smooth, window01, type PoseLayer } from "../motion/blend";
import { SEAT_HEIGHT, STYLES, evaluatePose, type VerbCtx } from "../motion/library";
import { hash1 } from "../motion/verbs/common";
import { swingAngle } from "../motion/verbs/objects";

// ---------- constants ----------

/** Default wide camera of the yard (empty timeline, or a segment without camera cues). */
export const DEFAULT_CAMERA: CamKey = { pos: [1.4, 2.4, 7.8], look: [-0.8, 1.1, 0.15], fov: 43 };

/** Heights (m) props rest at on a mark (table top, bench seat, porch boards…); others sit on the ground. */
export const PROP_REST_HEIGHT: Partial<Record<MarkId, number>> = {
  table: 0.78, bench: 0.47, porch: 0.32, pier: 0.28, hammock: 0.66, beehive: 0.62, woodpile: 0.55, swing: 0.47,
};

/** Seconds for enter/exit/door fades. */
const FADE_S = 0.6;
/** Seconds to blend a viseme in ahead of its audio. */
const VISEME_LEAD = 0.06;
const BLINK_BUCKET = 3.5;
const BLINK_LEN = 0.16;

const MARK_SET = new Set<string>(MARK_IDS);
const isMark = (s: string | undefined | null): s is MarkId => !!s && MARK_SET.has(s);
const ACTOR_SET = new Set<string>(ACTOR_IDS);
const isActor = (s: string | undefined | null): s is ActorId => !!s && ACTOR_SET.has(s);
const isWolfId = (a: ActorId): boolean => a === "wolf_a" || a === "wolf_b";
/** An actor's state in a world state (segments saved before the Wolves joined have no wolf entries). */
function stOf(ws: WorldState, a: ActorId): WorldState["actors"][ActorId] {
  return ws.actors[a] ?? (ADDED_ACTOR_START as Partial<Record<ActorId, WorldState["actors"][ActorId]>>)[a] ?? ws.actors.bear;
}
/** An actor's clips in a segment (older segments have none for the Wolves). */
function clipsOf(seg: Segment, a: ActorId): ActorClip[] {
  return seg.actorClips[a] ?? [];
}

// ---------- small math ----------

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
function yawTo(from: Vec2, to: Vec2, fallback: number): number {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  return Math.hypot(dx, dz) < 1e-4 ? fallback : Math.atan2(dx, dz);
}
function pathLength(path: Vec2[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}
function pointAt(path: Vec2[], s: number): Vec2 {
  if (path.length === 0) return [0, 0];
  if (s <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (s <= seg) {
      const k = seg > 0 ? s / seg : 0;
      return [lerp(path[i - 1][0], path[i][0], k), lerp(path[i - 1][1], path[i][1], k)];
    }
    s -= seg;
  }
  return path[path.length - 1];
}
/** Trapezoidal velocity profile: eased start and stop, constant speed in between. */
function travel(tau: number, ramp: number): number {
  const x = clamp01(tau);
  const r = clamp(ramp, 1e-3, 0.5);
  const v = 1 / (1 - r);
  if (x < r) return (0.5 * v * x * x) / r;
  if (x > 1 - r) return 1 - (0.5 * v * (1 - x) * (1 - x)) / r;
  return v * (x - r / 2);
}

// ---------- per-actor clip resolution ----------

interface Resolved {
  clip: ActorClip;
  end: number;
  startPos: Vec2;
  endPos: Vec2;
  startYaw: number;
  endYaw: number;
  fromPosture: Posture;
  posture: Posture;
  mark: MarkId | null;
  path: Vec2[] | null;
  length: number;
  turnDur: number;
  firstYaw: number;
  /** in-place verb that still moves the root (dismount hop, carried transfer): no gait, no turning */
  slide: boolean;
  heavy: boolean;
}

function derivedPosture(clip: ActorClip, from: Posture): Posture {
  if (clip.verb === "exit") return "offstage";
  if (clip.params.posture) return clip.params.posture;
  switch (clip.verb) {
    case "sit": return "sit";
    case "sleep": return "sleep";
    case "stand_up": case "wake_up": case "enter": return "stand";
    default:
      if (LOCOMOTION_VERBS.includes(clip.verb)) return clip.params.target === "door" && from === "offstage" ? "offstage" : "stand";
      return from;
  }
}

function markPos(id: MarkId): Vec2 {
  return [MARKS[id].pos[0], MARKS[id].pos[1]];
}

/** Resolve an actor's clips into a kinematic chain (positions, yaw, posture at each clip boundary). */
function resolveTrack(seg: Segment, actor: ActorId, extraPosture: { t: number; posture: Posture }[], initYaw?: number): Resolved[] {
  const st = stOf(seg.startState, actor);
  const clips = [...clipsOf(seg, actor)].sort((a, b) => a.start - b.start);
  let pos: Vec2 = [st.pos[0], st.pos[1]];
  let yaw = initYaw ?? st.facing;
  let posture: Posture = st.posture;
  let mark: MarkId | null = st.mark;
  const out: Resolved[] = [];
  const style = STYLES[actor];
  for (const clip of clips) {
    // postures imposed from outside (Masha lifted by Bear's carry) that happened before this clip
    for (const e of extraPosture) if (e.t <= clip.start && (out.length === 0 || e.t > out[out.length - 1].clip.start)) posture = e.posture;
    const p = clip.params;
    const fromPosture = posture;
    let endPos = pos;
    let path: Vec2[] | null = null;
    let length = 0;
    let endYaw = yaw;
    let firstYaw = yaw;
    let turnDur = 0;
    let slide = false;
    if (LOCOMOTION_VERBS.includes(clip.verb)) {
      let pts: Vec2[] | undefined = p.path && p.path.length >= 2 ? p.path.map((q) => [q[0], q[1]] as Vec2) : undefined;
      if (!pts) {
        const from: Vec2 = p.from ? [p.from[0], p.from[1]] : clip.verb === "enter" ? markPos("path_entry") : pos;
        const to: Vec2 = p.to ? [p.to[0], p.to[1]] : clip.verb === "enter" ? markPos("clearing") : clip.verb === "exit" ? markPos("path_entry") : isMark(p.target) ? markPos(p.target) : pos;
        pts = [from, to];
      }
      path = pts;
      length = pathLength(pts);
      endPos = pts[pts.length - 1];
      // heading of the first leg that actually moves
      for (let i = 1; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-3) { firstYaw = yawTo(pts[i - 1], pts[i], yaw); break; }
      }
      for (let i = pts.length - 1; i > 0; i--) {
        if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-3) { endYaw = yawTo(pts[i - 1], pts[i], yaw); break; }
      }
      const dYaw = Math.abs(wrapAngle(firstYaw - yaw));
      // turn in place before moving (Bear turns slower)
      turnDur = dYaw > 0.35 && length > 0.05 ? Math.min((actor === "bear" ? 0.55 : isWolfId(actor) ? 0.25 : 0.3) * (dYaw / Math.PI) + 0.1, clip.dur * 0.3) : 0;
      if (isMark(p.target)) mark = p.target;
      else mark = null;
    } else {
      // in-place verbs can still move the root (e.g. the hop down from Bear's shoulders)
      if (p.to && Math.hypot(p.to[0] - pos[0], p.to[1] - pos[1]) > 0.05) {
        const from: Vec2 = p.from ? [p.from[0], p.from[1]] : pos;
        path = p.path && p.path.length >= 2 ? p.path.map((q) => [q[0], q[1]] as Vec2) : [from, [p.to[0], p.to[1]]];
        length = pathLength(path);
        endPos = path[path.length - 1];
        slide = true;
      }
      if (p.facing !== undefined) endYaw = p.facing;
      else if (p.lookAt && ["give", "hug", "throw", "point_at", "carry", "peek", "wave"].includes(clip.verb)) {
        endYaw = yawTo(pos, [p.lookAt[0], p.lookAt[2]], yaw);
        if (clip.verb === "wave" || clip.verb === "point_at" || clip.verb === "peek") endYaw = lerpAngle(yaw, endYaw, 0.5);
      }
      if (isMark(p.target) && (clip.verb === "sit" || clip.verb === "sleep" || clip.verb === "hide")) mark = p.target;
    }
    posture = derivedPosture(clip, fromPosture);
    out.push({ clip, end: clip.start + clip.dur, startPos: pos, endPos, startYaw: yaw, endYaw, fromPosture, posture, mark, path, length, turnDur, firstYaw, slide, heavy: actor === "bear" });
    pos = endPos;
    yaw = endYaw;
  }
  // a walk that ends offstage (through the door) fades out at its end
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    const next = out[i + 1];
    const goesOff = next ? next.fromPosture === "offstage" || next.posture === "offstage" : stOf(seg.endState, actor).posture === "offstage";
    if (LOCOMOTION_VERBS.includes(r.clip.verb) && r.posture !== "offstage" && goesOff && r.fromPosture !== "offstage") {
      r.posture = "offstage";
      if (next) next.fromPosture = "offstage";
    }
  }
  void style;
  return out;
}

interface Kin {
  pos: Vec2;
  yaw: number;
  /** distance travelled along the current path */
  dist: number;
  turned: number;
  /** mean path speed of the clip (m/s) — a hurried walk turns into a run */
  speed?: number;
  /** in-place turn rate (rad/s) — drives the foot shuffle */
  turnRate?: number;
}

function kinematics(r: Resolved, lt: number): Kin {
  const { clip } = r;
  if (r.path && r.slide) {
    const k = smooth(clamp01(lt / Math.max(clip.dur, 1e-3)));
    return { pos: pointAt(r.path, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / 0.4))), dist: 0, turned: 0 };
  }
  if (r.path) {
    const u = clamp(lt, 0, clip.dur);
    if (u < r.turnDur) {
      const k = smooth(u / r.turnDur);
      return { pos: r.startPos, yaw: lerpAngle(r.startYaw, r.firstYaw, k), dist: 0, turned: Math.abs(wrapAngle(r.firstYaw - r.startYaw)) * k };
    }
    const moveDur = Math.max(1e-3, clip.dur - r.turnDur);
    const tau = (u - r.turnDur) / moveDur;
    const ramp = Math.min(0.25, 0.35 / moveDur);
    const s = travel(tau, ramp) * r.length;
    const p = pointAt(r.path, s);
    // smoothed tangent (look a little ahead and behind on the path)
    const a = pointAt(r.path, Math.max(0, s - 0.2));
    const b = pointAt(r.path, Math.min(r.length, s + 0.2));
    let yaw = yawTo(a, b, r.firstYaw);
    if (r.turnDur === 0) yaw = lerpAngle(r.startYaw, yaw, smooth(u / 0.25)); // small turns blend in while walking
    return { pos: p, yaw, dist: s, turned: Math.abs(wrapAngle(r.firstYaw - r.startYaw)), speed: r.length / moveDur };
  }
  // in-place turns take longer the further they go (Bear turns slower than Masha)
  const dYaw = Math.abs(wrapAngle(r.endYaw - r.startYaw));
  const turnS = clamp((dYaw / Math.PI) * (clip.params.ambient ? 1.0 : 0.7) * (r.heavy ? 1.8 : 1), 0.2, Math.max(0.2, clip.dur));
  const x = clamp01(lt / turnS);
  const k = smooth(x);
  return { pos: r.startPos, yaw: lerpAngle(r.startYaw, r.endYaw, k), dist: 0, turned: dYaw * k, turnRate: (dYaw * 6 * x * (1 - x)) / turnS };
}

// ---------- props ----------

interface PropEvent { t: number; prop: PropId; at: PropLocation; flight?: { t0: number; t1: number; from: ActorId; to: Vec3 } }

function propLocationsAt(seg: Segment, localT: number): { at: Record<PropId, PropLocation>; flights: Map<PropId, PropEvent["flight"]> } {
  const at = {} as Record<PropId, PropLocation>;
  for (const id of PROP_IDS) at[id] = seg.startState.props[id]?.at ?? "hidden";
  for (const a of ACTOR_IDS) {
    const h = stOf(seg.startState, a).holding;
    if (h) at[h] = a;
  }
  const events: PropEvent[] = [];
  const touched = new Map<PropId, number>();
  for (const a of ACTOR_IDS) {
    for (const c of clipsOf(seg, a)) {
      const item = c.params.item;
      const end = c.start + c.dur;
      if (item) touched.set(item, Math.max(touched.get(item) ?? 0, end));
      if (c.verb === "take" && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: a });
      else if (c.verb === "give" && item && isActor(c.params.target)) events.push({ t: c.start + c.dur * 0.6, prop: item, at: c.params.target });
      else if (c.verb === "throw" && item) {
        const tgt = c.params.target;
        const land: PropLocation = isMark(tgt) ? tgt : isActor(tgt) ? (seg.endState.props[item]?.at ?? tgt) : (seg.endState.props[item]?.at ?? "clearing");
        const to: Vec3 = c.params.lookAt ? [c.params.lookAt[0], 0.1, c.params.lookAt[2]] : isMark(tgt) ? restPos(item, tgt) : [0, 0.1, 0];
        events.push({ t: c.start + c.dur * 0.4, prop: item, at: "hidden", flight: { t0: c.start + c.dur * 0.4, t1: end, from: a, to } });
        events.push({ t: end, prop: item, at: land });
      } else if (c.verb === "cook") {
        const pc = seg.endState.props.pancakes?.at;
        if (pc && pc !== at.pancakes) events.push({ t: c.start + c.dur * 0.85, prop: "pancakes", at: pc });
      } else if (c.verb === "fish") {
        const f = seg.endState.props.fish?.at;
        if (f && f !== "hidden") events.push({ t: c.start + c.dur * 0.7, prop: "fish", at: f });
      }
    }
  }
  events.sort((x, y) => x.t - y.t);
  // reconcile with the compiled end state: anything still different switches when its last clip ends
  const sim = { ...at };
  for (const e of events) sim[e.prop] = e.at;
  for (const id of PROP_IDS) {
    const target = seg.endState.props[id]?.at;
    if (target !== undefined && sim[id] !== target) events.push({ t: Math.min(touched.get(id) ?? seg.duration, seg.duration), prop: id, at: target });
  }
  events.sort((x, y) => x.t - y.t);
  const flights = new Map<PropId, PropEvent["flight"]>();
  for (const e of events) {
    if (e.t > localT) break;
    at[e.prop] = e.at;
    if (e.flight && localT < e.flight.t1) flights.set(e.prop, e.flight);
    else flights.delete(e.prop);
  }
  return { at, flights };
}

function restPos(prop: PropId, mark: MarkId): Vec3 {
  const i = PROP_IDS.indexOf(prop);
  const ang = i * 2.399963; // golden angle: props sharing a mark spread out
  const r = mark === "table" ? 0.32 : 0.4;
  const p = MARKS[mark].pos;
  return [p[0] + Math.cos(ang) * r, PROP_REST_HEIGHT[mark] ?? 0.03, p[1] + Math.sin(ang) * r];
}

function handPos(a: ActorFrame, actor: ActorId): Vec3 {
  const s = STYLES[actor];
  const off = qrot(qaxis([0, 1, 0], a.yaw), [-0.18 * s.height, 0.45 * s.height, 0.22 * s.height]);
  return [a.pos[0] + off[0], a.pos[1] + off[1], a.pos[2] + off[2]];
}

// ---------- face ----------

function blink(actor: ActorId, t: number): number {
  const seed = ACTOR_IDS.indexOf(actor) + 1;
  const b = Math.floor(t / BLINK_BUCKET);
  const start = b * BLINK_BUCKET + 0.3 + hash1(b * 13.37 + seed * 101.1) * 1.4;
  const x = (t - start) / BLINK_LEN;
  return x > 0 && x < 1 ? 1 - Math.abs(2 * x - 1) : 0;
}

function visemeAt(seg: Segment, actor: ActorId, lt: number): { v: Viseme; w: number } | null {
  for (const d of seg.dialogue) {
    if (d.actor !== actor) continue;
    const u = lt - d.start + VISEME_LEAD;
    if (u < 0 || u > d.dur + 0.1) continue;
    let v: Viseme = "rest";
    for (const k of d.visemes) {
      if (k.t <= u) v = k.v;
      else break;
    }
    const w = Math.min(smooth(u / 0.08), smooth((d.dur + 0.1 - u) / 0.12));
    return { v, w };
  }
  return null;
}

/** Who is speaking (or vocalizing) around lt, with a smooth attention weight so heads turn, not snap. */
/** Slow-ramped "is talking" weight for body gestures (visemes use a fast ramp). */
function talkWeight(seg: Segment, actor: ActorId, lt: number): number {
  let w = 0;
  for (const d of seg.dialogue) {
    if (d.actor !== actor) continue;
    w = Math.max(w, Math.min(smooth((lt - d.start + 0.1) / 0.45), smooth((d.start + d.dur + 0.3 - lt) / 0.45)));
  }
  return w;
}

function speakerAt(seg: Segment, lt: number): { actor: ActorId; w: number } | null {
  let best: { actor: ActorId; w: number } | null = null;
  const consider = (actor: ActorId, start: number, dur: number) => {
    const w = Math.min(smooth((lt - start + 0.25) / 0.35), smooth((start + dur + 0.5 - lt) / 0.35));
    if (w > 0 && (!best || w > best.w)) best = { actor, w };
  };
  for (const d of seg.dialogue) consider(d.actor, d.start, d.dur);
  for (const e of seg.emotes) if (e.emote !== "snore" && e.emote !== "none") consider(e.actor, e.start, e.dur);
  return best;
}

// ---------- actor evaluation ----------

interface ActorCtxIn {
  seg: Segment;
  lt: number;
  t: number;
  track: Resolved[];
  stateAtStart: WorldState["actors"][ActorId];
  /** previous segment's last clip (for a crossfade across the paragraph boundary) */
  prevLast: { r: Resolved; seg: Segment } | null;
}

function activeIndex(track: Resolved[], lt: number): number {
  let idx = -1;
  for (let i = 0; i < track.length; i++) if (track[i].clip.start <= lt) idx = i;
  return idx;
}

function makeCtx(actor: ActorId, r: Resolved | null, kin: Kin, lt: number, t: number, seg: Segment, posture: Posture, fromPosture: Posture, mark: MarkId | null, yaw: number, pos: Vec2): VerbCtx {
  const clip = r?.clip;
  const style = STYLES[actor];
  let targetLocal: Vec3 | null = null;
  const look = clip?.params.lookAt ?? (clip?.params.target && isMark(clip.params.target) ? [MARKS[clip.params.target].pos[0], 0.5, MARKS[clip.params.target].pos[1]] as Vec3 : null);
  if (look) {
    const d: Vec3 = [look[0] - pos[0], look[1] - style.height * 0.6, look[2] - pos[1]];
    targetLocal = qrot(qaxis([0, 1, 0], -yaw), d);
  }
  // only sit/lie on a raised surface when actually at it (the stage already lifts roots on the porch / pier)
  const seatMark0 = (clip?.params.target && isMark(clip.params.target) ? clip.params.target : null) ?? mark;
  const seatMark = seatMark0 && Math.hypot(MARKS[seatMark0].pos[0] - pos[0], MARKS[seatMark0].pos[1] - pos[1]) < 1.0 ? seatMark0 : null;
  void seg;
  return {
    actor, style, dur: clip ? clip.dur : 1, emotion: clip ? clip.emotion : "neutral", t,
    dist: kin.dist, turned: kin.turned, speed: kin.speed ?? 0, turnRate: kin.turnRate ?? 0, fromPosture, posture, targetLocal,
    seat: seatMark ? SEAT_HEIGHT[seatMark] ?? 0 : 0,
  };
}

interface ActorEval { frame: ActorFrame; carryLift: number; mark: MarkId | null; lookW: number; lookScale: number }

/** Head freedom for look-at during a verb at progress u (continuous at clip boundaries). */
function lookFreedom(verb: ActorClip["verb"], from: Posture, u: number): number {
  if (from === "sleep") {
    if (verb === "wake_up" || verb === "stand_up" || verb === "surprised" || verb === "scared") return smooth((u - 0.55) / 0.45);
    return 0;
  }
  if (LOCOMOTION_VERBS.includes(verb)) return 0.5;
  switch (verb) {
    case "nod": case "shake_head": return 0.3;
    case "sleep": return 1 - smooth(u / 0.3);
    case "spin": case "fall_down": return 1 - window01(u, 0, 1, 0.15);
    case "facepalm": case "cry": case "sneeze": return 1 - 0.7 * window01(u, 0, 1, 0.2);
    default: return 1;
  }
}

function evalActor(actor: ActorId, inp: ActorCtxIn, bear: ActorFrame | null, carry: { k: number } | null): ActorEval {
  const { seg, lt, t, track } = inp;
  const st = inp.stateAtStart;
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
  // Bear's carry lifts Masha onto his shoulders
  const carried = actor === "masha" && carry !== null && bear !== null;
  if (carried) {
    if (!inClip || !r || !LOCOMOTION_VERBS.includes(r.clip.verb)) {
      fromPosture = carry.k >= 1 ? "carried" : fromPosture;
      posture = "carried";
    }
  }
  const ctx = makeCtx(actor, inClip ? r : null, kin, clipLt, t, seg, posture, fromPosture, mark, yaw, pos);
  let ev = evaluatePose(verb, clipLt, inClip && r ? r.clip.params : {}, ctx);
  // 0.2 s crossfade from the previous clip (or from the clip that just ended)
  let prevR: Resolved | null = null;
  let prevSeg = seg;
  let since = 0;
  if (inClip && r) {
    since = lt - r.clip.start;
    prevR = idx > 0 ? track[idx - 1] : inp.prevLast?.r ?? null;
    if (idx === 0 && inp.prevLast) prevSeg = inp.prevLast.seg;
  } else if (r) {
    since = lt - r.end;
    prevR = r;
  }
  if (prevR && since < CROSSFADE_S) {
    const pctx = makeCtx(actor, prevR, { pos: prevR.endPos, yaw: prevR.endYaw, dist: prevR.length, turned: 0 }, prevR.clip.dur, t, prevSeg, prevR.posture, prevR.fromPosture, prevR.mark, prevR.endYaw, prevR.endPos);
    const prev = evaluatePose(prevR.clip.verb, prevR.clip.dur, prevR.clip.params, pctx);
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
    const arc = Math.sin(k * Math.PI) * 0.3;
    pos3 = [lerp(pos3[0], shoulder[0], k), lerp(0, shoulder[1], k) + arc, lerp(pos3[2], shoulder[2], k)];
    finalYaw = lerpAngle(finalYaw, bear.yaw, k);
    if (k < 1) {
      const stand = evaluatePose("idle", clipLt, {}, { ...ctx, fromPosture: "stand", posture: "stand" }).layer;
      const ride = evaluatePose("idle", clipLt, {}, { ...ctx, fromPosture: "carried", posture: "carried" }).layer;
      L = blendLayers(stand, ride, k);
    }
  }
  // hopping down from Bear's shoulders: from the seat on his shoulders to the ground along the clip
  if (!carried && bear && inClip && r && r.fromPosture === "carried" && posture !== "carried") {
    const shoulder = shoulderSeat(bear);
    const k = smooth(clamp01((lt - r.clip.start) / Math.max(0.2, r.clip.dur)));
    const arc = Math.sin(k * Math.PI) * 0.25;
    pos3 = [lerp(shoulder[0], pos3[0], k), lerp(shoulder[1], 0, k) + arc, lerp(shoulder[2], pos3[2], k)];
  }
  // opacity: enter/exit fades, door exits, offstage holds
  let opacity = 1;
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
  // secondary drivers: Masha's hem sways with her motion; Bear's belly jiggles (delayed) with his hips
  const layerAt = (dt: number): PoseLayer => {
    if (!inClip || !r) return L;
    const lt2 = Math.max(0, clipLt - dt);
    const k2 = kinematics(r, lt2);
    const c2 = makeCtx(actor, r, k2, lt2, t - dt, seg, posture, fromPosture, mark, k2.yaw, k2.pos);
    return evaluatePose(verb, lt2, r.clip.params, c2).layer;
  };
  // the hem follows the hips' side-to-side roll a beat late (overlap), and flares in spins
  const roll = (q: [number, number, number, number] | undefined) => (q ? 2 * Math.atan2(q[2], q[3]) : 0);
  const lagged = actor === "masha" ? layerAt(0.1) : L;
  const sway = clamp01(0.5 + 2 * roll(lagged.bones.Hips) + 1 * (lagged.hipsOffset[0] - L.hipsOffset[0]) / STYLES[actor].hipHeight + (L.yawOffset ? 0.25 * Math.sin(L.yawOffset) : 0));
  let jiggle = 0.5 + 0.04 * Math.sin(t * 2 * Math.PI * STYLES[actor].breathRate - 0.8); // breathing settles the belly
  if (actor === "bear") {
    // the belly lags the hips: compare the hips height now with ~0.08 s and ~0.16 s ago (pure: re-evaluated)
    const hipsAt = (dt: number): number => layerAt(dt).hipsOffset[1];
    const y0 = L.hipsOffset[1];
    const y1 = hipsAt(0.08);
    const y2 = hipsAt(0.16);
    jiggle += 4 * (y1 - y0) - 2 * (y2 - y1);
  }
  jiggle = clamp01(jiggle);
  const frame: ActorFrame = {
    pos: pos3,
    yaw: finalYaw,
    opacity,
    bones: L.bones,
    hipsOffset: L.hipsOffset,
    face: faceOut,
    holding: null,
    posture,
    verb,
    secondary: { sway, jiggle, breathe: ev.breathe },
  };
  return { frame, carryLift: carry?.k ?? 0, mark, lookW, lookScale };
}

/** Verbs calm enough to carry a talking layer. */
const CALM_VERBS = new Set<ActorClip["verb"]>(["idle", "look_at", "point_at", "wave", "sit", "hide", "peek", "sulk", "give", "take", "cook", "fish", "water_plants", "swing", "hug", "shrug"]);

/** Talking layer: head bobs on syllables, Masha's free hand gestures (additive, weight w). */
function talkPose(actor: ActorId, t: number, w: number): Record<string, [number, number, number, number]> {
  const bob = Math.sin(t * 9.0) * 0.5 + Math.sin(t * 5.3) * 0.5;
  const gest = Math.max(0, Math.sin(t * 2.1));
  const k = actor === "masha" ? 1 : isWolfId(actor) ? 0.8 : 0.6;
  return {
    Head: qmul(qaxis([1, 0, 0], 0.05 * bob * w * k), qaxis([0, 0, 1], 0.06 * Math.sin(t * 1.7) * w * k)),
    Spine1: qaxis([0, 1, 0], 0.05 * Math.sin(t * 1.3) * w * k),
    LeftForeArm: qaxis([0, 1, 0], -0.5 * gest * w * k),
    LeftArm: qaxis([0, 0, 1], 0.15 * gest * w * k),
  };
}

/** Where Masha sits when riding on Bear's shoulders (root position). */
function shoulderSeat(bear: ActorFrame): Vec3 {
  const s = STYLES.bear;
  // The oversized head needs rear clearance; otherwise the rider's face sits inside Bear's skull.
  const back = qrot(qaxis([0, 1, 0], bear.yaw), [0, 0, -0.16 * s.height]);
  return [bear.pos[0] + back[0], bear.pos[1] + s.shoulderHeight + bear.hipsOffset[1], bear.pos[2] + back[2]];
}

/** Apply a look-at to an actor frame (head/neck bones + face.lookAt), faded by `weight`. */
function applyLook(frame: ActorFrame, actor: ActorId, target: Vec3 | null, weight: number): void {
  if (!target || weight <= 0) return;
  const style = STYLES[actor];
  const head: Vec3 = [frame.pos[0], frame.pos[1] + style.height * 0.82, frame.pos[2]];
  const d: Vec3 = [target[0] - head[0], target[1] - head[1], target[2] - head[2]];
  const local = qrot(qaxis([0, 1, 0], -frame.yaw), d);
  const L = applyLookAt({ bones: frame.bones, hipsOffset: frame.hipsOffset }, lookAtPose(local, clamp01(weight)));
  frame.bones = L.bones;
  frame.face = { ...frame.face, lookAt: weight > 0.25 ? target : null };
}

// ---------- camera, lighting, fx ----------

function cameraAt(seg: Segment, lt: number): CamKey {
  const cues = seg.camera;
  if (cues.length === 0) return DEFAULT_CAMERA;
  let cue = cues[0];
  for (const c of cues) if (c.start <= lt) cue = c;
  if (lt < cue.start) return cue.from;
  const k = easeInOut(cue.dur > 0 ? (lt - cue.start) / cue.dur : 1);
  return {
    pos: [lerp(cue.from.pos[0], cue.to.pos[0], k), lerp(cue.from.pos[1], cue.to.pos[1], k), lerp(cue.from.pos[2], cue.to.pos[2], k)],
    look: [lerp(cue.from.look[0], cue.to.look[0], k), lerp(cue.from.look[1], cue.to.look[1], k), lerp(cue.from.look[2], cue.to.look[2], k)],
    fov: lerp(cue.from.fov, cue.to.fov, k),
  };
}

function lightingAt(seg: Segment, lt: number): FrameState["lighting"] {
  let from: TimeOfDay = seg.startState.timeOfDay;
  let to: TimeOfDay = from;
  let k = 1;
  const cues = [...seg.lighting].sort((a, b) => a.start - b.start);
  for (const c of cues) {
    if (c.start > lt) break;
    from = k >= 1 ? to : from;
    to = c.timeOfDay;
    k = c.transition > 0 ? clamp01((lt - c.start) / c.transition) : 1;
  }
  if (from === to) k = 1;
  return { from, to, k };
}

function fxAt(seg: Segment, lt: number): FxFrame[] {
  const out: FxFrame[] = [];
  for (const f of seg.fx) {
    if (lt >= f.start && lt < f.start + f.dur) out.push({ id: f.id, at: f.at, k: f.dur > 0 ? (lt - f.start) / f.dur : 1 });
  }
  return out;
}

// ---------- props frame ----------

function propsFrame(at: Record<PropId, PropLocation>, flights: Map<PropId, PropEvent["flight"]>, actors: Record<ActorId, ActorFrame>, lt: number): Record<PropId, PropFrame> {
  const out = {} as Record<PropId, PropFrame>;
  for (const id of PROP_IDS) {
    const fl = flights.get(id);
    if (fl) {
      const k = clamp01((lt - fl.t0) / Math.max(1e-3, fl.t1 - fl.t0));
      const from = handPos(actors[fl.from], fl.from);
      const h = Math.sin(k * Math.PI) * 1.2;
      out[id] = { visible: true, pos: [lerp(from[0], fl.to[0], k), lerp(from[1], fl.to[1], k) + h, lerp(from[2], fl.to[2], k)], attachedTo: null };
      continue;
    }
    const loc = at[id];
    if (loc === "hidden") out[id] = { visible: false, pos: [0, -10, 0], attachedTo: null };
    else if (isActor(loc)) out[id] = { visible: actors[loc].opacity > 0.05, pos: handPos(actors[loc], loc), attachedTo: loc };
    else out[id] = { visible: true, pos: restPos(id, loc), attachedTo: null };
  }
  return out;
}

// ---------- main ----------

function emptySegment(): Segment {
  const ws = initialWorldState();
  return {
    paragraphId: "", version: 0, duration: 0, startState: ws, endState: ws,
    actorClips: Object.fromEntries(ACTOR_IDS.map(id => [id, [] as ActorClip[]])) as Segment["actorClips"], dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [],
    ambience: [], ducking: [], lighting: [], fx: [],
  };
}

/** Carry state for Masha: progress 0..1 of being lifted (null = not carried). */
function carryState(seg: Segment, lt: number, mashaTrack: Resolved[]): { k: number } | null {
  let k: number | null = null;
  let since = -Infinity;
  for (const c of seg.actorClips.bear) {
    if (c.verb !== "carry" || c.start > lt) continue;
    if (c.params.target && c.params.target !== "masha") continue;
    since = c.start;
    k = clamp01((lt - (c.start + c.dur * 0.3)) / (c.dur * 0.3));
    if (lt < c.start + c.dur * 0.3) k = 0;
  }
  // carried from the start of the segment
  if (k === null && seg.startState.actors.masha.posture === "carried") { k = 1; since = -1; }
  if (k === null) return null;
  // Masha gets down when one of her own later clips says so (locomotion, or an explicit non-carried posture)
  for (const r of mashaTrack) {
    if (r.clip.start <= lt && r.clip.start > since && r.clip.start >= 0) {
      if (LOCOMOTION_VERBS.includes(r.clip.verb) || (r.clip.params.posture && r.clip.params.posture !== "carried")) return null;
    }
  }
  return k === 0 && lt < since ? null : { k };
}

function carryEvents(seg: Segment): { t: number; posture: Posture }[] {
  return seg.actorClips.bear
    .filter((c) => c.verb === "carry" && (!c.params.target || c.params.target === "masha"))
    .map((c) => ({ t: c.start + c.dur * 0.6, posture: "carried" as Posture }));
}

/** Each actor's yaw at the start of segment `index`, chained from the first segment's start state. */
function startYaws(segs: Timeline["segments"], index: number): Record<ActorId, number> {
  const yaw = {} as Record<ActorId, number>;
  for (const a of ACTOR_IDS) {
    let y = segs.length ? stOf(segs[0].segment.startState, a).facing : 0;
    for (let j = 0; j < index; j++) {
      const tr = resolveTrack(segs[j].segment, a, [], y);
      if (tr.length) y = tr[tr.length - 1].endYaw;
    }
    yaw[a] = y;
  }
  return yaw;
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
  const prevYaws = segmentIndex > 0 ? startYaws(segs, segmentIndex - 1) : yaws;
  const tracks = { bear: resolveTrack(seg, "bear", [], yaws.bear), masha: [] as Resolved[] };
  // Masha's posture can be imposed by Bear's carry clips
  tracks.masha = resolveTrack(seg, "masha", carryEvents(seg), yaws.masha);
  const prevLast = (a: ActorId) => {
    if (!prevSeg) return null;
    const tr = resolveTrack(prevSeg, a, a === "masha" ? carryEvents(prevSeg) : [], prevYaws[a]);
    return tr.length ? { r: tr[tr.length - 1], seg: prevSeg } : null;
  };
  const startOf = (a: ActorId) => ({ ...stOf(seg.startState, a), facing: yaws[a] });
  const bear = evalActor("bear", { seg, lt, t, track: tracks.bear, stateAtStart: startOf("bear"), prevLast: lt < CROSSFADE_S ? prevLast("bear") : null }, null, null);
  const carry = carryState(seg, lt, tracks.masha);
  const masha = evalActor("masha", { seg, lt, t, track: tracks.masha, stateAtStart: startOf("masha"), prevLast: lt < CROSSFADE_S ? prevLast("masha") : null }, bear.frame, carry);
  // the Wolves: independent tracks (nobody carries them)
  const guest = (a: ActorId) => evalActor(a, { seg, lt, t, track: resolveTrack(seg, a, [], yaws[a]), stateAtStart: startOf(a), prevLast: lt < CROSSFADE_S ? prevLast(a) : null }, null, null);
  const evals = Object.fromEntries(ACTOR_IDS.map(a => [a, a === "masha" ? masha : a === "bear" ? bear : guest(a)])) as Record<ActorId, ActorEval>;
  const actors = Object.fromEntries(ACTOR_IDS.map(a => [a, evals[a].frame])) as Record<ActorId, ActorFrame>;

  // look-at: explicit params.lookAt, else toward the current speaker; the speaker looks at the other actor
  // attention carries across paragraph boundaries (a line's tail / the next line's lead-in)
  let speaker = segs.length === 0 ? null : speakerAt(seg, lt);
  const nextSeg = segmentIndex + 1 < segs.length ? segs[segmentIndex + 1].segment : null;
  for (const cand of [prevSeg ? speakerAt(prevSeg, lt + prevSeg.duration) : null, nextSeg ? speakerAt(nextSeg, lt - seg.duration) : null]) {
    if (cand && (!speaker || cand.w > speaker.w)) speaker = cand;
  }
  for (const a of ACTOR_IDS) {
    const f = actors[a];
    // partner for speaker attention: Masha ↔ Bear; the Wolves watch whoever is talking (else each other)
    const other: ActorId = a === "masha" ? "bear" : a === "bear" ? "masha" : speaker && speaker.actor !== a ? speaker.actor : a === "wolf_a" ? "wolf_b" : a === "wolf_b" ? "wolf_a" : "masha";
    const o = actors[other];
    const otherHead: Vec3 = [o.pos[0], o.pos[1] + STYLES[other].height * 0.8, o.pos[2]];
    const explicit = f.face.lookAt;
    const ev = evals[a];
    const ew = explicit ? ev.lookW : 0;
    const sw = speaker && o.opacity > 0.5 && (speaker.actor === other || speaker.actor === a) ? speaker.w * (1 - ew) : 0;
    // speaker attention first, explicit target on top: weights fade, so heads turn rather than snap
    f.face = { ...f.face, lookAt: null };
    if (sw > 0) applyLook(f, a, otherHead, sw * ev.lookScale);
    if (explicit && ew > 0) applyLook(f, a, explicit, ew * ev.lookScale);
  }

  // props and holding
  const { at, flights } = segs.length === 0 ? { at: Object.fromEntries(PROP_IDS.map((id) => [id, seg.startState.props[id]?.at ?? "hidden"])) as Record<PropId, PropLocation>, flights: new Map() } : propLocationsAt(seg, Math.min(lt, seg.duration + 1e-6));
  for (const id of PROP_IDS) {
    const loc = at[id];
    if (isActor(loc) && actors[loc].holding === null) actors[loc].holding = id;
  }
  const props = propsFrame(at, flights, actors, ltc);

  return {
    t,
    segmentIndex,
    localT: segs.length === 0 ? t : ltc,
    actors,
    camera: cameraAt(seg, ltc),
    lighting: segs.length === 0 ? { from: "day", to: "day", k: 1 } : lightingAt(seg, ltc),
    props,
    fx: segs.length === 0 || lt > seg.duration ? [] : fxAt(seg, ltc),
  };
}

/**
 * Angle for the set's rope swing (SetHandle.setSwing) at episode time t: follows Masha while she plays a
 * `swing` clip, 0 otherwise. Set convention: + rotates the seat about the pivot's local x (toward -z).
 */
export function swingAngleAt(timeline: Timeline, t: number): number {
  for (const { offset, segment } of timeline.segments) {
    const lt = t - offset;
    if (lt < 0 || lt > segment.duration) continue;
    for (const a of ACTOR_IDS) {
      for (const c of clipsOf(segment, a)) {
        if (c.verb !== "swing" || lt < c.start || lt > c.start + c.dur) continue;
        const yaw = c.params.facing ?? MARKS.swing.facing;
        return -swingAngle(lt - c.start, c.dur) * Math.cos(yaw);
      }
    }
  }
  return 0;
}
