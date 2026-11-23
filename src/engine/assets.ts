// Asset manifest (spec §7.3): every character, set element and prop resolves through one entry.
// Replacing a procedural stand-in with an official Animaccord glTF export needs ONLY a manifest change
// (`source: { gltf: url }`, plus `skeletonMap` when the official rig doesn't use Mixamo bone names).
// The `robot_test` entry is a working glTF example (three.js RobotExpressive.glb, CC0) loaded as a hidden character.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {openHouseAperture} from './set/houseDoor';
import { ACTOR_IDS, PROP_IDS, CARROT_IDS, type Vec3, type ActorId } from "../shared/schema";
import type { ActorFrame, CharacterRig } from "./api";
import { SET_ELEMENT_IDS, SET_ELEMENTS, type SetElementId } from "../shared/yardLayout";

export type AssetKind = "character" | "set" | "prop";
export type AssetSource = "procedural" | { gltf: string };

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  source: AssetSource;
  /** Mixamo bone name → bone name in the source rig (glTF characters whose rig uses other names) */
  skeletonMap?: Record<string, string>;
  generated?: boolean;
  /** uniform scale applied to the loaded asset (after `height` normalization, if any) */
  scale: number;
  /** local offset [x, y, z] (pivot correction of an exported asset) */
  offset: Vec3;
  /** glTF characters: normalize the model to this height (m) before `scale` */
  height?: number;
  /** loaded but not shown (test entries) */
  hidden?: boolean;
  /** what this stands in for (honesty label, shown in the behind-the-scenes overlay) */
  label: string;
}

export const TEST_GLTF_ID = "robot_test";
/** Path relative to the site root (files live in public/). */
export const TEST_GLTF_URL = "assets/models/RobotExpressive.glb";

/** RobotExpressive bone names (GLTFLoader strips '.') mapped from Mixamo names. */
export const ROBOT_SKELETON_MAP: Record<string, string> = {
  Hips: "Hips", Spine: "Abdomen", Spine1: "Torso", Neck: "Neck", Head: "Head",
  LeftShoulder: "ShoulderL", LeftArm: "UpperArmL", LeftForeArm: "LowerArmL", LeftHand: "Palm2L",
  RightShoulder: "ShoulderR", RightArm: "UpperArmR", RightForeArm: "LowerArmR", RightHand: "Palm2R",
  LeftUpLeg: "UpperLegL", LeftLeg: "LowerLegL", LeftFoot: "FootL",
  RightUpLeg: "UpperLegR", RightLeg: "LowerLegR", RightFoot: "FootR",
};

const CHARACTER_LABELS: Record<string, string> = {
  masha: "Masha — procedural stand-in for the production character rig",
  bear: "Bear — procedural stand-in for the production character rig",
  wolf_a: "Wolf — procedural stand-in for the production character rig",
  wolf_b: "Wolf — procedural stand-in for the production character rig",
};

/** Height of each character (m): used for generated glTF normalization and last-resort stand-in capsules. */
const CHARACTER_HEIGHTS: Record<string, number> = { masha: 1.0, bear: 2.4, wolf_a: 2.05, wolf_b: 1.93, lady_bear: 2.15, hare: .85, rosie: 1.05, squirrel: .65, rival_bear: 2.55 };
const GENERATED_CHARACTER_IDS: readonly ActorId[] = ["masha", "bear", "lady_bear", "hare", "rosie", "squirrel", "rival_bear"];
const CHARACTER_TINTS: Record<string, number> = { masha: 0xc7317d, bear: 0x7a4a2b, wolf_a: 0x7c8288, wolf_b: 0x76716c, lady_bear: 0x976539, hare: 0xb9b7b2, rosie: 0xeeb7ad, squirrel: 0xa45225, rival_bear: 0x282421 };

