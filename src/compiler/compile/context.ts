import { MARKS, OBSTACLES, SEAT_HEIGHT, isInteriorMark } from "../../shared/bible/set";
import { carryLiftHeadHeight } from "../../shared/carrySupport";
import { cookingSupportHeightAt } from "../../shared/cookingStation";
import { clamp01, lerp, smooth } from "../../shared/math";
import { armchairMountMotion, hammockTiming, hammockTravelProgress } from "../../shared/physicalInteractions";
import { propPlacementAtMark } from "../../shared/propPlacement";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import {
  ACTOR_IDS,
  type ActorClip,
  type ActorId,
  type Beat,
  type BeatScript,
  type CameraCue,
  type Emotion,
  type FxCue,
  type FxId,
  type Lang,
  type MarkId,
  type Posture,
  type PropId,
  type Segment,
  type SfxId,
  type Vec2,
  type Vec3,
  type Verb,
  type WorldState,
} from "../../shared/schema";
import type { AudioBeatEvent } from "../audioCues";
import { HEAD_HEIGHT, type CameraBeatInfo } from "../camera";
import { makeDialogueCue } from "../dialogue";
import { pathLength, pointAlong } from "../path";
import type { CompileOptions } from "../types";
import { isActor, isMark, isProp } from "../validate";
import { cloneWorldState } from "../worldState";

export const SEGMENT_TAIL = 0.6;
/** Cartoon time: one locomotion clip never lasts longer than this (long trips speed up instead). */
export const MAX_LOCO_S = 6;
export const ACTORS: ActorId[] = [...ACTOR_IDS];
/** Sideways nudge per actor so characters arriving at the same spot don't overlap. */
export const SPREAD_OFFSET: Record<ActorId, Vec2> = {
  masha: [1.0, 0.2],
  bear: [-1.0, 0.2],
  wolf_a: [0.7, 0.8],
  wolf_b: [-0.7, -0.8],
  lady_bear: [-2.2, 0],
  hare: [1.5, -1.2],
  rosie: [2, 1],
  squirrel: [2, -2],
  rival_bear: [-2.2, 2],
};
/** Where each actor stands after entering from the forest path (offset from the clearing). */
export const ENTER_OFFSET: Record<ActorId, Vec2> = {
  masha: [0.8, 1.5],
  bear: [-0.8, 1.5],
  wolf_a: [1.8, 2.4],
  wolf_b: [2.6, 1.6],
  lady_bear: [-2.5, 1],
  hare: [1.5, -0.6],
  rosie: [3.4, 2.2],
  squirrel: [2.5, -0.8],
  rival_bear: [-3, 3.4],
};

/** Verbs a character can do while sitting / carried / asleep without changing posture first. */
export const SIT_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "facepalm", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "sit", "sleep", "fish", "give"]);
export const CARRIED_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "scared"]);
export const SLEEP_OK = new Set<Verb>(["sleep", "wake_up", "idle", "surprised", "scared", "fall_down", "yawn_stretch"]);
/** Bear verbs that end a shoulder ride. */
export const ENDS_CARRY = new Set<Verb>(["sit", "sleep", "exit", "fall_down", "hide", "jump", "spin", "dance", "hug", "cook", "fish", "water_plants", "angry_stomp", "chase", "run_to"]);
export const CONSUMABLE = new Set<PropId>(["pancakes", "fish", "carrot", "cake", "lollipop"]);
export const LOUD_VERBS = new Set<Verb>(["fall_down", "sneeze", "laugh", "angry_stomp", "jump"]);
/** Bear sounds that send the (cowardly) Wolves cowering. */
export const BEAR_SCARY_EMOTES = new Set<string>(["roar_soft", "growl_soft", "huff", "grunt"]);
export const LOUD_SFX = new Set<SfxId>(["crash", "door_slam", "thunder_clap", "pot_clang", "boing", "van_horn"]);

export const r3 = (n: number): number => Math.round(n * 1000) / 1000;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const v2 = (p: readonly number[]): Vec2 => [p[0], p[1]];

export interface ActorSnapshot {
  t: number;
  pos: Vec2;
  facing: number;
  posture: Posture;
  holding: PropId | null;
  mark: MarkId | null;
}

export interface ActorTrack {
  clips: ActorClip[];
  free: number;
  /** snapshots after each clip: posture/holding/facing timeline for ambient fill */
  states: ActorSnapshot[];
}

