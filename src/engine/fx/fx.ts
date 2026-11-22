// Cheap particle effects (spec §7.1/§6): flour_cloud, hearts, sparkles, zzz, dust, splash, tears, anger_puff.
// Every effect is a GPU point cloud whose particle positions are a pure function of (seed, k) — the FxFrame's
// normalized age — so scrubbing is exact and frame-rate independent. One draw call per active effect.
import * as THREE from "three";
import { FX_IDS, type FxId } from "../../shared/schema";
import type { FxFrame } from "../api";
import { rng } from "../look";

interface FxDef {
  kind: number;
  count: number;
  color: number;
  color2: number;
  /** base world size of a particle (m) */
  size: number;
  /** lift above `at` when `at` is on the ground (y≈0) */
  lift: number;
  additive?: boolean;
}

export const FX_DEFS: Record<FxId, FxDef> = {
  flour_cloud: { kind: 0, count: 42, color: 0xffffff, color2: 0xf3eadb, size: 0.55, lift: 0.5 },
  hearts: { kind: 1, count: 8, color: 0xff4f7d, color2: 0xff8fb0, size: 0.26, lift: 1.1 },
  sparkles: { kind: 2, count: 26, color: 0xfff3a0, color2: 0xffffff, size: 0.2, lift: 0.7, additive: true },
  zzz: { kind: 3, count: 3, color: 0xe8f0ff, color2: 0xa9c4ff, size: 0.3, lift: 1.0 },
  dust: { kind: 4, count: 22, color: 0xd9c49a, color2: 0xbfa77a, size: 0.4, lift: 0.0 },
  splash: { kind: 5, count: 19, color: 0x78aaa9, color2: 0xc9e1d8, size: 0.038, lift: 0.0 },
  tears: { kind: 6, count: 14, color: 0x6fb8ff, color2: 0xbfe4ff, size: 0.09, lift: 0.85 },
  anger_puff: { kind: 7, count: 7, color: 0x5d5864, color2: 0x8a8090, size: 0.38, lift: 1.05 },
};

