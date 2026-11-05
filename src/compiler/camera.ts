// Auto-cinematographer (spec §7.5). Pure and deterministic: variation comes from a seeded PRNG (remix cameraSeed).
// Priority: beat `shot` hint > automatic rules. Rules: establishing wide at episode start and on mark-cluster change;
// dialogue → medium-close on the speaker; 1–1.5 s reaction shot after slapstick/punchline; locomotion > 2 s →
// tracking; low_angle for Bear looming / Masha mischief; shot length 1.2–6 s; 180° rule; camera clamped to the set
// bounds and kept out of the house.
import { MARKS, OBSTACLES, SET_BOUNDS, type MarkDef } from "../shared/bible/set";
import type { ActorId, CamKey, CameraCue, Shot, Vec2, Vec3 } from "../shared/schema";

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
  /** actor visible (not offstage) at time t */
  visibleAt: (actor: ActorId, t: number) => boolean;
  /** dialogue windows, for fillers */
  dialogue: { start: number; dur: number; actor: ActorId }[];
  isFirst: boolean;
  cameraSeed: number;
}

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

export const HEAD_HEIGHT: Record<ActorId, number> = { masha: 0.85, bear: 1.75 };
const CHEST: Record<ActorId, number> = { masha: 0.6, bear: 1.25 };

type Kind = "wide" | "medium" | "two" | "close" | "low_angle" | "over_shoulder" | "tracking";
interface Proposal {
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
}

const LOCO = new Set(["walk_to", "run_to", "tiptoe_to", "chase", "enter", "exit"]);
const SLAPSTICK = new Set(["fall_down", "sneeze", "surprised", "scared"]);

/** Nearest mark cluster for a position. */
export function clusterAt(p: Vec2): MarkDef["cluster"] {
  let best: MarkDef | null = null;
  let bd = Infinity;
  for (const m of Object.values(MARKS)) {
    const dd = Math.hypot(m.pos[0] - p[0], m.pos[1] - p[1]);
    if (dd < bd) { bd = dd; best = m; }
  }
  return best ? best.cluster : "yard";
}

function hintKind(s: Shot): Kind {
  return s === "auto" ? "medium" : (s as Kind);
}

