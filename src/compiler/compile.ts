// Deterministic BeatScript → Segment compiler (spec §6.3–§6.5, §7.5, §7.6). Pure: same input → identical output.
//
// Timing: a beat anchors to the previous beat's START (with_previous) or END, plus delay_s; each character has its own
// track and its beats never overlap (they queue). Durations come from the grammar (baseDuration) or path length /
// speed; a beat with a line lasts at least as long as the line. Object verbs walk to where they happen first
// (VERB_HOME_MARK, the prop, the other character). Trivial repairs (insert `take`/`enter`) are written into the
// compiled BeatScript and listed in `repairs`. Characters without a beat are filled with ambient life (idle clips that
// look at the action, small reactions to loud beats) so every track covers [0, duration] contiguously.
import { CHARACTERS } from "../shared/bible/characters";
import { PROPS } from "../shared/bible/props";
import { FISHING_WATER_TARGET, isInsideHouse, isInteriorMark, MARKS, OBSTACLES, sceneLocationAt, SEAT_HEIGHT } from "../shared/bible/set";
import { GRAMMAR, LOCOMOTION_VERBS, SPEEDS, VERB_HOME_MARK, VERB_IMPLIED_PROP, isWolf } from "../shared/grammar";
import { ACTOR_IDS } from "../shared/schema";
import type {
  ActorClip, ActorId, Beat, BeatScript, Emotion, FxCue, FxId, LightingCue, MarkId, Posture, PropId, SfxId,
  Vec2, Vec3, Verb, WorldState,
} from "../shared/schema";
import { buildAudioCues, type AudioBeatEvent } from "./audioCues";
import { HEAD_HEIGHT, planCamera, type CameraBeatInfo } from "./camera";
import { dialogueDuration, isShouted, makeDialogueCue } from "./dialogue";
import { clampWalkable, pathEndYaw, pathLength, planPath, pointAlong, yawTo } from "./path";
import type { CompileFn, CompileOptions, CompileResult } from "./types";
import { isActor, isMark, isProp, otherActor, validateBeatScript } from "./validate";
import { cloneWorldState, withAllActors } from "./worldState";

export const SEGMENT_TAIL = 0.6;
/** Cartoon time: one locomotion clip never lasts longer than this (long trips speed up instead). */
export const MAX_LOCO_S = 6;
const ACTORS: ActorId[] = [...ACTOR_IDS];
/** Sideways nudge per actor so characters arriving at the same spot don't overlap. */
const SPREAD_OFFSET: Record<ActorId, Vec2> = { masha: [1.0, 0.2], bear: [-1.0, 0.2], wolf_a: [0.7, 0.8], wolf_b: [-0.7, -0.8], lady_bear: [-2.2, 0], hare: [1.5, -1.2], rosie: [2, 1], squirrel: [2, -2], rival_bear: [-2.2, 2] };
/** Where each actor stands after entering from the forest path (offset from the clearing). */
const ENTER_OFFSET: Record<ActorId, Vec2> = { masha: [0.8, 1.5], bear: [-0.8, 1.5], wolf_a: [1.8, 2.4], wolf_b: [2.6, 1.6], lady_bear: [-2.5, 1], hare: [1.5, -.6], rosie: [3.4, 2.2], squirrel: [2.5, -.8], rival_bear: [-3, 3.4] };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const v2 = (p: readonly number[]): Vec2 => [p[0], p[1]];

/** Verbs a character can do while sitting / carried / asleep without changing posture first. */
const SIT_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "facepalm", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "sit", "sleep", "fish", "give"]);
const CARRIED_OK = new Set<Verb>(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "scared"]);
const SLEEP_OK = new Set<Verb>(["sleep", "wake_up", "idle", "surprised", "scared", "fall_down", "yawn_stretch"]);
/** Bear verbs that end a shoulder ride. */
const ENDS_CARRY = new Set<Verb>(["sit", "sleep", "exit", "fall_down", "hide", "jump", "spin", "dance", "hug", "cook", "fish", "water_plants", "angry_stomp", "chase", "run_to"]);
const CONSUMABLE = new Set<PropId>(["pancakes", "fish", "carrot", "cake", "lollipop"]);
const LOUD_VERBS = new Set<Verb>(["fall_down", "sneeze", "laugh", "angry_stomp", "jump"]);
/** Bear sounds that send the (cowardly) Wolves cowering. */
const BEAR_SCARY_EMOTES = new Set<string>(["roar_soft", "growl_soft", "huff", "grunt"]);
const LOUD_SFX = new Set<SfxId>(["crash", "door_slam", "thunder_clap", "pot_clang", "boing", "van_horn"]);

interface ActorTrack {
  clips: ActorClip[];
  free: number;
  /** snapshots after each clip: posture/holding/facing timeline for ambient fill */
  states: { t: number; pos: Vec2; facing: number; posture: Posture; holding: PropId | null; mark:MarkId|null }[];
}

