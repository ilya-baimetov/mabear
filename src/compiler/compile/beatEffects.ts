import { FISHING_WATER_TARGET, MARKS, OBSTACLES } from "../../shared/bible/set";
import { hammockTiming } from "../../shared/physicalInteractions";
import { BENCH_BALL_FALLBACK } from "../../shared/propPlacement";
import { isCarrot, type ActorId, type Beat, type Lang, type MarkId, type Posture, type Vec2 } from "../../shared/schema";
import { isShouted, makeDialogueCue } from "../dialogue";
import { clampWalkable, yawTo } from "../path";
import { isActor, isMark } from "../validate";
import {
  addFx,
  BEAR_SCARY_EMOTES,
  type BeatTiming,
  type CompileContext,
  CONSUMABLE,
  dist,
  dropHeld,
  giveTo,
  headAt,
  LOUD_SFX,
  LOUD_VERBS,
  nearestMark,
  posAt,
  pushClip,
  r3,
  record,
  standPos,
  v2,
} from "./context";

/** Applies prop ownership, splash/hearts FX, carry/hug partner clips, and final posture/mark state for in-place verbs. */
export function applyInPlaceWorldEffects(
  ctx: CompileContext,
  b: Beat,
  a: ActorId,
  mainStart: number,
  mainDur: number,
  t: number,
  home: MarkId | undefined,
  posture: Posture,
  putDown?: MarkId,
): void {
  const st = ctx.ws.actors[a];
  switch (b.verb) {
    case "nudge":
      ctx.ws.props.ball = { at: "clearing", position: [...BENCH_BALL_FALLBACK.position], rotation: [...BENCH_BALL_FALLBACK.rotation] };
      break;
    case "put_down":
      if (b.item && putDown) {
        ctx.ws.props[b.item] = { at: putDown, planted: false };
        st.holding = null;
      }
      break;
    case "drop":
      if (b.item) {
        ctx.ws.props[b.item] = { at: st.mark ?? nearestMark(st.pos) };
        st.holding = null;
      }
      break;
    case "take":
      if (b.item) {
        if (ctx.ws.props[b.item]?.at === "hidden") ctx.repairs.push(`the ${b.item} appeared for ${a}`);
        giveTo(ctx, a, b.item);
        if (b.item === "flour_bag") ctx.flourUsed = true;
      }
      break;
    case "give":
      if (b.item && isActor(b.target)) {
        st.holding = null;
        giveTo(ctx, b.target, b.item);
        if (ctx.tracks[b.target].free <= mainStart + 1e-6 && ctx.ws.actors[b.target].posture !== "offstage") {
          const tgt = b.target;
          pushClip(ctx, tgt, mainStart, mainDur, "take", "happy", {
            from: v2(ctx.ws.actors[tgt].pos),
            facing: r3(yawTo(ctx.ws.actors[tgt].pos, st.pos, ctx.ws.actors[tgt].facing)),
            posture: ctx.ws.actors[tgt].posture,
            item: b.item,
            target: a,
          });
          record(ctx, tgt, mainStart + mainDur);
        }
      }
      break;
    case "eat":
      if (b.item && CONSUMABLE.has(b.item)) {
        ctx.ws.props[b.item] = { at: "hidden" };
        st.holding = null;
      }
      break;
    case "throw":
      if (b.item) {
        const item0 = b.item;
        st.holding = null;
        let land: Vec2;
        if (isActor(b.target) && ctx.ws.actors[b.target].posture !== "offstage") {
          land = posAt(ctx, b.target, t);
          if (!ctx.ws.actors[b.target].holding) giveTo(ctx, b.target, item0);
          else ctx.ws.props[item0] = { at: ctx.ws.actors[b.target].mark ?? nearestMark(land), ...(isCarrot(item0) ? { planted: false } : {}) };
        } else if (isMark(b.target)) {
          land = v2(MARKS[b.target].pos);
          ctx.ws.props[item0] = { at: b.target, ...(isCarrot(item0) ? { planted: false } : {}) };
        } else {
          const f: Vec2 = [Math.sin(st.facing), Math.cos(st.facing)];
          land = clampWalkable([st.pos[0] + f[0] * 3, st.pos[1] + f[1] * 3]);
          ctx.ws.props[item0] = { at: nearestMark(land), ...(isCarrot(item0) ? { planted: false } : {}) };
        }
        const wet = b.target === "pond_shore" || b.target === "pier" || b.target === "creek";
        if (wet) {
          const pond = OBSTACLES.circles.find((c) => c.id === "pond")!;
          const wp: Vec2 = b.target === "creek" ? v2(MARKS.creek.pos) : [(land[0] + pond.c[0]) / 2, (land[1] + pond.c[1]) / 2];
          addFx(ctx, "splash", mainStart + 0.6 * mainDur, 1.2, [wp[0], 0, wp[1]]);
          ctx.extraSfx.push({ t: mainStart + 0.6 * mainDur, id: "splash", pos: wp });
        }
        if (item0 === "flour_bag") {
          ctx.flourUsed = true;
          addFx(ctx, "flour_cloud", mainStart + 0.6 * mainDur, 2.5, [land[0], 0.8, land[1]]);
        }
      }
      break;
    case "cook":
      ctx.ws.props.pancakes = { at: home! };
      break;
    case "fish": {
      addFx(ctx, "splash", mainStart + 0.3 * mainDur, 1.2, [...FISHING_WATER_TARGET]);
      if (ctx.ws.props.fish?.at === "hidden") {
        if (st.holding) dropHeld(ctx, a);
        ctx.ws.actors[a].holding = "fish";
        ctx.ws.props.fish = { at: a };
      }
      break;
    }
    case "carry":
      if (isActor(b.target) && b.target === "masha") {
        const m = ctx.ws.actors.masha;
        if (m.posture !== "offstage") {
          pushClip(ctx, "masha", mainStart, mainDur, "idle", "happy", {
            from: v2(m.pos),
            to: v2(st.pos),
            path: [v2(m.pos), v2(st.pos)],
            facing: st.facing,
            posture: "carried",
            item: m.holding ?? undefined,
            target: "bear",
          });
          m.posture = "carried";
          m.pos = v2(st.pos);
          m.facing = st.facing;
          m.mark = st.mark;
          record(ctx, "masha", mainStart + mainDur);
        }
      }
      break;
    case "hug":
      if (isActor(b.target) && ctx.tracks[b.target].free <= mainStart + 1e-6 && ["stand", "sit"].includes(ctx.ws.actors[b.target].posture)) {
        const tgt = b.target;
        const tf = r3(yawTo(ctx.ws.actors[tgt].pos, st.pos, ctx.ws.actors[tgt].facing));
        pushClip(ctx, tgt, mainStart, mainDur, "hug", "happy", {
          from: v2(ctx.ws.actors[tgt].pos),
          facing: tf,
          posture: ctx.ws.actors[tgt].posture,
          item: ctx.ws.actors[tgt].holding ?? undefined,
          target: a,
        });
        ctx.ws.actors[tgt].facing = tf;
        record(ctx, tgt, mainStart + mainDur);
      }
      {
        const tp = isActor(b.target) ? posAt(ctx, b.target, mainStart) : st.pos;
        addFx(ctx, "hearts", mainStart + 0.3, 2.0, [(st.pos[0] + tp[0]) / 2, 1.6, (st.pos[1] + tp[1]) / 2]);
      }
      break;
  }
  st.posture = posture;
  if (b.verb === "sit" || b.verb === "sleep" || b.verb === "hide") st.mark = isMark(b.target) && dist(st.pos, standPos(b.target)) < 1.2 ? b.target : st.mark;
  record(ctx, a, t);
}

