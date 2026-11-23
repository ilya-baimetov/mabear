// Per-actor clip resolution, path/turn kinematics, posture chaining, and carry trajectories.
import type { ActorFrame } from "../api";
import { MARKS } from "../../shared/bible/set";
import { carrySeatRoot } from "../../shared/carrySupport";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import { clamp, clamp01, lerp, lerpAngle, smooth } from "../../shared/math";
import { armchairMountMotion, hammockTiming, hammockTravelProgress } from "../../shared/physicalInteractions";
import {
  ACTOR_IDS,
  ADDED_ACTOR_START,
  MARK_IDS,
  type ActorClip,
  type ActorId,
  type MarkId,
  type Posture,
  type PropId,
  type Segment,
  type Timeline,
  type Vec2,
  type Vec3,
  type WorldState,
} from "../../shared/schema";
import { qaxis, qrot } from "../motion/blend";
import { SEAT_HEIGHT, STYLES, type VerbCtx } from "../motion/library";

const MARK_SET = new Set<string>(MARK_IDS);
export const isMark = (s: string | undefined | null): s is MarkId => !!s && MARK_SET.has(s);
const ACTOR_SET = new Set<string>(ACTOR_IDS);
export const isActor = (s: string | undefined | null): s is ActorId => !!s && ACTOR_SET.has(s);

/** An actor's state in a world state (segments saved before the Wolves joined have no wolf entries). */
export function stOf(ws: WorldState, a: ActorId): WorldState["actors"][ActorId] {
  return ws.actors[a] ?? (ADDED_ACTOR_START as Partial<Record<ActorId, WorldState["actors"]["bear"]>>)[a] ?? ws.actors.bear;
}

/** An actor's clips in a segment (older segments have none for the Wolves). */
export function clipsOf(seg: Segment, a: ActorId): ActorClip[] {
  return seg.actorClips[a] ?? [];
}

export function hashNum(h: number, x: number | undefined | null): number {
  if (x === undefined || x === null) return Math.imul(h ^ 0x3333, 0x9e3779b1);
  const v = (x * 1048576) | 0;
  return Math.imul(h ^ v ^ ((x * 65.536) | 0), 0x9e3779b1);
}

export function hashStr(h: number, s: string | undefined | null): number {
  if (!s) return Math.imul(h ^ 0x5555, 0x9e3779b1);
  const n = s.length;
  const v = (n << 24) ^ (s.charCodeAt(0) << 16) ^ (s.charCodeAt(n >> 1) << 8) ^ s.charCodeAt(n - 1);
  return Math.imul(h ^ v, 0x9e3779b1);
}

/** Fast zero-allocation structural stamp for an actor's clips and start/end state in a segment. */
export function actorClipStamp(seg: Segment, actor: ActorId): number {
  const st = stOf(seg.startState, actor);
  const endSt = stOf(seg.endState, actor);
  const clips = clipsOf(seg, actor);
  let h = hashNum(0x811c9dc5 | 0, seg.duration);
  h = hashStr(h, st.posture);
  h = hashStr(h, endSt.posture);
  h = hashStr(h, st.mark);
  h = hashStr(h, st.holding);
  h = hashNum(h, st.facing);
  h = hashNum(h, st.pos[0]);
  h = hashNum(h, st.pos[1]);
  h = hashNum(h, clips.length);
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const p = c.params;
    h = hashNum(h, c.start);
    h = hashNum(h, c.dur);
    h = hashStr(h, c.verb);
    h = hashStr(h, c.emotion);
    h = hashStr(h, p.posture);
    h = hashStr(h, p.target);
    h = hashStr(h, p.item);
    h = hashStr(h, p.putDown);
    h = hashStr(h, p.pickUpAt);
    h = hashStr(h, p.dropAt);
    h = hashNum(h, p.catchesFish === true ? 1 : p.catchesFish === false ? 2 : 0);
    h = hashNum(h, (p.sceneCut ? 1 : 0) | (p.portal ? 2 : 0) | (p.ambient ? 4 : 0));
    h = hashNum(h, p.from?.[0]);
    h = hashNum(h, p.from?.[1]);
    h = hashNum(h, p.to?.[0]);
    h = hashNum(h, p.to?.[1]);
    h = hashNum(h, p.facing);
    h = hashNum(h, p.arrivalYaw);
    h = hashNum(h, p.lookAt?.[0]);
    h = hashNum(h, p.lookAt?.[1]);
    h = hashNum(h, p.lookAt?.[2]);
    if (p.path && p.path.length > 0) {
      h = hashNum(h, p.path.length);
      h = hashNum(h, p.path[0][0]);
      h = hashNum(h, p.path[0][1]);
      const last = p.path[p.path.length - 1];
      h = hashNum(h, last[0]);
      h = hashNum(h, last[1]);
    }
  }
  return h;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function yawTo(from: Vec2, to: Vec2, fallback: number): number {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  return Math.hypot(dx, dz) < 1e-4 ? fallback : Math.atan2(dx, dz);
}

