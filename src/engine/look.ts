// The series look (spec §7.1): soft, warm, saturated CG — NOT cel shading, no outlines.
// ACES filmic + sRGB, warm key with soft PCF shadows (2048), cool hemisphere fill, rim light, sky gradient per
// time of day with smooth blending, light fog, warm house windows at night.
// Also hosts the shared vertex-coloured material palette and a small geometry "bag" used by the set and props:
// many differently coloured parts share ONE material each, so the whole set merges to a handful of draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TimeOfDay } from "../shared/schema";

// ---------------------------------------------------------------------------------------------------------------
// Time-of-day presets (plain data, pure blending — unit-testable without WebGL)
// ---------------------------------------------------------------------------------------------------------------

export interface LightingParams {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  /** direction TOWARD the sun/moon (world, need not be normalized) */
  sunDir: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  /** glow of the sun disc/halo in the sky shader (0..1) */
  sunGlow: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  envIntensity: number;
  /** 0..1 warm glow of house windows and lanterns */
  windowGlow: number;
  /** 0..1 star visibility */
  stars: number;
}

export const TOD_PRESETS: Record<TimeOfDay, LightingParams> = {
  morning: {
    skyTop: 0x7fb8f0, skyHorizon: 0xffe0bd, skyBottom: 0xd9d2b0,
    sunDir: [10, 5.5, 6], sunColor: 0xffc994, sunIntensity: 2.7, sunGlow: 0.8,
    hemiSky: 0xbcd4ff, hemiGround: 0x7d7a45, hemiIntensity: 1.05,
    rimColor: 0xffe2c0, rimIntensity: 1.2,
    fogColor: 0xf3e2c8, fogNear: 22, fogFar: 110,
    exposure: 1.0, envIntensity: 0.45, windowGlow: 0.0, stars: 0,
  },
  day: {
    skyTop: 0x4b9df0, skyHorizon: 0xcfe8ff, skyBottom: 0xc8dcc0,
    sunDir: [6, 13, 9], sunColor: 0xfff0d8, sunIntensity: 3.0, sunGlow: 0.45,
    hemiSky: 0xcfe2ff, hemiGround: 0x76884a, hemiIntensity: 1.15,
    rimColor: 0xfff4e0, rimIntensity: 1.1,
    fogColor: 0xd7e9f7, fogNear: 30, fogFar: 140,
    exposure: 1.0, envIntensity: 0.5, windowGlow: 0.0, stars: 0,
  },
  sunset: {
    skyTop: 0x4d5fa8, skyHorizon: 0xffa261, skyBottom: 0xc98f72,
    sunDir: [-11, 3.2, 4], sunColor: 0xff9a5a, sunIntensity: 2.5, sunGlow: 1.0,
    hemiSky: 0x9c8fd0, hemiGround: 0x6a4c3a, hemiIntensity: 0.9,
    rimColor: 0xffb070, rimIntensity: 1.6,
    fogColor: 0xe9a888, fogNear: 22, fogFar: 115,
    exposure: 1.05, envIntensity: 0.4, windowGlow: 0.45, stars: 0.05,
  },
  night: {
    skyTop: 0x0a1433, skyHorizon: 0x2b3f73, skyBottom: 0x1a2440,
    sunDir: [-5, 10, 7], sunColor: 0x9fb8ff, sunIntensity: 0.6, sunGlow: 0.25,
    hemiSky: 0x40589c, hemiGround: 0x161c2c, hemiIntensity: 0.55,
    rimColor: 0x8fb0ff, rimIntensity: 0.9,
    fogColor: 0x1d2a4f, fogNear: 14, fogFar: 80,
    exposure: 1.15, envIntensity: 0.22, windowGlow: 1.0, stars: 1,
  },
};

