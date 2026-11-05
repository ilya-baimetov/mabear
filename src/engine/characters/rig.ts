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

/** Merge geometries that share one material (drops uv/normal mismatch by normalising attributes). */
export function mergeSame(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyColor = geoms.some((g) => !!g.getAttribute("color"));
  const prepared = geoms.map((g0) => {
    let g = g0.index ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
    }
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    if (anyColor) g = ensureColor(g);
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  if (!merged) throw new Error("mergeSame: incompatible geometries");
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Materials (series look §7.1: soft, warm, high roughness; sheen on fabric and skin; no outlines)
// ---------------------------------------------------------------------------------------------

export interface MaterialSet {
  all: THREE.Material[];
  /** register a material for opacity fades and disposal */
  add<T extends THREE.Material>(m: T): T;
}

export function materialSet(): MaterialSet {
  const all: THREE.Material[] = [];
  return {
    all,
    add<T extends THREE.Material>(m: T): T {
      all.push(m);
      return m;
    },
  };
}

export function skinMaterial(color: string, sheen: string, vertexColors = false): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : col(color),
    vertexColors,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.55,
    sheenColor: col(sheen),
    sheenRoughness: 0.45,
    emissive: col("#ff5a3c"),
    emissiveIntensity: 0.035, // faked subsurface warmth
  });
}

export function fabricMaterial(color: string, sheenColor: string, vertexColors = false): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : col(color),
    vertexColors,
    roughness: 0.88,
    metalness: 0,
    sheen: 1,
    sheenColor: col(sheenColor),
    sheenRoughness: 0.55,
  });
}

export function furMaterial(sheenColor: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
    sheen: 0.9,
    sheenColor: col(sheenColor),
    sheenRoughness: 0.75,
  });
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

  function setOpacity(o: number): void {
    if (o === lastOpacity) return;
    const transparent = o < 0.999;
    for (const m of materials.all) {
      const wasT = m.transparent;
      m.transparent = transparent || (baseOpacity.get(m) ?? 1) < 1;
      m.opacity = (baseOpacity.get(m) ?? 1) * o;
      m.depthWrite = !transparent;
      if (wasT !== m.transparent) m.needsUpdate = true;
    }
    root.visible = o > 0.001;
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
