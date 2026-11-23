import { isInsideHouse, MARKS } from "../../shared/bible/set";
import { CHARACTER_REACH } from "../../shared/characterReach";
import { GRAMMAR } from "../../shared/grammar";
import { housePickupPosition, houseWorld } from "../../shared/houseLayout";
import { avoidHammock, hammockExitPoint, hugSpacing, interactionRadius } from "../../shared/physicalInteractions";
import { PROP_CONTACTS } from "../../shared/propContacts";
import { propGripWorld, propPlacementAtMark } from "../../shared/propPlacement";
import type { ActorId, Emotion, MarkId, Vec2 } from "../../shared/schema";
import { clampWalkable, pathLength, planPath, yawTo } from "../path";
import {
  ACTORS,
  type CompileContext,
  dist,
  nearestMark,
  nearestMarkWithin,
  posAt,
  pushClip,
  record,
  v2,
} from "./context";
import { approachPoint, facePartner, locomote, seatExit } from "./staging";

/** A static-obstacle clamp can otherwise push an approach point back into
 * the partner's belly. Search around the partner while retaining body room. */
export function hugApproach(ctx: CompileContext, a: ActorId, partner: ActorId, t: number): Vec2 {
  const centre = posAt(ctx, partner, t);
  const me = v2(ctx.ws.actors[a].pos);
  const gap = hugSpacing(a, partner, ctx.ws.actors[partner].posture === "sit");
  const angle = Math.atan2(me[0] - centre[0], me[1] - centre[1]);
  for (const extra of [0, 0.15, 0.3]) {
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9, Math.PI]) {
      const p = clampWalkable([centre[0] + Math.sin(angle + turn) * (gap + extra), centre[1] + Math.cos(angle + turn) * (gap + extra)]);
      if (
        dist(p, centre) >= gap - 0.005 &&
        dist(p, centre) <= gap + extra + 0.025 &&
        ACTORS.every(
          (o) =>
            o === a ||
            o === partner ||
            ctx.ws.actors[o].posture === "offstage" ||
            ctx.ws.actors[o].posture === "carried" ||
            dist(p, posAt(ctx, o, t)) >= interactionRadius(a) + interactionRadius(o) + 0.08,
        )
      ) {
        return p;
      }
    }
  }
  const p = approachPoint(ctx, a, partner, t, gap + 0.5)!;
  if (dist(p, centre) >= gap - 0.005) return p;
  return [centre[0] + Math.sin(angle + Math.PI) * (gap + 0.5), centre[1] + Math.cos(angle + Math.PI) * (gap + 0.5)];
}

/** Clear the outdoor table area before making a standing partner the focus of a hug. */
export function clearTableForHug(ctx: CompileContext, partner: ActorId, t: number, emotion: Emotion): number {
  if (ctx.tracks[partner].free > t + 1e-6 || ctx.ws.actors[partner].posture !== "stand") return t;
  const p = ctx.ws.actors[partner].pos;
  const table = MARKS.table.pos;
  // Clear the tabletop and both benches before making a small child the
  // focus of a paired action. Move the partner's actual track/root first.
  if (dist(p, table) < 2.5 && !isInsideHouse(...p)) {
    const d = Math.max(0.001, dist(p, table));
    const destination = clampWalkable([table[0] + ((p[0] - table[0]) / d) * 2.6, table[1] + ((p[1] - table[1]) / d) * 2.6]);
    const start = t;
    t = locomote(ctx, partner, t, "walk_to", destination, emotion, null);
    ctx.events.push({ actor: partner, verb: "walk_to", start, dur: t - start, emote: null, hasLine: false, sfx: null, sfxAt: start, pos: v2(destination), main: false });
  }
  return t;
}

/** Keep a seated participant on its support while visibly freeing the paw.
 * This uses the same reverse pickup/contact path as putting a cooking prop away. */
