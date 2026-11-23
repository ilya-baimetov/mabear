// Set "Bear's yard" (spec §7.2). Origin at centre, +z toward the default camera (south). Units: metres.
import type { Lang, MarkId, SceneLocation, Surface, Vec2 } from "../schema";
export type { SceneLocation };
import {COOKING_STATION} from '../cookingStation';
import {pondWaterAt,pondPierAt} from '../pond';
import {HOUSE_KITCHEN_MARK,HOUSE_KITCHEN_FACING,HOUSE_LIVING_MARK,HOUSE_LIVING_SEAT_HEIGHT,isHousePoint} from '../houseLayout';
import {KITCHEN_CUPBOARD} from '../interactiveObjects';

export interface MarkDef {
  id: MarkId;
  pos: Vec2; // [x, z]
  /** yaw (radians) an actor standing at this mark should face; 0 = +z */
  facing: number;
  /** "cluster" groups nearby marks for the cinematographer's establishing-shot rule */
  cluster: "house" | "interior" | "garden" | "yard" | "pond" | "edge";
  description: string;
  name: Record<Lang, string>;
}

export const SCENE_LOCATION_NAMES: Record<SceneLocation, Record<Lang, string>> = {
  yard: { en: "Bear’s backyard", ru: "Во дворе у Мишки" },
  house: { en: "Inside Bear’s house", ru: "В доме у Мишки" },
  pond: { en: "The forest pond", ru: "Лесной пруд" },
  wolves: { en: "The wolves’ camp", ru: "Лагерь волков" },
};

export const MARKS: Record<MarkId, MarkDef> = {
  cupboard: { id: 'cupboard', pos: [...KITCHEN_CUPBOARD.approach], facing: -Math.PI / 2, cluster: 'interior', name: { en: "cupboard", ru: "шкаф" }, description: 'Bear’s upper kitchen cupboard. Bear can open/close it and take the single pantry_honey jar from its shelf.' },
  clearing: { id: "clearing", pos: [0, 0], facing: 0, cluster: "yard", name: { en: "yard", ru: "двор" }, description: "Open grass in front of the house" },
  porch: { id: "porch", pos: [-6, -2.6], facing: 0, cluster: "house", name: { en: "porch", ru: "крыльцо" }, description: "Wooden porch with three steps in front of Bear's house" },
  door: { id: "door", pos: [-6.63, -4.35], facing: Math.PI, cluster: "house", name: { en: "door", ru: "дверь" }, description: "Front door of Bear's house. Open/close it here; walk_to house_living enters and continues inside." },
  garden: { id: "garden", pos: [5, -5], facing: Math.PI, cluster: "garden", name: { en: "garden", ru: "огород" }, description: "Vegetable beds with carrots and cabbages, small fence" },
  beehive: { id: "beehive", pos: [10, -8], facing: Math.PI, cluster: "garden", name: { en: "beehive", ru: "улей" }, description: "Wooden beehive on a stump; bees buzz nearby" },
  swing: { id: "swing", pos: [8, 2], facing: 0, cluster: "yard", name: { en: "swing", ru: "качели" }, description: "Rope swing hanging from a big oak" },
  hammock: { id: "hammock", pos: [-11, 2], facing: .8, cluster: "house", name: { en: "hammock", ru: "гамак" }, description: "Hammock between two pines (Bear's nap spot)" },
  pond_shore: { id: "pond_shore", pos: [-6, 8], facing: Math.atan2(-2, 2), cluster: "pond", name: { en: "pond", ru: "пруд" }, description: "Dry south-east shore of the woodland pond" },
  pier: { id: "pier", pos: [-5.5, 9.5], facing: Math.atan2(-2.5, .5), cluster: "pond", name: { en: "pier", ru: "причал" }, description: "End of a small wooden pier; fishing spot" },
  table: { id: "table", pos: [2, 1.5], facing: 0, cluster: "yard", name: { en: "table", ru: "стол" }, description: "Outdoor wooden table with a samovar/teapot" },
  bench: { id: "bench", pos: [2, 3], facing: Math.PI, cluster: "yard", name: { en: "bench", ru: "скамейка" }, description: "Bench beside the table" },
  woodpile: { id: "woodpile", pos: [-12, -5], facing: 0, cluster: "house", name: { en: "woodpile", ru: "поленница" }, description: "Stacked logs and a chopping stump (no axe)" },
  path_entry: { id: "path_entry", pos: [0, 16], facing: Math.PI, cluster: "edge", name: { en: "forest path", ru: "лесная тропинка" }, description: "Forest path where characters enter and leave the yard" },
  big_tree: { id: "big_tree", pos: [-2, -10], facing: 0, cluster: "house", name: { en: "big tree", ru: "большое дерево" }, description: "Large pine behind the house; hiding spot" },
  bush: { id: "bush", pos: [6, 7], facing: 0, cluster: "yard", name: { en: "bush", ru: "куст" }, description: "Round bush; hiding spot" },
  creek: { id: "creek", pos: [12, 9], facing: -1.57, cluster: "edge", name: { en: "creek", ru: "ручей" }, description: "Small creek on the yard's east edge with a plank footbridge" },
  van: { id: "van", pos: [12, -1], facing: Math.PI / 2, cluster: "edge", name: { en: "ambulance", ru: "скорая помощь" }, description: "The Wolves' old ambulance van parked at the forest edge; set dressing and a hiding spot" },
  house_kitchen: { id: "house_kitchen", pos: [...HOUSE_KITCHEN_MARK], facing: HOUSE_KITCHEN_FACING, cluster: "interior", name: { en: "kitchen", ru: "кухня" }, description: "Inside Bear's house: kitchen worktop for cooking pancakes" },
  house_living: { id: "house_living", pos: [...HOUSE_LIVING_MARK], facing: 0, cluster: "interior", name: { en: "living room", ru: "гостиная" }, description: "Inside Bear's house: a comfortable seat in the living room" },
};

