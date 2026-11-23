import { isInsideHouse, isInteriorMark, MARKS, sceneLocationAt, SEAT_HEIGHT } from "../../shared/bible/set";
import { COOKING_STATION, cookingSupportHeightAt } from "../../shared/cookingStation";
import { LOCOMOTION_VERBS, SPEEDS } from "../../shared/grammar";
import { HOUSE_COOKING_HELPER, houseLocal, housePickupPosition, houseWorld } from "../../shared/houseLayout";
import { CUPBOARD_JAR_POSITION, HOUSE_DOOR, INTERIOR_APPROACH, INTERIOR_THRESHOLD, KITCHEN_CUPBOARD } from "../../shared/interactiveObjects";
import { avoidHammock, hammockExitPoint, interactionRadius } from "../../shared/physicalInteractions";
import { propPlacementAtMark } from "../../shared/propPlacement";
import type { ActorId, CamKey, Emotion, MarkId, Vec2, Verb } from "../../shared/schema";
import { HEAD_HEIGHT } from "../camera";
import { clampWalkable, pathEndYaw, pathLength, planPath, pointAlong, yawTo } from "../path";
import { isActor, isMark, isProp, otherActor } from "../validate";
import {
  ACTORS,
  type CompileContext,
  dist,
  MAX_LOCO_S,
  nearestMarkWithin,
  posAt,
  pushClip,
  r3,
  record,
  SPREAD_OFFSET,
  standPos,
  v2,
} from "./context";

export function armchairApproach(a: ActorId): Vec2 {
  const seat = MARKS.house_living;
  return [seat.pos[0], seat.pos[1] + (a === "masha" ? 1.02 : 1.45)];
}

/** Getting up from furniture includes leaving its footprint. Keeping the
 * floor root at the seat centre makes a short actor descend through it. */
export function seatExit(
  ctx: CompileContext,
  a: ActorId,
): { from: Vec2; to: Vec2; path: Vec2[]; target: MarkId; facing: number } | null {
  const st = ctx.ws.actors[a];
  const mark = st.mark;
  if (mark === "hammock" && (st.posture === "sleep" || st.posture === "sit") && dist(st.pos, MARKS.hammock.pos) < 1.05) {
    const from = v2(st.pos);
    const candidates = ([1, -1] as const).map((side) => clampWalkable(hammockExitPoint(from, a, side)));
    const clearance = (p: Vec2) =>
      Math.min(
        ...ACTORS.filter((o) => o !== a && ctx.ws.actors[o].posture !== "offstage" && ctx.ws.actors[o].posture !== "carried").flatMap((o) =>
          [0.2, 0.4, 0.6, 0.8, 1].map(
            (k) =>
              dist([from[0] + (p[0] - from[0]) * k, from[1] + (p[1] - from[1]) * k], ctx.ws.actors[o].pos) -
              interactionRadius(o) -
              interactionRadius(a),
          ),
        ),
      );
    const to = candidates.find((p) => clearance(p) > 0.12) ?? candidates.sort((p, q) => clearance(q) - clearance(p))[0];
    return { from, to: [r3(to[0]), r3(to[1])], path: [from, [r3(to[0]), r3(to[1])]], target: mark, facing: yawTo(from, to, st.facing) };
  }
  if (st.posture !== "sit" || !mark || (SEAT_HEIGHT[mark] ?? 0) <= 0.15 || dist(st.pos, MARKS[mark].pos) > 1.05) return null;
  if (mark === "house_living") {
    const from = v2(st.pos);
    const p = houseLocal(from);
    const corner = houseWorld([p[0] + 0.3, p[1] + 0.63]);
    const to = houseWorld([p[0] + 0.65, p[1] + 1.05]);
    return { from, to, path: [from, corner, to], target: mark, facing: yawTo(from, corner, st.facing) };
  }
  const facing = st.facing;
  const distance = 0.65;
  const from = v2(st.pos);
  const to = clampWalkable([r3(from[0] + Math.sin(facing) * distance), r3(from[1] + Math.cos(facing) * distance)]);
  return { from, to, path: [from, to], target: mark, facing };
}