export function planCamera(input: CameraPlanInput): CameraCue[] {
  const { duration, posAt, visibleAt } = input;
  const rnd = mulberry32((input.cameraSeed * 7919 + 17) | 0);
  const beats = [...input.beats].sort((a, b) => a.start - b.start);
  const other = (a: ActorId): ActorId => (a === "masha" ? "bear" : "masha");
  const props: Proposal[] = [];

  // 1. establishing shot
  const knownAt = (t: number) => {
    const k = new Set<string>();
    for (const a of ["masha", "bear"] as ActorId[]) if (visibleAt(a, Math.max(0, t))) k.add(clusterAt(posAt(a, Math.max(0, t))));
    return k;
  };
  if (input.isFirst) props.push({ start: 0, want: 2.5, prio: 5, kind: "wide", subject: null, overridden: false, establishing: true });

  // Priorities: beat hint 6 > the speaker for the WHOLE line 5.5 > episode establishing 5 > reaction 4.5 >
  // cluster establishing 3.5 > tracking 3 (Masha) / 2.5 (Bear) > low angle 2 > two-shot for parallel action 1.6 >
  // medium 1.3 (Masha, the star) / 1 (Bear).
  const near = (t: number) => visibleAt("masha", t) && visibleAt("bear", t) && dist(posAt("masha", t), posAt("bear", t)) < 8;
  const parallel = (b: CameraBeatInfo) =>
    beats.some((o) => o.actor !== b.actor && o.start < b.start + b.dur - 0.3 && o.start + o.dur > b.start + 0.3);
  for (const b of beats) {
    const isLoco = LOCO.has(b.verb);
    const known = knownAt(b.start - 0.05);
    const star = b.actor === "masha";
    if (b.shot !== "auto") {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: 6, kind: hintKind(b.shot), subject: b.shot === "wide" ? null : b.actor, overridden: true });
    } else if (b.hasLine) {
      props.push({ start: b.lineStart, want: Math.max(SHOT_MIN, b.lineDur), prio: 5.5, kind: "close", subject: b.actor, overridden: false, line: true });
    } else if (isLoco && b.dur > 2) {
      props.push({ start: b.start, want: b.dur, prio: star ? 3 : 2.5, kind: "tracking", subject: b.actor, overridden: false });
    } else if ((star && b.emotion === "mischievous") || (b.actor === "bear" && ["angry_stomp", "chase", "carry", "angry"].some((v) => v === b.verb || v === b.emotion))) {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: 2, kind: rnd() < 0.65 ? "low_angle" : "medium", subject: b.actor, overridden: false });
    } else if (parallel(b) && near(b.start + 0.1)) {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: 1.6, kind: "two", subject: null, overridden: false });
    } else {
      const two = near(b.start) && dist(posAt("masha", b.start), posAt("bear", b.start)) < 5 && rnd() < 0.35;
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: star ? 1.3 : 1, kind: two ? "two" : "medium", subject: two ? null : b.actor, overridden: false });
    }
    // arriving in a new cluster → establish it
    if (isLoco && visibleAt(b.actor, b.start + b.dur) && !known.has(clusterAt(b.to))) {
      props.push({ start: b.start + b.dur, want: 2.0, prio: 3.5, kind: "wide", subject: null, overridden: false, establishing: true });
    }
    // reaction shot on the other character after slapstick, or after the punchline line has ENDED
    const o = other(b.actor);
    if ((SLAPSTICK.has(b.verb) || (b.hasLine && b.punchline)) && visibleAt(o, b.start + b.dur)) {
      const at = b.hasLine ? b.lineStart + b.lineDur : b.start + Math.min(b.dur, 1.2);
      props.push({ start: at, want: 1.0 + rnd() * 0.5, prio: 4.5, kind: "close", subject: o, overridden: false });
    }
  }
  props.sort((a, b) => a.start - b.start || b.prio - a.prio);

  // 2. resolve into a cut list. A shot keeps the screen for its minimum hold; a stronger shot also protects its
  //    whole wanted window (a speaker shot covers the entire line) from weaker ones, which wait until it ends.
  const cuts: Proposal[] = [];
  const hold = (p: Proposal) => (p.establishing ? 1.5 : SHOT_MIN);
  for (const p0 of props) {
    const p = { ...p0 };
    if (p.start >= duration - 0.05) continue;
    if (cuts.length === 0) {
      if (p.start > 0.01) cuts.push({ start: 0, want: p.start, prio: 0, kind: "two", subject: null, overridden: false });
      else { cuts.push({ ...p, start: 0 }); continue; }
    }
    const last = cuts[cuts.length - 1];
    const gap = p.start - last.start;
    if (p.kind === last.kind && p.subject === last.subject && p.prio <= last.prio + 1) {
      last.want = Math.max(last.want, p.start + p.want - last.start);
      last.prio = Math.max(last.prio, p.prio);
      last.line = last.line || p.line;
      continue;
    }
    const protectedEnd = last.start + (last.prio > p.prio ? Math.max(hold(last), last.want) : hold(last));
    if (p.start >= protectedEnd - 1e-6) { cuts.push(p); continue; }
    if (p.prio > last.prio) {
      if (last.establishing && last.start === 0 && input.isFirst) {
        // the opening wide keeps its minimum length; the stronger shot follows it
        const st = last.start + SHOT_MIN;
        last.want = SHOT_MIN;
        cuts.push({ ...p, start: st, want: Math.max(SHOT_MIN, p.start + p.want - st) });
      } else if (gap >= SHOT_MIN) {
        last.want = gap;
        cuts.push(p);
      } else {
        // replace the weaker shot (start the stronger one a little early)
        cuts[cuts.length - 1] = { ...p, start: last.start, want: p.want + gap };
      }
      continue;
    }
    const end = p.start + p.want;
    if (end - protectedEnd >= 0.3 && protectedEnd < duration - SHOT_MIN) cuts.push({ ...p, start: protectedEnd, want: Math.max(SHOT_MIN, end - protectedEnd) });
  }
  if (cuts.length === 0) cuts.push({ start: 0, want: duration, prio: 0, kind: "two", subject: null, overridden: false });

  if (process.env.CAMDBG) console.log("PROPS", JSON.stringify(props.map((p) => [p.start.toFixed(2), p.kind, p.subject, p.prio, p.want.toFixed(2)])), "CUTS", JSON.stringify(cuts.map((p) => [p.start.toFixed(2), p.kind, p.subject, p.prio, p.want.toFixed(2)])));
  // 3. fillers where a shot outlives its purpose (the speaker first, then Masha when she is acting)
  const filled: Proposal[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    filled.push(c);
    const next = i + 1 < cuts.length ? cuts[i + 1].start : duration;
    let t = c.start + Math.max(c.want, hold(c));
    while (next - t >= SHOT_MIN + 0.3 && t - filled[filled.length - 1].start >= SHOT_MIN) {
      const speaker = input.dialogue.find((d) => d.start <= t + 0.2 && d.start + d.dur > t + 0.4);
      const activeAll = beats.filter((b) => b.start <= t && b.start + b.dur > t);
      const active = activeAll.find((b) => b.actor === "masha") ?? activeAll[activeAll.length - 1];
      const subj = speaker?.actor ?? active?.actor ?? null;
      const bothActive = activeAll.some((b) => b.actor === "masha") && activeAll.some((b) => b.actor === "bear");
      const kind: Kind = speaker ? "close"
        : active && LOCO.has(active.verb) && active.start + active.dur - t > 2 ? "tracking"
        : bothActive && near(t) ? "two"
        : subj && rnd() < 0.6 ? "medium" : "two";
      const want = Math.min(4, next - t);
      filled.push({ start: t, want, prio: speaker ? 5.5 : 0, kind, subject: kind === "two" ? null : subj, overridden: false, line: !!speaker });
      t += want;
    }
  }

  // 4. fix too-short shots (the weaker neighbour gives way), then split shots longer than SHOT_MAX
  let shots = filled.map((c, i) => ({ ...c, end: i + 1 < filled.length ? filled[i + 1].start : duration }));
  shots = shots.filter((x) => x.end - x.start > 1e-6);
  for (let guard = 0; guard < 50 && shots.length > 1; guard++) {
    const i = shots.findIndex((x) => x.end - x.start < SHOT_MIN - 1e-6);
    if (i < 0) break;
    const prev = i > 0 ? shots[i - 1] : null;
    const next = i + 1 < shots.length ? shots[i + 1] : null;
    const need = SHOT_MIN - (shots[i].end - shots[i].start);
    // borrow time from a neighbour that can spare it, so a strong short shot survives
    if (prev && prev.end - prev.start - need >= SHOT_MIN && (shots[i].prio >= prev.prio || !next)) { prev.end -= need; shots[i].start = prev.end; continue; }
    if (next && next.end - next.start - need >= SHOT_MIN && shots[i].prio >= next.prio) { next.start += need; shots[i].end = next.start; continue; }
    // otherwise merge with the neighbour; the stronger shot keeps the screen
    const nb = prev && (!next || prev.prio >= next.prio || !next) ? prev : next!;
    const keep = nb.prio > shots[i].prio ? nb : shots[i];
    const merged = { ...keep, start: Math.min(nb.start, shots[i].start), end: Math.max(nb.end, shots[i].end) };
    const lo = Math.min(shots.indexOf(nb), i);
    shots.splice(lo, 2, merged);
  }
  const split: typeof shots = [];
  for (const sh of shots) {
    const len = sh.end - sh.start;
    if (len <= SHOT_MAX) { split.push(sh); continue; }
    const n = Math.ceil(len / 5);
    for (let k = 0; k < n; k++) {
      // a long line stays on the speaker (close ↔ medium); other long shots alternate framing
      const alt: Kind = sh.kind === "tracking" ? "tracking" : sh.kind === "close" ? "medium" : sh.kind === "medium" ? "two" : sh.kind === "low_angle" ? "medium" : "medium";
      const kind: Kind = k % 2 === 0 ? sh.kind : alt;
      const subject = kind === "two" ? null : sh.subject ?? (sh.kind === "two" || sh.kind === "wide" ? "masha" : sh.subject);
      split.push({ ...sh, kind, subject, start: sh.start + (len * k) / n, end: sh.start + (len * (k + 1)) / n });
    }
  }

  // 5. camera keys; 180° rule: the camera stays on the same side of the masha–bear line from shot to shot
  let side = lineSide(posAt("masha", 0), posAt("bear", 0));
  return split.map((s) => {
    if (visibleAt("masha", s.start) && visibleAt("bear", s.start)) side = continueSide(posAt("masha", s.start), posAt("bear", s.start), side);
    const angle = (rnd() - 0.5) * (s.kind === "wide" ? 0.8 : 1.1);
    const { from, to } = framing(s.kind, s.subject, s.start, s.end, angle, side, posAt, visibleAt, rnd);
    return { start: r3(s.start), dur: r3(s.end) - r3(s.start), shot: shotName(s.kind), from, to, overridden: s.overridden };
  });
}

