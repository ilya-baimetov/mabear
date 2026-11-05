// Shared character rig (spec §7.3): Mixamo-named humanoid skeleton + sculpting helpers + CharacterRig runtime.
//
// CONVENTION (the motion layer depends on it):
//   - T-pose rest, the character faces +z, Y is up, the character's LEFT arm extends along +x.
//   - EVERY bone's rest LOCAL quaternion is identity; bones are placed only by position offsets.
//     So a pose quaternion in ActorFrame.bones is exactly the rotation away from rest.
//   - Body parts are meshes rigidly parented to bones (no skinning).
// The engine never imports React. This module never creates a renderer (builds fine in node).
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ActorFrame, CharacterRig } from "../api";
import type { FaceRig } from "./face";

export const MIXAMO_BONES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
] as const;
export type BoneName = (typeof MIXAMO_BONES)[number];

/** Skeleton proportions in metres (local offsets; left side given, right side mirrored on x). */
export interface SkeletonProportions {
  /** Hips joint height above the ground */
  hipsHeight: number;
  spine: number; // Hips → Spine
  spine1: number; // Spine → Spine1
  spine2: number; // Spine1 → Spine2
  neck: number; // Spine2 → Neck
  head: number; // Neck → Head (Head bone = skull base)
  /** LeftShoulder offset from Spine2 [x, y] */
  shoulder: [number, number];
  clavicle: number; // LeftShoulder → LeftArm (along +x)
  upperArm: number; // LeftArm → LeftForeArm
  foreArm: number; // LeftForeArm → LeftHand
  /** LeftUpLeg offset from Hips [x, y] (y usually slightly negative) */
  upLeg: [number, number];
  upperLeg: number; // LeftUpLeg → LeftLeg (down)
  lowerLeg: number; // LeftLeg → LeftFoot (down)
  /** LeftFoot → LeftToeBase [down, forward] */
  toe: [number, number];
}

export interface BuiltSkeleton {
  /** Hips is a child of this group; the group sits at the character root (feet on y = 0). */
  skeletonRoot: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  skeleton: THREE.Skeleton;
}

/** Local position offset of every bone relative to its parent, from the proportions. */
export function boneOffsets(p: SkeletonProportions): Record<BoneName, [number, number, number]> {
  const o: Partial<Record<BoneName, [number, number, number]>> = {
    Hips: [0, p.hipsHeight, 0],
    Spine: [0, p.spine, 0],
    Spine1: [0, p.spine1, 0],
    Spine2: [0, p.spine2, 0],
    Neck: [0, p.neck, 0],
    Head: [0, p.head, 0],
  };
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    o[`${side}Shoulder`] = [s * p.shoulder[0], p.shoulder[1], 0];
    o[`${side}Arm`] = [s * p.clavicle, 0, 0];
    o[`${side}ForeArm`] = [s * p.upperArm, 0, 0];
    o[`${side}Hand`] = [s * p.foreArm, 0, 0];
    o[`${side}UpLeg`] = [s * p.upLeg[0], p.upLeg[1], 0];
    o[`${side}Leg`] = [0, -p.upperLeg, 0];
    o[`${side}Foot`] = [0, -p.lowerLeg, 0];
    o[`${side}ToeBase`] = [0, -p.toe[0], p.toe[1]];
  }
  return o as Record<BoneName, [number, number, number]>;
}

export const BONE_PARENT: Record<BoneName, BoneName | null> = {
  Hips: null, Spine: "Hips", Spine1: "Spine", Spine2: "Spine1", Neck: "Spine2", Head: "Neck",
  LeftShoulder: "Spine2", LeftArm: "LeftShoulder", LeftForeArm: "LeftArm", LeftHand: "LeftForeArm",
  RightShoulder: "Spine2", RightArm: "RightShoulder", RightForeArm: "RightArm", RightHand: "RightForeArm",
  LeftUpLeg: "Hips", LeftLeg: "LeftUpLeg", LeftFoot: "LeftLeg", LeftToeBase: "LeftFoot",
  RightUpLeg: "Hips", RightLeg: "RightUpLeg", RightFoot: "RightLeg", RightToeBase: "RightFoot",
};

