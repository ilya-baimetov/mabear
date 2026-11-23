// Prop schedule, ownership reconciliation, ballistic flight interpolation, and pickup/putdown contact metadata.
import type { ActorFrame, PropFrame } from "../api";
import { MARKS } from "../../shared/bible/set";
import { clamp01, lerp } from "../../shared/math";
import { propPlacementAtMark, propRestPosition as restPos } from "../../shared/propPlacement";
import { ACTOR_IDS, MARK_IDS, PROP_IDS, type ActorId, type PropId, type PropLocation, type Segment, type Vec3 } from "../../shared/schema";
import { qaxis, qrot } from "../motion/blend";
import { STYLES } from "../motion/library";
import { clipsOf, isActor, isMark, stOf, type Resolved } from "./kinematics";

export interface PropEvent {
  t: number;
  prop: PropId;
  at: PropLocation;
  flight?: { t0: number; t1: number; from: ActorId; to: Vec3 };
}

export function propLocationsAt(seg: Segment, localT: number): { at: Record<PropId, PropLocation>; flights: Map<PropId, PropEvent["flight"]> } {
  const at = {} as Record<PropId, PropLocation>;
  for (const id of PROP_IDS) at[id] = seg.startState.props[id]?.at ?? "hidden";
  for (const a of ACTOR_IDS) {
    const h = stOf(seg.startState, a).holding;
    if (h) at[h] = a;
  }
  const events: PropEvent[] = [];
  const touched = new Map<PropId, number>();
  for (const a of ACTOR_IDS) {
    for (const c of clipsOf(seg, a)) {
      const item = c.params.item;
      const end = c.start + c.dur;
      if (item) touched.set(item, Math.max(touched.get(item) ?? 0, end));
      if (c.params.putDown && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: c.params.putDown });
      else if (c.verb === "drop" && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: c.params.dropAt ?? "clearing" });
      else if (c.verb === "take" && item) events.push({ t: c.start + c.dur * 0.5, prop: item, at: a });
      else if (c.verb === "give" && item && isActor(c.params.target)) events.push({ t: c.start + c.dur * 0.6, prop: item, at: c.params.target });
      else if (c.verb === "throw" && item) {
        const tgt = c.params.target;
        const land: PropLocation = isMark(tgt) ? tgt : isActor(tgt) ? (seg.endState.props[item]?.at ?? tgt) : (seg.endState.props[item]?.at ?? "clearing");
        const to: Vec3 = c.params.lookAt ? [c.params.lookAt[0], 0.1, c.params.lookAt[2]] : isMark(tgt) ? restPos(item, tgt) : [0, 0.1, 0];
        events.push({ t: c.start + c.dur * 0.4, prop: item, at: "hidden", flight: { t0: c.start + c.dur * 0.4, t1: end, from: a, to } });
        events.push({ t: end, prop: item, at: land });
      } else if (c.verb === "cook") {
        if (item) events.push({ t: c.start, prop: item, at: a });
        const pc = seg.endState.props.pancakes?.at;
        if (pc && pc !== at.pancakes) events.push({ t: c.start + c.dur * 0.85, prop: "pancakes", at: pc });
      } else if (c.verb === "fish") {
        if (item) events.push({ t: c.start, prop: item, at: a });
        const f = c.params.catchesFish === true ? a : c.params.catchesFish === false ? undefined : seg.endState.props.fish?.at;
        if (f && f !== "hidden") events.push({ t: c.start + c.dur * 0.7, prop: "fish", at: f });
      } else if (c.verb === "water_plants" && item) events.push({ t: c.start, prop: item, at: a });
    }
  }
  events.sort((x, y) => x.t - y.t);
  // reconcile with the compiled end state: anything still different switches when its last clip ends
  const sim = { ...at };
  const setDown: PropEvent[] = [];
  for (const e of events) {
    if (isActor(e.at)) {
      const actor = e.at, clip = clipsOf(seg, actor).find((c) => e.t >= c.start && e.t < c.start + c.dur);
      const position = clip?.params.from ?? stOf(seg.startState, actor).pos;
      const mark = MARK_IDS.reduce((best, m) => Math.hypot(MARKS[m].pos[0] - position[0], MARKS[m].pos[1] - position[1]) < Math.hypot(MARKS[best].pos[0] - position[0], MARKS[best].pos[1] - position[1]) ? m : best, MARK_IDS[0]);
      for (const old of PROP_IDS) if (old !== e.prop && sim[old] === actor) { sim[old] = mark; setDown.push({ t: e.t, prop: old, at: mark }); }
    }
    sim[e.prop] = e.at;
  }
  events.push(...setDown);
  for (const id of PROP_IDS) {
    const target = seg.endState.props[id]?.at;
    if (target !== undefined && sim[id] !== target) events.push({ t: Math.min(touched.get(id) ?? seg.duration, seg.duration), prop: id, at: target });
  }
  events.sort((x, y) => x.t - y.t);
  const flights = new Map<PropId, PropEvent["flight"]>();
  for (const e of events) {
    if (e.t > localT) break;
    at[e.prop] = e.at;
    if (e.flight && localT < e.flight.t1) flights.set(e.prop, e.flight);
    else flights.delete(e.prop);
  }
  return { at, flights };
}

function handPos(a: ActorFrame, actor: ActorId): Vec3 {
  const s = STYLES[actor];
  const off = qrot(qaxis([0, 1, 0], a.yaw), [-0.18 * s.height, 0.45 * s.height, 0.22 * s.height]);
  return [a.pos[0] + off[0], a.pos[1] + off[1], a.pos[2] + off[2]];
}

export function propsFrame(at: Record<PropId, PropLocation>, flights: Map<PropId, PropEvent["flight"]>, actors: Record<ActorId, ActorFrame>, lt: number): Record<PropId, PropFrame> {
  const out = {} as Record<PropId, PropFrame>;
  for (const id of PROP_IDS) {
    const fl = flights.get(id);
    if (fl) {
      const k = clamp01((lt - fl.t0) / Math.max(1e-3, fl.t1 - fl.t0));
      const from = handPos(actors[fl.from], fl.from);
      const h = Math.sin(k * Math.PI) * 1.2;
      out[id] = { visible: true, pos: [lerp(from[0], fl.to[0], k), lerp(from[1], fl.to[1], k) + h, lerp(from[2], fl.to[2], k)], attachedTo: null };
      continue;
    }
    const loc = at[id];
    if (loc === "hidden") out[id] = { visible: false, pos: [0, -10, 0], attachedTo: null };
    else if (isActor(loc)) out[id] = { visible: actors[loc].opacity > 0.05, pos: handPos(actors[loc], loc), attachedTo: loc };
    else out[id] = { visible: true, pos: restPos(id, loc), attachedTo: null };
  }
  return out;
}

export function propActionTargets(r: Resolved | null, inClip: boolean): Pick<ActorFrame, "putDown" | "pickup"> {
  const release = inClip && r?.clip.params.putDown && r.clip.params.item
    ? { item: r.clip.params.item, ...propPlacementAtMark(r.clip.params.item, r.clip.params.putDown) }
    : null;
  const pickup = inClip && r?.clip.params.pickUpAt && r.clip.params.item
    ? { item: r.clip.params.item, ...propPlacementAtMark(r.clip.params.item, r.clip.params.pickUpAt) }
    : null;
  return {
    ...(release ? { putDown: { item: release.item, position: release.pos, rotation: release.rot, release: 0.5 } } : {}),
    ...(pickup ? { pickup: { item: pickup.item, position: pickup.pos, rotation: pickup.rot, release: 0.5 } } : {}),
  };
}
