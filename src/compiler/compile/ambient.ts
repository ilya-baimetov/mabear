import { GRAMMAR, isWolf } from "../../shared/grammar";
import { ACTOR_IDS, type ActorClip, type ActorId, type Vec2, type Verb } from "../../shared/schema";
import { yawTo } from "../path";
import { otherActor } from "../validate";
import {
  addFx,
  type BeatTiming,
  type CompileContext,
  dist,
  headAt,
  posAt,
  postureAt,
  r3,
  stateAt,
} from "./context";

/** Who an idle character watches at time t: whoever's beat covers t (latest start), else its partner. */
function focusAt(ctx: CompileContext, a: ActorId, o: ActorId, t: number): ActorId {
  let best: BeatTiming | null = null;
  for (const tm of ctx.timings) if (tm.actor !== a && tm.start <= t && t < tm.end && (!best || tm.start >= best.start)) best = tm;
  if (best && postureAt(ctx, best.actor, t) !== "offstage") return best.actor;
  if (isWolf(a) && postureAt(ctx, o, t) === "offstage") return postureAt(ctx, "bear", t) !== "offstage" ? "bear" : "masha";
  return o;
}

/** A clip Masha plays on Bear's shoulders follows Bear's path over the clip's interval. */
function rideAlong(ctx: CompileContext, c: ActorClip): ActorClip {
  const t0 = c.start;
  const t1 = c.start + c.dur;
  const p0 = posAt(ctx, "bear", t0);
  const p1 = posAt(ctx, "bear", t1);
  const params = { ...c.params, from: [r3(p0[0]), r3(p0[1])] as Vec2 };
  if (dist(p0, p1) > 0.05) {
    const pts: Vec2[] = [];
    for (let k = 0; k <= 4; k++) {
      const q = posAt(ctx, "bear", t0 + ((t1 - t0) * k) / 4);
      pts.push([r3(q[0]), r3(q[1])]);
    }
    params.to = pts[pts.length - 1];
    params.path = pts;
  } else {
    delete params.to;
    delete params.path;
  }
  return { ...c, params };
}