export interface BeatTiming {
  start: number;
  end: number;
  mainStart: number;
  mainDur: number;
  actor: ActorId;
  verb: Verb;
  from: Vec2;
  to: Vec2;
  hasLine: boolean;
  lineStart: number;
  lineDur: number;
  loud: boolean;
  /** a Bear beat that makes the Wolves cower (loud, angry, a roar/growl/huff) */
  scary: boolean;
  /** auto-walk inside the beat (camera treats it as its own locomotion) */
  walk: { start: number; dur: number; verb: Verb; from: Vec2; to: Vec2 } | null;
}

export interface CompileContext {
  startState: WorldState;
  ws: WorldState;
  tracks: Record<ActorId, ActorTrack>;
  compiledBeats: Beat[];
  timings: BeatTiming[];
  preparationCameras: CameraBeatInfo[];
  objectCues: NonNullable<Segment["objectCues"]>;
  cupboardFree: number;
  lastCupboardShot: CameraCue | undefined;
  doorShots: CameraCue[];
  doorFree: number;
  events: AudioBeatEvent[];
  dialogue: ReturnType<typeof makeDialogueCue>[];
  fx: FxCue[];
  extraSfx: { t: number; id: SfxId; pos: Vec2 }[];
  flourUsed: boolean;
  repairs: string[];
  errors: string[];
  cast: ActorId[];
  lang: Lang;
  opts: CompileOptions;
}

/** Captures a point-in-time actor snapshot for ambient timeline lookup. */
export function snap(w: WorldState, a: ActorId, t: number): ActorSnapshot {
  const s = w.actors[a];
  return { t, pos: v2(s.pos), facing: s.facing, posture: s.posture, holding: s.holding, mark: s.mark };
}

/** Creates a fresh compilation context with typed per-actor tracks. */
export function createCompileContext(
  startState: WorldState,
  bs0: BeatScript,
  opts: CompileOptions,
  validatorErrors: string[],
): CompileContext {
  const ws = cloneWorldState(startState);
  const partialTracks: Partial<Record<ActorId, ActorTrack>> = {};
  for (const a of ACTORS) {
    partialTracks[a] = { clips: [], free: 0, states: [snap(ws, a, 0)] };
  }
  return {
    startState,
    ws,
    tracks: partialTracks as Record<ActorId, ActorTrack>,
    compiledBeats: [],
    timings: [],
    preparationCameras: [],
    objectCues: [],
    cupboardFree: 0,
    lastCupboardShot: undefined,
    doorShots: [],
    doorFree: 0,
    events: [],
    dialogue: [],
    fx: [],
    extraSfx: [],
    flourUsed: false,
    repairs: validatorErrors.map((e) => `validator: ${e}`),
    errors: [],
    cast: opts.cast ?? ACTORS.filter((a) => bs0.beats.some((b) => b.actor === a || b.target === a)),
    lang: opts.lang,
    opts,
  };
}

/** Appends an actor clip and updates track free time. */
export function pushClip(
  ctx: CompileContext,
  a: ActorId,
  start: number,
  dur: number,
  verb: Verb,
  emotion: Emotion,
  params: ActorClip["params"],
): ActorClip {
  const c: ActorClip = { start, dur: Math.max(0.05, dur), verb, emotion, params };
  ctx.tracks[a].clips.push(c);
  ctx.tracks[a].free = Math.max(ctx.tracks[a].free, start + c.dur);
  return c;
}

/** Records the actor's current world-state snapshot at time t. */
export function record(ctx: CompileContext, a: ActorId, t: number): void {
  ctx.tracks[a].states.push(snap(ctx.ws, a, t));
}

/** Looks up the latest recorded snapshot at or before time t. */
export function stateAt(ctx: CompileContext, a: ActorId, t: number): ActorSnapshot {
  const st = ctx.tracks[a].states;
  let s = st[0];
  for (const x of st) if (x.t <= t + 1e-9) s = x;
  return s;
}

/** Returns the actor's posture at time t. */
export function postureAt(ctx: CompileContext, a: ActorId, t: number): Posture {
  return stateAt(ctx, a, t).posture;
}

