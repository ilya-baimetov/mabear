import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp01 } from "../../../shared/math";
import { POND_CENTER, pondRadius } from "../../../shared/pond";
import type { Vec2, Vec3 } from "../../../shared/schema";
import { CREEK_POINTS } from "../../../shared/yardLayout";
import { GeoBag, lumpy, xf, type LookMaterials, type MatKey } from "../../look";
import { rng } from "../../math/rng";
import type { HorizonUniforms, NatureAssets } from "../nature";

export interface GrassUniforms {
  uTime: { value: number };
  uWind: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uDayFade: { value: number };
}

export interface WaterUniforms {
  uSetWaterTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyColor: { value: THREE.Color };
  uDayFade: { value: number };
}

export interface PondRippleUniforms {
  uRippleCenter: { value: THREE.Vector2 };
  uRippleStrength: { value: number };
}

export interface HammockUniforms {
  uHammockWeight: { value: number };
  uHammockSway: { value: number };
  uHammockTime: { value: number };
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

export interface SetExtras {
  nature: NatureAssets;
  swingPivot?: THREE.Object3D;
  swingSeat?: THREE.Object3D;
  smoke?: THREE.Points;
  bees?: THREE.Points;
  grassMat?: THREE.MeshStandardMaterial;
  groundTex?: THREE.Texture | null;
  /** wind & lighting uniforms of the grass tufts + flowers (vertex sway & tip glow) */
  grassUniforms: GrassUniforms;
  waterUniforms: WaterUniforms;
  pondRippleUniforms: PondRippleUniforms;
  hammockUniforms: HammockUniforms;
  horizonUniforms?: HorizonUniforms;
  /** detail-texture uniforms of the ground shader (CC0 grass / dirt swap in when loaded) */
  groundUniforms?: GroundDetailUniforms;
  disposables: { dispose(): void }[];
}

export interface BuildCtx {
  bag: GeoBag;
  /** non-mergeable children (instanced meshes, moving parts), added to the anchor group */
  dyn: THREE.Object3D[];
  mats: LookMaterials;
  extra: SetExtras;
}

export function creekCurve(points: readonly Vec2[] = CREEK_POINTS): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
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

export function insidePond(x: number, z: number, pad = 0): boolean {
  const dx = x - POND_CENTER[0], dz = z - POND_CENTER[1];
  return Math.hypot(dx, dz) < pondRadius(Math.atan2(dz, dx)) + pad;
}

/** Path centre x at depth z (the forest path wanders slightly). */
export function pathX(z: number): number {
  return 0.35 * Math.sin(z * 0.25);
}

/** True where the yard ground is free for scatter (grass, flowers). */
export function openGround(x: number, z: number, pad = 0): boolean {
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

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 10, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs);
export const sph = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Soft organic blob (canopies, bushes, rocks): welded icosphere, gentle lumps, smooth normals blended toward the
 * sphere normal ("puffy" shading) so low-poly canopies read as soft CG rather than faceted game art.
 */
export function blob(r: number, seed: number, amp = 0.12, detail = 2, puff = 0.55): THREE.BufferGeometry {
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
export function beam(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8): { g: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const len = a.distanceTo(b);
  const g = cyl(r1, r0, len, seg);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  return { g, m };
}

/** Curved, closed leaf with a raised midrib. All leaves are real lit geometry, batched with their tree. */
export function leaf(length: number, width: number, bend = 0.14): THREE.BufferGeometry {
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
export function blossom(b: GeoBag, x: number, y: number, z: number, size: number, color: number, seed: number, mat: MatKey = "paint"): void {
  const r = rng(seed);
  const petals = color === 0xffffff ? 7 : 5;
  for (let k = 0; k < petals; k++) {
    const a = k / petals * Math.PI * 2 + seed;
    b.add(mat, leaf(size, size * .42, .14), color,
      xf([x, y, z], [0, a, 0]));
  }
  b.add(mat, sph(size * .26, 8, 5), color === 0xffd84a ? 0x9d6d30 : 0xe9b84e,
    xf([x, y + size * .08, z], [0, r() * 3, 0], [1, .55, 1]));
}

/** Fine, scattered broad leaves break up the outer silhouette instead of inflating another sphere. */
export function leafyCrown(bag: GeoBag, radius: number, seed: number, m: THREE.Matrix4, color: number, count = 90): void {
  const r = rng(seed), base = new THREE.Color(color), shade = new THREE.Color();
  // Small recessed core prevents holes through the crown; real leaves define its visible perimeter.
  bag.add("foliage", blob(radius * .76, seed, .1, 1, .7), color, m, { aoBottom: .2 });
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, yy = r() * 1.8 - .8;
    const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
    const d = radius * (.78 + r() * .25);
    const size = radius * (.22 + r() * .17);
    shade.copy(base).multiplyScalar(.8 + r() * .35);
    const p: Vec3 = [Math.cos(a) * rad * d, yy * d, Math.sin(a) * rad * d];
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

export function mergeTransformedParts(parts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const normalized = parts.map(({ g, m }) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    for (const k of Object.keys(out.attributes)) {
      if (k !== "position" && k !== "normal" && k !== "uv") out.deleteAttribute(k);
    }
    if (!out.attributes.normal) out.computeVertexNormals();
    if (!out.attributes.uv) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
    out.applyMatrix4(m);
    return out;
  });
  const merged = normalized.length === 1 ? normalized[0] : mergeGeometries(normalized, false);
  if (normalized.length > 1) for (const g of normalized) g.dispose();
  return merged ?? null;
}
