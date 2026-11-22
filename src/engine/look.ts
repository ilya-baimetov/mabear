// The series look (spec §7.1): soft, warm, saturated CG — NOT cel shading, no outlines.
// ACES filmic + sRGB, warm key with soft PCF shadows (2048), cool hemisphere fill, rim light, sky gradient per
// time of day with smooth blending, light fog, warm house windows at night.
// Also hosts the shared vertex-coloured material palette and a small geometry "bag" used by the set and props:
// many differently coloured parts share ONE material each, so the whole set merges to a handful of draw calls.
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
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
    sunDir: [10, 5.5, 6], sunColor: 0xffc288, sunIntensity: 2.3, sunGlow: 0.8,
    hemiSky: 0x9ec5ff, hemiGround: 0x6b683b, hemiIntensity: 0.56,
    rimColor: 0xffe2c0, rimIntensity: 0.48,
    fogColor: 0xffe0bd, fogNear: 22, fogFar: 110,
    exposure: 0.92, envIntensity: 0.45, windowGlow: 0.0, stars: 0,
  },
  day: {
    skyTop: 0x3a8ae8, skyHorizon: 0xaad3f6, skyBottom: 0xc8dcc0,
    sunDir: [6, 13, 9], sunColor: 0xffebd0, sunIntensity: 2.25, sunGlow: 0.45,
    hemiSky: 0xaecfff, hemiGround: 0x62733e, hemiIntensity: 0.54,
    rimColor: 0xfff4e0, rimIntensity: 0.36,
    fogColor: 0xaad3f6, fogNear: 26, fogFar: 110,
    exposure: 0.92, envIntensity: 0.5, windowGlow: 0.0, stars: 0,
  },
  sunset: {
    skyTop: 0x4556a0, skyHorizon: 0xf7a46c, skyBottom: 0xc98f72,
    sunDir: [-11, 3.2, 4], sunColor: 0xff9452, sunIntensity: 2.65, sunGlow: 1.0,
    hemiSky: 0x7c76c2, hemiGround: 0x563d30, hemiIntensity: 0.78,
    rimColor: 0xffb070, rimIntensity: 0.65,
    fogColor: 0xf7a46c, fogNear: 22, fogFar: 115,
    exposure: 1.05, envIntensity: 0.4, windowGlow: 0.45, stars: 0.05,
  },
  night: {
    skyTop: 0x09122e, skyHorizon: 0x263969, skyBottom: 0x17213b,
    sunDir: [-5, 10, 7], sunColor: 0x9ebcff, sunIntensity: 0.62, sunGlow: 0.25,
    hemiSky: 0x354d8c, hemiGround: 0x121726, hemiIntensity: 0.52,
    rimColor: 0x8fb0ff, rimIntensity: 0.28,
    fogColor: 0x263969, fogNear: 14, fogFar: 80,
    exposure: 1.15, envIntensity: 0.12, windowGlow: 1.0, stars: 1,
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
  /** image-based lighting: CC0 HDRI (once loaded) tinted per time of day, prefiltered with PMREM */
  env: EnvSystem;
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
uniform float uSunGlow; uniform float uStars; uniform float uTime;
varying vec3 vDir;
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
vec3 starLayer(vec3 d, float scale, float density, float baseRadius, float t) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 rnd = hash33(id);
  if (rnd.x < density) return vec3(0.0);
  vec3 rnd2 = hash33(id + vec3(19.37, 7.13, 41.9));
  vec3 ofs = (rnd2 - 0.5) * 0.50;
  float dist = length(f - ofs);
  float mag = (rnd.x - density) / (1.0 - density);
  float r = baseRadius * (0.6 + 0.65 * mag);
  float core = smoothstep(r, r * 0.12, dist);
  float halo = exp(-dist * dist / max(1e-4, r * r * 0.7)) * 0.32 * mag;
  float tw = 0.72 + 0.28 * sin(t * (1.4 + rnd.y * 2.4) + rnd.z * 6.28318);
  vec3 tint = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.90, 0.74), rnd.y);
  return tint * (core + halo) * (0.45 + 0.95 * mag) * tw;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sunD = normalize(uSunDir);
  float s = max(dot(d, sunD), 0.0);
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.25, -h));

  // sun atmospheric glow & disc (fades out as night falls and the moon appears)
  float sunVis = uSunGlow * (1.0 - smoothstep(0.1, 0.5, uStars));
  col += uSunColor * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * sunVis;
  col += uSunColor * smoothstep(0.9993, 0.9997, s) * sunVis * 2.0;

  // moon disc & halo at night along uSunDir
  float moonMask = smoothstep(0.1, 0.55, uStars);
  float moonDisc = 0.0;
  float moonHalo = 0.0;
  if (moonMask > 0.001 && h > -0.05) {
    vec3 refUp = abs(sunD.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 mRight = normalize(cross(refUp, sunD));
    vec3 mUp = cross(sunD, mRight);
    vec2 mUv = vec2(dot(d, mRight), dot(d, mUp));
    float mAng = length(d - sunD);
    float moonR = 0.034;
    moonDisc = 1.0 - smoothstep(moonR * 0.94, moonR * 1.04, mAng);
    float mTex = fbm(mUv / moonR * 1.8 + vec2(2.4, 5.1));
    vec3 moonSurf = mix(vec3(0.86, 0.89, 0.94), vec3(1.0, 0.97, 0.90), smoothstep(0.32, 0.72, mTex));
    moonHalo = (pow(s, 14.0) * 0.16 + pow(s, 96.0) * 0.42) * moonMask;
    col += mix(uSunColor, vec3(0.92, 0.95, 1.0), 0.55) * moonHalo;
    col = mix(col, moonSurf * 1.45, moonDisc * moonMask);
  }

  // multi-scale circular anti-aliased stars (masked from moon disc and horizon)
  if (uStars > 0.0 && h > 0.04) {
    float horizonStar = smoothstep(0.04, 0.35, h);
    vec3 st = starLayer(d, 88.0, 0.982, 0.165, uTime) * 1.15
            + starLayer(d, 152.0, 0.986, 0.165, uTime + 11.3) * 0.65;
    col += st * uStars * horizonStar * (1.0 - moonDisc * moonMask);
  }

  // two-layer storybook clouds: high wispy cirrus + fluffy cumulus with warm sun silver-lining
  if (h > 0.015) {
    float horizonFade = smoothstep(0.015, 0.24, h);
    float fwd = pow(s, 5.0);
    float night = uStars;

    // layer 1: wispy high cirrus
    vec2 cirrusUv = d.xz / (h + 0.22) * vec2(0.95, 1.75) + vec2(uTime * 0.0045, uTime * 0.0018) + vec2(5.2, 2.7);
    float cn = fbm(cirrusUv + vec2(fbm(cirrusUv * 1.6) * 0.45, 0.0));
    float cirrusCov = smoothstep(0.56, 0.86, cn) * horizonFade * 0.42;
    if (cirrusCov > 0.0) {
      vec3 cirrusLit = mix(vec3(1.0, 0.98, 0.95), uSunColor, 0.40);
      vec3 cirrusCol = mix(mix(uHorizon, uTop, 0.45), cirrusLit, 0.72 + 0.28 * fwd) * mix(1.0, 0.24, night);
      cirrusCol += mix(vec3(1.0, 0.96, 0.88), uSunColor, 0.5) * fwd * 0.25 * uSunGlow * (1.0 - night * 0.7);
      col = mix(col, cirrusCol, cirrusCov);
    }

    // layer 2: billowy storybook cumulus
    vec2 cumUv = d.xz / (h + 0.16) * 1.45 + vec2(uTime * 0.0085, uTime * 0.0032) + vec2(3.0, 1.0);
    float n1 = fbm(cumUv);
    float n2 = fbm(cumUv * 2.15 + vec2(n1 * 0.65, 4.1));
    float n = n1 * 0.68 + n2 * 0.32;
    float cov = smoothstep(0.50, 0.76, n) * horizonFade;
    if (cov > 0.0) {
      float litDir = clamp(0.55 + 0.45 * dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(sunD.x, 0.0, sunD.z) + 1e-4)), 0.0, 1.0);
      float core = smoothstep(0.50, 0.86, n);
      float edgeRim = smoothstep(0.50, 0.62, n) * (1.0 - smoothstep(0.64, 0.84, n));
      float silver = fwd * (0.45 + 0.95 * edgeRim) * uSunGlow;
      vec3 cLit = mix(vec3(1.0, 0.985, 0.96), uSunColor, 0.28) * mix(1.04, 0.22, night);
      vec3 cShade = mix(uHorizon, uTop, 0.38) * mix(0.92, 0.32, night);
      vec3 cc = mix(cShade, cLit, clamp(litDir * 0.62 + core * 0.45, 0.0, 1.0));
      cc += mix(vec3(1.0, 0.96, 0.88), uSunColor, 0.55) * silver * mix(0.75, 0.18, night);
      cc += mix(uSunColor, vec3(0.92, 0.95, 1.0), 0.55) * moonHalo * 0.3;
      col = mix(col, cc, cov * 0.92);
    }
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
  key.shadow.mapSize.set(4096, 4096);
  const sc = key.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 110;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 3.5;
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xfff4e0, 1.1);
  rim.position.set(-6, 9, -16);
  rim.target.position.set(0, 1, 0);
  scene.add(rim, rim.target);

  const lantern = new THREE.PointLight(0xffb060, 0, 12, 1.5);
  lantern.position.set(-6.55, 2.95, -3.45); // under Bear's treehouse.glb porch red lamp
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
      uTime: { value: 0 },
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

  const fog = new THREE.Fog(0xaad3f6, 30, 140);
  scene.fog = fog;

  // Image-based lighting: a procedural sky-gradient environment until the CC0 HDRI arrives (loadHdri), both tinted
  // per time of day and prefiltered with PMREM (see EnvSystem). The PMREM target is reused, so swaps never recompile.
  const env = createEnvSystem(renderer);
  const materials = createMaterials();

  const rig: LookRig = {
    hemi, key, rim, lantern, sky, fog, materials, env,
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
  updateEnvironment(rig, scene, 0);
  return rig;
}