/** Water contact shared by fishing animation, its float, and the cast splash. */
export const FISHING_WATER_TARGET: readonly [number, number, number] = [-8, .035, 10];

export const isInteriorMark = (mark: string | null | undefined): mark is "house_kitchen" | "house_living" | 'cupboard' => mark === "house_kitchen" || mark === "house_living" || mark==='cupboard';
/** Floor footprint; shared by semantic routing and physical interior rendering. */
export const isInsideHouse = isHousePoint;

/** Physical seat tops, shared by motion and camera head-height estimates. */
export const SEAT_HEIGHT:Readonly<Record<string,number>>={bench:.45,hammock:.62,swing:.45,woodpile:.4,house_living:HOUSE_LIVING_SEAT_HEIGHT};
/** Semantic marks are recompiled into the current set; each stage has a separate footprint. */
export function sceneLocationAt(x:number,z:number):SceneLocation{
  if(isInsideHouse(x,z))return 'house';
  if((x < -3.4 && z > 6.2)||pondWaterAt(x,z,.2))return 'pond';
  if(x > 11 && z > -4.5 && z < 3)return 'wolves';
  return 'yard';
}

/** Static obstacles for path planning: circles [x, z, radius] and axis-aligned boxes [minX, minZ, maxX, maxZ]. */
export const OBSTACLES = {
  circles: [
    { id: "pond", c: [-8, 10] as Vec2, r: 3.5 },
    { id: "table", c: [2, 1.5] as Vec2, r: 0.9 },
    { id: "big_tree", c: [-2, -10.6] as Vec2, r: 0.8 },
    { id: "bush", c: [6, 7.6] as Vec2, r: 1.0 },
  ],
  boxes: [
    { id: "cooking_helper", min: [COOKING_STATION.position[0]-COOKING_STATION.width/2, COOKING_STATION.stepBack] as Vec2, max: [COOKING_STATION.position[0]+COOKING_STATION.width/2, COOKING_STATION.topFront] as Vec2 },
    { id: "house", min: [-9.5, -9] as Vec2, max: [-2.5, -3.7] as Vec2 },
    { id: "van", min: [13, -3.2] as Vec2, max: [15.2, 1.2] as Vec2 },
  ],
};