function buildSegLengths(path: Vec2[] | null): { segLengths: Float64Array | null; length: number; straight: boolean } {
  if (!path || path.length < 2) return { segLengths: null, length: 0, straight: true };
  if (path.length === 2) {
    const len = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
    return { segLengths: null, length: len, straight: true };
  }
  const segLengths = new Float64Array(path.length - 1);
  let L = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segLengths[i - 1] = d;
    L += d;
  }
  return { segLengths, length: L, straight: false };
}

function pointAtResolved(r: Resolved, s: number): Vec2 {
  const path = r.path;
  if (!path || path.length === 0) return [0, 0];
  if (s <= 0 || r.length <= 0) return path[0];
  if (s >= r.length) return path[path.length - 1];
  if (path.length === 2 || !r.segLengths) {
    const k = s / r.length;
    return [lerp(path[0][0], path[1][0], k), lerp(path[0][1], path[1][1], k)];
  }
  const segs = r.segLengths;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (s <= seg) {
      const k = seg > 0 ? s / seg : 0;
      return [lerp(path[i][0], path[i + 1][0], k), lerp(path[i][1], path[i + 1][1], k)];
    }
    s -= seg;
  }
  return path[path.length - 1];
}

function pointAtResolvedX(r: Resolved, s: number): number {
  const path = r.path!;
  if (s <= 0) return path[0][0];
  if (s >= r.length) return path[path.length - 1][0];
  const segs = r.segLengths!;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (s <= seg) return seg > 0 ? lerp(path[i][0], path[i + 1][0], s / seg) : path[i][0];
    s -= seg;
  }
  return path[path.length - 1][0];
}

function pointAtResolvedZ(r: Resolved, s: number): number {
  const path = r.path!;
  if (s <= 0) return path[0][1];
  if (s >= r.length) return path[path.length - 1][1];
  const segs = r.segLengths!;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (s <= seg) return seg > 0 ? lerp(path[i][1], path[i + 1][1], s / seg) : path[i][1];
    s -= seg;
  }
  return path[path.length - 1][1];
}

/** Signed horizontal path curvature κ(s) (rad/m, + = turning left) over pointAt(path, s ± 0.25). */
function curvatureAtResolved(r: Resolved, s: number): number {
  if (r.straight || r.length < 0.08 || !r.path) return 0;
  const s0 = Math.max(0, s - 0.25);
  const s2 = Math.min(r.length, s + 0.25);
  const s1 = 0.5 * (s0 + s2);
  const ax = pointAtResolvedX(r, s0), az = pointAtResolvedZ(r, s0);
  const bx = pointAtResolvedX(r, s1), bz = pointAtResolvedZ(r, s1);
  const cx = pointAtResolvedX(r, s2), cz = pointAtResolvedZ(r, s2);
  const abx = bx - ax, abz = bz - az;
  const bcx = cx - bx, bcz = cz - bz;
  const l1 = Math.hypot(abx, abz);
  const l2 = Math.hypot(bcx, bcz);
  if (l1 < 1e-4 || l2 < 1e-4) return 0;
  const ds = 0.5 * (l1 + l2);
  return clamp(wrapAngle(Math.atan2(bcx, bcz) - Math.atan2(abx, abz)) / ds, -3.5, 3.5);
}

/**
 * Analytical trapezoidal velocity profile: eased start and stop, constant speed in between.
 * Preserves exact endpoints s(0)=0, s(1)=1 and returns normalized { s, v = ds/dτ, aLong = d²s/dτ² }.
 */