function buildManifest(): Record<string, AssetEntry> {
  const m: Record<string, AssetEntry> = {};
  const put = (e: AssetEntry) => {
    if (m[e.id]) throw new Error(`duplicate asset id ${e.id}`);
    m[e.id] = e;
  };
  for (const id of ACTOR_IDS) put({ id, kind: "character", source: "procedural", scale: 1, offset: [0, 0, 0], label: CHARACTER_LABELS[id] ?? id });
  for (const id of GENERATED_CHARACTER_IDS) {
    m[id] = { id, kind: "character", source: { gltf: `assets/generated/${id}.glb` }, generated: true, height: CHARACTER_HEIGHTS[id], scale: 1, offset: [0, 0, 0], label: `${id} — generated textured character with adapted skeletal animation` };
  }
  put({
    id: TEST_GLTF_ID, kind: "character", source: { gltf: TEST_GLTF_URL }, skeletonMap: ROBOT_SKELETON_MAP,
    scale: 1, offset: [0, 0, 0], height: 1.6, hidden: true,
    label: "glTF path proof: three.js RobotExpressive (CC0), hidden test character",
  });
  for (const id of SET_ELEMENT_IDS) {
    put({ id: `set:${id}`, kind: "set", source: "procedural", scale: 1, offset: [0, 0, 0], label: `${SET_ELEMENTS[id].description} — procedural stand-in` });
  }
  for (const id of PROP_IDS) put({ id: `prop:${id}`, kind: "prop", source: "procedural", scale: 1, offset: [0, 0, 0], label: `${id} — procedural stand-in` });
  m['set:house'] = {id:'set:house',kind:'set',source:{gltf:'assets/generated/treehouse.glb'},height:10.8,scale:1,offset:[-.85,0,-1.6],label:'Bear’s hollow tree-house'};
  m['set:beehive'] = {id:'set:beehive',kind:'set',source:{gltf:'assets/generated/beehive.glb'},height:1.45,scale:1,offset:[0,0,0],label:'Painted wooden beehive'};
  for(const id of CARROT_IDS)m[`prop:${id}`]={id:`prop:${id}`,kind:'prop',source:{gltf:'assets/generated/carrot.glb'},height:.48,scale:1,offset:[0,0,0],label:`Garden carrot ${CARROT_IDS.indexOf(id)+1}`};
  return m;
}

/** The manifest. Keys: actor ids, "robot_test", "set:<element>", "prop:<propId>". */
export const ASSET_MANIFEST: Record<string, AssetEntry> = buildManifest();

export function manifestEntry(id: string, manifest: Record<string, AssetEntry> = ASSET_MANIFEST): AssetEntry | undefined {
  return manifest[id];
}

export function isGltf(src: AssetSource): src is { gltf: string } {
  return typeof src === "object" && src !== null && typeof src.gltf === "string";
}

/** Set elements whose manifest entry points at a glTF (they are not built procedurally). */
export function gltfSetElements(manifest: Record<string, AssetEntry> = ASSET_MANIFEST): SetElementId[] {
  return SET_ELEMENT_IDS.filter((id) => {
    const e = manifest[`set:${id}`];
    return !!e && isGltf(e.source);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------------------

export interface AssetStatus {
  id: string;
  source: "procedural" | "gltf";
  ok: boolean;
  error?: string;
}
const status = new Map<string, AssetStatus>();
/** Load status of every asset resolved so far (debug / behind-the-scenes). */
export function assetStatus(): AssetStatus[] {
  return [...status.values()];
}

function resolveUrl(url: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(url)) return url;
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return base.replace(/\/?$/, "/") + url;
}

let gltfLoaderPromise: Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader> | null = null;
async function getGltfLoader() {
  if (!gltfLoaderPromise) {
    gltfLoaderPromise = Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder))
      .catch((err) => {
        gltfLoaderPromise = null;
        throw err;
      });
  }
  return gltfLoaderPromise;
}

function disposeObjectResources(root: THREE.Object3D, extraMats?: readonly THREE.Material[]): void {
  const mats = new Set<THREE.Material>(extraMats);
  const texs = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const skinned = o as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton && !skeletons.has(skinned.skeleton)) {
      skeletons.add(skinned.skeleton);
      skinned.skeleton.dispose();
    }
    if (mesh.material) {
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mats.add(m);
    }
  });
  for (const m of mats) {
    const std = m as THREE.MeshStandardMaterial;
    for (const tex of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.emissiveMap, std.aoMap]) {
      if (tex) texs.add(tex);
    }
    m.dispose();
  }
  for (const tex of texs) tex.dispose();
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** Load a glTF/GLB (reusing a single module-level GLTFLoader configured with MeshoptDecoder). */
export async function loadGltf(
  url: string,
  signal?: AbortSignal,
): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  if (signal?.aborted) throw abortError(signal);
  const loader = await getGltfLoader();
  if (signal?.aborted) throw abortError(signal);
  const loadPromise = loader.loadAsync(resolveUrl(url));
  if (!signal) {
    const gltf = await loadPromise;
    return { scene: gltf.scene, animations: gltf.animations };
  }
  return new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    loadPromise.then(
      (gltf) => {
        signal.removeEventListener("abort", onAbort);
        if (settled || signal.aborted) {
          disposeObjectResources(gltf.scene);
          if (!settled) {
            settled = true;
            reject(abortError(signal));
          }
          return;
        }
        settled = true;
        resolve({ scene: gltf.scene, animations: gltf.animations });
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        if (!settled) {
          settled = true;
          reject(err);
        }
      },
    );
  });
}