/** Waypoint graph for simple obstacle avoidance (~12 nodes). Edges are undirected. */
export const WAYPOINTS: { id: string; pos: Vec2; links: string[] }[] = [
  { id: "w_helperBack", pos: [.4,-.4], links: ["w_clear","w_tableW","w_garden","w_helperBackE"] },
  { id: "w_helperBackE", pos: [1.8,-.4], links: ["w_helperBack","w_garden","w_east"] },
  { id: "w_clear", pos: [0, 0], links: ["w_porch", "w_east", "w_south", "w_pondE", "w_garden", "w_west"] },
  { id: "w_tableW", pos: [.4,3.1], links: ["w_clear","w_south","w_east"] },
  { id: "w_porch", pos: [-6, -2.4], links: ["w_clear", "w_west", "w_nw"] },
  { id: "w_west", pos: [-10.5, -1.5], links: ["w_porch", "w_clear", "w_hammock", "w_nw", "w_pondW"] },
  { id: "w_hammock", pos: [-11, 2.6], links: ["w_west", "w_pondW"] },
  { id: "w_nw", pos: [-17, -6.5], links: ["w_west", "w_farNW", "w_porch"] },
  { id: "w_farNW", pos: [-17,-17], links: ["w_nw","w_farN"] },
  { id: "w_farN", pos: [-2.7,-17], links: ["w_farNW","w_north"] },
  { id: "w_north", pos: [-1, -11.5], links: ["w_nw", "w_ne"] },
  { id: "w_ne", pos: [2, -8], links: ["w_north", "w_garden", "w_hive"] },
  { id: "w_garden", pos: [4, -3.5], links: ["w_clear", "w_ne", "w_hive", "w_east"] },
  { id: "w_hive", pos: [9.5, -6.8], links: ["w_garden", "w_ne", "w_east"] },
  { id: "w_vanNW", pos: [12.5, -3.7], links: ["w_hive", "w_vanNE", "w_vanSW"] },
  { id: "w_vanNE", pos: [15.7, -3.7], links: ["w_vanNW", "w_vanSE"] },
  { id: "w_vanSW", pos: [12.5, 1.7], links: ["w_east", "w_vanNW", "w_vanSE"] },
  { id: "w_vanSE", pos: [15.7, 1.7], links: ["w_vanNE", "w_vanSW"] },
  { id: "w_east", pos: [10.5, 3], links: ["w_clear", "w_garden", "w_hive", "w_creek", "w_south"] },
  { id: "w_creek", pos: [11.5, 8.5], links: ["w_east", "w_south"] },
  { id: "w_south", pos: [1, 10], links: ["w_clear", "w_east", "w_creek", "w_path", "w_pondE"] },
  { id: "w_pondE", pos: [-3.6, 7], links: ["w_clear", "w_south", "w_pondW"] },
  { id: "w_pondW", pos: [-11.8, 6], links: ["w_hammock", "w_west", "w_pondE"] },
  { id: "w_pondSW", pos: [-12.1, 14.1], links: ["w_pondW", "w_path"] },
  { id: "w_path", pos: [0, 15.5], links: ["w_south"] },
];

/** Surface under a position (for footsteps). Wood: porch, pier, footbridge; water: creek/pond edge; dirt: path. */
export function surfaceAt(x: number, z: number): Surface {
  if (isInsideHouse(x, z)) return "wood";
  // porch boards
  if (x > -8.6 && x < -3.4 && z > -3.8 && z < -1.8) return "wood";
  // pier: from shore (-4.6, 7.2) to (-5.6, 9.8), ~1.2 m wide
  if (pondPierAt(x,z,.04)) return "wood";
  // footbridge over the creek
  if (x > 11 && x < 13 && z > 8.2 && z < 9.8) return "wood";
  // pond edge
  if (pondWaterAt(x,z,.25)) return "water";
  // creek band (roughly x ≈ 12 + 0.15*(z-9))
  if (Math.abs(x - (12 + 0.15 * (z - 9))) < 0.9) return "water";
  // forest path
  if (Math.abs(x) < 1.2 && z > 10.5) return "dirt";
  return "grass";
}

export const SET_BOUNDS = { minX: -19, maxX: 19, minZ: -19, maxZ: 19 };