export interface FinalizeBeatInput {
  b: Beat;
  a: ActorId;
  o: ActorId;
  beatStart: number;
  mainStart: number;
  mainDur: number;
  t: number;
  tail: number;
  fromPos: Vec2;
  walkInfo: BeatTiming["walk"];
  sfxAt: number;
  lineText: string | null;
  lineLang: Lang;
  lineDur: number;
}

/** Emits dialogue tail clips, beat-scoped FX, audio event, and timing record. */
export function finalizeBeatEffects(ctx: CompileContext, input: FinalizeBeatInput): BeatTiming {
  const { b, a, o, beatStart, mainStart, mainDur, tail, fromPos, walkInfo, sfxAt, lineText, lineLang, lineDur } = input;
  let { t } = input;
  const st = ctx.ws.actors[a];

  // idle tail so a non-loopable beat lasts as long as its line
  if (tail > 0.05) {
    pushClip(ctx, a, t, tail, st.posture === "sleep" ? "sleep" : "idle", b.emotion, {
      from: v2(st.pos),
      facing: st.facing,
      posture: st.posture,
      item: st.holding ?? undefined,
      lookAt: ctx.ws.actors[o].posture !== "offstage" ? headAt(ctx, o, t) : undefined,
    });
    t += tail;
    record(ctx, a, t);
  }

  // dialogue
  const lineStart = mainStart;
  // TTS voice follows the script of the words (a child may quote Russian with an English UI), else the UI language
  if (lineText) ctx.dialogue.push(makeDialogueCue(r3(lineStart), a, lineText, lineLang, ctx.opts.speechDurations));

  // fx tied to the beat
  const head = headAt(ctx, a, mainStart);
  if (b.verb === "sleep") {
    const mounting = ctx.tracks[a].clips.some((c) => c.start === mainStart && c.verb === "sleep" && c.params.target === "hammock" && c.params.to);
    const settle = mounting ? hammockTiming(true, mainDur).settled : 0;
    const delay = mounting ? Math.min(mainDur - 0.1, settle + Math.min(1.05, Math.max(0.2, mainDur - settle))) : 0.5;
    const sleepingHead = headAt(ctx, a, mainStart + delay);
    addFx(ctx, "zzz", mainStart + delay, Math.max(mounting ? 0.1 : 0.5, mainDur - delay), [sleepingHead[0], sleepingHead[1] + 0.5, sleepingHead[2]]);
  }
  if (b.verb === "fall_down") addFx(ctx, "dust", mainStart + 0.4 * mainDur, 1.0, [st.pos[0], 0.1, st.pos[1]]);
  if (b.verb === "cry") addFx(ctx, "tears", mainStart, mainDur, head);
  if (b.verb === "angry_stomp") addFx(ctx, "anger_puff", mainStart, mainDur, [head[0], head[1] + 0.3, head[2]]);
  if (b.sfx === "magic_chime") addFx(ctx, "sparkles", mainStart, 1.5, [st.pos[0], 1.0, st.pos[1]]);
  const flourNear =
    ctx.flourUsed ||
    ctx.ws.actors[a].holding === "flour_bag" ||
    ctx.ws.actors[o].holding === "flour_bag" ||
    (isMark(ctx.ws.props.flour_bag?.at) && dist(st.pos, MARKS[ctx.ws.props.flour_bag.at as MarkId].pos) < 3);
  if ((b.verb === "sneeze" && flourNear) || (b.verb === "take" && b.item === "flour_bag")) {
    addFx(ctx, "flour_cloud", mainStart + 0.3 * mainDur, 2.5, [st.pos[0], 1.0, st.pos[1]]);
  }

  ctx.events.push({ actor: a, verb: b.verb, start: mainStart, dur: mainDur, emote: b.emote, hasLine: !!lineText, sfx: b.sfx, sfxAt, pos: v2(st.pos), main: true });

  const timing: BeatTiming = {
    start: beatStart,
    end: t,
    mainStart,
    mainDur,
    actor: a,
    verb: b.verb,
    from: fromPos,
    to: v2(st.pos),
    hasLine: !!lineText,
    lineStart,
    lineDur,
    walk: walkInfo,
    loud: LOUD_VERBS.has(b.verb) || (!!lineText && isShouted(lineText)) || (b.sfx != null && LOUD_SFX.has(b.sfx)),
    scary: false,
  };
  timing.scary = a === "bear" && (timing.loud || b.emotion === "angry" || b.verb === "chase" || (b.emote != null && BEAR_SCARY_EMOTES.has(b.emote)));
  ctx.timings.push(timing);
  return timing;
}
