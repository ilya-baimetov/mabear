// Set "Bear's yard" (spec §7.2). Every element is a stand-in for an existing Animaccord 3D source and lives in its own
// NAMED anchor group placed from the set data, so a production glTF export can replace any element 1:1 through the
// asset manifest (src/engine/assets.ts). Static procedural geometry is merged per material across the whole set
// (BufferGeometryUtils.mergeGeometries) to stay far below the ~150 draw-call budget; the anchors stay in the graph.
import * as THREE from "three";
import {buildHouseDoor,updateHouseDoor} from './houseDoor';
import {entranceSupportAt} from '../../shared/interactiveObjects';
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { mergeVertices, mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MARKS, sceneLocationAt, type SceneLocation } from "../../shared/bible/set";
import type { MarkId, Vec2 } from "../../shared/schema";
import { GeoBag, lumpy, paint, rng, xf, type LookMaterials, type MatKey } from "../look";
import { DETAIL_MEAN_SRGB, type EnvTextures } from "./textures";
import { buildForestLocation } from "./forestLocations";
import { buildHouseInterior, updateHouseInterior, updateHouseInteriorView } from "./houseInterior";
import { NatureAssets, type NatureId, type NatureSpot } from "./nature";
import {pondRadius,POND_PIER_START} from '../../shared/pond';
import {COOKING_STATION,cookingSupportHeightAt} from '../../shared/cookingStation';
export {pondRadius} from '../../shared/pond';

// ---------------------------------------------------------------------------------------------------------------
// Element registry (ids + placement). Placement mirrors src/shared/bible/set.ts marks.
// ---------------------------------------------------------------------------------------------------------------

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

const PIER_START: Vec2 = [...POND_PIER_START];
const PIER_DIR = new THREE.Vector2(-1, 2.6).normalize();
const PIER_YAW = Math.atan2(PIER_DIR.x, PIER_DIR.y);
const BRIDGE_YAW = 0.149;
export const PORCH_HEIGHT = 0.32;
export const TABLE_TOP = 0.78; // matches the player's PROP_REST_HEIGHT.table
export const SAMOVAR_TOP = TABLE_TOP + 0.47;
export const PIER_HEIGHT = 0.28;
const SAMOVAR_XZ: Vec2 = [2.22, 1.28];

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
  // rotated 46° so neither pine trunk stands on the hammock→clearing lane or the w_hammock waypoint paths
  hammock: { id: "hammock", pos: [-11, 0, 2.2], rotY: 0.8, mark: "hammock", description: "Striped hammock between two pines" },
  pond: { id: "pond", pos: [-8, 0, 10], rotY: 0, mark: "pond_shore", description: "Woodland pond with an irregular leafy bank and reflected trees" },
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
// Pure helpers: surface heights (actors stand on the porch/pier/bridges; props rest on tables etc.)
// ---------------------------------------------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function toLocal(x: number, z: number, def: SetElementDef): [number, number] {
  const dx = x - def.pos[0];
  const dz = z - def.pos[2];
  const c = Math.cos(def.rotY), s = Math.sin(def.rotY);
  // inverse of a yaw rotation: local = R(-yaw) * d
  return [c * dx - s * dz, s * dx + c * dz];
}

/** Height of the walkable surface under (x, z): porch deck + steps, pier, footbridges. 0 on the ground. */
export function walkHeightAt(x: number, z: number): number {
  const entrance=entranceSupportAt(x,z);if(entrance>0)return entrance;
  const cookingStep=cookingSupportHeightAt(x,z);
  if(cookingStep>0)return cookingStep;
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

function bridgeDeckY(lx: number): number {
  return 0.05 + 0.2 * Math.cos((Math.PI * Math.max(-1.4, Math.min(1.4, lx))) / 2.8);
}

/** Height a resting prop should sit at (table top, bench seat, stump, porch…). */
export function restHeightAt(x: number, z: number): number {
  if (Math.hypot(x - 2, z - 1.5) < 0.72) return TABLE_TOP;
  if (Math.abs(x - 2) < 0.8 && Math.abs(z - 3) < 0.2) return 0.47;
  if (Math.hypot(x - 10.2, z - 9.1) < 0.4) return 0.5;
  if (Math.hypot(x + 13.4, z + 4.6) < 0.3) return 0.45;
  return walkHeightAt(x, z);
}

const POND_C: Vec2 = [-8, 10];

function creekCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(CREEK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
}

let _creekSamples: Vec2[] | null = null;
function creekSamples(): Vec2[] {
  if (!_creekSamples) _creekSamples = creekCurve().getSpacedPoints(160).map((p) => [p.x, p.z] as Vec2);
  return _creekSamples;
}
/** Distance from (x, z) to the creek centreline. */
export function creekDistance(x: number, z: number): number {
  const s = creekSamples();
  let best = Infinity;
  for (let i = 0; i < s.length - 1; i++) {
    const [ax, az] = s[i], [bx, bz] = s[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1));
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best) best = d;
  }
  return best;
}

function insidePond(x: number, z: number, pad = 0): boolean {
  const dx = x - POND_C[0], dz = z - POND_C[1];
  return Math.hypot(dx, dz) < pondRadius(Math.atan2(dz, dx)) + pad;
}

/** Path centre x at depth z (the forest path wanders slightly). */
function pathX(z: number): number {
  return 0.35 * Math.sin(z * 0.25);
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------------------------

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs);
const sph = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);

/**
 * Soft organic blob (canopies, bushes, rocks): welded icosphere, gentle lumps, smooth normals blended toward the
 * sphere normal ("puffy" shading) so low-poly canopies read as soft CG rather than faceted game art.
 */
function blob(r: number, seed: number, amp = 0.12, detail = 2, puff = 0.55): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  lumpy(g, amp * r * (detail < 2 ? 0.6 : 1), 2.2 / r, seed);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    n.fromBufferAttribute(nor, i).lerp(v, puff).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Cylinder between two points. */
function beam(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8): { g: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const len = a.distanceTo(b);
  const g = cyl(r1, r0, len, seg);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  return { g, m };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Curved, closed leaf with a raised midrib. All leaves are real lit geometry, batched with their tree. */
function leaf(length: number, width: number, bend = 0.14): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Long axis +z, narrow pointed tip; a shallow ridge catches the sky light.
  const p = [0, 0, 0, -width, length * .035, length * .43, 0, length * .1, length * .48,
    width, length * .035, length * .43, 0, length * bend, length];
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4, 1, 2, 0, 2, 3, 0, 4, 2, 1, 4, 3, 2]);
  const solid = g.toNonIndexed();
  g.dispose();
  solid.computeVertexNormals();
  return solid;
}

/** A small wildflower with a cupped ring of petals and a warm raised centre. */
function blossom(b: GeoBag, x: number, y: number, z: number, size: number, color: number, seed: number): void {
  const r = rng(seed);
  const petals = color === 0xffffff ? 7 : 5;
  for (let k = 0; k < petals; k++) {
    const a = k / petals * Math.PI * 2 + seed;
    b.add("foliage", leaf(size, size * .42, .14), color,
      xf([x, y, z], [0, a, 0]));
  }
  b.add("foliage", sph(size * .26, 8, 5), color === 0xffd84a ? 0x9d6d30 : 0xe9b84e,
    xf([x, y + size * .08, z], [0, r() * 3, 0], [1, .55, 1]));
}

/** Fine, scattered broad leaves break up the outer silhouette instead of inflating another sphere. */
function leafyCrown(bag: GeoBag, radius: number, seed: number, m: THREE.Matrix4, color: number, count = 90): void {
  const r = rng(seed), base = new THREE.Color(color), shade = new THREE.Color();
  // Small recessed core prevents holes through the crown; real leaves define its visible perimeter.
  bag.add("foliage", blob(radius * .76, seed, .1, 1, .7), color, m, { aoBottom: .2 });
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, yy = r() * 1.8 - .8;
    const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
    const d = radius * (.78 + r() * .25);
    const size = radius * (.22 + r() * .17);
    shade.copy(base).multiplyScalar(.8 + r() * .35);
    const p: [number, number, number] = [Math.cos(a) * rad * d, yy * d, Math.sin(a) * rad * d];
    bag.add("foliage", leaf(size, size * .36, .1 + r() * .2), shade,
      xf(p, [-.5 + yy * .8 + (r() - .5) * .7, -a + Math.PI / 2, (r() - .5) * 1.1]).premultiply(m));
  }
}

/** Soft conifer with radial, sagging boughs, fine leafy sprays and visible branching. No stacked cone crowns. */
export function addPine(bag: GeoBag, height: number, seed: number, m: THREE.Matrix4, mat: MatKey = "foliage", lod = 0, clear = 0): void {
  const r = rng(seed), h = height;
  bag.add("bark", new THREE.CylinderGeometry(.012 * h, .039 * h, .94 * h, lod ? 6 : 12, 3), 0x65533e,
    xf([0, .47 * h, 0]).premultiply(m), { aoBottom: .35 });
  const baseY = Math.max(h * .24, clear), span = h - baseY;
  const levels = lod ? 5 : 6;
  const colors = [0x315942, 0x38694b, 0x427650, 0x4d8054, 0x5b8d5d, 0x6a9864];
  for (let level = 0; level < levels; level++) {
    const f = level / (levels - 1);
    const radius = h * (.23 - f * .18);
    const y = baseY + span * (.08 + f * .81);
    const branches = lod ? 3 : 5;
    for (let j = 0; j < branches; j++) {
      const a = j / branches * Math.PI * 2 + level * 1.71 + seed;
      const len = radius * (.83 + r() * .27);
      const matrix = xf([Math.cos(a) * len * .43, y + (r() - .5) * h * .025, Math.sin(a) * len * .43],
        [.13 + f * .12, -a + Math.PI / 2, 0], [len * .53, h * (.045 - f * .018), len * .78]).premultiply(m);
      // Compact branch mass supports the finer terminal sprays without the round broccoli silhouette.
      bag.add(mat, blob(1, seed + level * 5 + j, .16, lod ? 0 : 1, .75), colors[level], matrix, { aoBottom: .25 });
      if (!lod) {
        const endpoint = V(Math.cos(a) * len, y - h * .025, Math.sin(a) * len);
        const branch = beam(V(0, y + h * .02, 0), endpoint, h * .01, h * .003, 5);
        bag.add("bark", branch.g, 0x69553c, branch.m.premultiply(m));
        // Alternating flattened sprays make an irregular, needle-like edge in silhouette.
        for (let k = 0; k < 14; k++) {
          const t = .25 + .75 * k / 14;
          const side = k % 2 ? 1 : -1;
          const off = Math.sin(t * Math.PI) * len * .3 * side;
          const x = Math.cos(a) * len * t - Math.sin(a) * off;
          const z = Math.sin(a) * len * t + Math.cos(a) * off;
          const yy = y + h * .025 - h * .05 * t;
          const sz = h * (.052 - f * .024) * (.8 + r() * .4);
          bag.add(mat, leaf(sz, sz * .3, .2), colors[Math.min(5, level + (k % 3 === 0 ? 1 : 0))],
            xf([x, yy, z], [-.18, -a + Math.PI / 2 + side * .8, side * .35]).premultiply(m));
        }
      }
    }
  }
  // Slender, asymmetric leader, softened rather than a geometric cone.
  bag.add(mat, blob(h * .048, seed + 80, .1, 1, .8), 0x65915e,
    xf([h * .012, h * .96, 0], [0, 0, -.08], [1, 2.3, 1]).premultiply(m));
}

