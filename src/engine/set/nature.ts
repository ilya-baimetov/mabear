// Authored CC0 vegetation by Quaternius, Stylized Nature MegaKit Standard.
// Primary source / license: public/assets/nature/LICENSE.txt and docs/upgrade/environment.md.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl } from "./textures";

export type NatureId = "BirchTree_1" | "BirchTree_3" | "Pine_1" | "Pine_2" | "Pine_3" | "Pine_5" | "CommonTree_1" | "CommonTree_2" | "CommonTree_4" | "Bush_Common" | "Fern_1";
export interface NatureSpot { x: number; y?: number; z: number; height: number; yaw?: number; tint?: number; }
interface Part { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; }

const _windUniforms = {
  uWindTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(6, 13, 9).normalize() },
  uSunColor: { value: new THREE.Color(0xfff0d8) },
  uDayFade: { value: 1 },
};
const _sunTmp = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _instPos = new THREE.Vector3();
const _instScale = new THREE.Vector3();

/** Advance shared deterministic foliage wind & sunlit translucency uniforms from frame time `t`. */
export function updateNatureWind(
  t: number,
  lighting?: { sunDir?: readonly [number, number, number]; sunColor?: number; dayFade?: number },
): void {
  _windUniforms.uWindTime.value = t;
  if (lighting?.sunDir) {
    _sunTmp.set(lighting.sunDir[0], lighting.sunDir[1], lighting.sunDir[2]);
    if (_sunTmp.lengthSq() > 1e-6) _windUniforms.uSunDir.value.copy(_sunTmp).normalize();
  }
  if (lighting?.sunColor !== undefined) {
    _windUniforms.uSunColor.value.setHex(lighting.sunColor);
  }
  if (lighting?.dayFade !== undefined) {
    _windUniforms.uDayFade.value = lighting.dayFade;
  }
}

