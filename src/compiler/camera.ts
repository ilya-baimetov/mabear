// Auto-cinematographer (spec §7.5). Pure and deterministic: variation comes from a seeded PRNG (remix cameraSeed).
// Priority: beat `shot` hint > automatic rules. Rules: establishing wide at episode start and on mark-cluster change;
// dialogue → medium-close on the speaker; 1–1.5 s reaction shot after slapstick/punchline; locomotion > 2 s →
// tracking; low_angle for Bear looming / Masha mischief; shot length 1.2–6 s; 180° rule; camera clamped to the set
// bounds and kept out of the house.
import { isInsideHouse, MARKS, OBSTACLES, SET_BOUNDS, sceneLocationAt, type MarkDef } from "../shared/bible/set";
import type { ActorId, CamKey, CameraCue, Shot, Vec2, Vec3 } from "../shared/schema";
import { ACTOR_IDS } from "../shared/schema";

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
  /** Actual actor heading; guest close shots should show the face, not assume it faces a lead. */
  facingAt?: (actor: ActorId, t: number) => number;
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

export const HEAD_HEIGHT: Record<ActorId, number> = { masha: 0.85, bear: 2.05, wolf_a: 1.65, wolf_b: 1.56, lady_bear: 1.85, hare: .58, rosie: .88, squirrel: .45, rival_bear: 2.2 };
const CHEST: Record<ActorId, number> = { masha: 0.6, bear: 1.25, wolf_a: 1.2, wolf_b: 1.13, lady_bear: 1.2, hare: .38, rosie: .55, squirrel: .27, rival_bear: 1.5 };
const isWolfId = (a: ActorId | null): boolean => a === "wolf_a" || a === "wolf_b";
/** Default cast of a two-shot / wide: the leads. The Wolves join only when they act (they never steal framing idle). */
const LEADS: ActorId[] = ["masha", "bear"];

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
  /** who a two-shot / wide frames (default: Masha and Bear) */
  cast?: ActorId[];
}
const castKey = (p: { cast?: ActorId[] }) => (p.cast ?? LEADS).join(",");

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
  // reaction partner: Masha ↔ Bear; after a Wolf's slapstick, Masha's (or Bear's) reaction
  const other = (a: ActorId, t: number): ActorId => (a === "masha" ? "bear" : a === "bear" ? "masha" : visibleAt("masha", t) ? "masha" : "bear");
  /** Cast for a Wolf beat's two-shot: both Wolves when close, else the Wolf and the nearest lead within 6 m. */
  const wolfCast = (b: CameraBeatInfo): ActorId[] | null => {
    const t = b.start + 0.1;
    const mate: ActorId = b.actor === "wolf_a" ? "wolf_b" : "wolf_a";
    const p = posAt(b.actor, t);
    if (visibleAt(mate, t) && dist(p, posAt(mate, t)) < 5 && beats.some((o) => o.actor === mate && o.start < b.start + b.dur - 0.3 && o.start + o.dur > b.start + 0.3)) return [b.actor, mate];
    let best: ActorId | null = null;
    let bd = 6;
    for (const l of LEADS) if (visibleAt(l, t) && dist(p, posAt(l, t)) < bd) { bd = dist(p, posAt(l, t)); best = l; }
    return best ? [b.actor, best] : null;
  };
  const props: Proposal[] = [];

  // 1. establishing shot
  const knownAt = (t: number) => {
    const k = new Set<string>();
    for (const a of ["masha", "bear"] as ActorId[]) if (visibleAt(a, Math.max(0, t))) k.add(clusterAt(posAt(a, Math.max(0, t))));
    return k;
  };
  if (input.isFirst) props.push({ start: 0, want: 2.5, prio: 5, kind: "wide", subject: null, overridden: false, establishing: true });

  // Priorities: beat hint 6 > the speaker for the WHOLE line 5.5 > episode establishing 5 > reaction 4.5 >
  // cluster establishing 3.5 > Masha (the star) acting: tracking 3.2, low angle 2.6, two-shot/medium 2.4 >
  // Bear acting: tracking 2.2, low angle 2, two-shot 1.6, medium 1.
  const near = (t: number) => visibleAt("masha", t) && visibleAt("bear", t) && dist(posAt("masha", t), posAt("bear", t)) < 8;
  const close6 = (t: number) => visibleAt("masha", t) && visibleAt("bear", t) && dist(posAt("masha", t), posAt("bear", t)) < 6;
  const parallel = (b: CameraBeatInfo) =>
    beats.some((o) => o.actor !== b.actor && o.start < b.start + b.dur - 0.3 && o.start + o.dur > b.start + 0.3);
  for (const b of beats) {
    const isLoco = LOCO.has(b.verb);
    const known = knownAt(b.start - 0.05);
    const star = b.actor === "masha";
    if (!LEADS.includes(b.actor) && b.shot === "auto" && !b.hasLine) {
      // Guest actors keep their own framing; only an active, nearby scene partner joins a two-shot.
      const companion=beats.find(o=>o.actor!==b.actor&&visibleAt(o.actor,b.start+.1)&&dist(posAt(b.actor,b.start+.1),posAt(o.actor,b.start+.1))<5&&o.start<b.start+b.dur-.3&&o.start+o.dur>b.start+.3);
      const cast = isWolfId(b.actor)?wolfCast(b):companion?[b.actor,companion.actor]:null;
      const kind: Kind = isLoco && b.dur > 2 ? "tracking" : cast ? "two" : "medium";
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: isLoco && b.dur > 2 ? 2.2 : 1.6, kind, subject: kind === "two" ? null : b.actor, overridden: false, cast: kind === "two" && cast ? cast : undefined });
    } else if (b.shot !== "auto") {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: 6, kind: hintKind(b.shot), subject: b.shot === "wide" ? null : b.actor, overridden: true, cast: b.shot === "wide" && !LEADS.includes(b.actor) ? [...LEADS, b.actor] : undefined });
    } else if (b.hasLine) {
      props.push({ start: b.lineStart, want: Math.max(SHOT_MIN, b.lineDur), prio: 5.5, kind: "close", subject: b.actor, overridden: false, line: true });
    } else if (isLoco && b.dur > 2) {
      // Bear walking past a nearby Masha → keep both in a moving two-shot (the star stays on screen)
      const pair = !star && close6(b.start + 0.1) && close6(b.start + b.dur - 0.1);
      props.push({ start: b.start, want: b.dur, prio: star ? 3.2 : 2.2, kind: pair ? "two" : "tracking", subject: pair ? null : b.actor, overridden: false });
    } else if ((star && b.emotion === "mischievous") || (b.actor === "bear" && ["angry_stomp", "chase", "carry", "angry"].some((v) => v === b.verb || v === b.emotion))) {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: star ? 2.6 : 2, kind: rnd() < 0.65 ? "low_angle" : "medium", subject: b.actor, overridden: false });
    } else if (parallel(b) && near(b.start + 0.1)) {
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: star ? 2.4 : 1.6, kind: "two", subject: null, overridden: false });
    } else {
      const two = near(b.start) && dist(posAt("masha", b.start), posAt("bear", b.start)) < 5 && rnd() < 0.35;
      props.push({ start: b.start, want: Math.max(SHOT_MIN, b.dur), prio: star ? 2.4 : 1, kind: two ? "two" : "medium", subject: two ? null : b.actor, overridden: false });
    }
    // arriving in a new cluster → establish it
    if (isLoco && visibleAt(b.actor, b.start + b.dur) && !known.has(clusterAt(b.to))) {
      props.push({ start: b.start + b.dur, want: 2.0, prio: 3.5, kind: "wide", subject: null, overridden: false, establishing: true, cast: !LEADS.includes(b.actor) ? [...LEADS, b.actor] : undefined });
    }
    // reaction shot on the other character after slapstick, or after the punchline line has ENDED
    const o = other(b.actor, b.start + b.dur);
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
    if (p.kind === last.kind && p.subject === last.subject && castKey(p) === castKey(last) && p.prio <= last.prio + 1) {
      last.want = Math.max(last.want, p.start + p.want - last.start);
      last.prio = Math.max(last.prio, p.prio);
      last.line = last.line || p.line;
      continue;
    }
    // lines, hints, establishing and reaction shots protect their whole window; plain action shots up to 3 s
    const fullProtect = last.line || last.overridden || last.establishing || last.prio >= 4.5;
    const protectedEnd = last.start + (last.prio > p.prio ? Math.max(hold(last), fullProtect ? last.want : Math.min(last.want, 3)) : hold(last));
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
        : active && isWolfId(active.actor) ? (LOCO.has(active.verb) && active.start + active.dur - t > 2 ? "tracking" : "medium")
        : active && LOCO.has(active.verb) && active.start + active.dur - t > 2 ? (active.actor === "bear" && close6(t) && close6(Math.min(next, t + 4) - 0.05) ? "two" : "tracking")
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
    if (prev && prev.end - prev.start - need >= SHOT_MIN && shots[i].prio >= prev.prio) { prev.end -= need; shots[i].start = prev.end; continue; }
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
    // cut points: prefer dialogue boundaries (never cut inside a line if avoidable), else even parts ≤ 5 s
    const bounds = input.dialogue.flatMap((d) => [d.start, d.start + d.dur]).filter((x) => x > sh.start + SHOT_MIN && x < sh.end - SHOT_MIN).sort((a, b) => a - b);
    const cutsAt: number[] = [];
    let cur = sh.start;
    while (sh.end - cur > SHOT_MAX) {
      const cand = bounds.filter((x) => x >= cur + SHOT_MIN && x <= cur + SHOT_MAX && sh.end - x >= SHOT_MIN);
      const inLine = (x: number) => input.dialogue.some((d) => x > d.start + 0.05 && x < d.start + d.dur - 0.05);
      const good = cand.filter((x) => !inLine(x));
      const rest = sh.end - cur;
      const next = good.length ? good[good.length - 1] : cur + Math.min(5, rest / Math.ceil(rest / 5));
      cutsAt.push(next);
      cur = next;
    }
    const edges = [sh.start, ...cutsAt, sh.end];
    for (let k = 0; k + 1 < edges.length; k++) {
      // a long line stays on the speaker (close ↔ medium); other long shots alternate framing
      const alt: Kind = sh.kind === "tracking" ? "tracking" : sh.kind === "close" ? "medium" : sh.kind === "medium" ? "two" : sh.kind === "low_angle" ? "medium" : "medium";
      const kind: Kind = k % 2 === 0 ? sh.kind : alt;
      // A group shot has no fixed subject. Resolve its participant at each cut;
      // inventing Masha here can select an entirely different, empty location.
      const subject = kind === "two" ? null : sh.subject;
      split.push({ ...sh, kind, subject, start: edges[k], end: edges[k + 1] });
    }
  }

  // 5. camera keys; 180° rule: the camera stays on the same side of the masha–bear line from shot to shot
  let side = lineSide(posAt("masha", 0), posAt("bear", 0));
  return split.map((s) => {
    if (visibleAt("masha", s.start) && visibleAt("bear", s.start)) side = continueSide(posAt("masha", s.start), posAt("bear", s.start), side);
    const angle = (rnd() - 0.5) * (s.kind === "wide" ? 0.8 : 1.1);
    // occlusion: try yaw nudges around the subject (staying on the 180° side) until no trunk / wall blocks the view
    const requestedCast = s.cast ?? LEADS;
    const action = beats.find(b => b.start <= s.start + .01 && b.start + b.dur > s.start && visibleAt(b.actor, s.start));
    const primary = (s.subject && visibleAt(s.subject, s.start) ? s.subject : null)
      ?? action?.actor
      ?? requestedCast.find(a => visibleAt(a, s.start))
      ?? ACTOR_IDS.find(a => visibleAt(a, s.start))
      ?? s.subject ?? beats[0]?.actor ?? 'masha';
    const place=sceneLocationAt(...posAt(primary,s.start));
    const cast=requestedCast.filter(a=>visibleAt(a,s.start)&&sceneLocationAt(...posAt(a,s.start))===place);
    if(!cast.includes(primary))cast.push(primary);
    const framedAt = (t: number): { head: Vec3; w: number }[] => {
      const out: { head: Vec3; w: number }[] = [];
      const guestSingle = !LEADS.includes(primary) && !isWolfId(primary) && !['wide','two','over_shoulder'].includes(s.kind);
      const who = guestSingle ? [primary] : cast;
      for (const a of who) {
        if (!visibleAt(a, t)) continue;
        const p = posAt(a, t);
        const w = s.kind === "wide" || s.kind === "two" || a === primary ? 1 : 0.5;
        out.push({ head: [p[0], input.headY ? input.headY(a, t) : HEAD_HEIGHT[a], p[1]], w });
      }
      return out;
    };
    const h0 = framedAt(s.start + 0.01);
    const h1 = framedAt(Math.max(s.start, s.end - 0.01));
    let best = framing(s.kind, primary, cast, s.start, s.end, angle, side, posAt, visibleAt, rnd, input.headY, input.facingAt);
    let bestCost = occlusionCost(best.from, h0) + occlusionCost(best.to, h1);
    for (const dlt of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      if (bestCost === 0) break;
      const a = angle + dlt;
      if (Math.abs(a) > 1.3) continue;
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, input.headY, input.facingAt);
      const cost = occlusionCost(fr.from, h0) + occlusionCost(fr.to, h1);
      if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; }
    }
    // still blocked (e.g. a trunk right beside the subject): swing further round, still on the 180° side
    for (const dlt of [1.45, -1.45, 1.6, -1.6]) {
      if (bestCost < 1) break;
      const a = Math.max(-1.6, Math.min(1.6, angle + dlt));
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, input.headY, input.facingAt);
      const cost = occlusionCost(fr.from, h0) + occlusionCost(fr.to, h1);
      if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; }
    }
    // still blocked (camera boxed in by trunks): fall back to a static medium, then a wide, from the clearest yaw
    let kind = s.kind;
    if (bestCost >= 1 && !s.overridden) {
      for (const alt of ["medium", "wide"] as Kind[]) {
        if (alt === s.kind) continue;
        for (const dlt of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
          const fr = framing(alt, primary, cast, s.start, s.end, Math.max(-1.3, Math.min(1.3, angle + dlt)), side, posAt, visibleAt, rnd, input.headY, input.facingAt);
          const cost = occlusionCost(fr.from, h0) + occlusionCost(fr.to, h1);
          if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; kind = alt; }
          if (bestCost < 1) break;
        }
        if (bestCost < 1) break;
      }
    }
    const { from, to } = best;
    from.location=sceneLocationAt(...posAt(primary,s.start+.001));
    to.location=sceneLocationAt(...posAt(primary,Math.max(s.start,s.end-.001)));
    let cutAt:number|undefined;
    if(from.location!==to.location){
      // A shot ending outdoors must still begin inside the room's open-side
      // composition. Framing both endpoints together otherwise chooses an
      // exterior orbit for its indoor half, looking through a retained wall.
      if(from.location==='house'){
        const origin=framing(s.kind,primary,cast,s.start,s.start,angle,side,posAt,visibleAt,rnd,input.headY,input.facingAt).from;
        Object.assign(from,origin,{location:from.location});
      }
      const endTime=Math.max(s.start,s.end-.001),destinationCast=requestedCast.filter(a=>sceneLocationAt(...posAt(a,endTime))===to.location);
      if(!destinationCast.includes(primary))destinationCast.push(primary);
      const destination=framing(s.kind,primary,destinationCast,endTime,endTime,angle,side,posAt,visibleAt,rnd,input.headY,input.facingAt).from;
      Object.assign(to,destination,{location:to.location});
      let lo=s.start,hi=s.end;
      for(let i=0;i<20;i++){const mid=(lo+hi)*.5;if(sceneLocationAt(...posAt(primary,mid))===from.location)lo=mid;else hi=mid;}
      cutAt=hi;
    }
    return { start: r3(s.start), dur: r3(s.end) - r3(s.start), shot: shotName(kind), from, to, overridden: s.overridden,...(cutAt===undefined?{}:{cutAt}) };
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