const VERT = /* glsl */ `
attribute vec4 aSeed;   // 4 uniform randoms per particle
attribute float aIndex; // 0..1 particle index
uniform float uK; uniform float uScale; uniform float uSize; uniform int uKind;
varying float vAlpha; varying float vMix; varying float vRot; varying vec2 vSeed;
const float PI = 3.14159265;
void main() {
  float k = clamp(uK, 0.0, 1.0);
  vec3 p = vec3(0.0);
  float size = uSize;
  float alpha = 1.0;
  vRot = 0.0;
  vSeed = aSeed.xy;
  vec3 dir = normalize(vec3(aSeed.x - 0.5, aSeed.y * 0.8 + 0.1, aSeed.z - 0.5) + 1e-4);
  if (uKind == 0) { // flour_cloud: burst, decelerate, billow and fade
    float e = 1.0 - pow(1.0 - k, 3.0);
    p = dir * (0.5 + aSeed.w * 1.1) * e + vec3(0.0, 0.5 * k, 0.0);
    size *= 0.5 + 1.4 * e * (0.6 + aSeed.w * 0.6);
    alpha = smoothstep(0.0, 0.05, k) * pow(1.0 - k, 1.4) * 0.9;
  } else if (uKind == 1) { // hearts: float up with a sway, pop in, fade out
    float st = aIndex * 0.45;
    float kk = clamp((k - st) / (1.0 - st), 0.0, 1.0);
    p = vec3((aSeed.x - 0.5) * 0.5 + sin(kk * 6.0 + aSeed.y * 6.28) * 0.12, kk * 0.9, (aSeed.z - 0.5) * 0.3);
    size *= smoothstep(0.0, 0.15, kk) * (0.8 + aSeed.w * 0.4);
    alpha = (1.0 - smoothstep(0.7, 1.0, kk)) * step(0.001, kk);
  } else if (uKind == 2) { // sparkles: twinkling shell
    vec3 d2 = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) + 1e-4);
    p = d2 * (0.25 + 0.45 * aSeed.w) * (0.6 + 0.4 * k) + vec3(0.0, 0.25 * k, 0.0);
    float tw = 0.5 + 0.5 * sin(k * 40.0 * (0.5 + aSeed.x) + aSeed.y * 6.28);
    size *= 0.4 + tw;
    alpha = smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.75, 1.0, k));
  } else if (uKind == 3) { // zzz: staggered Z's drifting up-right, growing
    float ph = fract(k * 1.5 + aIndex);
    p = vec3(ph * 0.45, ph * 0.8, 0.0);
    size *= 0.5 + ph * 0.9;
    alpha = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.7, 1.0, ph));
    vRot = 0.25;
  } else if (uKind == 4) { // dust: ground puffs spreading out
    float a = aSeed.x * 2.0 * PI;
    float e = 1.0 - pow(1.0 - k, 2.0);
    p = vec3(cos(a), 0.0, sin(a)) * (0.3 + 0.8 * aSeed.y) * e + vec3(0.0, 0.08 + 0.3 * e * aSeed.z, 0.0);
    size *= 0.5 + e * (0.8 + aSeed.w);
    alpha = smoothstep(0.0, 0.05, k) * pow(1.0 - k, 1.5) * 0.75;
  } else if (uKind == 5) { // splash: ballistic droplets
    float a = aSeed.x * 2.0 * PI;
    float tt = k * 0.75;
    float v = 1.0 + aSeed.y * 1.3;
    float r = (0.18 + aSeed.z * 0.48) * tt;
    float height = v * tt - 4.9 * tt * tt;
    p = vec3(cos(a) * r, max(0.0, height), sin(a) * r);
    size *= 0.6 + aSeed.w * 0.65;
    alpha = .65 * smoothstep(0.0,0.025,k) * (1.0-smoothstep(.45,.8,k)) * step(0.0,height);
  } else if (uKind == 6) { // tears: two arcs of drops from the eyes
    float side = aIndex < 0.5 ? -1.0 : 1.0;
    float ph = fract(k * 3.0 + aSeed.x);
    p = vec3(side * (0.08 + ph * 0.35), 0.15 + ph * 0.25 - ph * ph * 0.9, 0.12);
    size *= 0.8 + aSeed.w * 0.4;
    alpha = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.8, 1.0, ph)) * (1.0 - smoothstep(0.85, 1.0, k));
  } else { // anger_puff: dark puffs pop out of the head in a ring
    float a = aIndex * 2.0 * PI + aSeed.x;
    float e = 1.0 - pow(1.0 - k, 3.0);
    p = vec3(cos(a) * 0.35 * e, 0.2 + 0.45 * e * (0.6 + aSeed.y * 0.6), sin(a) * 0.35 * e);
    size *= (0.3 + 0.9 * e) * (0.8 + aSeed.w * 0.4);
    alpha = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k));
  }
  vAlpha = alpha;
  vMix = aSeed.w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(0.0, size * uScale / max(0.1, -mv.z));
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uColor2; uniform vec3 uTint; uniform int uKind;
varying float vAlpha; varying float vMix; varying float vRot; varying vec2 vSeed;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 q = gl_PointCoord - 0.5;
  q.y = -q.y;
  float a = 0.0;
  vec3 col = mix(uColor, uColor2, vMix);
  if (uKind == 1) { // heart
    vec2 h = q * 2.4; h.y += 0.15;
    float v = pow(h.x * h.x + h.y * h.y - 0.35, 3.0) - h.x * h.x * h.y * h.y * h.y;
    a = 1.0 - smoothstep(-0.02, 0.02, v);
  } else if (uKind == 2) { // 4-point star
    vec2 s = abs(q);
    float d = min(s.x * 6.0 + s.y, s.y * 6.0 + s.x);
    a = 1.0 - smoothstep(0.35, 0.5, d) + (1.0 - smoothstep(0.0, 0.22, length(q))) * 0.8;
  } else if (uKind == 3) { // Z letter (rotated by vRot)
    float cr = cos(vRot), sr = sin(vRot);
    vec2 rq = mat2(cr, -sr, sr, cr) * q;
    float d = min(min(seg(rq, vec2(-0.28, 0.28), vec2(0.28, 0.28)), seg(rq, vec2(0.28, 0.28), vec2(-0.28, -0.28))), seg(rq, vec2(-0.28, -0.28), vec2(0.28, -0.28)));
    a = 1.0 - smoothstep(0.06, 0.1, d);
  } else if (uKind == 5) { // splash: multi-lobe droplet + satellite micro-drops
    float ang = vSeed.x * 6.28318;
    float ca = cos(ang), sa = sin(ang);
    vec2 sq = mat2(ca, -sa, sa, ca) * q;
    float d0 = smoothstep(0.34, 0.14, length(sq * vec2(1.0, 0.82)));
    float d1 = smoothstep(0.16, 0.05, length(sq - vec2(0.21, 0.12))) * 0.80;
    float d2 = smoothstep(0.14, 0.04, length(sq - vec2(-0.20, -0.14))) * 0.72;
    a = max(d0, max(d1, d2));
    col += vec3(0.22) * smoothstep(0.14, 0.0, length(sq - vec2(-0.07, 0.08)));
  } else if (uKind == 6) { // tear drop
    vec2 t = q; t.y += 0.1;
    float d = length(t) - 0.28 + max(0.0, t.y) * 0.55;
    a = 1.0 - smoothstep(-0.03, 0.02, d);
  } else { // soft multi-lobe volumetric puff (flour_cloud, dust, anger_puff)
    float ang = vSeed.x * 6.28318;
    float ca = cos(ang), sa = sin(ang);
    vec2 pq = mat2(ca, -sa, sa, ca) * q;
    float b0 = smoothstep(1.0, 0.12, length(pq) / 0.34);
    float b1 = smoothstep(1.0, 0.16, length(pq - vec2(0.14, 0.08)) / (0.24 + 0.04 * vSeed.y)) * 0.92;
    float b2 = smoothstep(1.0, 0.16, length(pq - vec2(-0.15, 0.06)) / (0.23 + 0.04 * vMix)) * 0.88;
    float b3 = smoothstep(1.0, 0.16, length(pq - vec2(0.01, -0.14)) / 0.25) * 0.85;
    a = max(max(b0, b1), max(b2, b3));
    col *= clamp(0.76 + 0.24 * (q.y * 1.6 + 0.25), 0.58, 1.04);
  }
  a *= vAlpha;
  if (a < 0.01) discard;
  if (uKind == 1 || uKind == 6) col += vec3(0.35) * smoothstep(0.12, 0.0, length(q - vec2(-0.12, 0.12)));
  if (uKind == 0 || uKind == 4 || uKind == 5 || uKind == 7) col *= uTint;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FxLighting {
  sunColor: number;
  skyHorizon: number;
  stars: number;
}

interface Emitter {
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
}

export interface FxHandle {
  root: THREE.Group;
  /** show exactly the given effects (pure function of the frame) */
  apply(fx: FxFrame[], pointScale: number, lighting?: FxLighting): void;
  /** number of effects currently visible */
  active(): number;
  dispose(): void;
}

const _sun = new THREE.Color();
const _sky = new THREE.Color();
const _white = new THREE.Color(0xffffff);
const _tint = new THREE.Color(0xffffff);

function makeGeometry(def: FxDef, seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const n = def.count;
  const seeds = new Float32Array(n * 4);
  const index = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) seeds[i * 4 + j] = r();
    index[i] = i / n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  g.setAttribute("aIndex", new THREE.BufferAttribute(index, 1));
  return g;
}

export function createFx(): FxHandle {
  const root = new THREE.Group();
  root.name = "fx";
  const geos = new Map<FxId, THREE.BufferGeometry>();
  const pools = new Map<FxId, Emitter[]>();
  let activeCount = 0;
  const used = new Map<FxId, number>();

  const emitter = (id: FxId, slot: number): Emitter => {
    const pool = pools.get(id) ?? [];
    pools.set(id, pool);
    while (pool.length <= slot) {
      const def = FX_DEFS[id];
      let g = geos.get(id);
      if (!g) {
        g = makeGeometry(def, 1000 + FX_IDS.indexOf(id) * 17);
        geos.set(id, g);
      }
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uK: { value: 0 },
          uScale: { value: 600 },
          uSize: { value: def.size },
          uKind: { value: def.kind },
          uColor: { value: new THREE.Color(def.color) },
          uColor2: { value: new THREE.Color(def.color2) },
          uTint: { value: new THREE.Color(0xffffff) },
        },
        transparent: true,
        depthWrite: false,
        blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const points = new THREE.Points(g, mat);
      points.frustumCulled = false;
      points.renderOrder = 5;
      points.name = `fx:${id}:${pool.length}`;
      points.visible = false;
      root.add(points);
      pool.push({ points, mat });
    }
    return pool[slot];
  };

  return {
    root,
    apply(fx, pointScale, lighting) {
      for (const pool of pools.values()) for (const e of pool) e.points.visible = false;
      used.clear();
      activeCount = 0;
      if (lighting) {
        _sun.setHex(lighting.sunColor);
        _sky.setHex(lighting.skyHorizon);
        const night = Math.min(1, Math.max(0, Number.isFinite(lighting.stars) ? lighting.stars : 0));
        _tint.copy(_sun).lerp(_sky, 0.35).lerp(_white, 0.35 * (1 - night)).multiplyScalar(1 - 0.54 * night);
      } else {
        _tint.setRGB(1, 1, 1);
      }
      for (const f of fx) {
        const def = FX_DEFS[f.id];
        if (!def || !(f.k >= 0 && f.k <= 1)) continue;
        const slot = used.get(f.id) ?? 0;
        used.set(f.id, slot + 1);
        const e = emitter(f.id, slot);
        const lift = f.at[1] < 0.05 ? def.lift : 0;
        e.points.position.set(f.at[0], f.at[1] + lift, f.at[2]);
        e.mat.uniforms.uK.value = f.k;
        e.mat.uniforms.uScale.value = pointScale;
        (e.mat.uniforms.uTint.value as THREE.Color).copy(_tint);
        e.points.visible = true;
        activeCount++;
      }
    },
    active: () => activeCount,
    dispose() {
      for (const pool of pools.values()) for (const e of pool) e.mat.dispose();
      for (const g of geos.values()) g.dispose();
      pools.clear();
      geos.clear();
    },
  };
}