export function putAsideForHug(ctx: CompileContext, a: ActorId, t: number, emotion: Emotion): number {
  const st = ctx.ws.actors[a];
  const item = st.holding;
  if (!item) return t;
  const mark = st.mark ?? nearestMark(st.pos);
  const placement = propPlacementAtMark(item, mark);
  const grip = propGripWorld(placement.pos, placement.rot, PROP_CONTACTS[item].point);
  if (st.posture === "stand" && dist(st.pos, [grip[0], grip[2]]) > CHARACTER_REACH[a].length + 0.35) {
    const destination = approachPoint(ctx, a, mark, t);
    if (destination) t = locomote(ctx, a, t, "walk_to", destination, emotion, mark);
  }
  t = facePartner(ctx, a, t, [grip[0], grip[2]], emotion);
  const dur = 1;
  pushClip(ctx, a, t, dur, "take", emotion, { from: v2(st.pos), facing: st.facing, posture: st.posture, item, putDown: mark, lookAt: grip });
  ctx.events.push({ actor: a, verb: "take", start: t, dur, emote: null, hasLine: false, sfx: null, sfxAt: t + 0.5, pos: v2(st.pos), main: false });
  ctx.ws.props[item] = { at: mark };
  st.holding = null;
  record(ctx, a, t + dur);
  return t + dur;
}

/** A hand cannot reach a second prop while its socket still carries the
 * first. Finish a visible, supported placement before planning the pickup. */
export function putAsideBeforeInteriorPickup(ctx: CompileContext, a: ActorId, t: number, mark: MarkId, emotion: Emotion): number {
  const st = ctx.ws.actors[a];
  const item = st.holding;
  if (!item) return t;
  const start = t;
  const from = v2(st.pos);
  let contactStart = start;
  const finish = (end: number) => {
    if (contactStart > start) {
      ctx.preparationCameras.push({
        start,
        dur: contactStart - start,
        actor: a,
        verb: "walk_to",
        shot: "tracking",
        from,
        to: v2(st.pos),
        hasLine: false,
        lineStart: 0,
        lineDur: 0,
        punchline: false,
        emotion,
      });
    }
    ctx.preparationCameras.push({
      start: contactStart,
      dur: end - contactStart,
      actor: a,
      verb: "take",
      shot: "medium",
      from: v2(st.pos),
      to: v2(st.pos),
      hasLine: false,
      lineStart: 0,
      lineDur: 0,
      punchline: false,
      emotion,
    });
    return end;
  };
  if (mark !== "house_kitchen") return finish(putAsideForHug(ctx, a, t, emotion));
  const placement = propPlacementAtMark(item, mark);
  const grip = propGripWorld(placement.pos, placement.rot, PROP_CONTACTS[item].point);
  const destination = a === "masha" ? housePickupPosition(item) : houseWorld(item === "frying_pan" ? [-3, 3.0] : [-2.9, 0.75]);
  if (dist(st.pos, destination) > 0.04) {
    const start0 = t;
    t = locomote(ctx, a, t, "walk_to", destination, emotion, mark);
    ctx.events.push({ actor: a, verb: "walk_to", start: start0, dur: t - start0, emote: null, hasLine: false, sfx: null, sfxAt: start0, pos: v2(st.pos), main: false });
  }
  t = facePartner(ctx, a, t, [grip[0], grip[2]], emotion);
  contactStart = t;
  const dur = 1;
  pushClip(ctx, a, t, dur, "take", emotion, { from: v2(st.pos), facing: st.facing, posture: st.posture, item, putDown: mark, lookAt: grip });
  ctx.events.push({ actor: a, verb: "take", start: t, dur, emote: null, hasLine: false, sfx: null, sfxAt: t + 0.5, pos: v2(st.pos), main: false });
  ctx.ws.props[item] = { at: mark };
  st.holding = null;
  record(ctx, a, t + dur);
  return finish(t + dur);
}

/** Free both hands before applause. A visible reverse pickup preserves the
 * prop in world state, so it can be picked up again in a later paragraph. */