/** Resolve a character through the manifest: procedural builder or glTF. Never throws (falls back to a capsule). */
export async function loadCharacter(id: string, manifest: Record<string, AssetEntry> = ASSET_MANIFEST): Promise<CharacterRig> {
  const entry = manifest[id];
  try {
    if (!entry) throw new Error(`no manifest entry for ${id}`);
    let rig: CharacterRig;
    if (isGltf(entry.source)) {
      const g = await loadGltf(entry.source.gltf);
      rig = entry.generated
        ? (await import("./characters/generated")).generatedRig(id as ActorId, g.scene, {height:entry.height??1,mashaPerformance:id==='masha',animalPerformance:id!=='masha'})
        : gltfRig(id, g.scene, entry);
    } else if (id === "masha") {
      rig = (await import("./characters/masha")).buildMasha();
    } else if (id === "bear") {
      rig = (await import("./characters/bear")).buildBear();
    } else if (id === "wolf_a" || id === "wolf_b") {
      rig = (await import("./characters/wolf")).buildWolf(id === "wolf_a" ? "a" : "b");
    } else {
      throw new Error(`no procedural builder for ${id}`);
    }
    if (!isGltf(entry.source) && (entry.scale !== 1 || entry.offset.some((v) => v !== 0))) {
      // wrap so apply() (which positions rig.root) keeps the manifest correction
      const inner = rig.root.children.slice();
      const wrap = new THREE.Group();
      wrap.scale.setScalar(entry.scale);
      wrap.position.set(...entry.offset);
      for (const c of inner) wrap.add(c);
      rig.root.add(wrap);
    }
    if(id!=='masha'&&(entry.generated||id==='wolf_a'||id==='wolf_b')){
      (await import('./characters/sourceContacts')).addSourceContacts(rig);
    }
    if (entry.hidden) rig.root.visible = false;
    rig.root.userData.asset = { id, source: isGltf(entry.source) ? "gltf" : "procedural", label: entry.label };
    status.set(id, { id, source: isGltf(entry.source) ? "gltf" : "procedural", ok: true });
    return rig;
  } catch (err) {
    status.set(id, { id, source: entry && isGltf(entry.source) ? "gltf" : "procedural", ok: false, error: String(err) });
    const rig = standInRig(id, CHARACTER_HEIGHTS[id] ?? 1.0, CHARACTER_TINTS[id] ?? 0xc7317d);
    if (entry?.hidden) rig.root.visible = false;
    return rig;
  }
}

function addHouseNightGlow(house: THREE.Group): void {
  const parts: THREE.BufferGeometry[] = [];
  const addPart = (g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    const nonIdx = g.index ? g.toNonIndexed() : g;
    if (nonIdx !== g) g.dispose();
    parts.push(nonIdx);
  };
  // Front right 4-pane window glass aligned inside treehouse.glb's recessed wooden panes.
  for (const px of [0.83, 1.08]) {
    addPart(new THREE.BoxGeometry(0.17, 0.18, 0.015), px, 2.14, 0.945);
    addPart(new THREE.BoxGeometry(0.17, 0.18, 0.015), px, 1.90, 0.962);
  }
  // Left shed window glass on the recessed shed wall (behind the front bough).
  addPart(new THREE.BoxGeometry(0.36, 0.22, 0.015), -4.05, 2.72, -0.37);
  // Porch lantern bulb tucked inside the red conical shade above the front door.
  addPart(new THREE.SphereGeometry(0.085, 10, 8), -0.58, 3.44, 1.54, 0, 1, 1.3, 1);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) return;

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: new THREE.Color(0xff9d3b),
    emissiveIntensity: 0,
    roughness: 0.2,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  glowMat.userData.generated = true;
  const mesh = new THREE.Mesh(merged, glowMat);
  mesh.name = "set:house:night_glow";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  house.add(mesh);
  house.userData.glowMaterials = [glowMat];
  house.userData.glowMesh = mesh;
}