/** Birch: branching white trunk and many individually lit broad leaves around airy crown clusters. */
export function addBirch(bag: GeoBag, height: number, seed: number, m: THREE.Matrix4, mat: MatKey = "foliage", lod = 0): void {
  const r = rng(seed), h = height;
  const marks = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
    const a = Math.atan2(p.z, p.x);
    if (Math.sin(p.y * 13 + a * 2 + seed) > .89 || Math.sin(p.y * 5.1 - a + seed * 2) > .97) out.setHex(0x575a4e);
  };
  bag.add("bark", new THREE.CylinderGeometry(.014 * h, .031 * h, .86 * h, lod ? 6 : 12, lod ? 4 : 16), 0xe3e0cd,
    xf([0, .43 * h, 0]).premultiply(m), { colorFn: marks });
  const colors = [0x71965c, 0x89aa69, 0x7b9e5c, 0x90ad6d, 0x658b50];
  const count = lod ? 4 : 7;
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1), a = i * 2.39996 + seed;
    const spread = h * .13 * (1 - f * .65), y = h * (.54 + f * .37);
    const x = Math.cos(a) * spread, z = Math.sin(a) * spread;
    const rr = h * (.16 - f * .045) * (.9 + r() * .2);
    const cm = xf([x, y, z], [0, a, 0], [1, 1.05, .86]).premultiply(m);
    if (lod) bag.add(mat, blob(rr, seed * 7 + i, .16, 0, .8), colors[i % colors.length], cm);
    else {
      leafyCrown(bag, rr, seed * 7 + i, cm, colors[i % colors.length], 52);
      const branch = beam(V(0, y - h * .12, 0), V(x, y, z), h * .012, h * .004, 6);
      bag.add("bark", branch.g, 0xd9d7c4, branch.m.premultiply(m), { colorFn: marks });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Element builders (local coordinates; the anchor carries world placement)
// ---------------------------------------------------------------------------------------------------------------

interface BuildCtx {
  bag: GeoBag;
  /** non-mergeable children (instanced meshes, moving parts), added to the anchor group */
  dyn: THREE.Object3D[];
  mats: LookMaterials;
  extra: SetExtras;
}

interface SetExtras {
  nature: NatureAssets;
  swingPivot?: THREE.Object3D;
  swingSeat?: THREE.Object3D;
  smoke?: THREE.Points;
  bees?: THREE.Points;
  grassMat?: THREE.MeshStandardMaterial;
  groundTex?: THREE.Texture | null;
  /** wind uniforms of the grass tufts (vertex sway) */
  grassUniforms?: { uTime: { value: number }; uWind: { value: number } };
  waterUniforms?: { uSetWaterTime: { value: number } };
  /** detail-texture uniforms of the ground shader (CC0 grass / dirt swap in when loaded) */
  groundUniforms?: GroundDetailUniforms;
  disposables: { dispose(): void }[];
}

/** Only failed model requests use the coarse local fallback; successful loads always use authored geometry. */
function queueNature(c: BuildCtx, parent: THREE.Group, id: NatureId, spots: NatureSpot[], castShadow = false, foliageOnly = false): void {
  c.extra.nature.add(parent, id, spots, castShadow, foliageOnly, () => {
    const bag = new GeoBag();
    spots.forEach((sp, i) => {
      const m = xf([sp.x, sp.y ?? 0, sp.z], [0, sp.yaw ?? 0, 0]);
      if (id.startsWith("Pine")) addPine(bag, sp.height, i + 93, m, "foliage", 1);
      else if (id.startsWith("Common") || id.startsWith("Birch")) addBirch(bag, sp.height, i + 109, m, "foliage", 1);
      else bag.add("foliage", blob(sp.height * .45, i, .1, 1, .7), 0x5b7848,
        xf([sp.x, (sp.y ?? 0) + sp.height * .45, sp.z]));
    });
    const fallback = bag.build(c.mats, `nature:fallback:${id}`, { cast: castShadow });
    fallback.userData = { fallback: true, failedAsset: id };
    parent.add(fallback);
    bag.dispose();
  });
}

function buildHouse(c: BuildCtx): void {
  const b = c.bag;
  const W = 6.4, D = 4.8, r = 0.2, step = 0.37, base = 0.25;
  const rows = 16, groundRows = 9;
  // stone foundation
  b.add("stone", new RoundedBoxGeometry(W + 0.3, base, D + 0.3, 2, 0.06), 0x9a948a, xf([0, base / 2, 0]), { jitter: 0.1 });
  for (let i = 0; i < 13; i++) {
    b.add("stone", blob(.27, i + 500, .1, 1, .7), [0x8b8e7d, 0x989a88, 0x797e71][i % 3],
      xf([-W / 2 + .2 + i * .5, .13, D / 2 + .05], [0, i * 1.7, 0], [1.05, .48, .7]), { aoBottom: .25 });
  }
  const logCols = [0x98704c, 0x8d6747, 0xa27a51];
  const endGrain = 0xc5a379;
  for (let i = 0; i < rows; i++) {
    const y = base + r + i * step;
    const col = logCols[i % 3];
    // front/back (along x)
    for (const z of [D / 2, -D / 2]) {
      b.add("wood", cyl(r, r, W + 0.55, 16), col, xf([0, y, z], [0, 0, Math.PI / 2]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i });
    }
    // sides (along z), half a step higher (interlocking corners)
    for (const x of [W / 2, -W / 2]) {
      b.add("wood", cyl(r, r, D + 0.55, 16), col, xf([x, y + step / 2, 0], [Math.PI / 2, 0, 0]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i + 50 });
    }
  }
  const wallTop = base + rows * step + 0.1;
  // floor band between storeys
  b.add("paint", box(W + 0.7, 0.12, 0.06), 0xf2ead8, xf([0, base + groundRows * step + 0.06, D / 2 + r + 0.02]));
  // gable roof: ridge along z, gable facing front (+z)
  const half = W / 2 + 0.6, rise = 2.4, roofLen = D + 1.3;
  const slope = Math.atan2(rise, half);
  const slant = Math.hypot(half, rise);
  const planks = 13;
  for (const side of [-1, 1]) {
    for (let i = 0; i < planks; i++) {
      const z = -roofLen / 2 + (i + 0.5) * (roofLen / planks);
      const g = box(slant + 0.12, 0.12, roofLen / planks - 0.015);
      const cx = side * half / 2, cy = wallTop + rise / 2 + 0.06;
      b.add("wood", g, [0x9d5634, 0x8f4d2f, 0xa65d38][(i + (side > 0 ? 1 : 0)) % 3], xf([cx, cy + (i % 2) * 0.012, z], [0, 0, -side * slope]), { jitter: 0.08, seed: i * 3 + side });
    }
  }
  // Individual overlapping cedar shakes give the roof an honest thickness and irregular highlight rhythm.
  for (const side of [-1, 1]) {
    const rows = 8, columns = 13;
    for (let row = 0; row < rows; row++) for (let k = 0; k < columns; k++) {
      const d = (row + .5) / rows * slant;
      const z = -roofLen / 2 + (k + .5) * roofLen / columns;
      const x = side * (half - d * Math.cos(slope));
      const y = wallTop + d * Math.sin(slope) + .13;
      const g = new RoundedBoxGeometry(slant / rows + .09, .045, roofLen / columns - .025, 1, .015);
      b.add("wood", g, [0x805b47, 0x906650, 0x9a7055, 0x89604b][(row * 7 + k) % 4],
        xf([x, y + (k % 3) * .003, z], [0, 0, -side * slope]), { jitter: .035, seed: row * 17 + k });
    }
  }
  b.add("wood", cyl(0.11, 0.11, roofLen + 0.1, 8), 0x7a4127, xf([0, wallTop + rise + 0.12, 0], [Math.PI / 2, 0, 0]));
  // gable triangles (vertical boards)
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2 - 0.05, 0);
  tri.lineTo(W / 2 + 0.05, 0);
  tri.lineTo(0, rise * (W / 2 + 0.05) / half);
  tri.closePath();
  for (const z of [D / 2 - 0.05, -D / 2 - 0.15]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
    b.add("wood", g, 0xc98a52, xf([0, wallTop - 0.02, z]), { jitter: 0.05 });
  }
  // gable trim (carved white boards along the roof edge, front)
  for (const side of [-1, 1]) {
    b.add("paint", box(slant + 0.15, 0.16, 0.06), 0xf3ecdc, xf([side * half / 2, wallTop + rise / 2 + 0.02, roofLen / 2 + 0.01], [0, 0, -side * slope]));
  }
  // round attic window
  addWindow(b, 0, wallTop + 0.85, D / 2 + 0.17, 0.62, 0.62, true);
  // windows: ground + upper floor (front), one each side
  const gwY = base + 1.75, uwY = base + 4.75;
  addWindow(b, -1.95, gwY, D / 2 + r + 0.02, 0.95, 1.1);
  addWindow(b, 1.95, gwY, D / 2 + r + 0.02, 0.95, 1.1);
  addWindow(b, -1.6, uwY, D / 2 + r + 0.02, 0.85, 0.95);
  addWindow(b, 1.6, uwY, D / 2 + r + 0.02, 0.85, 0.95);
  for (const s of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationY((s * Math.PI) / 2);
    const wb = new GeoBag();
    addWindow(wb, 0, gwY, D / 2 + r + 0.02, 0.85, 1.0);
    addWindow(wb, 0, uwY, D / 2 + r + 0.02, 0.75, 0.85);
    // side windows sit on the side walls: rotate the front-wall layout by ±90° and scale z→x distance
    const fix = new THREE.Matrix4().makeTranslation(s * (W / 2 - D / 2), 0, 0);
    b.absorb(wb, fix.multiply(m));
    wb.dispose();
  }
  // door
  const dz = D / 2 + r + 0.04;
  const doorH = 2.75, doorW = 1.4, db = PORCH_HEIGHT;
  b.add("wood", box(doorW, doorH, 0.08), 0x8a5230, xf([0, db + doorH / 2, dz]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.x + 0.7) % 0.28) - 0.14) > 0.125) out.multiplyScalar(0.75); },
  });
  b.add("wood", box(doorW - 0.1, 0.1, 0.1), 0x74431f, xf([0, db + doorH * 0.75, dz + 0.04]));
  b.add("wood", box(doorW - 0.1, 0.1, 0.1), 0x74431f, xf([0, db + doorH * 0.25, dz + 0.04]));
  b.add("paint", box(doorW + 0.34, 0.16, 0.1), 0xf3ecdc, xf([0, db + doorH + 0.08, dz + 0.02]));
  for (const s of [-1, 1]) b.add("paint", box(0.14, doorH, 0.1), 0xf3ecdc, xf([s * (doorW / 2 + 0.07), db + doorH / 2, dz + 0.02]));
  b.add("metal", sph(0.06, 8, 6), 0x2b2b2b, xf([0.45, db + 1.3, dz + 0.08]));
  for (const yy of [db + .55, db + 2.2]) {
    b.add("metal", new RoundedBoxGeometry(.34, .045, .016, 1, .01), 0x3b3c32,
      xf([-doorW / 2 + .12, yy, dz + .055]));
    b.add("metal", cyl(.02, .02, .13, 8), 0x3b3c32, xf([-doorW / 2 + .02, yy, dz + .065]));
  }
  // Simple diagonal porch braces make the structure read as built, not floating sheets.
  for (const side of [-1, 1]) {
    const brace = beam(V(side * 2.23, PORCH_HEIGHT + 2.3, D / 2 + 1.82),
      V(side * 1.55, PORCH_HEIGHT + 2.98, D / 2 + 1.82), .065, .065, 8);
    b.add("wood", brace.g, 0x8d6848, brace.m);
  }
  // chimney (stone) on the right slope, toward the back
  b.add("stone", new RoundedBoxGeometry(0.75, 3.5, 0.75, 2, 0.05), 0xa39486, xf([1.9, wallTop + 1.25, -0.9]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.y + 10) % 0.3) - 0.15) < 0.018) out.multiplyScalar(0.7); },
    jitter: 0.12,
  });
  b.add("stone", box(0.92, 0.14, 0.92), 0x7d726a, xf([1.9, wallTop + 3.04, -0.9]));
  // porch: deck, steps, posts, canopy, back railings
  const pz0 = D / 2, pz1 = D / 2 + 2.0;
  b.add("wood", box(4.8, 0.1, 2.0), 0xb07a48, xf([0, PORCH_HEIGHT - 0.05, (pz0 + pz1) / 2]), {
    colorFn: (p, n, out) => { if (n.y > 0.5 && Math.abs(((p.x + 10) % 0.3) - 0.15) > 0.135) out.multiplyScalar(0.7); },
  });
  b.add("wood", box(4.8, PORCH_HEIGHT - 0.1, 0.12), 0x8e5f36, xf([0, (PORCH_HEIGHT - 0.1) / 2, pz1 - 0.06]));
  for (let sI = 0; sI < 2; sI++) {
    const top = PORCH_HEIGHT * (2 - sI) / 3;
    b.add("wood", box(4.8, 0.06, 0.3), 0xb98250, xf([0, top - 0.03, pz1 + 0.15 + sI * 0.3]));
    b.add("wood", box(4.8, top - 0.06, 0.28), 0x8e5f36, xf([0, (top - 0.06) / 2, pz1 + 0.15 + sI * 0.3]));
  }
  const postH = 3.0;
  for (const s of [-1, 1]) {
    b.add("wood", cyl(0.09, 0.1, postH, 10), 0xb07a48, xf([s * 2.25, PORCH_HEIGHT + postH / 2, pz1 - 0.15]), { capColor: endGrain, capAxis: "y" });
    // back railings
    b.add("wood", box(0.07, 0.07, 1.3), 0xb07a48, xf([s * 2.3, PORCH_HEIGHT + 0.6, pz0 + 0.65]));
    for (let k = 0; k < 4; k++) b.add("wood", box(0.05, 0.6, 0.05), 0xa36f40, xf([s * 2.3, PORCH_HEIGHT + 0.3, pz0 + 0.15 + k * 0.33]));
  }
  // canopy (two planked slopes)
  const cLen = 2.35, cRise = 0.45;
  const cSlope = Math.atan2(cRise, cLen);
  b.add("wood", box(5.2, 0.09, Math.hypot(cLen, cRise)), 0x98522f, xf([0, PORCH_HEIGHT + postH + cRise / 2 + 0.05, pz0 + cLen / 2], [cSlope, 0, 0]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.x + 10) % 0.4) - 0.2) > 0.185) out.multiplyScalar(0.72); },
  });
  b.add("paint", box(5.25, 0.12, 0.05), 0xf3ecdc, xf([0, PORCH_HEIGHT + postH + 0.02, pz1 + 0.2]));
  // a little bench of flowers boxes under the front windows (charm)
  for (const s of [-1, 1]) {
    const fy = gwY - 0.55 - 0.32;
    b.add("wood", box(1.1, 0.18, 0.24), 0x9a6a3e, xf([s * 1.95, fy, D / 2 + r + 0.14]));
    for (let k = 0; k < 6; k++) {
      const px = s * 1.95 - .45 + k * .18, pz = D / 2 + r + .14;
      b.add("foliage", cyl(.008, .012, .21, 5), 0x486b3a, xf([px, fy + .19, pz]));
      for (const side of [-1, 1]) b.add("foliage", leaf(.15, .045, .3), 0x597c44,
        xf([px, fy + .14, pz], [-.4, side * 1.6 + k, side * .3]));
      blossom(b, px, fy + .29 + .03 * (k % 2), pz, .065,
        [0xdb7160, 0xffd84a, 0xe7a3b2, 0xffffff, 0xdb7160, 0xa790bb][k], k);
    }
  }
  // porch lantern (glass glows at night; the look's point light sits here)
  b.add("glass", box(0.18, 0.26, 0.18), 0xffffff, xf([1.3, PORCH_HEIGHT + postH - 0.45, D / 2 + 1.75]));
  b.add("paint", box(0.24, 0.05, 0.24), 0x2a2a2a, xf([1.3, PORCH_HEIGHT + postH - 0.3, D / 2 + 1.75]));
  b.add("paint", cyl(0.01, 0.01, 0.25, 4), 0x2a2a2a, xf([1.3, PORCH_HEIGHT + postH - 0.15, D / 2 + 1.75]));

  // smoke (deterministic, driven by t in update)
  c.extra.smoke = makeSmoke(new THREE.Vector3(1.9, wallTop + 3.25, -0.9));
  c.dyn.push(c.extra.smoke);
}

