// Waypoint-graph locomotion routing (spec §7.2). Pure and deterministic.
// Straight line when clear; otherwise the shortest path via the WAYPOINTS graph around OBSTACLES.
// An obstacle that contains an endpoint of a segment is ignored for that segment, so marks that sit
// inside an obstacle footprint (pier over the pond, table, hiding spots) stay reachable.
import { OBSTACLES, SET_BOUNDS, WAYPOINTS } from "../shared/bible/set";
import type { Vec2 } from "../shared/schema";

const MARGIN = 0.25;

function insideCircle(p: Vec2, c: Vec2, r: number): boolean {
  return Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
}
function insideBox(p: Vec2, min: Vec2, max: Vec2, m = 0): boolean {
  return p[0] > min[0] - m && p[0] < max[0] + m && p[1] > min[1] - m && p[1] < max[1] + m;
}

/** Distance from point p to segment ab. */
function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

function segIntersectsBox(a: Vec2, b: Vec2, min: Vec2, max: Vec2): boolean {
  // sample-based test (boxes are large relative to the step), plus endpoints
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (insideBox(p, min, max, MARGIN)) return true;
  }
  return false;
}

/** True when the straight segment a→b avoids every obstacle (except those containing a or b). */
export function segmentClear(a: Vec2, b: Vec2): boolean {
  for (const c of OBSTACLES.circles) {
    if (insideCircle(a, c.c, c.r + MARGIN) || insideCircle(b, c.c, c.r + MARGIN)) continue;
    if (distPointSeg(c.c, a, b) < c.r + MARGIN) return false;
  }
  for (const bx of OBSTACLES.boxes) {
    if (insideBox(a, bx.min, bx.max, MARGIN) || insideBox(b, bx.min, bx.max, MARGIN)) continue;
    if (segIntersectsBox(a, b, bx.min, bx.max)) return false;
  }
  return true;
}

function d(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Route from → to: straight line if clear, else the shortest path via the waypoint graph. Includes from and to. */
export function planPath(from: Vec2, to: Vec2): Vec2[] {
  const a: Vec2 = [from[0], from[1]];
  const b: Vec2 = [to[0], to[1]];
  if (d(a, b) < 1e-6) return [a, b];
  if (segmentClear(a, b)) return [a, b];

  // Graph: 0 = from, 1 = to, 2.. = waypoints
  const nodes: Vec2[] = [a, b, ...WAYPOINTS.map((w) => w.pos)];
  const idx = new Map(WAYPOINTS.map((w, i) => [w.id, i + 2]));
  const adj: number[][] = nodes.map(() => []);
  const link = (i: number, j: number) => {
    if (!adj[i].includes(j)) adj[i].push(j);
    if (!adj[j].includes(i)) adj[j].push(i);
  };
  WAYPOINTS.forEach((w, i) => w.links.forEach((l) => { const j = idx.get(l); if (j !== undefined && segmentClear(nodes[i + 2], nodes[j])) link(i + 2, j); }));
  for (let i = 2; i < nodes.length; i++) {
    if (segmentClear(a, nodes[i])) link(0, i);
    if (segmentClear(nodes[i], b)) link(1, i);
  }

  // Dijkstra (tiny graph)
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (const v of adj[u]) {
      const nd = dist[u] + d(nodes[u], nodes[v]);
      if (nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = u; }
    }
  }
  // No safe route: hold position rather than walk through scenery.
  if (prev[1] < 0) return [a, a];
  const chain: number[] = [];
  for (let v = 1; v >= 0; v = prev[v]) chain.unshift(v);
  const path = chain.map((i) => [nodes[i][0], nodes[i][1]] as Vec2);
  return smooth(path);
}

/** Drop intermediate waypoints that can be skipped with a clear straight segment (string pulling). */
function smooth(path: Vec2[]): Vec2[] {
  const out: Vec2[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !segmentClear(path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

export function pathLength(path: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += d(path[i], path[i - 1]);
  return len;
}

/** Point at arc-length distance s along the path (clamped to its ends). */
export function pointAlong(path: Vec2[], s: number): Vec2 {
  if (path.length === 0) return [0, 0];
  if (s <= 0) return [path[0][0], path[0][1]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = d(path[i], path[i - 1]);
    if (acc + seg >= s && seg > 0) {
      const t = (s - acc) / seg;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
    acc += seg;
  }
  const last = path[path.length - 1];
  return [last[0], last[1]];
}

/** Yaw (0 = +z) of the direction a→b; `fallback` when the points coincide. */
export function yawTo(a: Vec2, b: Vec2, fallback = 0): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return fallback;
  return Math.atan2(dx, dz);
}

/** Yaw of the path's last leg. */
export function pathEndYaw(path: Vec2[], fallback = 0): number {
  for (let i = path.length - 1; i > 0; i--) {
    if (d(path[i], path[i - 1]) > 1e-4) return yawTo(path[i - 1], path[i], fallback);
  }
  return fallback;
}

/** Clamp a point into the walkable set bounds (with a margin) and push it out of obstacle footprints. */
export function clampWalkable(p: Vec2, margin = 1.5): Vec2 {
  let x = Math.max(SET_BOUNDS.minX + margin, Math.min(SET_BOUNDS.maxX - margin, p[0]));
  let z = Math.max(SET_BOUNDS.minZ + margin, Math.min(SET_BOUNDS.maxZ - margin, p[1]));
  for (const c of OBSTACLES.circles) {
    const dd = Math.hypot(x - c.c[0], z - c.c[1]);
    if (dd < c.r + 0.3) {
      const k = dd < 1e-6 ? 1 : (c.r + 0.3) / dd;
      x = c.c[0] + (dd < 1e-6 ? c.r + 0.3 : (x - c.c[0]) * k);
      z = c.c[1] + (dd < 1e-6 ? 0 : (z - c.c[1]) * k);
    }
  }
  for (const bx of OBSTACLES.boxes) {
    if (insideBox([x, z], bx.min, bx.max, 0.3)) {
      const opts: [number, number, number][] = [
        [Math.abs(x - (bx.min[0] - 0.3)), bx.min[0] - 0.3, z],
        [Math.abs(x - (bx.max[0] + 0.3)), bx.max[0] + 0.3, z],
        [Math.abs(z - (bx.min[1] - 0.3)), x, bx.min[1] - 0.3],
        [Math.abs(z - (bx.max[1] + 0.3)), x, bx.max[1] + 0.3],
      ];
      opts.sort((p1, p2) => p1[0] - p2[0]);
      x = opts[0][1];
      z = opts[0][2];
    }
  }
  return [x, z];
}
