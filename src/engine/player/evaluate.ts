// evaluate(timeline, t) → FrameState (spec §7.4). PURE and deterministic: no Date, no Math.random, no
// globals mutated; blinks and fidgets are functions of t. The renderer applies the result each frame.
import type { ActorFrame, ActorSpringState, FaceParams, FrameState, FxFrame, ObjectContact, PropFrame } from "../api";
import {doorOpenAt,doorHandleAt,objectOpenAt,cupboardHandleAt} from '../../shared/interactiveObjects';
import {
  ACTOR_IDS, MARK_IDS, PROP_IDS, ADDED_ACTOR_START,
  type ActorClip, type ActorId, type CamKey, type Emotion, type MarkId, type Posture, type PropId, type PropLocation,
  type Segment, type TimeOfDay, type Timeline, type Vec2, type Vec3, type Viseme, type WorldState,
} from "../../shared/schema";
import { LOCOMOTION_VERBS, STRIDE } from "../../shared/grammar";
import { MARKS, isInsideHouse } from "../../shared/bible/set";
import { initialWorldState } from "../../compiler/worldState";
import {
  CROSSFADE_S, SPRING_TAPS, SPRING_WINDOW_S, addLayer, applyLookAt, blendLayers, qmul, clamp, clamp01,
  convolveSpring, easeInOut, lerp, lookAtPose, qrot, qaxis, smooth, springKernel, window01, type PoseLayer,
} from "../motion/blend";
import { SEAT_HEIGHT, STYLES, evaluatePose, type VerbCtx } from "../motion/library";
import { byPersona, hash1 } from "../motion/verbs/common";
import { STRIDE_SCALE } from "../motion/verbs/locomotion";
import { swingAngleAt as clipSwingAngleAt } from "../motion/verbs/objects";
import {emotionWeights,emotionBlendSeconds,type EmotionWeights} from '../motion/emotion';
import {propRestPosition as restPos,propPlacementAtMark} from '../../shared/propPlacement';
import {carrySeatRoot,carryLiftRootHeight} from '../../shared/carrySupport';
import {armchairMountMotion,hammockTiming,hammockTravelProgress} from '../../shared/physicalInteractions';
import {cookingSupportHeightAt} from '../../shared/cookingStation';
export {PROP_REST_HEIGHT} from '../../shared/propPlacement';

// ---------- constants ----------

/** Default wide camera of the yard (empty timeline, or a segment without camera cues). */
export const DEFAULT_CAMERA: CamKey = { pos: [1.4, 2.4, 7.8], look: [-0.8, 1.1, 0.15], fov: 43 };

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
  accelRamp: number;
  turnScale: number;
  childArmchair: boolean;
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
      // turn in place before moving (scaled by per-actor turn inertia so Lady/Rival Bear share Bear's weight)
      turnDur = dYaw > 0.35 && length > 0.05 ? Math.min(0.3 * style.turnScale * (dYaw / Math.PI) + 0.1, clip.dur * 0.3) : 0;
      if(p.arrivalYaw!==undefined)endYaw=p.arrivalYaw;
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
      if(p.to&&((clip.verb==='stand_up'&&fromPosture==='sit')||(p.target==='hammock'&&(fromPosture==='sleep'||fromPosture==='sit'))))mark=null;
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

