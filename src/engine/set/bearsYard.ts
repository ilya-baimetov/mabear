// Set "Bear's yard" (spec §7.2). Every element is a stand-in for an existing Animaccord 3D source and lives in its own
// NAMED anchor group placed from the set data, so a production glTF export can replace any element 1:1 through the
// asset manifest (src/engine/assets.ts). Static procedural geometry is merged per material across the whole set
// (BufferGeometryUtils.mergeGeometries) to stay far below the ~150 draw-call budget; the anchors stay in the graph.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MARKS } from "../../shared/bible/set";
import type { MarkId, Vec2 } from "../../shared/schema";
import { GeoBag, bagToSingle, lumpy, paint, rng, xf, type LookMaterials, type MatKey } from "../look";
import { DETAIL_MEAN_SRGB, type EnvTextures } from "./textures";

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

const PIER_START: Vec2 = [-4.6, 7.2];
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
  house: { id: "house", pos: [-6, 0, -6.4], rotY: 0, mark: "porch", description: "Bear's two-storey log cabin with porch, door, chimney and carved windows" },
  garden: { id: "garden", pos: [5.4, 0, -7.1], rotY: 0, mark: "garden", description: "Raised beds with carrots and cabbages, small picket fence" },
  beehive: { id: "beehive", pos: [10.2, 0, -9.1], rotY: 0, mark: "beehive", description: "Wooden beehive on a stump" },
  oak_swing: { id: "oak_swing", pos: [8.6, 0, -0.6], rotY: 0, mark: "swing", description: "Big oak with a rope swing (seat is a separate moving object)" },
  // rotated 46° so neither pine trunk stands on the hammock→clearing lane or the w_hammock waypoint paths
  hammock: { id: "hammock", pos: [-11, 0, 2.2], rotY: 0.8, mark: "hammock", description: "Striped hammock between two pines" },
  pond: { id: "pond", pos: [-8, 0, 10], rotY: 0, mark: "pond_shore", description: "Small round pond with stones, reeds and lily pads" },
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
  van: { id: "van", pos: [14.1, 0, -1], rotY: 0, mark: "van", description: "The Wolves' old boxy ambulance van (faded cream, red stripe)" },
  picket_fence: { id: "picket_fence", pos: [0, 0, 0], rotY: 0, mark: null, description: "Fragments of an old picket fence by the path" },
  flowers_patch: { id: "flowers_patch", pos: [0, 0, 0], rotY: 0, mark: null, description: "Wildflower clusters" },
  rocks: { id: "rocks", pos: [0, 0, 0], rotY: 0, mark: null, description: "Rocks and boulders" },
  forest: { id: "forest", pos: [0, 0, 0], rotY: 0, mark: null, description: "Dense stylized forest of pines and birches (instanced)" },
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
  // porch (world x -8.4..-3.6, z -4.0..-2.0) with full-width steps down to z = -1.4, and soft side ramps
  if (x > -9.0 && x < -3.0 && z > -4.6 && z < -1.4) {
    const hz = clamp01((-1.4 - z) / 0.6);
    const hx = clamp01(Math.min(x + 9.0, -3.0 - x) / 0.6);
    return PORCH_HEIGHT * Math.min(hz, hx);
  }
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

