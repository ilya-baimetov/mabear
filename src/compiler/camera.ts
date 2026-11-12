// Auto-cinematographer (spec §7.5). Pure and deterministic: variation comes from a seeded PRNG (remix cameraSeed).
// Priority: beat `shot` hint > automatic rules. Rules: establishing wide at episode start and on mark-cluster change;
// dialogue → medium-close on the speaker; 1–1.5 s reaction shot after slapstick/punchline; locomotion > 2 s →
// tracking; low_angle for Bear looming / Masha mischief; shot length 1.2–6 s; 180° rule; camera clamped to the set
// bounds and kept out of the house.
import { isInsideHouse, MARKS, OBSTACLES, SET_BOUNDS, sceneLocationAt, type MarkDef } from "../shared/bible/set";
import type { ActorId, CamKey, CameraCue, Shot, Vec2, Vec3 } from "../shared/schema";
import { ACTOR_IDS } from "../shared/schema";
import {forestCameraOccluders,type SceneryOccluder} from '../shared/forestLayout';
import {houseWorld,HOUSE_LIVING_MARK} from '../shared/houseLayout';

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
export const CAMERA_BODY_RADIUS:Record<ActorId,number>={masha:.23,bear:.76,wolf_a:.40,wolf_b:.42,lady_bear:.62,hare:.19,rosie:.31,squirrel:.16,rival_bear:.94};
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
  const {duration}=input;
  // Candidate cameras reuse the same actor samples. Cache pure compiler queries
  // within this plan instead of rescanning every clip for every candidate yaw.
  const memo=<T>(fn:(actor:ActorId,time:number)=>T)=>{
    const values=new Map<ActorId,Map<number,T>>();
    return(actor:ActorId,time:number):T=>{
      let byTime=values.get(actor);if(!byTime){byTime=new Map();values.set(actor,byTime);}
      if(!byTime.has(time))byTime.set(time,fn(actor,time));
      return byTime.get(time)!;
    };
  };
  const posAt=memo(input.posAt),visibleAt=memo(input.visibleAt);
  const headY=input.headY?memo(input.headY):undefined,facingAt=input.facingAt?memo(input.facingAt):undefined;
  const carriedByAt=input.carriedByAt?memo(input.carriedByAt):undefined;
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
  const mounting=(b:CameraBeatInfo)=>b.verb==='sleep'&&dist(b.from,b.to)>.2;
  for (const b of beats) {
    const isLoco = LOCO.has(b.verb);
    const known = knownAt(b.start - 0.05);
    const star = b.actor === "masha";
    if(b.verb==='hug'||b.verb==='wake_up'||b.verb==='carry'||mounting(b)){
      const t=b.start+b.dur*.5,p=posAt(b.actor,t),location=sceneLocationAt(...p);
      const partner=ACTOR_IDS.filter(a=>a!==b.actor&&visibleAt(a,t)&&sceneLocationAt(...posAt(a,t))===location&&dist(posAt(a,t),p)<10)
        .sort((a,c)=>dist(posAt(a,t),p)-dist(posAt(c,t),p))[0];
      props.push({start:b.start,want:Math.max(SHOT_MIN,b.dur),prio:6.2,kind:b.shot==='wide'?'wide':'two',subject:null,
        overridden:b.shot!=='auto',cast:partner?[b.actor,partner]:[b.actor]});
    } else if (!LEADS.includes(b.actor) && b.shot === "auto" && !b.hasLine) {
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
    const houseExitBeat=beats.find(b=>b.verb==='stand_up'&&b.start<s.end&&b.start+b.dur>s.start&&visibleAt(b.actor,s.start)&&sceneLocationAt(...posAt(b.actor,s.start))==='house');
    const primary = houseExitBeat?.actor ?? (s.subject && visibleAt(s.subject, s.start) ? s.subject : null)
      ?? s.cast?.find(a=>visibleAt(a,s.start))
      ?? action?.actor
      ?? requestedCast.find(a => visibleAt(a, s.start))
      ?? ACTOR_IDS.find(a => visibleAt(a, s.start))
      ?? s.subject ?? beats[0]?.actor ?? 'masha';
    const place=sceneLocationAt(...posAt(primary,s.start));
    const cast=requestedCast.filter(a=>visibleAt(a,s.start)&&sceneLocationAt(...posAt(a,s.start))===place);
    if(!cast.includes(primary))cast.push(primary);
    const embrace=beats.some(b=>b.verb==='hug'&&b.start<s.end&&b.start+b.dur>s.start);
    const mountBeat=beats.find(b=>mounting(b)&&b.start<s.end&&b.start+b.dur>s.start);
    const liftBeat=beats.find(b=>b.verb==='carry'&&b.start<s.end&&b.start+b.dur>s.start);
    const ridePairsAt=(t:number)=>{
      const pairs=ACTOR_IDS.flatMap(rider=>{
        const carrier=carriedByAt?.(rider,t);
        return carrier&&visibleAt(rider,t)&&visibleAt(carrier,t)?[{rider,carrier}]:[];
      });
      if(liftBeat&&t>=liftBeat.start&&t<liftBeat.start+liftBeat.dur){
        const rider=cast.find(actor=>actor!==liftBeat.actor&&visibleAt(actor,t));
        if(rider&&!pairs.some(pair=>pair.rider===rider))pairs.push({rider,carrier:liftBeat.actor});
      }
      return pairs;
    };
    const rides=[s.start,(s.start+s.end)/2,s.end-.001].flatMap(ridePairsAt);
    const houseFurnitureExit=!!houseExitBeat;
    const followActor=houseFurnitureExit?primary:s.kind==='tracking'&&place!=='house'&&rides.some(pair=>pair.carrier===primary)?primary:undefined;
    const viewHeading=(actor:ActorId,t:number)=>{
      if(actor===followActor){const a=posAt(actor,Math.max(s.start,t-.05)),b=posAt(actor,Math.min(s.end,t+.05));if(dist(a,b)>.01)return Math.atan2(b[0]-a[0],b[1]-a[1]);}
      return facingAt?.(actor,t)??0;
    };
    const physicalAction=!!liftBeat||rides.length>0||beats.some(b=>(b.verb==='wake_up'||b.verb==='hug'||b.verb==='fall_down'||b.verb==='stand_up'||mounting(b))&&b.start<s.end&&b.start+b.dur>s.start);
    const targetCache=new Map<string,CameraTarget[]>(),actorCache=new Map<number,CameraActorVolume[]>();
    const framedAt = (t: number,kind:Kind=s.kind,viewCast=cast): CameraTarget[] => {
      const cacheKey=`${kind}/${viewCast.join(",")}/${t}`,cached=targetCache.get(cacheKey);if(cached)return cached;
      const out: CameraTarget[] = [];
      const who = new Set(kind==='wide'||kind==='two' ? viewCast : [primary]);
      for(const {rider,carrier} of ridePairsAt(t))if(who.has(rider)||who.has(carrier)){who.add(rider);who.add(carrier);}
      if(liftBeat&&t>=liftBeat.start&&t<liftBeat.start+liftBeat.dur)for(const actor of cast)who.add(actor);
      for (const a of who) {
        if (!visibleAt(a, t)||sceneLocationAt(...posAt(a,t))!==sceneLocationAt(...posAt(primary,t))) continue;
        const p = posAt(a, t);
        const hy=headY?headY(a,t):HEAD_HEIGHT[a];
        out.push({actor:a,head:[p[0],hy,p[1]],w:1});
        if(kind!=='close'){
          const chest=Math.max(.25,hy-(HEAD_HEIGHT[a]-CHEST[a]));
          out.push({actor:a,head:[p[0],chest,p[1]],w:.45});
          if(physicalAction){
            const yaw=facingAt?.(a,t)??0,r=CAMERA_BODY_RADIUS[a]*.7;
            for(const sign of [-1,0,1])out.push({actor:a,head:[p[0]+Math.cos(yaw)*r*sign,Math.max(.3,hy-.22),p[1]-Math.sin(yaw)*r*sign],w:.5});
            // A reclining actor occupies the length of the furniture, not a
            // standing cylinder above its root. Retain both ends through the
            // landing/recline, including the head beyond the root's footprint.
            if(mountBeat?.actor===a){
              const reach=HEAD_HEIGHT[a]*.72;
              for(const sign of [-1,1])out.push({actor:a,head:[mountBeat.to[0]+Math.cos(yaw)*reach*sign,Math.max(.7,hy),mountBeat.to[1]-Math.sin(yaw)*reach*sign],w:.4,framingOnly:true});
            }
          }
        }
      }
      targetCache.set(cacheKey,out);return out;
    };
    const actorsAt=(t:number):CameraActorVolume[]=>{
      const cached=actorCache.get(t);if(cached)return cached;
      const actors=ACTOR_IDS.filter(a=>visibleAt(a,t)).map(a=>({
      actor:a,pos:posAt(a,t),headY:headY?headY(a,t):HEAD_HEIGHT[a],radius:CAMERA_BODY_RADIUS[a],
    }));actorCache.set(t,actors);return actors;
    };
    const costAt=(key:CamKey,t:number,kind:Kind,viewCast=cast)=>{
      key={...key,location:sceneLocationAt(...posAt(primary,t))};
      if(followActor){
        const p=posAt(followActor,t),dx=p[0]-key.look[0],dz=p[1]-key.look[2];
        key={...key,pos:[key.pos[0]+dx,key.pos[1],key.pos[2]+dz],look:[p[0],key.look[1],p[1]]};
      }
      const targets=framedAt(t,kind,viewCast);
      const sightTargets=targets.filter(target=>!target.framingOnly);
      let cost=occlusionCost(key,sightTargets)+actorOcclusionCost(key,sightTargets,actorsAt(t),kind==='over_shoulder');
      if(physicalAction){
        const vx=key.look[0]-key.pos[0],vy=key.look[1]-key.pos[1],vz=key.look[2]-key.pos[2],flat=Math.hypot(vx,vz)||1,length=Math.hypot(vx,vy,vz)||1;
        const forward=[vx/length,vy/length,vz/length],right=[-vz/flat,0,vx/flat],up=[-forward[1]*right[2],forward[0]*right[2]-forward[2]*right[0],forward[1]*right[0]],tanV=Math.tan(key.fov*Math.PI/360);
        for(const target of targets){
          const delta=target.head.map((v,i)=>v-key.pos[i]),dot=(v:number[])=>delta.reduce((sum,d,i)=>sum+d*v[i],0),depth=dot(forward);
          if(depth<=.1){cost+=target.w*8;continue;}
          cost+=target.w*4*(Math.max(0,Math.abs(dot(right)/(depth*tanV*16/9))-.76)+Math.max(0,Math.abs(dot(up)/(depth*tanV))-.82));
        }
        if(mountBeat&&t>=mountBeat.start&&facingAt){
          const p=posAt(mountBeat.actor,t),direction=norm([key.pos[0]-p[0],key.pos[2]-p[1]]),yaw=facingAt(mountBeat.actor,t);
          cost+=Math.max(0,-direction[0]*Math.sin(yaw)-direction[1]*Math.cos(yaw))*3;
        }
      }
      if(facingAt&&!['wide','two','over_shoulder'].includes(kind)){
        const p=posAt(primary,t),direction=norm([key.pos[0]-p[0],key.pos[2]-p[1]]),heading=viewHeading(primary,t);
        // A back view is sometimes unavoidable, but must lose to an equally
        // clear three-quarter view of the actual actor, not an assumed partner.
        cost+=Math.max(0,.3-direction[0]*Math.sin(heading)-direction[1]*Math.cos(heading))*.7;
      }
      if(embrace&&facingAt&&(kind==='two'||kind==='wide'))for(const actor of viewCast){
        const p=posAt(actor,t),direction=norm([key.pos[0]-p[0],key.pos[2]-p[1]]),heading=facingAt(actor,t);
        // Opposing eyelines need a side view between the partners, where both
        // profiles and the contact remain visible instead of one hood/back.
        cost+=Math.max(0,-direction[0]*Math.sin(heading)-direction[1]*Math.cos(heading))*.8;
      }
      if(facingAt)for(const {rider,carrier} of ridePairsAt(t)){
        if(!targets.some(target=>target.actor===rider))continue;
        const p=posAt(carrier,t),direction=norm([key.pos[0]-p[0],key.pos[2]-p[1]]),yaw=viewHeading(carrier,t),front=direction[0]*Math.sin(yaw)+direction[1]*Math.cos(yaw);
        // The rider sits behind a broad head. A front portrait hides that
        // contact; a three-quarter view reveals both faces and the bent legs.
        const sideView=direction[0]*Math.cos(yaw)-direction[1]*Math.sin(yaw);
        cost+=Math.abs(front-.35)*1.4+Math.max(0,sideView)*1.2;
      }
      return cost;
    };
    const costOf=(fr:{from:CamKey;to:CamKey},kind:Kind,cutoff=Infinity)=>{
      let total=0,worst=0;
      // Endpoints alone miss a foreground actor crossing in mid-shot.
      const sampleCount=Math.max(10,Math.ceil((s.end-s.start)/.35));
      for(let i=0;i<=sampleCount;i++){
        const u=i/sampleCount;
        const t=Math.min(s.end-.001,s.start+(s.end-s.start)*u+.001),k=u*u*(3-2*u);
        const lerp=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+(b[i]-v)*k) as Vec3;
        const key:CamKey={pos:lerp(fr.from.pos,fr.to.pos),look:lerp(fr.from.look,fr.to.look),fov:fr.from.fov+(fr.to.fov-fr.from.fov)*k};
        const cost=costAt(key,t,kind);total+=cost;worst=Math.max(worst,cost);
        if(worst>cutoff)return worst;
      }
      return worst+total/(sampleCount+1);
    };
    let best = framing(s.kind, primary, cast, s.start, s.end, angle, side, posAt, visibleAt, rnd, headY, facingAt, !!mountBeat||houseFurnitureExit);
    let bestCost = costOf(best,s.kind);
    for (const dlt of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      if (bestCost === 0) break;
      const a = angle + dlt;
      if (Math.abs(a) > 1.3) continue;
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, !!mountBeat||houseFurnitureExit);
      const cost = costOf(fr,s.kind,bestCost);
      if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; }
    }
    // still blocked (e.g. a trunk right beside the subject): swing further round, still on the 180° side
    for (const dlt of [1.45, -1.45, 1.6, -1.6]) {
      if (bestCost < 1) break;
      const a = Math.max(-1.6, Math.min(1.6, angle + dlt));
      const fr = framing(s.kind, primary, cast, s.start, s.end, a, side, posAt, visibleAt, rnd, headY, facingAt, !!mountBeat||houseFurnitureExit);
      const cost = costOf(fr,s.kind,bestCost);
      if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; }
    }
    // A dismount establishes a new action axis. Its clear exit side may be
    // opposite the preceding conversation; do not hide the action to preserve
    // an eyeline that no longer describes the movement.
    if(physicalAction)for(const a of [0,.175,-.175,.525,-.525,.875,-.875,1.225,-1.225,2,-2,2.5,-2.5,Math.PI]){
      const fr=framing(s.kind,primary,cast,s.start,s.end,a,side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit);
      const cost=costOf(fr,s.kind,bestCost);
      if(cost<bestCost-1e-6){best=fr;bestCost=cost;}
    }
    // Follow a moving action around an obstruction instead of accepting a
    // blocked first frame merely because one fixed orbit suits the later pose.
    if(bestCost>=1&&dist(posAt(primary,s.start),posAt(primary,s.end))>1){
      const base=best;
      for(const a of [-1.3,-.7,0,.7,1.3]){
        const fr=framing(s.kind,primary,cast,s.start,s.end,a,side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit);
        for(const candidate of [{from:fr.from,to:base.to},{from:base.from,to:fr.to}]){
          const cost=costOf(candidate,s.kind,bestCost)+.10;
          if(cost<bestCost-1e-6){best=candidate;bestCost=cost;}
        }
      }
    }
    // Vary distance as well as yaw: moving closer can leave a foreground body
    // outside the shot, while a moderate retreat can fit a crowd. Penalize
    // distance changes so clearance does not routinely become a tiny subject.
    if(bestCost>.4&&place!=='house'){
      const originalBest=best;
      for(const scale of (s.kind==='wide'?[1.18]:s.kind==='two'?[1.18,1.4]:[.65,.82,1.18,1.4,1.6,2]))for(const dlt of [null,0,.7,-.7,1.3,-1.3,1.6,-1.6]){
        const fr=dlt===null?{from:{...originalBest.from},to:{...originalBest.to}}:framing(s.kind,primary,cast,s.start,s.end,Math.max(-1.6,Math.min(1.6,angle+dlt)),side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit);
        for(const key of [fr.from,fr.to])key.pos=clampCam(key.pos.map((v,i)=>key.look[i]+(v-key.look[i])*scale) as Vec3);
        const cost=costOf(fr,s.kind,bestCost)+Math.abs(Math.log(scale))*.6;
        if(cost<bestCost-1e-6){best=fr;bestCost=cost;}
      }
    }
    // still blocked (camera boxed in by trunks): fall back to a static medium, then a wide, from the clearest yaw
    let kind = s.kind;
    if (bestCost >= 1 && !s.overridden) {
      for (const alt of (physicalAction?["two","wide"]:["medium", "two", "wide"]) as Kind[]) {
        if (alt === s.kind) continue;
        for (const dlt of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
          const fr = framing(alt, primary, cast, s.start, s.end, Math.max(-1.3, Math.min(1.3, angle + dlt)), side, posAt, visibleAt, rnd, headY, facingAt, !!mountBeat||houseFurnitureExit);
          const cost = costOf(fr,alt,bestCost)+(alt==='wide'?.7:.15);
          if (cost < bestCost - 1e-6) { best = fr; bestCost = cost; kind = alt; }
          if (bestCost < 1) break;
        }
        if (bestCost < 1) break;
      }
    }
    if(followActor&&dist(posAt(primary,s.start),MARKS.hammock.pos)<3.2&&dist(posAt(primary,s.start),posAt(primary,s.end))>3){
      // Keep the carried departure on the open side of the hammock instead of
      // orbiting through its pines and the house limb as the route bends.
      const yaw=MARKS.hammock.facing,openSide:Vec2=[-Math.cos(yaw),Math.sin(yaw)];
      best={from:key(posAt(primary,s.start),openSide,5.5,2.5,1.25,45),to:key(posAt(primary,s.end),openSide,5.5,2.5,1.25,45)};
    }
    const { from, to } = best;
    if(followActor){from.followActor=followActor;to.followActor=followActor;}
    from.location=sceneLocationAt(...posAt(primary,s.start+.001));
    to.location=sceneLocationAt(...posAt(primary,Math.max(s.start,s.end-.001)));
    let cutAt:number|undefined;
    if(from.location!==to.location){
      // A shot ending outdoors must still begin inside the room's open-side
      // composition. Framing both endpoints together otherwise chooses an
      // exterior orbit for its indoor half, looking through a retained wall.
      if(from.location==='house'){
        const origin=framing(s.kind,primary,cast,s.start,s.start,angle,side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit).from;
        Object.assign(from,origin,{location:from.location});
      }
      const endTime=Math.max(s.start,s.end-.001),destinationCast=requestedCast.filter(a=>sceneLocationAt(...posAt(a,endTime))===to.location);
      if(!destinationCast.includes(primary))destinationCast.push(primary);
      let destination=framing(kind,primary,destinationCast,endTime,endTime,angle,side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit).from;
      let destinationCost=costAt(destination,endTime,kind,destinationCast);
      // The destination is a different scenic set. Rebuilding its camera must
      // not bypass the obstruction checks used for ordinary shots.
      for(const dlt of [.35,-.35,.7,-.7,1.05,-1.05,1.45,-1.45]){
        const candidate=framing(kind,primary,destinationCast,endTime,endTime,Math.max(-1.6,Math.min(1.6,angle+dlt)),side,posAt,visibleAt,rnd,headY,facingAt,!!mountBeat||houseFurnitureExit).from;
        const cost=costAt(candidate,endTime,kind,destinationCast);
        if(cost<destinationCost-1e-6){destination=candidate;destinationCost=cost;}
      }
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
export const OCCLUDERS: SceneryOccluder[] = [
  ...OBSTACLES.circles.filter((c) => c.id !== "pond" && c.id !== "table").map((c) => ({ c: c.c, r: c.r, h: c.id === "bush" ? 1.3 : 12 })),
  // hammock pines: hammock at (-11, 2.2) rotated 0.8 rad (set element), pines at local x = ±2.1
  { c: [-9.54, 0.69], r: 0.45, h: 12 },
  { c: [-12.46, 3.71], r: 0.45, h: 12 },
  { c: [8.6, -0.6], r: 0.6, h: 12 }, // swing oak
  { c: [2,1.5],r:.75,y:.71,h:.07 }, // tabletop, not an opaque cylinder down to the floor
  { c: [2.22,1.28],r:.22,y:.78,h:.76 }, // fixed samovar and teapot silhouette
];
const REMOTE_OCCLUDERS={pond:forestCameraOccluders('pond'),wolves:forestCameraOccluders('wolves')};
const OCC_BOXES:{id:string;min:Vec2;max:Vec2;h:number;y?:number}[] = [
  ...OBSTACLES.boxes.map((b) => ({ id:b.id,min: b.min, max: b.max, h: b.id === "house" ? 7.5 : b.id === "cooking_helper" ? .48 : 2.6 })),
  // Low woody branch bands measured from Pine_3/Pine_1 Bark_NormalTree vertices,
  // normalized to 8.5/9.4 m and transformed by the hammock's actual rotations.
  {id:'hammock-west-branches',min:[-13.54,2.459],max:[-11.174,4.214],y:1.6,h:.60},
  {id:'hammock-east-branches',min:[-10.270,1.028],max:[-8.911,3.008],y:1.6,h:.60},
  {id:'hammock-west-upper-branches',min:[-13.886,2.529],max:[-12.368,3.836],y:2.2,h:.60},
  {id:'hammock-east-upper-branches',min:[-10.641,-.927],max:[-8.86,2.817],y:2.2,h:.60},
];

export interface CameraTarget {head:Vec3;w:number;actor?:ActorId;framingOnly?:boolean}
export interface CameraActorVolume {actor:ActorId;pos:Vec2;headY:number;radius:number}

/** Dynamic cast is scenery for another actor's shot, even when its centre is
 * outside the exact face ray. Keep a deliberate shoulder at the edge; reject a
 * near body filling the frame or covering the subject's face/acting chest. */
export function actorOcclusionCost(key:CamKey,targets:CameraTarget[],actors:CameraActorVolume[],overShoulder=false):number {
  const location=key.location??sceneLocationAt(key.look[0],key.look[2]);
  const dx=key.look[0]-key.pos[0],dy=key.look[1]-key.pos[1],dz=key.look[2]-key.pos[2];
  const focusDistance=Math.hypot(dx,dy,dz)||1,flatDistance=Math.hypot(dx,dz)||1;
  const forward=[dx/focusDistance,dy/focusDistance,dz/focusDistance];
  const right=[-dz/flatDistance,0,dx/flatDistance];
  const up=[-forward[1]*right[2],forward[0]*right[2]-forward[2]*right[0],forward[1]*right[0]];
  const tanV=Math.tan(key.fov*Math.PI/360),tanH=tanV*16/9;
  const framed=new Set(targets.map(t=>t.actor));
  let cost=0;
  for(const a of actors){
    if(sceneLocationAt(...a.pos)!==location)continue;
    const floor=Math.max(0,a.headY-HEAD_HEIGHT[a.actor]),top=a.headY+.15;
    const cameraDistance=Math.hypot(a.pos[0]-key.pos[0],a.pos[1]-key.pos[2]);
    if(cameraDistance<a.radius+.20&&key.pos[1]<top+.15&&key.pos[1]>floor-.1)cost+=4;
    for(const target of targets){
      if(target.actor===a.actor)continue;
      const vx=target.head[0]-key.pos[0],vz=target.head[2]-key.pos[2],length2=vx*vx+vz*vz;
      if(length2<.01)continue;
      const t=((a.pos[0]-key.pos[0])*vx+(a.pos[1]-key.pos[2])*vz)/length2;
      if(t<=.01||t>=.97)continue;
      const y=key.pos[1]+(target.head[1]-key.pos[1])*t;
      if(y>floor&&y<top&&Math.hypot(key.pos[0]+vx*t-a.pos[0],key.pos[2]+vz*t-a.pos[1])<a.radius+.045)cost+=target.w*1.6;
    }
    if(framed.has(a.actor))continue;
    const rel=[a.pos[0]-key.pos[0],(floor+top)/2-key.pos[1],a.pos[1]-key.pos[2]];
    const dot=(v:number[])=>rel[0]*v[0]+rel[1]*v[1]+rel[2]*v[2];
    const depth=dot(forward);
    if(depth<=.05||depth>=focusDistance-.25)continue;
    const x=dot(right)/(depth*tanH),y=dot(up)/(depth*tanV);
    const rx=a.radius/(depth*tanH),ry=(top-floor)*.5/(depth*tanV);
    const width=Math.max(0,Math.min(1,x+rx)-Math.max(-1,x-rx));
    const height=Math.max(0,Math.min(1,y+ry)-Math.max(-1,y-ry));
    const area=width*height/4;
    cost+=Math.max(0,area-(overShoulder?.30:.14))*8;
    // A large clipped head/body at an edge is still a failed composition even
    // when it misses the subject ray. Deliberate shoulders may remain cropped.
    if(!overShoulder&&width>.12&&(y+ry>1.08||y-ry<-.98))cost+=width*Math.min(2,ry)*1.6;
  }
  return cost;
}

/** How badly static set pieces block a camera key: line of sight to each framed head (weighted), plus big trunks
 *  standing in frame in front of the subject. 0 = clear. */
export function occlusionCost(key: CamKey, heads: { head: Vec3; w: number }[]): number {
  const cam = key.pos;
  const location=key.location??sceneLocationAt(key.look[0],key.look[2]);
  // Each scenic location hides the others. Their absent trunks and walls must
  // not push this scene's camera away from an otherwise clear composition.
  const circles=location==='yard'?OCCLUDERS:location==='pond'||location==='wolves'?REMOTE_OCCLUDERS[location]:[];
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
      if (Math.hypot(px - o.c[0], pz - o.c[1]) < o.r + 0.12 && y < (o.y??0)+o.h && y > (o.y??0)-.03) cost += w;
    }
    const n = Math.max(4, Math.ceil(Math.sqrt(L2) / 0.25));
    for (const b of boxes) {
      if(b.id==='house'&&isInsideHouse(head[0],head[2]))continue; // exterior is cut away for indoor scenes
      for (let i = 1; i < n - 1; i++) {
        const t = i / n;
        const x = cam[0] + dx * t;
        const z = cam[2] + dz * t;
        const y = cam[1] + (head[1] - cam[1]) * t;
        if (x > b.min[0] - 0.1 && x < b.max[0] + 0.1 && z > b.min[1] - 0.1 && z < b.max[1] + 0.1 && y < (b.y??0)+b.h && y>(b.y??0)-.03) { cost += w; break; }
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
    if(d<o.r+.16&&cam[1]<(o.y??0)+o.h){cost+=2;continue;}
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
  furnitureAction=false,
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
    // The connected kitchen and reading area are a single stage. Compose from
    // its open south side, using the actual participants rather than the old
    // rectangular room's fixed centre. A small orbit clears foreground actors
    // while retaining the fireplace/return as the scene's geographic anchor.
    const wide=kind==='wide'||kind==='two',establishing=kind==='wide',portrait=kind==='close';
    const indoorKey=(p:Vec2,h:number,t:number):CamKey=>{
      if(furnitureAction){
        // The actor leaves the cushion during the stand-up. Keep the complete
        // exit visible and follow the evaluated root, not the now-empty chair.
        return {pos:[r3(p[0]-.65),2.35,r3(p[1]+4.4)],look:[r3(p[0]),.90,r3(p[1])],fov:44,location:'house'};
      }
      const readingCast=ACTOR_IDS.filter(a=>visibleAt(a,t)&&dist(posAt(a,t),HOUSE_LIVING_MARK)<2.1);
      if(!establishing&&dist(p,HOUSE_LIVING_MARK)<2.1&&readingCast.length>=2&&readingCast.some(a=>dist(posAt(a,t),HOUSE_LIVING_MARK)<.25)){
        // Verified against the actual seated child and broad serving Bear:
        // their root midpoint with this west/front view exposes both faces and
        // the plate. A near-side close-up otherwise looks into Masha's hood.
        const points=readingCast.map(a=>posAt(a,t)),x=points.reduce((sum,p)=>sum+p[0],0)/points.length,z=points.reduce((sum,p)=>sum+p[1],0)/points.length;
        return {pos:[r3(x-3),2.4,r3(z+1.7)],look:[r3(x),1.1,r3(z)],fov:42,location:'house'};
      }
      const occupants=cast.filter(a=>visibleAt(a,t)&&isInsideHouse(...posAt(a,t))).map(a=>({
        p:posAt(a,t),height:headY?headY(a,t):HEAD_HEIGHT[a],radius:CAMERA_BODY_RADIUS[a],
      }));
      const minX=wide&&occupants.length?Math.min(...occupants.map(a=>a.p[0]-a.radius)):p[0]-.4;
      const maxX=wide&&occupants.length?Math.max(...occupants.map(a=>a.p[0]+a.radius)):p[0]+.4;
      const roomCentre=houseWorld([-1.55,.35]);
      const x=establishing?roomCentre[0]:(minX+maxX)/2;
      const z=establishing?roomCentre[1]:wide&&occupants.length?(Math.min(...occupants.map(a=>a.p[1]))+Math.max(...occupants.map(a=>a.p[1])))/2:p[1];
      const tallest=wide&&occupants.length?Math.max(...occupants.map(a=>a.height)):h;
      const lookY=portrait?h*.88:wide?Math.max(.9,tallest*.52):h*.65;
      const fov=wide?49:portrait?35:42;
      const span=maxX-minX;
      const depthSpan=wide&&occupants.length?Math.max(...occupants.map(a=>Math.abs(a.p[1]-z))):0;
      const d=establishing?7.0:wide?Math.max(4.4,span/(2*Math.tan(fov*Math.PI/360)*16/9)*1.28+depthSpan):portrait?Math.max(1.8,h*1.65):Math.max(3.1,h*2.1);
      const heading=facingAt?facingAt(subj,t):0;
      const westFacing=Math.sin(heading)<-.45;
      const northFacing=Math.cos(heading)<-.45;
      const baseOrbit=establishing?-.23:westFacing?-1.25:northFacing?-1.10:-.15;
      const orbit=Math.max(-1.40,Math.min(1.40,baseOrbit+Math.max(wide?-.55:-1.3,Math.min(wide?.55:1.3,angle))*(wide?.35:.9)));
      const eyeY=Math.min(3.05,lookY+(establishing?1.8:wide?1.45:westFacing?1.65:portrait?.35:.7));
      return {pos:[r3(x+Math.sin(orbit)*d+.2),r3(eyeY),r3(z+Math.cos(orbit)*d)],look:[r3(x),r3(lookY),r3(z)],fov,location:'house'};
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
  const heading=facingAt?facingAt(subj,t0+.01):null;
  let portraitDir=heading===null?faceDir(sp,op,dir,side):rot([Math.sin(heading),Math.cos(heading)],angle);
  const nearbyCast=ACTOR_IDS.filter(a=>visibleAt(a,t0)&&sceneLocationAt(...posAt(a,t0))===sceneLocationAt(...sp)&&dist(sp,posAt(a,t0))<6);
  if(heading!==null&&visibleAt(partner,t0)&&dist(sp,op)<8&&nearbyCast.length<=2){
    const otherDirection=norm([op[0]-sp[0],op[1]-sp[1]]);
    const towardPartner=Math.sin(heading)*otherDirection[0]+Math.cos(heading)*otherDirection[1];
    // Preserve the established side for exchanges. A solo action facing water,
    // furniture or its own prop has a different axis from the lead-pair eyeline.
    if(towardPartner>.45&&portraitDir[0]*side[0]+portraitDir[1]*side[1]<.20){
      const along=portraitDir[0]*otherDirection[0]+portraitDir[1]*otherDirection[1];
      portraitDir=norm([otherDirection[0]*Math.max(.3,along)+side[0]*.32,otherDirection[1]*Math.max(.3,along)+side[1]*.32]);
    }
  }

  let from: CamKey;
  let to: CamKey;
  switch (kind) {
    case "wide": {
      const c1=castSpread(cast,t1,posAt,visibleAt),mid1=c1.mid??mid;
      const span = Math.max(c0.span,c1.span);
      // Establish the place at character height; avoid a distant, lawn-heavy aerial view.
      const d = 7.4 + Math.min(14, span * 0.8);
      const eyeY = 3.2 + Math.min(2.8, span * 0.08);
      from = key(mid, dir, d, eyeY, 1.0, 44);
      to = key(dist(mid,mid1)>.5?mid1:mid, dir, d * 0.94, eyeY - 0.1, 1.0, 44);
      break;
    }
    case "two": {
      // follows the pair's midpoint when they move during the shot
      const c1 = castSpread(cast, t1, posAt, visibleAt);
      const mid1: Vec2 = c1.mid ?? mid;
      const span = Math.max(c0.span, c1.span);
      const highAt=(t:number)=>Math.max(.85,...cast.filter(a=>visibleAt(a,t)).map(a=>headY?headY(a,t):HEAD_HEIGHT[a]));
      const high0=highAt(t0),high1=highAt(t1);
      const d = Math.max(3.2,Math.max(high0,high1)*2.25,span*(furnitureAction?.9:1.3)+2.8);
      from = key(mid, dir, d, high0*.97, high0*.54, 45);
      to = key(dist(mid, mid1) > .2 ? mid1 : mid, dir, d * 0.95, high1*.97, high1*.54, 45);
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
      const dd = portraitDir;
      from = key(sp, dd, d, 0.35, hy0, 50);
      to = key(sp1, dd, d * 0.92, 0.4, hy1, 50);
      break;
    }
    case "over_shoulder": {
      const back = norm([op[0] - sp[0], op[1] - sp[1]]);
      const o: ActorId = partner;
      // lateral offset varies with the (occlusion-nudged) angle but never crosses the 180° line
      const lat = Math.max(.45, .85 + angle * 1.35);
      const pos: Vec2 = [op[0] + back[0] * (1.2 + Math.abs(angle) * 0.4) + side[0] * lat, op[1] + back[1] * (1.2 + Math.abs(angle) * 0.4) + side[1] * lat];
      const h = headY?headY(o,t0):HEAD_HEIGHT[o];
      from = { pos: clampCam([pos[0], h, pos[1]]), look: [sp[0], hy0 * 0.94, sp[1]], fov: 40 };
      to = { pos: clampCam([pos[0] - back[0] * 0.15, h, pos[1] - back[1] * 0.15]), look: from.look, fov: 40 };
      break;
    }
    case "tracking": {
      const p1 = posAt(subj, t1);
      const mvDir = norm([p1[0] - sp[0], p1[1] - sp[1]]);
      let perp: Vec2 = [-mvDir[1], mvDir[0]];
      if (perp[0] * side[0] + perp[1] * side[1] < 0) perp = [-perp[0], -perp[1]];
      const dd = rot(norm([perp[0] * 0.85 - mvDir[0] * 0.35, perp[1] * 0.85 - mvDir[1] * 0.35]),angle);
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
    if (x > b.min[0] - m && x < b.max[0] + m && z > b.min[1] - m && z < b.max[1] + m && y < (b.id === "cooking_helper" ? .48 : 7.5)) {
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
  return { pos: lerp(c.from.pos, c.to.pos), look: lerp(c.from.look, c.to.look), fov: c.from.fov + (c.to.fov - c.from.fov) * k,location:c.from.location??c.to.location,followActor:c.from.followActor??c.to.followActor };
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