function travel(tau: number, ramp: number): { s: number; v: number; aLong: number } {
  if (tau <= 0) return { s: 0, v: 0, aLong: 0 };
  if (tau >= 1) return { s: 1, v: 0, aLong: 0 };
  const x = tau;
  const r = clamp(ramp, 1e-3, 0.5);
  const vc = 1 / (1 - r);
  if (x < r) return { s: (0.5 * vc * x * x) / r, v: vc * (x / r), aLong: vc / r };
  if (x > 1 - r) return { s: 1 - (0.5 * vc * (1 - x) * (1 - x)) / r, v: vc * ((1 - x) / r), aLong: -vc / r };
  return { s: vc * (x - r / 2), v: vc, aLong: 0 };
}

export interface Resolved {
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
  segLengths: Float64Array | null;
  straight: boolean;
  length: number;
  turnDur: number;
  inPlaceTurnDur: number;
  firstYaw: number;
  /** in-place verb that still moves the root (dismount hop, carried transfer): no gait, no turning */
  slide: boolean;
  accelRamp: number;
  turnScale: number;
  childArmchair: boolean;
}

export function derivedPosture(clip: ActorClip, from: Posture): Posture {
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

const EMPTY_TRACK: Resolved[] = [];

interface TrackCacheSlot {
  clipsRef: ActorClip[];
  len: number;
  stamp: number;
  extraLen: number;
  extraFirstT: number;
  initYaw: number;
  track: Resolved[];
}

interface ActorTrackCache {
  plain?: TrackCacheSlot;
  extra?: TrackCacheSlot;
}

const trackCache = new WeakMap<Segment, Partial<Record<ActorId, ActorTrackCache>>>();

/** Resolve an actor's clips into a kinematic chain (positions, yaw, posture at each clip boundary). */
export function resolveTrack(seg: Segment, actor: ActorId, extraPosture: { t: number; posture: Posture }[], initYaw?: number): Resolved[] {
  const rawClips = clipsOf(seg, actor);
  const len = rawClips.length;
  if (len === 0) return EMPTY_TRACK;
  const st = stOf(seg.startState, actor);
  const effectiveYaw = initYaw ?? st.facing;
  let stamp = ((seg.duration * 1024) | 0) ^ ((st.pos[0] * 1024) | 0) ^ ((st.pos[1] * 1024) | 0);
  for (let i = 0; i < len; i++) {
    const c = rawClips[i];
    stamp = (Math.imul(stamp, 31) + ((c.start * 1024) | 0) + ((c.dur * 1024) | 0) + c.verb.charCodeAt(0) + ((c.params.to?.[0] ?? c.params.facing ?? 0) * 256 | 0)) | 0;
  }
  const extraLen = extraPosture.length;
  const extraFirstT = extraLen > 0 ? extraPosture[0].t : 0;
  const hasExtra = extraLen > 0;
  let segMap = trackCache.get(seg);
  if (!segMap) {
    segMap = {};
    trackCache.set(seg, segMap);
  }
  let actorCache = segMap[actor];
  if (!actorCache) {
    actorCache = {};
    segMap[actor] = actorCache;
  }
  const slot = hasExtra ? actorCache.extra : actorCache.plain;
  if (
    slot &&
    slot.clipsRef === rawClips &&
    slot.len === len &&
    slot.stamp === stamp &&
    slot.extraLen === extraLen &&
    slot.extraFirstT === extraFirstT &&
    slot.initYaw === effectiveYaw
  ) {
    return slot.track;
  }

  const clips = rawClips.length > 1 ? [...rawClips].sort((a, b) => a.start - b.start) : rawClips;
  let pos: Vec2 = [st.pos[0], st.pos[1]];
  let yaw = effectiveYaw;
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
    let segLengths: Float64Array | null = null;
    let straight = true;
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
      const built = buildSegLengths(pts);
      segLengths = built.segLengths;
      length = built.length;
      straight = built.straight;
      endPos = pts[pts.length - 1];
      // heading of the first leg that actually moves
      for (let i = 1; i < pts.length; i++) {
        if ((segLengths ? segLengths[i - 1] : length) > 1e-3) { firstYaw = yawTo(pts[i - 1], pts[i], yaw); break; }
      }
      for (let i = pts.length - 1; i > 0; i--) {
        if ((segLengths ? segLengths[i - 1] : length) > 1e-3) { endYaw = yawTo(pts[i - 1], pts[i], yaw); break; }
      }
      const dYaw = Math.abs(wrapAngle(firstYaw - yaw));
      // turn in place before moving (scaled by per-actor turn inertia so Lady/Rival Bear share Bear's weight)
      turnDur = dYaw > 0.35 && length > 0.05 ? Math.min(0.3 * style.turnScale * (dYaw / Math.PI) + 0.1, clip.dur * 0.3) : 0;
      if (p.arrivalYaw !== undefined) endYaw = p.arrivalYaw;
      if (isMark(p.target)) mark = p.target;
      else mark = null;
    } else {
      // in-place verbs can still move the root (e.g. the hop down from Bear's shoulders)
      if (p.to && Math.hypot(p.to[0] - pos[0], p.to[1] - pos[1]) > 0.05) {
        const from: Vec2 = p.from ? [p.from[0], p.from[1]] : pos;
        path = p.path && p.path.length >= 2 ? p.path.map((q) => [q[0], q[1]] as Vec2) : [from, [p.to[0], p.to[1]]];
        const built = buildSegLengths(path);
        segLengths = built.segLengths;
        length = built.length;
        straight = built.straight;
        endPos = path[path.length - 1];
        slide = true;
      }
      if (p.facing !== undefined) endYaw = p.facing;
      else if (p.lookAt && ["give", "hug", "throw", "point_at", "carry", "peek", "wave"].includes(clip.verb)) {
        endYaw = yawTo(pos, [p.lookAt[0], p.lookAt[2]], yaw);
        if (clip.verb === "wave" || clip.verb === "point_at" || clip.verb === "peek") endYaw = lerpAngle(yaw, endYaw, 0.5);
      }
      if (isMark(p.target) && (clip.verb === "sit" || clip.verb === "sleep" || clip.verb === "hide")) mark = p.target;
      if (p.to && ((clip.verb === "stand_up" && fromPosture === "sit") || (p.target === "hammock" && (fromPosture === "sleep" || fromPosture === "sit")))) mark = null;
    }
    posture = derivedPosture(clip, fromPosture);
    const inPlaceYawDelta = !path && endYaw !== yaw ? Math.abs(wrapAngle(endYaw - yaw)) : 0;
    const inPlaceTurnDur = inPlaceYawDelta > 0
      ? clamp((inPlaceYawDelta / Math.PI) * (p.ambient ? 1.0 : 0.7) * style.turnScale, 0.2, Math.max(0.2, clip.dur))
      : 0;
    out.push({
      clip, end: clip.start + clip.dur, startPos: pos, endPos, startYaw: yaw, endYaw,
      fromPosture, posture, mark, path, segLengths, straight, length, turnDur, inPlaceTurnDur, firstYaw, slide,
      accelRamp: style.accelRamp, turnScale: style.turnScale, childArmchair: style.height < 1.3,
    });
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
  const newSlot: TrackCacheSlot = {
    clipsRef: rawClips,
    len,
    stamp,
    extraLen,
    extraFirstT,
    initYaw: effectiveYaw,
    track: out,
  };
  if (hasExtra) actorCache.extra = newSlot;
  else actorCache.plain = newSlot;
  return out;
}