/** Pond outline radius at angle θ (a slightly kidney-shaped pond so pond_shore stays dry). */
export function pondRadius(theta: number): number {
  const centre = -Math.PI / 4; // toward (+x, -z): the pond_shore mark side
  let d = theta - centre;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const deg = (d * 180) / Math.PI;
  return 3.5 - 1.0 * Math.exp(-(deg * deg) / 200) + 0.12 * Math.sin(theta * 3 + 1);
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

/**
 * A stylized pine into `bag`, base at the origin of `m`: tapered trunk with a small root flare, and 4 (lod 1) to 6
 * (lod 0) overlapping layered tiers whose rims are jagged and drooping (branch tips), darker underneath and sunlit
 * toward the tips, so the silhouette reads as a soft CG conifer rather than stacked cones.
 */
export function addPine(bag: GeoBag, height: number, seed: number, m: THREE.Matrix4, mat: MatKey = "foliage", lod = 0, clear = 0): void {
  const r = rng(seed);
  const h = height;
  bag.add("bark", new THREE.CylinderGeometry(0.018 * h, 0.042 * h, 0.62 * h, lod ? 5 : 8, 1, true), 0x6b4428, xf([0, 0.31 * h, 0]).premultiply(m), { aoBottom: 0.3 });
  if (!lod) bag.add("bark", new THREE.ConeGeometry(0.075 * h, 0.09 * h, 8, 1, true), 0x5e3b23, xf([0, 0.045 * h, 0]).premultiply(m), { aoBottom: 0.4 });
  const tiers = lod ? 4 : 6;
  const y0 = Math.max(h * 0.2, clear);
  const top = new THREE.Color(0x6aa64e), bot = new THREE.Color(0x24552f), under = new THREE.Color(0x1f4a2b);
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1); // 0 bottom … 1 top
    const ch = h * (0.3 - f * 0.12) * (lod ? 1.15 : 1);
    const cr = h * (0.215 - f * 0.15) * (0.92 + r() * 0.16) * (lod ? 1.08 : 1);
    const y = y0 + (h - y0 - ch * 0.5) * (f * 0.86) + ch / 2;
    const seg = lod ? 7 : 12;
    const g = new THREE.ConeGeometry(cr, ch, seg, 1, lod > 0);
    // jagged, drooping rim (branch tips) + a little radial wobble mid-height
    const pos = g.attributes.position;
    const ph = seed * 1.7 + i * 2.1;
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k), px = pos.getX(k), pz = pos.getZ(k);
      const a = Math.atan2(pz, px);
      const t = (ch / 2 - py) / ch; // 0 apex … 1 rim
      if (t < 0.02) continue;
      const jag = Math.sin(a * 7 + ph) * 0.13 + Math.sin(a * 13 - ph) * 0.06;
      const sc = 1 + jag * t * t;
      pos.setX(k, px * sc);
      pos.setZ(k, pz * sc);
      if (t > 0.98) pos.setY(k, py - (0.06 + Math.max(0, jag) * 0.5) * ch);
    }
    // keep the cone's analytic normals (smooth up to the apex), tilted a little upward for a softer read
    const nn = g.attributes.normal;
    for (let k = 0; k < nn.count; k++) {
      const ny = nn.getY(k);
      if (ny > -0.9) {
        const x = nn.getX(k), z = nn.getZ(k), y2 = ny + 0.35;
        const l = Math.hypot(x, y2, z) || 1;
        nn.setXYZ(k, x / l, y2 / l, z / l);
      }
    }
    const tierTop = bot.clone().lerp(top, 0.55 + f * 0.45);
    bag.add(mat, g, 0x3f7d3f, xf([0, y, 0], [0, r() * 6, 0]).premultiply(m), {
      capColor: under,
      colorFn: (p, n, out) => {
        if (n.y < -0.8) return;
        const t = clamp01(p.y / ch + 0.5);
        out.copy(bot).lerp(tierTop, Math.pow(t, 0.8));
      },
      jitter: 0.12,
      seed: seed + i,
    });
  }
}

/** A birch: white tapered trunk with dark marks, two side limbs, and a layered canopy of light leafy clumps. */
export function addBirch(bag: GeoBag, height: number, seed: number, m: THREE.Matrix4, mat: MatKey = "foliage", lod = 0): void {
  const r = rng(seed);
  const h = height;
  const marks = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
    const a = Math.atan2(p.z, p.x);
    if (Math.sin(p.y * 9 + a * 2 + seed) > 0.82 || Math.sin(p.y * 4.1 - a + seed * 2) > 0.93) out.setHex(0x37322d);
  };
  bag.add("bark", new THREE.CylinderGeometry(0.02 * h, 0.042 * h, 0.8 * h, lod ? 5 : 7, lod ? 2 : 7, true), 0xeeeae0, xf([0, 0.4 * h, 0]).premultiply(m), { colorFn: marks });
  if (!lod) {
    for (const s of [-1, 1]) {
      const a = V(0, h * (0.5 + s * 0.04), 0), e = V(s * h * 0.16, h * 0.68, (r() - 0.5) * h * 0.1);
      const { g, m: bm } = beam(a, e, 0.012 * h, 0.006 * h, 5);
      bag.add("bark", g, 0xe6e1d6, bm.premultiply(m), { colorFn: marks });
    }
  }
  const pal = [0x7fb446, 0x8cbf4c, 0x74ab40, 0x86ba4a, 0x6fa63e];
  const n = lod ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const f = i / Math.max(1, n - 1);
    const rr = h * (lod ? 0.2 : 0.135 + r() * 0.04) * (1.15 - f * 0.35);
    const ang = i * 2.39996 + seed;
    const spread = h * (lod ? 0.09 : 0.13) * (1 - f * 0.6);
    const y = h * (0.56 + f * 0.33);
    // one colour per clump: lighting + puffy normals do the shading (vertex-colour gradients on coarse meshes read as facets)
    bag.add(mat, blob(rr, seed * 7 + i, 0.16, lod ? 0 : 1, 0.7), pal[(i + seed) % pal.length], xf([Math.cos(ang) * spread, y, Math.sin(ang) * spread], [0, 0, 0], [1, 1.2, 1]).premultiply(m));
  }
}

