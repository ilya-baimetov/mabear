// Pure set placement, surface heights, and shared collider/geometry constants (zero Three.js imports).
import { clamp01 } from "./math";
import { cookingSupportHeightAt } from "./cookingStation";
import { entranceSupportAt } from "./interactiveObjects";
import { POND_CENTER, POND_PIER_START } from "./pond";
import type { MarkId, Vec2 } from "./schema";

export const SET_ELEMENT_IDS = [
  "ground", "grass", "house", "garden", "beehive", "oak_swing", "hammock", "pond", "pier", "table", "samovar",
  "bench", "woodpile", "big_pine", "bush", "creek", "footbridge", "path_bridge", "van", "picket_fence",
  "flowers_patch", "rocks", "forest",
] as const;
export type SetElementId = (typeof SET_ELEMENT_IDS)[number];

export interface SetElementDef {
  id: SetElementId;
  /** anchor position [x, y, z] (world) */
  pos: [number, number, number];
  /** yaw of the anchor (radians, about +y) */
  rotY: number;
  mark: MarkId | null;
  description: string;
}

export const PIER_START: Vec2 = [POND_PIER_START[0], POND_PIER_START[1]];
const PIER_NORM = Math.hypot(-1, 2.6);
export const PIER_DIR: Vec2 = [-1 / PIER_NORM, 2.6 / PIER_NORM];
export const PIER_YAW = Math.atan2(PIER_DIR[0], PIER_DIR[1]);
export const BRIDGE_YAW = 0.149;
export const PORCH_HEIGHT = 0.32;
export const TABLE_TOP = 0.78; // matches the player's PROP_REST_HEIGHT.table
export const PIER_HEIGHT = 0.28;
export const SAMOVAR_XZ: Vec2 = [2.22, 1.28];

/** Creek centreline [x, z] from the north-east forest, down the east edge (footbridge at (12, 9)), into the pond. */
export const CREEK_POINTS: Vec2[] = [
  [24, -24], [19.5, -17], [15.6, -12.2], [13.4, -8.6], [11.9, -5.2], [10.7, -2], [10.6, 1.6], [11.2, 5.4],
  [12, 9], [12.4, 11.6], [11.4, 14.4], [8.4, 16.6], [4.2, 17.7], [0, 17.9], [-3.4, 17], [-5.9, 15.2], [-7.1, 13.5],
];

export const SET_ELEMENTS: Record<SetElementId, SetElementDef> = {
  ground: { id: "ground", pos: [0, 0, 0], rotY: 0, mark: null, description: "Textured meadow ground with the forest path and worn patches" },
  grass: { id: "grass", pos: [0, 0, 0], rotY: 0, mark: null, description: "Instanced grass tufts" },
  house: { id: "house", pos: [-6, 0, -6.4], rotY: 0, mark: "porch", description: "Bear's hollow tree-house with timber facade, mailbox and flower box" },
  garden: { id: "garden", pos: [5.4, 0, -7.1], rotY: 0, mark: "garden", description: "Raised beds with carrots and cabbages, small picket fence" },
  beehive: { id: "beehive", pos: [10.2, 0, -9.1], rotY: 0, mark: "beehive", description: "Wooden beehive on a stump" },
  oak_swing: { id: "oak_swing", pos: [8.6, 0, -0.6], rotY: 0, mark: "swing", description: "Big oak with a rope swing (seat is a separate moving object)" },
  // rotated 46deg so neither pine trunk stands on the hammock->clearing lane or the w_hammock waypoint paths
  hammock: { id: "hammock", pos: [-11, 0, 2.2], rotY: 0.8, mark: "hammock", description: "Striped hammock between two pines" },
  pond: { id: "pond", pos: [POND_CENTER[0], 0, POND_CENTER[1]], rotY: 0, mark: "pond_shore", description: "Woodland pond with an irregular leafy bank and reflected trees" },
  pier: { id: "pier", pos: [PIER_START[0], 0, PIER_START[1]], rotY: PIER_YAW, mark: "pier", description: "Small wooden fishing pier" },
  table: { id: "table", pos: [2, 0, 1.5], rotY: 0, mark: "table", description: "Round outdoor wooden table" },
  samovar: { id: "samovar", pos: [SAMOVAR_XZ[0], TABLE_TOP, SAMOVAR_XZ[1]], rotY: 0.4, mark: "table", description: "Brass samovar on the table" },
  bench: { id: "bench", pos: [2, 0, 3], rotY: 0, mark: "bench", description: "Log bench beside the table" },
  woodpile: { id: "woodpile", pos: [-12.2, 0, -6.4], rotY: 0, mark: "woodpile", description: "Stacked logs and a chopping stump (no axe)" },
  big_pine: { id: "big_pine", pos: [-2, 0, -10.6], rotY: 0, mark: "big_tree", description: "Large pine behind the house" },
  bush: { id: "bush", pos: [6, 0, 7.6], rotY: 0, mark: "bush", description: "Round berry bush" },
  creek: { id: "creek", pos: [0, 0, 0], rotY: 0, mark: "creek", description: "Creek winding from the north-east, down the east edge, into the pond" },
  footbridge: { id: "footbridge", pos: [12, 0, 9], rotY: BRIDGE_YAW, mark: "creek", description: "Plank footbridge over the creek" },
  path_bridge: { id: "path_bridge", pos: [0, 0, 17.9], rotY: Math.PI / 2, mark: "path_entry", description: "Little plank bridge where the forest path crosses the creek" },
  van: { id: "van", pos: [14.1, 0, -1], rotY: 0, mark: "van", description: "The Wolves' old rounded ambulance van (faded cream, red stripe)" },
  picket_fence: { id: "picket_fence", pos: [0, 0, 0], rotY: 0, mark: null, description: "Fragments of an old picket fence by the path" },
  flowers_patch: { id: "flowers_patch", pos: [0, 0, 0], rotY: 0, mark: null, description: "Wildflower clusters" },
  rocks: { id: "rocks", pos: [0, 0, 0], rotY: 0, mark: null, description: "Rocks and boulders" },
  forest: { id: "forest", pos: [0, 0, 0], rotY: 0, mark: null, description: "Authored CC0 pine and birch models, instanced in irregular forest clusters" },
};