/** Load glTF replacements of set elements into their named anchors (non-blocking for the caller). */
export async function loadSetOverrides(anchors: Record<SetElementId, THREE.Group>, manifest: Record<string, AssetEntry> = ASSET_MANIFEST, isDisposed:()=>boolean=()=>false): Promise<void> {
  await Promise.all(
    gltfSetElements(manifest).map(async (id) => {
      const e = manifest[`set:${id}`]!;
      try {
        const g = await loadGltf((e.source as { gltf: string }).gltf);
        const normalized = normalizeStatic(g.scene,e.height,e.scale,e.offset);
        if(isDisposed()){disposeGenerated(normalized);return;}
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        for(const child of [...anchors[id].children]) if(child.name !== 'set:bees' && child.name !== 'set:chimney_smoke') { anchors[id].remove(child); child.traverse(o=>(o as THREE.Mesh).geometry?.dispose()); }
        anchors[id].add(normalized);
        if(id==='house'){
          openHouseAperture(normalized);
          const smoke = anchors[id].getObjectByName('set:chimney_smoke');
          if (smoke) smoke.position.set(-1.05, 10.65, -2.6);
          addHouseNightGlow(anchors[id]);
        }
        status.set(e.id, { id: e.id, source: "gltf", ok: true });
      } catch (err) {
        status.set(e.id, { id: e.id, source: "gltf", ok: false, error: String(err) });
      }
    }),
  );
}

/** Swap glTF-sourced props into their holders (procedural mesh stays if loading fails). */
export async function loadPropOverrides(holders: Record<string, THREE.Object3D>, manifest: Record<string, AssetEntry> = ASSET_MANIFEST,isDisposed:()=>boolean=()=>false): Promise<void> {
  // Each prop keeps its own transform, while repeated static models share the
  // decoded geometry/materials/textures. Scope this cache to one stage lifetime.
  const sources=new Map<string,ReturnType<typeof loadGltf>>();
  const discarded=new Set<THREE.Group>();
  await Promise.all(
    PROP_IDS.map(async (pid) => {
      const e = manifest[`prop:${pid}`];
      if (!e || !isGltf(e.source) || !holders[pid]) return;
      try {
        let source=sources.get(e.source.gltf);
        if(!source){source=loadGltf(e.source.gltf);sources.set(e.source.gltf,source);}
        const g = await source;
        const normalized = normalizeStatic(g.scene.clone(true),e.height,e.scale,e.offset);
        if(isDisposed()){
          if(!discarded.has(g.scene)){disposeGenerated(normalized);discarded.add(g.scene);}
          return;
        }
        const h = holders[pid];
        h.traverse(o=>(o as THREE.Mesh).geometry?.dispose());h.clear();
        h.add(normalized);
        status.set(e.id, { id: e.id, source: "gltf", ok: true });
      } catch (err) {
        status.set(e.id, { id: e.id, source: "gltf", ok: false, error: String(err) });
      }
    }),
  );
}

/** Static models have arbitrary export pivots; place their ground centre at the authored anchor. */
export function normalizeStatic(model:THREE.Object3D,height?:number,scale=1,offset:Vec3=[0,0,0]):THREE.Group {
  model.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(model,true),s=scale*(height?height/Math.max(.001,b.max.y-b.min.y):1);
  const inner=new THREE.Group();inner.add(model);inner.scale.setScalar(s);
  inner.position.set(-(b.min.x+b.max.x)*s/2,-b.min.y*s,-(b.min.z+b.max.z)*s/2);
  const root=new THREE.Group();root.add(inner);root.position.fromArray(offset);
  model.traverse(o=>{
    if((o as THREE.Mesh).isMesh){
      o.castShadow=true;o.receiveShadow=true;
      const m=o as THREE.Mesh;
      for(const material of Array.isArray(m.material)?m.material:[m.material]){
        const mat=material as THREE.MeshStandardMaterial;
        mat.userData.generated=true;
        mat.roughness=Math.max(.75,mat.roughness);
        mat.metalness=0;
        mat.normalScale?.setScalar(.55);
        for(const tex of [mat.map,mat.normalMap,mat.roughnessMap,mat.metalnessMap,mat.emissiveMap]){
          if(tex) tex.anisotropy = Math.max(tex.anisotropy ?? 1, 4);
        }
      }
    }
  });
  return root;
}