/** Build the Mixamo-named skeleton (identity rest rotations, T-pose). */
export function buildSkeleton(p: SkeletonProportions): BuiltSkeleton {
  const offsets = boneOffsets(p);
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of MIXAMO_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...offsets[name]);
    bones[name] = b;
  }
  for (const name of MIXAMO_BONES) {
    const parent = BONE_PARENT[name];
    if (parent) bones[parent].add(bones[name]);
  }
  const skeletonRoot = new THREE.Group();
  skeletonRoot.name = "skeleton";
  skeletonRoot.add(bones.Hips);
  const skeleton = new THREE.Skeleton(MIXAMO_BONES.map((n) => bones[n]));
  return { skeletonRoot, bones, skeleton };
}

// ---------------------------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------------------------

/** sRGB hex → linear THREE.Color (respects ColorManagement). */
export function col(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Write per-vertex colours from a function of the (geometry-local) vertex position. */
export function paintVertices(
  g: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, out: THREE.Color) => void,
): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    c.setRGB(1, 1, 1);
    fn(p, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Ensure a geometry has a white colour attribute (so it can merge with painted ones). */
export function ensureColor(g: THREE.BufferGeometry, c?: THREE.Color): THREE.BufferGeometry {
  if (g.getAttribute("color")) return g;
  const cc = c ?? new THREE.Color(1, 1, 1);
  return paintVertices(g, (_p, out) => out.copy(cc));
}

// ---------------------------------------------------------------------------------------------
// Sculpting helpers: deform high-segment geometry with displacement functions, smooth normals.
// ---------------------------------------------------------------------------------------------

/** Position-only, welded copy (so displaced normals are smooth across seams). */
export function welded(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.getAttribute("position").clone());
  if (g.index) out.setIndex(g.index.clone());
  g.dispose();
  return mergeVertices(out, 1e-5);
}

/**
 * A sculpted blob: every vertex of a high-detail unit icosphere (direction d) is mapped through
 * `shape(d, out)`; normals are recomputed smooth.
 */
export function blob(detail: number, shape: (d: THREE.Vector3, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const g = welded(new THREE.IcosahedronGeometry(1, detail));
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    o.copy(d);
    shape(d, o);
    pos.setXYZ(i, o.x, o.y, o.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Smooth deterministic 3D noise in [-1, 1] (sum of oriented sines; no tables, no randomness). */
export function noise3(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 1.0 + y * 1.7 + 0.3) * Math.sin(y * 1.3 - z * 0.9 + 1.1) +
      Math.sin(z * 1.9 + x * 0.6 + 2.3) * Math.sin(x * 1.1 - y * 0.8 + z * 0.4) +
      0.5 * Math.sin(x * 2.9 - z * 2.3 + y * 0.5 + 0.7)) /
    2.5
  );
}

/** Soft fur breakup: displace along the vertex normals by two octaves of noise, then re-smooth the normals. */
export function roughen(g: THREE.BufferGeometry, amp: number, freq: number, seed = 0): THREE.BufferGeometry {
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      noise3(x * freq + seed, y * freq, z * freq) * 0.7 + noise3(x * freq * 2.7, y * freq * 2.7 + seed, z * freq * 2.7) * 0.3;
    pos.setXYZ(i, x + nrm.getX(i) * amp * n, y + nrm.getY(i) * amp * n, z + nrm.getZ(i) * amp * n);
  }
  g.computeVertexNormals();
  return g;
}

