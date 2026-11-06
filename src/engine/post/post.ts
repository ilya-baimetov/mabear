// Post-processing for the series look (spec §7.1, A5): ground-truth ambient occlusion (GTAO, half resolution, normals
// reconstructed from depth — no extra scene pass), a subtle dual-filter bloom, ACES filmic tone mapping, a warm colour
// grade with a soft vignette, and SMAA anti-aliasing. Lighter than a generic EffectComposer chain: AO and bloom are
// read directly by ONE composite pass (tone map + grade), so the whole stack costs ~13 cheap full-screen draws.
//
// Quality tiers (degrade in this order when the frame rate drops; see stage.ts):
//   3 high   — AO + bloom + grade + SMAA
//   2 medium — bloom + grade + SMAA
//   1 low    — grade + SMAA
//   0 off    — plain renderer.render (renderer tone mapping + native MSAA): the pre-A5 path, always available
import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

export type PostQuality = 0 | 1 | 2 | 3;
export const POST_QUALITY_NAMES: Record<PostQuality, string> = { 0: "off", 1: "low", 2: "medium", 3: "high" };

/** Pure: parse a `?post=` URL value (0..3 | off | low | medium | high | false | true). */
export function parsePostQuality(search: string, fallback: PostQuality = 3): PostQuality {
  const v = new URLSearchParams(search).get("post");
  if (v === null || v === "") return fallback;
  const named: Record<string, PostQuality> = { off: 0, false: 0, no: 0, low: 1, medium: 2, med: 2, high: 3, on: 3, true: 3, yes: 3 };
  if (v.toLowerCase() in named) return named[v.toLowerCase()];
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? (Math.max(0, Math.min(3, n)) as PostQuality) : fallback;
}

/** True for a CPU (software) WebGL renderer: SwiftShader, llvmpipe, Microsoft Basic Render, … */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/** Default tier: full (3) on a GPU; grade + SMAA (1) on a software renderer, where AO/bloom stall the GPU queue. */
export function defaultPostQuality(rendererName: string): PostQuality {
  return isSoftwareRenderer(rendererName) ? 1 : 3;
}

export interface AdaptState {
  quality: PostQuality;
  /** highest quality allowed (lowered permanently when a tier is dropped for speed: no oscillation) */
  ceiling: PostQuality;
  scale: number;
}

/**
 * Pure adaptive policy. Slow (fps < 30): drop AO, then bloom, then lower the resolution (to `minScale`).
 * Fast (fps > 55): raise the resolution back first; dropped post tiers stay dropped (ceiling), so the stage never
 * flip-flops between an expensive tier and a slow frame rate. Returns null when nothing changes.
 */
export function adaptStep(s: AdaptState, fps: number, minScale = 0.5): AdaptState | null {
  if (fps < 30) {
    if (s.quality >= 2) {
      const q = (s.quality - 1) as PostQuality;
      return { quality: q, ceiling: q, scale: s.scale };
    }
    if (s.scale > minScale) return { ...s, scale: Math.max(minScale, s.scale * 0.75) };
    return null;
  }
  if (fps > 55) {
    if (s.scale < 1) return { ...s, scale: Math.min(1, s.scale * 1.2) };
    if (s.quality < s.ceiling) return { ...s, quality: (s.quality + 1) as PostQuality };
  }
  return null;
}

/** Colour grade (display-referred, after ACES). Warm and gently saturated, like the series' CG. */
export interface GradeParams {
  /** multiplies the colour (white balance + gain) */
  gain: [number, number, number];
  /** added toward shadows (lift), display units */
  lift: [number, number, number];
  saturation: number;
  /** S-curve contrast amount around mid grey (0 = none) */
  contrast: number;
  vignette: number;
  bloomStrength: number;
  bloomThreshold: number;
  aoIntensity: number;
}

export const DEFAULT_GRADE: GradeParams = {
  gain: [1.015, 1.0, 0.98],
  lift: [0.008, 0.009, 0.006],
  saturation: 1.03,
  contrast: 0.06,
  vignette: 0.16,
  bloomStrength: 0.12,
  bloomThreshold: 1.0,
  aoIntensity: 0.85,
};