// ---------------------------------------------------------------------------------------------------------------
// Environment (IBL): HDRI × time-of-day tint → small equirect target → PMREM (reused target)
// ---------------------------------------------------------------------------------------------------------------

const ENV_FRAG = /* glsl */ `
uniform sampler2D tHdr; uniform float uHasHdr; uniform float uGain; uniform float uRot; uniform float uTintAmt;
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSun;
varying vec2 vUv;
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
void main() {
  // inverse of three's equirectUv(): this target is sampled by PMREM exactly like an equirect texture
  float phi = (vUv.x - 0.5) * 6.28318530718;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 d = vec3(cos(phi) * cos(lat), sin(lat), sin(phi) * cos(lat));
  vec3 g = d.y > 0.0 ? mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, smoothstep(0.0, 0.3, -d.y));
  g += uSunColor * pow(max(dot(d, uSunDir), 0.0), 6.0) * uSun;
  vec3 col = g;
  if (uHasHdr > 0.5) {
    vec3 h = min(texture2D(tHdr, vec2(fract(vUv.x + uRot), vUv.y)).rgb, vec3(14.0)) * uGain;
    float lh = dot(h, LUM);
    float lg = max(dot(g, LUM), 1e-3);
    vec3 gs = mix(vec3(lg), g, 0.45); // hue toward the time of day, but never fully saturated (night stays soft)
    col = mix(h, gs * (lh / lg), uTintAmt); // the HDRI's light structure, hued toward the time of day
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export interface EnvSystem {
  /** PMREM texture used as scene.environment (same object for the rig's lifetime) */
  readonly texture: THREE.Texture | null;
  /** true once the CC0 HDRI is in use */
  readonly hdri: boolean;
  /** params changed since the last prefilter */
  dirty: boolean;
  lastGen: number;
  /** number of prefilter runs (tests / perf) */
  generations: number;
  setHdri(tex: THREE.DataTexture): void;
  setParams(p: LightingParams): void;
  generate(): void;
  dispose(): void;
}

/** Pure: how strongly the HDRI is hued toward the time-of-day palette (warm/cool sun + night → stronger). */
export function envTintAmount(p: LightingParams): number {
  _ca.setHex(p.sunColor);
  return Math.min(0.8, Math.max(0.2, 0.22 + Math.abs(_ca.r - _ca.b) * 0.7 + p.stars * 0.4));
}

function createEnvSystem(renderer: THREE.WebGLRenderer): EnvSystem {
  const rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false });
  rt.texture.name = "look:env_equirect";
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  const mat = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: ENV_FRAG,
    uniforms: {
      tHdr: { value: null },
      uHasHdr: { value: 0 },
      uGain: { value: 1 },
      uRot: { value: 0 },
      uTintAmt: { value: 0.3 },
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSun: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target: THREE.WebGLRenderTarget | null = null;
  let hdri = false;
  let hdriSunAz = 0; // azimuth (radians, three's equirect convention) of the HDRI's brightest region
  let sunAz = 0;
  const sys: EnvSystem = {
    get texture() {
      return target ? target.texture : null;
    },
    get hdri() {
      return hdri;
    },
    dirty: true,
    lastGen: -Infinity,
    generations: 0,
    setHdri(tex) {
      const st = hdriStats(tex);
      mat.uniforms.tHdr.value = tex;
      mat.uniforms.uHasHdr.value = 1;
      // normalise the HDRI so its mean (sun clamped) matches the gradient environment's brightness (~0.6)
      mat.uniforms.uGain.value = st.mean > 0 ? 0.6 / st.mean : 1;
      hdriSunAz = st.sunAz;
      mat.uniforms.uRot.value = (hdriSunAz - sunAz) / (Math.PI * 2);
      hdri = true;
      sys.dirty = true;
    },
    setParams(p) {
      const u = mat.uniforms;
      (u.uTop.value as THREE.Color).setHex(p.skyTop);
      (u.uHorizon.value as THREE.Color).setHex(p.skyHorizon);
      (u.uGround.value as THREE.Color).setHex(p.hemiGround);
      const sd = (u.uSunDir.value as THREE.Vector3).set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
      (u.uSunColor.value as THREE.Color).setHex(p.sunColor);
      u.uSun.value = (p.sunIntensity / 3) * 0.9;
      u.uTintAmt.value = envTintAmount(p);
      // rotate the HDRI so its sun sits where the key light comes from (three: u = atan(z, x) / 2π + 0.5)
      sunAz = Math.atan2(sd.z, sd.x);
      u.uRot.value = (hdriSunAz - sunAz) / (Math.PI * 2);
      sys.dirty = true;
    },
    generate() {
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      renderer.setRenderTarget(prevTarget);
      target = pmrem.fromEquirectangular(rt.texture, target as unknown as THREE.WebGLCubeRenderTarget | null);
      sys.dirty = false;
      sys.generations++;
    },
    dispose() {
      rt.dispose();
      mat.dispose();
      quad.dispose();
      pmrem.dispose();
      target?.dispose();
      (mat.uniforms.tHdr.value as THREE.Texture | null)?.dispose();
    },
  };
  return sys;
}

/** Mean luminance (clamped at 3) and the azimuth of the brightest row-weighted region of an equirect HDR texture. */
function hdriStats(tex: THREE.DataTexture): { mean: number; sunAz: number } {
  const img = tex.image as { data: ArrayLike<number>; width: number; height: number };
  const { data, width, height } = img;
  const half = data instanceof Uint16Array;
  const val = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const stride = data.length / (width * height);
  let sum = 0, n = 0, best = -1, bestX = 0;
  const step = 4; // subsample: plenty for a mean
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * stride;
      const l = 0.2126 * val(i) + 0.7152 * val(i + 1) + 0.0722 * val(i + 2);
      sum += Math.min(3, l);
      n++;
      if (l > best) {
        best = l;
        bestX = x;
      }
    }
  }
  return { mean: n ? sum / n : 0, sunAz: ((bestX + 0.5) / width - 0.5) * Math.PI * 2 };
}

/** Load the CC0 HDRI (async). Resolves false (procedural environment stays) if it cannot be loaded. */
export async function loadHdri(rig: LookRig, url: string, isDisposed: () => boolean = () => false): Promise<boolean> {
  try {
    const loader = new HDRLoader();
    loader.setDataType(THREE.HalfFloatType);
    const tex = await loader.loadAsync(url);
    if (isDisposed()) {
      tex.dispose(); // the stage was torn down while loading: don't attach (it would never be freed)
      return false;
    }
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    rig.env.setHdri(tex);
    return true;
  } catch {
    return false;
  }
}

/** Re-prefilter the environment when lighting changed (throttled to every `minGapMs` during blends). */
export function updateEnvironment(rig: LookRig, scene: THREE.Scene, now: number, minGapMs = 120): void {
  const e = rig.env;
  if (!e.dirty || now - e.lastGen < minGapMs) return;
  e.lastGen = now;
  e.generate();
  if (scene.environment !== e.texture) scene.environment = e.texture;
}

const _v = new THREE.Vector3();
const _sun = new THREE.Vector3();
const _lx = new THREE.Vector3();
const _ly = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0);
const _upZ = new THREE.Vector3(0, 0, 1);

function applyParams(rig: LookRig, scene: THREE.Scene, renderer: THREE.WebGLRenderer, p: LightingParams): void {
  rig.current = p;
  _v.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  rig.key.position.copy(rig.key.target.position).addScaledVector(_v, 45);
  rig.key.color.setHex(p.sunColor);
  rig.key.intensity = p.sunIntensity;
  rig.hemi.color.setHex(p.hemiSky);
  rig.hemi.groundColor.setHex(p.hemiGround);
  rig.hemi.intensity = p.hemiIntensity;
  rig.rim.color.setHex(p.rimColor);
  rig.rim.intensity = p.rimIntensity;
  rig.lantern.intensity = p.windowGlow * 7.5;
  rig.fog.color.setHex(p.fogColor);
  rig.fog.near = p.fogNear;
  rig.fog.far = p.fogFar;
  renderer.toneMappingExposure = p.exposure;
  scene.environmentIntensity = p.envIntensity;
  rig.env.setParams(p);
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

/** Advance deterministic sky animation (cloud drift, star twinkle) from story time `t`. */
export function updateSkyTime(rig: LookRig, t: number): void {
  const u = (rig.sky.material as THREE.ShaderMaterial).uniforms;
  if (u.uTime) u.uTime.value = Number.isFinite(t) ? t : 0;
}

/** Focus the directional key shadow frustum on (targetX, targetZ), snapped to light-space shadow texels to stop edge swimming. */
export function focusKeyShadow(rig: LookRig, targetX: number, targetZ: number, halfExtent: number): void {
  const he = Math.max(1, Number.isFinite(halfExtent) ? halfExtent : 24);
  const mapSize = Math.max(1, rig.key.shadow.mapSize.x);
  const texelSize = (2 * he) / mapSize;
  const sd = rig.current.sunDir;
  _sun.set(sd[0], sd[1], sd[2]);
  if (_sun.lengthSq() < 1e-6) _sun.set(0, 1, 0);
  else _sun.normalize();

  // Match Three.js DirectionalLightShadow camera orientation basis (X_light, Y_light, Z_light = sunDir).
  const up = Math.abs(_sun.y) > 0.999 ? _upZ : _upY;
  _lx.crossVectors(up, _sun).normalize();
  _ly.crossVectors(_sun, _lx).normalize();

  const tx = Number.isFinite(targetX) ? targetX : 0;
  const tz = Number.isFinite(targetZ) ? targetZ : 0;
  const u = tx * _lx.x + tz * _lx.z;
  const v = tx * _ly.x + tz * _ly.z;
  const uSnap = Math.round(u / texelSize) * texelSize;
  const vSnap = Math.round(v / texelSize) * texelSize;
  // Project snapped (u, v) back onto y = 0 along sunDir so key.target.position stays on the ground plane.
  const w = Math.abs(_sun.y) > 1e-4 ? -(vSnap * _ly.y) / _sun.y : 0;
  const snappedX = _lx.x * uSnap + _ly.x * vSnap + _sun.x * w;
  const snappedZ = _lx.z * uSnap + _ly.z * vSnap + _sun.z * w;

  rig.key.target.position.set(snappedX, 0, snappedZ);
  rig.key.position.copy(rig.key.target.position).addScaledVector(_sun, 45);
  rig.key.target.updateMatrixWorld();
  rig.key.updateMatrixWorld();

  const sc = rig.key.shadow.camera;
  if (sc.left !== -he || sc.right !== he || sc.top !== he || sc.bottom !== -he) {
    sc.left = -he;
    sc.right = he;
    sc.top = he;
    sc.bottom = -he;
    sc.updateProjectionMatrix();
  }
}

/** Shadow map resolution (2048 at full quality; 1024 when adaptive resolution drops). */
export function setShadowQuality(rig: LookRig, size: 1024 | 2048 | 4096): void {
  rig.key.shadow.radius = size >= 4096 ? 3.5 : 2.0;
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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth01(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function pixelTex(
  size: number,
  colorSpace: THREE.ColorSpace,
  fill: (data: Uint8ClampedArray, size: number) => void,
): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Seamless periodic 2D value noise in [0, 1] over `size × size`. */
function periodicNoise(size: number, gridX: number, gridY: number, seed: number): Float32Array {
  const r = rng(seed);
  const g = new Float32Array(gridX * gridY);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = (y / size) * gridY;
    const y0 = Math.floor(v) % gridY;
    const y1 = (y0 + 1) % gridY;
    const fy = v - Math.floor(v);
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x++) {
      const u = (x / size) * gridX;
      const x0 = Math.floor(u) % gridX;
      const x1 = (x0 + 1) % gridX;
      const fx = u - Math.floor(u);
      const sx = fx * fx * (3 - 2 * fx);
      const a = g[y0 * gridX + x0], b = g[y0 * gridX + x1];
      const c = g[y1 * gridX + x0], d = g[y1 * gridX + x1];
      out[y * size + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}

/** Seamless periodic multi-octave FBM in [0, 1]. */
function periodicFbm(size: number, octaves: readonly [number, number, number][], seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let wSum = 0;
  for (let k = 0; k < octaves.length; k++) {
    const [gx, gy, w] = octaves[k];
    const n = periodicNoise(size, gx, gy, seed + k * 97);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * w;
    wSum += w;
  }
  if (wSum > 0) for (let i = 0; i < out.length; i++) out[i] /= wSum;
  return out;
}

/** Seamless toroidal Voronoi crevice field (`edge = d2 - d1` in cell units). */
function periodicVoronoiEdge(size: number, cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const idx = cy * cells + cx;
      px[idx] = (cx + 0.15 + r() * 0.7) / cells;
      py[idx] = (cy + 0.15 + r() * 0.7) / cells;
    }
  }
  const edge = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const uy = y / size;
    const cy = Math.floor(uy * cells);
    for (let x = 0; x < size; x++) {
      const ux = x / size;
      const cx = Math.floor(ux * cells);
      let d1 = 1e9, d2 = 1e9;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = ((cy + dy) % cells + cells) % cells;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ((cx + dx) % cells + cells) % cells;
          const idx = ny * cells + nx;
          let ox = px[idx] - ux;
          let oy = py[idx] - uy;
          ox -= Math.round(ox);
          oy -= Math.round(oy);
          const dist = Math.hypot(ox, oy) * cells;
          if (dist < d1) { d2 = d1; d1 = dist; }
          else if (dist < d2) d2 = dist;
        }
      }
      edge[y * size + x] = d2 - d1;
    }
  }
  return edge;
}

/** Bake a periodic heightfield into a tangent-space normal map (`NoColorSpace`). */
function bakeNormalTex(h: Float32Array, size: number, strength: number): THREE.Texture | null {
  return pixelTex(size, THREE.NoColorSpace, (data) => {
    const mask = size - 1;
    for (let y = 0; y < size; y++) {
      const yu = (y - 1) & mask, yd = (y + 1) & mask;
      for (let x = 0; x < size; x++) {
        const xl = (x - 1) & mask, xr = (x + 1) & mask;
        const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
        const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
        const nx = -dx, ny = dy, nz = 1.0;
        const inv = 1 / Math.hypot(nx, ny, nz);
        const o = (y * size + x) * 4;
        data[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
  });
}

/** Bake a normalized [0, 1] field into a roughnessMap scaled against `maxR` so effective roughness spans [minR, maxR]. */
function bakeRoughnessTex(rField: Float32Array, size: number, minR: number, maxR: number): THREE.Texture | null {
  const ratio = minR / maxR;
  return pixelTex(size, THREE.NoColorSpace, (data) => {
    for (let i = 0; i < size * size; i++) {
      const v = Math.round(clamp01(ratio + (1 - ratio) * rField[i]) * 255);
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  });
}

/** 1×1 flat tangent-space normal (placeholder until a CC0 normal map is loaded). */
function flatNormal(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

interface ProceduralMaps {
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
}

function buildProceduralMaterialMaps(): Record<"stone" | "soil" | "paint" | "fabric" | "metal", ProceduralMaps> {
  if (typeof document === "undefined") {
    return { stone: {}, soil: {}, paint: {}, fabric: {}, metal: {} };
  }
  const S = 128;

  // Stone: mossy mottled rock albedo + crisp crevice normal + roughness (0.84..0.96)
  const stEdge = periodicVoronoiEdge(S, 6, 31);
  const stFbm = periodicFbm(S, [[8, 8, 0.45], [16, 16, 0.3], [32, 32, 0.25]], 41);
  const stMoss = periodicFbm(S, [[4, 4, 0.6], [16, 16, 0.4]], 53);
  const stH = new Float32Array(S * S);
  const stR = new Float32Array(S * S);
  const stMap = pixelTex(S, THREE.SRGBColorSpace, (data) => {
    for (let i = 0; i < S * S; i++) {
      const cr = smooth01(0.03, 0.24, stEdge[i]);
      const h = 0.55 * cr + 0.45 * stFbm[i];
      stH[i] = h;
      const moss = smooth01(0.62, 0.28, h) * smooth01(0.46, 0.72, stMoss[i]);
      stR[i] = clamp01(1 - cr * 0.65 - (stFbm[i] - 0.5) * 0.3 + moss * 0.5);
      const base = 0.73 + 0.21 * h;
      const r = base * (1 - 0.18 * moss) + 0.10 * moss;
      const g = base * (1 - 0.08 * moss) + 0.14 * moss;
      const b = base * (1 - 0.32 * moss);
      const o = i * 4;
      data[o] = Math.round(clamp01(r) * 255);
      data[o + 1] = Math.round(clamp01(g) * 255);
      data[o + 2] = Math.round(clamp01(b) * 255);
      data[o + 3] = 255;
    }
  });

  // Soil: rich dark earthy cloddy loam albedo + bump normal + roughness (0.88..0.96)
  const soEdge1 = periodicVoronoiEdge(S, 9, 71);
  const soEdge2 = periodicVoronoiEdge(S, 18, 83);
  const soFbm = periodicFbm(S, [[16, 16, 0.45], [32, 32, 0.35], [64, 64, 0.2]], 97);
  const soH = new Float32Array(S * S);
  const soR = new Float32Array(S * S);
  const soMap = pixelTex(S, THREE.SRGBColorSpace, (data) => {
    for (let i = 0; i < S * S; i++) {
      const h = 0.52 * smooth01(0.02, 0.32, soEdge1[i]) + 0.28 * smooth01(0.02, 0.32, soEdge2[i]) + 0.20 * soFbm[i];
      soH[i] = h;
      soR[i] = clamp01(1 - h * 0.6);
      const shade = 0.62 + 0.32 * h;
      const o = i * 4;
      data[o] = Math.round(clamp01(shade * 1.02) * 255);
      data[o + 1] = Math.round(clamp01(shade * 0.94) * 255);
      data[o + 2] = Math.round(clamp01(shade * 0.84) * 255);
      data[o + 3] = 255;
    }
  });

  // Paint: subtle painted timber brush/grain albedo + micro-normal + roughness (0.60..0.78)
  const paBrush = periodicFbm(S, [[32, 4, 0.55], [64, 8, 0.3], [16, 16, 0.15]], 113);
  const paR = new Float32Array(S * S);
  const paMap = pixelTex(S, THREE.SRGBColorSpace, (data) => {
    for (let i = 0; i < S * S; i++) {
      const b = paBrush[i];
      paR[i] = clamp01(0.2 + 0.75 * (1 - b));
      const v = Math.round(clamp01(0.90 + 0.08 * b) * 255);
      const o = i * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = Math.max(0, v - 2);
      data[o + 3] = 255;
    }
  });

  // Fabric: subtle woven textile normal + roughness variation (0.84..0.95)
  const faFbm = periodicFbm(S, [[16, 16, 0.6], [32, 32, 0.4]], 131);
  const faH = new Float32Array(S * S);
  const faR = new Float32Array(S * S);
  const threads = 16;
  for (let y = 0; y < S; y++) {
    const ty = (y / S) * threads;
    const cy = Math.floor(ty) & 1;
    const sy = Math.sin((ty - Math.floor(ty)) * Math.PI);
    for (let x = 0; x < S; x++) {
      const tx = (x / S) * threads;
      const cx = Math.floor(tx) & 1;
      const sx = Math.sin((tx - Math.floor(tx)) * Math.PI);
      const over = (cx ^ cy) === 0 ? sx : sy;
      const i = y * S + x;
      faH[i] = 0.72 * over + 0.28 * faFbm[i];
      faR[i] = clamp01(0.35 + 0.65 * (1 - over * 0.6) * faFbm[i]);
    }
  }

  // Metal: subtle brushed patina roughness map (0.28..0.44)
  const meR = periodicFbm(S, [[64, 4, 0.45], [32, 8, 0.25], [8, 8, 0.3]], 157);

  return {
    stone: { map: stMap, normalMap: bakeNormalTex(stH, S, 2.8), roughnessMap: bakeRoughnessTex(stR, S, 0.84, 0.96) },
    soil: { map: soMap, normalMap: bakeNormalTex(soH, S, 3.2), roughnessMap: bakeRoughnessTex(soR, S, 0.88, 0.96) },
    paint: { map: paMap, normalMap: bakeNormalTex(paBrush, S, 0.95), roughnessMap: bakeRoughnessTex(paR, S, 0.60, 0.78) },
    fabric: { normalMap: bakeNormalTex(faH, S, 1.4), roughnessMap: bakeRoughnessTex(faR, S, 0.84, 0.95) },
    metal: { roughnessMap: bakeRoughnessTex(meR, S, 0.28, 0.44) },
  };
}

export function createMaterials(): LookMaterials {
  const grain = canvasTex(256, woodGrain);
  const proc = buildProceduralMaterialMaps();
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const mats = {
    wood: std({ roughness: 0.82, map: grain, normalMap: flatNormal() }),
    bark: std({ roughness: 0.95, map: grain, normalMap: flatNormal() }),
    foliage: std({ roughness: 0.88 }),
    paint: std({ roughness: 0.78, normalScale: new THREE.Vector2(0.28, 0.28), ...proc.paint }),
    metal: std({ roughness: 0.44, metalness: 0.65, ...proc.metal }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x6f8fb0, roughness: 0.15, metalness: 0.1, emissive: 0xffa040, emissiveIntensity: 0.05 }),
    water: std({ roughness: 0.18, metalness: 0.0, envMapIntensity: 1.1 }),
    fabric: std({ roughness: 0.95, normalScale: new THREE.Vector2(0.45, 0.45), ...proc.fabric }),
    stone: std({ roughness: 0.96, normalScale: new THREE.Vector2(0.8, 0.8), ...proc.stone }),
    soil: std({ roughness: 0.96, normalScale: new THREE.Vector2(0.85, 0.85), ...proc.soil }),
  } as LookMaterials;
  for (const k of MAT_KEYS) mats[k].name = `look:${k}`;
  installFoliageClumps(mats.foliage);
  return mats;
}

/** Detail textures for the shared look materials (subset of the set's CC0 textures; see set/textures.ts). */
export interface LookTextures {
  wood?: THREE.Texture;
  woodN?: THREE.Texture;
  bark?: THREE.Texture;
  barkN?: THREE.Texture;
}

/**
 * Swap the CC0 wood and bark textures into the shared materials (A5). Missing textures keep the procedural grain.
 * The colour maps are neutral "detail" maps (mean sRGB ≈ 0.85, like the procedural grain they replace), so the baked
 * vertex colours still carry the palette.
 */
export function applyLookTextures(m: LookMaterials, t: LookTextures): void {
  const set = (mat: THREE.MeshStandardMaterial, map?: THREE.Texture, nrm?: THREE.Texture, ns = 0.8) => {
    // map + normalMap are never null on these materials (procedural grain, flat 1×1 normal placeholder), so the
    // swap reuses the already-compiled shader program: no hitch when the textures arrive
    let recompile = false;
    if (map) {
      recompile ||= !mat.map;
      mat.map = map;
    }
    if (nrm) {
      recompile ||= !mat.normalMap;
      mat.normalMap = nrm;
      mat.normalScale.set(ns, ns);
    }
    if (recompile) mat.needsUpdate = true;
  };
  set(m.wood, t.wood, t.woodN, 0.7);
  set(m.bark, t.bark, t.barkN, 1.0);
}

/**
 * Foliage "clumps" (A5): cheap world-space value noise breaks every canopy into soft leaf/needle clusters (brightness
 * and a slight yellow-green shift), so flat canopy cones and blobs read as layered foliage. No textures, ~20 ALU.
 */
function installFoliageClumps(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFolW;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
{
  vec4 fw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fw = instanceMatrix * fw;
  #endif
  vFolW = (modelMatrix * fw).xyz;
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vFolW;
float folHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float folNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(folHash(i), folHash(i + vec3(1, 0, 0)), f.x), mix(folHash(i + vec3(0, 1, 0)), folHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(folHash(i + vec3(0, 0, 1)), folHash(i + vec3(1, 0, 1)), f.x), mix(folHash(i + vec3(0, 1, 1)), folHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float n = folNoise(vFolW * 2.2) * 0.65 + folNoise(vFolW * 5.3) * 0.35;
  diffuseColor.rgb *= 0.78 + 0.42 * n;
  diffuseColor.rgb += vec3(0.02, 0.025, -0.01) * (n - 0.5);
}`,
      );
  };
  mat.customProgramCacheKey = () => "look:foliage:clumps:v1";
}