/** Avoid standing on top of another character (partner first, then everyone else). */
export function spread(ctx: CompileContext, a: ActorId, p: Vec2, t: number): Vec2 {
  const o0 = otherActor(a);
  const others = [o0, ...ACTORS.filter((x) => x !== a && x !== o0)];
  let q = p;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const o of others) {
      if (ctx.ws.actors[o].posture === "offstage" || ctx.ws.actors[o].posture === "carried") continue;
      const op = posAt(ctx, o, Math.max(t, ctx.tracks[o].free));
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

/** Where to stand to reach a target. */
export function approachPoint(ctx: CompileContext, a: ActorId, id: string, t: number, gap = 0.9): Vec2 | null {
  if (id === "cupboard" || (isProp(id) && ctx.ws.props[id]?.at === "cupboard")) return [...KITCHEN_CUPBOARD.approach];
  if (id === "house_living" && (a === "masha" || a === "bear") && ctx.ws.actors[a].posture !== "sit") return armchairApproach(a);
  if (isMark(id)) return spread(ctx, a, standPos(id), t);
  if (isActor(id)) {
    const o = posAt(ctx, id, t);
    const me = posAt(ctx, a, t);
    let d: Vec2 = [me[0] - o[0], me[1] - o[1]];
    const l = Math.hypot(d[0], d[1]);
    d = l < 1e-3 ? [1, 0] : [d[0] / l, d[1] / l];
    if (isInsideHouse(...o)) {
      const seated = ctx.ws.actors[id].posture === "sit" && ctx.ws.actors[id].mark === "house_living";
      // The chair pose advances the child's hips over the cushion edge.
      // Root-to-root spacing alone put the server's belly into her face.
      const reachGap = seated ? Math.max(gap, 1.35) : gap;
      const angle = seated ? 0.35 : Math.atan2(d[0], d[1]);
      for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.2, -1.2, Math.PI]) {
        const candidate = clampWalkable([o[0] + Math.sin(angle + turn) * reachGap, o[1] + Math.cos(angle + turn) * reachGap]);
        const path = planPath(me, candidate);
        if (dist(path[path.length - 1], candidate) < 0.03 && dist(candidate, o) < reachGap + 0.25 && dist(candidate, o) > 0.65) return candidate;
      }
    }
    return clampWalkable([o[0] + d[0] * gap, o[1] + d[1] * gap]);
  }
  if (isProp(id)) {
    const at = ctx.ws.props[id]?.at;
    if (at && isMark(at)) {
      if (isInteriorMark(at)) {
        const surface = propPlacementAtMark(id, at).pos;
        const target: Vec2 = [surface[0], surface[2]];
        const me = posAt(ctx, a, t);
        if (a === "masha" && at === "house_kitchen") return housePickupPosition(id);
        if (at === "house_kitchen") {
          const candidate = houseWorld([-2.9, 0.75]);
          const path = planPath(me, candidate);
          if (dist(path[path.length - 1], candidate) < 0.03) return candidate;
        }
        const angle = Math.atan2(me[0] - target[0], me[1] - target[1]);
        for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
          const candidate = clampWalkable([target[0] + Math.sin(angle + turn) * 0.75, target[1] + Math.cos(angle + turn) * 0.75]);
          const path = planPath(me, candidate);
          if (dist(path[path.length - 1], candidate) < 0.03 && dist(candidate, target) < 1.15) return candidate;
        }
      }
      return spread(ctx, a, standPos(at), t);
    }
    if (at && isActor(at) && at !== a) return approachPoint(ctx, a, at, t, gap);
  }
  return null;
}

function speed(a: ActorId, verb: Verb): number {
  const s = SPEEDS[a] as Record<string, number>;
  return s[verb] ?? s.walk_to;
}