export interface PostPipeline {
  readonly quality: PostQuality;
  setQuality(q: PostQuality): void;
  /** drawing-buffer size in pixels */
  setSize(w: number, h: number): void;
  /** render the scene with the current tier (falls back to renderer.render at tier 0) */
  render(): void;
  grade: GradeParams;
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// dual-filter (Kawase) bloom: downsample with a soft-knee threshold on the first level, then additive upsampling
const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uPrefilter;
varying vec2 vUv;
vec3 pre(vec3 c) {
  if (uPrefilter < 0.5) return c;
  float br = dot(c, vec3(0.2126, 0.7152, 0.0722)); // luminance: the pale sky stays below the threshold
  float knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  return min(c * w, vec3(16.0)); // clamp fireflies (sun disc)
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = pre(texture2D(tSrc, vUv).rgb) * 4.0;
  c += pre(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb);
  c += pre(texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb);
  c += pre(texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb);
  c += pre(texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb);
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-2.0 * o.x, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2( 2.0 * o.x, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, -2.0 * o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0,  2.0 * o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO;
uniform float uExposure; uniform float uBloom; uniform float uAO;
uniform vec3 uGain; uniform vec3 uLift; uniform float uSat; uniform float uContrast; uniform float uVignette;
uniform vec2 uAspect;
varying vec2 vUv;
// ACES filmic (same fit as three's ACESFilmicToneMapping)
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  return clamp(ACESOutputMat * color, 0.0, 1.0);
}
vec3 srgb(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  #ifdef USE_AO
  float ao = texture2D(tAO, vUv).r;
  c *= mix(1.0, ao, uAO);
  #endif
  #ifdef USE_BLOOM
  c += texture2D(tBloom, vUv).rgb * uBloom;
  #endif
  c = srgb(aces(c));
  // grade (display-referred): saturation, gentle S-curve, warm gain + lift, soft vignette
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = c + uContrast * (c - 0.5) * (1.0 - abs(2.0 * c - 1.0));
  c = c * uGain + uLift * (1.0 - c);
  vec2 d = (vUv - 0.5) * uAspect;
  c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(d));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const BLOOM_LEVELS = 4;

/**
 * Create the pipeline. Returns null if the device cannot render to half-float targets (the stage then keeps the
 * plain renderer path, i.e. the pre-A5 look — never a black screen).
 */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: PostQuality): PostPipeline | null {
  if (quality === 0) return createOff(renderer, scene, camera);
  const gl = renderer.getContext();
  const isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  if (!isGL2 || !renderer.extensions.has("EXT_color_buffer_float")) {
    if (!renderer.extensions.has("EXT_color_buffer_half_float")) return null;
  }
  let w = 2, h = 2;
  const depthTexture = new THREE.DepthTexture(w, h);
  depthTexture.type = THREE.UnsignedIntType;
  const sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture, depthBuffer: true });
  sceneRT.texture.name = "post:scene";
  const ldrRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
  ldrRT.texture.name = "post:ldr";
  const mips: THREE.WebGLRenderTarget[] = [];
  for (let i = 0; i < BLOOM_LEVELS; i++) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    rt.texture.name = `post:bloom${i}`;
    mips.push(rt);
  }
  const downMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: DOWN_FRAG,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uPrefilter: { value: 0 } },
    depthTest: false,
    depthWrite: false,
  });
  const upMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: UP_FRAG,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const compMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      tScene: { value: sceneRT.texture },
      tBloom: { value: mips[0].texture },
      tAO: { value: null },
      uExposure: { value: 1 },
      uBloom: { value: 0 },
      uAO: { value: 0 },
      uGain: { value: new THREE.Vector3() },
      uLift: { value: new THREE.Vector3() },
      uSat: { value: 1 },
      uContrast: { value: 0 },
      uVignette: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(compMat);
  // GTAO at half resolution, depth from the scene target (normals reconstructed: no second scene render)
  const gtao = new GTAOPass(scene, camera, 1, 1, { depthTexture });
  gtao.output = GTAOPass.OUTPUT.Off;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.1, samples: 12, distanceFallOff: 1.0 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  compMat.uniforms.tAO.value = gtao.pdRenderTarget.texture;
  const smaa = new SMAAPass();
  smaa.renderToScreen = true;

  let q: PostQuality = quality;
  const setDefines = () => {
    const d: Record<string, string> = {};
    if (q >= 3) d.USE_AO = "";
    if (q >= 2) d.USE_BLOOM = "";
    compMat.defines = d;
    compMat.needsUpdate = true;
  };
  setDefines();

  const renderBloom = () => {
    // down: scene → mip0 (prefilter) → mip1 → … ; up: … → mip1 += up(mip2) → mip0 += up(mip1)
    let src: THREE.Texture = sceneRT.texture;
    let sw = w, sh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      downMat.uniforms.tSrc.value = src;
      (downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / sw, 1 / sh);
      downMat.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
      downMat.uniforms.uThreshold.value = pipeline.grade.bloomThreshold;
      quad.material = downMat;
      renderer.setRenderTarget(mips[i]);
      quad.render(renderer);
      src = mips[i].texture;
      sw = mips[i].width;
      sh = mips[i].height;
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      upMat.uniforms.tSrc.value = mips[i + 1].texture;
      (upMat.uniforms.uTexel.value as THREE.Vector2).set(1 / mips[i + 1].width, 1 / mips[i + 1].height);
      quad.material = upMat;
      renderer.setRenderTarget(mips[i]);
      quad.render(renderer); // additive onto the level's own downsample
    }
  };

  const pipeline: PostPipeline = {
    get quality() {
      return q;
    },
    grade: { ...DEFAULT_GRADE, gain: [...DEFAULT_GRADE.gain], lift: [...DEFAULT_GRADE.lift] },
    setQuality(nq) {
      if (nq === q) return;
      q = nq;
      setDefines();
    },
    setSize(nw, nh) {
      w = Math.max(2, Math.floor(nw));
      h = Math.max(2, Math.floor(nh));
      sceneRT.setSize(w, h);
      ldrRT.setSize(w, h);
      for (let i = 0; i < BLOOM_LEVELS; i++) mips[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
      gtao.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
      smaa.setSize(w, h);
      (compMat.uniforms.uAspect.value as THREE.Vector2).set(w / Math.max(w, h), h / Math.max(w, h)).multiplyScalar(1.6);
    },
    render() {
      if (q === 0) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      const g = pipeline.grade;
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      if (q >= 3) gtao.render(renderer, sceneRT, sceneRT, 0, false);
      if (q >= 2) renderBloom();
      const u = compMat.uniforms;
      u.uExposure.value = renderer.toneMappingExposure;
      u.uBloom.value = g.bloomStrength;
      u.uAO.value = g.aoIntensity;
      (u.uGain.value as THREE.Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
      (u.uLift.value as THREE.Vector3).set(g.lift[0], g.lift[1], g.lift[2]);
      u.uSat.value = g.saturation;
      u.uContrast.value = g.contrast;
      u.uVignette.value = g.vignette;
      quad.material = compMat;
      renderer.setRenderTarget(ldrRT);
      quad.render(renderer);
      smaa.render(renderer, null as unknown as THREE.WebGLRenderTarget, ldrRT, 0, false);
      renderer.setRenderTarget(null);
    },
    dispose() {
      sceneRT.dispose();
      depthTexture.dispose();
      ldrRT.dispose();
      for (const m of mips) m.dispose();
      downMat.dispose();
      upMat.dispose();
      compMat.dispose();
      quad.dispose();
      gtao.dispose();
      smaa.dispose();
    },
  };
  return pipeline;
}

/** Tier 0: the plain renderer path (pre-A5 look). */
function createOff(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostPipeline {
  return {
    quality: 0,
    grade: { ...DEFAULT_GRADE },
    setQuality() {
      /* a pipeline created "off" stays off (no render targets were allocated) */
    },
    setSize() {
      /* nothing to resize */
    },
    render() {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      /* nothing to free */
    },
  };
}
