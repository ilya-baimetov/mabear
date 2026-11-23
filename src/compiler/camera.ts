// Auto-cinematographer (spec §7.5). Pure and deterministic: variation comes from a seeded PRNG (remix cameraSeed).
// Priority: beat `shot` hint > automatic rules. Rules: establishing wide at episode start and on mark-cluster change;
// dialogue → medium-close on the speaker; 1–1.5 s reaction shot after slapstick/punchline; locomotion > 2 s →
// tracking; low_angle for Bear looming / Masha mischief; shot length 1.2–6 s; 180° rule; camera clamped to the set
// bounds and kept out of the house.
import { sceneLocationAt } from "../shared/bible/set";
import { ACTOR_IDS, type ActorId, type CameraCue, type Shot } from "../shared/schema";
import { cameraAt, clusterAt, continueSide, lineSide, mulberry32, panFor, resolveShotCue } from "./camera/framing";
import {
  actorOcclusionCost,
  CAMERA_BODY_RADIUS,
  type CameraActorVolume,
  type CameraBeatInfo,
  type CameraPlanInput,
  type CameraTarget,
  clampCam,
  dist,
  HEAD_HEIGHT,
  type Kind,
  LEADS,
  OCCLUDERS,
  occlusionCost,
  type Proposal,
  SHOT_MAX,
  SHOT_MIN,
} from "./camera/occlusion";

export {
  actorOcclusionCost,
  CAMERA_BODY_RADIUS,
  cameraAt,
  clampCam,
  clusterAt,
  HEAD_HEIGHT,
  mulberry32,
  OCCLUDERS,
  occlusionCost,
  panFor,
  SHOT_MAX,
  SHOT_MIN,
  type CameraActorVolume,
  type CameraBeatInfo,
  type CameraPlanInput,
  type CameraTarget,
};

const isWolfId = (a: ActorId | null): boolean => a === "wolf_a" || a === "wolf_b";
const castKey = (p: { cast?: ActorId[] }) => (p.cast ?? LEADS).join(",");
const LOCO = new Set(["walk_to", "run_to", "tiptoe_to", "chase", "enter", "exit"]);
const SLAPSTICK = new Set(["fall_down", "sneeze", "surprised", "scared"]);

function hintKind(s: Shot): Kind {
  return s === "auto" ? "medium" : (s as Kind);
}