function ambientSpan(ctx: CompileContext, a: ActorId, o: ActorId, s: number, e: number): ActorClip[] {
  const out: ActorClip[] = [];
  const st = stateAt(ctx, a, s);
  const posture = st.posture;
  const verbFor = (): Verb => (posture === "sleep" ? "sleep" : "idle");
  // reactions to loud beats of the others (the Wolves only react to Bear — they cower)
  const wolf = isWolf(a);
  const reactions = ctx.timings.filter((tm) => tm.actor !== a && (wolf ? tm.scary : tm.loud) && tm.mainStart + 0.25 >= s && tm.mainStart + 0.25 < e);
  let t = s;
  const pushIdle = (from: number, to: number) => {
    // split at the other actor's beat boundaries (look-at follows the action), max 4 s each
    const cuts = new Set<number>([from, to]);
    for (const tm of ctx.timings) if (tm.actor !== a) for (const x of [tm.start, tm.end]) if (x > from + 0.5 && x < to - 0.5) cuts.add(x);
    const pts = [...cuts].sort((x, y) => x - y);
    const fine: number[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const span = pts[i] - fine[fine.length - 1];
      const n = Math.ceil(span / 4);
      for (let k = 1; k <= n; k++) fine.push(fine[fine.length - 1] + (pts[i] - fine[fine.length - 1]) / (n - k + 1));
    }
    for (let i = 1; i < fine.length; i++) {
      const c0 = fine[i - 1];
      const c1 = fine[i];
      if (c1 - c0 < 1e-6) continue;
      const mid = (c0 + c1) / 2;
      const f = focusAt(ctx, a, o, mid);
      const look = postureAt(ctx, f, mid) !== "offstage" && posture !== "sleep" ? headAt(ctx, f, mid) : undefined;
      const p0 = posAt(ctx, a, c0);
      const params: ActorClip["params"] = { from: p0, facing: st.facing, posture, item: st.holding ?? undefined, lookAt: look, ambient: true };
      if (posture === "carried") {
        const p1 = posAt(ctx, a, c1);
        params.to = p1;
        params.path = [p0, posAt(ctx, a, mid), p1];
      }
      out.push({ start: c0, dur: c1 - c0, verb: verbFor(), emotion: posture === "sleep" ? "sleepy" : "neutral", params });
    }
  };
  for (const r of reactions) {
    if (posture === "sleep" || posture === "offstage") break;
    const rt = r.mainStart + 0.25;
    const verb: Verb = wolf
      ? "scared"
      : a === "masha"
        ? r.verb === "fall_down" || r.verb === "sneeze" || r.verb === "laugh"
          ? "laugh"
          : "surprised"
        : r.verb === "laugh"
          ? "nod"
          : "surprised";
    const rd = GRAMMAR[verb].baseDuration;
    if (rt < t || rt + rd > e) continue;
    if (rt > t + 1e-6) pushIdle(t, rt);
    const ro = r.actor;
    out.push({
      start: rt,
      dur: rd,
      verb,
      emotion: verb === "laugh" || verb === "nod" ? "happy" : verb === "scared" ? "scared" : "surprised",
      params: {
        from: posAt(ctx, a, rt),
        facing: r3(yawTo(posAt(ctx, a, rt), posAt(ctx, ro, rt), st.facing)),
        posture,
        item: st.holding ?? undefined,
        lookAt: headAt(ctx, ro, rt),
        ambient: true,
        target: ro,
      },
    });
    t = rt + rd;
  }
  if (e > t + 1e-6) pushIdle(t, e);
  // zzz while asleep
  if (posture === "sleep" && e - s > 1) {
    const h = headAt(ctx, a, s);
    addFx(ctx, "zzz", s, e - s, [h[0], h[1] + 0.5, h[2]]);
  }
  return out;
}

function fillAmbientForActor(ctx: CompileContext, a: ActorId, duration: number): ActorClip[] {
  const o = otherActor(a);
  const clips = [...ctx.tracks[a].clips].sort((x, y) => x.start - y.start).map((c) => (a === "masha" && c.params.posture === "carried" ? rideAlong(ctx, c) : c));
  const out: ActorClip[] = [];
  let t = 0;
  for (const c of clips) {
    if (c.start > t + 1e-6 && c.start - t < 0.25 && out.length) out[out.length - 1] = { ...out[out.length - 1], dur: c.start - out[out.length - 1].start };
    else if (c.start > t + 1e-6) out.push(...ambientSpan(ctx, a, o, t, c.start));
    const s = Math.max(c.start, t);
    out.push({ ...c, start: s, dur: c.start + c.dur - s });
    t = c.start + c.dur;
  }
  if (duration > t + 1e-6) out.push(...ambientSpan(ctx, a, o, t, duration));
  // round consistently so clips are exactly contiguous
  const rounded: ActorClip[] = [];
  for (const c of out) {
    const s = r3(c.start);
    const e = r3(c.start + c.dur);
    if (e - s <= 1e-9) continue;
    const prev = rounded[rounded.length - 1];
    const start = prev ? r3(prev.start + prev.dur) : 0;
    rounded.push({ ...c, start, dur: r3(e - start) });
  }
  if (rounded.length) {
    const last = rounded[rounded.length - 1];
    last.dur = r3(duration - last.start);
  }
  return rounded;
}

/** Fills contiguous ambient idle/look/cower clips across [0, duration] for every actor. */
export function fillAmbient(ctx: CompileContext, duration: number): Record<ActorId, ActorClip[]> {
  const partial: Partial<Record<ActorId, ActorClip[]>> = {};
  for (const id of ACTOR_IDS) partial[id] = fillAmbientForActor(ctx, id, duration);
  return partial as Record<ActorId, ActorClip[]>;
}
