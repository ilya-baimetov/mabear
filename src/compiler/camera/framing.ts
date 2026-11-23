import { isInsideHouse, MARKS, sceneLocationAt, type MarkDef } from "../../shared/bible/set";
import { HOUSE_LIVING_MARK, houseWorld } from "../../shared/houseLayout";
import { clamp, lerp, lerp3, smooth } from "../../shared/math";
import { ACTOR_IDS, type ActorId, type CamKey, type CameraCue, type Shot, type Vec2, type Vec3 } from "../../shared/schema";
import {
  actorOcclusionCost,
  CAMERA_BODY_RADIUS,
  type CameraActorVolume,
  type CameraBeatInfo,
  type CameraPlanInput,
  type CameraTarget,
  CHEST,
  clampCam,
  dist,
  HEAD_HEIGHT,
  type Kind,
  LEADS,
  norm,
  occlusionCost,
  type Proposal,
  r3,
  rot,
} from "./occlusion";

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nearest mark cluster for a position. */
export function clusterAt(p: Vec2): MarkDef["cluster"] {
  let best: MarkDef | null = null;
  let bd = Infinity;
  for (const m of Object.values(MARKS)) {
    const dd = Math.hypot(m.pos[0] - p[0], m.pos[1] - p[1]);
    if (dd < bd) {
      bd = dd;
      best = m;
    }
  }
  return best ? best.cluster : "yard";
}

function shotName(k: Kind): Shot {
  if (k === "two") return "medium";
  return k;
}

/** Unit perpendicular to the masha→bear line on the side the default camera (+z) is on. */
export function lineSide(m: Vec2, b: Vec2): Vec2 {
  const l = [b[0] - m[0], b[1] - m[1]] as Vec2;
  if (Math.hypot(l[0], l[1]) < 0.5 || Math.hypot(l[0], l[1]) > 16) return [0, 1];
  const p = norm([-l[1], l[0]]);
  return p[1] >= 0 ? p : [-p[0], -p[1]];
}

/** Perpendicular to the current masha→bear line, on the same side as the previous shot. */
export function continueSide(m: Vec2, b: Vec2, prev: Vec2): Vec2 {
  const l: Vec2 = [b[0] - m[0], b[1] - m[1]];
  const len = Math.hypot(l[0], l[1]);
  if (len < 0.5 || len > 16) return prev;
  const p = norm([-l[1], l[0]]);
  return p[0] * prev[0] + p[1] * prev[1] >= 0 ? p : [-p[0], -p[1]];
}

/** Centre and span (max pairwise distance) of the visible members of a cast at time t. */
function castSpread(
  cast: ActorId[],
  t: number,
  posAt: CameraPlanInput["posAt"],
  visibleAt: CameraPlanInput["visibleAt"],
): { mid: Vec2 | null; span: number } {
  const ps = cast.filter((a) => visibleAt(a, t)).map((a) => posAt(a, t));
  if (!ps.length) return { mid: null, span: 0 };
  let span = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) span = Math.max(span, dist(ps[i], ps[j]));
  const mid: Vec2 = [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  return { mid, span };
}

function followTargets(subj: ActorId, t0: number, t1: number, posAt: CameraPlanInput["posAt"]): [Vec2, Vec2] {
  const p0 = posAt(subj, t0);
  const p1 = posAt(subj, t1);
  if (dist(p0, p1) < 0.5) return [p0, p0];
  const pm = posAt(subj, (t0 + t1) / 2);
  const cands: [Vec2, Vec2][] = [
    [p0, p1],
    [p1, p1],
    [p0, p0],
    [pm, p1],
    [p0, pm],
    [pm, pm],
  ];
  let best = cands[0];
  let bestErr = Infinity;
  for (const [a, b] of cands) {
    let err = 0;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const e = smooth(u);
      const q = posAt(subj, t0 + (t1 - t0) * u);
      err += Math.hypot(a[0] + (b[0] - a[0]) * e - q[0], a[1] + (b[1] - a[1]) * e - q[1]);
    }
    if (err < bestErr - 1e-6) {
      bestErr = err;
      best = [a, b];
    }
  }
  return best;
}

/** Direction from subject to camera for single shots: 3/4 front of the subject, on the 180° side. */
function faceDir(sp: Vec2, op: Vec2, dir: Vec2, side: Vec2): Vec2 {
  const towardOther = norm([op[0] - sp[0], op[1] - sp[1]]);
  if (dist(sp, op) > 12) return dir;
  const v = norm([dir[0] * 0.75 + towardOther[0] * 0.55, dir[1] * 0.75 + towardOther[1] * 0.55]);
  return v[0] * side[0] + v[1] * side[1] < 0.1 ? dir : v;
}

function key(target: Vec2, dir: Vec2, d: number, h: number, lookY: number, fov: number): CamKey {
  const pos = clampCam([target[0] + dir[0] * d, h, target[1] + dir[1] * d]);
  return { pos, look: [r3(target[0]), r3(lookY), r3(target[1])], fov };
}

