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

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
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

/** Signed horizontal path curvature κ(s) (rad/m, + = turning left) over pointAt(path, s ± 0.25). */
function curvatureAt(path: Vec2[], s: number, length: number): number {
  if (length < 0.08 || path.length < 2) return 0;
  const s0 = Math.max(0, s - 0.25);
  const s2 = Math.min(length, s + 0.25);
  const s1 = 0.5 * (s0 + s2);
  const a = pointAt(path, s0);
  const b = pointAt(path, s1);
  const c = pointAt(path, s2);
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const bcx = c[0] - b[0], bcz = c[1] - b[1];
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
  length: number;
  turnDur: number;
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

/** Resolve an actor's clips into a kinematic chain (positions, yaw, posture at each clip boundary). */
export function resolveTrack(seg: Segment, actor: ActorId, extraPosture: { t: number; posture: Posture }[], initYaw?: number): Resolved[] {
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
      if (p.to && ((clip.verb === "stand_up" && fromPosture === "sit") || (p.target === "hammock" && (fromPosture === "sleep" || fromPosture === "sit")))) mark = null;
    }
    posture = derivedPosture(clip, fromPosture);
    out.push({
      clip, end: clip.start + clip.dur, startPos: pos, endPos, startYaw: yaw, endYaw,
      fromPosture, posture, mark, path, length, turnDur, firstYaw, slide,
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
      return { pos: pointAt(r.path, motion.travel * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / 0.2))), dist: 0, turned: 0 };
    }
    if (clip.params.target === "hammock" && clip.verb === "sleep" && r.fromPosture !== "sleep") {
      const u = lt / clip.dur, k = hammockTravelProgress(true, u, clip.dur);
      return { pos: pointAt(r.path, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / Math.max(0.001, hammockTiming(true, clip.dur).launch * 0.75)))), dist: 0, turned: 0 };
    }
    if (clip.params.target === "hammock" && (r.fromPosture === "sleep" || r.fromPosture === "sit")) {
      const u = lt / clip.dur, k = hammockTravelProgress(false, u, clip.dur);
      return { pos: pointAt(r.path, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01((lt - 0.38) / Math.max(0.001, hammockTiming(false, clip.dur).launch - 0.48)))), dist: 0, turned: 0 };
    }
    // Clear the furniture before the pelvis lowers to its standing height.
    const moveDur = clip.verb === "stand_up" && r.fromPosture === "sit" ? clip.dur * 0.65 : clip.dur;
    const k = smooth(clamp01(lt / Math.max(moveDur, 1e-3)));
    return { pos: pointAt(r.path, k * r.length), yaw: lerpAngle(r.startYaw, r.endYaw, smooth(clamp01(lt / 0.4))), dist: 0, turned: 0 };
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
    const p = pointAt(r.path, s);
    // smoothed tangent (look a little ahead and behind on the path)
    const a = pointAt(r.path, Math.max(0, s - 0.2));
    const b = pointAt(r.path, Math.min(r.length, s + 0.2));
    let yaw = yawTo(a, b, r.firstYaw);
    if (r.turnDur === 0) yaw = lerpAngle(r.startYaw, yaw, smooth(u / 0.25)); // small turns blend in while walking
    const vel = r.length > 1e-4 ? tr.v * (r.length / moveDur) : 0;
    const aLong = r.length > 1e-4 ? tr.aLong * (r.length / (moveDur * moveDur)) : 0;
    const kappa = curvatureAt(r.path, s, r.length);
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

export function activeIndex(track: Resolved[], lt: number): number {
  let idx = -1;
  for (let i = 0; i < track.length; i++) if (track[i].clip.start <= lt) idx = i;
  return idx;
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

export function carryEvents(seg: Segment): { t: number; posture: Posture }[] {
  return seg.actorClips.bear
    .filter((c) => c.verb === "carry" && (!c.params.target || c.params.target === "masha"))
    .map((c) => ({ t: c.start + c.dur * 0.6, posture: "carried" as Posture }));
}

/** Each actor's yaw at the start of segment `index`, chained from the first segment's start state. */
export function startYaws(segs: Timeline["segments"], index: number): Record<ActorId, number> {
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

/** Where Masha sits when riding on Bear's shoulders (root position). */
export function shoulderSeat(bear: ActorFrame): Vec3 {
  return carrySeatRoot(bear);
}