export interface Kin {
  pos: Vec2;
  yaw: number;
  /** distance travelled along the current path */
  dist: number;
  turned: number;
  /** mean path speed of the clip (m/s) — a hurried walk turns into a run */
  speed?: number;
  /** signed in-place turn rate (rad/s) — drives the foot shuffle */
  turnRate?: number;
  /** move-phase local time and duration after pre-walk turnDur (s) */
  moveT?: number;
  moveDur?: number;
  /** instantaneous speed (m/s), longitudinal accel (m/s²), lateral accel (m/s²), yaw rate (rad/s) */
  vel?: number;
  aLong?: number;
  aLat?: number;
  omega?: number;
}

export function kinematics(r: Resolved, lt: number): Kin {
  const { clip } = r;
  if (clip.params.sceneCut) {
    const arrived = lt >= clip.dur * 0.5;
    return { pos: arrived ? r.endPos : r.startPos, yaw: arrived ? r.endYaw : r.startYaw, dist: 0, turned: 0, speed: 0, vel: 0, aLong: 0, aLat: 0, omega: 0 };
  }
  if (r.path && r.slide) {
    if (clip.params.target === "house_living" && clip.verb === "sit" && r.fromPosture !== "sit") {
      const motion = armchairMountMotion(r.childArmchair, lt / clip.dur);
      return { pos: pointAtResolved(r, motion.travel * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / 0.2))), dist: 0, turned: 0 };
    }
    if (clip.params.target === "hammock" && clip.verb === "sleep" && r.fromPosture !== "sleep") {
      const u = lt / clip.dur, k = hammockTravelProgress(true, u, clip.dur);
      return { pos: pointAtResolved(r, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / Math.max(0.001, hammockTiming(true, clip.dur).launch * 0.75)))), dist: 0, turned: 0 };
    }
    if (clip.params.target === "hammock" && (r.fromPosture === "sleep" || r.fromPosture === "sit")) {
      const u = lt / clip.dur, k = hammockTravelProgress(false, u, clip.dur);
      return { pos: pointAtResolved(r, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01((lt - 0.38) / Math.max(0.001, hammockTiming(false, clip.dur).launch - 0.48)))), dist: 0, turned: 0 };
    }
    // Clear the furniture before the pelvis lowers to its standing height.
    const moveDur = clip.verb === "stand_up" && r.fromPosture === "sit" ? clip.dur * 0.65 : clip.dur;
    const k = smooth(clamp01(lt / Math.max(moveDur, 1e-3)));
    return { pos: pointAtResolved(r, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / 0.4))), dist: 0, turned: 0 };
  }
  if (r.path) {
    const u = clamp(lt, 0, clip.dur);
    const moveDur = Math.max(1e-3, clip.dur - r.turnDur);
    if (u < r.turnDur) {
      const x = clamp01(u / r.turnDur);
      const k = smooth(x);
      const dYawSigned = wrapAngle(r.firstYaw - r.startYaw);
      const turnRate = (dYawSigned * 6 * x * (1 - x)) / r.turnDur;
      return {
        pos: r.startPos, yaw: lerpAngle(r.startYaw, r.firstYaw, k), dist: 0,
        turned: Math.abs(dYawSigned) * k, turnRate, moveT: 0, moveDur,
        vel: 0, aLong: 0, aLat: 0, omega: turnRate,
      };
    }
    const moveT = u - r.turnDur;
    const tau = moveT / moveDur;
    const ramp = clamp(r.accelRamp / moveDur, 1e-3, 0.42);
    const tr = travel(tau, ramp);
    const s = tr.s * r.length;
    const p = pointAtResolved(r, s);
    let yaw = r.firstYaw;
    if (!r.straight) {
      const a = pointAtResolved(r, Math.max(0, s - 0.2));
      const b = pointAtResolved(r, Math.min(r.length, s + 0.2));
      yaw = yawTo(a, b, r.firstYaw);
    }
    if (r.turnDur === 0) yaw = lerpAngle(r.startYaw, yaw, smooth(u / 0.25)); // small turns blend in while walking
    const vel = r.length > 1e-4 ? tr.v * (r.length / moveDur) : 0;
    const aLong = r.length > 1e-4 ? tr.aLong * (r.length / (moveDur * moveDur)) : 0;
    const kappa = curvatureAtResolved(r, s);
    const aLat = vel * vel * kappa;
    const omega = vel * kappa;
    return {
      pos: p, yaw, dist: s, turned: Math.abs(wrapAngle(r.firstYaw - r.startYaw)),
      speed: r.length / moveDur, moveT, moveDur, vel, aLong, aLat, omega,
    };
  }
  // in-place turns take longer the further they go (scaled by per-actor turn inertia)
  const dYawSigned = wrapAngle(r.endYaw - r.startYaw);
  const dYaw = Math.abs(dYawSigned);
  const turnS = clamp((dYaw / Math.PI) * (clip.params.ambient ? 1.0 : 0.7) * r.turnScale, 0.2, Math.max(0.2, clip.dur));
  const x = clamp01(lt / turnS);
  const k = smooth(x);
  const turnRate = (dYawSigned * 6 * x * (1 - x)) / turnS;
  return { pos: r.startPos, yaw: lerpAngle(r.startYaw, r.endYaw, k), dist: 0, turned: dYaw * k, turnRate, omega: turnRate };
}