interface BeatTiming {
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

/** Standing position at a mark: marks inside an obstacle footprint stand just outside it, opposite the facing hint
 *  (behind the table facing the camera, behind the tree/bush when hiding, on the shore side of the pond). */
export function standPos(mark: MarkId): Vec2 {
  const m = MARKS[mark];
  if (mark === "pier" || isInteriorMark(mark)) return v2(m.pos);
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

export const compile: CompileFn = (inputBs, startState, opts) => compileImpl(inputBs, startState, opts);
export const compileParagraph = compile;

function compileImpl(inputBs: BeatScript, startState0: WorldState, opts: CompileOptions): CompileResult {
  // world states saved before the Wolves joined get them back at their start spot by the van
  const startState = withAllActors(cloneWorldState(startState0));
  const v = validateBeatScript(inputBs, startState, opts.lang);
  const bs0 = v.beatScript;
  const cast=opts.cast??ACTORS.filter(a=>bs0.beats.some(b=>b.actor===a||b.target===a));
  const repairs: string[] = v.errors.map((e) => `validator: ${e}`);
  const errors: string[] = [];
  const ws = cloneWorldState(startState);
  const tracks = Object.fromEntries(ACTORS.map((a) => [a, { clips: [], free: 0, states: [snap(ws, a, 0)] }])) as unknown as Record<ActorId, ActorTrack>;
  const compiledBeats: Beat[] = [];
  const timings: BeatTiming[] = [];
  const events: AudioBeatEvent[] = [];
  const dialogue: ReturnType<typeof makeDialogueCue>[] = [];
  const fx: FxCue[] = [];
  const extraSfx: { t: number; id: SfxId; pos: Vec2 }[] = [];
  const lastBeatIdx = Object.fromEntries(ACTORS.map((a) => [a, -1])) as Record<ActorId, number>;
  bs0.beats.forEach((b, i) => { lastBeatIdx[b.actor] = i; });
  let flourUsed = false;

  // ---------- helpers ----------
  function snap(w: WorldState, a: ActorId, t: number) {
    const s = w.actors[a];
    return { t, pos: v2(s.pos), facing: s.facing, posture: s.posture, holding: s.holding,mark:s.mark };
  }
  function record(a: ActorId, t: number) {
    tracks[a].states.push(snap(ws, a, t));
  }
  /** Ground position of an actor at time t, from its clips so far (carried → Bear's position). */
  function posAt(a: ActorId, t: number): Vec2 {
    if (a === "masha" && postureAt("masha", t) === "carried") return posAt("bear", t);
    const clips = tracks[a].clips;
    let p: Vec2 = v2(startState.actors[a].pos);
    for (const c of clips) {
      if (c.start > t) break;
      if (t < c.start + c.dur && c.params.path && c.params.path.length > 1) {
        const k = (t - c.start) / Math.max(1e-6, c.dur);
        return c.params.sceneCut ? v2(k<.5?c.params.path[0]:c.params.path[c.params.path.length-1]) : pointAlong(c.params.path, k * pathLength(c.params.path));
      }
      p = c.params.to ?? c.params.from ?? p;
    }
    return p;
  }
  function stateAt(a: ActorId, t: number) {
    const st = tracks[a].states;
    let s = st[0];
    for (const x of st) if (x.t <= t + 1e-9) s = x;
    return s;
  }
  function postureAt(a: ActorId, t: number): Posture {
    return stateAt(a, t).posture;
  }
  function addClip(a: ActorId, start: number, dur: number, verb: Verb, emotion: Emotion, params: ActorClip["params"]): ActorClip {
    const c: ActorClip = { start, dur: Math.max(0.05, dur), verb, emotion, params };
    tracks[a].clips.push(c);
    tracks[a].free = Math.max(tracks[a].free, start + c.dur);
    return c;
  }
  function headAt(a: ActorId, t: number): Vec3 {
    const p = posAt(a, t);
    const st=stateAt(a,t),seat=st.mark&&dist(p,MARKS[st.mark].pos)<1?(SEAT_HEIGHT[st.mark]??0):0;
    const h = postureAt(a, t) === "carried" ? HEAD_HEIGHT.bear + 0.4 : postureAt(a, t) === "sleep" ? 0.6+seat : postureAt(a, t) === "sit" ? HEAD_HEIGHT[a] * 0.65+seat : HEAD_HEIGHT[a];
    return [r3(p[0]), r3(h), r3(p[1])];
  }
  /** World point for a target id (mark / actor / prop). */
  function targetPoint(id: string | null, t: number): Vec3 | null {
    if (id == null) return null;
    if (isActor(id)) return headAt(id, t);
    if (isMark(id)) { const p = MARKS[id].pos; return [p[0], 0.5, p[1]]; }
    if (isProp(id)) {
      const at = ws.props[id]?.at;
      if (at && isActor(at)) { const p = posAt(at, t); return [r3(p[0]), 0.8, r3(p[1])]; }
      if (at && isMark(at)) { const p = MARKS[at].pos; return [p[0], 0.8, p[1]]; }
    }
    return null;
  }
  /** Where to stand to reach a target. */
  function approachPoint(a: ActorId, id: string, t: number, gap = 0.9): Vec2 | null {
    if (isMark(id)) return spread(a, standPos(id), t);
    if (isActor(id)) {
      const o = posAt(id, t);
      const me = posAt(a, t);
      let d: Vec2 = [me[0] - o[0], me[1] - o[1]];
      const l = Math.hypot(d[0], d[1]);
      d = l < 1e-3 ? [1, 0] : [d[0] / l, d[1] / l];
      return clampWalkable([o[0] + d[0] * gap, o[1] + d[1] * gap]);
    }
    if (isProp(id)) {
      const at = ws.props[id]?.at;
      if (at && isMark(at)) return spread(a, standPos(at), t);
      if (at && isActor(at) && at !== a) return approachPoint(a, at, t, gap);
    }
    return null;
  }
  /** Avoid standing on top of another character (partner first, then everyone else). */
  function spread(a: ActorId, p: Vec2, t: number): Vec2 {
    const o0 = otherActor(a);
    const others = [o0, ...ACTORS.filter((x) => x !== a && x !== o0)];
    let q = p;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const o of others) {
        if (ws.actors[o].posture === "offstage" || ws.actors[o].posture === "carried") continue;
        const op = posAt(o, Math.max(t, tracks[o].free));
        if (dist(op, q) < 0.8) {
          const off = SPREAD_OFFSET[a];
          q = clampWalkable([q[0] + off[0], q[1] + off[1]]);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return q;
  }
  function speed(a: ActorId, verb: Verb): number {
    const s = SPEEDS[a] as Record<string, number>;
    return s[verb] ?? s.walk_to;
  }
  /** Add a locomotion clip along a planned path; returns its end time. Updates world state. */
  function locomote(a: ActorId, t: number, verb: Verb, dest: Vec2, emotion: Emotion, target: string | null, finalFacing?: number, path0?: Vec2[]): number {
    const st = ws.actors[a];
    const from = v2(st.pos);
    const path = path0 ?? planPath(from, dest);
    const len = pathLength(path);
    const fromScene=sceneLocationAt(...from),toScene=sceneLocationAt(...dest);
    const sceneCut=fromScene!==toScene&&(!['yard','house'].includes(fromScene)||!['yard','house'].includes(toScene));
    const dur = sceneCut ? .9 : len < 0.3 ? 0.6 : Math.min(MAX_LOCO_S, Math.max(len / speed(a, verb), 0.8));
    const yaw = pathEndYaw(path, st.facing);
    addClip(a, t, dur, verb, emotion, {
      from, to: v2(path[path.length - 1]), path: path.map((p) => [r3(p[0]), r3(p[1])] as Vec2),
      facing: r3(yawTo(from, path[1] ?? dest, st.facing)), posture: "stand", item: st.holding ?? undefined, target: target ?? undefined,
      ...(sceneCut?{sceneCut:true}:{}),
    });
    st.pos = v2(path[path.length - 1]);
    st.facing = r3(finalFacing ?? yaw);
    st.mark = isMark(target) && dist(st.pos, dest) < 0.01 ? target : nearestMarkWithin(st.pos, 1.5);
    record(a, t + dur);
    // a carried Masha rides along
    if (a === "bear" && ws.actors.masha.posture === "carried") {
      ws.actors.masha.pos = v2(st.pos);
      ws.actors.masha.facing = st.facing;
      ws.actors.masha.mark = st.mark;
      record("masha", t + dur);
    }
    return t + dur;
  }
  function dismount(t: number): number {
    const m = ws.actors.masha;
    const b = ws.actors.bear;
    const start = Math.max(t, tracks.masha.free);
    const side: Vec2 = [Math.cos(b.facing), -Math.sin(b.facing)];
    const to = clampWalkable([b.pos[0] + side[0] * 0.9, b.pos[1] + side[1] * 0.9]);
    addClip("masha", start, 0.8, "jump", "happy", { from: v2(b.pos), to, path: [v2(b.pos), to], facing: b.facing, posture: "stand", item: m.holding ?? undefined, target: "bear" });
    m.posture = "stand";
    m.pos = to;
    m.facing = b.facing;
    m.mark = nearestMarkWithin(to, 1.5);
    record("masha", start + 0.8);
    repairs.push("Masha hops down from Bear's shoulders");
    return start + 0.8;
  }
  function dropHeld(a: ActorId) {
    const st = ws.actors[a];
    if (!st.holding) return;
    ws.props[st.holding] = { at: st.mark ?? nearestMark(st.pos) };
    st.holding = null;
  }
  function giveTo(a: ActorId, item: PropId) {
    if (ws.actors[a].holding && ws.actors[a].holding !== item) dropHeld(a);
    ws.actors[a].holding = item;
    ws.props[item] = { at: a };
  }
  function addFx(id: FxId, start: number, dur: number, at: Vec3) {
    fx.push({ start: r3(start), dur: r3(dur), id, at: [r3(at[0]), r3(at[1]), r3(at[2])] });
  }

  // ---------- beats ----------
  const queue: { beat: Beat; orig: number }[] = bs0.beats.map((b, i) => ({ beat: { ...b }, orig: i }));
  let idx = 0;
  let prevTiming: BeatTiming | null = null;
  while (idx < queue.length) {
    const { beat: b, orig } = queue[idx];
    const a = b.actor;
    const o = otherActor(a);
    const st = ws.actors[a];
    const origIndex = idx;
    idx++;

    // --- trivial repairs that insert beats ---
    if (st.posture === "offstage" && b.verb !== "enter") {
      if (b.verb === "exit") { repairs.push(`${a} is already offstage: exit skipped`); continue; }
      const enter: Beat = { ...b, verb: "enter", target: null, item: null, line: null, emote: null, sfx: null, shot: "auto" };
      queue.splice(origIndex, 0, { beat: enter, orig: -1 });
      b.with_previous = false; b.delay_s = 0;
      idx = origIndex;
      repairs.push(`inserted enter: ${a} comes back before "${b.verb}"`);
      continue;
    }
    if ((b.verb === "eat" || b.verb === "give" || b.verb === "throw") && b.item && st.holding !== b.item) {
      const at = ws.props[b.item]?.at;
      if (isActor(at) && at !== a) {
        errors.push(`${a} can't ${b.verb} the ${b.item}: ${at} is holding it`);
        b.verb = "point_at"; b.target = at; b.item = null;
      } else {
        const take: Beat = { ...b, verb: "take", target: b.item, item: b.item, line: null, emote: null, sfx: null, shot: "auto" };
        queue.splice(origIndex, 0, { beat: take, orig: -1 });
        b.with_previous = false; b.delay_s = 0;
        idx = origIndex;
        repairs.push(`inserted take: ${a} picks up the ${b.item} before "${b.verb}"`);
        continue;
      }
    }
    const heldBy = b.verb === "take" && b.item ? ws.props[b.item]?.at : undefined;
    if (b.verb === "take" && b.item && isActor(heldBy) && heldBy !== a) {
      errors.push(`${a} can't take the ${b.item}: ${heldBy} is holding it`);
      b.verb = "point_at"; b.target = heldBy; b.item = null;
    }

    compiledBeats.push(b);
    const def = GRAMMAR[b.verb];
    const anchor = prevTiming ? (b.with_previous ? prevTiming.start : prevTiming.end) : 0;
    let t = Math.max(anchor + b.delay_s, tracks[a].free);
    const interacts = (b.verb === "hug" || b.verb === "carry" || b.verb === "give") && isActor(b.target);
    if (interacts && isActor(b.target)) t = Math.max(t, tracks[b.target].free);
    const beatStart = t;
    const fromPos = posAt(a, t);

    // --- posture transitions (pre-clips) ---
    if (a === "masha" && st.posture === "carried" && !CARRIED_OK.has(b.verb)) t = dismount(t);
    if (a === "bear" && ws.actors.masha.posture === "carried" && ENDS_CARRY.has(b.verb)) t = Math.max(t, dismount(t));
    if (st.posture === "sleep" && !SLEEP_OK.has(b.verb)) {
      addClip(a, t, GRAMMAR.wake_up.baseDuration, "wake_up", "sleepy", { from: v2(st.pos), facing: st.facing, posture: "stand", item: st.holding ?? undefined });
      events.push({ actor: a, verb: "wake_up", start: t, dur: GRAMMAR.wake_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
      t += GRAMMAR.wake_up.baseDuration;
      st.posture = "stand";
      record(a, t);
    }
    if (st.posture === "sit" && !SIT_OK.has(b.verb)) {
      addClip(a, t, GRAMMAR.stand_up.baseDuration, "stand_up", b.emotion, { from: v2(st.pos), facing: st.facing, posture: "stand", item: st.holding ?? undefined });
      events.push({ actor: a, verb: "stand_up", start: t, dur: GRAMMAR.stand_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
      t += GRAMMAR.stand_up.baseDuration;
      st.posture = "stand";
      record(a, t);
    }

    // --- auto-walk to where the verb happens ---
    let walkDest: Vec2 | null = null;
    let walkTarget: string | null = null;
    const home = b.verb === "cook" && (isInteriorMark(b.target) || b.target !== "table" && isInsideHouse(st.pos[0],st.pos[1]))
      ? "house_kitchen" : VERB_HOME_MARK[b.verb] as MarkId | undefined;
    if (home) { walkDest = spread(a, standPos(home), t); walkTarget = home; }
    else if (b.verb === "take" && b.item && ws.props[b.item]?.at !== "hidden" && ws.props[b.item]?.at !== a) { walkDest = approachPoint(a, b.item, t); walkTarget = b.item; }
    else if (interacts && b.target) { walkDest = approachPoint(a, b.target, t, b.verb === "give" ? 1.0 : 0.7); walkTarget = b.target; }
    else if ((b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") && isMark(b.target)) { walkDest = spread(a, standPos(b.target), t); walkTarget = b.target; }
    let walkInfo: BeatTiming["walk"] = null;
    if (walkDest && dist(walkDest, st.pos) > 0.8 && st.posture !== "carried") {
      const d = dist(walkDest, st.pos);
      const verb: Verb = a === "masha" ? (b.emotion === "mischievous" && d < 6 ? "tiptoe_to" : d > 3 ? "run_to" : "walk_to")
        : isWolf(a) ? (b.emotion === "mischievous" && d < 8 ? "tiptoe_to" : b.emotion === "scared" || d > 5 ? "run_to" : "walk_to")
        : d > 8 && b.emotion === "excited" ? "run_to" : "walk_to";
      const s0 = t;
      const faceAfter = isMark(walkTarget) ? MARKS[walkTarget].facing : undefined;
      const wFrom = v2(st.pos);
      t = locomote(a, t, verb, walkDest, b.emotion, walkTarget, faceAfter);
      events.push({ actor: a, verb, start: s0, dur: t - s0, emote: null, hasLine: false, sfx: null, sfxAt: s0, pos: v2(st.pos), main: false });
      walkInfo = { start: s0, dur: t - s0, verb, from: wFrom, to: v2(st.pos) };
    }

    // --- main clip ---
    const mainStart = t;
    const lineText = b.line;
    const lineLang = lineText && /[\u0400-\u04FF]/.test(lineText) ? 'ru' : lineText && /[A-Za-z]/.test(lineText) ? 'en' : opts.lang;
    const lineDur = lineText ? dialogueDuration(lineText, lineLang, opts.speechDurations) : 0;
    let mainDur = def.baseDuration;
    let tail = 0;
    const isLoco = (LOCOMOTION_VERBS as Verb[]).includes(b.verb);
    const facingTo = (id: string | null): number => {
      const p = targetPoint(id, t);
      return p ? r3(yawTo(st.pos, [p[0], p[2]], st.facing)) : st.facing;
    };
    let sfxAt = mainStart + 0.15;
    const baseParams = (): ActorClip["params"] => ({ from: v2(st.pos), facing: st.facing, posture: st.posture, item: st.holding ?? undefined, target: b.target ?? undefined });

    if (isLoco) {
      let dest: Vec2;
      let path: Vec2[] | undefined;
      let faceAfter: number | undefined;
      let toDoor = false;
      if (b.verb === "enter") {
        if (st.posture === "offstage") {
          const fromP: Vec2 = st.mark === "door" ? v2(MARKS.door.pos) : v2(MARKS.path_entry.pos);
          st.pos = fromP;
          st.posture = "stand";
          dest = st.mark === "door" ? spread(a, standPos("porch"), t) : spread(a, [MARKS.clearing.pos[0] + ENTER_OFFSET[a][0], MARKS.clearing.pos[1] + ENTER_OFFSET[a][1]], t);
        } else dest = spread(a, standPos("clearing"), t);
      } else if (b.verb === "exit") {
        dest = v2(MARKS.path_entry.pos);
      } else if (b.verb === "chase" && isActor(b.target)) {
        const tp = posAt(b.target, t);
        const R = 2.2;
        const th0 = Math.atan2(st.pos[0] - tp[0], st.pos[1] - tp[1]);
        path = [v2(st.pos)];
        for (let k = 0; k <= 8; k++) {
          const th = th0 + (k / 8) * Math.PI * 1.25;
          const rr = k === 8 ? 0.9 : R;
          path.push(clampWalkable([tp[0] + Math.sin(th) * rr, tp[1] + Math.cos(th) * rr]));
        }
        dest = path[path.length - 1];
        faceAfter = yawTo(dest, tp, st.facing);
        // the chased character runs ahead if free
        if (tracks[b.target].free <= t + 1e-6 && ws.actors[b.target].posture === "stand") {
          const ot = b.target;
          const opath: Vec2[] = [v2(ws.actors[ot].pos)];
          for (let k = 1; k <= 8; k++) {
            const th = th0 + Math.PI * 0.5 + (k / 8) * Math.PI * 1.1;
            opath.push(clampWalkable([tp[0] + Math.sin(th) * R, tp[1] + Math.cos(th) * R]));
          }
          const ostart = t;
          const oend = locomote(ot, t, "run_to", opath[opath.length - 1], "excited", null, undefined, opath);
          events.push({ actor: ot, verb: "run_to", start: ostart, dur: oend - ostart, emote: null, hasLine: false, sfx: null, sfxAt: ostart, pos: v2(ws.actors[ot].pos), main: false });
        }
      } else if (b.target) {
        const ap = approachPoint(a, b.target, t, 0.9);
        dest = ap ?? v2(st.pos);
        if (isMark(b.target)) faceAfter = MARKS[b.target].facing;
        else if (isActor(b.target)) faceAfter = yawTo(dest, posAt(b.target, t), st.facing);
        toDoor = b.target === "door" && orig >= 0 && lastBeatIdx[a] === orig && b.sfx !== "knock";
      } else dest = v2(st.pos);
      t = locomote(a, t, b.verb, dest, b.emotion, b.verb === "exit" ? "path_entry" : b.target, faceAfter, path);
      mainDur = t - mainStart;
      if (b.verb === "exit" || toDoor) {
        st.posture = "offstage";
        st.mark = b.verb === "exit" ? "path_entry" : "door";
        record(a, t);
      }
      sfxAt = b.target === "door" || b.verb === "exit" ? t - 0.2 : mainStart + 0.15;
      if (lineText && lineDur > mainDur) tail = lineDur - mainDur;
    } else {
      // in-place verbs
      let facing = st.facing;
      let item: PropId | undefined = st.holding ?? undefined;
      let posture: Posture = st.posture;
      switch (b.verb) {
        case "point_at": case "look_at": case "wave": case "peek":
          facing = b.target ? facingTo(b.target) : isActor(o) && ws.actors[o].posture !== "offstage" && lineText ? facingTo(o) : st.facing;
          break;
        case "hug": case "give": case "carry":
          facing = facingTo(b.target);
          break;
        case "throw":
          facing = b.target ? facingTo(b.target) : st.facing;
          break;
        case "take":
          item = b.item ?? undefined;
          break;
        case "cook": case "fish": case "water_plants":
          item = (VERB_IMPLIED_PROP[b.verb] as PropId | undefined) ?? item;
          facing = MARKS[home!].facing;
          break;
        case "sit": posture = "sit"; if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing; break;
        case "sleep": posture = "sleep"; if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing; break;
        case "hide": if (isMark(b.target)) facing = MARKS[b.target].facing; break;
        case "wake_up": case "stand_up": posture = "stand"; break;
        case "surprised": case "scared": if (posture === "sleep") posture = "stand"; break;
        case "fall_down": posture = "stand"; break;
        default:
          if (lineText && ws.actors[o].posture !== "offstage" && st.posture === "stand" && !b.target) facing = facingTo(o);
      }
      if (lineText && lineDur > mainDur) {
        if (def.loopable) mainDur = lineDur;
        else tail = lineDur - mainDur;
      }
      const lookAt = b.target ? targetPoint(b.target, t) : lineText && ws.actors[o].posture !== "offstage" ? headAt(o, t) : null;
      if(VERB_IMPLIED_PROP[b.verb]&&item&&st.holding!==item)giveTo(a,item);
      addClip(a, mainStart, mainDur, b.verb, b.emotion, { ...baseParams(), facing: r3(facing), posture, item, lookAt: lookAt ?? undefined });
      st.facing = r3(facing);
      t = mainStart + mainDur;

      // --- world-state effects ---
      switch (b.verb) {
        case "take":
          if (b.item) {
            if (ws.props[b.item]?.at === "hidden") repairs.push(`the ${b.item} appeared for ${a}`);
            giveTo(a, b.item);
            if (b.item === "flour_bag") flourUsed = true;
          }
          break;
        case "give":
          if (b.item && isActor(b.target)) {
            st.holding = null;
            giveTo(b.target, b.item);
            if (tracks[b.target].free <= mainStart + 1e-6 && ws.actors[b.target].posture !== "offstage") {
              const tgt = b.target;
              addClip(tgt, mainStart, mainDur, "take", "happy", { from: v2(ws.actors[tgt].pos), facing: r3(yawTo(ws.actors[tgt].pos, st.pos, ws.actors[tgt].facing)), posture: ws.actors[tgt].posture, item: b.item, target: a });
              record(tgt, mainStart + mainDur);
            }
          }
          break;
        case "eat":
          if (b.item && CONSUMABLE.has(b.item)) { ws.props[b.item] = { at: "hidden" }; st.holding = null; }
          break;
        case "throw":
          if (b.item) {
            const item0 = b.item;
            st.holding = null;
            let land: Vec2;
            if (isActor(b.target) && ws.actors[b.target].posture !== "offstage") {
              land = posAt(b.target, t);
              if (!ws.actors[b.target].holding) giveTo(b.target, item0);
              else ws.props[item0] = { at: ws.actors[b.target].mark ?? nearestMark(land) };
            } else if (isMark(b.target)) {
              land = v2(MARKS[b.target].pos);
              ws.props[item0] = { at: b.target };
            } else {
              const f: Vec2 = [Math.sin(st.facing), Math.cos(st.facing)];
              land = clampWalkable([st.pos[0] + f[0] * 3, st.pos[1] + f[1] * 3]);
              ws.props[item0] = { at: nearestMark(land) };
            }
            const wet = b.target === "pond_shore" || b.target === "pier" || b.target === "creek";
            if (wet) {
              const pond = OBSTACLES.circles.find((c) => c.id === "pond")!;
              const wp: Vec2 = b.target === "creek" ? v2(MARKS.creek.pos) : [(land[0] + pond.c[0]) / 2, (land[1] + pond.c[1]) / 2];
              addFx("splash", mainStart + 0.6 * mainDur, 1.2, [wp[0], 0, wp[1]]);
              extraSfx.push({ t: mainStart + 0.6 * mainDur, id: "splash", pos: wp });
            }
            if (item0 === "flour_bag") { flourUsed = true; addFx("flour_cloud", mainStart + 0.6 * mainDur, 2.5, [land[0], 0.8, land[1]]); }
          }
          break;
        case "cook":
          ws.props.pancakes = { at: home! };
          break;
        case "fish": {
          addFx("splash", mainStart + 0.3 * mainDur, 1.2, [...FISHING_WATER_TARGET]);
          if (ws.props.fish?.at === "hidden") { if (st.holding) dropHeld(a); ws.actors[a].holding = "fish"; ws.props.fish = { at: a }; }
          break;
        }
        case "carry":
          if (isActor(b.target) && b.target === "masha") {
            const m = ws.actors.masha;
            if (m.posture !== "offstage") {
              addClip("masha", mainStart, mainDur, "idle", "happy", { from: v2(m.pos), to: v2(st.pos), path: [v2(m.pos), v2(st.pos)], facing: st.facing, posture: "carried", item: m.holding ?? undefined, target: "bear" });
              m.posture = "carried";
              m.pos = v2(st.pos);
              m.facing = st.facing;
              m.mark = st.mark;
              record("masha", mainStart + mainDur);
            }
          }
          break;
        case "hug":
          if (isActor(b.target) && tracks[b.target].free <= mainStart + 1e-6 && ws.actors[b.target].posture === "stand") {
            const tgt = b.target;
            const tf = r3(yawTo(ws.actors[tgt].pos, st.pos, ws.actors[tgt].facing));
            addClip(tgt, mainStart, mainDur, "hug", "happy", { from: v2(ws.actors[tgt].pos), facing: tf, posture: "stand", item: ws.actors[tgt].holding ?? undefined, target: a });
            ws.actors[tgt].facing = tf;
            record(tgt, mainStart + mainDur);
          }
          {
            const tp = isActor(b.target) ? posAt(b.target, mainStart) : st.pos;
            addFx("hearts", mainStart + 0.3, 2.0, [(st.pos[0] + tp[0]) / 2, 1.6, (st.pos[1] + tp[1]) / 2]);
          }
          break;
      }
      st.posture = posture;
      if (b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") st.mark = isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2 ? b.target : st.mark;
      record(a, t);
    }

    // idle tail so a non-loopable beat lasts as long as its line
    if (tail > 0.05) {
      addClip(a, t, tail, st.posture === "sleep" ? "sleep" : "idle", b.emotion, { from: v2(st.pos), facing: st.facing, posture: st.posture, item: st.holding ?? undefined, lookAt: ws.actors[o].posture !== "offstage" ? headAt(o, t) : undefined });
      t += tail;
      record(a, t);
    }

    // dialogue
    const lineStart = mainStart;
    // TTS voice follows the script of the words (a child may quote Russian with an English UI), else the UI language
    if (lineText) dialogue.push(makeDialogueCue(r3(lineStart), a, lineText, lineLang, opts.speechDurations));

    // fx tied to the beat
    const head = headAt(a, mainStart);
    if (b.verb === "sleep") addFx("zzz", mainStart + 0.5, Math.max(0.5, mainDur - 0.5), [head[0], head[1] + 0.5, head[2]]);
    if (b.verb === "fall_down") addFx("dust", mainStart + 0.4 * mainDur, 1.0, [st.pos[0], 0.1, st.pos[1]]);
    if (b.verb === "cry") addFx("tears", mainStart, mainDur, head);
    if (b.verb === "angry_stomp") addFx("anger_puff", mainStart, mainDur, [head[0], head[1] + 0.3, head[2]]);
    if (b.sfx === "magic_chime") addFx("sparkles", mainStart, 1.5, [st.pos[0], 1.0, st.pos[1]]);
    const flourNear = flourUsed || ws.actors[a].holding === "flour_bag" || ws.actors[o].holding === "flour_bag" ||
      (isMark(ws.props.flour_bag?.at) && dist(st.pos, MARKS[ws.props.flour_bag.at as MarkId].pos) < 3);
    if ((b.verb === "sneeze" && flourNear) || (b.verb === "take" && b.item === "flour_bag")) addFx("flour_cloud", mainStart + 0.3 * mainDur, 2.5, [st.pos[0], 1.0, st.pos[1]]);

    events.push({ actor: a, verb: b.verb, start: mainStart, dur: mainDur, emote: b.emote, hasLine: !!lineText, sfx: b.sfx, sfxAt, pos: v2(st.pos), main: true });

    const timing: BeatTiming = {
      start: beatStart, end: t, mainStart, mainDur, actor: a, verb: b.verb, from: fromPos, to: v2(st.pos),
      hasLine: !!lineText, lineStart, lineDur, walk: walkInfo, loud: LOUD_VERBS.has(b.verb) || (!!lineText && isShouted(lineText)) || (b.sfx != null && LOUD_SFX.has(b.sfx)),
      scary: false,
    };
    timing.scary = a === "bear" && (timing.loud || b.emotion === "angry" || b.verb === "chase" || (b.emote != null && BEAR_SCARY_EMOTES.has(b.emote)));
    timings.push(timing);
    prevTiming = timing;
  }

  // ---------- duration ----------
  let end = 0;
  for (const a of ACTORS) for (const c of tracks[a].clips) end = Math.max(end, c.start + c.dur);
  for (const d of dialogue) end = Math.max(end, d.start + d.dur);
  const duration = r3(Math.max(1.5, end + SEGMENT_TAIL));

  // ---------- ambient life ----------
  const actorClips = Object.fromEntries(ACTOR_IDS.map(id => [id, fillAmbient(id)])) as Record<ActorId, ActorClip[]>;

  /** Who an idle character watches at time t: whoever's beat covers t (latest start), else its partner. */
  function focusAt(a: ActorId, o: ActorId, t: number): ActorId {
    let best: BeatTiming | null = null;
    for (const tm of timings) if (tm.actor !== a && tm.start <= t && t < tm.end && (!best || tm.start >= best.start)) best = tm;
    if (best && postureAt(best.actor, t) !== "offstage") return best.actor;
    if (isWolf(a) && postureAt(o, t) === "offstage") return postureAt("bear", t) !== "offstage" ? "bear" : "masha";
    return o;
  }

  function fillAmbient(a: ActorId): ActorClip[] {
    const o = otherActor(a);
    const clips = [...tracks[a].clips].sort((x, y) => x.start - y.start).map((c) => (a === "masha" && c.params.posture === "carried" ? rideAlong(c) : c));
    const out: ActorClip[] = [];
    let t = 0;
    for (const c of clips) {
      if (c.start > t + 1e-6 && c.start - t < 0.25 && out.length) out[out.length - 1] = { ...out[out.length - 1], dur: c.start - out[out.length - 1].start };
      else if (c.start > t + 1e-6) out.push(...ambientSpan(a, o, t, c.start));
      const s = Math.max(c.start, t);
      out.push({ ...c, start: s, dur: c.start + c.dur - s });
      t = c.start + c.dur;
    }
    if (duration > t + 1e-6) out.push(...ambientSpan(a, o, t, duration));
    // round consistently so clips are exactly contiguous
    const rounded: ActorClip[] = [];
    for (const c of out) {
      const s = r3(c.start);
      const e = r3(c.start + c.dur);
      if (e - s <= 1e-9) continue;
      const prev = rounded[rounded.length - 1];
      const start = prev ? r3(prev.start + prev.dur) : 0;
      rounded.push({ ...c, start, dur: r3(e - start) });
    }
    if (rounded.length) {
      const last = rounded[rounded.length - 1];
      last.dur = r3(duration - last.start);
    }
    return rounded;
  }

  /** A clip Masha plays on Bear's shoulders follows Bear's path over the clip's interval. */
  function rideAlong(c: ActorClip): ActorClip {
    const t0 = c.start;
    const t1 = c.start + c.dur;
    const p0 = posAt("bear", t0);
    const p1 = posAt("bear", t1);
    const params = { ...c.params, from: [r3(p0[0]), r3(p0[1])] as Vec2 };
    if (dist(p0, p1) > 0.05) {
      const pts: Vec2[] = [];
      for (let k = 0; k <= 4; k++) { const q = posAt("bear", t0 + ((t1 - t0) * k) / 4); pts.push([r3(q[0]), r3(q[1])]); }
      params.to = pts[pts.length - 1];
      params.path = pts;
    } else {
      delete params.to;
      delete params.path;
    }
    return { ...c, params };
  }

  function ambientSpan(a: ActorId, o: ActorId, s: number, e: number): ActorClip[] {
    const out: ActorClip[] = [];
    const st = stateAt(a, s);
    const posture = st.posture;
    const verbFor = (): Verb => (posture === "sleep" ? "sleep" : "idle");
    // reactions to loud beats of the others (the Wolves only react to Bear — they cower)
    const wolf = isWolf(a);
    const reactions = timings.filter((tm) => tm.actor !== a && (wolf ? tm.scary : tm.loud) && tm.mainStart + 0.25 >= s && tm.mainStart + 0.25 < e);
    let t = s;
    const pushIdle = (from: number, to: number) => {
      // split at the other actor's beat boundaries (look-at follows the action), max 4 s each
      const cuts = new Set<number>([from, to]);
      for (const tm of timings) if (tm.actor !== a) for (const x of [tm.start, tm.end]) if (x > from + 0.5 && x < to - 0.5) cuts.add(x);
      const pts = [...cuts].sort((x, y) => x - y);
      const fine: number[] = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const span = pts[i] - fine[fine.length - 1];
        const n = Math.ceil(span / 4);
        for (let k = 1; k <= n; k++) fine.push(fine[fine.length - 1] + (pts[i] - fine[fine.length - 1]) / (n - k + 1));
      }
      for (let i = 1; i < fine.length; i++) {
        const c0 = fine[i - 1];
        const c1 = fine[i];
        if (c1 - c0 < 1e-6) continue;
        const mid = (c0 + c1) / 2;
        const f = focusAt(a, o, mid);
        const look = postureAt(f, mid) !== "offstage" && posture !== "sleep" ? headAt(f, mid) : undefined;
        const p0 = posAt(a, c0);
        const params: ActorClip["params"] = { from: p0, facing: st.facing, posture, item: st.holding ?? undefined, lookAt: look, ambient: true };
        if (posture === "carried") {
          const p1 = posAt(a, c1);
          params.to = p1;
          params.path = [p0, posAt(a, mid), p1];
        }
        out.push({ start: c0, dur: c1 - c0, verb: verbFor(), emotion: posture === "sleep" ? "sleepy" : "neutral", params });
      }
    };
    for (const r of reactions) {
      if (posture === "sleep" || posture === "offstage") break;
      const rt = r.mainStart + 0.25;
      const verb: Verb = wolf ? "scared"
        : a === "masha" ? (r.verb === "fall_down" || r.verb === "sneeze" || r.verb === "laugh" ? "laugh" : "surprised") : r.verb === "laugh" ? "nod" : "surprised";
      const rd = GRAMMAR[verb].baseDuration;
      if (rt < t || rt + rd > e) continue;
      if (rt > t + 1e-6) pushIdle(t, rt);
      const ro = r.actor;
      out.push({ start: rt, dur: rd, verb, emotion: verb === "laugh" || verb === "nod" ? "happy" : verb === "scared" ? "scared" : "surprised", params: { from: posAt(a, rt), facing: r3(yawTo(posAt(a, rt), posAt(ro, rt), st.facing)), posture, item: st.holding ?? undefined, lookAt: headAt(ro, rt), ambient: true, target: ro } });
      t = rt + rd;
    }
    if (e > t + 1e-6) pushIdle(t, e);
    // zzz while asleep
    if (posture === "sleep" && e - s > 1) { const h = headAt(a, s); addFx("zzz", s, e - s, [h[0], h[1] + 0.5, h[2]]); }
    return out;
  }

  // ---------- camera ----------
  const lastLineIdx = timings.map((tm) => tm.hasLine).lastIndexOf(true);
  const camBeats: CameraBeatInfo[] = [];
  timings.forEach((tm, i) => {
    const em = compiledBeats[i].emotion;
    if (tm.walk && tm.walk.dur > 0.5) {
      camBeats.push({ start: tm.walk.start, dur: tm.walk.dur, actor: tm.actor, verb: tm.walk.verb, shot: "auto", from: tm.walk.from, to: tm.walk.to, hasLine: false, lineStart: 0, lineDur: 0, punchline: false, emotion: em });
    }
    const st0 = tm.walk ? tm.walk.start + tm.walk.dur : tm.start;
    camBeats.push({
      start: st0, dur: tm.end - st0, actor: tm.actor, verb: tm.verb, shot: compiledBeats[i].shot, from: tm.walk ? tm.walk.to : tm.from, to: tm.to,
      hasLine: tm.hasLine, lineStart: tm.lineStart, lineDur: tm.lineDur, punchline: tm.hasLine && i === lastLineIdx, emotion: em,
    });
  });
  const camera = planCamera({
    facingAt: (actor,t) => tracks[actor].clips.find(c=>c.start<=t&&t<c.start+c.dur)?.params.facing ?? stateAt(actor,t).facing,
    duration, beats: camBeats, posAt, visibleAt: (x, tt) => cast.includes(x)&&postureAt(x, tt) !== "offstage", headY: (x, tt) => headAt(x, tt)[1],
    dialogue: dialogue.map((d) => ({ start: d.start, dur: d.dur, actor: d.actor })), isFirst: opts.isFirst, cameraSeed: opts.remix.cameraSeed,
  });

  // ---------- lighting ----------
  const tod = opts.remix.timeOfDay ?? bs0.time_of_day ?? startState.timeOfDay;
  const lighting: LightingCue[] = [];
  if (opts.isFirst || tod !== startState.timeOfDay) lighting.push({ start: 0, timeOfDay: tod, transition: tod === startState.timeOfDay ? 0 : 2.5 });
  ws.timeOfDay = tod;

  // ---------- audio ----------
  const audio = buildAudioCues({
    bs: bs0, actorClips, events, extraSfx, dialogue, camera, timeOfDay: tod, prevTimeOfDay: startState.timeOfDay, carry: opts.carry,
    isFirst: opts.isFirst, duration, musicMoodOverride: opts.remix.musicMood,
  });

  fx.sort((x, y) => x.start - y.start);
  const beatScript: BeatScript = { ...bs0, beats: compiledBeats };
  for (const a of ACTORS) ws.actors[a].pos = [r3(ws.actors[a].pos[0]), r3(ws.actors[a].pos[1])];

  return {
    segment: {
      paragraphId: opts.paragraphId,
      version: opts.version,
      duration,
      cast,
      startState: cloneWorldState(startState),
      endState: ws,
      actorClips,
      dialogue,
      emotes: audio.emotes,
      foley: audio.foley,
      camera,
      sfx: audio.sfx,
      music: audio.music,
      ambience: audio.ambience,
      ducking: audio.ducking,
      lighting,
      fx: fx.filter((f) => f.start < duration),
    },
    beatScript,
    repairs,
    errors,
    carry: audio.carry,
  };
}

function nearestMark(p: Vec2): MarkId {
  let best: MarkId = "clearing";
  let bd = Infinity;
  for (const m of Object.values(MARKS)) {
    if (m.id === "door" || m.id === "path_entry") continue;
    const d = dist(p, m.pos);
    if (d < bd) { bd = d; best = m.id; }
  }
  return best;
}
function nearestMarkWithin(p: Vec2, r: number): MarkId | null {
  const m = nearestMark(p);
  return dist(p, standPos(m)) <= r || dist(p, MARKS[m].pos) <= r ? m : null;
}

/** Is a prop edible (for parser/validator helpers). */
export function isEdible(p: PropId): boolean {
  return PROPS[p].edible;
}
/** Whether a character can speak (bible flag). */
export function speaks(a: ActorId): boolean {
  return CHARACTERS[a].speaks;
}