/** Tall static occluders: set obstacle circles (trunks, bush) plus trees the set dresses (hammock pines, swing oak). */
export const OCCLUDERS: { c: Vec2; r: number; h: number }[] = [
  ...OBSTACLES.circles.filter((c) => c.id !== "pond" && c.id !== "table").map((c) => ({ c: c.c, r: c.r, h: c.id === "bush" ? 1.3 : 12 })),
  // hammock pines: hammock at (-11, 2.2) rotated 0.8 rad (set element), pines at local x = ±2.1
  { c: [-9.54, 0.69], r: 0.45, h: 12 },
  { c: [-12.46, 3.71], r: 0.45, h: 12 },
  { c: [8.6, -0.6], r: 0.6, h: 12 }, // swing oak
];
const OCC_BOXES = OBSTACLES.boxes.map((b) => ({ id:b.id,min: b.min, max: b.max, h: b.id === "house" ? 7.5 : 2.6 }));

/** How badly static set pieces block a camera key: line of sight to each framed head (weighted), plus big trunks
 *  standing in frame in front of the subject. 0 = clear. */
export function occlusionCost(key: CamKey, heads: { head: Vec3; w: number }[]): number {
  const cam = key.pos;
  const location=key.location??sceneLocationAt(key.look[0],key.look[2]);
  // Each scenic location hides the others. Their absent trunks and walls must
  // not push this scene's camera away from an otherwise clear composition.
  const circles=location==='yard'?OCCLUDERS:[];
  const boxes=OCC_BOXES.filter(b=>b.id==='van'?location==='wolves':location==='yard');
  let cost = 0;
  for (const { head, w } of heads) {
    const dx = head[0] - cam[0];
    const dz = head[2] - cam[2];
    const L2 = dx * dx + dz * dz;
    for (const o of circles) {
      const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((o.c[0] - cam[0]) * dx + (o.c[1] - cam[2]) * dz) / L2));
      if (t <= 0.02 || t >= 0.97) continue;
      const px = cam[0] + dx * t;
      const pz = cam[2] + dz * t;
      const y = cam[1] + (head[1] - cam[1]) * t;
      if (Math.hypot(px - o.c[0], pz - o.c[1]) < o.r + 0.25 && y < o.h) cost += w;
    }
    const n = Math.max(4, Math.ceil(Math.sqrt(L2) / 0.25));
    for (const b of boxes) {
      if(b.id==='house'&&isInsideHouse(head[0],head[2]))continue; // exterior is cut away for indoor scenes
      for (let i = 1; i < n - 1; i++) {
        const t = i / n;
        const x = cam[0] + dx * t;
        const z = cam[2] + dz * t;
        const y = cam[1] + (head[1] - cam[1]) * t;
        if (x > b.min[0] - 0.1 && x < b.max[0] + 0.1 && z > b.min[1] - 0.1 && z < b.max[1] + 0.1 && y < b.h) { cost += w; break; }
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
    if (d < 0.3 || d > subjDist - 0.3) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (v[0] * f[0] + v[1] * f[1]) / d)));
    const wAng = Math.atan(o.r / d);
    if (ang - wAng < hfov / 2) cost += Math.min(1, wAng * 6);
  }
  return Math.round(cost * 1000) / 1000;
}