export interface SpringKinMetrics {
  dist: number;
  speed: number;
  moveT: number;
  moveDur: number;
  aLong: number;
  aLat: number;
  omega: number;
}

/** Zero-allocation kinematics evaluator for spring convolution taps (skips pos/yaw interpolation). */
export function kinematicsMetricsInto(r: Resolved, lt: number, out: SpringKinMetrics): void {
  const { clip } = r;
  if (clip.params.sceneCut || (r.path && r.slide)) {
    out.dist = 0; out.speed = 0; out.moveT = lt; out.moveDur = clip.dur;
    out.aLong = 0; out.aLat = 0; out.omega = 0;
    return;
  }
  if (r.path) {
    const u = clamp(lt, 0, clip.dur);
    const moveDur = Math.max(1e-3, clip.dur - r.turnDur);
    if (u < r.turnDur) {
      const x = clamp01(u / r.turnDur);
      const dYawSigned = wrapAngle(r.firstYaw - r.startYaw);
      const turnRate = (dYawSigned * 6 * x * (1 - x)) / r.turnDur;
      out.dist = 0; out.speed = r.length / moveDur; out.moveT = 0; out.moveDur = moveDur;
      out.aLong = 0; out.aLat = 0; out.omega = turnRate;
      return;
    }
    const moveT = u - r.turnDur;
    const tau = moveT / moveDur;
    const ramp = clamp(r.accelRamp / moveDur, 1e-3, 0.42);
    const tr = travel(tau, ramp);
    const s = tr.s * r.length;
    const vel = r.length > 1e-4 ? tr.v * (r.length / moveDur) : 0;
    const aLong = r.length > 1e-4 ? tr.aLong * (r.length / (moveDur * moveDur)) : 0;
    const kappa = curvatureAtResolved(r, s);
    out.dist = s; out.speed = r.length / moveDur; out.moveT = moveT; out.moveDur = moveDur;
    out.aLong = aLong; out.aLat = vel * vel * kappa; out.omega = vel * kappa;
    return;
  }
  if (r.endYaw === r.startYaw) {
    out.dist = 0; out.speed = 0; out.moveT = lt; out.moveDur = clip.dur;
    out.aLong = 0; out.aLat = 0; out.omega = 0;
    return;
  }
  const dYawSigned = wrapAngle(r.endYaw - r.startYaw);
  const dYaw = Math.abs(dYawSigned);
  const turnS = clamp((dYaw / Math.PI) * (clip.params.ambient ? 1.0 : 0.7) * r.turnScale, 0.2, Math.max(0.2, clip.dur));
  const x = clamp01(lt / turnS);
  const turnRate = (dYawSigned * 6 * x * (1 - x)) / turnS;
  out.dist = 0; out.speed = 0; out.moveT = lt; out.moveDur = clip.dur;
  out.aLong = 0; out.aLat = 0; out.omega = turnRate;
}