export function framing(
  kind: Kind,
  subject: ActorId | null,
  cast: ActorId[],
  t0: number,
  t1: number,
  angle: number,
  side: Vec2,
  posAt: CameraPlanInput["posAt"],
  visibleAt: CameraPlanInput["visibleAt"],
  rnd: () => number,
  headY?: CameraPlanInput["headY"],
  facingAt?: CameraPlanInput["facingAt"],
  furnitureAction = false,
): { from: CamKey; to: CamKey } {
  const c0 = castSpread(cast, t0, posAt, visibleAt);
  const mid: Vec2 = c0.mid ?? [0, 0];
  const firstVisible = cast.find((a) => visibleAt(a, t0)) ?? (visibleAt("masha", t0) ? "masha" : "bear");
  const subj = subject ?? firstVisible;
  let sp: Vec2 = posAt(subj, t0);
  // a subject that moves during a single shot is followed: pick the (from, to) look targets that keep the eased
  // camera closest to the subject over the shot (static at the start, static at the end, or a follow dolly)
  const [spA, sp1] = followTargets(subj, t0, t1, posAt);
  sp = spA;
  const hy0 = headY ? headY(subj, t0) : HEAD_HEIGHT[subj];
  const hy1 = headY ? headY(subj, t1) : HEAD_HEIGHT[subj];
  if (isInsideHouse(sp[0], sp[1]) && isInsideHouse(sp1[0], sp1[1])) {
    // The connected kitchen and reading area are a single stage. Compose from
    // its open south side, using the actual participants rather than the old
    // rectangular room's fixed centre. A small orbit clears foreground actors
    // while retaining the fireplace/return as the scene's geographic anchor.
    const wide = kind === "wide" || kind === "two";
    const establishing = kind === "wide";
    const portrait = kind === "close";
    const indoorKey = (p: Vec2, h: number, t: number): CamKey => {
      if (furnitureAction) {
        // The actor leaves the cushion during the stand-up. Keep the complete
        // exit visible and follow the evaluated root, not the now-empty chair.
        return { pos: [r3(p[0] - 0.65), 2.35, r3(p[1] + 4.4)], look: [r3(p[0]), 0.9, r3(p[1])], fov: 44, location: "house" };
      }
      const readingCast = ACTOR_IDS.filter((a) => visibleAt(a, t) && dist(posAt(a, t), HOUSE_LIVING_MARK) < 2.1);
      if (!establishing && dist(p, HOUSE_LIVING_MARK) < 2.1 && readingCast.length >= 2 && readingCast.some((a) => dist(posAt(a, t), HOUSE_LIVING_MARK) < 0.25)) {
        // Verified against the actual seated child and broad serving Bear:
        // their root midpoint with this west/front view exposes both faces and
        // the plate. A near-side close-up otherwise looks into Masha's hood.
        const points = readingCast.map((a) => posAt(a, t));
        const x = points.reduce((sum, pt) => sum + pt[0], 0) / points.length;
        const z = points.reduce((sum, pt) => sum + pt[1], 0) / points.length;
        return { pos: [r3(x - 3), 2.4, r3(z + 1.7)], look: [r3(x), 1.1, r3(z)], fov: 42, location: "house" };
      }
      const occupants = cast
        .filter((a) => visibleAt(a, t) && isInsideHouse(...posAt(a, t)))
        .map((a) => ({
          p: posAt(a, t),
          height: headY ? headY(a, t) : HEAD_HEIGHT[a],
          radius: CAMERA_BODY_RADIUS[a],
        }));
      const minX = wide && occupants.length ? Math.min(...occupants.map((a) => a.p[0] - a.radius)) : p[0] - 0.4;
      const maxX = wide && occupants.length ? Math.max(...occupants.map((a) => a.p[0] + a.radius)) : p[0] + 0.4;
      const roomCentre = houseWorld([-1.55, 0.35]);
      const x = establishing ? roomCentre[0] : (minX + maxX) / 2;
      const z = establishing
        ? roomCentre[1]
        : wide && occupants.length
          ? (Math.min(...occupants.map((a) => a.p[1])) + Math.max(...occupants.map((a) => a.p[1]))) / 2
          : p[1];
      const tallest = wide && occupants.length ? Math.max(...occupants.map((a) => a.height)) : h;
      const lookY = portrait ? h * 0.88 : wide ? Math.max(0.9, tallest * 0.52) : h * 0.65;
      const fov = wide ? 49 : portrait ? 35 : 42;
      const span = maxX - minX;
      const depthSpan = wide && occupants.length ? Math.max(...occupants.map((a) => Math.abs(a.p[1] - z))) : 0;
      const d = establishing
        ? 7.0
        : wide
          ? Math.max(4.4, (span / (2 * Math.tan((fov * Math.PI) / 360) * (16 / 9))) * 1.28 + depthSpan)
          : portrait
            ? Math.max(1.8, h * 1.65)
            : Math.max(3.1, h * 2.1);
      const heading = facingAt ? facingAt(subj, t) : 0;
      const westFacing = Math.sin(heading) < -0.45;
      const northFacing = Math.cos(heading) < -0.45;
      const baseOrbit = establishing ? -0.23 : westFacing ? -1.25 : northFacing ? -1.1 : -0.15;
      const orbit = clamp(baseOrbit + clamp(angle, wide ? -0.55 : -1.3, wide ? 0.55 : 1.3) * (wide ? 0.35 : 0.9), -1.4, 1.4);
      const eyeY = Math.min(3.05, lookY + (establishing ? 1.8 : wide ? 1.45 : westFacing ? 1.65 : portrait ? 0.35 : 0.7));
      return { pos: [r3(x + Math.sin(orbit) * d + 0.2), r3(eyeY), r3(z + Math.cos(orbit) * d)], look: [r3(x), r3(lookY), r3(z)], fov, location: "house" };
    };
    return { from: indoorKey(sp, hy0, t0), to: indoorKey(sp1, hy1, t1) };
  }
  const partner: ActorId = subj === "wolf_a" ? "wolf_b" : subj === "wolf_b" ? "wolf_a" : ["masha", "lady_bear", "rival_bear"].includes(subj) ? "bear" : "masha";
  const large = HEAD_HEIGHT[subj] > 1.75;
  const small = ["hare", "rosie", "squirrel"].includes(subj);
  const op = posAt(partner, t0);
  // The wolves stand along the ambulance's west side. Frame group shots from
  // that open side: the usual south view stacks the pair and hides one wolf.
  const sceneSide: Vec2 = sceneLocationAt(sp[0], sp[1]) === "wolves" && (kind === "wide" || kind === "two") ? norm([-0.9, 0.44]) : side;
  const dir = rot(sceneSide, angle);
  const heading = facingAt ? facingAt(subj, t0 + 0.01) : null;
  let portraitDir = heading === null ? faceDir(sp, op, dir, side) : rot([Math.sin(heading), Math.cos(heading)], angle);
  const nearbyCast = ACTOR_IDS.filter((a) => visibleAt(a, t0) && sceneLocationAt(...posAt(a, t0)) === sceneLocationAt(...sp) && dist(sp, posAt(a, t0)) < 6);
  if (heading !== null && visibleAt(partner, t0) && dist(sp, op) < 8 && nearbyCast.length <= 2) {
    const otherDirection = norm([op[0] - sp[0], op[1] - sp[1]]);
    const towardPartner = Math.sin(heading) * otherDirection[0] + Math.cos(heading) * otherDirection[1];
    // Preserve the established side for exchanges. A solo action facing water,
    // furniture or its own prop has a different axis from the lead-pair eyeline.
    if (towardPartner > 0.45 && portraitDir[0] * side[0] + portraitDir[1] * side[1] < 0.2) {
      const along = portraitDir[0] * otherDirection[0] + portraitDir[1] * otherDirection[1];
      portraitDir = norm([otherDirection[0] * Math.max(0.3, along) + side[0] * 0.32, otherDirection[1] * Math.max(0.3, along) + side[1] * 0.32]);
    }
  }

  let from: CamKey;
  let to: CamKey;
  switch (kind) {
    case "wide": {
      const c1 = castSpread(cast, t1, posAt, visibleAt);
      const mid1 = c1.mid ?? mid;
      const span = Math.max(c0.span, c1.span);
      // Establish the place at character height; avoid a distant, lawn-heavy aerial view.
      const d = 7.4 + Math.min(14, span * 0.8);
      const eyeY = 3.2 + Math.min(2.8, span * 0.08);
      from = key(mid, dir, d, eyeY, 1.0, 44);
      to = key(dist(mid, mid1) > 0.5 ? mid1 : mid, dir, d * 0.94, eyeY - 0.1, 1.0, 44);
      break;
    }
    case "two": {
      // follows the pair's midpoint when they move during the shot
      const c1 = castSpread(cast, t1, posAt, visibleAt);
      const mid1: Vec2 = c1.mid ?? mid;
      const span = Math.max(c0.span, c1.span);
      const highAt = (t: number) => Math.max(0.85, ...cast.filter((a) => visibleAt(a, t)).map((a) => (headY ? headY(a, t) : HEAD_HEIGHT[a])));
      const high0 = highAt(t0);
      const high1 = highAt(t1);
      const d = Math.max(3.2, Math.max(high0, high1) * 2.25, span * (furnitureAction ? 0.9 : 1.3) + 2.8);
      from = key(mid, dir, d, high0 * 0.97, high0 * 0.54, 45);
      to = key(dist(mid, mid1) > 0.2 ? mid1 : mid, dir, d * 0.95, high1 * 0.97, high1 * 0.54, 45);
      break;
    }
    case "medium": {
      const d = large ? 5.6 : small ? Math.max(1.8, HEAD_HEIGHT[subj] * 3.8) : 4.0;
      const dd = portraitDir;
      const cy = hy0 - (HEAD_HEIGHT[subj] - CHEST[subj]);
      const cy1 = hy1 - (HEAD_HEIGHT[subj] - CHEST[subj]);
      from = key(sp, dd, d, cy + 0.9, cy, 40);
      to = key(sp1, dd, d * 0.93, cy1 + 0.85, cy1, 40);
      break;
    }
    case "close": {
      const d = large ? 3.6 : small ? Math.max(0.9, HEAD_HEIGHT[subj] * 1.7) : 2.5;
      const dd = portraitDir;
      from = key(sp, dd, d, hy0 + 0.1, hy0 - 0.05, 35);
      to = key(sp1, dd, d * 0.92, hy1 + 0.1, hy1 - 0.05, 35);
      break;
    }
    case "low_angle": {
      const d = subj === "bear" ? 4.2 : 3.0;
      const dd = portraitDir;
      from = key(sp, dd, d, 0.35, hy0, 50);
      to = key(sp1, dd, d * 0.92, 0.4, hy1, 50);
      break;
    }
    case "over_shoulder": {
      const back = norm([op[0] - sp[0], op[1] - sp[1]]);
      const o: ActorId = partner;
      // lateral offset varies with the (occlusion-nudged) angle but never crosses the 180° line
      const lat = Math.max(0.45, 0.85 + angle * 1.35);
      const pos: Vec2 = [op[0] + back[0] * (1.2 + Math.abs(angle) * 0.4) + side[0] * lat, op[1] + back[1] * (1.2 + Math.abs(angle) * 0.4) + side[1] * lat];
      const h = headY ? headY(o, t0) : HEAD_HEIGHT[o];
      from = { pos: clampCam([pos[0], h, pos[1]]), look: [sp[0], hy0 * 0.94, sp[1]], fov: 40 };
      to = { pos: clampCam([pos[0] - back[0] * 0.15, h, pos[1] - back[1] * 0.15]), look: from.look, fov: 40 };
      break;
    }
    case "tracking": {
      const p1 = posAt(subj, t1);
      const mvDir = norm([p1[0] - sp[0], p1[1] - sp[1]]);
      let perp: Vec2 = [-mvDir[1], mvDir[0]];
      if (perp[0] * side[0] + perp[1] * side[1] < 0) perp = [-perp[0], -perp[1]];
      const dd = rot(norm([perp[0] * 0.85 - mvDir[0] * 0.35, perp[1] * 0.85 - mvDir[1] * 0.35]), angle);
      const d = subj === "bear" ? 7 : 5.5;
      from = key(sp, dd, d, 2.4, CHEST[subj], 45);
      to = key(p1, dd, d, 2.4, CHEST[subj], 45);
      break;
    }
  }
  void rnd;
  return { from, to };
}

