// World state helpers (spec §6.4).
import { MARKS } from "../shared/bible/set";
import { PROPS } from "../shared/bible/props";
import { ACTOR_IDS, PROP_IDS, WOLF_START, type ActorId, type PropId, type WorldState } from "../shared/schema";

/** The set's initial state (paragraph 0 starts here). */
export function initialWorldState(): WorldState {
  const props = {} as WorldState["props"];
  for (const id of PROP_IDS) props[id as PropId] = { at: PROPS[id as PropId].home };
  return {
    timeOfDay: "day",
    actors: {
      masha: { pos: [0.25, 0.5], facing: 0, mark: "clearing", holding: null, posture: "stand" },
      bear: { pos: [-1.65, -0.25], facing: 0.12, mark: "clearing", holding: null, posture: "stand" },
      // the Wolves loiter just west of their van, facing the yard
      wolf_a: { ...WOLF_START.wolf_a, pos: [...WOLF_START.wolf_a.pos] as [number, number] },
      wolf_b: { ...WOLF_START.wolf_b, pos: [...WOLF_START.wolf_b.pos] as [number, number] },
    },
    props,
  };
}

/** Stable, order-independent digest of a world state (for the director cache key). */
export function worldStateDigest(ws: WorldState): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  const a = (id: ActorId) => {
    const s = ws.actors[id] ?? (WOLF_START as Partial<Record<ActorId, WorldState["actors"]["masha"]>>)[id];
    if (!s) return `${id}:-`;
    return `${id}:${r(s.pos[0])},${r(s.pos[1])},${s.mark ?? "-"},${s.holding ?? "-"},${s.posture}`;
  };
  const props = Object.keys(ws.props).sort().map((k) => `${k}@${ws.props[k as PropId]?.at}`).join(";");
  // masha/bear first (unchanged layout); wolves appended so pre-wolf digests stay comparable in shape
  return `${ws.timeOfDay}|${ACTOR_IDS.map((id) => a(id)).join("|")}|${props}`;
}

export function cloneWorldState(ws: WorldState): WorldState {
  return withAllActors(JSON.parse(JSON.stringify(ws)) as WorldState);
}

/** Fill in actors missing from an older world state (saved before the Wolves joined) with their start state. */
export function withAllActors(ws: WorldState): WorldState {
  const actors = ws.actors as Partial<WorldState["actors"]>;
  if (!actors.wolf_a) actors.wolf_a = JSON.parse(JSON.stringify(WOLF_START.wolf_a)) as WorldState["actors"]["wolf_a"];
  if (!actors.wolf_b) actors.wolf_b = JSON.parse(JSON.stringify(WOLF_START.wolf_b)) as WorldState["actors"]["wolf_b"];
  return ws;
}