// ---------------------------------------------------------------------------------------------------------------
// Shared static geometry specs (single source of truth for set visuals & physics colliders)
// ---------------------------------------------------------------------------------------------------------------

export const YARD_TABLE_SPEC = {
  pos: [2, 1.5] as const,
  radius: 0.74,
  colliderRadius: 0.75,
  top: TABLE_TOP,
} as const;

export const YARD_BENCH_SPEC = {
  pos: [2, 3] as const,
  width: 1.7,
  depth: 0.38,
  thickness: 0.1,
  centerY: 0.42,
  top: 0.47,
  legXs: [1.4, 2.6] as const,
  legHeight: 0.38,
} as const;

export const YARD_SAMOVAR_SPEC = {
  pos: SAMOVAR_XZ,
  baseY: TABLE_TOP,
  height: 0.47,
  radius: 0.17,
} as const;

export const YARD_HAMMOCK_SPEC = {
  center: [-11, 2.2] as const,
  rotY: 0.8,
  seatY: 0.62,
  trunkSpan: 2.1,
} as const;

export const YARD_BRIDGES_SPEC = [
  { pos: [12, 9] as const, rotY: BRIDGE_YAW, width: 1.05 },
  { pos: [0, 17.9] as const, rotY: Math.PI / 2, width: 1.6 },
] as const;

export const POND_BENCH_SPEC = {
  center: [-4.1, 5.8] as const,
  width: 2.6,
  depth: 0.48,
  topY: 0.5,
  thickness: 0.07,
  postXs: [-5.1, -3.2] as const,
  postHeight: 0.48,
} as const;

export const POND_STUMP_SPEC = {
  pos: [-2.28, 5.9] as const,
  height: 0.4,
  radius: 0.32,
} as const;

export const WOLVES_VAN_SPEC = {
  center: [14.1, -1.0] as const,
  halfExtents: [1.1, 1.11, 2.2] as const,
} as const;

export const WOLVES_LOGS_SPEC = [
  [10.2, -3.7, 0.35],
  [17, -1.3, -0.3],
] as const;

export const WOLVES_CRATES_SPEC = {
  startX: 16.2,
  stepX: 0.65,
  z: -3.6,
  count: 2,
  size: [0.58, 0.48, 0.6] as const,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Pure surface-height helpers (actors stand on porch/pier/bridges; props rest on tables/bench/stumps)
// ---------------------------------------------------------------------------------------------------------------

function toLocal(x: number, z: number, def: SetElementDef): [number, number] {
  const dx = x - def.pos[0];
  const dz = z - def.pos[2];
  const c = Math.cos(def.rotY);
  const s = Math.sin(def.rotY);
  // inverse of a yaw rotation: local = R(-yaw) * d
  return [c * dx - s * dz, s * dx + c * dz];
}

export function bridgeDeckY(lx: number): number {
  return 0.05 + 0.2 * Math.cos((Math.PI * Math.max(-1.4, Math.min(1.4, lx))) / 2.8);
}

/** Height of the walkable surface under (x, z): porch deck + steps, pier, footbridges. 0 on the ground. */
export function walkHeightAt(x: number, z: number): number {
  const entrance = entranceSupportAt(x, z);
  if (entrance > 0) return entrance;
  const cookingStep = cookingSupportHeightAt(x, z);
  if (cookingStep > 0) return cookingStep;
  // pier: local z along the pier from -0.3 (land) to 3.1
  {
    const [lx, lz] = toLocal(x, z, SET_ELEMENTS.pier);
    if (Math.abs(lx) < 0.7 && lz > -0.6 && lz < 3.2) return PIER_HEIGHT * clamp01((lz + 0.6) / 0.6);
  }
  for (const id of ["footbridge", "path_bridge"] as const) {
    const [lx, lz] = toLocal(x, z, SET_ELEMENTS[id]);
    if (Math.abs(lz) < 0.6 && Math.abs(lx) < 1.45) return bridgeDeckY(lx);
  }
  return 0;
}

/** Height a resting prop should sit at (table top, bench seat, beehive/chopping stump, porch…). */
export function restHeightAt(x: number, z: number): number {
  if (Math.hypot(x - YARD_TABLE_SPEC.pos[0], z - YARD_TABLE_SPEC.pos[1]) < 0.72) return YARD_TABLE_SPEC.top;
  if (Math.abs(x - YARD_BENCH_SPEC.pos[0]) < 0.8 && Math.abs(z - YARD_BENCH_SPEC.pos[1]) < 0.2) return YARD_BENCH_SPEC.top;
  if (Math.hypot(x - 10.2, z + 9.1) < 0.4) return 0.5;
  if (Math.hypot(x + 13.4, z + 4.6) < 0.3) return 0.45;
  return walkHeightAt(x, z);
}