export interface ShotResolveContext {
  beats: CameraBeatInfo[];
  posAt: CameraPlanInput["posAt"];
  visibleAt: CameraPlanInput["visibleAt"];
  headY?: CameraPlanInput["headY"];
  facingAt?: CameraPlanInput["facingAt"];
  carriedByAt?: CameraPlanInput["carriedByAt"];
  rnd: () => number;
  mounting: (b: CameraBeatInfo) => boolean;
}

/** Places a single cut's camera keys with occlusion avoidance, fallback shot types, and cross-location bisection. */
export function resolveShotCue(s: Proposal & { end: number }, side: Vec2, rc: ShotResolveContext): CameraCue {
  const { beats, posAt, visibleAt, headY, facingAt, carriedByAt, rnd, mounting } = rc;
  const angle = (rnd() - 0.5) * (s.kind === "wide" ? 0.8 : 1.1);
  // occlusion: try yaw nudges around the subject (staying on the 180° side) until no trunk / wall blocks the view
  const requestedCast = s.cast ?? LEADS;
  const action = beats.find((b) => b.start <= s.start + 0.01 && b.start + b.dur > s.start && visibleAt(b.actor, s.start));
  const houseExitBeat = beats.find(
    (b) => b.verb === "stand_up" && b.start < s.end && b.start + b.dur > s.start && visibleAt(b.actor, s.start) && sceneLocationAt(...posAt(b.actor, s.start)) === "house",
  );
  const primary =
    houseExitBeat?.actor ??
    (s.subject && visibleAt(s.subject, s.start) ? s.subject : null) ??
    s.cast?.find((a) => visibleAt(a, s.start)) ??
    action?.actor ??
    requestedCast.find((a) => visibleAt(a, s.start)) ??
    ACTOR_IDS.find((a) => visibleAt(a, s.start)) ??
    s.subject ??
    beats[0]?.actor ??
    "masha";
  const place = sceneLocationAt(...posAt(primary, s.start));
  const cast = requestedCast.filter((a) => visibleAt(a, s.start) && sceneLocationAt(...posAt(a, s.start)) === place);
  if (!cast.includes(primary)) cast.push(primary);
  const embrace = beats.some((b) => b.verb === "hug" && b.start < s.end && b.start + b.dur > s.start);
  const mountBeat = beats.find((b) => mounting(b) && b.start < s.end && b.start + b.dur > s.start);
  const liftBeat = beats.find((b) => b.verb === "carry" && b.start < s.end && b.start + b.dur > s.start);
  const ridePairsAt = (t: number) => {
    const pairs = ACTOR_IDS.flatMap((rider) => {
      const carrier = carriedByAt?.(rider, t);
      return carrier && visibleAt(rider, t) && visibleAt(carrier, t) ? [{ rider, carrier }] : [];
    });
    if (liftBeat && t >= liftBeat.start && t < liftBeat.start + liftBeat.dur) {
      const rider = cast.find((actor) => actor !== liftBeat.actor && visibleAt(actor, t));
      if (rider && !pairs.some((pair) => pair.rider === rider)) pairs.push({ rider, carrier: liftBeat.actor });
    }
    return pairs;
  };
  const rides = [s.start, (s.start + s.end) / 2, s.end - 0.001].flatMap(ridePairsAt);
  const houseFurnitureExit = !!houseExitBeat;
  const followActor = houseFurnitureExit ? primary : s.kind === "tracking" && place !== "house" && rides.some((pair) => pair.carrier === primary) ? primary : undefined;
  const viewHeading = (actor: ActorId, t: number) => {
    if (actor === followActor) {
      const a = posAt(actor, Math.max(s.start, t - 0.05));
      const b = posAt(actor, Math.min(s.end, t + 0.05));
      if (dist(a, b) > 0.01) return Math.atan2(b[0] - a[0], b[1] - a[1]);
    }
    return facingAt?.(actor, t) ?? 0;
  };
  const physicalAction =
    !!liftBeat ||
    rides.length > 0 ||
    beats.some((b) => (b.verb === "wake_up" || b.verb === "hug" || b.verb === "fall_down" || b.verb === "stand_up" || mounting(b)) && b.start < s.end && b.start + b.dur > s.start);
  const targetCache = new Map<string, CameraTarget[]>();
  const actorCache = new Map<number, CameraActorVolume[]>();
  const framedAt = (t: number, kind: Kind = s.kind, viewCast = cast): CameraTarget[] => {
    const cacheKey = `${kind}/${viewCast.join(",")}/${t}`;
    const cached = targetCache.get(cacheKey);
    if (cached) return cached;
    const out: CameraTarget[] = [];
    const who = new Set(kind === "wide" || kind === "two" ? viewCast : [primary]);
    for (const { rider, carrier } of ridePairsAt(t)) if (who.has(rider) || who.has(carrier)) { who.add(rider); who.add(carrier); }
    if (liftBeat && t >= liftBeat.start && t < liftBeat.start + liftBeat.dur) for (const actor of cast) who.add(actor);
    for (const a of who) {
      if (!visibleAt(a, t) || sceneLocationAt(...posAt(a, t)) !== sceneLocationAt(...posAt(primary, t))) continue;
      const p = posAt(a, t);
      const hy = headY ? headY(a, t) : HEAD_HEIGHT[a];
      out.push({ actor: a, head: [p[0], hy, p[1]], w: 1 });
      if (kind !== "close") {
        const chest = Math.max(0.25, hy - (HEAD_HEIGHT[a] - CHEST[a]));
        out.push({ actor: a, head: [p[0], chest, p[1]], w: 0.45 });
        if (physicalAction) {
          const yaw = facingAt?.(a, t) ?? 0;
          const r = CAMERA_BODY_RADIUS[a] * 0.7;
          for (const sign of [-1, 0, 1]) out.push({ actor: a, head: [p[0] + Math.cos(yaw) * r * sign, Math.max(0.3, hy - 0.22), p[1] - Math.sin(yaw) * r * sign], w: 0.5 });
          // A reclining actor occupies the length of the furniture, not a
          // standing cylinder above its root. Retain both ends through the
          // landing/recline, including the head beyond the root's footprint.
          if (mountBeat?.actor === a) {
            const reach = HEAD_HEIGHT[a] * 0.72;
            for (const sign of [-1, 1]) out.push({ actor: a, head: [mountBeat.to[0] + Math.cos(yaw) * reach * sign, Math.max(0.7, hy), mountBeat.to[1] - Math.sin(yaw) * reach * sign], w: 0.4, framingOnly: true });
          }
        }
      }
    }
    targetCache.set(cacheKey, out);
    return out;
  };
  const actorsAt = (t: number): CameraActorVolume[] => {
    const cached = actorCache.get(t);
    if (cached) return cached;
    const actors = ACTOR_IDS.filter((a) => visibleAt(a, t)).map((a) => ({
      actor: a,
      pos: posAt(a, t),
      headY: headY ? headY(a, t) : HEAD_HEIGHT[a],
      radius: CAMERA_BODY_RADIUS[a],
    }));
    actorCache.set(t, actors);
    return actors;
  };
  const costAt = (camKey: CamKey, t: number, kind: Kind, viewCast = cast) => {
    camKey = { ...camKey, location: sceneLocationAt(...posAt(primary, t)) };
    if (followActor) {
      const p = posAt(followActor, t);
      const dx = p[0] - camKey.look[0];
      const dz = p[1] - camKey.look[2];
      camKey = { ...camKey, pos: [camKey.pos[0] + dx, camKey.pos[1], camKey.pos[2] + dz], look: [p[0], camKey.look[1], p[1]] };
    }
    const targets = framedAt(t, kind, viewCast);
    const sightTargets = targets.filter((target) => !target.framingOnly);
    let cost = occlusionCost(camKey, sightTargets) + actorOcclusionCost(camKey, sightTargets, actorsAt(t), kind === "over_shoulder");
    if (physicalAction) {
      const vx = camKey.look[0] - camKey.pos[0];
      const vy = camKey.look[1] - camKey.pos[1];
      const vz = camKey.look[2] - camKey.pos[2];
      const flat = Math.hypot(vx, vz) || 1;
      const length = Math.hypot(vx, vy, vz) || 1;
      const forward = [vx / length, vy / length, vz / length];
      const right = [-vz / flat, 0, vx / flat];
      const up = [-forward[1] * right[2], forward[0] * right[2] - forward[2] * right[0], forward[1] * right[0]];
      const tanV = Math.tan((camKey.fov * Math.PI) / 360);
      for (const target of targets) {
        const delta = target.head.map((v, i) => v - camKey.pos[i]);
        const dot = (v: number[]) => delta.reduce((sum, d, i) => sum + d * v[i], 0);
        const depth = dot(forward);
        if (depth <= 0.1) {
          cost += target.w * 8;
          continue;
        }
        cost += target.w * 4 * (Math.max(0, Math.abs(dot(right) / ((depth * tanV * 16) / 9)) - 0.76) + Math.max(0, Math.abs(dot(up) / (depth * tanV)) - 0.82));
      }
      if (mountBeat && t >= mountBeat.start && facingAt) {
        const p = posAt(mountBeat.actor, t);
        const direction = norm([camKey.pos[0] - p[0], camKey.pos[2] - p[1]]);
        const yaw = facingAt(mountBeat.actor, t);
        cost += Math.max(0, -direction[0] * Math.sin(yaw) - direction[1] * Math.cos(yaw)) * 3;
      }
    }
    if (facingAt && !["wide", "two", "over_shoulder"].includes(kind)) {
      const p = posAt(primary, t);
      const direction = norm([camKey.pos[0] - p[0], camKey.pos[2] - p[1]]);
      const heading = viewHeading(primary, t);
      // A back view is sometimes unavoidable, but must lose to an equally
      // clear three-quarter view of the actual actor, not an assumed partner.
      cost += Math.max(0, 0.3 - direction[0] * Math.sin(heading) - direction[1] * Math.cos(heading)) * 0.7;
    }
    if (embrace && facingAt && (kind === "two" || kind === "wide"))
      for (const actor of viewCast) {
        const p = posAt(actor, t);
        const direction = norm([camKey.pos[0] - p[0], camKey.pos[2] - p[1]]);
        const heading = facingAt(actor, t);
        // Opposing eyelines need a side view between the partners, where both
        // profiles and the contact remain visible instead of one hood/back.
        cost += Math.max(0, -direction[0] * Math.sin(heading) - direction[1] * Math.cos(heading)) * 0.8;
      }
    if (facingAt)
      for (const { rider, carrier } of ridePairsAt(t)) {
        if (!targets.some((target) => target.actor === rider)) continue;
        const p = posAt(carrier, t);
        const direction = norm([camKey.pos[0] - p[0], camKey.pos[2] - p[1]]);
        const yaw = viewHeading(carrier, t);
        const front = direction[0] * Math.sin(yaw) + direction[1] * Math.cos(yaw);
        // The rider sits behind a broad head. A front portrait hides that
        // contact; a three-quarter view reveals both faces and the bent legs.
        const sideView = direction[0] * Math.cos(yaw) - direction[1] * Math.sin(yaw);
        cost += Math.abs(front - 0.35) * 1.4 + Math.max(0, sideView) * 1.2;
      }
    return cost;
  };
  const costOf = (fr: { from: CamKey; to: CamKey }, kind: Kind, cutoff = Infinity) => {
    let total = 0;
    let worst = 0;
    // Endpoints alone miss a foreground actor crossing in mid-shot.
    const sampleCount = Math.max(10, Math.ceil((s.end - s.start) / 0.35));
    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const t = Math.min(s.end - 0.001, s.start + (s.end - s.start) * u + 0.001);
      const k = smooth(u);
      const camKey: CamKey = { pos: lerp3(fr.from.pos, fr.to.pos, k), look: lerp3(fr.from.look, fr.to.look, k), fov: lerp(fr.from.fov, fr.to.fov, k) };
      const cost = costAt(camKey, t, kind);
      total += cost;
      worst = Math.max(worst, cost);
      if (worst > cutoff) return worst;
    }
    return worst + total / (sampleCount + 1);
  };
  const furniture = !!mountBeat || houseFurnitureExit;
  let best = framing(s.kind, primary, cast, s.start, s.end, angle, side, posAt, visibleAt, rnd, headY, facingAt, furniture);
  let bestCost = costOf(best, s.kind);
  for (const dlt of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
    if (bestCost === 0) break;
    const a = angle + dlt;
    if (Math.abs(a) > 1.3) continue;
    const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, furniture);
    const cost = costOf(fr, s.kind, bestCost);
    if (cost < bestCost - 1e-6) {
      best = fr;
      bestCost = cost;
    }
  }
  // still blocked (e.g. a trunk right beside the subject): swing further round, still on the 180° side
  for (const dlt of [1.45, -1.45, 1.6, -1.6]) {
    if (bestCost < 1) break;
    const a = clamp(angle + dlt, -1.6, 1.6);
    const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, furniture);
    const cost = costOf(fr, s.kind, bestCost);
    if (cost < bestCost - 1e-6) {
      best = fr;
      bestCost = cost;
    }
  }
  // A dismount establishes a new action axis. Its clear exit side may be
  // opposite the preceding conversation; do not hide the action to preserve
  // an eyeline that no longer describes the movement.
  if (physicalAction)
    for (const a of [0, 0.175, -0.175, 0.525, -0.525, 0.875, -0.875, 1.225, -1.225, 2, -2, 2.5, -2.5, Math.PI]) {
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, furniture);
      const cost = costOf(fr, s.kind, bestCost);
      if (cost < bestCost - 1e-6) {
        best = fr;
        bestCost = cost;
      }
    }
  // Follow a moving action around an obstruction instead of accepting a
  // blocked first frame merely because one fixed orbit suits the later pose.
  if (bestCost >= 1 && dist(posAt(primary, s.start), posAt(primary, s.end)) > 1) {
    const base = best;
    for (const a of [-1.3, -0.7, 0, 0.7, 1.3]) {
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, furniture);
      for (const candidate of [
        { from: fr.from, to: base.to },
        { from: base.from, to: fr.to },
      ]) {
        const cost = costOf(candidate, s.kind, bestCost) + 0.1;
        if (cost < bestCost - 1e-6) {
          best = candidate;
          bestCost = cost;
        }
      }
    }
  }
  // Vary distance as well as yaw: moving closer can leave a foreground body
  // outside the shot, while a moderate retreat can fit a crowd. Penalize
  // distance changes so clearance does not routinely become a tiny subject.
  if (bestCost > 0.4 && place !== "house") {
    const originalBest = best;
    for (const scale of s.kind === "wide" ? [1.18] : s.kind === "two" ? [1.18, 1.4] : [0.65, 0.82, 1.18, 1.4, 1.6, 2])
      for (const dlt of [null, 0, 0.7, -0.7, 1.3, -1.3, 1.6, -1.6]) {
        const fr =
          dlt === null
            ? { from: { ...originalBest.from }, to: { ...originalBest.to } }
            : framing(s.kind, primary, cast, s.start, s.end, clamp(angle + dlt, -1.6, 1.6), side, posAt, visibleAt, rnd, headY, facingAt, furniture);
        for (const k of [fr.from, fr.to]) k.pos = clampCam(k.pos.map((v, i) => k.look[i] + (v - k.look[i]) * scale) as Vec3);
        const cost = costOf(fr, s.kind, bestCost) + Math.abs(Math.log(scale)) * 0.6;
        if (cost < bestCost - 1e-6) {
          best = fr;
          bestCost = cost;
        }
      }
  }
  // still blocked (camera boxed in by trunks): fall back to a static medium, then a wide, from the clearest yaw
  let kind = s.kind;
  if (bestCost >= 1 && !s.overridden) {
    for (const alt of (physicalAction ? ["two", "wide"] : ["medium", "two", "wide"]) as Kind[]) {
      if (alt === s.kind) continue;
      for (const dlt of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
        const fr = framing(alt, primary, cast, s.start, s.end, clamp(angle + dlt, -1.3, 1.3), side, posAt, visibleAt, rnd, headY, facingAt, furniture);
        const cost = costOf(fr, alt, bestCost) + (alt === "wide" ? 0.7 : 0.15);
        if (cost < bestCost - 1e-6) {
          best = fr;
          bestCost = cost;
          kind = alt;
        }
        if (bestCost < 1) break;
      }
      if (bestCost < 1) break;
    }
  }
  if (followActor && dist(posAt(primary, s.start), MARKS.hammock.pos) < 3.2 && dist(posAt(primary, s.start), posAt(primary, s.end)) > 3) {
    // Keep the carried departure on the open side of the hammock instead of
    // orbiting through its pines and the house limb as the route bends.
    const yaw = MARKS.hammock.facing;
    const openSide: Vec2 = [-Math.cos(yaw), Math.sin(yaw)];
    best = { from: key(posAt(primary, s.start), openSide, 5.5, 2.5, 1.25, 45), to: key(posAt(primary, s.end), openSide, 5.5, 2.5, 1.25, 45) };
  }
  const { from, to } = best;
  if (followActor) {
    from.followActor = followActor;
    to.followActor = followActor;
  }
  from.location = sceneLocationAt(...posAt(primary, s.start + 0.001));
  to.location = sceneLocationAt(...posAt(primary, Math.max(s.start, s.end - 0.001)));
  let cutAt: number | undefined;
  if (from.location !== to.location) {
    // A shot ending outdoors must still begin inside the room's open-side
    // composition. Framing both endpoints together otherwise chooses an
    // exterior orbit for its indoor half, looking through a retained wall.
    if (from.location === "house") {
      const origin = framing(s.kind, primary, cast, s.start, s.start, angle, side, posAt, visibleAt, rnd, headY, facingAt, furniture).from;
      Object.assign(from, origin, { location: from.location });
    }
    const endTime = Math.max(s.start, s.end - 0.001);
    const destinationCast = requestedCast.filter((a) => sceneLocationAt(...posAt(a, endTime)) === to.location);
    if (!destinationCast.includes(primary)) destinationCast.push(primary);
    let destination = framing(kind, primary, destinationCast, endTime, endTime, angle, side, posAt, visibleAt, rnd, headY, facingAt, furniture).from;
    let destinationCost = costAt(destination, endTime, kind, destinationCast);
    // The destination is a different scenic set. Rebuilding its camera must
    // not bypass the obstruction checks used for ordinary shots.
    for (const dlt of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45]) {
      const candidate = framing(kind, primary, destinationCast, endTime, endTime, clamp(angle + dlt, -1.6, 1.6), side, posAt, visibleAt, rnd, headY, facingAt, furniture).from;
      const cost = costAt(candidate, endTime, kind, destinationCast);
      if (cost < destinationCost - 1e-6) {
        destination = candidate;
        destinationCost = cost;
      }
    }
    Object.assign(to, destination, { location: to.location });
    let lo = s.start;
    let hi = s.end;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) * 0.5;
      if (sceneLocationAt(...posAt(primary, mid)) === from.location) lo = mid;
      else hi = mid;
    }
    cutAt = hi;
  }
  return { start: r3(s.start), dur: r3(s.end) - r3(s.start), shot: shotName(kind), from, to, overridden: s.overridden, ...(cutAt === undefined ? {} : { cutAt }) };
}

