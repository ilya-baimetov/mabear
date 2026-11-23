import { isInteriorMark } from "../../shared/bible/set";
import { GRAMMAR, LOCOMOTION_VERBS } from "../../shared/grammar";
import type { Beat, MarkId } from "../../shared/schema";
import { isActor } from "../validate";
import {
  CARRIED_OK,
  type CompileContext,
  ENDS_CARRY,
  pushClip,
  record,
  SIT_OK,
  SLEEP_OK,
  v2,
} from "./context";
import { dismount, putAsideBeforeInteriorPickup, putAsideForHug } from "./interactions";
import { clearChairEntry, clearChairExit, seatExit } from "./staging";

export type QueueRepairOutcome = "ready" | "requeue" | "skip";

/** Repairs missing `enter`/`take` prerequisites or invalid cupboard/held-prop targets in the beat queue. */
export function repairBeatInQueue(ctx: CompileContext, queue: Beat[], origIndex: number): QueueRepairOutcome {
  const b = queue[origIndex];
  const a = b.actor;
  const st = ctx.ws.actors[a];

  if (st.posture === "offstage" && b.verb !== "enter") {
    if (b.verb === "exit") {
      ctx.repairs.push(`${a} is already offstage: exit skipped`);
      return "skip";
    }
    const enter: Beat = { ...b, verb: "enter", target: null, item: null, line: null, emote: null, sfx: null, shot: "auto" };
    queue.splice(origIndex, 0, enter);
    b.with_previous = false;
    b.delay_s = 0;
    ctx.repairs.push(`inserted enter: ${a} comes back before "${b.verb}"`);
    return "requeue";
  }

  if ((b.verb === "eat" || b.verb === "give" || b.verb === "throw" || b.verb === "drop") && b.item && st.holding !== b.item) {
    const at = ctx.ws.props[b.item]?.at;
    if (isActor(at) && at !== a) {
      ctx.errors.push(`${a} can't ${b.verb} the ${b.item}: ${at} is holding it`);
      b.verb = "point_at";
      b.target = at;
      b.item = null;
    } else {
      const take: Beat = { ...b, verb: "take", target: b.item, item: b.item, line: null, emote: null, sfx: null, shot: "auto" };
      queue.splice(origIndex, 0, take);
      b.with_previous = false;
      b.delay_s = 0;
      ctx.repairs.push(`inserted take: ${a} picks up the ${b.item} before "${b.verb}"`);
      return "requeue";
    }
  }

  const heldBy = b.verb === "take" && b.item ? ctx.ws.props[b.item]?.at : undefined;
  if (b.verb === "take" && b.item === "pantry_honey" && heldBy === a) {
    ctx.repairs.push("The single cupboard jar is already held; no second jar appears.");
    b.verb = "look_at";
    b.target = "cupboard";
    b.item = null;
  }
  if (b.verb === "take" && b.item === "pantry_honey" && heldBy === "hidden") {
    ctx.repairs.push("The cupboard jar is no longer available; the cupboard does not refill.");
    b.verb = "look_at";
    b.target = "cupboard";
    b.item = null;
  }
  if (a !== "bear" && b.verb === "take" && heldBy === "cupboard") {
    ctx.errors.push("Only Bear can reach the upper cupboard in this release.");
    b.verb = "point_at";
    b.target = "cupboard";
    b.item = null;
  }
  if (b.verb === "take" && b.item && isActor(heldBy) && heldBy !== a) {
    ctx.errors.push(`${a} can't take the ${b.item}: ${heldBy} is holding it`);
    b.verb = "point_at";
    b.target = heldBy;
    b.item = null;
  }

  return "ready";
}

/** Inserts pre-beat posture transitions, hold clearances, and chair-entry/exit clearances. */
export function applyPreBeatRepairs(ctx: CompileContext, b: Beat, t: number): number {
  const a = b.actor;
  const st = ctx.ws.actors[a];

  if (st.posture === "sit" && (b.verb === "stand_up" || !SIT_OK.has(b.verb))) {
    t = clearChairExit(ctx, a, t, b.emotion);
  }

  if (a === "masha" && st.posture === "carried" && !CARRIED_OK.has(b.verb)) t = dismount(ctx, t);
  if (a === "bear" && ctx.ws.actors.masha.posture === "carried" && ENDS_CARRY.has(b.verb)) t = Math.max(t, dismount(ctx, t));
  if (st.posture === "sleep" && !SLEEP_OK.has(b.verb)) {
    const exit = seatExit(ctx, a);
    pushClip(ctx, a, t, GRAMMAR.wake_up.baseDuration, "wake_up", "sleepy", {
      from: v2(st.pos),
      facing: st.facing,
      posture: "stand",
      item: st.holding ?? undefined,
      ...exit,
    });
    ctx.events.push({ actor: a, verb: "wake_up", start: t, dur: GRAMMAR.wake_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
    t += GRAMMAR.wake_up.baseDuration;
    st.posture = "stand";
    if (exit) {
      st.pos = v2(exit.to);
      st.facing = exit.facing;
      st.mark = null;
    }
    record(ctx, a, t);
  }
  if (st.posture === "sit" && b.verb !== "stand_up" && !SIT_OK.has(b.verb)) {
    const exit = seatExit(ctx, a);
    pushClip(ctx, a, t, GRAMMAR.stand_up.baseDuration, "stand_up", b.emotion, {
      from: v2(st.pos),
      facing: st.facing,
      posture: "stand",
      item: st.holding ?? undefined,
      ...exit,
    });
    ctx.events.push({ actor: a, verb: "stand_up", start: t, dur: GRAMMAR.stand_up.baseDuration, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
    t += GRAMMAR.stand_up.baseDuration;
    st.posture = "stand";
    if (exit) {
      st.pos = v2(exit.to);
      st.facing = exit.facing;
      st.mark = null;
    }
    record(ctx, a, t);
  }

  if (b.verb === "hug" && isActor(b.target)) {
    t = putAsideForHug(ctx, a, t, b.emotion);
    t = putAsideForHug(ctx, b.target, t, b.emotion);
  }
  if (b.target === "house_living" && (a === "masha" || a === "bear") && st.posture !== "sit" && (b.verb === "sit" || LOCOMOTION_VERBS.includes(b.verb))) {
    t = clearChairEntry(ctx, a, t, b.emotion);
  }
  if (b.verb === "take" && b.item && st.holding && st.holding !== b.item && isInteriorMark(ctx.ws.props[b.item]?.at)) {
    t = putAsideBeforeInteriorPickup(ctx, a, t, ctx.ws.props[b.item].at === "cupboard" ? "house_kitchen" : (ctx.ws.props[b.item].at as MarkId), b.emotion);
  }

  return t;
}