export function activeIndex(track: Resolved[], lt: number): number {
  for (let i = track.length - 1; i >= 0; i--) if (track[i].clip.start <= lt) return i;
  return -1;
}

export function makeCtx(
  actor: ActorId,
  r: Resolved | null,
  kin: Kin,
  t: number,
  posture: Posture,
  fromPosture: Posture,
  mark: MarkId | null,
  yaw: number,
  pos: Vec2,
  holding: PropId | null = null,
): VerbCtx {
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
  const exitingSeat = clip?.params.to && (fromPosture === "sit" && clip.verb === "stand_up" || clip.params.target === "hammock" && (fromPosture === "sleep" || fromPosture === "sit"));
  const mountingHammock = clip?.verb === "sleep" && clip.params.target === "hammock" && clip.params.to && fromPosture !== "sleep";
  const mountingArmchair = clip?.verb === "sit" && clip.params.target === "house_living" && clip.params.to && fromPosture !== "sit";
  const seatPosition = mountingHammock || mountingArmchair ? clip!.params.to! : exitingSeat && r ? r.startPos : pos;
  const seatMark = seatMark0 && Math.hypot(MARKS[seatMark0].pos[0] - seatPosition[0], MARKS[seatMark0].pos[1] - seatPosition[1]) < 1.0 ? seatMark0 : null;
  const chairFit = seatMark === "house_living"
    ? (actor === "masha" ? { seatClearance: 0.11, seatForward: 0.43 }
      : actor === "bear" ? { seatClearance: 0.24, seatForward: 0.35 }
      : style.height < 1.3 ? { seatClearance: 0.11 * style.height, seatForward: 0.43 * style.height }
      : { seatClearance: 0.24 * (style.height / 2.4), seatForward: 0.35 * (style.height / 2.4) })
    : {};
  const hammockFit = seatMark === "hammock"
    ? (actor === "bear" ? { lieClearance: 0.25, seatClearance: 0.57 }
      : { lieClearance: 0.25 * (style.height / 2.4), seatClearance: 0.57 * (style.height / 2.4) })
    : {};
  return {
    actor, style, dur: clip ? clip.dur : 1, emotion: clip ? clip.emotion : "neutral", t,
    dist: kin.dist, turned: kin.turned, speed: kin.speed ?? 0, turnRate: kin.turnRate ?? 0,
    moveT: kin.moveT, moveDur: kin.moveDur, vel: kin.vel ?? 0, aLong: kin.aLong ?? 0, aLat: kin.aLat ?? 0, omega: kin.omega ?? 0,
    holding, fromPosture, posture, targetLocal,
    seat: seatMark ? SEAT_HEIGHT[seatMark] ?? 0 : 0,
    ...(seatMark === "house_living" ? { seatProfile: "armchair" as const } : {}),
    ...chairFit,
    ...hammockFit,
  };
}