/** Add a locomotion clip along a planned path; returns its end time. Updates world state. */
export function locomote(
  ctx: CompileContext,
  a: ActorId,
  t: number,
  verb: Verb,
  dest: Vec2,
  emotion: Emotion,
  target: string | null,
  finalFacing?: number,
  path0?: Vec2[],
  direct = false,
): number {
  const st = ctx.ws.actors[a];
  const from = v2(st.pos);
  if (!direct && isInsideHouse(...from) !== isInsideHouse(...dest)) return throughDoor(ctx, a, t, dest, emotion, target, finalFacing);
  let path = path0 ?? planPath(from, dest);
  if (a === "masha") {
    const supportedFrom = cookingSupportHeightAt(...from) > 0.3;
    const supportedTo = cookingSupportHeightAt(...dest) > 0.3;
    const supportAt = supportedFrom ? from : dest;
    const entry: Vec2 = isInsideHouse(...supportAt)
      ? [...HOUSE_COOKING_HELPER.entry]
      : [COOKING_STATION.position[0], COOKING_STATION.stepBack - 0.25];
    // Mount and leave by the two actual treads, not by popping up/down the
    // tall side of the helper. This also covers leaving to put down the pan.
    if (supportedTo && !supportedFrom) path = [...planPath(from, entry), dest];
    else if (supportedFrom && !supportedTo) path = [from, entry, ...planPath(entry, dest).slice(1)];
  }
  // The hammock remains an obstacle after the interaction ends. Ordinary
  // departure previously bypassed the route used for hugs and approached
  // the yard through its cloth and end branches, especially with a rider.
  path = avoidHammock(path, a, a === "bear" && ctx.ws.actors.masha.posture === "carried" ? 1.2 : 0);
  const len = pathLength(path);
  const fromScene = sceneLocationAt(...from);
  const toScene = sceneLocationAt(...dest);
  const sceneCut = fromScene !== toScene;
  const dur = sceneCut ? 0.9 : len < 0.3 ? 0.6 : Math.min(MAX_LOCO_S, Math.max(len / speed(a, verb), 0.8));
  const yaw = pathEndYaw(path, st.facing);
  pushClip(ctx, a, t, dur, verb, emotion, {
    from,
    to: v2(path[path.length - 1]),
    path: path.map((p) => [r3(p[0]), r3(p[1])] as Vec2),
    facing: r3(yawTo(from, path[1] ?? dest, st.facing)),
    posture: "stand",
    item: st.holding ?? undefined,
    target: target ?? undefined,
    ...(sceneCut ? { sceneCut: true } : {}),
  });
  st.pos = v2(path[path.length - 1]);
  st.facing = r3(finalFacing ?? yaw);
  st.mark = isMark(target) && dist(st.pos, dest) < 0.01 ? target : nearestMarkWithin(st.pos, 1.5);
  record(ctx, a, t + dur);
  // a carried Masha rides along
  if (a === "bear" && ctx.ws.actors.masha.posture === "carried") {
    ctx.ws.actors.masha.pos = v2(st.pos);
    ctx.ws.actors.masha.facing = st.facing;
    ctx.ws.actors.masha.mark = st.mark;
    record(ctx, "masha", t + dur);
  }
  return t + dur;
}