function addWindow(b: GeoBag, x: number, y: number, z: number, w: number, h: number, round = false): void {
  const white = 0xe8dec7, blue = 0x4b817c;
  if (round) {
    b.add("glass", new THREE.CircleGeometry(w / 2, 20), 0xffffff, xf([x, y, z + 0.01]));
    b.add("paint", new THREE.TorusGeometry(w / 2, 0.06, 6, 20), white, xf([x, y, z + 0.03]));
    b.add("paint", box(w, 0.05, 0.04), white, xf([x, y, z + 0.03]));
    b.add("paint", box(0.05, h, 0.04), white, xf([x, y, z + 0.03]));
    return;
  }
  b.add("glass", box(w, h, 0.04), 0xffffff, xf([x, y, z]));
  const f = 0.09;
  b.add("paint", box(w + 2 * f, f, 0.08), white, xf([x, y + h / 2 + f / 2, z + 0.02]));
  b.add("paint", box(w + 2 * f + 0.12, f * 1.2, 0.12), white, xf([x, y - h / 2 - f / 2, z + 0.04]));
  for (const s of [-1, 1]) b.add("paint", box(f, h, 0.08), white, xf([x + s * (w / 2 + f / 2), y, z + 0.02]));
  b.add("paint", box(w, 0.045, 0.05), white, xf([x, y + h * 0.12, z + 0.03]));
  b.add("paint", box(0.045, h, 0.05), white, xf([x, y, z + 0.03]));
  // carved crown (nalichnik)
  const crown = new THREE.Shape();
  crown.moveTo(-w / 2 - f - 0.06, 0);
  crown.lineTo(w / 2 + f + 0.06, 0);
  crown.quadraticCurveTo(w / 4, 0.12, 0, 0.26);
  crown.quadraticCurveTo(-w / 4, 0.12, -w / 2 - f - 0.06, 0);
  b.add("paint", new THREE.ExtrudeGeometry(crown, { depth: 0.04, bevelEnabled: true, bevelSize: .018, bevelThickness: .012, bevelSegments: 2, steps: 1, curveSegments: 16 }), white, xf([x, y + h / 2 + f, z]));
  // open shutters
  for (const s of [-1, 1]) {
    const sx = x + s * (w / 2 + f + w / 4 + 0.02);
    b.add("paint", box(w / 2, h, 0.05), blue, xf([sx, y, z + 0.02]));
    for (const yy of [-0.4, 0, 0.4]) b.add("paint", box(w / 2 + 0.02, 0.05, 0.06), white, xf([sx, y + yy * h, z + 0.04]));
  }
}

function makeSmoke(at: THREE.Vector3): THREE.Points {
  const N = 26;
  const seeds = new Float32Array(N * 4);
  const r = rng(99);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = i / N;
    seeds[i * 4 + 1] = r();
    seeds[i * 4 + 2] = r();
    seeds[i * 4 + 3] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uColor: { value: new THREE.Color(0xf4f1ec) }, uAlpha: { value: 0.5 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        float ph = fract(aSeed.x + uTime / 7.0);
        vec3 p = position + vec3(ph * 1.6 + sin(ph * 6.0 + aSeed.y * 6.28) * 0.25, ph * 3.4, sin(ph * 4.0 + aSeed.z * 6.28) * 0.3 - ph * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.35 + ph * 1.3 + aSeed.w * 0.2;
        gl_PointSize = size * uScale / max(0.1, -mv.z);
        vA = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * vA * uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.position.copy(at);
  pts.frustumCulled = false;
  pts.name = "set:chimney_smoke";
  return pts;
}

function buildGarden(c: BuildCtx): void {
  const b = c.bag;
  const L = 4.45, Wd = 0.88;
  const beds = [1.2, 0, -1.2];
  beds.forEach((z, bi) => {
    // frame
    for (const s of [-1, 1]) {
      b.add("wood", box(L, 0.12, 0.07), 0x947049, xf([0, 0.06, z + s * (Wd / 2)]), { jitter: 0.08, seed: bi * 2 + s });
      b.add("wood", box(0.07, 0.12, Wd), 0x947049, xf([s * L / 2, 0.06, z]));
    }
    b.add("soil", box(L - 0.07, 0.12, Wd - 0.07), 0x493b2a, xf([0, 0.07, z]), { jitter: 0.25, seed: bi });
    if (bi === 1) {
      for (let k = 0; k < 6; k++) addCabbage(b, -1.75 + k * 0.7, 0.13, z, 100 + k);
    } else {
      for (let k = 0; k < 9; k++) addCarrotTop(b, -1.7 + k * 0.42, 0.13, z + (k % 2 ? 0.1 : -0.1), bi * 20 + k);
    }
  });
  // small picket fence on W, N, E sides (south side open: the garden mark)
  const runs: [number, number, number, number][] = [
    [-2.6, -1.95, 2.6, -1.95],
  ];
  for (const [x0, z0, x1, z1] of runs) addPickets(b, x0, z0, x1, z1, 0.68, 0.32, 0x9f8c65, 0.065);
  // Row markers, a low tool rest and border flowers make a tended kitchen garden.
  for (const z of beds) {
    b.add("wood", box(.025,.43,.025),0xb39769,xf([-2.08,.22,z]));
    b.add("wood", box(.19,.12,.025),0xd3b784,xf([-2.08,.43,z]));
  }
  for(const side of [-1,1]) for(let k=0;k<8;k++) {
    const x=side*2.55,z=-1.55+k*.42,h=.30+(k%3)*.08;
    b.add("foliage",cyl(.01,.014,h,5),0x567d37,xf([x,h/2,z]));
    for(const a of [0,2.1,4.2])b.add("foliage",leaf(.21,.055,.4),0x659044,xf([x,h*.4,z],[-.3,a+k,0]));
    blossom(b,x,h,z,.09,k%3===0?0xe4ad37:0xf0cd57,k);
  }
}

function addCabbage(b: GeoBag, x: number, y: number, z: number, seed: number): void {
  const r = rng(seed);
  b.add("foliage", blob(0.21, seed, 0.08, 1), 0x91b761, xf([x, y + 0.13, z]), { jitter: 0.08, seed });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    b.add("foliage", sph(0.23, 10, 6), 0x67954d, xf([x + Math.cos(a) * 0.12, y + 0.08, z + Math.sin(a) * 0.12], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], [1, 0.25, 0.8]), { jitter: 0.1, seed: seed + i });
  }
}