export function putAsideBeforeClap(ctx: CompileContext, a: ActorId, t: number, emotion: Emotion): number {
  const st = ctx.ws.actors[a];
  if (!st.holding || st.posture === "carried") return t;
  const item = st.holding;
  const reach = CHARACTER_REACH[a];
  const small = reach.shoulder[1] < 0.9;
  const tiny = reach.shoulder[1] < 0.45;
  const inside = isInsideHouse(...st.pos);
  const mark: MarkId = tiny ? "clearing" : inside ? (small ? "house_living" : "house_kitchen") : small ? "bench" : "table";
  const placement = propPlacementAtMark(item, mark);
  const grip = propGripWorld(placement.pos, placement.rot, PROP_CONTACTS[item].point);
  if (st.posture === "sit") {
    const exit = seatExit(ctx, a);
    pushClip(ctx, a, t, GRAMMAR.stand_up.baseDuration, "stand_up", emotion, { from: v2(st.pos), facing: st.facing, posture: "stand", item, ...exit });
    if (exit) st.pos = v2(exit.to);
    st.posture = "stand";
    st.mark = null;
    t += GRAMMAR.stand_up.baseDuration;
    record(ctx, a, t);
  }
  // Approach the actual rotated grip, on furniture the rig can reach.
  // Short actors use the bench instead of the tall table; shoulder offset
  // keeps a broad Bear from aiming the right paw at his chest centre.
  let yaw = 0;
  if (mark === "bench") yaw = grip[2] >= MARKS.bench.pos[1] ? Math.PI : 0;
  else if (mark === "table") yaw = yawTo([grip[0], grip[2]], MARKS.table.pos, Math.PI);
  else if (mark === "clearing") yaw = yawTo(st.pos, [grip[0], grip[2]], st.facing);
  const lead = small ? 0.07 + reach.length * 0.1 : reach.length * 0.28;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let dest: Vec2 = [grip[0] - c * reach.shoulder[0] - s * (reach.shoulder[2] + lead), grip[2] + s * reach.shoulder[0] - c * (reach.shoulder[2] + lead)];
  if (mark === "bench") dest[1] = yaw === 0 ? Math.min(dest[1], 2.75) : Math.max(dest[1], 3.25);
  if (mark === "table") {
    const centre = MARKS.table.pos;
    const dx = dest[0] - centre[0];
    const dz = dest[1] - centre[1];
    const length = Math.hypot(dx, dz);
    const clearance = 0.82 + Math.abs(reach.shoulder[0]) * 0.75;
    if (length < clearance) dest = [centre[0] + (dx / Math.max(length, 0.001)) * clearance, centre[1] + (dz / Math.max(length, 0.001)) * clearance];
  } else if (!inside) dest = clampWalkable(dest);
  const s0 = t;
  if (dist(st.pos, dest) > 0.04) {
    t = locomote(ctx, a, t, "walk_to", dest, emotion, mark, yaw);
    ctx.events.push({ actor: a, verb: "walk_to", start: s0, dur: t - s0, emote: null, hasLine: false, sfx: null, sfxAt: s0, pos: v2(st.pos), main: false });
  }
  st.facing = yaw;
  pushClip(ctx, a, t, 0.8, "take", emotion, { from: v2(st.pos), facing: st.facing, posture: st.posture, item, putDown: mark, lookAt: grip });
  ctx.ws.props[item] = { at: mark };
  st.holding = null;
  t += 0.8;
  record(ctx, a, t);
  return t;
}

/** Hops Masha down from Bear's shoulders at time t. */
export function dismount(ctx: CompileContext, t: number): number {
  const m = ctx.ws.actors.masha;
  const b = ctx.ws.actors.bear;
  const start = Math.max(t, ctx.tracks.masha.free);
  const side: Vec2 = [Math.cos(b.facing), -Math.sin(b.facing)];
  const to = clampWalkable([b.pos[0] + side[0] * 0.9, b.pos[1] + side[1] * 0.9]);
  pushClip(ctx, "masha", start, 0.8, "jump", "happy", {
    from: v2(b.pos),
    to,
    path: [v2(b.pos), to],
    facing: b.facing,
    posture: "stand",
    item: m.holding ?? undefined,
    target: "bear",
  });
  m.posture = "stand";
  m.pos = to;
  m.facing = b.facing;
  m.mark = nearestMarkWithin(to, 1.5);
  record(ctx, "masha", start + 0.8);
  ctx.repairs.push("Masha hops down from Bear's shoulders");
  return start + 0.8;
}

/** Picks the shorter side approach beside the hammock without crossing its cloth or trunks. */
export function hammockSleepApproach(ctx: CompileContext, a: ActorId): Vec2 {
  const st = ctx.ws.actors[a];
  const points = ([1, -1] as const).map((side) => clampWalkable(hammockExitPoint(MARKS.hammock.pos, a, side)));
  points.sort((p, q) => pathLength(avoidHammock(planPath(st.pos, p), a)) - pathLength(avoidHammock(planPath(st.pos, q), a)));
  return points[0];
}