interface Kin {
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

function kinematics(r: Resolved, lt: number): Kin {
  const { clip } = r;
  if(clip.params.sceneCut){
    const arrived=lt>=clip.dur*.5;
    return {pos:arrived?r.endPos:r.startPos,yaw:arrived?r.endYaw:r.startYaw,dist:0,turned:0,speed:0,vel:0,aLong:0,aLat:0,omega:0};
  }
  if (r.path && r.slide) {
    if(clip.params.target==='house_living'&&clip.verb==='sit'&&r.fromPosture!=='sit'){
      const motion=armchairMountMotion(r.childArmchair,lt/clip.dur);
      return{pos:pointAt(r.path,motion.travel*r.length),yaw:lerpAngle(r.startYaw,r.endYaw,smooth(clamp01(lt/.2))),dist:0,turned:0};
    }
    if(clip.params.target==='hammock'&&clip.verb==='sleep'&&r.fromPosture!=='sleep'){
      const u=lt/clip.dur,k=hammockTravelProgress(true,u,clip.dur);
      return {pos:pointAt(r.path,k*r.length),yaw:lerpAngle(r.startYaw,r.endYaw,smooth(clamp01(lt/Math.max(.001,hammockTiming(true,clip.dur).launch*.75)))),dist:0,turned:0};
    }
    if(clip.params.target==='hammock'&&(r.fromPosture==='sleep'||r.fromPosture==='sit')){
      const u=lt/clip.dur,k=hammockTravelProgress(false,u,clip.dur);
      return {pos:pointAt(r.path,k*r.length),yaw:lerpAngle(r.startYaw,r.endYaw,smooth(clamp01((lt-.38)/Math.max(.001,hammockTiming(false,clip.dur).launch-.48)))),dist:0,turned:0};
    }
    // Clear the furniture before the pelvis lowers to its standing height.
    const moveDur=clip.verb==='stand_up'&&r.fromPosture==='sit'?clip.dur*.65:clip.dur;
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
      if (c.params.putDown && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: c.params.putDown });
      else if (c.verb === "drop" && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: c.params.dropAt ?? "clearing" });
      else if (c.verb === "take" && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: a });
      else if (c.verb === "give" && item && isActor(c.params.target)) events.push({ t: c.start + c.dur * 0.6, prop: item, at: c.params.target });
      else if (c.verb === "throw" && item) {
        const tgt = c.params.target;
        const land: PropLocation = isMark(tgt) ? tgt : isActor(tgt) ? (seg.endState.props[item]?.at ?? tgt) : (seg.endState.props[item]?.at ?? "clearing");
        const to: Vec3 = c.params.lookAt ? [c.params.lookAt[0], 0.1, c.params.lookAt[2]] : isMark(tgt) ? restPos(item, tgt) : [0, 0.1, 0];
        events.push({ t: c.start + c.dur * 0.4, prop: item, at: "hidden", flight: { t0: c.start + c.dur * 0.4, t1: end, from: a, to } });
        events.push({ t: end, prop: item, at: land });
      } else if (c.verb === "cook") {
        if(item)events.push({t:c.start,prop:item,at:a});
        const pc = seg.endState.props.pancakes?.at;
        if (pc && pc !== at.pancakes) events.push({ t: c.start + c.dur * 0.85, prop: "pancakes", at: pc });
      } else if (c.verb === "fish") {
        if(item)events.push({t:c.start,prop:item,at:a});
        const f = c.params.catchesFish===true?a:c.params.catchesFish===false?undefined:seg.endState.props.fish?.at;
        if (f && f !== "hidden") events.push({ t: c.start + c.dur * 0.7, prop: "fish", at: f });
      } else if(c.verb==='water_plants'&&item)events.push({t:c.start,prop:item,at:a});
    }
  }
  events.sort((x, y) => x.t - y.t);
  // reconcile with the compiled end state: anything still different switches when its last clip ends
  const sim = { ...at };
  const setDown:PropEvent[]=[];
  for (const e of events) {
    if(isActor(e.at)){
      const actor=e.at,clip=clipsOf(seg,actor).find(c=>e.t>=c.start&&e.t<c.start+c.dur);
      const position=clip?.params.from??stOf(seg.startState,actor).pos;
      const mark=MARK_IDS.reduce((best,m)=>Math.hypot(MARKS[m].pos[0]-position[0],MARKS[m].pos[1]-position[1])<Math.hypot(MARKS[best].pos[0]-position[0],MARKS[best].pos[1]-position[1])?m:best,MARK_IDS[0]);
      for(const old of PROP_IDS)if(old!==e.prop&&sim[old]===actor){sim[old]=mark;setDown.push({t:e.t,prop:old,at:mark});}
    }
    sim[e.prop] = e.at;
  }
  events.push(...setDown);
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