export function disposeMaterials(m: LookMaterials): void {
  for (const k of MAT_KEYS) {
    m[k].map?.dispose();
    m[k].normalMap?.dispose();
    m[k].roughnessMap?.dispose();
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
const MAT_ALIAS: Partial<Record<MatKey, MatKey>> = {};

/** Texture tile size in metres per textured material (metric UVs, so grain, stone, soil, paint and weave read at physical scale). */
export const UV_TILE_M: Partial<Record<MatKey, number>> = {
  wood: 1.1, bark: 1.4, stone: 1.2, soil: 1.0, paint: 1.2, fabric: 0.45, metal: 1.0,
};

const _sx = new THREE.Vector3();
const _sy = new THREE.Vector3();
const _sz = new THREE.Vector3();
/**
 * Rewrite a primitive's UVs in metres / `tile` (before its transform `m` is applied; `m`'s scale is honoured).
 * Cylinders/cones: u around (rounded to whole tiles so the seam is invisible), v along the axis — grain follows logs,
 * trunks and posts. Everything else: planar per face (dominant local normal) with v along the face's longer side, so
 * planks and boards carry their grain lengthwise.
 */
export function metricUV(g: THREE.BufferGeometry, tile: number, m?: THREE.Matrix4): void {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!pos || !nor) return;
  let sx = 1, sy = 1, sz = 1;
  if (m) {
    m.extractBasis(_sx, _sy, _sz);
    sx = _sx.length();
    sy = _sy.length();
    sz = _sz.length();
  }
  const prm = (g as unknown as { parameters?: Record<string, number> }).parameters ?? {};
  const type = g.type;
  if (uv && (type === "CylinderGeometry" || type === "ConeGeometry")) {
    const rt = type === "ConeGeometry" ? 0 : prm.radiusTop ?? 1;
    const rb = type === "ConeGeometry" ? prm.radius ?? 1 : prm.radiusBottom ?? 1;
    const h = (prm.height ?? 1) * sy;
    const rs = (sx + sz) / 2;
    const around = Math.max(1, Math.round((Math.PI * (rt + rb) * rs) / tile));
    const along = h / tile;
    const cap = (2 * Math.max(rt, rb) * rs) / tile;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.95 && rt > 0) uv.setXY(i, uv.getX(i) * cap, uv.getY(i) * cap);
      else uv.setXY(i, uv.getX(i) * around, uv.getY(i) * along);
    }
    uv.needsUpdate = true;
    return;
  }
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const ex = (bb.max.x - bb.min.x) * sx, ey = (bb.max.y - bb.min.y) * sy, ez = (bb.max.z - bb.min.z) * sz;
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * sx, y = pos.getY(i) * sy, z = pos.getZ(i) * sz;
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let a: number, b: number, ea: number, eb: number;
    if (ax >= ay && ax >= az) [a, b, ea, eb] = [z, y, ez, ey];
    else if (ay >= az) [a, b, ea, eb] = [x, z, ex, ez];
    else [a, b, ea, eb] = [x, y, ex, ey];
    // v (texture grain axis) along the longer side of this face
    if (ea > eb) [a, b] = [b, a];
    out[i * 2] = a / tile;
    out[i * 2 + 1] = b / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(out, 2));
}

export class GeoBag {
  readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();

  /** Add a geometry (painted with `color`) under material `mat`, transformed by `m` (local to this bag). */
  add(mat: MatKey, g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, o?: PaintOpts): this {
    mat = MAT_ALIAS[mat] ?? mat;
    const tile = UV_TILE_M[mat];
    if (tile) metricUV(g, tile, m);
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