/** Finish a planted turn before any paired contact pose begins. */
export function facePartner(ctx: CompileContext, a: ActorId, t: number, point: Vec2, emotion: Emotion): number {
  const st = ctx.ws.actors[a];
  const previous = ctx.tracks[a].clips.filter((c) => c.start + c.dur <= t + 0.001).at(-1);
  // A semantic mark facing may differ from a walk's actual final tangent.
  const fromYaw = previous && LOCOMOTION_VERBS.includes(previous.verb) && previous.params.path ? pathEndYaw(previous.params.path, st.facing) : st.facing;
  const facing = yawTo(st.pos, point, fromYaw);
  const delta = Math.abs(Math.atan2(Math.sin(facing - fromYaw), Math.cos(facing - fromYaw)));
  if (delta < 0.02) return t;
  // Match the evaluator's in-place turning speed, with a short settled beat.
  const dur = Math.max(0.25, (delta / Math.PI) * 0.7 * (a === "bear" || a === "rival_bear" ? 1.8 : 1) + 0.1);
  pushClip(ctx, a, t, dur, "look_at", emotion, {
    from: v2(st.pos),
    facing,
    posture: st.posture,
    item: st.holding ?? undefined,
    lookAt: [point[0], HEAD_HEIGHT[a] * 0.7, point[1]],
  });
  ctx.events.push({ actor: a, verb: "look_at", start: t, dur, emote: null, hasLine: false, sfx: null, sfxAt: t, pos: v2(st.pos), main: false });
  st.facing = facing;
  record(ctx, a, t + dur);
  return t + dur;
}

export function doorShot(ctx: CompileContext, start: number, end: number, inside: boolean): void {
  if (end <= start) return;
  const key: CamKey = inside
    ? { pos: [-9.6, 2.7, -8.9], look: [-5.6, 1.65, -11], fov: 47, location: "house" }
    : { pos: [-1, 3.5, 3.7], look: [-6, 1.7, -3.7], fov: 40, location: "yard" };
  ctx.doorShots.push({ start, dur: end - start, shot: "medium", from: key, to: key, overridden: true });
}

export function doorAction(ctx: CompileContext, a: ActorId, t: number, to: number, emotion: Emotion): number {
  t = Math.max(t, ctx.doorFree);
  const st = ctx.ws.actors[a];
  const inside = isInsideHouse(...st.pos);
  const approach = inside ? INTERIOR_APPROACH : HOUSE_DOOR.exterior.approach;
  const start = t;
  if (dist(st.pos, approach) > 0.05) t = locomote(ctx, a, t, "walk_to", approach, emotion, null, undefined, undefined, true);
  const centre = inside ? HOUSE_DOOR.interior.center : HOUSE_DOOR.exterior.center;
  t = facePartner(ctx, a, t, centre, emotion);
  const from = ctx.ws.objects?.house_door ?? 0;
  const dur = Math.abs(to - from) > 0.001 ? HOUSE_DOOR.duration : 0.45;
  pushClip(ctx, a, t, dur, to ? "open" : "close", emotion, {
    from: v2(st.pos),
    facing: st.facing,
    posture: "stand",
    item: st.holding ?? undefined,
    target: "door",
    lookAt: [centre[0], 1.5, centre[1]],
  });
  if (Math.abs(to - from) > 0.001) {
    ctx.objectCues.push({ object: "house_door", start: t + 0.2, dur: dur - 0.2, from, to });
    ctx.extraSfx.push({ t: t + 0.25, id: "door_creak", pos: centre });
  }
  ctx.ws.objects = { ...ctx.ws.objects, house_door: to };
  if (!inside) st.mark = "door";
  record(ctx, a, t + dur);
  ctx.doorFree = t + dur;
  doorShot(ctx, start, t + dur, inside);
  return t + dur;
}

export function cupboardShot(ctx: CompileContext, start: number, end: number): void {
  if (end <= start) return;
  const key: CamKey = { pos: [-13.2, 3.7, -14.1], look: [-14.6, 1.9, -11.4], fov: 46, location: "house" };
  ctx.lastCupboardShot = { start, dur: end - start, shot: "medium", from: key, to: key, overridden: true };
  ctx.doorShots.push(ctx.lastCupboardShot);
}