/** Ground position of an actor at time t, from its clips so far (carried → Bear's position). */
export function posAt(ctx: CompileContext, a: ActorId, t: number): Vec2 {
  if (a === "masha" && postureAt(ctx, "masha", t) === "carried") return posAt(ctx, "bear", t);
  const clips = ctx.tracks[a].clips;
  let p: Vec2 = v2(ctx.startState.actors[a].pos);
  for (const c of clips) {
    if (c.start > t) break;
    if (t < c.start + c.dur && c.params.path && c.params.path.length > 1) {
      const progress = (t - c.start) / Math.max(1e-6, c.dur);
      const k =
        c.verb === "sit" && c.params.target === "house_living" && c.params.to
          ? armchairMountMotion(a === "masha", progress).travel
          : c.params.target === "hammock" && c.params.to && !LOCOMOTION_VERBS.includes(c.verb)
            ? hammockTravelProgress(c.verb === "sleep", progress, c.dur)
            : progress;
      return c.params.sceneCut
        ? v2(k < 0.5 ? c.params.path[0] : c.params.path[c.params.path.length - 1])
        : pointAlong(c.params.path, k * pathLength(c.params.path));
    }
    p = c.params.to ?? c.params.from ?? p;
  }
  return p;
}

/** Computes world head position [x, y, z] for camera and look-at targets at time t. */
export function headAt(ctx: CompileContext, a: ActorId, t: number): Vec3 {
  const p = posAt(ctx, a, t);
  const st = stateAt(ctx, a, t);
  const seat = st.mark && dist(p, MARKS[st.mark].pos) < 1 ? (SEAT_HEIGHT[st.mark] ?? 0) : 0;
  let h =
    postureAt(ctx, a, t) === "carried"
      ? 2.32
      : postureAt(ctx, a, t) === "sleep"
        ? 0.6 + seat
        : postureAt(ctx, a, t) === "sit"
          ? HEAD_HEIGHT[a] * 0.65 + seat
          : HEAD_HEIGHT[a];
  if (a === "bear" && st.posture === "sleep" && st.mark === "hammock") h = 1.15;
  const active = ctx.tracks[a].clips.find((c) => t >= c.start && t < c.start + c.dur);
  if (active?.verb === "sit" && active.params.target === "house_living" && active.params.to) {
    const motion = armchairMountMotion(a === "masha", (t - active.start) / active.dur);
    h = lerp(HEAD_HEIGHT[a], HEAD_HEIGHT[a] * 0.65 + SEAT_HEIGHT.house_living, motion.pose) + motion.lift - 0.045 * motion.crouch;
  }
  if (active?.params.target === "hammock" && active.params.to && (active.verb === "sleep" || ["sleep", "sit"].includes(postureAt(ctx, a, active.start)))) {
    const time = t - active.start;
    const mount = active.verb === "sleep";
    const { launch, land, settled } = hammockTiming(mount, active.dur);
    const flight = clamp01((time - launch) / (land - launch));
    const standing = HEAD_HEIGHT[a];
    const seated = a === "bear" ? 2.35 : standing * 0.65 + SEAT_HEIGHT.hammock;
    const lying = a === "bear" ? 1.15 : 0.6 + SEAT_HEIGHT.hammock;
    const crouched = standing - 0.2;
    if (mount) {
      if (time < launch) h = lerp(standing, crouched, smooth(time / launch));
      else if (time < land) h = lerp(crouched, seated, flight) + 4 * 0.47 * flight * (1 - flight);
      else h = lerp(seated, lying, smooth((time - settled) / Math.min(1.05, Math.max(0.2, active.dur - settled))));
    } else {
      if (time < launch) h = lerp(postureAt(ctx, a, active.start) === "sleep" ? lying : seated, seated, smooth(time / Math.min(0.38, launch * 0.46)));
      else if (time < land) h = lerp(seated, crouched, flight) + 4 * 0.25 * flight * (1 - flight);
      else h = lerp(crouched, standing, smooth((time - land) / Math.max(0.001, settled - land)));
    }
  }
  if (a === "masha") {
    const lift = ctx.tracks.bear.clips.find((c) => c.verb === "carry" && c.start <= t && t < c.start + c.dur);
    if (lift) h = carryLiftHeadHeight(t - lift.start, lift.dur);
  }
  const hug = active?.verb === "hug" ? active : null;
  if (hug && postureAt(ctx, a, t) === "stand" && isActor(hug.params.target) && HEAD_HEIGHT[a] > HEAD_HEIGHT[hug.params.target] * 1.4) {
    // Calibrated against the shipped rig's crouched hug (Bear Head Y≈1.41).
    // Keep the camera with the embrace instead of aiming at the empty space
    // above a kneeling adult. Match the pose's approach/release envelope.
    const u = (t - hug.start) / hug.dur;
    const k = Math.min(smooth(u / 0.22), smooth((1 - u) / 0.22));
    h -= 0.6 * (HEAD_HEIGHT[a] / HEAD_HEIGHT.bear) * k;
  }
  return [r3(p[0]), r3(h + cookingSupportHeightAt(p[0], p[1])), r3(p[1])];
}