/** Gaussian bump on the unit sphere around direction `c` (angular width ~ `w` radians). */
export function bump(d: THREE.Vector3, c: THREE.Vector3, w: number): number {
  const dot = Math.min(1, Math.max(-1, d.dot(c)));
  const a = Math.acos(dot);
  return Math.exp(-(a * a) / (2 * w * w));
}

export function dir(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).normalize();
}

/**
 * A limb segment along a local axis: a sculpted capsule from `a` to `b` with radius profile r(t)
 * (t = 0 at a, 1 at b), elliptical cross-section scale `sq` on the secondary axis.
 */
export function limb(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: (t: number) => number,
  opts: { sq?: number; detail?: number; up?: THREE.Vector3 } = {},
): THREE.BufferGeometry {
  const axis = b.clone().sub(a);
  const len = axis.length();
  const n = axis.clone().normalize();
  const sq = opts.sq ?? 1;
  const r0 = radius(0);
  const r1 = radius(1);
  // unit sphere → capsule: y in [-1,1] maps to t in [-r0/len, 1 + r1/len] with hemispherical caps
  const g = blob(opts.detail ?? 10, (d, out) => {
    const capT = d.y; // -1..1
    let t: number;
    let rr: number;
    const k = 0.55; // fraction of sphere used for each cap
    if (capT < -k) {
      // bottom cap (at a)
      const s = (capT + 1) / (1 - k); // 0..1
      const ang = (1 - s) * (Math.PI / 2);
      t = -Math.sin(ang) * (r0 / len);
      rr = r0 * Math.cos(ang);
    } else if (capT > k) {
      const s = (1 - capT) / (1 - k);
      const ang = (1 - s) * (Math.PI / 2);
      t = 1 + Math.sin(ang) * (r1 / len);
      rr = r1 * Math.cos(ang);
    } else {
      t = (capT + k) / (2 * k);
      rr = radius(t);
    }
    const h = Math.hypot(d.x, d.z) || 1;
    out.set((d.x / h) * rr, t * len, (d.z / h) * rr * sq);
  });
  // orient local +y to the a→b axis
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Lathe around +y from a (radius, y) profile; `ripple(phi, y)` multiplies the radius; z scaled by `sq`. */
export function lathe(
  profile: Array<[number, number]>,
  opts: { segments?: number; sq?: number; ripple?: (phi: number, y: number) => number; samples?: number } = {},
): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(opts.samples ?? 48);
  const g = welded(new THREE.LatheGeometry(pts, opts.segments ?? 48));
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const sq = opts.sq ?? 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const phi = Math.atan2(x, z);
    const m = opts.ripple ? opts.ripple(phi, y) : 1;
    pos.setXYZ(i, x * m, y, z * m * sq);
  }
  g.computeVertexNormals();
  return g;
}

const KEEP_ATTRS = new Set(["position", "normal", "color", "skinIndex", "skinWeight"]);