const _ca = new THREE.Color();
const _cb = new THREE.Color();
function lerpHex(a: number, b: number, k: number): number {
  // blend in linear working space (what the renderer lights with)
  _ca.setHex(a);
  _cb.setHex(b);
  return _ca.lerp(_cb, k).getHex();
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => k * k * (3 - 2 * k);

/** Pure: blend two presets. k is clamped to 0..1 and eased (smoothstep). */
export function blendLighting(from: TimeOfDay, to: TimeOfDay, k: number): LightingParams {
  const a = TOD_PRESETS[from] ?? TOD_PRESETS.day;
  const b = TOD_PRESETS[to] ?? a;
  const t = smooth(Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0)));
  if (t <= 0) return { ...a, sunDir: [...a.sunDir] as [number, number, number] };
  if (t >= 1) return { ...b, sunDir: [...b.sunDir] as [number, number, number] };
  const na = new THREE.Vector3(...a.sunDir).normalize();
  const nb = new THREE.Vector3(...b.sunDir).normalize();
  const nd = na.lerp(nb, t).normalize();
  return {
    skyTop: lerpHex(a.skyTop, b.skyTop, t),
    skyHorizon: lerpHex(a.skyHorizon, b.skyHorizon, t),
    skyBottom: lerpHex(a.skyBottom, b.skyBottom, t),
    sunDir: [nd.x, nd.y, nd.z],
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunGlow: lerp(a.sunGlow, b.sunGlow, t),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    rimColor: lerpHex(a.rimColor, b.rimColor, t),
    rimIntensity: lerp(a.rimIntensity, b.rimIntensity, t),
    fogColor: lerpHex(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    exposure: lerp(a.exposure, b.exposure, t),
    envIntensity: lerp(a.envIntensity, b.envIntensity, t),
    windowGlow: lerp(a.windowGlow, b.windowGlow, t),
    stars: lerp(a.stars, b.stars, t),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Renderer + light rig + sky
// ---------------------------------------------------------------------------------------------------------------

export function setupRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed in three r18x; PCFShadowMap + shadow.radius is the soft path now.
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export interface LookRig {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  /** warm porch lantern, on at night */
  lantern: THREE.PointLight;
  sky: THREE.Mesh;
  fog: THREE.Fog;
  materials: LookMaterials;
  /** last applied params */
  current: LightingParams;
  dispose(): void;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // at the far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunGlow; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.25, -h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * uSunGlow;
  col += uSunColor * smoothstep(0.9993, 0.9997, s) * uSunGlow * 2.0;
  if (uStars > 0.0 && h > 0.05) {
    vec3 g = floor(d * 260.0);
    float st = step(0.9965, hash(g));
    col += vec3(0.9, 0.95, 1.0) * st * uStars * smoothstep(0.05, 0.4, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createLook(scene: THREE.Scene, renderer: THREE.WebGLRenderer): LookRig {
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x76884a, 1.1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 110;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 3;
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xfff4e0, 1.1);
  rim.position.set(-6, 9, -16);
  rim.target.position.set(0, 1, 0);
  scene.add(rim, rim.target);

  const lantern = new THREE.PointLight(0xffb060, 0, 9, 1.6);
  lantern.position.set(-4.7, 2.85, -2.0); // the porch lantern of Bear's house
  scene.add(lantern);

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSunGlow: { value: 0 },
      uStars: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.name = "look:sky";
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const fog = new THREE.Fog(0xd7e9f7, 30, 140);
  scene.fog = fog;

  // A soft neutral environment (constant across times of day; only its intensity blends) for gentle IBL on
  // metals, water and paint. No discontinuities when blending.
  const env = buildEnvironment(renderer);
  scene.environment = env;

  const materials = createMaterials();

  const rig: LookRig = {
    hemi, key, rim, lantern, sky, fog, materials,
    current: TOD_PRESETS.day,
    dispose() {
      skyMat.dispose();
      sky.geometry.dispose();
      env.dispose();
      disposeMaterials(materials);
      key.shadow.map?.dispose();
    },
  };
  applyParams(rig, scene, renderer, TOD_PRESETS.day);
  return rig;
}

function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const g = new THREE.SphereGeometry(10, 32, 16);
  const cols: number[] = [];
  const pos = g.attributes.position;
  const top = new THREE.Color(0xdfeaff), hor = new THREE.Color(0xfff2e0), bot = new THREE.Color(0x6f7f4a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
    else c.copy(hor).lerp(bot, Math.min(1, -y * 3));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(g, m));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  g.dispose();
  m.dispose();
  return rt.texture;
}

const _v = new THREE.Vector3();

function applyParams(rig: LookRig, scene: THREE.Scene, renderer: THREE.WebGLRenderer, p: LightingParams): void {
  rig.current = p;
  _v.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  rig.key.position.copy(_v).multiplyScalar(45);
  rig.key.color.setHex(p.sunColor);
  rig.key.intensity = p.sunIntensity;
  rig.hemi.color.setHex(p.hemiSky);
  rig.hemi.groundColor.setHex(p.hemiGround);
  rig.hemi.intensity = p.hemiIntensity;
  rig.rim.color.setHex(p.rimColor);
  rig.rim.intensity = p.rimIntensity;
  rig.lantern.intensity = p.windowGlow * 6;
  rig.fog.color.setHex(p.fogColor);
  rig.fog.near = p.fogNear;
  rig.fog.far = p.fogFar;
  renderer.toneMappingExposure = p.exposure;
  scene.environmentIntensity = p.envIntensity;
  const u = (rig.sky.material as THREE.ShaderMaterial).uniforms;
  (u.uTop.value as THREE.Color).setHex(p.skyTop);
  (u.uHorizon.value as THREE.Color).setHex(p.skyHorizon);
  (u.uBottom.value as THREE.Color).setHex(p.skyBottom);
  (u.uSunDir.value as THREE.Vector3).copy(_v);
  (u.uSunColor.value as THREE.Color).setHex(p.sunColor);
  u.uSunGlow.value = p.sunGlow;
  u.uStars.value = p.stars;
  const glass = rig.materials.glass;
  glass.emissiveIntensity = 0.05 + p.windowGlow * 2.4;
  glass.color.setHex(p.windowGlow > 0.5 ? 0x3a3020 : 0x6f8fb0);
}

/** Apply a FrameState lighting blend to the look rig. Returns the blended params. */
const _lastLighting = new WeakMap<LookRig, { from: TimeOfDay; to: TimeOfDay; k: number }>();
export function applyLighting(
  rig: LookRig,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  lighting: { from: TimeOfDay; to: TimeOfDay; k: number },
): LightingParams {
  // no work (and no allocation) while the lighting key is unchanged — the common case every frame
  const last = _lastLighting.get(rig);
  if (last && last.from === lighting.from && last.to === lighting.to && last.k === lighting.k) return rig.current;
  const p = blendLighting(lighting.from, lighting.to, lighting.k);
  applyParams(rig, scene, renderer, p);
  if (last) {
    last.from = lighting.from;
    last.to = lighting.to;
    last.k = lighting.k;
  } else _lastLighting.set(rig, { from: lighting.from, to: lighting.to, k: lighting.k });
  return p;
}

/** Shadow map resolution (2048 at full quality; 1024 when adaptive resolution drops). */
export function setShadowQuality(rig: LookRig, size: 1024 | 2048): void {
  if (rig.key.shadow.mapSize.x === size) return;
  rig.key.shadow.mapSize.set(size, size);
  rig.key.shadow.map?.dispose();
  (rig.key.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
}

/** Keep the sky centred on the camera (infinitely far). */
export function followCamera(rig: LookRig, camera: THREE.Camera): void {
  rig.sky.position.copy(camera.position);
}

// ---------------------------------------------------------------------------------------------------------------
// Material palette (vertex-coloured; high roughness; sheen on fabric)
// ---------------------------------------------------------------------------------------------------------------

export type MatKey = "wood" | "bark" | "foliage" | "paint" | "metal" | "glass" | "water" | "fabric" | "stone" | "soil";
export const MAT_KEYS: MatKey[] = ["wood", "bark", "foliage", "paint", "metal", "glass", "water", "fabric", "stone", "soil"];

export type LookMaterials = Record<MatKey, THREE.MeshStandardMaterial> & { glass: THREE.MeshStandardMaterial };

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function woodGrain(ctx: CanvasRenderingContext2D, s: number): void {
  const r = rng(7);
  ctx.fillStyle = "#d8d0c4";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const x = r() * s;
    const w = 1 + r() * 3;
    const l = 200 + Math.floor(r() * 40);
    ctx.fillStyle = `rgba(${l - 70},${l - 85},${l - 100},${0.12 + r() * 0.2})`;
    ctx.fillRect(x, 0, w, s);
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = "rgba(90,60,40,0.18)";
    ctx.beginPath();
    ctx.ellipse(r() * s, r() * s, 3 + r() * 4, 8 + r() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function softNoise(ctx: CanvasRenderingContext2D, s: number, base: string, amp: number, seed: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  const r = rng(seed);
  for (let i = 0; i < 400; i++) {
    const g = Math.floor(r() * 255);
    ctx.fillStyle = `rgba(${g},${g},${g},${amp * r()})`;
    ctx.beginPath();
    ctx.arc(r() * s, r() * s, 2 + r() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createMaterials(): LookMaterials {
  const grain = canvasTex(256, woodGrain);
  const stony = canvasTex(128, (c, s) => softNoise(c, s, "#dddddd", 0.3, 5));
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const mats = {
    wood: std({ roughness: 0.82, map: grain }),
    bark: std({ roughness: 0.95, map: grain }),
    foliage: std({ roughness: 0.88 }),
    paint: std({ roughness: 0.55 }),
    metal: std({ roughness: 0.32, metalness: 0.65 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x6f8fb0, roughness: 0.15, metalness: 0.1, emissive: 0xffa040, emissiveIntensity: 0.05 }),
    water: std({ roughness: 0.18, metalness: 0.0, envMapIntensity: 1.1 }),
    // set fabric (hammock) is two-sided geometry; same shader program as paint (fewer programs to compile)
    fabric: std({ roughness: 0.95 }),
    stone: std({ roughness: 0.92, map: stony }),
    soil: std({ roughness: 1.0, map: stony }),
  } as LookMaterials;
  for (const k of MAT_KEYS) mats[k].name = `look:${k}`;
  return mats;
}

export function disposeMaterials(m: LookMaterials): void {
  for (const k of MAT_KEYS) {
    m[k].map?.dispose();
    m[k].dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry bag: collect primitives per material with baked vertex colours, merge to one mesh per material
// ---------------------------------------------------------------------------------------------------------------

export interface PaintOpts {
  /** colour for faces whose normal is parallel to this local axis (end grain of logs, caps) */
  capColor?: THREE.ColorRepresentation;
  capAxis?: "x" | "y" | "z";
  /** darken toward local y-min by this factor (0..1) — cheap ambient occlusion at the base */
  aoBottom?: number;
  /** random per-vertex brightness jitter (0..1) */
  jitter?: number;
  seed?: number;
  /** custom per-vertex colour (local position, normal) → overrides */
  colorFn?: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _cap = new THREE.Color();

/** Bake a colour attribute into a geometry (in its local space, before transform). Returns the same geometry. */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PaintOpts = {}): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const base = new THREE.Color(color);
  if (o.capColor !== undefined) _cap.set(o.capColor);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const h = Math.max(1e-6, bb.max.y - bb.min.y);
  const sd = (o.seed ?? 1) * 1.618;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    if (nor) _n.fromBufferAttribute(nor, i);
    else _n.set(0, 1, 0);
    _c.copy(base);
    if (o.capColor !== undefined) {
      const ax = o.capAxis ?? "y";
      if (Math.abs(_n[ax]) > 0.8) _c.copy(_cap);
    }
    if (o.colorFn) o.colorFn(_p, _n, _c);
    if (o.aoBottom) {
      const t = (_p.y - bb.min.y) / h;
      _c.multiplyScalar(1 - o.aoBottom * (1 - Math.min(1, t * 2.2)));
    }
    // smooth positional variation (not per-vertex random speckle, which reads as facets on big triangles)
    if (o.jitter) _c.multiplyScalar(1 + o.jitter * 0.5 * Math.sin(_p.x * 7.3 + _p.y * 5.1 + sd) * Math.cos(_p.z * 6.7 - _p.y * 3.3 + sd * 0.7));
    cols[i * 3] = _c.r;
    cols[i * 3 + 1] = _c.g;
    cols[i * 3 + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Make a geometry mergeable: indexed, with exactly position/normal/uv/color. */
function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  }
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) paint(g, 0xffffff);
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Build a transform matrix from position, euler rotation (radians, XYZ) and scale. */
export function xf(
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: number | [number, number, number] = 1,
): THREE.Matrix4 {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (typeof scale === "number") _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), _q.clone(), _s.clone());
}

/** Materials that merge into another bucket (fewer draw calls: same shader, near-identical look). */
const MAT_ALIAS: Partial<Record<MatKey, MatKey>> = { bark: "wood", soil: "stone" };

export class GeoBag {
  readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();

  /** Add a geometry (painted with `color`) under material `mat`, transformed by `m` (local to this bag). */
  add(mat: MatKey, g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, o?: PaintOpts): this {
    mat = MAT_ALIAS[mat] ?? mat;
    paint(g, color, o);
    normalize(g);
    if (m) g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    return this;
  }

  /** Add an already-painted geometry. */
  addPainted(mat: MatKey, g: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    mat = MAT_ALIAS[mat] ?? mat;
    normalize(g);
    if (m) g.applyMatrix4(m);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    return this;
  }

  /** Move all of another bag's parts into this one, transformed by `m`. */
  absorb(other: GeoBag, m?: THREE.Matrix4): this {
    for (const [mat, list] of other.parts) {
      for (const g of list) this.addPainted(mat, m ? g.clone().applyMatrix4(m) : g.clone());
    }
    return this;
  }

  /** Merge each material's parts into one geometry. */
  merged(): Map<MatKey, THREE.BufferGeometry> {
    const out = new Map<MatKey, THREE.BufferGeometry>();
    for (const [mat, list] of this.parts) {
      if (!list.length) continue;
      const g = list.length === 1 ? list[0].clone() : mergeGeometries(list, false);
      if (g) out.set(mat, g);
    }
    return out;
  }

  /** One mesh per material inside a group. */
  build(materials: LookMaterials, name: string, shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
    const grp = new THREE.Group();
    grp.name = name;
    for (const [mat, g] of this.merged()) {
      const mesh = new THREE.Mesh(g, materials[mat]);
      mesh.name = `${name}:${mat}`;
      mesh.castShadow = shadows.cast ?? (mat !== "water" && mat !== "glass");
      mesh.receiveShadow = shadows.receive ?? true;
      grp.add(mesh);
    }
    return grp;
  }

  dispose(): void {
    for (const list of this.parts.values()) for (const g of list) g.dispose();
    this.parts.clear();
  }
}

/** Single merged geometry of everything in the bag (ignoring material), for instancing (one material). */
export function bagToSingle(bag: GeoBag): THREE.BufferGeometry {
  const all: THREE.BufferGeometry[] = [];
  for (const list of bag.parts.values()) all.push(...list);
  return mergeGeometries(all, false)!;
}

/** Displace a geometry's vertices along their normals with a smooth pseudo-noise (for organic blobs). */
export function lumpy(g: THREE.BufferGeometry, amp: number, freq: number, seed = 1): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const o = seed * 13.37;
  // position-based noise: coincident vertices move together, so seams never tear
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const len = _p.length() || 1;
    const n = Math.sin(_p.x * freq + o) * Math.cos(_p.y * freq * 1.3 + o * 0.7) + Math.sin(_p.z * freq * 0.9 - o) * 0.6;
    _p.multiplyScalar(1 + (n * amp) / len);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  g.computeVertexNormals();
  return g;
}