function makeCtx(
  actor: ActorId,
  r: Resolved | null,
  kin: Kin,
  lt: number,
  t: number,
  seg: Segment,
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
  const exitingSeat=clip?.params.to&&(fromPosture==='sit'&&clip.verb==='stand_up'||clip.params.target==='hammock'&&(fromPosture==='sleep'||fromPosture==='sit'));
  const mountingHammock=clip?.verb==='sleep'&&clip.params.target==='hammock'&&clip.params.to&&fromPosture!=='sleep';
  const mountingArmchair=clip?.verb==='sit'&&clip.params.target==='house_living'&&clip.params.to&&fromPosture!=='sit';
  const seatPosition=mountingHammock||mountingArmchair?clip!.params.to!:exitingSeat&&r?r.startPos:pos;
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
  void seg;
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

interface ImpulseSample {
  aLong: number;
  aLat: number;
  omega: number;
  yEff: number;
  latStep: number;
  portalCut: boolean;
}

const ZERO_IMPULSE: ImpulseSample = { aLong: 0, aLat: 0, omega: 0, yEff: 0, latStep: 0, portalCut: false };

function doorContact(seg: Segment, lt: number, pos: Vec2, yaw: number, clipLt: number, dur: number, holding: PropId | null): ObjectContact {
  const inside = isInsideHouse(pos[0], pos[1]);
  const position = doorHandleAt(doorOpenAt(seg, lt), inside);
  let side: 1 | -1 = 1;
  if (!holding) {
    const local = qrot(qaxis([0, 1, 0], -yaw), [position[0] - pos[0], 0, position[2] - pos[1]]);
    side = local[0] >= 0 ? 1 : -1;
  }
  return { position, side, strength: Math.min(smooth(clipLt / 0.25), smooth((dur - clipLt) / 0.25)) };
}

/**
 * Sample vertical center-of-mass motion and horizontal/rotational acceleration at an arbitrary story time
 * across segment/clip boundaries for the 16-tap causal spring-damper convolution.
 */
function sampleMotionAt(
  segs: Timeline["segments"],
  trackFor: (segIdx: number, actor: ActorId) => Resolved[],
  actor: ActorId,
  tSample: number,
  hintSegIdx: number,
): ImpulseSample {
  if (segs.length === 0 || tSample < segs[0].offset) return ZERO_IMPULSE;
  let sIdx = Math.min(hintSegIdx, segs.length - 1);
  while (sIdx > 0 && tSample < segs[sIdx].offset) sIdx--;
  while (sIdx + 1 < segs.length && tSample >= segs[sIdx].offset + segs[sIdx].segment.duration) sIdx++;
  const { offset, segment: seg } = segs[sIdx];
  const ltS = tSample - offset;
  if (ltS < 0 || ltS > seg.duration) return ZERO_IMPULSE;
  const track = trackFor(sIdx, actor);
  const idx = activeIndex(track, ltS);
  const r = idx >= 0 ? track[idx] : null;
  const inClip = r ? ltS < r.end : false;
  const style = STYLES[actor];
  let carryY = 0;
  let carriedNow = false;
  if (actor === "masha" && seg.actorClips.bear.some((c) => c.verb === "carry")) {
    const carry = carryState(seg, ltS, track);
    if (carry && (!inClip || !r || !LOCOMOTION_VERBS.includes(r.clip.verb))) {
      carryY = carryLiftRootHeight(easeInOut(carry.k), STYLES.bear.shoulderHeight);
      carriedNow = true;
    }
  }
  if (!r || !inClip) return { ...ZERO_IMPULSE, yEff: carryY };
  if (r.clip.params.sceneCut) return { ...ZERO_IMPULSE, yEff: carryY, portalCut: true };

  const ltClip = ltS - r.clip.start;
  const dur = Math.max(1e-3, r.clip.dur);
  const u = clamp01(ltClip / dur);
  const verb = r.clip.verb;
  const kin = kinematics(r, ltClip);
  let aLong = kin.aLong ?? 0;
  const aLat = kin.aLat ?? 0;
  let omega = kin.omega ?? kin.turnRate ?? 0;
  let yEff = carryY;
  let latStep = 0;

  if (!carriedNow && r.fromPosture === "carried" && r.posture !== "carried") {
    const hopDur = clamp(dur, 0.2, 0.85);
    const s = clamp01(ltClip / hopDur);
    yEff += lerp(STYLES.bear.shoulderHeight, 0, s) + 4 * s * (1 - s) * 0.25;
  }

  if (LOCOMOTION_VERBS.includes(verb) && kin.dist > 0.002) {
    const speed = kin.speed && kin.speed > 0 ? kin.speed : 1;
    const gait = verb === "run_to" || verb === "chase" ? "run" : verb === "tiptoe_to" ? "tiptoe" : speed > style.cadence.walk * STRIDE[actor] * 1.7 ? "run" : "walk";
    const stride = STRIDE[actor] * STRIDE_SCALE[gait];
    const stepPh = (kin.dist / Math.max(0.05, stride)) * Math.PI;
    const moveT = kin.moveT ?? ltClip;
    const moveDur = kin.moveDur ?? dur;
    const wMove = Math.min(smooth(moveT / 0.25), smooth((moveDur - moveT) / 0.3));
    yEff += (gait === "run" ? 0.045 : 0.018) * style.bounce * Math.abs(Math.sin(stepPh)) * wMove;
    latStep = Math.sin(stepPh) * (gait === "run" ? 0.09 : 0.14) * wMove;
  } else if (verb === "jump") {
    const h = byPersona(actor, 0.28 * clamp(style.bounce, 0.9, 1.25), 0.19, 0.30, 0.24);
    const T_air = Math.min(Math.sqrt((8 * h) / 9.81), dur * 0.54);
    const massFactor = clamp(0.75 + 0.35 * Math.sqrt(style.mass / 60), 0.7, 1.45);
    const T_pre = Math.min(0.24 * massFactor, (dur - T_air) * 0.52);
    const tLand = T_pre + T_air;
    const T_comp = Math.min(0.30 * massFactor, Math.max(0.06, dur - tLand));
    const preU = clamp01(ltClip / Math.max(1e-3, T_pre));
    const crouchPre = ltClip < T_pre ? smooth(preU / 0.65) * (1 - smooth((preU - 0.65) / 0.35)) : 0;
    const s = ltClip >= T_pre && ltClip <= tLand ? clamp01((ltClip - T_pre) / Math.max(1e-3, T_air)) : 0;
    const air = ltClip >= T_pre && ltClip <= tLand ? 4 * s * (1 - s) : 0;
    const postU = ltClip > tLand ? clamp01((ltClip - tLand) / Math.max(1e-3, T_comp)) : 0;
    const pPow = Math.pow(postU, 0.55);
    const crouchLand = ltClip > tLand && postU < 1 ? 4 * pPow * (1 - pPow) * clamp(0.8 + 0.2 * massFactor, 0.8, 1.35) : 0;
    yEff += h * air - 0.045 * style.hipHeight * (crouchPre + crouchLand);
  } else if (verb === "fall_down") {
    const qFall = clamp01((u - 0.15) / 0.25);
    const fallK = qFall * qFall;
    const getUp = r.posture === "sit" ? 0 : smooth((u - 0.75) / 0.25);
    const tau = ltClip - 0.4 * dur;
    const mNorm = clamp(style.mass / 60, 0.1, 5.5);
    const amp = clamp(0.068 / Math.pow(mNorm, 0.35), 0.025, 0.12) * style.hipHeight;
    const lambda = clamp(3.5 + 1.8 * Math.sqrt(mNorm), 4.0, 9.0);
    const omegaF = clamp(18 / Math.pow(mNorm, 0.22), 11, 24);
    const bounce = tau > 0 ? amp * Math.exp(-lambda * tau) * Math.abs(Math.sin(omegaF * tau)) * smooth((0.85 - u) / 0.1) * (1 - getUp) : 0;
    yEff += -0.65 * style.hipHeight * fallK * (1 - getUp) + bounce;
  } else if (verb === "angry_stomp") {
    const liftS = (c: number) => Math.max(0, Math.sin(clamp01((u - (c - 0.15)) / 0.15) * Math.PI));
    const recoil = (c: number) => {
      const tau = ltClip - c * dur;
      return tau > 0 && u < c + 0.25 ? Math.exp(-13 * tau) * Math.sin(24 * tau) * smooth((c + 0.25 - u) / 0.06) : 0;
    };
    const lL = u < 0.5 ? liftS(0.3) : 0;
    const lR = u >= 0.5 ? liftS(0.7) : 0;
    const absorb = Math.max(0, recoil(0.3) + recoil(0.7)) * clamp(0.7 + 0.35 * Math.sqrt(style.mass / 60), 0.7, 1.4);
    yEff += 0.02 * (lL + lR) - 0.012 * absorb * style.hipHeight;
  } else if (verb === "surprised") {
    const s = clamp01(u / 0.32);
    const hop = u < 0.32 ? 4 * s * (1 - s) : 0;
    yEff += hop * byPersona(actor, 0.08, 0.04, 0.09, 0.065);
  } else if (verb === "sneeze") {
    const windUp = smooth(u / 0.52) * (1 - smooth((u - 0.52) / 0.06));
    const snap = smooth((u - 0.53) / 0.05) * (1 - smooth((u - 0.9) / 0.1));
    yEff += 0.015 * windUp - 0.04 * snap * style.hipHeight;
    aLong += (snap - windUp * 0.4) * 3.5;
  } else if (verb === "spin") {
    const uSpin = clamp01((u - 0.08) / 0.84);
    if (u >= 0.08 && u <= 0.92) omega += (uSpin < 0.5 ? 4 * uSpin : 4 * (1 - uSpin)) * ((Math.PI * 2) / (0.84 * dur));
    yEff += Math.sin(u * Math.PI) * 0.04 * style.bounce;
  } else if (verb === "dance") {
    const beat = byPersona(actor, 2.2, 1.4, 2.0, 2.1);
    yEff += -0.07 * style.hipHeight * Math.abs(Math.sin(ltClip * beat * Math.PI));
    latStep = Math.sin(ltClip * beat * Math.PI * 0.5) * 0.12;
  } else if (verb === "laugh") {
    const f = byPersona(actor, 7, 4.5, 8.5, 6.5);
    yEff += Math.abs(Math.sin(ltClip * f * Math.PI)) * byPersona(actor, 0.02, 0.008, 0.012, 0.016);
  } else if (verb === "swing") {
    const a = clipSwingAngleAt(ltClip, dur);
    yEff += (1 - Math.cos(a)) * 2.97;
    aLong += Math.sin(a) * 4.5;
  } else if (r.clip.params.target === "hammock" && r.clip.params.to && (verb === "sleep" || verb === "wake_up" || verb === "stand_up")) {
    const mount = verb === "sleep";
    const { launch, land } = hammockTiming(mount, dur);
    if (ltClip >= launch && ltClip <= land) {
      const q = (ltClip - launch) / Math.max(1e-3, land - launch);
      yEff += 4 * (mount ? 0.47 : 0.25) * q * (1 - q);
    }
  }
  return { aLong, aLat, omega, yEff, latStep, portalCut: false };
}

/**
 * Stateless finite-window causal 2nd-order spring-damper filter (16 taps over [t - 0.8s, t])
 * evaluated across clip and segment boundaries. Guaranteed seek-invariant and zero-impulse when stationary.
 */
function evaluateCausalSpring(
  segs: Timeline["segments"],
  trackFor: (segIdx: number, actor: ActorId) => Resolved[],
  actor: ActorId,
  t: number,
  hintSegIdx: number,
  instantYawVel: number,
): ActorSpringState {
  const style = STYLES[actor];
  const dt = SPRING_WINDOW_S / SPRING_TAPS;
  const totalSamples = SPRING_TAPS + 2;
  const samples: ImpulseSample[] = new Array(totalSamples);
  let active = false;
  for (let j = 0; j < totalSamples; j++) {
    const s = sampleMotionAt(segs, trackFor, actor, t - (j + 0.5) * dt, hintSegIdx);
    samples[j] = s;
    if (s.aLong !== 0 || s.aLat !== 0 || s.omega !== 0 || s.yEff !== 0 || s.latStep !== 0) active = true;
  }
  if (!active) return { swayX: 0, swayZ: 0, bounceY: 0, yawVel: instantYawVel, time: t };

  const latInputs = new Float64Array(SPRING_TAPS);
  const longInputs = new Float64Array(SPRING_TAPS);
  const vertInputs = new Float64Array(SPRING_TAPS);
  const latGain = 0.85 + 0.35 * style.bankGain;
  const longGain = 0.75 + 0.25 * style.bankGain;
  const vertGain = clamp(0.65 + 0.35 * style.bounce, 0.5, 1.35);

  for (let k = 0; k < SPRING_TAPS; k++) {
    const s0 = samples[k];
    const s1 = samples[k + 1];
    const s2 = samples[k + 2];
    latInputs[k] = (-s0.aLat / 9.81) * latGain + s0.latStep;
    longInputs[k] = (-s0.aLong / 9.81) * longGain;
    const yAccel = (s0.portalCut || s1.portalCut || s2.portalCut) ? 0 : clamp((s0.yEff - 2 * s1.yEff + s2.yEff) / (dt * dt), -40, 40);
    vertInputs[k] = (-yAccel / 9.81) * vertGain;
  }

  const kernel = springKernel(style.springFreq, style.springDamping);
  return {
    swayX: convolveSpring(latInputs, kernel, 1, 1),
    swayZ: convolveSpring(longInputs, kernel, 1, 1),
    bounceY: convolveSpring(vertInputs, kernel, 1, 1),
    yawVel: instantYawVel,
    time: t,
  };
}

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
  if(mark==='house_living'&&posture==='sit'){
    yaw=MARKS.house_living.facing;
    kin={...kin,yaw,turned:0,turnRate:0,omega:0};
  }
  // Bear's carry lifts Masha onto his shoulders
  const carried = actor === "masha" && carry !== null && bear !== null;
  if (carried) {
    if (!inClip || !r || !LOCOMOTION_VERBS.includes(r.clip.verb)) {
      fromPosture = carry.k >= 1 ? "carried" : fromPosture;
      posture = "carried";
    }
  }
  const ctx = makeCtx(actor, inClip ? r : null, kin, clipLt, t, seg, posture, fromPosture, mark, yaw, pos, holding);
  const poseTime=(clip:ActorClip|undefined,local:number)=>clip?.params.putDown?Math.max(0,clip.dur-local):local;
  let ev = evaluatePose(verb, poseTime(inClip?r?.clip:undefined,clipLt), inClip && r ? r.clip.params : {}, ctx);
  // A previous seated idle has no groundW field. Body blending defaults that
  // absent value to 1, so retain the getting-up verb's explicit support ramp.
  const transitionGroundWeight=verb==='sit'&&r?.clip.params.target==='house_living'&&r.clip.params.to?ev.layer.groundW:(verb==='stand_up'||verb==='wake_up'||r?.clip.params.target==='hammock'&&r.clip.params.to)&&fromPosture!=='stand'&&fromPosture!=='offstage'?ev.layer.groundW:undefined;
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
    const pMoveDur = Math.max(1e-3, prevR.clip.dur - prevR.turnDur);
    const pctx = makeCtx(
      actor, prevR,
      { pos: prevR.endPos, yaw: prevR.endYaw, dist: prevR.length, turned: 0, moveT: pMoveDur, moveDur: pMoveDur, vel: 0, aLong: 0, aLat: 0, omega: 0 },
      prevR.clip.dur, t, prevSeg, prevR.posture, prevR.fromPosture, prevR.mark, prevR.endYaw, prevR.endPos, holding,
    );
    const prev = evaluatePose(prevR.clip.verb, poseTime(prevR.clip,prevR.clip.dur), prevR.clip.params, pctx);
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
  if(r?.clip.params.sceneCut&&!r.clip.params.portal){
    const progress=clamp01((lt-r.clip.start)/r.clip.dur);
    opacity=smooth(Math.abs(progress-.5)*2);
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

  // Causal 16-tap 2nd-order spring-damper convolution driving frame.spring & frame.secondary
  let instantYawVel = kin.omega ?? kin.turnRate ?? 0;
  if (inClip && r && verb === "spin") {
    const uSpin = clamp01((clipLt / Math.max(1e-3, r.clip.dur) - 0.08) / 0.84);
    if (uSpin > 0 && uSpin < 1) instantYawVel += (uSpin < 0.5 ? 4 * uSpin : 4 * (1 - uSpin)) * ((Math.PI * 2) / (0.84 * Math.max(1e-3, r.clip.dur)));
  }
  const spring = evaluateCausalSpring(segs, trackFor, actor, t, segmentIndex, instantYawVel);
  const roll = (q: [number, number, number, number] | undefined) => (q ? 2 * Math.atan2(q[2], q[3]) : 0);
  const sway = clamp01(0.5 + 0.44 * spring.swayX + 0.22 * clamp(spring.yawVel / 4, -1, 1) + 0.18 * clamp(roll(L.bones.Hips), -1, 1));
  const jiggle = clamp01(0.5 + 0.46 * spring.bounceY + 0.16 * spring.swayZ + 0.04 * Math.sin(t * 2 * Math.PI * STYLES[actor].breathRate - 0.8));

  const release=inClip&&r?.clip.params.putDown&&r.clip.params.item?{item:r.clip.params.item,...propPlacementAtMark(r.clip.params.item,r.clip.params.putDown)}:null;
  const pickup=inClip&&r?.clip.params.pickUpAt&&r.clip.params.item?{item:r.clip.params.item,...propPlacementAtMark(r.clip.params.item,r.clip.params.pickUpAt)}:null;
  const contactTarget = r?.clip.params.target;
  const activeContact: { objectContact: ObjectContact } | Record<string, never> =
    inClip && r && (verb === "open" || verb === "close")
      ? contactTarget === "cupboard"
        ? { objectContact: { position: cupboardHandleAt(objectOpenAt(seg, lt, "kitchen_cupboard")), side: 1 as const, strength: Math.min(smooth(clipLt / 0.3), smooth((r.clip.dur - clipLt) / 0.3)) } }
        : (contactTarget === "door" || contactTarget === "house_door")
          ? { objectContact: doorContact(seg, lt, pos, finalYaw, clipLt, r.clip.dur, holding) }
          : {}
      : {};
  const frame: ActorFrame = {
    pos: pos3,
    yaw: finalYaw,
    opacity,
    bones: L.bones,
    hipsOffset: L.hipsOffset,
    groundWeight:transitionGroundWeight??L.groundW??1,
    face: faceOut,
    holding,
    posture,
    verb,
    action: { time:clipLt, duration:inClip&&r?r.clip.dur:0,...(inClip&&r&&verb==='fish'&&(r.clip.params.catchesFish===true||r.clip.params.catchesFish===undefined&&seg.endState.props.fish?.at===actor)?{contactEnd:r.clip.dur*.7}:{}) },
    ...(inClip&&r&&verb==='hug'&&isActor(r.clip.params.target)?{interaction:{kind:'hug' as const,partner:r.clip.params.target}}:{}),
    ...(release?{putDown:{item:release.item,position:release.pos,rotation:release.rot,release:.5}}:{}),
    ...(pickup?{pickup:{item:pickup.item,position:pickup.pos,rotation:pickup.rot,release:.5}}:{}),
    ...activeContact,
    ...(carried&&carry?{riding:{carrier:'bear' as const,progress:easeInOut(carry.k)}}:{}),
    secondary: { sway, jiggle, breathe: ev.breathe },
    spring,
  };
  return { frame, carryLift: carry?.k ?? 0, mark, lookW, lookScale };
}

/** Verbs calm enough to carry a talking layer. */
const CALM_VERBS = new Set<ActorClip["verb"]>(["idle", "look_at", "point_at", "wave", "sit", "hide", "peek", "sulk", "give", "take", "cook", "fish", "water_plants", "swing", "hug", "shrug"]);

/** Talking layer: head bobs on syllables, Masha's free hand gestures (additive, weight w). */
function talkPose(actor: ActorId, t: number, w: number): Record<string, [number, number, number, number]> {
  const bob = Math.sin(t * 9.0) * 0.5 + Math.sin(t * 5.3) * 0.5;
  const gest = Math.max(0, Math.sin(t * 2.1));
  const k = byPersona(actor, 1, 0.6, 0.8, 0.85);
  return {
    Head: qmul(qaxis([1, 0, 0], 0.05 * bob * w * k), qaxis([0, 0, 1], 0.06 * Math.sin(t * 1.7) * w * k)),
    Spine1: qaxis([0, 1, 0], 0.05 * Math.sin(t * 1.3) * w * k),
    LeftForeArm: qaxis([0, 1, 0], -0.5 * gest * w * k),
    LeftArm: qaxis([0, 0, 1], 0.15 * gest * w * k),
  };
}

/** Where Masha sits when riding on Bear's shoulders (root position). */
function shoulderSeat(bear: ActorFrame): Vec3 {
  return carrySeatRoot(bear);
}

/** Apply a look-at to an actor frame (head/neck bones + face.lookAt), faded by `weight`. */
function applyLook(frame: ActorFrame, actor: ActorId, target: Vec3 | null, weight: number): void {
  if (!target || weight <= 0) return;
  const style = STYLES[actor];
  // The stage lifts the complete rig after pose evaluation. Include that same
  // support here so a child on the helper looks down toward the work surface.
  const support = cookingSupportHeightAt(frame.pos[0], frame.pos[2]);
  const head: Vec3 = [frame.pos[0], frame.pos[1] + support + style.height * 0.82, frame.pos[2]];
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
  if(cue.from.location&&cue.to.location&&cue.from.location!==cue.to.location)
    return lt<(cue.cutAt??cue.start+cue.dur*.5)?cue.from:cue.to;
  const k = easeInOut(cue.dur > 0 ? (lt - cue.start) / cue.dur : 1);
  return {
    pos: [lerp(cue.from.pos[0], cue.to.pos[0], k), lerp(cue.from.pos[1], cue.to.pos[1], k), lerp(cue.from.pos[2], cue.to.pos[2], k)],
    look: [lerp(cue.from.look[0], cue.to.look[0], k), lerp(cue.from.look[1], cue.to.look[1], k), lerp(cue.from.look[2], cue.to.look[2], k)],
    fov: lerp(cue.from.fov, cue.to.fov, k),
    location:cue.from.location??cue.to.location,
    followActor:cue.from.followActor??cue.to.followActor,
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

interface EmotionCue {time:number;emotion:Emotion}
const emotionCueCache=new WeakMap<Segment,Partial<Record<ActorId,{signature:string;cues:EmotionCue[]}>>>();

/** Expression intent is evaluated independently of the body's enum-switching
 * crossfade. Cache only semantic inputs; edits to a saved segment invalidate it. */
function emotionCues(seg:Segment,actor:ActorId):EmotionCue[]{
 const clips=[...clipsOf(seg,actor)].sort((a,b)=>a.start-b.start);
 const signature=JSON.stringify([stOf(seg.startState,actor).posture,seg.duration,clips.map(c=>[c.start,c.dur,c.verb,c.emotion,c.params.posture])]);
 let cache=emotionCueCache.get(seg);if(!cache){cache={};emotionCueCache.set(seg,cache);}
 if(cache[actor]?.signature===signature)return cache[actor]!.cues;
 let posture=stOf(seg.startState,actor).posture;
 const states=clips.map(clip=>{const from=posture;posture=derivedPosture(clip,from);return {clip,from,posture};});
 const breaks=new Set([0]);
 for(const {clip,from} of states){breaks.add(clip.start);breaks.add(clip.start+clip.dur);if(clip.verb==='stand_up'&&from==='sleep')breaks.add(clip.start+clip.dur*.5);}
 const cues:EmotionCue[]=[];
 for(const time of [...breaks].sort((a,b)=>a-b)){
  if(time<0||time>=seg.duration)continue;
  let state:typeof states[number]|undefined;for(const s of states)if(s.clip.start<=time)state=s;
  const active=state&&time<state.clip.start+state.clip.dur,clip=active?state!.clip:null;
  const from=active?state!.from:state?.posture??stOf(seg.startState,actor).posture;
  const ctx:VerbCtx={actor,style:STYLES[actor],dur:clip?.dur??1,emotion:clip?.emotion??'neutral',t:time,dist:0,turned:0,speed:0,fromPosture:from,posture:state?.posture??from,targetLocal:null,seat:0};
  const emotion=evaluatePose(clip?.verb??'idle',clip?time-clip.start+1e-8:0,clip?.params??{},ctx).layer.face?.emotion??clip?.emotion??'neutral';
  if(!cues.length||cues[cues.length-1].emotion!==emotion)cues.push({time,emotion});
 }
 cache[actor]={signature,cues};return cues;
}

/** Replay only expression targets, never renderer state. This keeps a reaction
 * continuous through short beats, gaps, paragraph cuts and arbitrary seeks. */
function storyEmotion(timeline:Timeline,actor:ActorId,time:number):Pick<FaceParams,'emotion'|'emotionTransition'>{
 let target:Emotion='neutral',source:EmotionWeights={neutral:1},start=-Infinity;
 for(const {segment,offset} of timeline.segments){
  if(offset>time)break;
  for(const cue of emotionCues(segment,actor)){
   const at=offset+cue.time;if(at>time)break;
   if(cue.emotion===target)continue;
   source=emotionWeights({emotion:target,emotionTransition:{from:'neutral',fromWeights:source,progress:(at-start)/emotionBlendSeconds(target)}});
   target=cue.emotion;start=at;
  }
 }
 const progress=clamp01((time-start)/emotionBlendSeconds(target));
 if(progress>=1)return {emotion:target};
 const from=(Object.entries(source).sort((a,b)=>(b[1]??0)-(a[1]??0))[0]?.[0]??'neutral') as Emotion;
 return {emotion:target,emotionTransition:{from,fromWeights:source,progress}};
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
  const yawMemo = new Map<number, Record<ActorId, number>>([[segmentIndex, yaws]]);
  const yawsAt = (sIdx: number): Record<ActorId, number> => {
    let hit = yawMemo.get(sIdx);
    if (!hit) { hit = startYaws(segs, sIdx); yawMemo.set(sIdx, hit); }
    return hit;
  };
  const trackMemo = new Map<string, Resolved[]>();
  const trackFor = (sIdx: number, actor: ActorId): Resolved[] => {
    const key = `${sIdx}|${actor}`;
    let tr = trackMemo.get(key);
    if (!tr) {
      const s = segs[sIdx].segment;
      tr = resolveTrack(s, actor, actor === "masha" ? carryEvents(s) : [], yawsAt(sIdx)[actor]);
      trackMemo.set(key, tr);
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
  const heldBy = (a: ActorId): PropId | null => PROP_IDS.find((id) => at[id] === a) ?? null;

  const startOf = (a: ActorId) => ({ ...stOf(seg.startState, a), facing: yaws[a] });
  const bear = evalActor("bear", { seg, lt, t, track: tracks.bear, stateAtStart: startOf("bear"), prevLast: lt < CROSSFADE_S ? prevLast("bear") : null }, null, null, heldBy("bear"), segs, segmentIndex, trackFor);
  const carry = carryState(seg, lt, tracks.masha);
  const masha = evalActor("masha", { seg, lt, t, track: tracks.masha, stateAtStart: startOf("masha"), prevLast: lt < CROSSFADE_S ? prevLast("masha") : null }, bear.frame, carry, heldBy("masha"), segs, segmentIndex, trackFor);
  const guest = (a: ActorId) => evalActor(a, { seg, lt, t, track: segs.length ? trackFor(segmentIndex, a) : [], stateAtStart: startOf(a), prevLast: lt < CROSSFADE_S ? prevLast(a) : null }, null, null, heldBy(a), segs, segmentIndex, trackFor);
  const evals = Object.fromEntries(ACTOR_IDS.map(a => [a, a === "masha" ? masha : a === "bear" ? bear : guest(a)])) as Record<ActorId, ActorEval>;
  const actors = Object.fromEntries(ACTOR_IDS.map(a => [a, evals[a].frame])) as Record<ActorId, ActorFrame>;
  if(segs.length)for(const actor of ACTOR_IDS)Object.assign(actors[actor].face,storyEmotion(timeline,actor,t));

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
    const otherHead: Vec3 = [o.pos[0], o.pos[1] + cookingSupportHeightAt(o.pos[0],o.pos[2]) + STYLES[other].height * 0.8, o.pos[2]];
    const explicit = f.face.lookAt;
    const ev = evals[a];
    const ew = explicit ? ev.lookW : 0;
    const sw = speaker && o.opacity > 0.5 && (speaker.actor === other || speaker.actor === a) ? speaker.w * (1 - ew) : 0;
    // speaker attention first, explicit target on top: weights fade, so heads turn rather than snap
    f.face = { ...f.face, lookAt: null };
    // Once seated, neither performer twists their head through the other's
    // face to satisfy the generic conversation gaze. They look along the ride.
    const rideGaze=(a==='bear'||a==='masha')&&carry?1-smooth((carry.k-.4)/.4):1;
    if (sw > 0) applyLook(f, a, otherHead, sw * ev.lookScale * rideGaze);
    if (explicit && ew > 0) applyLook(f, a, explicit, ew * ev.lookScale * rideGaze);
  }

  // props frame
  for(const actor of ACTOR_IDS)actors[actor].holding=heldBy(actor)??actors[actor].holding;
  const props = propsFrame(at, flights, actors, ltc);

  return {
    t,
    segmentIndex,
    objects:{house_door:doorOpenAt(seg,ltc),kitchen_cupboard:objectOpenAt(seg,ltc,'kitchen_cupboard')},
    localT: segs.length === 0 ? t : ltc,
    actors,
    ...(segs.length?{cast:seg.cast??ACTOR_IDS.filter(a=>segs.slice(0,segmentIndex+1).some(s=>clipsOf(s.segment,a).some(c=>!c.params.ambient)))}:{}),
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