/** Plans deterministic, occlusion-free camera cuts covering [0, input.duration]. */
export function planCamera(input: CameraPlanInput): CameraCue[] {
  const { duration } = input;
  // Candidate cameras reuse the same actor samples. Cache pure compiler queries
  // within this plan instead of rescanning every clip for every candidate yaw.
  const memo = <T>(fn: (actor: ActorId, time: number) => T) => {
    const values = new Map<ActorId, Map<number, T>>();
    return (actor: ActorId, time: number): T => {
      let byTime = values.get(actor);
      if (!byTime) {
        byTime = new Map();
        values.set(actor, byTime);
      }
      if (!byTime.has(time)) byTime.set(time, fn(actor, time));
      return byTime.get(time)!;
    };
  };
  const posAt = memo(input.posAt);
  const visibleAt = memo(input.visibleAt);
  const headY = input.headY ? memo(input.headY) : undefined;
  const facingAt = input.facingAt ? memo(input.facingAt) : undefined;
  const carriedByAt = input.carriedByAt ? memo(input.carriedByAt) : undefined;
  const rnd = mulberry32((input.cameraSeed * 7919 + 17) | 0);
  const beats = [...input.beats].sort((a, b) => a.start - b.start);
  // reaction partner: Masha ↔ Bear; after a Wolf's slapstick, Masha's (or Bear's) reaction
  const other = (a: ActorId, t: number): ActorId => (a === "masha" ? "bear" : a === "bear" ? "masha" : visibleAt("masha", t) ? "masha" : "bear");
  /** Cast for a Wolf beat's two-shot: both Wolves when close, else the Wolf and the nearest lead within 6 m. */
  const wolfCast = (b: CameraBeatInfo): ActorId[] | null => {
    const t = b.start + 0.1;
    const mate: ActorId = b.actor === "wolf_a" ? "wolf_b" : "wolf_a";
    const p = posAt(b.actor, t);
    if (visibleAt(mate, t) && dist(p, posAt(mate, t)) < 5 && beats.some((o) => o.actor === mate && o.start < b.start + b.dur - 0.3 && o.start + o.dur > b.start + 0.3)) {
      return [b.actor, mate];
    }
    let best: ActorId | null = null;
    let bd = 6;
    for (const l of LEADS) {
      if (visibleAt(l, t) && dist(p, posAt(l, t)) < bd) {
        bd = dist(p, posAt(l, t));
        best = l;
      }
    }
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
  const parallel = (b: CameraBeatInfo) => beats.some((o) => o.actor !== b.actor && o.start < b.start + b.dur - 0.3 && o.start + o.dur > b.start + 0.3);
  const mounting = (b: CameraBeatInfo) => b.verb === "sleep" && dist(b.from, b.to) > 0.2;
  for (const b of beats) {
    const isLoco = LOCO.has(b.verb);
    const known = knownAt(b.start - 0.05);
    const star = b.actor === "masha";
    if (b.verb === "hug" || b.verb === "wake_up" || b.verb === "carry" || mounting(b)) {
      const t = b.start + b.dur * 0.5;
      const p = posAt(b.actor, t);
      const location = sceneLocationAt(...p);
      const partner = ACTOR_IDS.filter((a) => a !== b.actor && visibleAt(a, t) && sceneLocationAt(...posAt(a, t)) === location && dist(posAt(a, t), p) < 10).sort(
        (a, c) => dist(posAt(a, t), p) - dist(posAt(c, t), p),
      )[0];
      props.push({
        start: b.start,
        want: Math.max(SHOT_MIN, b.dur),
        prio: 6.2,
        kind: b.shot === "wide" ? "wide" : "two",
        subject: null,
        overridden: b.shot !== "auto",
        cast: partner ? [b.actor, partner] : [b.actor],
      });
    } else if (!LEADS.includes(b.actor) && b.shot === "auto" && !b.hasLine) {
      // Guest actors keep their own framing; only an active, nearby scene partner joins a two-shot.
      const companion = beats.find(
        (o) =>
          o.actor !== b.actor &&
          visibleAt(o.actor, b.start + 0.1) &&
          dist(posAt(b.actor, b.start + 0.1), posAt(o.actor, b.start + 0.1)) < 5 &&
          o.start < b.start + b.dur - 0.3 &&
          o.start + o.dur > b.start + 0.3,
      );
      const cast = isWolfId(b.actor) ? wolfCast(b) : companion ? [b.actor, companion.actor] : null;
      const kind: Kind = isLoco && b.dur > 2 ? "tracking" : cast ? "two" : "medium";
      props.push({
        start: b.start,
        want: Math.max(SHOT_MIN, b.dur),
        prio: isLoco && b.dur > 2 ? 2.2 : 1.6,
        kind,
        subject: kind === "two" ? null : b.actor,
        overridden: false,
        cast: kind === "two" && cast ? cast : undefined,
      });
    } else if (b.shot !== "auto") {
      props.push({
        start: b.start,
        want: Math.max(SHOT_MIN, b.dur),
        prio: 6,
        kind: hintKind(b.shot),
        subject: b.shot === "wide" ? null : b.actor,
        overridden: true,
        cast: b.shot === "wide" && !LEADS.includes(b.actor) ? [...LEADS, b.actor] : undefined,
      });
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
      props.push({
        start: b.start + b.dur,
        want: 2.0,
        prio: 3.5,
        kind: "wide",
        subject: null,
        overridden: false,
        establishing: true,
        cast: !LEADS.includes(b.actor) ? [...LEADS, b.actor] : undefined,
      });
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
      else {
        cuts.push({ ...p, start: 0 });
        continue;
      }
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
    if (p.start >= protectedEnd - 1e-6) {
      cuts.push(p);
      continue;
    }
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
      const kind: Kind = speaker
        ? "close"
        : active && isWolfId(active.actor)
          ? LOCO.has(active.verb) && active.start + active.dur - t > 2
            ? "tracking"
            : "medium"
          : active && LOCO.has(active.verb) && active.start + active.dur - t > 2
            ? active.actor === "bear" && close6(t) && close6(Math.min(next, t + 4) - 0.05)
              ? "two"
              : "tracking"
            : bothActive && near(t)
              ? "two"
              : subj && rnd() < 0.6
                ? "medium"
                : "two";
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
    if (prev && prev.end - prev.start - need >= SHOT_MIN && shots[i].prio >= prev.prio) {
      prev.end -= need;
      shots[i].start = prev.end;
      continue;
    }
    if (next && next.end - next.start - need >= SHOT_MIN && shots[i].prio >= next.prio) {
      next.start += need;
      shots[i].end = next.start;
      continue;
    }
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
    if (len <= SHOT_MAX) {
      split.push(sh);
      continue;
    }
    // cut points: prefer dialogue boundaries (never cut inside a line if avoidable), else even parts ≤ 5 s
    const bounds = input.dialogue
      .flatMap((d) => [d.start, d.start + d.dur])
      .filter((x) => x > sh.start + SHOT_MIN && x < sh.end - SHOT_MIN)
      .sort((a, b) => a - b);
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
  const rc = { beats, posAt, visibleAt, headY, facingAt, carriedByAt, rnd, mounting };
  return split.map((s) => {
    if (visibleAt("masha", s.start) && visibleAt("bear", s.start)) side = continueSide(posAt("masha", s.start), posAt("bear", s.start), side);
    return resolveShotCue(s, side, rc);
  });
}
