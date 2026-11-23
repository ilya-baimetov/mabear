// Deterministic BeatScript → Segment compiler (spec §6.3–§6.5, §7.5, §7.6). Pure: same input → identical output.
//
// Timing: a beat anchors to the previous beat's START (with_previous) or END, plus delay_s; each character has its own
// track and its beats never overlap (they queue). Durations come from the grammar (baseDuration) or path length /
// speed; a beat with a line lasts at least as long as the line. Object verbs walk to where they happen first
// (VERB_HOME_MARK, the prop, the other character). Trivial repairs (insert `take`/`enter`) are written into the
// compiled BeatScript and listed in `repairs`. Characters without a beat are filled with ambient life (idle clips that
// look at the action, small reactions to loud beats) so every track covers [0, duration] contiguously.
import { CHARACTERS } from "../shared/bible/characters";
import { isInsideHouse, isInteriorMark, MARKS } from "../shared/bible/set";
import { COOKING_STATION } from "../shared/cookingStation";
import { GRAMMAR, isWolf, LOCOMOTION_VERBS, VERB_HOME_MARK, VERB_IMPLIED_PROP } from "../shared/grammar";
import { HOUSE_CHILD_COOK_POSITION, HOUSE_COOKING_HELPER, HOUSE_STOVE } from "../shared/houseLayout";
import { avoidHammock } from "../shared/physicalInteractions";
import type {
  ActorClip,
  ActorId,
  Beat,
  BeatScript,
  LightingCue,
  MarkId,
  Posture,
  PropId,
  Vec2,
  Vec3,
  Verb,
  WorldState,
} from "../shared/schema";
import { buildAudioCues } from "./audioCues";
import { planCamera, type CameraBeatInfo } from "./camera";
import { dialogueDuration } from "./dialogue";
import { clampWalkable, planPath, yawTo } from "./path";
import type { CompileFn, CompileOptions, CompileResult } from "./types";
import { isActor, isMark, otherActor, validateBeatScript } from "./validate";
import { cloneWorldState, withAllActors } from "./worldState";
import { fillAmbient } from "./compile/ambient";
import { applyInPlaceWorldEffects, finalizeBeatEffects } from "./compile/beatEffects";
import {
  ACTORS,
  type BeatTiming,
  createCompileContext,
  dist,
  ENTER_OFFSET,
  giveTo,
  headAt,
  MAX_LOCO_S,
  nearestMark,
  posAt,
  postureAt,
  pushClip,
  r3,
  record,
  SEGMENT_TAIL,
  standPos,
  stateAt,
  targetPoint,
  v2,
} from "./compile/context";
import { clearTableForHug, hammockSleepApproach, hugApproach, putAsideBeforeClap } from "./compile/interactions";
import { applyPreBeatRepairs, repairBeatInQueue } from "./compile/repairs";
import {
  approachPoint,
  armchairApproach,
  cupboardAction,
  cupboardShot,
  doorAction,
  facePartner,
  locomote,
  seatExit,
  spread,
} from "./compile/staging";

export { MAX_LOCO_S, SEGMENT_TAIL, standPos };

export const compile: CompileFn = (inputBs, startState, opts) => compileImpl(inputBs, startState, opts);