/** Merge geometries that share one material (drops uv/normal mismatch by normalising attributes). */
export function mergeSame(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyColor = geoms.some((g) => !!g.getAttribute("color"));
  const allIndexed = geoms.every((g) => !!g.index); // keep indices: 3× fewer vertices to shade
  const prepared = geoms.map((g0) => {
    let g = g0.index && !allIndexed ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (!KEEP_ATTRS.has(name)) g.deleteAttribute(name);
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (anyColor) g = ensureColor(g);
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) if (g !== merged) g.dispose();
  if (!merged) throw new Error("mergeSame: incompatible geometries");
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Materials (series look §7.1: soft, warm, high roughness; sheen on fabric and skin; no outlines).
// Albedos stay physically plausible (the stage adds image-based light + ACES); richness comes from sheen,
// a soft warm translucency rim on skin and a low specular on fur, not from brightened colours.
// ---------------------------------------------------------------------------------------------

export interface MaterialSet {
  all: THREE.Material[];
  /** register a material for opacity fades and disposal (made fade-stable, see `fadeStable`) */
  add<T extends THREE.Material>(m: T): T;
}

/**
 * B11: a character material is ALWAYS transparent-capable (transparent = true from the start; opacity is a uniform),
 * so an enter/exit/door fade never changes the shader program (three.js keys programs on `transparent` through the
 * OPAQUE define). At full opacity the result is identical to an opaque draw: alpha = 1 and depthWrite stays on.
 * Double-sided materials render in a single pass (three.js would otherwise split transparent double-sided draws into
 * back + front passes, doubling draw calls).
 */
export function fadeStable<T extends THREE.Material>(m: T): T {
  m.transparent = true;
  m.depthWrite = true;
  m.forceSinglePass = true;
  return m;
}

export function materialSet(): MaterialSet {
  const all: THREE.Material[] = [];
  return {
    all,
    add<T extends THREE.Material>(m: T): T {
      if (!all.includes(m)) all.push(fadeStable(m));
      return m;
    },
  };
}

/** Skin translucency fake: a warm, albedo-tinted glow that is strongest at grazing angles (light bleeding through
 *  ears, cheeks and fingers in the series' renders) plus a tiny constant warmth. */
export const SKIN_SSS = { color: "#FF6A48", base: 0.025, rim: 0.16 };

export function skinMaterial(color: string, sheen: string, vertexColors = false): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : col(color),
    vertexColors,
    roughness: 0.6,
    metalness: 0,
    specularIntensity: 0.55,
    sheen: 0.6,
    sheenColor: col(sheen),
    sheenRoughness: 0.5,
  });
  const sss = col(SKIN_SSS.color);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.sssColor = { value: sss };
    shader.uniforms.sssBase = { value: SKIN_SSS.base };
    shader.uniforms.sssRim = { value: SKIN_SSS.rim };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 sssColor;\nuniform float sssBase;\nuniform float sssRim;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float sssF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += sssColor * diffuseColor.rgb * (sssBase + sssRim * sssF * sssF);
}`,
      );
  };
  m.customProgramCacheKey = () => "mabear-skin-v2";
  return m;
}

export function fabricMaterial(color: string, sheenColor: string, vertexColors = false): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : col(color),
    vertexColors,
    roughness: 0.86,
    metalness: 0,
    specularIntensity: 0.35, // cotton: almost no specular, the sheen lobe carries the soft highlight
    sheen: 1.0,
    sheenColor: col(sheenColor),
    sheenRoughness: 0.6,
  });
}

/**
 * Eyes (sclera + iris + pupil + highlights) and other small glossy parts (noses, shoes) in ONE vertex-coloured material.
 * The emissive is masked by the vertex colour squared: white sclera glows a little (reads clean white in shade),
 * dark iris/pupil/nose do not, and highlight discs painted with colour > 1 read as pure white sparkles.
 */
export const EYE_GLOW = 0.2;
export const HIGHLIGHT_VALUE = 4;

export function eyeMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: EYE_GLOW,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb * vColor.rgb;",
    );
  };
  m.customProgramCacheKey = () => "mabear-eye-v1";
  return m;
}

/**
 * Fur: soft sheen plus a procedural strand texture in the fragment shader (spec §7.1 "soft normal-mapped noise"):
 * fine anisotropic value flecks and a derivative-based bump from the same noise, in mesh-local (rest) space so it
 * sticks to the body. It fades out when a strand gets smaller than a pixel (no sparkle in wide shots). Low specular
 * and a soft albedo-tinted fuzz at grazing angles keep it from reading as plastic. No UVs or textures needed.
 */
export const FUR_STRANDS = { freq: 90, stretch: 0.35, value: 0.07, bump: 0.0014, fuzz: 0.1 };

export function furMaterial(sheenColor: string): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    specularIntensity: 0.25,
    sheen: 1.0,
    sheenColor: col(sheenColor),
    sheenRoughness: 0.62,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.furFreq = { value: FUR_STRANDS.freq };
    shader.uniforms.furStretch = { value: FUR_STRANDS.stretch };
    shader.uniforms.furValue = { value: FUR_STRANDS.value };
    shader.uniforms.furBump = { value: FUR_STRANDS.bump };
    shader.uniforms.furFuzz = { value: FUR_STRANDS.fuzz };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFurPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFurPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vFurPos;
uniform float furFreq;
uniform float furStretch;
uniform float furValue;
uniform float furBump;
uniform float furFuzz;
float furHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float furNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(furHash(i + vec3(0, 0, 0)), furHash(i + vec3(1, 0, 0)), f.x),
                 mix(furHash(i + vec3(0, 1, 0)), furHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(furHash(i + vec3(0, 0, 1)), furHash(i + vec3(1, 0, 1)), f.x),
                 mix(furHash(i + vec3(0, 1, 1)), furHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 furP = vFurPos * furFreq * vec3(1.0, furStretch, 1.0);
float furH = furNoise(furP) * 0.65 + furNoise(furP * 2.3 + 7.1) * 0.35;
float furFoot = length(fwidth(furP));
float furFade = 1.0 - smoothstep(0.35, 0.9, furFoot);
diffuseColor.rgb *= 1.0 + furValue * furFade * (furH - 0.5) * 2.0;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  vec2 dH = vec2(dFdx(furH), dFdy(furH)) * furBump * furFade;
  vec3 sX = dFdx(-vViewPosition);
  vec3 sY = dFdy(-vViewPosition);
  vec3 r1 = cross(sY, normal);
  vec3 r2 = cross(normal, sX);
  float det = dot(sX, r1) * faceDirection;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float fz = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += diffuseColor.rgb * furFuzz * fz * fz * fz;
}`,
      );
  };
  m.customProgramCacheKey = () => "mabear-fur-v2";
  return m;
}