export function cupboardAction(ctx: CompileContext, a: ActorId, t: number, to: number, emotion: Emotion): number {
  t = Math.max(t, ctx.cupboardFree);
  const st = ctx.ws.actors[a];
  if (dist(st.pos, KITCHEN_CUPBOARD.approach) > 0.04) t = locomote(ctx, a, t, "walk_to", [...KITCHEN_CUPBOARD.approach], emotion, "cupboard");
  const start = t;
  t = facePartner(ctx, a, t, [st.pos[0] - 1, st.pos[1]], emotion);
  const from = ctx.ws.objects?.kitchen_cupboard ?? 0;
  const changed = Math.abs(to - from) > 0.001;
  const dur = changed ? KITCHEN_CUPBOARD.duration : 0.5;
  pushClip(ctx, a, t, dur, changed ? (to ? "open" : "close") : "idle", emotion, {
    from: v2(st.pos),
    facing: st.facing,
    posture: "stand",
    item: st.holding ?? undefined,
    target: "cupboard",
    lookAt: CUPBOARD_JAR_POSITION,
    objectFrom: from,
    objectTo: to,
  });
  if (changed) {
    ctx.objectCues.push({ object: "kitchen_cupboard", start: t + 0.35, dur: dur - 0.7, from, to });
    ctx.extraSfx.push({ t: t + 0.35, id: "door_creak", pos: KITCHEN_CUPBOARD.center });
  }
  ctx.ws.objects = { house_door: 0, ...ctx.ws.objects, kitchen_cupboard: to };
  st.mark = "cupboard";
  record(ctx, a, t + dur);
  ctx.cupboardFree = t + dur;
  cupboardShot(ctx, start, t + dur);
  return t + dur;
}

export function throughDoor(
  ctx: CompileContext,
  a: ActorId,
  t: number,
  dest: Vec2,
  emotion: Emotion,
  target: string | null,
  finalFacing?: number,
): number {
  const st = ctx.ws.actors[a];
  const entering = isInsideHouse(...dest);
  const start = Math.max(t, ctx.doorFree);
  t = start;
  const approach = entering ? HOUSE_DOOR.exterior.approach : INTERIOR_APPROACH;
  const threshold = entering ? HOUSE_DOOR.exterior.threshold : INTERIOR_THRESHOLD;
  const arrival = entering ? INTERIOR_THRESHOLD : HOUSE_DOOR.exterior.threshold;
  const exit = entering ? INTERIOR_APPROACH : HOUSE_DOOR.exterior.approach;
  if (dist(st.pos, approach) > 0.05) t = locomote(ctx, a, t, "walk_to", approach, emotion, null, undefined, undefined, true);
  if ((ctx.ws.objects?.house_door ?? 0) < 0.999) t = doorAction(ctx, a, t, 1, emotion);
  t = locomote(ctx, a, t, "walk_to", threshold, emotion, null, undefined, [v2(st.pos), threshold], true);
  const cut = t + 0.05;
  const yaw = entering ? HOUSE_DOOR.interior.yaw : 0;
  pushClip(ctx, a, t, 0.1, "walk_to", emotion, {
    from: threshold,
    to: arrival,
    path: [threshold, arrival],
    facing: st.facing,
    arrivalYaw: yaw,
    posture: "stand",
    item: st.holding ?? undefined,
    sceneCut: true,
    portal: true,
  });
  st.pos = v2(arrival);
  st.facing = yaw;
  st.mark = null;
  record(ctx, a, t + 0.1);
  t += 0.1;
  doorShot(ctx, start, cut, !entering);
  t = locomote(ctx, a, t, "walk_to", exit, emotion, null, yaw, [arrival, exit], true);
  ctx.doorFree = t;
  doorShot(ctx, cut, t, entering);
  return locomote(ctx, a, t, "walk_to", dest, emotion, target, finalFacing, undefined, true);
}