function shotName(k: Kind): Shot {
  if (k === "two") return "medium";
  return k;
}

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-6 ? [0, 1] : [v[0] / l, v[1] / l];
}
function rot(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/** Unit perpendicular to the masha→bear line on the side the default camera (+z) is on. */
function lineSide(m: Vec2, b: Vec2): Vec2 {
  const l = [b[0] - m[0], b[1] - m[1]] as Vec2;
  if (Math.hypot(l[0], l[1]) < 0.5 || Math.hypot(l[0], l[1]) > 16) return [0, 1];
  const p = norm([-l[1], l[0]]);
  return p[1] >= 0 ? p : [-p[0], -p[1]];
}

/** Perpendicular to the current masha→bear line, on the same side as the previous shot. */
function continueSide(m: Vec2, b: Vec2, prev: Vec2): Vec2 {
  const l: Vec2 = [b[0] - m[0], b[1] - m[1]];
  const len = Math.hypot(l[0], l[1]);
  if (len < 0.5 || len > 16) return prev;
  const p = norm([-l[1], l[0]]);
  return p[0] * prev[0] + p[1] * prev[1] >= 0 ? p : [-p[0], -p[1]];
}

function framing(
  kind: Kind, subject: ActorId | null, t0: number, t1: number, angle: number, side: Vec2,
  posAt: CameraPlanInput["posAt"], visibleAt: CameraPlanInput["visibleAt"], rnd: () => number,
): { from: CamKey; to: CamKey } {
  const m0 = posAt("masha", t0);
  const b0 = posAt("bear", t0);
  const mv = visibleAt("masha", t0);
  const bv = visibleAt("bear", t0);
  const mid: Vec2 = mv && bv ? [(m0[0] + b0[0]) / 2, (m0[1] + b0[1]) / 2] : mv ? m0 : bv ? b0 : [0, 0];
  const subj = subject ?? (mv ? "masha" : "bear");
  const sp = posAt(subj, t0);
  const op = posAt(subj === "masha" ? "bear" : "masha", t0);
  const dir = rot(side, angle);

  let from: CamKey;
  let to: CamKey;
  switch (kind) {
    case "wide": {
      const span = mv && bv ? dist(m0, b0) : 0;
      const d = 11 + Math.min(8, span * 0.6);
      from = key(mid, dir, d, 5.5, 0.8, 50);
      to = key(mid, dir, d * 0.94, 5.3, 0.8, 50);
      break;
    }
    case "two": {
      const span = mv && bv ? dist(m0, b0) : 0;
      const d = Math.max(5.5, span * 1.3 + 3.5);
      from = key(mid, dir, d, 2.2, 1.0, 45);
      to = key(mid, dir, d * 0.95, 2.1, 1.0, 45);
      break;
    }
    case "medium": {
      const d = subj === "bear" ? 5.6 : 4.0;
      const dd = faceDir(sp, op, dir, side);
      from = key(sp, dd, d, CHEST[subj] + 0.9, CHEST[subj], 40);
      to = key(sp, dd, d * 0.93, CHEST[subj] + 0.85, CHEST[subj], 40);
      break;
    }
    case "close": {
      const d = subj === "bear" ? 3.6 : 2.5;
      const dd = faceDir(sp, op, dir, side);
      from = key(sp, dd, d, HEAD_HEIGHT[subj] + 0.1, HEAD_HEIGHT[subj] - 0.05, 35);
      to = key(sp, dd, d * 0.92, HEAD_HEIGHT[subj] + 0.1, HEAD_HEIGHT[subj] - 0.05, 35);
      break;
    }
    case "low_angle": {
      const d = subj === "bear" ? 4.2 : 3.0;
      const dd = faceDir(sp, op, dir, side);
      from = key(sp, dd, d, 0.35, HEAD_HEIGHT[subj], 50);
      to = key(sp, dd, d * 0.92, 0.4, HEAD_HEIGHT[subj], 50);
      break;
    }
    case "over_shoulder": {
      const back = norm([op[0] - sp[0], op[1] - sp[1]]);
      const o: ActorId = subj === "masha" ? "bear" : "masha";
      const pos: Vec2 = [op[0] + back[0] * 1.2 + side[0] * 0.6, op[1] + back[1] * 1.2 + side[1] * 0.6];
      const h = HEAD_HEIGHT[o] * 0.95;
      from = { pos: clampCam([pos[0], h, pos[1]]), look: [sp[0], HEAD_HEIGHT[subj] * 0.9, sp[1]], fov: 40 };
      to = { pos: clampCam([pos[0] - back[0] * 0.15, h, pos[1] - back[1] * 0.15]), look: from.look, fov: 40 };
      break;
    }
    case "tracking": {
      const p1 = posAt(subj, t1);
      const mvDir = norm([p1[0] - sp[0], p1[1] - sp[1]]);
      let perp: Vec2 = [-mvDir[1], mvDir[0]];
      if (perp[0] * side[0] + perp[1] * side[1] < 0) perp = [-perp[0], -perp[1]];
      const dd = norm([perp[0] * 0.85 - mvDir[0] * 0.35, perp[1] * 0.85 - mvDir[1] * 0.35]);
      const d = subj === "bear" ? 7 : 5.5;
      from = key(sp, dd, d, 2.4, CHEST[subj], 45);
      to = key(p1, dd, d, 2.4, CHEST[subj], 45);
      break;
    }
  }
  void rnd;
  return { from, to };
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

/** Keep the camera inside the set bounds, above ground, out of the house box and trunk/bush footprints. */
export function clampCam(p: Vec3): Vec3 {
  let [x, y, z] = p;
  x = Math.max(SET_BOUNDS.minX + 1, Math.min(SET_BOUNDS.maxX - 1, x));
  z = Math.max(SET_BOUNDS.minZ + 1, Math.min(SET_BOUNDS.maxZ - 1, z));
  y = Math.max(0.3, Math.min(14, y));
  for (const b of OBSTACLES.boxes) {
    const m = 0.6;
    if (x > b.min[0] - m && x < b.max[0] + m && z > b.min[1] - m && z < b.max[1] + m && y < 7.5) {
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

/** Camera key at time t (eased between from/to), or null outside the plan. */
export function cameraAt(cues: CameraCue[], t: number): CamKey | null {
  const c = cues.find((q) => t >= q.start && t < q.start + q.dur) ?? cues[cues.length - 1];
  if (!c) return null;
  const k0 = Math.max(0, Math.min(1, (t - c.start) / Math.max(1e-6, c.dur)));
  const k = k0 * k0 * (3 - 2 * k0);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  return { pos: lerp(c.from.pos, c.to.pos), look: lerp(c.from.look, c.to.look), fov: c.from.fov + (c.to.fov - c.from.fov) * k };
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
  return Math.round(Math.max(-1, Math.min(1, Math.sin(a) * 1.2)) * 100) / 100;
}
