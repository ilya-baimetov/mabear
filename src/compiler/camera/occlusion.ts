import { isInsideHouse, OBSTACLES, SET_BOUNDS, sceneLocationAt } from "../../shared/bible/set";
import { forestCameraOccluders, type SceneryOccluder } from "../../shared/forestLayout";
import { clamp, clamp01 } from "../../shared/math";
import type { ActorId, CamKey, Shot, Vec2, Vec3 } from "../../shared/schema";

export const SHOT_MIN = 1.2;
export const SHOT_MAX = 6;

export interface CameraBeatInfo {
  start: number;
  dur: number;
  actor: ActorId;
  verb: string;
  shot: Shot;
  /** actor position at beat start / end */
  from: Vec2;
  to: Vec2;
  hasLine: boolean;
  /** dialogue window (absolute, segment-local) when hasLine */
  lineStart: number;
  lineDur: number;
  /** the line is a punchline (last line of the paragraph, or exclaimed) */
  punchline: boolean;
  emotion: string;
}

export interface CameraPlanInput {
  duration: number;
  beats: CameraBeatInfo[];
  /** actor ground position at time t (segment-local) */
  posAt: (actor: ActorId, t: number) => Vec2;
  /** head height of an actor at time t (sitting / carried); defaults to HEAD_HEIGHT */
  headY?: (actor: ActorId, t: number) => number;
  /** A physical rider is framed with its carrier, including later walk/dialogue clips. */
  carriedByAt?: (actor: ActorId, t: number) => ActorId | null;
  /** Actual actor heading; guest close shots should show the face, not assume it faces a lead. */
  facingAt?: (actor: ActorId, t: number) => number;
  /** actor visible (not offstage) at time t */
  visibleAt: (actor: ActorId, t: number) => boolean;
  /** dialogue windows, for fillers */
  dialogue: { start: number; dur: number; actor: ActorId }[];
  isFirst: boolean;
  cameraSeed: number;
}

export const HEAD_HEIGHT: Record<ActorId, number> = {
  masha: 0.85,
  bear: 2.05,
  wolf_a: 1.65,
  wolf_b: 1.56,
  lady_bear: 1.85,
  hare: 0.58,
  rosie: 0.88,
  squirrel: 0.45,
  rival_bear: 2.2,
};

export const CHEST: Record<ActorId, number> = {
  masha: 0.6,
  bear: 1.25,
  wolf_a: 1.2,
  wolf_b: 1.13,
  lady_bear: 1.2,
  hare: 0.38,
  rosie: 0.55,
  squirrel: 0.27,
  rival_bear: 1.5,
};

export const CAMERA_BODY_RADIUS: Record<ActorId, number> = {
  masha: 0.23,
  bear: 0.76,
  wolf_a: 0.4,
  wolf_b: 0.42,
  lady_bear: 0.62,
  hare: 0.19,
  rosie: 0.31,
  squirrel: 0.16,
  rival_bear: 0.94,
};

/** Default cast of a two-shot / wide: the leads. The Wolves join only when they act (they never steal framing idle). */
export const LEADS: ActorId[] = ["masha", "bear"];

export type Kind = "wide" | "medium" | "two" | "close" | "low_angle" | "over_shoulder" | "tracking";

export interface Proposal {
  start: number;
  want: number;
  prio: number;
  kind: Kind;
  subject: ActorId | null;
  overridden: boolean;
  /** true for establishing wides (minimum hold 1.5 s) */
  establishing?: boolean;
  /** frames a speaker during a line */
  line?: boolean;
  /** who a two-shot / wide frames (default: Masha and Bear) */
  cast?: ActorId[];
}

export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-6 ? [0, 1] : [v[0] / l, v[1] / l];
}

