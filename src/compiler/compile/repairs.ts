import { isInteriorMark } from "../../shared/bible/set";
import { GRAMMAR, LOCOMOTION_VERBS, VERB_IMPLIED_PROP } from "../../shared/grammar";
import { isKitchenContainer, kitchenContainerApproach } from "../../shared/kitchenContainers";
import { isCarrot, type Beat, type MarkId } from "../../shared/schema";
import { isActor } from "../validate";
import {
  CARRIED_OK,
  type CompileContext,
  ENDS_CARRY,
  nearestMark,
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
export function repairBeatInQueue(ctx: CompileContext, queue: { beat: Beat; orig: number }[], origIndex: number): QueueRepairOutcome {
  const { beat: b, orig } = queue[origIndex];
  const a = b.actor;
  const st = ctx.ws.actors[a];

  if (b.verb === "give" && isActor(b.target) && isCarrot(ctx.ws.actors[b.target].holding) && ctx.ws.actors[b.target].holding !== b.item) {
    ctx.repairs.push("The receiver must put down their carrot before accepting another item.");
    b.verb = "point_at";
    b.item = null;
  }
  if (st.posture === "offstage" && b.verb !== "enter") {
    if (b.verb === "exit") {
      ctx.repairs.push(`${a} is already offstage: exit skipped`);
      return "skip";
    }
    const enter: Beat = { ...b, verb: "enter", target: null, item: null, line: null, emote: null, sfx: null, shot: "auto" };
    queue.splice(origIndex, 0, { beat: enter, orig: -1 });
    b.with_previous = false;
    b.delay_s = 0;
    ctx.repairs.push(`inserted enter: ${a} comes back before "${b.verb}"`);
    return "requeue";
  }
  if (b.item && isCarrot(b.item) && ctx.ws.props[b.item]?.at === "hidden" && ["take", "eat", "give", "throw", "put_down"].includes(b.verb)) {
    ctx.repairs.push(`The ${b.item} has already been eaten; it does not regrow.`);
    b.verb = "look_at";
    b.target = "garden";
    b.item = null;
  }
  if (b.verb === "drop" && b.item && isCarrot(b.item)) {
    b.verb = "put_down";
    b.target = st.mark ?? nearestMark(st.pos);
    ctx.repairs.push("Carrot drop uses a gentle authored placement at the current place; carrots are not simulated rigid bodies.");
  }
  if (b.verb === "put_down" && isCarrot(b.item) && b.target === "bench" && Object.entries(ctx.ws.props).some(([id, p]) => id !== b.item && isCarrot(id) && p.at === "bench")) {
    ctx.repairs.push("The bench carrot slot is occupied. The new carrot stays held; pick up the resting carrot or choose the garden path.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  if (b.verb === "put_down" && (!b.item || !(isCarrot(b.item) || (b.item === "ball" && a === "masha" && b.target === "bench")) || st.holding !== b.item)) {
    ctx.repairs.push("Put down needs the specific carrot (or Masha’s bench ball) in this actor’s hand.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  if (b.verb === "put_down" && !["garden", "bench", "clearing", "table", "kitchen_bowl", "kitchen_pot"].includes(b.target ?? "")) {
    ctx.repairs.push("This carrot can be placed on the garden path, bench, table, clearing, kitchen bowl or pot.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  const container =
    b.verb === "put_down" && isKitchenContainer(b.target)
      ? b.target
      : b.verb === "take" && b.item && isKitchenContainer(ctx.ws.props[b.item]?.at)
        ? ctx.ws.props[b.item].at
        : null;
  if (b.item && isCarrot(b.item) && ctx.ws.props[b.item]?.at === "kitchen_pot" && ["take", "eat", "give", "throw", "drop"].includes(b.verb)) {
    ctx.repairs.push("Bear can put a carrot into the pot, but cannot take it out yet. The carrot stays in the pot.");
    b.verb = "point_at";
    b.target = "kitchen_pot";
    b.item = null;
  }
  if (isKitchenContainer(container) && !kitchenContainerApproach(container, a)) {
    ctx.repairs.push(`${a} cannot safely reach ${container}; the object stays where it is.`);
    b.verb = "point_at";
    b.target = container;
    b.item = null;
  }
  if (b.verb === "put_down" && isKitchenContainer(b.target) && Object.entries(ctx.ws.props).some(([id, p]) => id !== b.item && p.at === b.target)) {
    ctx.repairs.push("This kitchen container already holds a carrot. The new carrot stays held.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  if (b.verb === "nudge" && (a !== "masha" || b.item !== "ball" || b.target !== "bench" || ctx.ws.props.ball?.at !== "bench" || st.holding)) {
    ctx.repairs.push("Nudge needs Masha’s free hand and the ball resting on the bench.");
    b.verb = "look_at";
    b.target = "bench";
    b.item = null;
  }
  if (b.item && isCarrot(b.item) && st.holding && st.holding !== b.item && ["eat", "give", "throw", "drop"].includes(b.verb)) {
    ctx.repairs.push("The actor needs a free hand before acquiring this carrot. The held item stays in the hand.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  if (b.item && ["eat", "give", "throw", "drop"].includes(b.verb) && st.holding !== b.item) {
    const at = ctx.ws.props[b.item]?.at;
    if ((at === "cupboard" && a !== "bear") || (b.item === "pantry_honey" && at === "hidden")) {
      ctx.repairs.push("This item is unavailable to the actor; do not repeatedly insert an impossible pickup.");
      b.verb = "point_at";
      b.target = "cupboard";
      b.item = null;
    }
  }
  if ((b.verb === "eat" || b.verb === "give" || b.verb === "throw" || b.verb === "drop") && b.item && st.holding !== b.item) {
    const at = ctx.ws.props[b.item]?.at;
    if (isActor(at) && at !== a) {
      ctx.errors.push(`${a} can't ${b.verb} the ${b.item}: ${at} is holding it`);
      b.verb = "point_at";
      b.target = at;
      b.item = null;
    } else {
      const key = JSON.stringify([orig, a, b.verb, b.item, st.holding, ctx.ws.props[b.item], st.posture, st.mark]);
      if (ctx.attemptedPickups.has(key)) {
        ctx.repairs.push(`Unable to acquire ${b.item} for ${b.verb}; the prerequisite made no progress and will not repeat.`);
        b.verb = "shrug";
        b.target = null;
        b.item = null;
      } else {
        ctx.attemptedPickups.add(key);
        const take: Beat = { ...b, verb: "take", target: b.item, item: b.item, line: null, emote: null, sfx: null, shot: "auto" };
        queue.splice(origIndex, 0, { beat: take, orig: -1 });
        b.with_previous = false;
        b.delay_s = 0;
        ctx.repairs.push(`inserted take: ${a} picks up the ${b.item} before "${b.verb}"`);
        return "requeue";
      }
    }
  }

  const heldBy = b.verb === "take" && b.item ? ctx.ws.props[b.item]?.at : undefined;
  if (b.verb === "take" && b.item && isCarrot(b.item) && st.holding && st.holding !== b.item) {
    ctx.repairs.push("The actor needs a free hand: put down or give the held item before picking another carrot.");
    b.verb = "shrug";
    b.target = null;
    b.item = null;
  }
  if (b.verb === "take" && b.item && isCarrot(b.item) && heldBy === a) {
    ctx.repairs.push("This carrot is already held.");
    b.verb = "look_at";
    b.target = "garden";
    b.item = null;
  }
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
  if (
    st.holding &&
    isCarrot(st.holding) &&
    ((b.verb === "take" && b.item && b.item !== st.holding) || (VERB_IMPLIED_PROP[b.verb] && VERB_IMPLIED_PROP[b.verb] !== st.holding))
  ) {
    t = putAsideForHug(ctx, a, t, b.emotion);
  }
  if (b.verb === "take" && b.item && st.holding && st.holding !== b.item && isInteriorMark(ctx.ws.props[b.item]?.at)) {
    t = putAsideBeforeInteriorPickup(ctx, a, t, ctx.ws.props[b.item].at === "cupboard" ? "house_kitchen" : (ctx.ws.props[b.item].at as MarkId), b.emotion);
  }

  return t;
}
