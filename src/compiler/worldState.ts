// World state helpers (spec §6.4).
import { MARKS } from "../shared/bible/set";
import { PROPS } from "../shared/bible/props";
import { ACTOR_IDS, PROP_IDS, CARROT_IDS, isCarrot, WOLF_START, EXTRA_START, ADDED_ACTOR_START, type ActorId, type PropId, type WorldState } from "../shared/schema";

/** The set's initial state (paragraph 0 starts here). */
export function initialWorldState(): WorldState {
  const props = {} as WorldState["props"];
  for (const id of PROP_IDS) props[id as PropId] = { at: PROPS[id as PropId].home, ...(isCarrot(id)?{planted:true}:{}) };
  return {
    timeOfDay: "day",
    actors: {
      ...structuredClone(EXTRA_START),
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
    const s = ws.actors[id] ?? (ADDED_ACTOR_START as Partial<Record<ActorId, WorldState["actors"]["masha"]>>)[id];
    if (!s) return `${id}:-`;
    return `${id}:${r(s.pos[0])},${r(s.pos[1])},${s.mark ?? "-"},${s.holding ?? "-"},${s.posture}`;
  };
  const props = Object.keys(ws.props).sort().map((k) => `${k}@${ws.props[k as PropId]?.at}${isCarrot(k)?`:planted=${ws.props[k]?.planted??false}`:""}${ws.props[k as PropId]?.position?`:pose=${JSON.stringify([ws.props[k as PropId].position,ws.props[k as PropId].rotation])}`:""}`).join(";");
  // masha/bear first (unchanged layout); wolves appended so pre-wolf digests stay comparable in shape
  return `${ws.timeOfDay}|${ACTOR_IDS.map((id) => a(id)).join("|")}|${props}|door:${ws.objects?.house_door??0}|cupboard:${ws.objects?.kitchen_cupboard??0}`;
}

export function cloneWorldState(ws: WorldState): WorldState {
  return withAllActors(JSON.parse(JSON.stringify(ws)) as WorldState);
}

/** Fill in actors missing from an older world state (saved before the Wolves joined) with their start state. */
export function withAllActors(ws: WorldState): WorldState {
  ws.props.pantry_honey??={at:'cupboard'};
  if(CARROT_IDS.slice(1).every(id=>!(id in ws.props))&&ws.props.carrot?.at==='garden'&&ws.props.carrot.planted===undefined)ws.props.carrot.planted=true;
  for(const id of CARROT_IDS)ws.props[id]??={at:'garden',planted:true};
  const actors = ws.actors as Partial<WorldState["actors"]>;
  for (const [id, value] of Object.entries(ADDED_ACTOR_START)) {
    if (!actors[id as ActorId]) actors[id as ActorId] = structuredClone(value);
  }
  return ws;
}