/** Camera key at time t (eased between from/to), or null outside the plan. */
export function cameraAt(cues: CameraCue[], t: number): CamKey | null {
  const c = cues.find((q) => t >= q.start && t < q.start + q.dur) ?? cues[cues.length - 1];
  if (!c) return null;
  if (c.from.location && c.to.location && c.from.location !== c.to.location) return t < (c.cutAt ?? c.start + c.dur * 0.5) ? c.from : c.to;
  const k = smooth((t - c.start) / Math.max(1e-6, c.dur));
  return {
    pos: lerp3(c.from.pos, c.to.pos, k),
    look: lerp3(c.from.look, c.to.look, k),
    fov: lerp(c.from.fov, c.to.fov, k),
    location: c.from.location ?? c.to.location,
    followActor: c.from.followActor ?? c.to.followActor,
  };
}

/** Stereo pan estimate (-1..1) of a ground point relative to the planned camera at time t. */
export function panFor(cues: CameraCue[], p: Vec2, t: number): number {
  const cam = cameraAt(cues, t);
  if (!cam) return 0;
  const f = norm([cam.look[0] - cam.pos[0], cam.look[2] - cam.pos[2]]);
  const right: Vec2 = [-f[1], f[0]];
  const rel: Vec2 = [p[0] - cam.pos[0], p[1] - cam.pos[2]];
  const x = rel[0] * right[0] + rel[1] * right[1];
  const y = rel[0] * f[0] + rel[1] * f[1];
  const a = Math.atan2(x, Math.max(0.1, y));
  return Math.round(clamp(Math.sin(a) * 1.2, -1, 1) * 100) / 100;
}