export function rot(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/** Tall static occluders: set obstacle circles (trunks, bush) plus trees the set dresses (hammock pines, swing oak). */
export const OCCLUDERS: SceneryOccluder[] = [
  ...OBSTACLES.circles.filter((c) => c.id !== "pond" && c.id !== "table").map((c) => ({ c: c.c, r: c.r, h: c.id === "bush" ? 1.3 : 12 })),
  // hammock pines: hammock at (-11, 2.2) rotated 0.8 rad (set element), pines at local x = ±2.1
  { c: [-9.54, 0.69], r: 0.45, h: 12 },
  { c: [-12.46, 3.71], r: 0.45, h: 12 },
  { c: [8.6, -0.6], r: 0.6, h: 12 }, // swing oak
  { c: [2, 1.5], r: 0.75, y: 0.71, h: 0.07 }, // tabletop, not an opaque cylinder down to the floor
  { c: [2.22, 1.28], r: 0.22, y: 0.78, h: 0.76 }, // fixed samovar and teapot silhouette
];

const REMOTE_OCCLUDERS = {
  pond: forestCameraOccluders("pond"),
  wolves: forestCameraOccluders("wolves"),
};

const OCC_BOXES: { id: string; min: Vec2; max: Vec2; h: number; y?: number }[] = [
  ...OBSTACLES.boxes.map((b) => ({ id: b.id, min: b.min, max: b.max, h: b.id === "house" ? 7.5 : b.id === "cooking_helper" ? 0.48 : 2.6 })),
  // Low woody branch bands measured from Pine_3/Pine_1 Bark_NormalTree vertices,
  // normalized to 8.5/9.4 m and transformed by the hammock's actual rotations.
  { id: "hammock-west-branches", min: [-13.54, 2.459], max: [-11.174, 4.214], y: 1.6, h: 0.6 },
  { id: "hammock-east-branches", min: [-10.27, 1.028], max: [-8.911, 3.008], y: 1.6, h: 0.6 },
  { id: "hammock-west-upper-branches", min: [-13.886, 2.529], max: [-12.368, 3.836], y: 2.2, h: 0.6 },
  { id: "hammock-east-upper-branches", min: [-10.641, -0.927], max: [-8.86, 2.817], y: 2.2, h: 0.6 },
];

export interface CameraTarget {
  head: Vec3;
  w: number;
  actor?: ActorId;
  framingOnly?: boolean;
}

export interface CameraActorVolume {
  actor: ActorId;
  pos: Vec2;
  headY: number;
  radius: number;
}

/** Dynamic cast is scenery for another actor's shot, even when its centre is
 * outside the exact face ray. Keep a deliberate shoulder at the edge; reject a
 * near body filling the frame or covering the subject's face/acting chest. */
export function actorOcclusionCost(key: CamKey, targets: CameraTarget[], actors: CameraActorVolume[], overShoulder = false): number {
  const location = key.location ?? sceneLocationAt(key.look[0], key.look[2]);
  const dx = key.look[0] - key.pos[0];
  const dy = key.look[1] - key.pos[1];
  const dz = key.look[2] - key.pos[2];
  const focusDistance = Math.hypot(dx, dy, dz) || 1;
  const flatDistance = Math.hypot(dx, dz) || 1;
  const forward = [dx / focusDistance, dy / focusDistance, dz / focusDistance];
  const right = [-dz / flatDistance, 0, dx / flatDistance];
  const up = [-forward[1] * right[2], forward[0] * right[2] - forward[2] * right[0], forward[1] * right[0]];
  const tanV = Math.tan((key.fov * Math.PI) / 360);
  const tanH = (tanV * 16) / 9;
  const framed = new Set(targets.map((t) => t.actor));
  let cost = 0;
  for (const a of actors) {
    if (sceneLocationAt(...a.pos) !== location) continue;
    const floor = Math.max(0, a.headY - HEAD_HEIGHT[a.actor]);
    const top = a.headY + 0.15;
    const cameraDistance = Math.hypot(a.pos[0] - key.pos[0], a.pos[1] - key.pos[2]);
    if (cameraDistance < a.radius + 0.2 && key.pos[1] < top + 0.15 && key.pos[1] > floor - 0.1) cost += 4;
    for (const target of targets) {
      if (target.actor === a.actor) continue;
      const vx = target.head[0] - key.pos[0];
      const vz = target.head[2] - key.pos[2];
      const length2 = vx * vx + vz * vz;
      if (length2 < 0.01) continue;
      const t = ((a.pos[0] - key.pos[0]) * vx + (a.pos[1] - key.pos[2]) * vz) / length2;
      if (t <= 0.01 || t >= 0.97) continue;
      const y = key.pos[1] + (target.head[1] - key.pos[1]) * t;
      if (y > floor && y < top && Math.hypot(key.pos[0] + vx * t - a.pos[0], key.pos[2] + vz * t - a.pos[1]) < a.radius + 0.045) cost += target.w * 1.6;
    }
    if (framed.has(a.actor)) continue;
    const rel = [a.pos[0] - key.pos[0], (floor + top) / 2 - key.pos[1], a.pos[1] - key.pos[2]];
    const dot = (v: number[]) => rel[0] * v[0] + rel[1] * v[1] + rel[2] * v[2];
    const depth = dot(forward);
    if (depth <= 0.05 || depth >= focusDistance - 0.25) continue;
    const x = dot(right) / (depth * tanH);
    const y = dot(up) / (depth * tanV);
    const rx = a.radius / (depth * tanH);
    const ry = ((top - floor) * 0.5) / (depth * tanV);
    const width = Math.max(0, Math.min(1, x + rx) - Math.max(-1, x - rx));
    const height = Math.max(0, Math.min(1, y + ry) - Math.max(-1, y - ry));
    const area = (width * height) / 4;
    cost += Math.max(0, area - (overShoulder ? 0.3 : 0.14)) * 8;
    // A large clipped head/body at an edge is still a failed composition even
    // when it misses the subject ray. Deliberate shoulders may remain cropped.
    if (!overShoulder && width > 0.12 && (y + ry > 1.08 || y - ry < -0.98)) cost += width * Math.min(2, ry) * 1.6;
  }
  return cost;
}

/** How badly static set pieces block a camera key: line of sight to each framed head (weighted), plus big trunks
 *  standing in frame in front of the subject. 0 = clear. */
export function occlusionCost(key: CamKey, heads: { head: Vec3; w: number }[]): number {
  const cam = key.pos;
  const location = key.location ?? sceneLocationAt(key.look[0], key.look[2]);
  // Each scenic location hides the others. Their absent trunks and walls must
  // not push this scene's camera away from an otherwise clear composition.
  const circles = location === "yard" ? OCCLUDERS : location === "pond" || location === "wolves" ? REMOTE_OCCLUDERS[location] : [];
  const boxes = OCC_BOXES.filter((b) => (b.id === "van" ? location === "wolves" : location === "yard"));
  let cost = 0;
  for (const { head, w } of heads) {
    const dx = head[0] - cam[0];
    const dz = head[2] - cam[2];
    const L2 = dx * dx + dz * dz;
    for (const o of circles) {
      const t = L2 === 0 ? 0 : clamp01(((o.c[0] - cam[0]) * dx + (o.c[1] - cam[2]) * dz) / L2);
      if (t <= 0.02 || t >= 0.97) continue;
      const px = cam[0] + dx * t;
      const pz = cam[2] + dz * t;
      const y = cam[1] + (head[1] - cam[1]) * t;
      if (Math.hypot(px - o.c[0], pz - o.c[1]) < o.r + 0.12 && y < (o.y ?? 0) + o.h && y > (o.y ?? 0) - 0.03) cost += w;
    }
    const n = Math.max(4, Math.ceil(Math.sqrt(L2) / 0.25));
    for (const b of boxes) {
      if (b.id === "house" && isInsideHouse(head[0], head[2])) continue; // exterior is cut away for indoor scenes
      for (let i = 1; i < n - 1; i++) {
        const t = i / n;
        const x = cam[0] + dx * t;
        const z = cam[2] + dz * t;
        const y = cam[1] + (head[1] - cam[1]) * t;
        if (x > b.min[0] - 0.1 && x < b.max[0] + 0.1 && z > b.min[1] - 0.1 && z < b.max[1] + 0.1 && y < (b.y ?? 0) + b.h && y > (b.y ?? 0) - 0.03) {
          cost += w;
          break;
        }
      }
    }
  }
  // trunks filling the frame in front of the subject
  const f = norm([key.look[0] - cam[0], key.look[2] - cam[2]]);
  const subjDist = Math.hypot(key.look[0] - cam[0], key.look[2] - cam[2]);
  const hfov = 2 * Math.atan(Math.tan((key.fov * Math.PI) / 360) * (16 / 9));
  for (const o of circles) {
    if (o.h < 3) continue;
    const v: Vec2 = [o.c[0] - cam[0], o.c[1] - cam[2]];
    const d = Math.hypot(v[0], v[1]);
    if (d < o.r + 0.16 && cam[1] < (o.y ?? 0) + o.h) {
      cost += 2;
      continue;
    }
    if (d < 0.3 || d > subjDist - 0.3) continue;
    const ang = Math.acos(clamp((v[0] * f[0] + v[1] * f[1]) / d, -1, 1));
    const wAng = Math.atan(o.r / d);
    if (ang - wAng < hfov / 2) cost += Math.min(1, wAng * 6);
  }
  return Math.round(cost * 1000) / 1000;
}

/** Keep the camera inside the set bounds, above ground, out of the house box and trunk/bush footprints. */
export function clampCam(p: Vec3): Vec3 {
  let [x, y, z] = p;
  // stay inside the yard clearing (the forest ring is dense) — the open meadow to the south is fine
  const e = (x / 17.5) ** 2 + ((z - 1) / 15.5) ** 2;
  if (e > 0.92 && !(z > 9 && Math.abs(x) < 24)) {
    const k = Math.sqrt(0.92 / e);
    x *= k;
    z = 1 + (z - 1) * k;
  }
  x = clamp(x, SET_BOUNDS.minX + 1, SET_BOUNDS.maxX - 1);
  z = clamp(z, SET_BOUNDS.minZ + 1, SET_BOUNDS.maxZ - 1);
  y = clamp(y, 0.3, 14);
  for (const b of OBSTACLES.boxes) {
    const m = 0.6;
    if (x > b.min[0] - m && x < b.max[0] + m && z > b.min[1] - m && z < b.max[1] + m && y < (b.id === "cooking_helper" ? 0.48 : 7.5)) {
      const opts: [number, number, number][] = [
        [x - (b.min[0] - m), b.min[0] - m, z],
        [b.max[0] + m - x, b.max[0] + m, z],
        [z - (b.min[1] - m), x, b.min[1] - m],
        [b.max[1] + m - z, x, b.max[1] + m],
      ];
      opts.sort((a, c) => a[0] - c[0]);
      x = opts[0][1];
      z = opts[0][2];
    }
  }
  for (const c of OBSTACLES.circles) {
    if (c.id === "pond" || y > 3) continue;
    const dd = Math.hypot(x - c.c[0], z - c.c[1]);
    if (dd < c.r + 0.4) {
      const k = (c.r + 0.4) / Math.max(dd, 1e-6);
      x = c.c[0] + (x - c.c[0]) * k;
      z = c.c[1] + (z - c.c[1]) * k;
    }
  }
  return [r3(x), r3(y), r3(z)];
}