/** Dispose only imported resources; procedural meshes share the stage's look materials. */
export function disposeGenerated(root:THREE.Object3D):void {
  const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.userData.generated){materials.add(m);mesh.geometry.dispose();}});
  for(const m of materials){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}
  for(const texture of textures)texture.dispose();
}

const _q = new THREE.Quaternion();

/** Wrap a loaded glTF scene as a CharacterRig, exposing Mixamo-named bones through the manifest's skeletonMap. */
export function gltfRig(id: string, model: THREE.Object3D, entry: AssetEntry): CharacterRig {
  const root = new THREE.Group();
  root.name = `character:${id}`;
  const holder = new THREE.Group();
  holder.add(model);
  root.add(holder);
  // normalize height
  const bb = new THREE.Box3().setFromObject(model);
  const h0 = Math.max(1e-3, bb.max.y - bb.min.y);
  const s = (entry.height ? entry.height / h0 : 1) * entry.scale;
  holder.scale.setScalar(s);
  holder.position.set(entry.offset[0], entry.offset[1] - bb.min.y * s, entry.offset[2]);
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const byName = new Map<string, THREE.Bone>();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone && !byName.has(o.name)) byName.set(o.name, o as THREE.Bone);
  });
  const bones: Record<string, THREE.Bone> = {};
  const rest: Record<string, THREE.Quaternion> = {};
  const map = entry.skeletonMap ?? {};
  for (const [mix, src] of Object.entries(map)) {
    const b = byName.get(src) ?? byName.get(src.replace(/\./g, ""));
    if (b) bones[mix] = b;
  }
  for (const [name, b] of byName) if (!bones[name] && /^(Hips|Spine|Neck|Head|Left|Right)/.test(name)) bones[name] = b; // Mixamo-named rigs map 1:1
  for (const [name, b] of Object.entries(bones)) rest[name] = b.quaternion.clone();
  const handSocket = new THREE.Object3D();
  handSocket.name = "handSocket";
  (bones.RightHand ?? root).add(handSocket);
  const mats: THREE.Material[] = [];
  model.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) mats.push(...(Array.isArray(m) ? m : [m]));
  });
  return {
    id,
    root,
    bones,
    rest,
    height: entry.height ?? h0 * s,
    handSocket,
    apply(frame: ActorFrame) {
      root.position.set(frame.pos[0], frame.pos[1], frame.pos[2]);
      root.rotation.set(0, frame.yaw, 0);
      for (const [name, b] of Object.entries(bones)) {
        const q = frame.bones[name];
        // the source rest pose is not a T-pose: apply the frame rotation relative to the rest
        if (q) b.quaternion.copy(rest[name]).multiply(_q.set(q[0], q[1], q[2], q[3]).normalize());
        else b.quaternion.copy(rest[name]);
      }
      root.updateMatrixWorld(true);
    },
    dispose() {
      disposeObjectResources(model, mats);
    },
  };
}

/** Last-resort capsule stand-in (only used when a builder or a download fails). */
export function standInRig(id: string, height: number, color: number): CharacterRig {
  const root = new THREE.Group();
  root.name = `character:${id}:capsule`;
  // fade-stable (B11): transparent from the start, so a fade never recompiles the program
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(height * 0.22, height * 0.5, 6, 12), mat);
  body.position.y = height * 0.47;
  body.castShadow = true;
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.y = height * 0.45;
  const hand = new THREE.Bone();
  hand.name = "RightHand";
  hand.position.set(-height * 0.25, height * 0.05, height * 0.1);
  hips.add(hand);
  root.add(body, hips);
  const handSocket = new THREE.Object3D();
  hand.add(handSocket);
  return {
    id,
    root,
    bones: { Hips: hips, RightHand: hand },
    rest: { Hips: new THREE.Quaternion(), RightHand: new THREE.Quaternion() },
    height,
    handSocket,
    apply(frame) {
      root.position.set(frame.pos[0], frame.pos[1], frame.pos[2]);
      root.rotation.set(0, frame.yaw, 0);
      mat.opacity = frame.opacity;
      mat.depthWrite = frame.opacity >= 0.999;
      root.updateMatrixWorld(true);
    },
    dispose() {
      body.geometry.dispose();
      mat.dispose();
    },
  };
}