/** Perpendicular to the current masha→bear line, on the same side as the previous shot. */
function continueSide(m: Vec2, b: Vec2, prev: Vec2): Vec2 {
  const l: Vec2 = [b[0] - m[0], b[1] - m[1]];
  const len = Math.hypot(l[0], l[1]);
  if (len < 0.5 || len > 16) return prev;
  const p = norm([-l[1], l[0]]);
  return p[0] * prev[0] + p[1] * prev[1] >= 0 ? p : [-p[0], -p[1]];
}

/** Centre and span (max pairwise distance) of the visible members of a cast at time t. */
function castSpread(cast: ActorId[], t: number, posAt: CameraPlanInput["posAt"], visibleAt: CameraPlanInput["visibleAt"]): { mid: Vec2 | null; span: number } {
  const ps = cast.filter((a) => visibleAt(a, t)).map((a) => posAt(a, t));
  if (!ps.length) return { mid: null, span: 0 };
  let span = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) span = Math.max(span, dist(ps[i], ps[j]));
  const mid: Vec2 = [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  return { mid, span };
}

function framing(
  kind: Kind, subject: ActorId | null, cast: ActorId[], t0: number, t1: number, angle: number, side: Vec2,
  posAt: CameraPlanInput["posAt"], visibleAt: CameraPlanInput["visibleAt"], rnd: () => number,
  headY?: CameraPlanInput["headY"],
  facingAt?: CameraPlanInput["facingAt"],
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
  if(isInsideHouse(sp[0],sp[1])&&isInsideHouse(sp1[0],sp1[1])){
    // The authored room is a south-facing cutaway. Keep all indoor story shots
    // on that open side instead of orbiting behind the retained north wall.
    const wide=kind==='wide'||kind==='two',portrait=kind==='close';
    const indoorKey=(p:Vec2,h:number,t:number):CamKey=>{
      const occupants=cast.filter(a=>visibleAt(a,t)&&isInsideHouse(...posAt(a,t))).map(a=>posAt(a,t));
      const x=wide&&occupants.length?occupants.reduce((sum,p)=>sum+p[0],0)/occupants.length:p[0];
      const z=wide?-6.1:p[1],lookY=portrait?h*.88:wide?1.05:h*.65;
      const d=wide?5.6:portrait?Math.max(1.7,h*1.65):Math.max(3.1,h*2.1);
      return {pos:[r3(x+.2),r3(lookY+(wide?1.25:.35)),r3(z+d)],look:[r3(x),r3(lookY),r3(z)],fov:wide?46:portrait?35:40};
    };
    return {from:indoorKey(sp,hy0,t0),to:indoorKey(sp1,hy1,t1)};
  }
  const partner: ActorId = subj === "wolf_a" ? "wolf_b" : subj === "wolf_b" ? "wolf_a" : ['masha','lady_bear','rival_bear'].includes(subj) ? 'bear' : 'masha';
  const large=HEAD_HEIGHT[subj]>1.75,small=['hare','rosie','squirrel'].includes(subj);
  const op = posAt(partner, t0);
  // The wolves stand along the ambulance's west side. Frame group shots from
  // that open side: the usual south view stacks the pair and hides one wolf.
  const sceneSide:Vec2=sceneLocationAt(sp[0],sp[1])==='wolves'&&(kind==='wide'||kind==='two')?norm([-.9,.44]):side;
  const dir = rot(sceneSide, angle);
  const guestHeading = facingAt && !LEADS.includes(subj) && !isWolfId(subj) ? facingAt(subj,t0+.01) : null;
  const portraitDir = guestHeading === null ? faceDir(sp,op,dir,side) : rot([Math.sin(guestHeading),Math.cos(guestHeading)],angle);

  let from: CamKey;
  let to: CamKey;
  switch (kind) {
    case "wide": {
      const span = c0.span;
      // Establish the place at character height; avoid a distant, lawn-heavy aerial view.
      const d = 7.4 + Math.min(14, span * 0.8);
      const eyeY = 3.2 + Math.min(2.8, span * 0.08);
      from = key(mid, dir, d, eyeY, 1.0, 44);
      to = key(mid, dir, d * 0.94, eyeY - 0.1, 1.0, 44);
      break;
    }
    case "two": {
      // follows the pair's midpoint when they move during the shot
      const c1 = castSpread(cast, t1, posAt, visibleAt);
      const mid1: Vec2 = c1.mid ?? mid;
      const span = Math.max(c0.span, c1.span);
      const d = Math.max(5.5, span * 1.3 + 3.5);
      from = key(mid, dir, d, 2.2, 1.0, 45);
      to = key(dist(mid, mid1) > 1 ? mid1 : mid, dir, d * 0.95, 2.1, 1.0, 45);
      break;
    }
    case "medium": {
      const d = large ? 5.6 : small ? Math.max(1.8,HEAD_HEIGHT[subj]*3.8) : 4.0;
      const dd = portraitDir;
      const cy = hy0 - (HEAD_HEIGHT[subj] - CHEST[subj]);
      const cy1 = hy1 - (HEAD_HEIGHT[subj] - CHEST[subj]);
      from = key(sp, dd, d, cy + 0.9, cy, 40);
      to = key(sp1, dd, d * 0.93, cy1 + 0.85, cy1, 40);
      break;
    }
    case "close": {
      const d = large ? 3.6 : small ? Math.max(.9,HEAD_HEIGHT[subj]*1.7) : 2.5;
      const dd = portraitDir;
      from = key(sp, dd, d, hy0 + 0.1, hy0 - 0.05, 35);
      to = key(sp1, dd, d * 0.92, hy1 + 0.1, hy1 - 0.05, 35);
      break;
    }
    case "low_angle": {
      const d = subj === "bear" ? 4.2 : 3.0;
      const dd = faceDir(sp, op, dir, side);
      from = key(sp, dd, d, 0.35, hy0, 50);
      to = key(sp1, dd, d * 0.92, 0.4, hy1, 50);
      break;
    }
    case "over_shoulder": {
      const back = norm([op[0] - sp[0], op[1] - sp[1]]);
      const o: ActorId = partner;
      // lateral offset varies with the (occlusion-nudged) angle but never crosses the 180° line
      const lat = Math.max(0.25, 0.6 + angle * 0.9);
      const pos: Vec2 = [op[0] + back[0] * (1.2 + Math.abs(angle) * 0.4) + side[0] * lat, op[1] + back[1] * (1.2 + Math.abs(angle) * 0.4) + side[1] * lat];
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

function followTargets(subj: ActorId, t0: number, t1: number, posAt: CameraPlanInput["posAt"]): [Vec2, Vec2] {
  const p0 = posAt(subj, t0);
  const p1 = posAt(subj, t1);
  if (dist(p0, p1) < 0.5) return [p0, p0];
  const pm = posAt(subj, (t0 + t1) / 2);
  const cands: [Vec2, Vec2][] = [[p0, p1], [p1, p1], [p0, p0], [pm, p1], [p0, pm], [pm, pm]];
  let best = cands[0];
  let bestErr = Infinity;
  for (const [a, b] of cands) {
    let err = 0;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const e = u * u * (3 - 2 * u);
      const q = posAt(subj, t0 + (t1 - t0) * u);
      err += Math.hypot(a[0] + (b[0] - a[0]) * e - q[0], a[1] + (b[1] - a[1]) * e - q[1]);
    }
    if (err < bestErr - 1e-6) { bestErr = err; best = [a, b]; }
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
  if(c.from.location&&c.to.location&&c.from.location!==c.to.location)return t<(c.cutAt??c.start+c.dur*.5)?c.from:c.to;
  const k0 = Math.max(0, Math.min(1, (t - c.start) / Math.max(1e-6, c.dur)));
  const k = k0 * k0 * (3 - 2 * k0);
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  return { pos: lerp(c.from.pos, c.to.pos), look: lerp(c.from.look, c.to.look), fov: c.from.fov + (c.to.fov - c.from.fov) * k,location:c.from.location??c.to.location };
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