/** World point for a target id (mark / actor / prop). */
export function targetPoint(ctx: CompileContext, id: string | null, t: number): Vec3 | null {
  if (id == null) return null;
  if (isActor(id)) return headAt(ctx, id, t);
  if (isMark(id)) {
    const p = MARKS[id].pos;
    return [p[0], 0.5, p[1]];
  }
  if (isProp(id)) {
    const at = ctx.ws.props[id]?.at;
    if (at && isActor(at)) {
      const p = posAt(ctx, at, t);
      return [r3(p[0]), 0.8, r3(p[1])];
    }
    if (at && isMark(at)) return propPlacementAtMark(id, at).pos;
  }
  return null;
}

/** Adds an FX cue with rounded timestamps and coordinates. */
export function addFx(ctx: CompileContext, id: FxId, start: number, dur: number, at: Vec3): void {
  ctx.fx.push({ start: r3(start), dur: r3(dur), id, at: [r3(at[0]), r3(at[1]), r3(at[2])] });
}

/** Drops an actor's currently held prop onto its nearest mark. */
export function dropHeld(ctx: CompileContext, a: ActorId): void {
  const st = ctx.ws.actors[a];
  if (!st.holding) return;
  ctx.ws.props[st.holding] = { at: st.mark ?? nearestMark(st.pos) };
  st.holding = null;
}

/** Transfers a prop into an actor's hands, clearing any prior holder. */
export function giveTo(ctx: CompileContext, a: ActorId, item: PropId): void {
  if (ctx.ws.actors[a].holding && ctx.ws.actors[a].holding !== item) dropHeld(ctx, a);
  // Implied tools (for example Masha taking over Bear's frying pan) must
  // transfer the holder as well as the prop. Otherwise the former holder
  // resurrects it when a following paragraph rebuilds ownership.
  for (const other of ACTORS) if (other !== a && ctx.ws.actors[other].holding === item) ctx.ws.actors[other].holding = null;
  ctx.ws.actors[a].holding = item;
  ctx.ws.props[item] = { at: a };
}

/** Standing position at a mark: marks inside an obstacle footprint stand just outside it, opposite the facing hint
 *  (behind the table facing the camera, behind the tree/bush when hiding, on the shore side of the pond). */
export function standPos(mark: MarkId): Vec2 {
  const m = MARKS[mark];
  if (mark === "door" || mark === "pier" || isInteriorMark(mark)) return v2(m.pos);
  if (mark === "pond_shore") {
    const c = OBSTACLES.circles.find((o) => o.id === "pond")!;
    const d = [m.pos[0] - c.c[0], m.pos[1] - c.c[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    return [r3(c.c[0] + (d[0] / l) * (c.r + 0.35)), r3(c.c[1] + (d[1] / l) * (c.r + 0.35))];
  }
  const f: Vec2 = [Math.sin(m.facing), Math.cos(m.facing)];
  for (const c of OBSTACLES.circles) {
    if (c.id === "pond") continue;
    if (Math.hypot(m.pos[0] - c.c[0], m.pos[1] - c.c[1]) < c.r + 0.2) return [r3(c.c[0] - f[0] * (c.r + 0.35)), r3(c.c[1] - f[1] * (c.r + 0.35))];
  }
  for (const b of OBSTACLES.boxes) {
    const inside = (p: Vec2) => p[0] > b.min[0] - 0.3 && p[0] < b.max[0] + 0.3 && p[1] > b.min[1] - 0.3 && p[1] < b.max[1] + 0.3;
    let p: Vec2 = v2(m.pos);
    for (let k = 0; k < 60 && inside(p); k++) p = [p[0] - f[0] * 0.2, p[1] - f[1] * 0.2];
    if (dist(p, m.pos) > 0) return [r3(p[0]), r3(p[1])];
  }
  return v2(m.pos);
}

/** Finds the closest semantic mark (excluding transitional door/path_entry marks). */
export function nearestMark(p: Vec2): MarkId {
  let best: MarkId = "clearing";
  let bd = Infinity;
  for (const m of Object.values(MARKS)) {
    if (m.id === "door" || m.id === "path_entry") continue;
    const d = dist(p, m.pos);
    if (d < bd) {
      bd = d;
      best = m.id;
    }
  }
  return best;
}

/** Returns the nearest mark if within radius r of either its stand position or mark center. */
export function nearestMarkWithin(p: Vec2, r: number): MarkId | null {
  const m = nearestMark(p);
  return dist(p, standPos(m)) <= r || dist(p, MARKS[m].pos) <= r ? m : null;
}