// ---------------------------------------------------------------------------------------------
// Skinned body builder: every body part (authored in its bone's local space) is merged PER MATERIAL into one
// SkinnedMesh bound to the character's bones. Rigid parts get weight 1 on their bone (looks exactly like rigid
// parenting); sculpted continuous parts (torso, whole arms, whole legs, tails) get smooth weights across joints, so
// elbows, knees and the waist bend without seams or creases. Result: a handful of draw calls per character.
// ---------------------------------------------------------------------------------------------

export type Weights = Array<[THREE.Object3D, number]>;

export interface SkinPart {
  /** geometry in `bone`-local space (rest pose) */
  geom: THREE.BufferGeometry;
  bone: THREE.Object3D;
  material: THREE.Material;
  /** casts shadows (default true); parts with different flags land in different meshes */
  shadow?: boolean;
  /** smooth weights from the REST position in character space (default: rigid on `bone`) */
  weights?: (p: THREE.Vector3, n: THREE.Vector3) => Weights;
}

/** Keep the 4 largest influences and normalise them. */
export function normWeights(w: Weights): Weights {
  const merged = new Map<THREE.Object3D, number>();
  for (const [b, v] of w) if (v > 1e-4) merged.set(b, (merged.get(b) ?? 0) + v);
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
  return top.map(([b, v]) => [b, v / sum]);
}

/** Weights that blend from bone `a` to bone `b` as `x` goes from `x0` to `x1` (smoothstep). */
export function blend2(a: THREE.Object3D, b: THREE.Object3D, x: number, x0: number, x1: number): Weights {
  const t = smoothstep(x0, x1, x);
  return [
    [a, 1 - t],
    [b, t],
  ];
}

export interface SkinnedBody {
  meshes: THREE.SkinnedMesh[];
  skeleton: THREE.Skeleton;
  bones: THREE.Object3D[];
}

/**
 * Merge parts per (material, shadow) into SkinnedMeshes added to `root`. Call once, with the skeleton in rest pose and
 * all bones (including extra secondary bones) already parented under `root`.
 */
