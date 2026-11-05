// Set "Bear's yard" (spec §7.2). Origin at centre, +z toward the default camera (south). Units: metres.
import type { MarkId, Surface, Vec2 } from "../schema";

export interface MarkDef {
  id: MarkId;
  pos: Vec2; // [x, z]
  /** yaw (radians) an actor standing at this mark should face; 0 = +z */
  facing: number;
  /** "cluster" groups nearby marks for the cinematographer's establishing-shot rule */
  cluster: "house" | "garden" | "yard" | "pond" | "edge";
  description: string;
}

export const MARKS: Record<MarkId, MarkDef> = {
  clearing: { id: "clearing", pos: [0, 0], facing: 0, cluster: "yard", description: "Open grass in front of the house" },
  porch: { id: "porch", pos: [-6, -2.6], facing: 0, cluster: "house", description: "Wooden porch with three steps in front of Bear's house" },
  door: { id: "door", pos: [-6, -3.6], facing: Math.PI, cluster: "house", description: "Front door of Bear's house; entering = walk to the door and go offstage" },
  garden: { id: "garden", pos: [5, -5], facing: Math.PI, cluster: "garden", description: "Vegetable beds with carrots and cabbages, small fence" },
  beehive: { id: "beehive", pos: [10, -8], facing: Math.PI, cluster: "garden", description: "Wooden beehive on a stump; bees buzz nearby" },
  swing: { id: "swing", pos: [8, 2], facing: 0, cluster: "yard", description: "Rope swing hanging from a big oak" },
  hammock: { id: "hammock", pos: [-11, 2], facing: 0, cluster: "house", description: "Hammock between two pines (Bear's nap spot)" },
  pond_shore: { id: "pond_shore", pos: [-6, 8], facing: 2.2, cluster: "pond", description: "Shore of a small round pond" },
  pier: { id: "pier", pos: [-5.5, 9.5], facing: 2.4, cluster: "pond", description: "End of a small wooden pier; fishing spot" },
  table: { id: "table", pos: [2, 1.5], facing: 0, cluster: "yard", description: "Outdoor wooden table with a samovar/teapot" },
  bench: { id: "bench", pos: [2, 3], facing: Math.PI, cluster: "yard", description: "Bench beside the table" },
  woodpile: { id: "woodpile", pos: [-12, -5], facing: 0, cluster: "house", description: "Stacked logs and a chopping stump (no axe)" },
  path_entry: { id: "path_entry", pos: [0, 16], facing: Math.PI, cluster: "edge", description: "Forest path where characters enter and leave the yard" },
  big_tree: { id: "big_tree", pos: [-2, -10], facing: 0, cluster: "house", description: "Large pine behind the house; hiding spot" },
  bush: { id: "bush", pos: [6, 7], facing: 0, cluster: "yard", description: "Round bush; hiding spot" },
  creek: { id: "creek", pos: [12, 9], facing: -1.57, cluster: "edge", description: "Small creek on the yard's east edge with a plank footbridge" },
  van: { id: "van", pos: [14, -1], facing: -1.57, cluster: "edge", description: "The Wolves' old ambulance van parked at the forest edge; set dressing and a hiding spot" },
};

/** Static obstacles for path planning: circles [x, z, radius] and axis-aligned boxes [minX, minZ, maxX, maxZ]. */
export const OBSTACLES = {
  circles: [
    { id: "pond", c: [-8, 10] as Vec2, r: 3.5 },
    { id: "table", c: [2, 1.5] as Vec2, r: 0.9 },
    { id: "big_tree", c: [-2, -10.6] as Vec2, r: 0.8 },
    { id: "bush", c: [6, 7.6] as Vec2, r: 1.0 },
  ],
  boxes: [
    { id: "house", min: [-9.5, -9] as Vec2, max: [-2.5, -3.7] as Vec2 },
    { id: "van", min: [13, -3.2] as Vec2, max: [15.2, 1.2] as Vec2 },
  ],
};

/** Waypoint graph for simple obstacle avoidance (~12 nodes). Edges are undirected. */
export const WAYPOINTS: { id: string; pos: Vec2; links: string[] }[] = [
  { id: "w_clear", pos: [0, 0], links: ["w_porch", "w_east", "w_south", "w_pondE", "w_garden", "w_west"] },
  { id: "w_porch", pos: [-6, -2.4], links: ["w_clear", "w_west", "w_nw"] },
  { id: "w_west", pos: [-10.5, -1.5], links: ["w_porch", "w_clear", "w_hammock", "w_nw", "w_pondW"] },
  { id: "w_hammock", pos: [-11, 2.6], links: ["w_west", "w_pondW"] },
  { id: "w_nw", pos: [-10.5, -9.8], links: ["w_west", "w_north", "w_porch"] },
  { id: "w_north", pos: [-1, -11.5], links: ["w_nw", "w_ne"] },
  { id: "w_ne", pos: [2, -8], links: ["w_north", "w_garden", "w_hive"] },
  { id: "w_garden", pos: [4, -3.5], links: ["w_clear", "w_ne", "w_hive", "w_east"] },
  { id: "w_hive", pos: [9.5, -6.8], links: ["w_garden", "w_ne", "w_east"] },
  { id: "w_east", pos: [10.5, 3], links: ["w_clear", "w_garden", "w_hive", "w_creek", "w_south"] },
  { id: "w_creek", pos: [11.5, 8.5], links: ["w_east", "w_south"] },
  { id: "w_south", pos: [1, 10], links: ["w_clear", "w_east", "w_creek", "w_path", "w_pondE"] },
  { id: "w_pondE", pos: [-3.6, 7], links: ["w_clear", "w_south", "w_pondW"] },
  { id: "w_pondW", pos: [-11.8, 6], links: ["w_hammock", "w_west", "w_pondE"] },
  { id: "w_path", pos: [0, 15.5], links: ["w_south"] },
];

/** Surface under a position (for footsteps). Wood: porch, pier, footbridge; water: creek/pond edge; dirt: path. */
export function surfaceAt(x: number, z: number): Surface {
  // porch boards
  if (x > -8.6 && x < -3.4 && z > -3.8 && z < -1.8) return "wood";
  // pier: from shore (-4.6, 7.2) to (-5.6, 9.8), ~1.2 m wide
  if (x > -6.4 && x < -4.2 && z > 7.6 && z < 10.2) return "wood";
  // footbridge over the creek
  if (x > 11 && x < 13 && z > 8.2 && z < 9.8) return "wood";
  // pond edge
  const dp = Math.hypot(x + 8, z - 10);
  if (dp < 4.1) return "water";
  // creek band (roughly x ≈ 12 + 0.15*(z-9))
  if (Math.abs(x - (12 + 0.15 * (z - 9))) < 0.9) return "water";
  // forest path
  if (Math.abs(x) < 1.2 && z > 10.5) return "dirt";
  return "grass";
}

export const SET_BOUNDS = { minX: -19, maxX: 19, minZ: -19, maxZ: 19 };