/** Carry state for Masha: progress 0..1 of being lifted (null = not carried). */
export function carryState(seg: Segment, lt: number, mashaTrack: Resolved[]): { k: number } | null {
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

const EMPTY_CARRY_EVENTS: { t: number; posture: Posture }[] = [];
const carryEventsCache = new WeakMap<Segment, { clipsRef: ActorClip[]; len: number; events: { t: number; posture: Posture }[] }>();

export function carryEvents(seg: Segment): { t: number; posture: Posture }[] {
  const bearClips = seg.actorClips.bear;
  if (!bearClips || bearClips.length === 0) return EMPTY_CARRY_EVENTS;
  const cached = carryEventsCache.get(seg);
  if (cached && cached.clipsRef === bearClips && cached.len === bearClips.length) return cached.events;
  const events: { t: number; posture: Posture }[] = [];
  for (let i = 0; i < bearClips.length; i++) {
    const c = bearClips[i];
    if (c.verb === "carry" && (!c.params.target || c.params.target === "masha")) {
      events.push({ t: c.start + c.dur * 0.6, posture: "carried" });
    }
  }
  const result = events.length > 0 ? events : EMPTY_CARRY_EVENTS;
  carryEventsCache.set(seg, { clipsRef: bearClips, len: bearClips.length, events: result });
  return result;
}

const startYawsCache = new WeakMap<Timeline["segments"], { stamp: number; yaws: Record<ActorId, number>[] }>();

/** Each actor's yaw at the start of segment `index`, chained from the first segment's start state. */
export function startYaws(segs: Timeline["segments"], index: number): Record<ActorId, number> {
  if (segs.length === 0) {
    const zero = {} as Record<ActorId, number>;
    for (let i = 0; i < ACTOR_IDS.length; i++) zero[ACTOR_IDS[i]] = 0;
    return zero;
  }
  let stamp = segs.length;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j].segment;
    stamp = hashNum(stamp, s.duration);
    for (let i = 0; i < ACTOR_IDS.length; i++) {
      const a = ACTOR_IDS[i];
      const clips = clipsOf(s, a);
      if (clips.length > 0) {
        const last = clips[clips.length - 1];
        stamp = hashNum(stamp, (clips.length << 4) | i);
        stamp = hashNum(stamp, last.params.facing ?? last.params.arrivalYaw ?? last.params.to?.[0] ?? last.start);
      }
    }
  }
  let entry = startYawsCache.get(segs);
  if (!entry || entry.stamp !== stamp) {
    const allYaws: Record<ActorId, number>[] = new Array(segs.length);
    const cur = {} as Record<ActorId, number>;
    const firstState = segs[0].segment.startState;
    for (let i = 0; i < ACTOR_IDS.length; i++) {
      const a = ACTOR_IDS[i];
      cur[a] = stOf(firstState, a).facing;
    }
    allYaws[0] = { ...cur };
    for (let j = 0; j < segs.length - 1; j++) {
      const seg = segs[j].segment;
      for (let i = 0; i < ACTOR_IDS.length; i++) {
        const a = ACTOR_IDS[i];
        if (clipsOf(seg, a).length > 0) {
          const tr = resolveTrack(seg, a, EMPTY_CARRY_EVENTS, cur[a]);
          if (tr.length > 0) cur[a] = tr[tr.length - 1].endYaw;
        }
      }
      allYaws[j + 1] = { ...cur };
    }
    entry = { stamp, yaws: allYaws };
    startYawsCache.set(segs, entry);
  }
  return entry.yaws[Math.min(index, segs.length - 1)];
}

/** Where Masha sits when riding on Bear's shoulders (root position). */
export function shoulderSeat(bear: ActorFrame): Vec3 {
  return carrySeatRoot(bear);
}