function cloneBagTransformed(src: GeoBag, m: THREE.Matrix4, into: GeoBag): void {
  into.absorb(src, m);
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
  swingPivot?: THREE.Object3D;
  swingSeat?: THREE.Object3D;
  smoke?: THREE.Points;
  bees?: THREE.Points;
  grassMat?: THREE.MeshStandardMaterial;
  groundTex?: THREE.Texture | null;
  /** wind uniforms of the grass tufts (vertex sway) */
  grassUniforms?: { uTime: { value: number }; uWind: { value: number } };
  /** detail-texture uniforms of the ground shader (CC0 grass / dirt swap in when loaded) */
  groundUniforms?: GroundDetailUniforms;
  disposables: { dispose(): void }[];
}

function buildHouse(c: BuildCtx): void {
  const b = c.bag;
  const W = 6.4, D = 4.8, r = 0.2, step = 0.37, base = 0.25;
  const rows = 16, groundRows = 9;
  // stone foundation
  b.add("stone", new RoundedBoxGeometry(W + 0.3, base, D + 0.3, 2, 0.06), 0x9a948a, xf([0, base / 2, 0]), { jitter: 0.1 });
  const logCols = [0xb8743f, 0xad6b39, 0xc07d46];
  const endGrain = 0xe8c08a;
  for (let i = 0; i < rows; i++) {
    const y = base + r + i * step;
    const col = logCols[i % 3];
    // front/back (along x)
    for (const z of [D / 2, -D / 2]) {
      b.add("wood", cyl(r, r, W + 0.55, 9), col, xf([0, y, z], [0, 0, Math.PI / 2]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i });
    }
    // sides (along z), half a step higher (interlocking corners)
    for (const x of [W / 2, -W / 2]) {
      b.add("wood", cyl(r, r, D + 0.55, 9), col, xf([x, y + step / 2, 0], [Math.PI / 2, 0, 0]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i + 50 });
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
      b.add("foliage", sph(0.08, 8, 6), [0xe8433a, 0xffd84a, 0xff8fc0, 0xffffff, 0xe8433a, 0xa070e0][k], xf([s * 1.95 - 0.45 + k * 0.18, fy + 0.13, D / 2 + r + 0.14]));
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
  const white = 0xf6f0e2, blue = 0x3d7fc1;
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
  b.add("paint", new THREE.ExtrudeGeometry(crown, { depth: 0.06, bevelEnabled: false }), white, xf([x, y + h / 2 + f, z]));
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
  const L = 4.0, Wd = 0.8;
  const beds = [1.2, 0, -1.2];
  beds.forEach((z, bi) => {
    // frame
    for (const s of [-1, 1]) {
      b.add("wood", box(L, 0.26, 0.07), 0x9d6b3f, xf([0, 0.13, z + s * (Wd / 2)]), { jitter: 0.08, seed: bi * 2 + s });
      b.add("wood", box(0.07, 0.26, Wd), 0x9d6b3f, xf([s * L / 2, 0.13, z]));
    }
    b.add("soil", box(L - 0.07, 0.2, Wd - 0.07), 0x5e3c25, xf([0, 0.11, z]), { jitter: 0.25, seed: bi });
    if (bi === 1) {
      for (let k = 0; k < 6; k++) addCabbage(b, -1.6 + k * 0.64, 0.22, z, 100 + k);
    } else {
      for (let k = 0; k < 9; k++) addCarrotTop(b, -1.7 + k * 0.42, 0.21, z + (k % 2 ? 0.1 : -0.1), bi * 20 + k);
    }
  });
  // small picket fence on W, N, E sides (south side open: the garden mark)
  const fenceCol = 0xeee3cf;
  const runs: [number, number, number, number][] = [
    [-2.5, 1.75, -2.5, -1.85], [-2.5, -1.85, 2.5, -1.85], [2.5, -1.85, 2.5, 1.75],
  ];
  for (const [x0, z0, x1, z1] of runs) addPickets(b, x0, z0, x1, z1, 0.55, 0.17, fenceCol, 0.05);
}

function addCabbage(b: GeoBag, x: number, y: number, z: number, seed: number): void {
  const r = rng(seed);
  b.add("foliage", blob(0.16, seed, 0.08, 1), 0xb5dc7a, xf([x, y + 0.13, z]), { jitter: 0.08, seed });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    b.add("foliage", sph(0.16, 7, 4), 0x7fbf55, xf([x + Math.cos(a) * 0.12, y + 0.08, z + Math.sin(a) * 0.12], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], [1, 0.25, 0.8]), { jitter: 0.1, seed: seed + i });
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
  const blobs: [number, number, number, number][] = [
    [0, 5.6, 0.2, 2.0], [1.6, 5.1, -0.4, 1.5], [-1.5, 5.2, -0.5, 1.5], [0.4, 5.0, 1.7, 1.4], [-0.8, 6.4, 0.3, 1.3],
    [1.0, 6.3, 0.6, 1.2], [-0.6, 4.9, 2.2, 1.0], [0.2, 5.2, -1.5, 1.3],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    b.add("foliage", blob(r, 10 + i, 0.11, 2, 0.65), [0x5f9b3a, 0x6aa63f, 0x578f36][i % 3], xf([x, y, z], [0, 0, 0], [1, 0.82, 1]));
  });
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
  for (const s of [-1, 1]) addPine(b, 9 + s * 0.6, 40 + s, xf([s * 2.1, 0, 0]), "foliage", 0, 2.9);
  // fabric: sagging striped grid
  const U = 24, Vn = 6, L = 3.0, Wd = 0.9;
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
      const { g: rg, m } = beam(V(s * 1.5, 1.05, zz * 0.6), V(s * 2.0, 1.45, 0), 0.015, 0.015, 4);
      b.add("wood", rg, 0xd2bc8e, m);
    }
  }
}