/** Let a serving adult clear the chair before its occupant gets up. */
export function clearChairExit(ctx: CompileContext, a: ActorId, t: number, emotion: Emotion): number {
  const st = ctx.ws.actors[a];
  if (st.posture !== "sit" || st.mark !== "house_living") return t;
  const exit = seatExit(ctx, a);
  if (!exit) return t;
  for (const other of ACTORS) {
    const partner = ctx.ws.actors[other];
    if (other === a || partner.posture !== "stand" || !isInsideHouse(...partner.pos)) continue;
    const radius = interactionRadius(a) + interactionRadius(other) + 0.12;
    const near = Array.from({ length: 15 }, (_, i) => pointAlong(exit.path, (pathLength(exit.path) * i) / 14)).some((p) => dist(p, partner.pos) < radius);
    if (!near) continue;
    const candidates = [
      [2.25, 1.65],
      [2.65, 0.65],
      [1.9, 2.5],
    ]
      .map(houseWorld)
      .filter((p) =>
        ACTORS.every(
          (o) =>
            o === other ||
            o === a ||
            ctx.ws.actors[o].posture === "offstage" ||
            dist(p, ctx.ws.actors[o].pos) > interactionRadius(other) + interactionRadius(o) + 0.15,
        ),
      );
    candidates.sort((p, q) => pathLength(planPath(partner.pos, p)) - pathLength(planPath(partner.pos, q)));
    const destination = candidates.find((p) => dist(planPath(partner.pos, p).at(-1)!, p) < 0.03);
    if (!destination) continue;
    const start = Math.max(t, ctx.tracks[other].free);
    t = locomote(ctx, other, start, "walk_to", destination, emotion, null, yawTo(destination, st.pos));
    ctx.events.push({ actor: other, verb: "walk_to", start, dur: t - start, emote: null, hasLine: false, sfx: null, sfxAt: start, pos: v2(destination), main: false });
  }
  return t;
}

/** A former occupant may still be beside the chair when the next actor
 * backs into it. Move only a free standing participant out of that corridor. */
export function clearChairEntry(ctx: CompileContext, a: ActorId, t: number, emotion: Emotion): number {
  const corridor = [armchairApproach(a), v2(MARKS.house_living.pos)];
  const length = pathLength(corridor);
  for (const other of ACTORS) {
    const partner = ctx.ws.actors[other];
    if (other === a || partner.posture !== "stand" || ctx.tracks[other].free > t + 0.001 || !isInsideHouse(...partner.pos)) continue;
    const clearance = interactionRadius(a) + interactionRadius(other) + 0.18;
    if (!Array.from({ length: 17 }, (_, i) => pointAlong(corridor, (length * i) / 16)).some((p) => dist(p, partner.pos) < clearance)) continue;
    const candidates = [
      [2.25, 1.65],
      [2.65, 0.65],
      [1.9, 2.5],
    ]
      .map(houseWorld)
      .filter((p) =>
        ACTORS.every(
          (o) =>
            o === other ||
            ctx.ws.actors[o].posture === "offstage" ||
            dist(p, ctx.ws.actors[o].pos) > interactionRadius(other) + interactionRadius(o) + 0.15,
        ),
      );
    candidates.sort((p, q) => pathLength(planPath(partner.pos, p)) - pathLength(planPath(partner.pos, q)));
    const destination = candidates.find((p) => {
      const path = planPath(partner.pos, p);
      const distance = pathLength(path);
      if (dist(path.at(-1)!, p) > 0.03) return false;
      return Array.from({ length: 19 }, (_, i) => pointAlong(path, (distance * i) / 18)).every((at) =>
        ACTORS.every((o) => o === other || ctx.ws.actors[o].posture === "offstage" || dist(at, ctx.ws.actors[o].pos) > interactionRadius(other) + interactionRadius(o) + 0.08),
      );
    });
    if (!destination) continue;
    const start = t;
    const from = v2(partner.pos);
    t = locomote(ctx, other, t, "walk_to", destination, emotion, null, yawTo(destination, MARKS.house_living.pos));
    ctx.events.push({ actor: other, verb: "walk_to", start, dur: t - start, emote: null, hasLine: false, sfx: null, sfxAt: start, pos: v2(destination), main: false });
    ctx.preparationCameras.push({
      start,
      dur: t - start,
      actor: other,
      verb: "walk_to",
      shot: "tracking",
      from,
      to: v2(destination),
      hasLine: false,
      lineStart: 0,
      lineDur: 0,
      punchline: false,
      emotion,
    });
  }
  return t;
}