export function skinBody(root: THREE.Object3D, parts: SkinPart[]): SkinnedBody {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const boneIdx = new Map<THREE.Object3D, number>();
  const bones: THREE.Object3D[] = [];
  const idxOf = (b: THREE.Object3D): number => {
    let i = boneIdx.get(b);
    if (i === undefined) {
      i = bones.length;
      bones.push(b);
      boneIdx.set(b, i);
    }
    return i;
  };
  const groups = new Map<string, { material: THREE.Material; shadow: boolean; geoms: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geom;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    m4.multiplyMatrices(rootInv, part.bone.matrixWorld);
    g.applyMatrix4(m4);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const si = new Uint16Array(pos.count * 4);
    const sw = new Float32Array(pos.count * 4);
    const rigid = idxOf(part.bone);
    for (let i = 0; i < pos.count; i++) {
      if (!part.weights) {
        si[i * 4] = rigid;
        sw[i * 4] = 1;
        continue;
      }
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nrm, i);
      const w = normWeights(part.weights(p, n));
      if (w.length === 0) {
        si[i * 4] = rigid;
        sw[i * 4] = 1;
        continue;
      }
      for (let k = 0; k < w.length; k++) {
        si[i * 4 + k] = idxOf(w[k][0]);
        sw[i * 4 + k] = w[k][1];
      }
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    const shadow = part.shadow ?? true;
    const key = `${part.material.uuid}|${shadow}`;
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { material: part.material, shadow, geoms: [] }));
    grp.geoms.push(g);
  }
  // inverse bind matrices relative to the character root (rest pose)
  const inverses = bones.map((b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[], inverses);
  const meshes: THREE.SkinnedMesh[] = [];
  for (const grp of groups.values()) {
    const merged = mergeSame(grp.geoms);
    merged.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(merged, grp.material);
    mesh.name = `body:${grp.material.name || grp.material.type}${grp.shadow ? "" : ":noshadow"}`;
    mesh.castShadow = grp.shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, new THREE.Matrix4());
    // generous fixed culling sphere (poses stay within it; avoids a per-frame skinned recompute)
    const s = merged.boundingSphere!.clone();
    s.radius = s.radius * 1.35 + 0.1;
    mesh.boundingSphere = s;
    meshes.push(mesh);
  }
  return { meshes, skeleton, bones };
}

/** Smooth radius profile through (t, r) knots (Catmull-Rom on sorted t; clamped at the ends). */
export function profile(knots: Array<[number, number]>): (t: number) => number {
  const k = knots.slice().sort((a, b) => a[0] - b[0]);
  return (t: number): number => {
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1][0]) i++;
    const [t1, p1] = k[i];
    const [t2, p2] = k[i + 1];
    const p0 = i > 0 ? k[i - 1][1] : p1;
    const p3 = i + 2 < k.length ? k[i + 2][1] : p2;
    const u = (t - t1) / (t2 - t1);
    const u2 = u * u;
    const u3 = u2 * u;
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
}

/** Move a geometry authored in character (rest-world) space into `bone`-local space. */
export function toLocal(g: THREE.BufferGeometry, bone: THREE.Object3D): THREE.BufferGeometry {
  bone.updateWorldMatrix(true, false);
  g.applyMatrix4(bone.matrixWorld.clone().invert());
  return g;
}

/** Ray-cast a star-shaped implicit surface (sdf < 0 inside) from `centre` along every direction of a detailed
 *  icosphere: one smooth, welded, crease-free mesh for soft unions of ellipsoids. */
export function sdfBlob(
  detail: number,
  centre: THREE.Vector3,
  sdf: (p: THREE.Vector3) => number,
  maxR: number,
  post?: (d: THREE.Vector3, out: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const pt = new THREE.Vector3();
  return blob(detail, (d, out) => {
    let lo = 0;
    let hi = maxR;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (sdf(pt.copy(d).multiplyScalar(mid).add(centre)) < 0) lo = mid;
      else hi = mid;
    }
    out.copy(d).multiplyScalar((lo + hi) / 2).add(centre);
    post?.(d, out);
  });
}

