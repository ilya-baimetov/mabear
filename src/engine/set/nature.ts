// Authored CC0 vegetation by Quaternius, Stylized Nature MegaKit Standard.
// Primary source / license: public/assets/nature/LICENSE.txt and docs/upgrade/environment.md.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl } from "./textures";

export type NatureId = "BirchTree_1" | "BirchTree_3" | "Pine_1" | "Pine_2" | "Pine_3" | "Pine_5" | "CommonTree_1" | "CommonTree_2" | "CommonTree_4" | "Bush_Common" | "Fern_1";
export interface NatureSpot { x: number; y?: number; z: number; height: number; yaw?: number; tint?: number; }
interface Part { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; }

/** Per-stage asset owner. Shared prototypes/materials, instanced draws, complete cleanup including late responses. */
export class NatureAssets {
  private loader = new GLTFLoader();
  private cache = new Map<NatureId, Promise<Part[]>>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposables = new Set<{ dispose(): void }>();
  private dead = false;
  readonly jobs: Promise<void>[] = [];
  readonly loaded: string[] = [];
  readonly failed: string[] = [];

  private load(id: NatureId): Promise<Part[]> {
    const prev = this.cache.get(id);
    if (prev) return prev;
    const promise = this.loader.loadAsync(assetUrl(`assets/nature/${id}.gltf`)).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const height = bounds.max.y - bounds.min.y || 1;
      const origin = new THREE.Matrix4().makeTranslation(0, -bounds.min.y, 0);
      const normalization = new THREE.Matrix4().makeScale(1 / height, 1 / height, 1 / height).multiply(origin);
      const parts: Part[] = [];
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const original = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.MeshStandardMaterial;
        for (const tex of [original.map, original.normalMap, original.roughnessMap, original.metalnessMap]) {
          if (tex) { tex.anisotropy = 4; this.disposables.add(tex); }
        }
        this.disposables.add(original);
        let material = this.materials.get(original.name);
        if (!material) {
          material = original;
          material.roughness = .9;
          material.metalness = 0;
          material.normalScale?.setScalar(.4);
          material.transparent = false;
          material.depthWrite = true;
          material.envMapIntensity = .65;
          // Leaf cards keep their true silhouette; opaque trunks avoid unnecessary two-sided shading.
          const foliage = /leav|leaf/i.test(material.name);
          material.alphaTest = foliage ? .35 : 0;
          material.side = foliage ? THREE.DoubleSide : THREE.FrontSide;
          material.color.setHex(/birch/i.test(material.name) ? (foliage ? 0x8abb72 : 0xf3f0e5) : /pine/i.test(material.name) ? 0x5b7f4e : /normalTree/i.test(material.name) && foliage ? 0x89a261 : /twisted/i.test(material.name) && foliage ? 0x65864e : foliage ? 0xd4d8ba : 0xd9c8b6);
          this.materials.set(original.name, material);
        }
        const geometry = o.geometry.clone().applyMatrix4(normalization.clone().multiply(o.matrixWorld));
        this.disposables.add(geometry);
        this.disposables.add(o.geometry);
        parts.push({ geometry, material });
      });
      this.loaded.push(id);
      if (this.dead) for (const resource of this.disposables) resource.dispose();
      return parts;
    });
    this.cache.set(id, promise);
    return promise;
  }

  add(parent: THREE.Group, id: NatureId, spots: NatureSpot[], castShadow = false, foliageOnly = false, fallback?: () => void): void {
    if (!spots.length || typeof document === "undefined") return;
    const job = this.load(id).then((parts) => {
      if (this.dead) return;
      for (const part of parts) {
        if (foliageOnly && !/leav|leaf/i.test(part.material.name)) continue;
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
        mesh.name = `nature:${id}:${part.material.name}`;
        const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        spots.forEach((sp, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.yaw ?? 0);
          matrix.compose(new THREE.Vector3(sp.x, sp.y ?? 0, sp.z), q, new THREE.Vector3(sp.height, sp.height, sp.height));
          mesh.setMatrixAt(i, matrix);
          const tint = sp.tint ?? 1;
          mesh.setColorAt(i, c.setRGB(tint * 1.015, tint, tint * .98));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }).catch(() => {
      if (!this.failed.includes(id)) this.failed.push(id);
      if (!this.dead) fallback?.();
      console.warn(`Nature asset failed to load: ${id}`);
    });
    this.jobs.push(job);
  }

  dispose(): void {
    this.dead = true;
    for (const resource of this.disposables) resource.dispose();
  }
}