function buildPond(c: BuildCtx): void {
  const b = c.bag;
  // radial water mesh with a depth gradient
  const segs = 64, rings = [0, 0.4, 0.7, 0.88, 1.0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const deep = new THREE.Color(0x1f6f86), shallow = new THREE.Color(0x6cc2c4), cc = new THREE.Color();
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
  b.addPainted("water", g);
  // shore stones (skip the pier/shore-mark sector)
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const th = (i / 26) * Math.PI * 2 + r() * 0.15;
    const deg = ((Math.atan2(Math.sin(th + Math.PI / 4), Math.cos(th + Math.PI / 4)) * 180) / Math.PI);
    if (Math.abs(deg) < 32) continue;
    const rr = pondRadius(th) + 0.05 + r() * 0.2;
    const s = 0.18 + r() * 0.22;
    b.add("stone", blob(s, 200 + i, 0.18, 1), 0x9d9a90, xf([Math.cos(th) * rr, s * 0.25, Math.sin(th) * rr], [r(), r() * 6, r()], [1, 0.6, 1]), { jitter: 0.15, seed: i });
  }
  // reeds and cattails on the far (north-west) edge
  for (let i = 0; i < 22; i++) {
    const th = Math.PI * (0.95 + r() * 0.75);
    const rr = pondRadius(th) - 0.2 + r() * 0.5;
    const h = 0.7 + r() * 0.7;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const lean: [number, number, number] = [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25];
    b.add("foliage", cyl(0.012, 0.02, h, 4), 0x5f8f3a, xf([x, h / 2, z], lean));
    if (i % 2 === 0) b.add("foliage", cyl(0.035, 0.035, 0.16, 6), 0x6b3e22, xf([x + lean[2] * -h * 0.5, h - 0.05, z + lean[0] * h * 0.5], lean));
  }
  // lily pads with two pink flowers
  for (let i = 0; i < 7; i++) {
    const th = r() * Math.PI * 2;
    const rr = pondRadius(th) * (0.35 + r() * 0.45);
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const s = 0.22 + r() * 0.12;
    const pad = new THREE.CylinderGeometry(s, s, 0.02, 14, 1, false, 0.3, Math.PI * 2 - 0.6);
    b.add("foliage", pad, 0x4f9a3c, xf([x, 0.045, z], [0, r() * 6, 0]));
    if (i < 2) b.add("foliage", new THREE.ConeGeometry(0.07, 0.1, 6), 0xff9fc8, xf([x, 0.1, z], [Math.PI, 0, 0]));
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
  addPine(c.bag, 13.5, 777, xf());
}

function buildBush(c: BuildCtx): void {
  const b = c.bag;
  const blobs: [number, number, number, number][] = [[0, 0.75, 0, 0.85], [0.6, 0.55, 0.2, 0.6], [-0.6, 0.55, 0.15, 0.62], [0.1, 0.5, 0.6, 0.55], [-0.1, 0.55, -0.55, 0.6]];
  blobs.forEach(([x, y, z, r], i) => {
    b.add("foliage", blob(r, 60 + i, 0.12, 2, 0.65), [0x55923c, 0x5f9d40, 0x4f8a38][i % 3], xf([x, y, z]));
  });
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
  const edge = new THREE.Color(0x8fd0c8), mid = new THREE.Color(0x3c98a4);
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
  const b = c.bag;
  const W = 2.0, L = 4.3, H = 1.95, clear = 0.5;
  const cream = 0xe9dfc0, red = 0xc23e2e, dark = 0x2a2a2a, glassC = 0x4d6680;
  b.add("paint", new RoundedBoxGeometry(W, H, L, 4, 0.34), cream, xf([0, clear + H / 2, 0]), { aoBottom: 0.25, jitter: 0.04 });
  b.add("paint", new RoundedBoxGeometry(W + 0.03, 0.22, L + 0.03, 2, 0.1), red, xf([0, clear + 0.82, 0]));
  // windows
  for (const s of [-1, 1]) {
    b.add("paint", new RoundedBoxGeometry(0.82, 0.62, 0.04, 2, 0.06), glassC, xf([s * 0.46, clear + H - 0.5, L / 2 + 0.005]));
    for (const zz of [1.35, 0.25, -0.75, -1.65]) {
      b.add("paint", new RoundedBoxGeometry(0.04, 0.52, zz === 1.35 ? 0.62 : 0.72, 2, 0.05), glassC, xf([s * (W / 2 + 0.005), clear + H - 0.5, zz]));
    }
    // headlights + bumpers
    b.add("paint", cyl(0.13, 0.13, 0.05, 14), 0xfff4cc, xf([s * 0.66, clear + 0.45, L / 2 + 0.01], [Math.PI / 2, 0, 0]));
    b.add("metal", new THREE.TorusGeometry(0.13, 0.025, 6, 14), 0xcfcfcf, xf([s * 0.66, clear + 0.45, L / 2 + 0.03]));
    // wheels
    for (const zz of [1.4, -1.4]) {
      b.add("paint", cyl(0.42, 0.42, 0.3, 18), dark, xf([s * (W / 2 - 0.08), 0.42, zz], [0, 0, Math.PI / 2]), { capColor: 0x3a3a3a, capAxis: "y" });
      b.add("paint", cyl(0.2, 0.2, 0.32, 12), cream, xf([s * (W / 2 - 0.08), 0.42, zz], [0, 0, Math.PI / 2]));
    }
    b.add("paint", box(0.08, 0.14, 0.05), dark, xf([s * (W / 2 + 0.08), clear + H - 0.55, L / 2 - 0.4]));
  }
  // grille slats
  for (let i = 0; i < 6; i++) b.add("paint", box(0.04, 0.32, 0.03), 0x8a8a84, xf([-0.2 + i * 0.08, clear + 0.45, L / 2 + 0.01]));
  b.add("paint", box(W + 0.1, 0.14, 0.14), 0x4a4a48, xf([0, clear + 0.08, L / 2 + 0.05]));
  b.add("paint", box(W + 0.1, 0.14, 0.14), 0x4a4a48, xf([0, clear + 0.08, -L / 2 - 0.05]));
  // roof beacon (no emblem, no brand)
  b.add("paint", new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x3f7fdc, xf([0, clear + H, L / 2 - 0.55]));
  b.add("paint", cyl(0.14, 0.14, 0.06, 12), 0x4a4a48, xf([0, clear + H - 0.02, L / 2 - 0.55]));
  // faded rust/dirt patches
  const r = rng(8);
  for (let i = 0; i < 5; i++) {
    const s = r() < 0.5 ? -1 : 1;
    b.add("paint", sph(0.12 + r() * 0.1, 8, 6), 0xb08a5a, xf([s * (W / 2 - 0.03), clear + 0.15 + r() * 0.3, (r() - 0.5) * 3.2], [0, 0, 0], [0.25, 0.6, 1.2]));
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
  const heads = [0xffffff, 0xffd84a, 0xe8433a, 0x6b8cff, 0xff8fc0, 0xa070e0, 0xffffff];
  const clusters: [number, number, number, number][] = [
    [-9.9, -3.4, 0.8, 9], [-2.3, -3.2, 0.7, 8], [2.6, -4.6, 0.6, 7], [3.4, 3.9, 0.7, 8], [7.4, 6.6, 0.7, 8],
    [-3.9, 12.2, 0.8, 9], [1.8, 11.2, 0.6, 7], [-1.9, 11.6, 0.6, 7], [-12.6, 3.6, 0.8, 8], [9.6, 0.6, 0.7, 7],
    [-13.6, -2.8, 0.7, 7], [12.4, -6.2, 0.7, 7], [6.4, 10.4, 0.8, 8], [-9.2, -0.9, 0.5, 6], [8.8, -3.4, 0.6, 7],
  ];
  const plant = (x: number, z: number, k: number) => {
    const h = 0.18 + r() * 0.22;
    const lean: [number, number, number] = [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3];
    b.add("foliage", new THREE.CylinderGeometry(0.008, 0.01, h, 3, 1, true), 0x4f8f3a, xf([x, h / 2, z], lean));
    const hc = heads[k % heads.length];
    const hx = x - lean[2] * h * 0.5, hz = z + lean[0] * h * 0.5;
    if (hc === 0xffffff || hc === 0xffd84a) {
      b.add("foliage", new THREE.CylinderGeometry(0.055, 0.055, 0.012, 7, 1), hc, xf([hx, h, hz], lean));
      b.add("foliage", sph(0.022, 5, 3), hc === 0xffffff ? 0xffc93a : 0xd08a20, xf([hx, h + 0.01, hz]));
    } else {
      b.add("foliage", sph(0.045, 6, 4), hc, xf([hx, h + 0.01, hz], [0, 0, 0], [1, 0.75, 1]));
    }
  };
  for (const [cx, cz, rad, n] of clusters) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      plant(cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.floor(r() * 7));
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * 34, z = (r() - 0.5) * 30 + 1;
    if (!openGround(x, z, 0.8) || (x > -8 && x < 1 && z > -2.4 && z < 3)) continue;
    plant(x, z, Math.floor(r() * 7));
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
    b.add("stone", blob(s, 500 + i, 0.2, 1), 0x9a978d, xf([x, s * 0.3, z], [r(), r() * 6, r()], [1.2, 0.65, 1]), { jitter: 0.14, aoBottom: 0.3, seed: i });
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
  const r = rng(2024);
  type Spot = { x: number; z: number; s: number; rot: number };
  const near: Record<"pineA" | "pineB" | "birch", Spot[]> = { pineA: [], pineB: [], birch: [] };
  const far: Record<"pineA" | "pineB" | "birch", Spot[]> = { pineA: [], pineB: [], birch: [] };
  const cell = 2.7;
  for (let gx = -60; gx <= 60; gx += cell) {
    for (let gz = -60; gz <= 60; gz += cell) {
      const x = gx + (r() - 0.5) * cell * 0.9;
      const z = gz + (r() - 0.5) * cell * 0.9;
      const ry = r(), rs = r(), rt = r(), rk = r();
      const dist = Math.hypot(x, z);
      if (dist > 62) continue;
      if ((x / 17.5) ** 2 + ((z - 1) / 15.5) ** 2 < 1) continue; // the yard
      if (z > 9 && z < 36 && Math.abs(x) < 26 + (z - 9) * 0.3) continue; // open meadow toward the default camera
      if (creekDistance(x, z) < 2.2) continue;
      if (Math.abs(x - pathX(z)) < 3.2 && z > 8) continue;
      if (Math.hypot(x - 14, z + 1) < 4) continue;
      if (dist > 36 && rk < 0.25 + (dist - 36) / 30) continue;
      const birchP = dist < 26 ? 0.38 : 0.2;
      const kind = rt < birchP ? "birch" : rt < birchP + (1 - birchP) / 2 ? "pineA" : "pineB";
      const s = 0.75 + rs * 0.6 + (dist > 28 ? 0.25 : 0);
      (dist < 30 ? near : far)[kind].push({ x, z, s, rot: ry * Math.PI * 2 });
    }
  }
  // a few birches sprinkled at the meadow edges (south, toward the camera, kept low)
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (20 + r() * 12), z = 12 + r() * 22;
    near.birch.push({ x, z, s: 0.8 + r() * 0.4, rot: r() * 6 });
  }
  type Kind = "pineA" | "pineB" | "birch";
  const fill: Record<Kind, (bag: GeoBag, lod: number) => void> = {
    pineA: (bag, lod) => addPine(bag, 7.5, 11, xf(), "foliage", lod),
    pineB: (bag, lod) => addPine(bag, 9, 12, xf(), "foliage", lod),
    birch: (bag, lod) => addBirch(bag, 6.5, 13, xf(), "foliage", lod),
  };
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const disposables: THREE.BufferGeometry[] = [];
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, spots: Spot[], name: string, receive: boolean, tint: boolean) => {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    im.name = name;
    const rc = rng(name.length * 31 + spots.length);
    spots.forEach((sp, i) => {
      m4.copy(xf([sp.x, groundY(sp.x, sp.z), sp.z], [0, sp.rot, 0], sp.s));
      im.setMatrixAt(i, m4);
      // per-tree hue/brightness variation (multiplies the baked vertex colours)
      if (tint) {
        const br = 0.84 + rc() * 0.3, warm = (rc() - 0.5) * 0.18;
        im.setColorAt(i, col.setRGB(br * (1 + warm), br, br * (1 - warm * 1.4)));
      }
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false; // perf: trees don't render into the shadow map
    im.receiveShadow = receive;
    c.dyn.push(im);
    disposables.push(geo);
  };
  for (const kind of ["pineA", "pineB", "birch"] as const) {
    // near: trunks in the CC0 bark material, canopies in foliage (2 draws per kind)
    if (near[kind].length) {
      const bag = new GeoBag();
      fill[kind](bag, 0);
      const trunk = bag.parts.get("bark");
      const crown = bag.parts.get("foliage");
      if (trunk?.length) instanced(mergeGeos(trunk), c.mats.bark, near[kind], `set:forest:${kind}:near:trunks`, true, false);
      if (crown?.length) instanced(mergeGeos(crown), c.mats.foliage, near[kind], `set:forest:${kind}:near`, true, true);
      bag.dispose();
    }
    // far: one merged proto in foliage (trunks barely show through the fog)
    if (far[kind].length) instanced(protoGeo((bag) => fill[kind](bag, 1)), c.mats.foliage, far[kind], `set:forest:${kind}:far`, false, true);
  }
  c.extra.disposables.push(...disposables);
  addForestSilhouettes(c.bag);
}

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const bag = new GeoBag();
  for (const g of list) bag.addPainted("foliage", g.clone());
  const out = bagToSingle(bag);
  bag.dispose();
  return out;
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

function protoGeo(fill: (bag: GeoBag) => void): THREE.BufferGeometry {
  const bag = new GeoBag();
  fill(bag);
  const g = bagToSingle(bag);
  bag.dispose();
  return g;
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
  if (!tex) mat.color.setHex(0x7fb24a);
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
  ctx.fillStyle = "#72b33f";
  ctx.fillRect(0, 0, L, L);
  const greens = ["#69a838", "#82c04c", "#5f9e34", "#7dbb45", "#8cc955", "#6aac3c"];
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
  ctx.fillStyle = "rgba(168,172,84,0.35)";
  ctx.beginPath();
  ctx.ellipse(X(-1.5), Z(-0.5), 5.5 * px, 3.8 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  // under the house and porch, the woodpile, the garden
  ctx.fillStyle = "rgba(82,100,50,0.85)";
  ctx.fillRect(X(-9.8), Z(-9.2), 7.6 * px, 7.8 * px);
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
  path.push([0.2, 6], [-0.6, 3], [-2.6, 0.2], [-4.6, -1.2], [-6, -1.6]);
  strokePath(path, 2.5, "rgba(164,126,78,0.9)");
  strokePath(path.slice(0, 26), 1.6, "rgba(196,156,102,0.9)");
  strokePath([[2, 0.2], [4.2, -2.4], [5, -4.6]], 1.0, "rgba(168,150,92,0.45)");
  strokePath([[-12.2, -5.0], [-10.5, -2.4], [-7.4, -1.6]], 0.9, "rgba(168,150,92,0.4)");
  // pond shore (wet grass, then a sandy rim)
  const ring: Vec2[] = [];
  for (let i = 0; i <= 64; i++) {
    const th = (i / 64) * Math.PI * 2;
    const rr = pondRadius(th);
    ring.push([POND_C[0] + Math.cos(th) * rr, POND_C[1] + Math.sin(th) * rr]);
  }
  strokePath(ring, 1.8, "rgba(84,120,52,0.8)");
  strokePath(ring, 0.8, "rgba(176,156,104,0.95)");
  // creek banks
  const cs = creekSamples();
  strokePath(cs, 2.8, "rgba(80,118,50,0.7)");
  strokePath(cs, 1.7, "rgba(140,118,78,0.9)");
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
  const base = new THREE.Color(0x6aac3c), mid = new THREE.Color(0x86c24c), tip = new THREE.Color(0xb0da68);
  let v = 0;
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + (b % 2) * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const w = 0.07 + 0.02 * (b % 2);
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
  for (let i = 0; i < 24000 && mats.length < 4800; i++) {
    const x = (r() - 0.5) * 48, z = (r() - 0.5) * 46 + 3;
    const s = 0.11 + r() * 0.13;
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
  root: THREE.Group;
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
  const extra: SetExtras = { disposables: [] };
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
    if (skip.has(id)) continue;
    const ctx: BuildCtx = { bag: new GeoBag(), dyn: [], mats, extra };
    const t0 = performance.now();
    BUILDERS[id](ctx);
    for (const o of ctx.dyn) anchor.add(o);
    if (ctx.bag.parts.size) {
      const cast = SHADOW_CASTERS.has(id);
      if (merge) {
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

  const smokeMat = extra.smoke?.material as THREE.ShaderMaterial | undefined;
  const beesMat = extra.bees?.material as THREE.ShaderMaterial | undefined;
  const handle: SetHandle = {
    root,
    elements,
    swingPivot: extra.swingPivot ?? null,
    swingSeat: extra.swingSeat ?? null,
    update(t, windowGlow, pointScale) {
      if (extra.grassUniforms) extra.grassUniforms.uTime.value = t;
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
      const u = extra.groundUniforms;
      if (!u) return;
      if (t.grass) u.uGrass.value = t.grass;
      if (t.dirt) u.uDirt.value = t.dirt;
      if (t.grassN) u.uGrassN.value = t.grassN;
      if (t.dirtN) u.uDirtN.value = t.dirtN;
      u.uDetailAmt.value = t.grass || t.dirt ? 0.85 : 0;
      u.uNormalAmt.value = t.grassN || t.dirtN ? 0.55 : 0;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        // shared look materials are disposed by the look; only dispose set-owned shader materials
        if (mat && !Array.isArray(mat) && (mat as THREE.ShaderMaterial).isShaderMaterial) mat.dispose();
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