/** Front-surface depth z(x, y) of a mesh, ray-cast along -z on a grid over [x0,x1]×[y0,y1] (bilinear between
 *  samples): an exact face surface for features projected onto irregular sculpts (e.g. a tapered snout). */
export function frontSurface(
  g: THREE.BufferGeometry,
  region: { x0: number; x1: number; y0: number; y1: number },
  cell = 0.002,
): (x: number, y: number) => number {
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  g.computeBoundingBox();
  const zTop = g.boundingBox!.max.z + 1;
  const zMin = g.boundingBox!.min.z;
  const nx = Math.max(2, Math.ceil((region.x1 - region.x0) / cell) + 1);
  const ny = Math.max(2, Math.ceil((region.y1 - region.y0) / cell) + 1);
  const zs = new Float32Array(nx * ny);
  const rc = new THREE.Raycaster();
  const o = new THREE.Vector3();
  const dn = new THREE.Vector3(0, 0, -1);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      o.set(region.x0 + ix * cell, region.y0 + iy * cell, zTop);
      rc.set(o, dn);
      const hit = rc.intersectObject(mesh, false)[0];
      zs[iy * nx + ix] = hit ? hit.point.z : zMin;
    }
  }
  (mesh.material as THREE.Material).dispose();
  const at = (ix: number, iy: number) => zs[Math.min(ny - 1, Math.max(0, iy)) * nx + Math.min(nx - 1, Math.max(0, ix))];
  return (x: number, y: number): number => {
    const fx = (x - region.x0) / cell;
    const fy = (y - region.y0) / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = Math.min(1, Math.max(0, fx - ix));
    const ty = Math.min(1, Math.max(0, fy - iy));
    return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
  };
}

/** Approximate signed distance to an ellipsoid (centre c, radii r). */
export function sdEllipsoid(p: THREE.Vector3, c: THREE.Vector3, r: THREE.Vector3): number {
  const x = p.x - c.x;
  const y = p.y - c.y;
  const z = p.z - c.z;
  const k0 = Math.hypot(x / r.x, y / r.y, z / r.z);
  const k1 = Math.hypot(x / (r.x * r.x), y / (r.y * r.y), z / (r.z * r.z));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r.x, r.y, r.z);
}