function addCarrotTop(b: GeoBag, x: number, y: number, z: number, seed: number): void {
  const r = rng(seed);
  b.add("paint", cyl(0.045, 0.03, 0.06, 8), 0xf07f2a, xf([x, y + 0.02, z]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    b.add("foliage", new THREE.ConeGeometry(0.035, 0.28, 3, 1, true), 0x4f9e3a, xf([x + Math.cos(a) * 0.03, y + 0.17, z + Math.sin(a) * 0.03], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
  }
}

function addPickets(b: GeoBag, x0: number, z0: number, x1: number, z1: number, h: number, spacing: number, col: number, w = 0.06, seed = 1, missing = 0): void {
  const r = rng(seed * 17 + 3);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    if (missing && r() < missing) continue;
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const lean = (r() - 0.5) * 0.08;
    const hh = h * (0.92 + r() * 0.12);
    b.add("paint", box(w * 0.4, hh, w), col, xf([x, hh / 2, z], [lean, yaw, 0]), { aoBottom: 0.4, jitter: 0.08, seed: i });
    b.add("paint", new THREE.ConeGeometry(w * 0.72, w * 1.1, 4), col, xf([x, hh + w * 0.5, z], [lean, yaw + Math.PI / 4, 0]));
  }
  for (const ry of [0.32, 0.78]) {
    const g = box(0.035, 0.05, len);
    b.add("wood", g, 0xb08a60, xf([(x0 + x1) / 2, h * ry, (z0 + z1) / 2], [0, yaw, 0]));
  }
}

function buildBeehive(c: BuildCtx): void {
  const b = c.bag;
  b.add("bark", cyl(0.42, 0.48, 0.5, 14), 0x6e4a2c, xf([0, 0.25, 0]), { capColor: 0xd8ad78, capAxis: "y", aoBottom: 0.3 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    b.add("bark", new THREE.ConeGeometry(0.14, 0.5, 6), 0x6e4a2c, xf([Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]));
  }
  const hiveCol = [0xf2c75c, 0xe9b94a];
  for (let t = 0; t < 2; t++) {
    b.add("paint", new RoundedBoxGeometry(0.62, 0.3, 0.52, 2, 0.03), hiveCol[t], xf([0, 0.5 + 0.15 + t * 0.31, 0]), { jitter: 0.05 });
  }
  b.add("paint", box(0.3, 0.05, 0.03), 0x2a1a10, xf([0, 0.58, 0.265]));
  b.add("paint", box(0.4, 0.03, 0.12), 0xd9a744, xf([0, 0.555, 0.31]));
  const rs = Math.atan2(0.18, 0.38);
  for (const s of [-1, 1]) {
    b.add("paint", box(0.44, 0.04, 0.66), 0xb04a2f, xf([s * 0.19, 1.22, 0], [0, 0, -s * rs]));
  }
  c.extra.bees = makeBees(new THREE.Vector3(0, 0.9, 0.1));
  c.dyn.push(c.extra.bees);
}

function makeBees(at: THREE.Vector3): THREE.Points {
  const N = 7;
  const seeds = new Float32Array(N * 4);
  const r = rng(77);
  for (let i = 0; i < N * 4; i++) seeds[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform float uScale;
      void main() {
        float t = uTime * (0.8 + aSeed.x) + aSeed.y * 6.28;
        vec3 p = position + vec3(sin(t * 1.3) * (0.4 + aSeed.z * 0.5), 0.15 + sin(t * 2.1) * 0.25 + aSeed.w * 0.4, cos(t * 1.1) * (0.4 + aSeed.w * 0.5));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.07 * uScale / max(0.1, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        if (length(q) > 0.5) discard;
        vec3 col = mod(floor((q.x + 0.5) * 4.0), 2.0) < 1.0 ? vec3(1.0, 0.8, 0.15) : vec3(0.12, 0.08, 0.05);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.position.copy(at);
  pts.frustumCulled = false;
  pts.name = "set:bees";
  return pts;
}

function buildOakSwing(c: BuildCtx): void {
  const b = c.bag;
  const barkC = 0x6f4b2f;
  b.add("bark", cyl(0.32, 0.5, 3.8, 12, 3), barkC, xf([0, 1.9, 0]), { aoBottom: 0.35, jitter: 0.12 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.3;
    b.add("bark", new THREE.ConeGeometry(0.22, 0.9, 6), barkC, xf([Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25]));
  }
  const branches: [THREE.Vector3, THREE.Vector3, number][] = [
    [V(0, 3.3, 0), V(-0.65, 3.55, 3.0), 0.17], // swing branch (toward +z)
    [V(0, 3.4, 0), V(1.8, 5.0, -0.6), 0.2],
    [V(0, 3.6, 0), V(-1.6, 5.2, -0.8), 0.18],
    [V(0, 3.7, 0), V(0.3, 5.6, 1.2), 0.18],
  ];
  for (const [a, e, rr] of branches) {
    const { g, m } = beam(a, e, rr, rr * 0.6, 8);
    b.add("bark", g, barkC, m);
  }
  const crown = new THREE.Group(); crown.name = "set:oak:authored-crown"; c.dyn.push(crown);
  queueNature(c, crown, "CommonTree_1", [{ x: 0, z: 0, y: .1, height: 7.0, yaw: -.7 }], true, true);
  // swing: pivot under the branch; ropes + seat move as one object
  const pivot = new THREE.Group();
  pivot.name = "set:swing_pivot";
  pivot.position.set(-0.6, 3.42, 2.6);
  const sb = new GeoBag();
  const ropeL = 2.97;
  for (const s of [-1, 1]) sb.add("wood", cyl(0.02, 0.02, ropeL, 5), 0xd2bc8e, xf([s * 0.3, -ropeL / 2, 0]));
  sb.add("wood", new RoundedBoxGeometry(0.78, 0.06, 0.3, 2, 0.02), 0xa8703e, xf([0, -ropeL, 0]));
  const seatGrp = sb.build(c.mats, "set:swing_seat");
  sb.dispose();
  seatGrp.name = "set:swing_seat";
  pivot.add(seatGrp);
  c.extra.swingPivot = pivot;
  c.extra.swingSeat = seatGrp;
  c.dyn.push(pivot);
}

function buildHammock(c: BuildCtx): void {
  const b = c.bag;
  const trees = new THREE.Group(); trees.name = "set:hammock:trees"; c.dyn.push(trees);
  queueNature(c, trees, "Pine_3", [{ x: -2.1, z: 0, height: 8.5, yaw: .8 }], true);
  queueNature(c, trees, "Pine_1", [{ x: 2.1, z: 0, height: 9.4, yaw: 2.1 }], true);
  // fabric: sagging striped grid
  const U = 24, Vn = 6, L = 3.6, Wd = 1.1;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const stripes = [0xf3e6c8, 0xd0483a, 0xf3e6c8, 0x3d7fc1, 0xf3e6c8, 0xd0483a];
  const cc = new THREE.Color();
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    for (let j = 0; j <= Vn; j++) {
      const v = j / Vn;
      const x = -L / 2 + u * L;
      const narrow = 0.35 + 0.65 * Math.sin(Math.PI * u);
      const z = (v - 0.5) * Wd * narrow;
      const y = 1.05 - 0.43 * Math.sin(Math.PI * u) + 0.12 * Math.pow(2 * v - 1, 2) * narrow;
      pos.push(x, y, z);
      cc.setHex(stripes[Math.min(stripes.length - 1, Math.floor(v * stripes.length * 0.999))]);
      col.push(cc.r, cc.g, cc.b);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < Vn; j++) {
    const a = i * (Vn + 1) + j, bb = a + Vn + 1;
    idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.addPainted("fabric", g);
  // underside (flipped winding + normals) instead of a DoubleSide material
  const under = g.clone();
  const ui = under.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < ui.length; i += 3) { const t = ui[i + 1]; ui[i + 1] = ui[i + 2]; ui[i + 2] = t; }
  const un = under.attributes.normal;
  for (let i = 0; i < un.count; i++) un.setXYZ(i, -un.getX(i), -un.getY(i), -un.getZ(i));
  under.translate(0, -0.006, 0);
  b.addPainted("fabric", under);
  for (const s of [-1, 1]) {
    for (const zz of [-0.12, 0.12]) {
      const { g: rg, m } = beam(V(s * 1.8, 1.05, zz * 0.6), V(s * 2.0, 1.45, 0), 0.015, 0.015, 4);
      b.add("wood", rg, 0xd2bc8e, m);
    }
  }
}

/** Deterministic fine ripple normals, shared by pond and creek; no render target or extra draw call. */
function installWaterRipples(mat: THREE.MeshStandardMaterial): { uSetWaterTime: { value: number } } {
  const u = { uSetWaterTime: { value: 0 } };
  const previous = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, renderer) => {
    previous.call(mat, sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSetWaterWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSetWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSetWaterWorld; uniform float uSetWaterTime;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 w = vSetWaterWorld.xz;
        float t = uSetWaterTime;
        float wx = cos(w.x * 5.1 + w.y * 2.3 + t * 1.2) * .035 + cos(w.x * 10.2 - w.y * 3.8 - t * .8) * .018;
        float wz = cos(w.x * 2.3 + w.y * 6.5 - t * .9) * .03 + cos(w.y * 14.0 + t * .7) * .012;
        normal = normalize(normal + mat3(viewMatrix) * vec3(wx, 0.0, wz));
      `);
  };
  mat.customProgramCacheKey = () => key + ":set-water-ripples-v1";
  return u;
}

function buildPond(c: BuildCtx): void {
  const b = c.bag;
  const bankLeaf=(length:number,width:number)=>{
    const points:number[]=[],indices:number[]=[];
    for(let row=0;row<=8;row++){
      const t=row/8,w=Math.pow(Math.sin(Math.PI*t),.75)*width;
      points.push(-w,Math.sin(t*Math.PI)*length*.07,t*length,0,Math.sin(t*Math.PI)*length*.12,t*length,w,Math.sin(t*Math.PI)*length*.07,t*length);
      if(row)for(let col=0;col<2;col++){const a=(row-1)*3+col,c=row*3+col;indices.push(a,c,a+1,a+1,c,c+1);}
    }
    const front=new THREE.BufferGeometry();front.setAttribute('position',new THREE.Float32BufferAttribute(points,3));front.setIndex(indices);front.computeVertexNormals();
    const back=front.clone();back.setIndex(indices.flatMap((_,i)=>i%3?[]:[indices[i],indices[i+2],indices[i+1]]));back.computeVertexNormals();
    const a=front.toNonIndexed(),bb=back.toNonIndexed();front.dispose();back.dispose();
    const merged=mergeGeometries([a,bb],false)!;a.dispose();bb.dispose();return merged;
  };
  // radial water mesh with a depth gradient
  const segs = 128, rings = [0, 0.4, 0.7, 0.88, 1.0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const deep = new THREE.Color(0x263f31), shallow = new THREE.Color(0x67734b), cc = new THREE.Color();
  pos.push(0, 0.03, 0);
  col.push(deep.r, deep.g, deep.b);
  for (let ri = 1; ri < rings.length; ri++) {
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const rr = pondRadius(th) * rings[ri];
      pos.push(Math.cos(th) * rr, 0.03, Math.sin(th) * rr);
      cc.copy(deep).lerp(shallow, Math.pow(rings[ri], 2.2));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let ri = 1; ri < rings.length - 1; ri++) {
    const o0 = 1 + (ri - 1) * segs, o1 = 1 + ri * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(o0 + s, o0 + s1, o1 + s, o0 + s1, o1 + s1, o1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // ensure upward normals (winding)
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  // Real planar reflection is confined to this scene and rendered at half resolution.
  // It reflects the actual trees/actors instead of painting fake tree shadows into the water.
  const mirrorGeometry=g.clone().translate(0,-.03,0).rotateX(Math.PI/2);
  const mirror=new Reflector(mirrorGeometry,{textureWidth:512,textureHeight:512,multisample:0,clipBias:.003,color:0x55735b});
  mirror.name='set:pond:reflection';mirror.rotation.x=-Math.PI/2;mirror.position.y=.032;
  const renderReflection=mirror.onBeforeRender;let software:boolean|undefined,lastReflection=-Infinity;
  const reflectedPosition=new THREE.Vector3(1e6,1e6,1e6),reflectedRotation=new THREE.Quaternion();
  mirror.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
    if(software===undefined){
      const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      software=/swiftshader|llvmpipe|software/i.test(String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)));
      if(software){mirror.getRenderTarget().setSize(256,256);(mirror.material as THREE.ShaderMaterial).uniforms.uReflectionTexel.value=1/256;}
    }
    const t=c.extra.waterUniforms!.uSetWaterTime.value;
    // Software WebGL uses a small reflection cache; genuine camera cuts and seeks refresh immediately.
    // Ripple animation still runs every frame, and hardware keeps full-rate actor reflections.
    const cameraCut=camera.position.distanceToSquared(reflectedPosition)>.04||camera.quaternion.angleTo(reflectedRotation)>.045;
    if(software&&!cameraCut&&t>=lastReflection&&t-lastReflection<.125)return;
    renderReflection.call(this,renderer,scene,camera,geometry,material,group);
    lastReflection=t;reflectedPosition.copy(camera.position);reflectedRotation.copy(camera.quaternion);
  };
  const water=mirror.material as THREE.ShaderMaterial;
  water.uniforms.uSetWaterTime=c.extra.waterUniforms!.uSetWaterTime;
  water.uniforms.uReflectionTexel={value:1/512};
  water.vertexShader=water.vertexShader.replace('varying vec4 vUv;',
    'varying vec4 vUv; varying vec2 vPond; varying vec3 vBankColor; attribute vec3 color;')
    .replace('vUv = textureMatrix * vec4( position, 1.0 );','vUv = textureMatrix * vec4( position, 1.0 ); vPond = position.xy; vBankColor = color;');
  water.fragmentShader=water.fragmentShader.replace('varying vec4 vUv;',
    'varying vec4 vUv; varying vec2 vPond; varying vec3 vBankColor; uniform float uSetWaterTime; uniform float uReflectionTexel;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );',`vec4 rippleUv=vUv;
      rippleUv.xy += vec2(sin(vPond.x*7.1+vPond.y*3.2+uSetWaterTime*.7),cos(vPond.y*9.0-vPond.x*2.5-uSetWaterTime*.6))*.00045*vUv.w;
      vec2 stepUv=vec2(uReflectionTexel*1.5)*vUv.w;
      vec4 base = texture2DProj(tDiffuse,rippleUv)*.4;
      base+=texture2DProj(tDiffuse,rippleUv+vec4(stepUv.x,stepUv.y,0.,0.))*.15;
      base+=texture2DProj(tDiffuse,rippleUv+vec4(-stepUv.x,stepUv.y,0.,0.))*.15;
      base+=texture2DProj(tDiffuse,rippleUv+vec4(stepUv.x,-stepUv.y,0.,0.))*.15;
      base+=texture2DProj(tDiffuse,rippleUv+vec4(-stepUv.x,-stepUv.y,0.,0.))*.15;`)
    .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4(mix(vBankColor*.65,base.rgb,.36),1.0)');
  c.dyn.push(mirror);c.extra.disposables.push(mirror);g.dispose();
  // Damp shoreline blends into meadow. Only the access beach is bare sand: no decorative stone ring.
  const shorePos:number[]=[],shoreIdx:number[]=[],shoreColors:number[]=[];
  for(let i=0;i<=96;i++){
    const a=i/96*Math.PI*2,rr=pondRadius(a);
    const access=Math.exp(-Math.pow(Math.atan2(Math.sin(a+Math.PI/4),Math.cos(a+Math.PI/4))/.58,2));
    for(const [j,radius] of [rr-.04,rr+.25+access*.45+.16*Math.sin(a*5)].entries()){
      shorePos.push(Math.cos(a)*radius,.013,Math.sin(a)*radius);
      const color=new THREE.Color(j?0x779047:0x51593a).lerp(new THREE.Color(0xc6b27e),access*.9);
      shoreColors.push(color.r,color.g,color.b);
    }
    if(i)shoreIdx.push(i*2-2,i*2,i*2-1,i*2-1,i*2,i*2+1);
  }
  const shore=new THREE.BufferGeometry();shore.setAttribute("position",new THREE.Float32BufferAttribute(shorePos,3));shore.setAttribute('color',new THREE.Float32BufferAttribute(shoreColors,3));shore.setIndex(shoreIdx);shore.computeVertexNormals();
  b.addPainted("foliage",shore);
  // shore stones (skip the pier/shore-mark sector)
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + r() * 0.8;
    const deg = ((Math.atan2(Math.sin(th + Math.PI / 4), Math.cos(th + Math.PI / 4)) * 180) / Math.PI);
    if (Math.abs(deg) < 32) continue;
    const rr = pondRadius(th) + 0.05 + r() * 0.2;
    const s = 0.18 + r() * 0.22;
    b.add("stone", blob(s, 200 + i, 0.18, 1), 0x9d9a90, xf([Math.cos(th) * rr, s * 0.25, Math.sin(th) * rr], [r(), r() * 6, r()], [1, 0.6, 1]), { jitter: 0.15, seed: i });
  }
  // reeds and cattails on the far (north-west) edge
  for (let i = 0; i < 65; i++) {
    const th = Math.PI * (0.65 + r() * 1.15);
    const rr = pondRadius(th) - 0.2 + r() * 0.5;
    const h = 0.7 + r() * 0.7;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const lean: [number, number, number] = [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25];
    for(let k=0;k<4;k++)b.add("foliage",leaf(.55+r()*.55,.045,.5),0x456634,xf([x,.015,z],[-.7,r()*6.28,0]));
    b.add("foliage", cyl(0.012, 0.02, h, 4), 0x5f8f3a, xf([x, h / 2, z], lean));
    if (i % 2 === 0) b.add("foliage", cyl(0.035, 0.035, 0.16, 6), 0x6b3e22, xf([x + lean[2] * -h * 0.5, h - 0.05, z + lean[0] * h * 0.5], lean));
  }
  // Wide waxy bank leaves, low grasses and water plants interrupt the shoreline at different scales.
  for(let i=0;i<175;i++){
    const th=r()*Math.PI*2;
    if(Math.abs(Math.atan2(Math.sin(th+Math.PI/4),Math.cos(th+Math.PI/4)))<.44)continue;
    const rr=pondRadius(th)-.12+r()*.62,x=Math.cos(th)*rr,z=Math.sin(th)*rr;
    for(let k=0;k<3;k++)b.add('foliage',bankLeaf(.18+r()*.23,.065+r()*.045),[0x537341,0x64834c,0x476139][i%3],xf([x,.035,z],[-.2-r()*.35,r()*Math.PI*2,0]));
  }
  // lily pads with two pink flowers
  for (let i = 0; i < 7; i++) {
    const th = r() * Math.PI * 2;
    const rr = pondRadius(th) * (0.35 + r() * 0.45);
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const s = 0.22 + r() * 0.12;
    const pad = new THREE.CylinderGeometry(s, s, 0.02, 14, 1, false, 0.3, Math.PI * 2 - 0.6);
    b.add("foliage", pad, 0x547d40, xf([x, 0.05, z], [0, r() * 6, 0]));
    if (i < 2) blossom(b, x, .08, z, .11, 0xe5a6b9, i + 92);
  }
}

function buildPier(c: BuildCtx): void {
  const b = c.bag;
  const L0 = -0.4, L1 = 3.1, Wd = 1.2, H = PIER_HEIGHT;
  const n = 12;
  const plank = (L1 - L0) / n;
  for (let i = 0; i < n; i++) {
    const z = L0 + (i + 0.5) * plank;
    b.add("wood", box(Wd + (i % 3 === 0 ? 0.06 : 0), 0.05, plank - 0.03), [0xab845a, 0x9f7a52, 0xb48c60][i % 3], xf([0, H - 0.025, z], [0, (i % 2 ? 0.015 : -0.01), 0]), { jitter: 0.08, seed: i });
  }
  for (const s of [-1, 1]) b.add("wood", box(0.08, 0.12, L1 - L0), 0x7d5c3c, xf([s * (Wd / 2 - 0.08), H - 0.1, (L0 + L1) / 2]));
  for (const zz of [0.6, 1.8, 3.0]) {
    for (const s of [-1, 1]) {
      const tall = zz === 3.0;
      const h = tall ? 1.15 : 0.75;
      b.add("wood", cyl(0.07, 0.08, h, 8), 0x7d5c3c, xf([s * (Wd / 2), H + h / 2 - 0.55, zz]), { capColor: 0xc8a070, capAxis: "y" });
    }
  }
}

function buildTable(c: BuildCtx): void {
  const b = c.bag;
  b.add("wood", cyl(0.75, 0.75, 0.07, 28), 0xbb8653, xf([0, TABLE_TOP - 0.035, 0]), {
    colorFn: (p, n, out) => { if (n.y > 0.5 && Math.abs(((p.x + 10) % 0.25) - 0.125) > 0.115) out.multiplyScalar(0.75); },
  });
  b.add("wood", cyl(0.08, 0.1, TABLE_TOP - 0.07, 10), 0x9a6a3e, xf([0, (TABLE_TOP - 0.07) / 2, 0]));
  for (let i = 0; i < 2; i++) b.add("wood", box(1.0, 0.07, 0.1), 0x8e5f36, xf([0, 0.035, 0], [0, (i * Math.PI) / 2 + 0.4, 0]));
  // Child-sized helper: keep the adult table, raise Masha onto visible support.
  // Build in table-local coordinates; the shared station is world-space.
  const s=COOKING_STATION,x=s.position[0]-2,z0=s.topBack-1.5,z1=s.topFront-1.5;
  b.add('wood',new RoundedBoxGeometry(s.width,.065,z1-z0,2,.018),0xa47b50,xf([x,s.top-.0325,(z0+z1)/2]));
  const stepZ=(s.stepBack+s.topBack)/2-1.5;
  b.add('wood',new RoundedBoxGeometry(s.width,.06,s.topBack-s.stepBack+.04,2,.015),0xa47b50,xf([x,s.stepTop-.03,stepZ]));
  for(const side of [-1,1]){
    for(const z of [z0+.08,z1-.08])b.add('wood',box(.075,s.top-.065,.075),0x8b633f,xf([x+side*(s.width/2-.075),(s.top-.065)/2,z]));
    b.add('wood',box(.065,s.stepTop-.06,.075),0x8b633f,xf([x+side*(s.width/2-.075),(s.stepTop-.06)/2,s.stepBack-1.5+.09]));
    b.add('wood',box(.06,.07,s.topFront-s.stepBack-.12),0x8b633f,xf([x+side*(s.width/2-.075),.10,(s.stepBack+s.topFront)/2-1.5]));
  }
}

function buildSamovar(c: BuildCtx): void {
  const b = c.bag;
  const prof = [
    [0.0, 0.0], [0.09, 0.0], [0.07, 0.04], [0.06, 0.07], [0.12, 0.09], [0.16, 0.15], [0.17, 0.22], [0.16, 0.29],
    [0.12, 0.33], [0.1, 0.35], [0.1, 0.37], [0.06, 0.39], [0.04, 0.41], [0.0, 0.41],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const brass = 0xdca64a;
  b.add("metal", new THREE.LatheGeometry(prof, 20), brass, undefined, {
    colorFn: (p, _n, out) => { if (Math.abs(p.y - 0.22) < 0.012) out.setHex(0xa8742a); },
  });
  b.add("metal", cyl(0.035, 0.04, 0.06, 10), brass, xf([0, 0.44, 0]));
  for (const s of [-1, 1]) b.add("paint", new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), 0x2a2018, xf([s * 0.18, 0.28, 0], [0, 0, (s * Math.PI) / 2]));
  b.add("metal", cyl(0.012, 0.016, 0.1, 6), brass, xf([0, 0.12, 0.17], [Math.PI / 2.4, 0, 0]));
  b.add("paint", sph(0.02, 6, 5), 0x2a2018, xf([0, 0.16, 0.16]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("metal", sph(0.025, 6, 5), brass, xf([Math.cos(a) * 0.075, 0.015, Math.sin(a) * 0.075]));
  }
}

function buildBench(c: BuildCtx): void {
  const b = c.bag;
  b.add("wood", new RoundedBoxGeometry(1.7, 0.1, 0.38, 2, 0.03), 0xb07a46, xf([0, 0.42, 0]), { jitter: 0.05 });
  for (const s of [-1, 1]) b.add("bark", cyl(0.15, 0.17, 0.38, 10), 0x7a5232, xf([s * 0.6, 0.19, 0]), { capColor: 0xd8b07c, capAxis: "y" });
}

function buildWoodpile(c: BuildCtx): void {
  const b = c.bag;
  const r = rng(12);
  const rows = [6, 5, 4, 3];
  const lr = 0.13;
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * lr * 2.02;
      const y = lr + ri * lr * 1.75;
      b.add("bark", cyl(lr * (0.9 + r() * 0.15), lr, 0.95 + r() * 0.1, 9), 0x7d5434, xf([x, y, (r() - 0.5) * 0.08], [Math.PI / 2, 0, 0]), {
        capColor: 0xe5bd88, capAxis: "y", jitter: 0.1, seed: ri * 10 + i,
      });
    }
  });
  for (const s of [-1, 1]) b.add("wood", box(0.08, 1.0, 0.08), 0x6e4a2c, xf([s * 0.88, 0.5, 0]));
  // chopping stump (no axe)
  b.add("bark", cyl(0.3, 0.34, 0.45, 12), 0x6e4a2c, xf([-1.2, 0.225, 1.8]), { capColor: 0xdcb27c, capAxis: "y" });
  for (let i = 0; i < 6; i++) b.add("wood", box(0.12, 0.03, 0.05), 0xd9b27e, xf([-1.2 + (r() - 0.5) * 1.2, 0.015, 1.8 + (r() - 0.5) * 1.0], [0, r() * 3, 0]));
}

function buildBigPine(c: BuildCtx): void {
  const tree = new THREE.Group(); tree.name = "set:big_pine:authored"; c.dyn.push(tree);
  queueNature(c, tree, "Pine_2", [{ x: 0, z: 0, height: 10.5, yaw: 2.6 }], true);
}

function buildBush(c: BuildCtx): void {
  const b = c.bag;
  const shrub = new THREE.Group(); shrub.name = "set:bush:authored"; c.dyn.push(shrub);
  queueNature(c, shrub, "Bush_Common", [{ x: 0, z: 0, height: 1.6, yaw: .8 }]);
  const r = rng(61);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, e = r() * 1.0 + 0.1;
    const rr = 0.86;
    b.add("paint", sph(0.05, 6, 5), 0xd8283a, xf([Math.cos(a) * Math.cos(e) * rr, 0.75 + Math.sin(e) * rr * 0.8, Math.sin(a) * Math.cos(e) * rr]));
  }
}

function buildCreek(c: BuildCtx): void {
  const b = c.bag;
  const curve = creekCurve();
  const N = 220;
  const pts = curve.getSpacedPoints(N);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const edge = new THREE.Color(0x8daf9e), mid = new THREE.Color(0x477f77);
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const tan = curve.getTangentAt(i / N);
    const nx = -tan.z, nz = tan.x;
    const t = i / N;
    const w = (1.0 + 0.25 * Math.sin(t * 23) + 0.15 * Math.sin(t * 57)) * (t > 0.92 ? 1 + (t - 0.92) * 6 : 1);
    for (const [s, cc] of [[-1, edge], [-0.35, mid], [0.35, mid], [1, edge]] as [number, THREE.Color][]) {
      pos.push(p.x + nx * s * w * 0.6, 0.035, p.z + nz * s * w * 0.6);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) {
    const a = i * 4 + j, bb = (i + 1) * 4 + j;
    idx.push(a, a + 1, bb, a + 1, bb + 1, bb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const nrm = new Float32Array((N + 1) * 4 * 3);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  b.addPainted("water", g);
  // bank stones
  const r = rng(33);
  for (let i = 0; i < 34; i++) {
    const t = r();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const s = r() < 0.5 ? -1 : 1;
    const off = 0.7 + r() * 0.3;
    const x = p.x - tan.z * s * off, z = p.z + tan.x * s * off;
    if (Math.hypot(x - 12, z - 9) < 1.6 || Math.hypot(x, z - 17.9) < 1.6) continue;
    const sz = 0.1 + r() * 0.18;
    b.add("stone", blob(sz, 300 + i, 0.2, 1), 0xa09d92, xf([x, sz * 0.25, z], [r(), r() * 6, r()], [1, 0.55, 1]), { jitter: 0.15, seed: i });
  }
}

function buildBridge(c: BuildCtx, long: number): void {
  const b = c.bag;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = -1.35 + (i + 0.5) * (2.7 / n);
    const y = bridgeDeckY(x);
    const slope = -0.2 * (Math.PI / 2.8) * Math.sin((Math.PI * x) / 2.8);
    b.add("wood", box(2.7 / n - 0.03, 0.06, long), [0xa8794b, 0x9c6f45, 0xb38352][i % 3], xf([x, y - 0.03, 0], [0, 0, Math.atan(slope)]), { jitter: 0.08, seed: i });
  }
  for (const s of [-1, 1]) {
    const zz = s * (long / 2 - 0.04);
    for (const x of [-1.25, 0, 1.25]) {
      const y = bridgeDeckY(x);
      b.add("wood", cyl(0.045, 0.05, 0.75, 6), 0x7d5434, xf([x, y + 0.3, zz]));
    }
    for (const [x0, x1] of [[-1.25, 0], [0, 1.25]]) {
      const { g, m } = beam(V(x0, bridgeDeckY(x0) + 0.65, zz), V(x1, bridgeDeckY(x1) + 0.65, zz), 0.035, 0.035, 6);
      b.add("wood", g, 0x9a6a3e, m);
    }
  }
}

function buildVan(c: BuildCtx): void {
  const b=c.bag;
  const cream=0xc9cec3,trim=0xb0b7ac,rubber=0x333a35,red=0xb25f47,glass=0x697871;
  // Chipped enamel is a surface treatment, not brown geometry stuck to the body.
  // The episode has fine grey cracks, peeled edges and dirt runs, with very little orange rust.
  const shell=new RoundedBoxGeometry(2.06,1.72,4.22,5,.19);
  let bodyMaterial:THREE.MeshStandardMaterial|undefined;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d');
    if(ctx){
      const random=rng(452);ctx.fillStyle='#cdd1c7';ctx.fillRect(0,0,1024,512);
      for(let i=0;i<750;i++){
        const x=random()*1024,y=random()*512,w=4+random()*50,h=2+random()*15;
        ctx.fillStyle=`rgba(82,94,82,${.008+random()*.045})`;ctx.fillRect(x,y,w,h);
      }
      for(let i=0;i<2400;i++){
        const x=random()*1024,y=random()*512,edge=Math.min(y,512-y);
        if(edge>35&&random()>.3)continue;
        const w=.4+random()*(edge<35?8:3),h=.5+random()*(edge<35?12:7);
        ctx.fillStyle=i%5===0?'#8d8e77':i%3?'#68756c':'#a3a99e';
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h*.2);ctx.lineTo(x+w*.6,y+h);ctx.lineTo(x-w*.3,y+h*.55);ctx.closePath();ctx.fill();
        if(i%11===0){ctx.strokeStyle='rgba(75,85,76,.16)';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+1,y+h+random()*24);ctx.stroke();}
      }
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
      bodyMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.86,color:0xffffff});
      bodyMaterial.userData.setOwned=true;
      c.extra.disposables.push(texture,bodyMaterial);
    }
  }
  // The old loaf-shaped ambulance has a rounded cab/nose and a shallower roof, not a modern bus box.
  if(bodyMaterial){const body=new THREE.Mesh(shell,bodyMaterial);body.name='set:van:weathered-enamel';body.position.y=1.35;body.castShadow=true;body.receiveShadow=true;c.dyn.push(body);}
  else b.add("paint",shell,cream,xf([0,1.35,0]),{aoBottom:.25,jitter:.025});
  b.add("paint",new RoundedBoxGeometry(2.075,.075,4.23,4,.035),0xb8bfb2,xf([0,2.225,-.015]));
  b.add("paint",new RoundedBoxGeometry(1.94,.73,.39,4,.15),0xd0ceba,xf([0,1.0,2.03]),{aoBottom:.15});
  // Flush painted belt. A thick rounded box reads as a red bumper tube, unlike the reference.
  for(const side of [-1,1])b.add('paint',box(.006,.19,3.99),red,xf([side*1.035,1.34,-.02]),{jitter:.08});
  for(const z of [-2.116,2.181])b.add('paint',box(1.89,.19,.008),red,xf([0,1.34,z]),{jitter:.09});
  // Rubber seals, painted frames and slightly raked twin windscreens.
  for(const side of [-1,1]){
    const x=side*.457;
    b.add("paint",new RoundedBoxGeometry(.87,.64,.035,3,.075),rubber,xf([x,1.79,2.16],[-.15,0,0]));
    b.add("paint",new RoundedBoxGeometry(.78,.55,.028,3,.065),glass,xf([x,1.79,2.185],[-.15,0,0]));
    // A subdued reflection and a real wiper, both below the rounded glass edge.
    b.add("paint",box(.57,.025,.008),0xa1b1aa,xf([x,1.97,2.160],[-.15,0,0]));
    const wiper=beam(V(x-.23,1.55,2.24),V(x+.16,1.69,2.22),.011,.011,5);b.add("metal",wiper.g,rubber,wiper.m);
    for(const [zz,len]of [[1.29,.68],[-.2,.89],[-1.35,.62]]){
      b.add("paint",new RoundedBoxGeometry(.024,.63,len+.08,3,.035),rubber,xf([side*1.035,1.79,zz]));
      b.add("paint",new RoundedBoxGeometry(.015,.575,len+.025,3,.025),glass,xf([side*1.052,1.79,zz]));
      b.add("paint",box(.004,.22,len*.32),0x8a948d,xf([side*1.063,1.88,zz-len*.2]));
    }
    // Individual cab door and rear compartment seams, recessed lower panels and handles.
    for(const zz of [.72,-.84,-1.94])b.add("paint",box(.013,1.37,.015),0x7d897b,xf([side*1.044,1.24,zz]));
    // Thin panel creases leave the weathered enamel visible instead of covering it with clean slabs.
    for(const y of [.61,1.11])b.add('paint',box(.008,.009,.86),0xa0aa9d,xf([side*1.042,y,1.22]));
    for(const zz of [.85,-.76])b.add("metal",new RoundedBoxGeometry(.035,.045,.19,2,.02),rubber,xf([side*1.07,1.36,zz]));
    // Thin metal side mirror on a visible stalk.
    const arm=beam(V(side*1.02,1.55,1.65),V(side*1.23,1.72,1.82),.018,.018,6);b.add("metal",arm.g,0x686f65,arm.m);
    b.add("metal",new RoundedBoxGeometry(.12,.22,.035,2,.025),rubber,xf([side*1.23,1.77,1.84],[0,side*.2,0]));
    // Pneumatic tyres, pressed steel hubs, bolt circles and painted wheel-arch lips.
    for(const zz of [1.36,-1.39]){
      b.add("paint",cyl(.375,.375,.19,24),0x262e27,xf([side*1.0,.28,zz],[0,0,Math.PI/2]));
      b.add("metal",cyl(.20,.20,.205,20),0x737b6e,xf([side*1.0,.28,zz],[0,0,Math.PI/2]));
      b.add("metal",cyl(.08,.08,.22,14),0x929a8b,xf([side*1.0,.28,zz],[0,0,Math.PI/2]));
      for(let k=0;k<5;k++){const a=k/5*Math.PI*2;b.add("metal",sph(.018,6,4),0x48524a,xf([side*1.112,.28+Math.sin(a)*.14,zz+Math.cos(a)*.14]));}
      b.add("paint",new THREE.TorusGeometry(.385,.024,7,24,Math.PI),trim,xf([side*1.06,.28,zz],[0,Math.PI/2,0]));
    }
    // Circular headlights in deep, slightly tarnished bezels and amber indicators.
    b.add("paint",cyl(.17,.17,.045,20),rubber,xf([side*.65,.96,2.223],[Math.PI/2,0,0]));
    b.add("metal",new THREE.TorusGeometry(.14,.025,8,24),0xbac0ad,xf([side*.65,.96,2.251]));
    b.add("paint",cyl(.12,.12,.028,20),0xe3ddae,xf([side*.65,.96,2.265],[Math.PI/2,0,0]));
    b.add("paint",new RoundedBoxGeometry(.19,.075,.035,2,.025),0xd9a14e,xf([side*.67,1.14,2.22]));
  }
  // Recessed grille, proud bumper and plate create depth on the compact rounded face.
  b.add("paint",new RoundedBoxGeometry(.64,.27,.035,2,.045),rubber,xf([0,.96,2.228]));
  for(let i=0;i<4;i++)b.add("metal",box(.53,.018,.02),0x9b9e8e,xf([0,.87+i*.055,2.255]));
  b.add("metal",new RoundedBoxGeometry(2.1,.14,.19,3,.045),0x687165,xf([0,.55,2.24]));
  b.add("metal",new RoundedBoxGeometry(2.07,.13,.16,3,.04),0x687165,xf([0,.55,-2.16]));
  b.add("paint",new RoundedBoxGeometry(.46,.13,.025,2,.015),0xc9c9ac,xf([0,.65,2.35]));
  // Rear split doors and two short windows, matching the compact utility body.
  b.add("paint",box(.025,1.59,.018),0x59675b,xf([0,1.31,-2.126]));
  for(const side of [-1,1]){
    for(const x of [side*.07,side*.91])b.add('paint',box(.025,1.58,.022),0x677266,xf([x,1.31,-2.13]));
    for(const y of [.535,2.085])b.add('paint',box(.85,.025,.022),0x677266,xf([side*.49,y,-2.13]));
    b.add("paint",new RoundedBoxGeometry(.70,.56,.025,3,.035),rubber,xf([side*.47,1.78,-2.132]));
    b.add("paint",new RoundedBoxGeometry(.64,.50,.02,3,.028),glass,xf([side*.47,1.79,-2.151]));
    b.add('paint',box(.20,.20,.008),0x939e91,xf([side*.63,1.88,-2.166]));
    b.add("paint",box(.08,.15,.035),red,xf([side*.88,.79,-2.12]));
    b.add("metal",box(.06,.14,.035),rubber,xf([side*.08,1.19,-2.14]));
    for(const y of [.8,1.7])b.add('metal',box(.11,.075,.04),0x7b8476,xf([side*.92,y,-2.15]));
  }
  // No invented blue roof beacon: none is visible on the abandoned vehicle in the matched episode frame.
  // Restrained weathering around wheel arches and the lower sill, not raised decorative spots.
  const r=rng(188);
  for(let i=0;i<140;i++){
    const side=i%2?1:-1,zz=-1.8+r()*3.6,y=.56+r()*.31;
    b.add("paint",box(.002,.008+r()*.048,.005+r()*.025),i%3?0x69766a:0x8c8c72,xf([side*1.043,y,zz],[r()*.5,0,0]));
  }
  // Emergency number seen on the source vehicle. Unbranded, with a faded red ink treatment.
  if(typeof document!=="undefined"){
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext("2d");
    if(ctx){
      ctx.fillStyle="#d4c6ad";ctx.font="bold condensed 64px sans-serif";ctx.textAlign="center";ctx.fillText("МЕДИЦИНСКАЯ ПОМОЩЬ",512,84);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:1,side:THREE.DoubleSide});
      for(const side of [-1,1]){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.7,.15),material);mesh.position.set(side*1.047,1.34,-.4);mesh.rotation.y=side*Math.PI/2;c.dyn.push(mesh);c.extra.disposables.push(mesh.geometry);}
      c.extra.disposables.push(texture,material);
      const back=document.createElement('canvas');back.width=128;back.height=64;const backCtx=back.getContext('2d')!;
      backCtx.fillStyle='#a35b43';backCtx.font='bold 50px sans-serif';backCtx.textAlign='center';backCtx.fillText('03',64,54);
      const backTexture=new THREE.CanvasTexture(back);backTexture.colorSpace=THREE.SRGBColorSpace;
      const backMat=new THREE.MeshStandardMaterial({map:backTexture,transparent:true,depthWrite:false,roughness:1});
      const number=new THREE.Mesh(new THREE.PlaneGeometry(.49,.25),backMat);number.position.set(.48,1.28,-2.164);number.rotation.y=Math.PI;c.dyn.push(number);
      c.extra.disposables.push(number.geometry,backTexture,backMat);
    }
  }
}

function buildFence(c: BuildCtx): void {
  const col = 0xece2cf;
  addPickets(c.bag, 2.4, 12.4, 6.6, 13.5, 0.85, 0.2, col, 0.08, 3, 0.12);
  addPickets(c.bag, -2.4, 12.4, -4.1, 13.2, 0.85, 0.2, col, 0.08, 4, 0.15);
  addPickets(c.bag, -14.6, -2.2, -14.6, 0.6, 0.85, 0.2, col, 0.08, 5, 0.1);
}

function buildFlowers(c: BuildCtx): void {
  const b = c.bag;
  const r = rng(21);
  const heads = [0xfff8df, 0xe8c455, 0xd78362, 0xffffff, 0xf3d064, 0xfff8df, 0xffffff];
  const clusters: [number, number, number, number][] = [
    [-9.9, -3.4, 1.0, 34], [-2.3, -3.2, 0.9, 28], [2.6, -4.6, 0.6, 18], [3.4, 3.9, 0.7, 8], [7.4, 6.6, 0.7, 8],
    [-3.9, 12.2, 1.2, 32], [2.1, 11.2, 0.8, 24], [-2.1, 11.6, 0.8, 25], [-12.6, 3.6, 0.8, 8], [9.6, 0.6, 0.7, 7],
    [-13.6, -2.8, 0.7, 7], [12.4, -6.2, 0.7, 7], [6.4, 10.4, 0.8, 8], [-9.2, -0.9, 0.5, 6], [8.8, -3.4, 0.6, 7],
  ];
  const plant = (x: number, z: number, k: number) => {
    const h = 0.22 + r() * 0.29;
    const lean: [number, number, number] = [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3];
    b.add("foliage", new THREE.CylinderGeometry(0.008, 0.01, h, 3, 1, true), 0x4f8f3a, xf([x, h / 2, z], lean));
    const hc = heads[k % heads.length];
    const hx = x - lean[2] * h * 0.5, hz = z + lean[0] * h * 0.5;
    for (const side of [-1, 1]) b.add("foliage", leaf(h * .36, h * .075, .18), 0x66884c,
      xf([x, h * .48, z], [-.2, k + side * 1.2, side * .7]));
    blossom(b, hx, h, hz, .052 + r() * .02, hc, k * 7);
  };
  for (const [cx, cz, rad, n] of clusters) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      plant(cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.floor(r() * 7));
    }
  }
  for (let i = 0; i < 24; i++) {
    const x = (r() - 0.5) * 34, z = (r() - 0.5) * 30 + 1;
    if (!openGround(x, z, 0.8) || (x > -8 && x < 1 && z > -2.4 && z < 3)) continue;
    plant(x, z, Math.floor(r() * 7));
  }
}

function addFern(b: GeoBag, x: number, z: number, scale: number, seed: number): void {
  const r = rng(seed);
  for (let frond = 0; frond < 5; frond++) {
    const a = frond * 2.39996 + seed;
    const len = scale * (.6 + r() * .3);
    for (let k = 1; k <= 6; k++) {
      const t = k / 7, bend = Math.sin(t * Math.PI * .85);
      const px = x + Math.cos(a) * len * t, pz = z + Math.sin(a) * len * t;
      const y = scale * .6 * bend;
      for (const side of [-1, 1]) {
        const size = scale * .24 * Math.sin(t * Math.PI);
        b.add("foliage", leaf(size, size * .18, .2), frond % 2 ? 0x6b8c4a : 0x547a43,
          xf([px, y, pz], [-.1, -a + Math.PI / 2 + side * 1.04, side * .2]));
      }
    }
  }
}

function buildRocks(c: BuildCtx): void {
  const b = c.bag;
  const r = rng(44);
  const spots: [number, number, number][] = [
    [1.6, 8.4, 0.35], [-1.6, 13.8, 0.3], [9.2, 4.4, 0.28], [-13.8, -8.6, 0.6], [15.8, 5.6, 0.7], [-15.2, 8.6, 0.8],
    [4.6, -11.6, 0.55], [13.2, -12.6, 0.6], [-6.2, 14.6, 0.4], [7.4, 13.4, 0.35], [-10.8, 6.4, 0.3], [16.4, -7.2, 0.5],
  ];
  spots.forEach(([x, z, s], i) => {
    if (i % 2 === 0) addFern(b, x + s, z - s * .5, .55 + s * .35, 600 + i);
    b.add("stone", blob(s, 500 + i, 0.2, 1), 0x9a978d, xf([x, s * 0.3, z], [r(), r() * 6, r()], [1.2, 0.65, 1]), { jitter: .07, aoBottom: .3, seed: i,
      colorFn: (p, n, out) => { if (n.y > .3 && p.y > .05) out.lerp(new THREE.Color(0x718359), .35); } });
    if (i % 3 === 0) b.add("stone", blob(s * 0.45, 600 + i, 0.2, 1), 0xa7a398, xf([x + s * 0.9, s * 0.12, z + s * 0.4], [r(), r(), r()], [1, 0.6, 1]));
  });
}

/** True where the yard ground is free for scatter (grass, flowers). */
function openGround(x: number, z: number, pad = 0): boolean {
  if (x > -9.6 - pad && x < -2.4 + pad && z > -9.0 - pad && z < -1.2 + pad) return false; // house + porch
  if (x > 2.6 - pad && x < 8.2 + pad && z > -9.2 - pad && z < -4.9 + pad) return false; // garden
  if (insidePond(x, z, 0.35 + pad)) return false;
  if (creekDistance(x, z) < 0.85 + pad) return false;
  if (x > 12.7 - pad && x < 15.5 + pad && z > -3.4 - pad && z < 1.4 + pad) return false; // van
  if (Math.abs(x - pathX(z)) < 1.3 + pad && z > 9.5) return false; // path
  if (Math.hypot(x - 2, z - 1.5) < 0.85 + pad) return false;
  if (Math.hypot(x + 12.2, z + 6.4) < 1.2 + pad) return false;
  return true;
}

function buildForest(c: BuildCtx): void {
  const r = rng(6073);
  const group = new THREE.Group(); group.name = "set:forest:authored"; c.dyn.push(group);
  const kinds: NatureId[] = ["Pine_1", "Pine_2", "Pine_3", "Pine_5", "BirchTree_1", "BirchTree_3", "CommonTree_1", "CommonTree_2", "CommonTree_4"];
  const spots: Partial<Record<NatureId, NatureSpot[]>> = Object.fromEntries(kinds.map((id) => [id, [] as NatureSpot[]]));
  const accepted: { x: number; z: number }[] = [];
  for (let i = 0; i < 5200 && accepted.length < 350; i++) {
    const a = r() * Math.PI * 2, rad = 17 + Math.sqrt(r()) * 47;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if ((x / 18.3) ** 2 + ((z - 1) / 16) ** 2 < 1) continue;
    if (z > 8 && z < 37 && Math.abs(x) < 25 + (z - 8) * .22) continue;
    if (creekDistance(x, z) < 2.2 || Math.hypot(x - 14, z + 1) < 4) continue;
    const spacing = rad < 31 ? 2.5 : 3.8;
    if (accepted.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
    // Pockets of trees, with occasional gaps showing the deeper canopy.
    const pocket = Math.sin(x * .21 + z * .09) * Math.cos(z * .14 - .6);
    if (pocket < -.55 && r() < .75) continue;
    const pick = r();
    const id = rad > 37 ? (pick < .7 ? "Pine_5" : "CommonTree_4") : kinds[Math.floor(r() * kinds.length)];
    const height = 6.5 + r() * 4.5 + (rad > 37 ? 1.5 : 0);
    spots[id]!.push({ x, z, y: groundY(x, z), height, yaw: r() * Math.PI * 2, tint: .82 + r() * .24 });
    accepted.push({ x, z });
  }
  for (const id of kinds) queueNature(c, group, id, spots[id] ?? []);
  // A lower, irregular edge roots the trees in the meadow instead of revealing a wall of naked trunks.
  const shrubs: NatureSpot[] = [], ferns: NatureSpot[] = [];
  for (let i = 0; i < 105; i++) {
    const a = Math.PI + r() * Math.PI, rad = 15.5 + r() * 9;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (!openGround(x, z, .4)) continue;
    shrubs.push({ x, z, height: .65 + r() * 1.25, yaw: r() * 6, tint: .8 + r() * .25 });
    if (i % 3 === 0) ferns.push({ x: x + 1, z: z + 1.2, height: .5 + r() * .45, yaw: r() * 6 });
  }
  // Dense shrub islands screen the rear tree trunks, while preserving every named acting mark.
  for(const [x,z,h] of [[-13,-9,1.8],[-11.8,-10.7,1.4],[-10.6,-11.8,1.7],[-.5,-13.2,1.6],[2.5,-11.5,1.7],[4,-11.8,1.4],[6.2,-11.4,1.5],[8.1,-12.2,1.8],[11,-12.3,1.5],[13.3,-10.6,1.7],[14.8,-7.8,1.5]] as const)
    shrubs.push({x,z,height:h,yaw:r()*6,tint:1});
  queueNature(c, group, "Bush_Common", shrubs);
  queueNature(c, group, "Fern_1", ferns);
  addForestSilhouettes(c.bag);
}

/**
 * Distant forest silhouettes: three rings of tree-top profiles (72–118 m) behind the instanced forest, darker and
 * bluer with distance; the scene fog fades them into the sky (aerial perspective). Merged into the static foliage
 * mesh, so they cost no draw call.
 */
function addForestSilhouettes(bag: GeoBag): void {
  const layers: [number, number, number, number][] = [
    // radius, crown base height, colour, seed
    [70, 6.5, 0x254d2e, 1],
    [90, 8.5, 0x2c5440, 2],
    [116, 10.5, 0x355a50, 3],
  ];
  for (const [R, base, color, seed] of layers) {
    const r = rng(900 + seed);
    const pos: number[] = [], nor: number[] = [], cols: number[] = [], idx: number[] = [];
    const c0 = new THREE.Color(color);
    const top: [number, number][] = []; // (angle, height)
    let a = 0;
    while (a < Math.PI * 2) {
      const w = (1.6 + r() * 1.8) / R; // crown width (rad)
      const hb = base + (r() - 0.5) * 2 + Math.sin(a * 3 + seed) * 2 + Math.sin(a * 7.3 - seed) * 1;
      const tip = hb + 2.5 + r() * 3.5;
      top.push([a, hb], [a + w * 0.5, tip]);
      a += w;
    }
    top.push([Math.PI * 2, top[0][1]]);
    for (const [ang, ht] of top) {
      const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
      const gy = groundY(x, z);
      const nx = -Math.cos(ang), nz = -Math.sin(ang);
      const l = Math.hypot(nx, 0.7, nz);
      for (const y of [gy - 8, gy + ht]) {
        pos.push(x, y, z);
        nor.push(nx / l, 0.7 / l, nz / l);
        const k = y > gy ? 1 : 0.7;
        cols.push(c0.r * k, c0.g * k, c0.b * k);
      }
    }
    for (let i = 0; i < top.length - 1; i++) {
      const v = i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    bag.addPainted("foliage", g);
  }
}

/** Ground elevation: flat in the yard, gentle rolling hills beyond ~26 m. */
export function groundY(x: number, z: number): number {
  const d = Math.hypot(x, z * 1.1);
  if (d < 24) return 0;
  const k = Math.min(1, (d - 24) / 18);
  return k * k * (1.4 + Math.sin(x * 0.11) * 0.9 + Math.cos(z * 0.13 + 1) * 0.8);
}

function buildGround(c: BuildCtx): void {
  const size = 300, seg = 60;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const T = 64; // textured area (m)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    uv.setXY(i, (x + T / 2) / T, 1 - (z + T / 2) / T);
  }
  g.computeVertexNormals();
  paint(g, 0xffffff); // white vertex colours: same shader program as the vertex-coloured, textured set materials
  const tex = groundTexture(T);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, ...(tex ? { map: tex } : {}) });
  if (!tex) mat.color.setHex(0x7c9b5e);
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    c.extra.groundUniforms = installGroundDetail(mat, T);
  }
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "set:ground:mesh";
  mesh.receiveShadow = true;
  c.dyn.push(mesh);
  c.extra.groundTex = tex;
  c.extra.disposables.push(g, mat);
  if (tex) c.extra.disposables.push(tex);
}

export interface GroundDetailUniforms {
  uGrass: { value: THREE.Texture };
  uDirt: { value: THREE.Texture };
  uGrassN: { value: THREE.Texture };
  uDirtN: { value: THREE.Texture };
  uDetailScale: { value: number };
  uDetailAmt: { value: number };
  uNormalAmt: { value: number };
}

/** linear value of the detail maps' neutral mean (they multiply the painted layout without shifting its palette) */
const DETAIL_MEAN_LIN = Math.pow((DETAIL_MEAN_SRGB + 0.055) / 1.055, 2.4);

function solidTex(r: number, g: number, b: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Ground detail (A5): the painted 64 m layout texture stays the macro colour (paths, worn clearing, shore); tiled CC0
 * grass and dirt detail + normal maps are blended on top by a mask derived from the layout colour (brown = dirt).
 * Neutral 1×1 placeholders until the textures load (identical to the pre-A5 look), so the program never recompiles.
 */
function installGroundDetail(mat: THREE.MeshStandardMaterial, T: number): GroundDetailUniforms {
  const u: GroundDetailUniforms = {
    uGrass: { value: solidTex(217, 217, 217, true) },
    uDirt: { value: solidTex(217, 217, 217, true) },
    uGrassN: { value: solidTex(128, 128, 255, false) },
    uDirtN: { value: solidTex(128, 128, 255, false) },
    uDetailScale: { value: T / 2.4 }, // one grass tile per 2.4 m
    uDetailAmt: { value: 0 },
    uNormalAmt: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uGrassN; uniform sampler2D uDirtN;
uniform float uDetailScale; uniform float uDetailAmt; uniform float uNormalAmt;
float gDirt = 0.0;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  vec2 duv = vMapUv * uDetailScale;
  vec3 mc = sampledDiffuseColor.rgb;
  gDirt = smoothstep(0.0, 0.05, mc.r - mc.g * 0.9);
  // two scales of grass break up visible tiling
  vec3 gr = mix(texture2D(uGrass, duv).rgb, texture2D(uGrass, duv * 0.29 + vec2(0.37, 0.71)).rgb, 0.4);
  vec3 dt = texture2D(uDirt, duv * 1.3).rgb;
  vec3 det = mix(gr, dt, gDirt) / ${DETAIL_MEAN_LIN.toFixed(4)};
  diffuseColor.rgb *= mix(vec3(1.0), det, uDetailAmt);
}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  vec2 duv = vMapUv * uDetailScale;
  vec3 tg = texture2D(uGrassN, duv).xyz * 2.0 - 1.0;
  vec3 td = texture2D(uDirtN, duv * 1.3).xyz * 2.0 - 1.0;
  vec3 tn = normalize(mix(tg, td, gDirt));
  // tangent ≈ +x, bitangent ≈ -z on the (nearly flat) ground; perturb the geometric normal by the detail delta
  vec3 wn = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(tn.x, tn.z, -tn.y), uNormalAmt));
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  normal = normalize(normal + (viewMatrix * vec4(wn, 0.0)).xyz - up);
}`,
      );
  };
  mat.customProgramCacheKey = () => "set:ground:detail:v1";
  return u;
}

function groundTexture(T: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  // Paint the low-frequency layers on a small canvas (cheap), upscale smoothly (free blur), then add fine grain.
  const L = 512, S = 1024;
  const lo = document.createElement("canvas");
  lo.width = lo.height = L;
  // CPU-backed canvas: no GPU readback, no canvas filters (both are very slow under SwiftShader)
  const ctx = lo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const px = L / T;
  const X = (x: number) => (x + T / 2) * px;
  const Z = (z: number) => (z + T / 2) * px;
  const r = rng(9);
  ctx.fillStyle = "#7d9f50";
  ctx.fillRect(0, 0, L, L);
  const greens = ["#68934c", "#91ae61", "#618447", "#86a853", "#a3b96a", "#7b9f4e"];
  for (let i = 0; i < 520; i++) {
    ctx.fillStyle = greens[i % greens.length];
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(r() * L, r() * L, (0.6 + r() * 3) * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // forest-floor fade toward the border (matches the clamped edge)
  const grd = ctx.createRadialGradient(L / 2, L / 2, 21 * px, L / 2, L / 2, 31 * px);
  grd.addColorStop(0, "rgba(84,128,48,0)");
  grd.addColorStop(1, "rgba(84,128,48,1)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, L, L);
  // sun-dried worn clearing
  ctx.fillStyle = "rgba(169,177,91,0.19)";
  ctx.beginPath();
  ctx.ellipse(X(-1.5), Z(-0.5), 5.5 * px, 3.8 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  // under the house and porch, the woodpile, the garden
  ctx.fillStyle = "rgba(82,100,50,0.85)";
  ctx.beginPath(); ctx.ellipse(X(-6.5),Z(-6.0),4.2*px,3.3*px,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(170,146,100,0.7)";
  ctx.beginPath();
  ctx.ellipse(X(-12.6), Z(-5.6), 1.9 * px, 1.6 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(130,104,66,0.55)";
  ctx.fillRect(X(2.7), Z(-9.1), 5.4 * px, 4.2 * px);
  // dirt path from the south into the yard, and worn trails
  const strokePath = (pts: Vec2[], w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * px;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.stroke();
  };
  const path: Vec2[] = [];
  for (let z = 33; z >= 9; z -= 1) path.push([pathX(z), z]);
  path.push([0.2, 6], [-0.6, 3], [-2.6, 0.2], [-4.6, -1.2], [-6, -3.95]);
  strokePath(path, 2.15, "rgba(181,158,101,0.95)");
  strokePath(path, 1.55, "rgba(218,195,139,0.95)");
  strokePath(path.slice(0, 26), 1.28, "rgba(230,208,157,0.8)");
  strokePath([[-2.6,.2],[0,-1.5],[3,-3.8],[5,-4.8],[8,-5.4],[10,-7.9]], 1.0, "rgba(207,182,126,0.72)");
  strokePath([[-12.2, -5.0], [-10.5, -2.4], [-7.4, -1.6]], 0.9, "rgba(168,150,92,0.4)");
  // soften (separable box blur, radius 2) and upsample bilinearly with fine grain into a DataTexture
  const src = ctx.getImageData(0, 0, L, L).data;
  const tmp = new Float32Array(L * L * 3);
  const sm = new Float32Array(L * L * 3);
  const R = 2;
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const xx = Math.min(L - 1, Math.max(0, x + k));
      const i = (y * L + xx) * 4;
      r0 += src[i]; g0 += src[i + 1]; b0 += src[i + 2]; n++;
    }
    const o = (y * L + x) * 3;
    tmp[o] = r0 / n; tmp[o + 1] = g0 / n; tmp[o + 2] = b0 / n;
  }
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const yy = Math.min(L - 1, Math.max(0, y + k));
      const i = (yy * L + x) * 3;
      r0 += tmp[i]; g0 += tmp[i + 1]; b0 += tmp[i + 2]; n++;
    }
    const o = (y * L + x) * 3;
    sm[o] = r0 / n; sm[o + 1] = g0 / n; sm[o + 2] = b0 / n;
  }
  const out = new Uint8Array(S * S * 4);
  const f = L / S;
  for (let y = 0; y < S; y++) {
    const sy = Math.min(L - 1.001, y * f);
    const y0 = Math.floor(sy), ty = sy - y0;
    for (let x = 0; x < S; x++) {
      const sx = Math.min(L - 1.001, x * f);
      const x0 = Math.floor(sx), tx = sx - x0;
      const i00 = (y0 * L + x0) * 3, i10 = i00 + 3, i01 = i00 + L * 3, i11 = i01 + 3;
      const nz = 1 + (r() - 0.5) * 0.2;
      // DataTexture rows go bottom-up (flipY is not applied): row y=0 is v=0 (south edge, z=+T/2)
      const o = ((S - 1 - y) * S + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sm[i00 + c] * (1 - tx) + sm[i10 + c] * tx;
        const bot = sm[i01 + c] * (1 - tx) + sm[i11 + c] * tx;
        out[o + c] = Math.min(255, (top * (1 - ty) + bot * ty) * nz);
      }
      out[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function buildGrass(c: BuildCtx): void {
  // tuft prototype: 6 soft, slightly curved blades (2 segments each) fanning out, dark base -> sunlit tip
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color(0x67844d), mid = new THREE.Color(0x92aa6c), tip = new THREE.Color(0xb5c28a);
  let v = 0;
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + (b % 2) * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const w = 0.035 + 0.012 * (b % 2);
    const hgt = 0.6 + 0.4 * ((b * 37) % 7) / 7;
    const lean = 0.3 + 0.18 * (b % 3);
    const px = -dz, pz = dx; // blade width direction
    const o = 0.05;
    // base pair, mid pair (bent outward), tip
    pos.push(dx * o + px * w, 0, dz * o + pz * w, dx * o - px * w, 0, dz * o - pz * w);
    pos.push(dx * lean * 0.45 + px * w * 0.7, hgt * 0.55, dz * lean * 0.45 + pz * w * 0.7, dx * lean * 0.45 - px * w * 0.7, hgt * 0.55, dz * lean * 0.45 - pz * w * 0.7);
    pos.push(dx * lean, hgt, dz * lean);
    for (const cc of [base, base, mid, mid, tip]) col.push(cc.r, cc.g, cc.b);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2, v + 2, v + 3, v + 4);
    v += 5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // normals pointing up so tufts light like the ground (soft, no harsh backfaces)
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  mat.name = "set:grass";
  // wind sway in the vertex shader (deterministic in frame time t; tips move most, neighbours move together)
  const wind = { uTime: { value: 0 }, uWind: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wind);
    // two-sided blades keep the UP normal on both faces (no back-face flip → no dark blades)
    sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);");
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  #else
  vec2 ip = vec2(0.0);
  #endif
  float hh = max(position.y, 0.0);
  float ph = uTime * 1.6 + ip.x * 0.31 + ip.y * 0.23;
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ip.x * 0.05 - ip.y * 0.04);
  float sw = (sin(ph) * 0.7 + sin(ph * 2.7 + ip.y) * 0.3) * gust * uWind;
  transformed.x += sw * hh * hh * 0.32;
  transformed.z += sw * hh * hh * 0.12;
}`,
      );
  };
  mat.customProgramCacheKey = () => "set:grass:wind:v1";
  const r = rng(808);
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 40000 && mats.length < 8500; i++) {
    const x = (r() - 0.5) * 48, z = (r() - 0.5) * 46 + 3;
    const s = 0.09 + r() * 0.18;
    const rot = r() * Math.PI * 2;
    if (!openGround(x, z, 0.1)) continue;
    // clumpy: denser along edges, fences, house, trees; sparse in the worn clearing and on the path
    const worn = ((x + 1.5) / 6) ** 2 + ((z + 0.5) / 4.2) ** 2 < 1;
    const clump = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.cos(z * 0.7) * 2) * Math.cos(z * 1.1 - x * 0.3);
    if (r() > (worn ? 0.12 : 0.25 + 0.75 * clump)) continue;
    mats.push(xf([x, groundY(x, z), z], [0, rot, 0], [s * 1.3, s * (0.8 + r() * 0.6), s * 1.3]));
  }
  const im = new THREE.InstancedMesh(g, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = "set:grass:tufts";
  im.receiveShadow = true;
  im.castShadow = false;
  c.dyn.push(im);
  c.extra.grassMat = mat;
  c.extra.grassUniforms = wind;
  c.extra.disposables.push(g, mat);
}

const BUILDERS: Record<SetElementId, (c: BuildCtx) => void> = {
  ground: buildGround,
  grass: buildGrass,
  house: buildHouse,
  garden: buildGarden,
  beehive: buildBeehive,
  oak_swing: buildOakSwing,
  hammock: buildHammock,
  pond: buildPond,
  pier: buildPier,
  table: buildTable,
  samovar: buildSamovar,
  bench: buildBench,
  woodpile: buildWoodpile,
  big_pine: buildBigPine,
  bush: buildBush,
  creek: buildCreek,
  footbridge: (c) => buildBridge(c, 1.05),
  path_bridge: (c) => buildBridge(c, 1.6),
  van: buildVan,
  picket_fence: buildFence,
  flowers_patch: buildFlowers,
  rocks: buildRocks,
  forest: buildForest,
};

// ---------------------------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------------------------

export interface SetHandle {
  setDoor(open:number):void;
  root: THREE.Group;
  /** Authored vegetation models and their textures have settled. */
  assetsReady: Promise<void>;
  natureStatus(): { loaded: string[]; failed: string[] };
  /** Select the opaque exterior or a usable cutaway room from the story camera focus. */
  updateView(x:number,z:number,location?:SceneLocation,cameraPosition?:THREE.Vector3):void;
  /** named anchor group per element ("set:<id>") — glTF replacements are loaded into these */
  elements: Record<SetElementId, THREE.Group>;
  /** pivot of the rope swing (rotate about local x to swing) */
  swingPivot: THREE.Object3D | null;
  swingSeat: THREE.Object3D | null;
  /** advance ambient life (smoke, bees) and night glow; deterministic in t */
  update(t: number, windowGlow: number, pointScale: number): void;
  /** swing angle in radians (0 = hanging still) */
  setSwing(angle: number): void;
  /** swap in the CC0 ground detail textures (A5); missing ones keep the painted look */
  applyTextures(t: EnvTextures): void;
  dispose(): void;
}

export interface BuildSetOptions {
  /** merge static geometry across elements per material (default true) */
  merge?: boolean;
  /** elements NOT to build procedurally (e.g. replaced by a glTF via the manifest) */
  skip?: readonly SetElementId[];
  /** if given, filled with build time (ms) per element + "merge" */
  timings?: Record<string, number>;
}

/** Elements whose static geometry renders into the shadow map (perf: everything else only receives). */
export const SHADOW_CASTERS: ReadonlySet<SetElementId> = new Set<SetElementId>(["house", "van", "oak_swing", "table", "bench", "beehive", "woodpile", "samovar", "big_pine"]);

export function buildBearsYard(mats: LookMaterials, opts: BuildSetOptions = {}): SetHandle {
  const merge = opts.merge ?? true;
  const skip = new Set(opts.skip ?? []);
  const root = new THREE.Group();
  root.name = "set:bears_yard";
  const extra: SetExtras = { nature: new NatureAssets(), disposables: [], waterUniforms: installWaterRipples(mats.water) };
  const global = new GeoBag();
  const globalNoCast = new GeoBag();
  const elements = {} as Record<SetElementId, THREE.Group>;
  for (const id of SET_ELEMENT_IDS) {
    const def = SET_ELEMENTS[id];
    const anchor = new THREE.Group();
    anchor.name = `set:${id}`;
    anchor.position.set(def.pos[0], def.pos[1], def.pos[2]);
    anchor.rotation.y = def.rotY;
    anchor.userData = { setElement: id, mark: def.mark, description: def.description, source: skip.has(id) ? "gltf" : "procedural" };
    root.add(anchor);
    elements[id] = anchor;
    const ctx: BuildCtx = { bag: new GeoBag(), dyn: [], mats, extra };
    const t0 = performance.now();
    BUILDERS[id](ctx);
    for (const o of ctx.dyn) anchor.add(o);
    if (ctx.bag.parts.size) {
      const cast = SHADOW_CASTERS.has(id);
      if (merge && !skip.has(id) && !["pond","pier","van","creek","footbridge","path_bridge"].includes(id)) {
        anchor.updateMatrix();
        (cast ? global : globalNoCast).absorb(ctx.bag, anchor.matrix);
        anchor.userData.merged = true;
      } else {
        anchor.add(ctx.bag.build(mats, `set:${id}:static`, cast ? {} : { cast: false }));
      }
    }
    ctx.bag.dispose();
    if (opts.timings) opts.timings[id] = Math.round(performance.now() - t0);
  }
  const tm = performance.now();
  if (merge) {
    root.add(global.build(mats, "set:merged_static"));
    root.add(globalNoCast.build(mats, "set:merged_static_nocast", { cast: false }));
  }
  global.dispose();
  globalNoCast.dispose();
  if (opts.timings) opts.timings.merge = Math.round(performance.now() - tm);
  root.updateMatrixWorld(true);

  const interior = buildHouseInterior(mats);
  root.add(interior);
  const outsideDoor=buildHouseDoor(),insideDoor=buildHouseDoor(true);
  root.add(outsideDoor);interior.add(insideDoor);
  insideDoor.position.sub(interior.position);
  const pondLocation=buildForestLocation("pond",mats,extra.nature,pondRadius);
  const wolvesLocation=buildForestLocation("wolves",mats,extra.nature);
  root.add(pondLocation,wolvesLocation);
  const smokeMat = extra.smoke?.material as THREE.ShaderMaterial | undefined;
  const beesMat = extra.bees?.material as THREE.ShaderMaterial | undefined;
  const handle: SetHandle = {
    setDoor(open){updateHouseDoor(outsideDoor,open);updateHouseDoor(insideDoor,open);},
    root,
    assetsReady: Promise.all([...extra.nature.jobs,interior.userData.assetsReady]).then(() => undefined),
    updateView(x,z,location=sceneLocationAt(x,z),cameraPosition) {
      for(const child of root.children) child.visible=false;
      if(location==='house'){
        interior.visible=true;
        if(cameraPosition)updateHouseInteriorView(interior,cameraPosition);
      }
      else if(location==='pond') {
        pondLocation.visible=true;elements.pond.visible=true;elements.pier.visible=true;
      } else if(location==='wolves') {
        wolvesLocation.visible=true;elements.van.visible=true;
      } else {
        for(const child of root.children)child.visible=child!==interior&&child!==pondLocation&&child!==wolvesLocation;
        for(const id of ['pond','pier','van'] as const)elements[id].visible=false;
      }
      root.userData.location=location;
    },
    natureStatus: () => ({ loaded: [...extra.nature.loaded], failed: [...extra.nature.failed] }),
    elements,
    swingPivot: extra.swingPivot ?? null,
    swingSeat: extra.swingSeat ?? null,
    update(t, windowGlow, pointScale) {
      updateHouseInterior(interior,windowGlow);
      if (extra.grassUniforms) extra.grassUniforms.uTime.value = t;
      if (extra.waterUniforms) extra.waterUniforms.uSetWaterTime.value = t;
      if (smokeMat) {
        smokeMat.uniforms.uTime.value = t;
        smokeMat.uniforms.uScale.value = pointScale;
        (smokeMat.uniforms.uColor.value as THREE.Color).setHex(windowGlow > 0.6 ? 0x6f7890 : 0xf4f1ec);
        smokeMat.uniforms.uAlpha.value = 0.5 - windowGlow * 0.2;
      }
      if (beesMat) {
        beesMat.uniforms.uTime.value = t;
        beesMat.uniforms.uScale.value = pointScale;
        if (extra.bees) extra.bees.visible = windowGlow < 0.7;
      }
    },
    setSwing(angle) {
      if (extra.swingPivot) extra.swingPivot.rotation.x = angle;
    },
    applyTextures(t) {
      for(const location of [pondLocation,wolvesLocation]){
        const ground=location.userData.groundMaterial as THREE.MeshStandardMaterial;
        if(t.grass){ground.map?.dispose();ground.map=t.grass;}
        if(t.grassN){ground.normalMap?.dispose();ground.normalMap=t.grassN;}
      }
      const u = extra.groundUniforms;
      if (!u) return;
      if (t.grass) u.uGrass.value = t.grass;
      if (t.dirt) u.uDirt.value = t.dirt;
      if (t.grassN) u.uGrassN.value = t.grassN;
      if (t.dirtN) u.uDirtN.value = t.dirtN;
      u.uDetailAmt.value = t.grass || t.dirt ? 0.58 : 0;
      u.uNormalAmt.value = t.grassN || t.dirtN ? 0.35 : 0;
    },
    dispose() {
      extra.nature.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        // shared look materials are disposed by the look; only dispose set-owned shader materials
        if (mat && !Array.isArray(mat) && (mat as THREE.ShaderMaterial).isShaderMaterial) mat.dispose();
        if(mat&&!Array.isArray(mat)&&mat.userData.setOwned){(mat as THREE.MeshStandardMaterial).map?.dispose();(mat as THREE.MeshStandardMaterial).normalMap?.dispose();mat.dispose();}
      });
      for (const d of extra.disposables) d.dispose();
      const gu = extra.groundUniforms;
      if (gu) for (const k of ["uGrass", "uDirt", "uGrassN", "uDirtN"] as const) gu[k].value.dispose();
    },
  };
  return handle;
}

/** Marks re-exported for convenience (tools). */
export { MARKS };