function installNatureFoliageShader(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, _windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime;\nvarying float vNatureH;")
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
\tmvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
\tmvPosition = instanceMatrix * mvPosition;
#endif
vec4 nw = modelMatrix * mvPosition;
float nh = clamp(position.y, 0.0, 1.0);
float sway = sin(uWindTime * 1.4 + nw.x * 0.6 + nw.z * 0.5) * pow(nh, 1.5);
float flutter = sin(uWindTime * 3.1 + nw.x * 1.9 - nw.z * 1.4 + position.x * 9.0) * 0.25 * nh;
nw.x += sway * 0.14 + flutter * 0.04;
nw.z += sway * 0.07 - flutter * 0.03;
vNatureH = nh;
mvPosition = viewMatrix * nw;
gl_Position = projectionMatrix * mvPosition;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uDayFade;\nvarying float vNatureH;",
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
{
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 Vv = normalize(vViewPosition);
  float wrapNdl = clamp((dot(normal, Lv) + 0.55) / 1.55, 0.0, 1.0);
  float backSun = pow(clamp(dot(-Vv, Lv) * 0.5 + 0.5, 0.0, 1.0), 2.4);
  float crownLift = mix(0.45, 1.18, clamp(vNatureH, 0.0, 1.0));
  vec3 warmTrans = mix(vec3(0.44, 0.72, 0.22), vec3(0.82, 0.88, 0.30), 0.55);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * warmTrans * (wrapNdl * 0.28 + backSun * 0.32) * crownLift * uDayFade;
}`,
      );
  };
  material.customProgramCacheKey = () => "nature:foliage:wind-sss:v1";
}

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
          if (material.alphaTest > 0) installNatureFoliageShader(material);
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
        const isLeaf = /leav|leaf/i.test(part.material.name);
        spots.forEach((sp, i) => {
          q.setFromAxisAngle(_upAxis, sp.yaw ?? 0);
          matrix.compose(_instPos.set(sp.x, sp.y ?? 0, sp.z), q, _instScale.set(sp.height, sp.height, sp.height));
          mesh.setMatrixAt(i, matrix);
          const tint = sp.tint ?? 1;
          if (isLeaf) {
            // Widen per-instance tinting across warm olive, sunlit sage, and cool pine.
            const h = Math.abs(Math.sin(sp.x * 12.9898 + sp.z * 78.233 + i * 3.17) * 43758.5453) % 1;
            if (h < 0.34) c.setRGB(tint * 1.11, tint * 1.03, tint * 0.80);
            else if (h < 0.68) c.setRGB(tint * 0.99, tint * 1.08, tint * 0.89);
            else c.setRGB(tint * 0.83, tint * 0.98, tint * 1.05);
          } else {
            c.setRGB(tint * 1.01, tint, tint * 0.98);
          }
          mesh.setColorAt(i, c);
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

export interface HorizonLayer {
  radius: number;
  base: number;
  amp: number;
  color: number;
  seed: number;
}

export interface HorizonUniforms {
  uSkyColor: { value: THREE.Color };
  uSunColor: { value: THREE.Color };
  uDayFade: { value: number };
}

/**
 * Multi-layered soft undulating pine-ridge horizons with aerial-perspective mist shading.
 * Merged into one draw call per location; blends smoothly with scene fog across times of day.
 */
export function buildPineRidgeHorizon(
  layers: readonly HorizonLayer[],
  groundAt: (x: number, z: number) => number,
  centerX = 0,
  centerZ = 0,
): { mesh: THREE.Mesh; uniforms: HorizonUniforms } {
  const pos: number[] = [];
  const cols: number[] = [];
  const mistAttr: number[] = [];
  const idx: number[] = [];
  const c0 = new THREE.Color();
  const segs = 420;
  let vBase = 0;

  layers.forEach((layer, li) => {
    c0.setHex(layer.color);
    const layerFrac = layers.length > 1 ? li / (layers.length - 1) : 0.5;
    const sd = layer.seed * 1.73;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = centerX + Math.cos(a) * layer.radius;
      const z = centerZ + Math.sin(a) * layer.radius;
      const gy = groundAt(x, z);
      // Smooth rolling terrain swell + layered rounded conifer-crown lobes (no jagged triangles)
      const swell = Math.sin(a * 3 + sd) * 1.3 + Math.cos(a * 7 - sd * 1.3) * 0.85 + Math.sin(a * 13 + sd * 2.1) * 0.45;
      const pineLobe = Math.pow(Math.abs(Math.sin(a * (68 + li * 18) + sd)), 0.65) * (layer.amp * 0.42)
        + Math.pow(Math.abs(Math.cos(a * (104 + li * 24) - sd * 0.8)), 0.75) * (layer.amp * 0.25);
      const topY = gy + layer.base + swell + pineLobe;
      const botY = gy - 8;

      pos.push(x, botY, z, x, topY, z);
      cols.push(c0.r * 0.72, c0.g * 0.76, c0.b * 0.82, c0.r, c0.g, c0.b);
      mistAttr.push(layerFrac, 0, layerFrac, 1);
    }
    for (let i = 0; i < segs; i++) {
      const v = vBase + i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    vBase += (segs + 1) * 2;
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute("aMist", new THREE.Float32BufferAttribute(mistAttr, 2));
  g.setIndex(idx);

  const uniforms: HorizonUniforms = {
    uSkyColor: { value: new THREE.Color(0x9ccbf5) },
    uSunColor: { value: new THREE.Color(0xfff0d8) },
    uDayFade: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 aMist;
      varying vec3 vColor;
      varying vec2 vMist;
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vMist = aMist;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyColor;
      uniform vec3 uSunColor;
      uniform float uDayFade;
      varying vec3 vColor;
      varying vec2 vMist;
      #include <fog_pars_fragment>
      void main() {
        vec3 base = vColor * mix(vec3(0.24, 0.30, 0.46), vec3(1.0), uDayFade);
        vec3 mist = mix(uSkyColor * 0.55, uSkyColor * 0.82 + uSunColor * 0.10, uDayFade);
        float haze = clamp(vMist.x * 0.46 + (1.0 - smoothstep(0.05, 0.95, vMist.y)) * 0.45, 0.0, 0.86);
        vec3 col = mix(base, mist, haze);
        col += uSunColor * smoothstep(0.75, 1.0, vMist.y) * (1.0 - vMist.x * 0.5) * 0.05 * uDayFade;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "set:horizon_ridge";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, uniforms };
}
