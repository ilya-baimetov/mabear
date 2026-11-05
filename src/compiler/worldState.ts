// World state helpers (spec §6.4).
import { MARKS } from "../shared/bible/set";
import { PROPS } from "../shared/bible/props";
import { PROP_IDS, type PropId, type WorldState } from "../shared/schema";

/** The set's initial state (paragraph 0 starts here). */
export function initialWorldState(): WorldState {
  const props = {} as WorldState["props"];
  for (const id of PROP_IDS) props[id as PropId] = { at: PROPS[id as PropId].home };
  return {
    timeOfDay: "day",
    actors: {
      masha: { pos: [...MARKS.clearing.pos] as [number, number], facing: 0, mark: "clearing", holding: null, posture: "stand" },
      bear: { pos: [...MARKS.porch.pos] as [number, number], facing: 0, mark: "porch", holding: null, posture: "stand" },
    },
    props,
  };
}

/** Stable, order-independent digest of a world state (for the director cache key). */
export function worldStateDigest(ws: WorldState): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  const a = (id: "masha" | "bear") => {
    const s = ws.actors[id];
    return `${id}:${r(s.pos[0])},${r(s.pos[1])},${s.mark ?? "-"},${s.holding ?? "-"},${s.posture}`;
  };
  const props = Object.keys(ws.props).sort().map((k) => `${k}@${ws.props[k as PropId]?.at}`).join(";");
  return `${ws.timeOfDay}|${a("masha")}|${a("bear")}|${props}`;
}

export function cloneWorldState(ws: WorldState): WorldState {
  return JSON.parse(JSON.stringify(ws)) as WorldState;
}