/** Polynomial smooth minimum (blend radius k). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** An extra (non-Mixamo) bone for secondary motion or scaling, parented under `parent` at a local position. */
export function extraBone(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

// ---------------------------------------------------------------------------------------------
// Runtime rig
// ---------------------------------------------------------------------------------------------

export interface SecondaryHooks {
  /** called every apply() after bones are posed; `phase` is a deterministic oscillator input */
  update(frame: ActorFrame, phase: number): void;
}

export interface RigParts {
  id: string;
  root: THREE.Group;
  built: BuiltSkeleton;
  height: number;
  face: FaceRig;
  /** chest group (child of Spine2) scaled for breathing */
  chest: THREE.Object3D | null;
  materials: MaterialSet;
  geometries: THREE.BufferGeometry[];
  secondary: SecondaryHooks;
  /** hand socket offset in RightHand local space */
  socketOffset: THREE.Vector3;
  /** skinned body (its skeleton's bone texture is disposed with the rig) */
  body?: SkinnedBody;
}

const IDENTITY_Q = new THREE.Quaternion();

/** Deterministic oscillator phase from the frame itself (rendering must not depend on wall-clock). */
export function secondaryPhase(frame: ActorFrame): number {
  const [x, , z] = frame.pos;
  return (x * 1.9 + z * 2.3) * Math.PI + frame.hipsOffset[1] * 40 + frame.secondary.breathe * Math.PI * 2;
}

/** Wrap built parts into the CharacterRig contract (src/engine/api.ts). */
export function makeRig(parts: RigParts): CharacterRig {
  const { root, built, face, chest, materials, geometries } = parts;
  const bones = built.bones as Record<string, THREE.Bone>;
  const rest: Record<string, THREE.Quaternion> = {};
  for (const n of MIXAMO_BONES) rest[n] = new THREE.Quaternion();
  const hipsRest = built.bones.Hips.position.clone();

  const handSocket = new THREE.Object3D();
  handSocket.name = "handSocket";
  handSocket.position.copy(parts.socketOffset);
  built.bones.RightHand.add(handSocket);

  const baseOpacity = new Map<THREE.Material, number>();
  for (const m of materials.all) baseOpacity.set(m, m.opacity);
  let lastOpacity = 1;
  const tmp = new THREE.Quaternion();

  // B11: materials are fade-stable (transparent from construction, see `fadeStable`): a fade only changes the
  // opacity uniform and the depthWrite state, never `transparent`/`needsUpdate`, so no shader program compiles.
  function setOpacity(o: number): void {
    root.visible = o > 0.001;
    if (o === lastOpacity) return;
    const fading = o < 0.999;
    for (const m of materials.all) {
      m.opacity = (baseOpacity.get(m) ?? 1) * o;
      m.depthWrite = !fading;
    }
    lastOpacity = o;
  }

  return {
    id: parts.id,
    root,
    bones,
    rest,
    height: parts.height,
    handSocket,
    apply(frame: ActorFrame): void {
      root.position.set(frame.pos[0], frame.pos[1], frame.pos[2]);
      root.rotation.set(0, frame.yaw, 0);
      for (const n of MIXAMO_BONES) {
        const q = frame.bones[n];
        if (q) bones[n].quaternion.set(q[0], q[1], q[2], q[3]).normalize();
        else bones[n].quaternion.copy(IDENTITY_Q);
      }
      const h = frame.hipsOffset;
      built.bones.Hips.position.set(hipsRest.x + h[0], hipsRest.y + h[1], hipsRest.z + h[2]);
      // breathing on the chest bone: tiny extra lift on top of the pose + chest volume
      const br = frame.secondary.breathe;
      tmp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.012 * (br - 0.5));
      built.bones.Spine2.quaternion.multiply(tmp);
      if (chest) {
        const s = 1 + 0.022 * (br - 0.5);
        chest.scale.set(1 + 0.4 * (s - 1), s, s);
      }
      parts.secondary.update(frame, secondaryPhase(frame));
      setOpacity(Math.min(1, Math.max(0, frame.opacity)));
      root.updateMatrixWorld(true);
      face.update(frame.face, frame.posture === "sleep");
    },
    dispose(): void {
      for (const g of geometries) g.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const m of materials.all) m.dispose();
      parts.body?.skeleton.dispose();
      face.dispose();
      root.removeFromParent();
    },
  };
}

/** Add a mesh to a bone (shadow flags set for body parts). */
export function attach(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  shadows = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  parent.add(m);
  return m;
}

/** World-space rest position of a bone (skeleton must be in rest pose). */
export function restWorld(bone: THREE.Bone): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
}

/** A neutral frame: rest pose, standing at the origin, facing +z. Handy for tools and tests. */
export function restFrame(overrides: Partial<ActorFrame> = {}): ActorFrame {
  return {
    pos: [0, 0, 0],
    yaw: 0,
    opacity: 1,
    bones: {},
    hipsOffset: [0, 0, 0],
    face: { emotion: "neutral", lidClose: 0, viseme: "rest", visemeWeight: 0, lookAt: null, browRaise: 0 },
    holding: null,
    posture: "stand",
    verb: "idle",
    secondary: { sway: 0, jiggle: 0, breathe: 0.5 },
    ...overrides,
  };
}