function compileImpl(inputBs: BeatScript, startState0: WorldState, opts: CompileOptions): CompileResult {
  // world states saved before the Wolves joined get them back at their start spot by the van
  const startState = withAllActors(cloneWorldState(startState0));
  const v = validateBeatScript(inputBs, startState, opts.lang);
  const bs0 = v.beatScript;
  const ctx = createCompileContext(startState, bs0, opts, v.errors);

  const queue: Beat[] = bs0.beats.map((b) => ({ ...b }));
  let idx = 0;
  let prevTiming: BeatTiming | null = null;

  while (idx < queue.length) {
    const b = queue[idx];
    const origIndex = idx;
    idx++;

    const repairOutcome = repairBeatInQueue(ctx, queue, origIndex);
    if (repairOutcome === "skip") continue;
    if (repairOutcome === "requeue") {
      idx = origIndex;
      continue;
    }

    const a = b.actor;
    const o = otherActor(a);
    const st = ctx.ws.actors[a];

    ctx.compiledBeats.push(b);
    const def = GRAMMAR[b.verb];
    const anchor = prevTiming ? (b.with_previous ? prevTiming.start : prevTiming.end) : 0;
    // The doorway shot has exclusive staging until its traveller clears the
    // steps; do not perform another actor's cooking/hug unseen behind that cut.
    let t = Math.max(anchor + b.delay_s, ctx.tracks[a].free, ctx.doorFree, ctx.cupboardFree);
    const interacts = (b.verb === "hug" || b.verb === "carry" || b.verb === "give") && isActor(b.target);
    if (interacts && isActor(b.target)) t = Math.max(t, ctx.tracks[b.target].free);
    const beatStart = t;
    const fromPos = posAt(ctx, a, t);

    t = applyPreBeatRepairs(ctx, b, t);

    // --- auto-walk to where the verb happens ---
    let walkDest: Vec2 | null = null;
    let walkTarget: string | null = null;
    const seatedAtHammock = st.posture === "sit" && st.mark === "hammock" && dist(st.pos, MARKS.hammock.pos) < 1.05;
    const home =
      b.verb === "cook" && (isInteriorMark(b.target) || (b.target !== "table" && isInsideHouse(st.pos[0], st.pos[1])))
        ? "house_kitchen"
        : (VERB_HOME_MARK[b.verb] as MarkId | undefined);
    const cookingStation = b.verb === "cook" && a === "masha" && (home === "table" || home === "house_kitchen");
    const cookingSupport = home === "house_kitchen" ? HOUSE_COOKING_HELPER : COOKING_STATION;

    if (home) {
      walkDest = cookingStation
        ? home === "house_kitchen"
          ? [...HOUSE_CHILD_COOK_POSITION]
          : [...cookingSupport.position]
        : spread(ctx, a, standPos(home), t);
      walkTarget = home;
    } else if (b.verb === "take" && b.item && ctx.ws.props[b.item]?.at !== "hidden" && ctx.ws.props[b.item]?.at !== a) {
      walkDest = approachPoint(ctx, a, b.item, t);
      walkTarget = b.item;
    } else if (interacts && b.target) {
      if (b.verb === "hug" && isActor(b.target)) t = clearTableForHug(ctx, b.target, t, b.emotion);
      walkDest = b.verb === "hug" && isActor(b.target) ? hugApproach(ctx, a, b.target, t) : approachPoint(ctx, a, b.target, t, b.verb === "give" ? 1 : 0.7);
      walkTarget = b.target;
      // The receiver faces the arrival point while the child is still at a safe
      // distance, rather than rotating through a closed embrace.
      if (b.verb === "hug" && isActor(b.target) && walkDest && ["stand", "sit"].includes(ctx.ws.actors[b.target].posture)) {
        t = facePartner(ctx, b.target, t, walkDest, b.emotion);
      }
    } else if ((b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") && isMark(b.target)) {
      walkDest = spread(ctx, a, standPos(b.target), t);
      walkTarget = b.target;
      if (b.verb === "sit" && b.target === "house_living" && st.posture !== "sit" && (a === "masha" || a === "bear")) walkDest = armchairApproach(a);
      if (b.verb === "sleep" && b.target === "hammock" && seatedAtHammock) walkDest = null;
      else if (b.verb === "sleep" && b.target === "hammock" && st.posture !== "sleep") walkDest = hammockSleepApproach(ctx, a);
    }

    let walkInfo: BeatTiming["walk"] = null;
    if (
      walkDest &&
      dist(walkDest, st.pos) >
        (b.verb === "hug" ? 0.004 : cookingStation || (b.verb === "take" && isInsideHouse(...walkDest)) || (b.verb === "sit" && b.target === "house_living") ? 0.04 : 0.8) &&
      st.posture !== "carried"
    ) {
      const d = dist(walkDest, st.pos);
      const verb: Verb =
        a === "masha"
          ? b.emotion === "mischievous" && d < 6
            ? "tiptoe_to"
            : d > 3
              ? "run_to"
              : "walk_to"
          : isWolf(a)
            ? b.emotion === "mischievous" && d < 8
              ? "tiptoe_to"
              : b.emotion === "scared" || d > 5
                ? "run_to"
                : "walk_to"
            : d > 8 && b.emotion === "excited"
              ? "run_to"
              : "walk_to";
      const s0 = t;
      const faceAfter = isMark(walkTarget) ? MARKS[walkTarget].facing : undefined;
      const wFrom = v2(st.pos);
      t = locomote(
        ctx,
        a,
        t,
        verb,
        walkDest,
        b.emotion,
        walkTarget,
        faceAfter,
        b.verb === "hug" || b.target === "hammock" ? avoidHammock(planPath(wFrom, walkDest), a) : undefined,
      );
      // Note: hug / hammock avoidance is preserved below via avoidHammock in locomote + exact path0 when hug/hammock
      ctx.events.push({ actor: a, verb, start: s0, dur: t - s0, emote: null, hasLine: false, sfx: null, sfxAt: s0, pos: v2(st.pos), main: false });
      walkInfo = { start: s0, dur: t - s0, verb, from: wFrom, to: v2(st.pos) };
    }

    if (b.verb === "sleep" && b.target === "hammock" && st.posture === "stand") {
      t = facePartner(ctx, a, t, [st.pos[0] + Math.sin(MARKS.hammock.facing), st.pos[1] + Math.cos(MARKS.hammock.facing)], b.emotion);
    }
    if (b.verb === "sit" && b.target === "house_living" && st.posture !== "sit" && (a === "masha" || a === "bear")) {
      t = facePartner(ctx, a, t, [st.pos[0], st.pos[1] + 1], b.emotion);
    }
    if (b.verb === "hug" && isActor(b.target) && ["stand", "sit"].includes(ctx.ws.actors[b.target].posture)) {
      const start = t;
      t = Math.max(facePartner(ctx, a, start, ctx.ws.actors[b.target].pos, b.emotion), facePartner(ctx, b.target, start, st.pos, b.emotion));
    }

    if (b.verb === "take" && b.item && ctx.ws.props[b.item]?.at === "cupboard") {
      if ((ctx.ws.objects?.kitchen_cupboard ?? 0) < 0.999) {
        ctx.repairs.push("Opened the cupboard before reaching inside.");
        t = cupboardAction(ctx, a, t, 1, b.emotion);
      }
      t = facePartner(ctx, a, t, [st.pos[0] - 1, st.pos[1]], b.emotion);
      st.mark = "cupboard";
    }

    if (b.verb === "clap" && st.holding && st.posture !== "carried") {
      t = putAsideBeforeClap(ctx, a, t, b.emotion);
    }

    // --- main clip ---
    const mainStart = t;
    const lineText = b.line;
    const lineLang = lineText && /[\u0400-\u04FF]/.test(lineText) ? "ru" : lineText && /[A-Za-z]/.test(lineText) ? "en" : opts.lang;
    const lineDur = lineText ? dialogueDuration(lineText, lineLang, opts.speechDurations) : 0;
    let mainDur = def.baseDuration;
    let tail = 0;
    const isLoco = (LOCOMOTION_VERBS as Verb[]).includes(b.verb);
    const facingTo = (id: string | null): number => {
      const p = targetPoint(ctx, id, t);
      return p ? r3(yawTo(st.pos, [p[0], p[2]], st.facing)) : st.facing;
    };
    let sfxAt = mainStart + 0.15;
    const baseParams = (): ActorClip["params"] => ({
      from: v2(st.pos),
      facing: st.facing,
      posture: st.posture,
      item: st.holding ?? undefined,
      target: b.target ?? undefined,
    });

    if (b.verb === "open" || b.verb === "close") {
      t = b.target === "cupboard" ? cupboardAction(ctx, a, t, b.verb === "open" ? 1 : 0, b.emotion) : doorAction(ctx, a, t, b.verb === "open" ? 1 : 0, b.emotion);
      mainDur = t - mainStart;
    } else if (isLoco) {
      let dest: Vec2;
      let path: Vec2[] | undefined;
      let faceAfter: number | undefined;
      if (b.verb === "enter") {
        if (st.posture === "offstage") {
          const fromP: Vec2 = st.mark === "door" ? v2(MARKS.door.pos) : v2(MARKS.path_entry.pos);
          st.pos = fromP;
          st.posture = "stand";
          dest =
            st.mark === "door"
              ? spread(ctx, a, standPos("porch"), t)
              : spread(ctx, a, [MARKS.clearing.pos[0] + ENTER_OFFSET[a][0], MARKS.clearing.pos[1] + ENTER_OFFSET[a][1]], t);
        } else dest = spread(ctx, a, standPos("clearing"), t);
      } else if (b.verb === "exit") {
        dest = v2(MARKS.path_entry.pos);
      } else if (b.verb === "chase" && isActor(b.target)) {
        const tp = posAt(ctx, b.target, t);
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
        if (ctx.tracks[b.target].free <= t + 1e-6 && ctx.ws.actors[b.target].posture === "stand") {
          const ot = b.target;
          const opath: Vec2[] = [v2(ctx.ws.actors[ot].pos)];
          for (let k = 1; k <= 8; k++) {
            const th = th0 + Math.PI * 0.5 + (k / 8) * Math.PI * 1.1;
            opath.push(clampWalkable([tp[0] + Math.sin(th) * R, tp[1] + Math.cos(th) * R]));
          }
          const ostart = t;
          const oend = locomote(ctx, ot, t, "run_to", opath[opath.length - 1], "excited", null, undefined, opath);
          ctx.events.push({ actor: ot, verb: "run_to", start: ostart, dur: oend - ostart, emote: null, hasLine: false, sfx: null, sfxAt: ostart, pos: v2(ctx.ws.actors[ot].pos), main: false });
        }
      } else if (b.target) {
        const ap = approachPoint(ctx, a, b.target, t, 0.9);
        dest = ap ?? v2(st.pos);
        if (isMark(b.target)) faceAfter = MARKS[b.target].facing;
        else if (isActor(b.target)) faceAfter = yawTo(dest, posAt(ctx, b.target, t), st.facing);
      } else dest = v2(st.pos);

      t = locomote(ctx, a, t, b.verb, dest, b.emotion, b.verb === "exit" ? "path_entry" : b.target, faceAfter, path);
      mainDur = t - mainStart;
      if (b.verb === "exit") {
        st.posture = "offstage";
        st.mark = "path_entry";
        record(ctx, a, t);
      }
      sfxAt = b.target === "door" || b.verb === "exit" ? t - 0.2 : mainStart + 0.15;
      if (lineText && lineDur > mainDur) tail = lineDur - mainDur;
    } else {
      // in-place verbs
      let facing = st.facing;
      let item: PropId | undefined = st.holding ?? undefined;
      let posture: Posture = st.posture;
      switch (b.verb) {
        case "point_at":
        case "look_at":
        case "wave":
        case "peek":
          facing = b.target ? facingTo(b.target) : isActor(o) && ctx.ws.actors[o].posture !== "offstage" && lineText ? facingTo(o) : st.facing;
          break;
        case "hug":
        case "give":
        case "carry":
          facing = facingTo(b.target);
          break;
        case "throw":
          facing = b.target ? facingTo(b.target) : st.facing;
          break;
        case "take":
          item = b.item ?? undefined;
          if (b.item && ctx.ws.props[b.item]?.at === "cupboard") {
            facing = -Math.PI / 2;
            mainDur = 3.0;
          } else if (b.item && isInteriorMark(ctx.ws.props[b.item]?.at)) facing = facingTo(b.item);
          break;
        case "cook":
        case "fish":
        case "water_plants":
          item = (VERB_IMPLIED_PROP[b.verb] as PropId | undefined) ?? item;
          facing = cookingStation ? cookingSupport.facing : MARKS[home!].facing;
          break;
        case "sit":
          posture = "sit";
          if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing;
          break;
        case "sleep":
          posture = "sleep";
          if (isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2) facing = MARKS[b.target].facing;
          break;
        case "hide":
          if (isMark(b.target)) facing = MARKS[b.target].facing;
          break;
        case "wake_up":
        case "stand_up":
          posture = "stand";
          break;
        case "surprised":
        case "scared":
          if (posture === "sleep") posture = "stand";
          break;
        case "fall_down":
          posture = "stand";
          break;
        default:
          if (lineText && ctx.ws.actors[o].posture !== "offstage" && st.posture === "stand" && !b.target) facing = facingTo(o);
      }
      if (lineText && lineDur > mainDur) {
        if (def.loopable) mainDur = lineDur;
        else tail = lineDur - mainDur;
      }
      const lookAt =
        b.verb === "cook" && home === "house_kitchen"
          ? ((a === "masha"
              ? [HOUSE_CHILD_COOK_POSITION[0] - 0.42, 1.25, HOUSE_CHILD_COOK_POSITION[1] - 0.1]
              : [HOUSE_STOVE[0], 1.3, HOUSE_STOVE[1]]) as Vec3)
          : b.target
            ? targetPoint(ctx, b.target, t)
            : lineText && ctx.ws.actors[o].posture !== "offstage"
              ? headAt(ctx, o, t)
              : null;
      if (VERB_IMPLIED_PROP[b.verb] && item && st.holding !== item) giveTo(ctx, a, item);
      const exit = b.verb === "stand_up" || (st.mark === "hammock" && posture === "stand" && (st.posture === "sleep" || st.posture === "sit")) ? seatExit(ctx, a) : null;
      const mount =
        b.verb === "sleep" && b.target === "hammock" && st.posture !== "sleep" && !seatedAtHammock
          ? { from: v2(st.pos), to: v2(MARKS.hammock.pos), path: [v2(st.pos), v2(MARKS.hammock.pos)], facing: MARKS.hammock.facing, target: "hammock" as const }
          : b.verb === "sit" && b.target === "house_living" && st.posture !== "sit" && (a === "masha" || a === "bear")
            ? { from: v2(st.pos), to: v2(MARKS.house_living.pos), path: [v2(st.pos), v2(MARKS.house_living.pos)], facing: MARKS.house_living.facing, target: "house_living" as const }
            : null;
      if (exit) facing = exit.facing;
      if (mount) facing = mount.facing;
      const pickUpAt = b.verb === "take" && item && isInteriorMark(ctx.ws.props[item]?.at) ? (ctx.ws.props[item].at as MarkId) : undefined;
      pushClip(ctx, a, mainStart, mainDur, b.verb, b.emotion, {
        ...baseParams(),
        facing: r3(facing),
        posture,
        item,
        lookAt: lookAt ?? undefined,
        ...(pickUpAt ? { pickUpAt } : {}),
        ...(b.verb === "drop" ? { dropAt: st.mark ?? nearestMark(st.pos) } : {}),
        ...(b.verb === "fish" ? { catchesFish: ctx.ws.props.fish?.at === "hidden" } : {}),
        ...exit,
        ...mount,
      });
      if (exit) {
        st.pos = v2(exit.to);
        st.mark = null;
      }
      if (mount) {
        st.pos = v2(mount.to);
        st.mark = mount.target;
      }
      st.facing = r3(facing);
      t = mainStart + mainDur;
      if (pickUpAt === "cupboard") {
        ctx.cupboardFree = t;
        cupboardShot(ctx, mainStart, t);
      }

      applyInPlaceWorldEffects(ctx, b, a, mainStart, mainDur, t, home, posture);
    }

    prevTiming = finalizeBeatEffects(ctx, {
      b,
      a,
      o,
      beatStart,
      mainStart,
      mainDur,
      t,
      tail,
      fromPos,
      walkInfo,
      sfxAt,
      lineText,
      lineLang,
      lineDur,
    });
  }

  // ---------- duration ----------
  let end = 0;
  for (const a of ACTORS) for (const c of ctx.tracks[a].clips) end = Math.max(end, c.start + c.dur);
  for (const d of ctx.dialogue) end = Math.max(end, d.start + d.dur);
  const duration = r3(Math.max(1.5, end + SEGMENT_TAIL));
  // Let the audience see the closed door and retained jar during the final
  // pause; the generic tail camera can otherwise cut behind the refrigerator.
  if (ctx.lastCupboardShot && Math.abs(ctx.cupboardFree - end) < 0.002) ctx.lastCupboardShot.dur = duration - ctx.lastCupboardShot.start;

  // ---------- ambient life ----------
  const actorClips = fillAmbient(ctx, duration);

  // ---------- camera ----------
  const lastLineIdx = ctx.timings.map((tm) => tm.hasLine).lastIndexOf(true);
  const camBeats: CameraBeatInfo[] = [...ctx.preparationCameras];
  ctx.timings.forEach((tm, i) => {
    const em = ctx.compiledBeats[i].emotion;
    if (tm.walk && tm.walk.dur > 0.5) {
      camBeats.push({ start: tm.walk.start, dur: tm.walk.dur, actor: tm.actor, verb: tm.walk.verb, shot: "auto", from: tm.walk.from, to: tm.walk.to, hasLine: false, lineStart: 0, lineDur: 0, punchline: false, emotion: em });
    }
    const st0 = tm.walk ? tm.walk.start + tm.walk.dur : tm.start;
    camBeats.push({
      start: st0,
      dur: tm.end - st0,
      actor: tm.actor,
      verb: tm.verb,
      shot: ctx.compiledBeats[i].shot,
      from: tm.walk ? tm.walk.to : tm.from,
      to: tm.to,
      hasLine: tm.hasLine,
      lineStart: tm.lineStart,
      lineDur: tm.lineDur,
      punchline: tm.hasLine && i === lastLineIdx,
      emotion: em,
    });
  });
  let camera = planCamera({
    carriedByAt: (actor, t) =>
      actor === "masha" && (postureAt(ctx, actor, t) === "carried" || ctx.tracks.bear.clips.some((c) => c.verb === "carry" && c.start <= t && t < c.start + c.dur)) ? "bear" : null,
    facingAt: (actor, t) => ctx.tracks[actor].clips.find((c) => c.start <= t && t < c.start + c.dur)?.params.facing ?? stateAt(ctx, actor, t).facing,
    duration,
    beats: camBeats,
    posAt: (a, tt) => posAt(ctx, a, tt),
    visibleAt: (x, tt) => ctx.cast.includes(x) && postureAt(ctx, x, tt) !== "offstage",
    headY: (x, tt) => headAt(ctx, x, tt)[1],
    dialogue: ctx.dialogue.map((d) => ({ start: d.start, dur: d.dur, actor: d.actor })),
    isFirst: opts.isFirst,
    cameraSeed: opts.remix.cameraSeed,
  });
  // Door choreography must be readable even when a long beat spans two sets.
  // Later inserts win; trim ordinary shots rather than overlapping cue ranges.
  for (const shot of ctx.doorShots) {
    const lo = shot.start;
    const hi = lo + shot.dur;
    camera = camera.flatMap((c) => {
      const ce = c.start + c.dur;
      if (ce <= lo || c.start >= hi) return [c];
      return [...(c.start < lo ? [{ ...c, dur: lo - c.start }] : []), ...(ce > hi ? [{ ...c, start: hi, dur: ce - hi }] : [])];
    });
    camera.push(shot);
    camera.sort((a, b) => a.start - b.start);
  }

  // ---------- lighting ----------
  const tod = opts.remix.timeOfDay ?? bs0.time_of_day ?? startState.timeOfDay;
  const lighting: LightingCue[] = [];
  if (opts.isFirst || tod !== startState.timeOfDay) lighting.push({ start: 0, timeOfDay: tod, transition: tod === startState.timeOfDay ? 0 : 2.5 });
  ctx.ws.timeOfDay = tod;

  // ---------- audio ----------
  const audio = buildAudioCues({
    bs: bs0,
    actorClips,
    events: ctx.events,
    extraSfx: ctx.extraSfx,
    dialogue: ctx.dialogue,
    camera,
    timeOfDay: tod,
    prevTimeOfDay: startState.timeOfDay,
    carry: opts.carry,
    isFirst: opts.isFirst,
    duration,
    musicMoodOverride: opts.remix.musicMood,
  });

  ctx.fx.sort((x, y) => x.start - y.start);
  const beatScript: BeatScript = { ...bs0, beats: ctx.compiledBeats };
  for (const a of ACTORS) ctx.ws.actors[a].pos = [r3(ctx.ws.actors[a].pos[0]), r3(ctx.ws.actors[a].pos[1])];

  return {
    segment: {
      paragraphId: opts.paragraphId,
      version: opts.version,
      duration,
      cast: ctx.cast,
      startState: cloneWorldState(startState),
      endState: ctx.ws,
      actorClips,
      ...(ctx.objectCues.length ? { objectCues: ctx.objectCues } : {}),
      dialogue: ctx.dialogue,
      emotes: audio.emotes,
      foley: audio.foley,
      camera,
      sfx: audio.sfx,
      music: audio.music,
      ambience: audio.ambience,
      ducking: audio.ducking,
      lighting,
      fx: ctx.fx.filter((f) => f.start < duration),
    },
    beatScript,
    repairs: ctx.repairs,
    errors: ctx.errors,
    carry: audio.carry,
  };
}

/** Whether a character can speak (bible flag). */
export function speaks(a: ActorId): boolean {
  return CHARACTERS[a].speaks;
}
