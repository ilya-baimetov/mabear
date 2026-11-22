// Ambient atmospheric particle layer (pollen/dandelion motes, dusk/night fireflies, indoor hearth dust).
// Uses a single pooled THREE.Points mesh driven purely by (t, location, windowGlow, pointScale) for exact scrubbing.
import * as THREE from "three";
import type { SceneLocation } from "../../shared/bible/set";
import { HOUSE_ORIGIN } from "../../shared/houseLayout";
import { rng } from "../look";

const PARTICLE_COUNT = 72;

const VERT = /* glsl */ `
attribute vec4 aSeed;   // 4 deterministic uniform randoms per particle
attribute vec2 aSeed2;  // 2 extra uniform randoms (drift phase, tint)
uniform float uTime;
uniform float uScale;
uniform float uFirefly; // 0 = daytime pollen/dust, 0..1 = dusk/night fireflies
uniform float uIndoor;  // 1 = interior dust motes, 0 = exterior
uniform vec3 uOrigin;
uniform vec3 uSpan;
varying float vAlpha;
varying float vTint;
varying float vFirefly;
void main() {
  // Deterministic wrapping drift within the active zone box
  vec3 drift = mix(vec3(0.24, 0.04, 0.11), vec3(0.035, 0.055, 0.02), uIndoor);
  drift = mix(drift, vec3(0.08, 0.02, 0.07), uFirefly);
  float speed = 0.45 + 0.65 * aSeed.w;
  vec3 pos01 = fract(aSeed.xyz + drift * (uTime * speed) / max(uSpan, vec3(0.1)));
  vec3 p = uOrigin + pos01 * uSpan;

  // Gentle organic sway / firefly bobbing
  float swayAmp = mix(0.32, 0.14, uIndoor);
  float bobAmp = mix(0.16, 0.34, uFirefly);
  p.x += sin(uTime * (0.55 + aSeed2.x * 0.65) + aSeed.y * 6.28318) * swayAmp;
  p.y += sin(uTime * (0.75 + aSeed2.y * 0.75) + aSeed.x * 6.28318) * bobAmp;
  p.z += cos(uTime * (0.50 + aSeed2.x * 0.55) + aSeed.z * 6.28318) * swayAmp;

  // Smooth box-edge fade so wrapping particles never pop
  vec3 edge = min(pos01, 1.0 - pos01);
  float boxFade = smoothstep(0.0, 0.12, min(edge.x, min(edge.y, edge.z)));

  // Firefly pulse vs gentle dust/pollen shimmer
  float blinkPhase = uTime * (1.1 + aSeed.w * 1.5) + aSeed2.x * 6.28318;
  float fireflyPulse = pow(0.5 + 0.5 * sin(blinkPhase), 2.2);
  float dustShimmer = 0.62 + 0.38 * sin(uTime * (0.7 + aSeed.w * 0.9) + aSeed2.y * 6.28318);

  float baseSize = mix(0.068, 0.052, uIndoor);
  baseSize = mix(baseSize, 0.145, uFirefly) * (0.75 + 0.55 * aSeed.w);
  float baseAlpha = mix(0.46, 0.36, uIndoor) * dustShimmer;
  float fireflyAlpha = mix(0.16, 1.0, fireflyPulse);

  vAlpha = boxFade * mix(baseAlpha, fireflyAlpha * uFirefly, step(0.0001, uFirefly));
  vTint = aSeed2.y;
  vFirefly = uFirefly;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(0.0, baseSize * uScale / max(0.1, -mv.z));
}`;

const FRAG = /* glsl */ `
uniform float uPollenVis;
varying float vAlpha;
varying float vTint;
varying float vFirefly;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  if (r > 0.5) discard;

  vec3 col;
  float shape;
  if (vFirefly > 0.0001) {
    // Bright warm chartreuse-amber firefly core + soft additive glow halo
    float core = smoothstep(0.18, 0.02, r);
    float halo = exp(-r * r * 14.0) * 0.65;
    shape = core + halo;
    vec3 ffCol = mix(vec3(1.0, 0.80, 0.22), vec3(0.78, 1.0, 0.32), vTint);
    col = ffCol * (0.85 + 1.8 * core);
  } else {
    // Soft golden meadow pollen / indoor sunlit dust mote
    shape = smoothstep(0.5, 0.08, r) * uPollenVis;
    col = mix(vec3(1.0, 0.91, 0.64), vec3(1.0, 0.98, 0.86), vTint);
  }

  float a = shape * vAlpha;
  if (a < 0.005) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface AtmosphereHandle {
  root: THREE.Group;
  update(t: number, location: SceneLocation, windowGlow: number, pointScale: number): void;
  dispose(): void;
}

const ZONE_BOUNDS: Record<SceneLocation, { origin: [number, number, number]; span: [number, number, number] }> = {
  yard: { origin: [-13, 0.35, -10], span: [26, 3.3, 24] },
  pond: { origin: [-13.5, 0.25, 4.5], span: [11, 2.7, 11] },
  wolves: { origin: [7, 0.3, -6], span: [11, 3.0, 10] },
  house: { origin: [HOUSE_ORIGIN[0] - 7, 0.3, HOUSE_ORIGIN[1] - 3], span: [10, 3.0, 6] },
};

function smoothstep(e0: number, e1: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

export function createAtmosphere(): AtmosphereHandle {
  const root = new THREE.Group();
  root.name = "fx:atmosphere";

  const r = rng(4242);
  const seeds = new Float32Array(PARTICLE_COUNT * 4);
  const seeds2 = new Float32Array(PARTICLE_COUNT * 2);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    seeds[i * 4] = r();
    seeds[i * 4 + 1] = r();
    seeds[i * 4 + 2] = r();
    seeds[i * 4 + 3] = r();
    seeds2[i * 2] = r();
    seeds2[i * 2 + 1] = r();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute("aSeed2", new THREE.BufferAttribute(seeds2, 2));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 600 },
      uFirefly: { value: 0 },
      uIndoor: { value: 0 },
      uPollenVis: { value: 1 },
      uOrigin: { value: new THREE.Vector3(...ZONE_BOUNDS.yard.origin) },
      uSpan: { value: new THREE.Vector3(...ZONE_BOUNDS.yard.span) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "fx:atmosphere:particles";
  points.frustumCulled = false;
  points.renderOrder = 4;
  root.add(points);

  return {
    root,
    update(t, location, windowGlow, pointScale) {
      const indoor = location === "house";
      const glow = Number.isFinite(windowGlow) ? Math.min(1, Math.max(0, windowGlow)) : 0;
      const firefly = !indoor && glow > 0.35 ? smoothstep(0.35, 0.72, glow) : 0;
      const pollenVis = indoor ? 1 : 1 - smoothstep(0.22, 0.35, glow);
      const zone = ZONE_BOUNDS[location] ?? ZONE_BOUNDS.yard;

      const u = material.uniforms;
      u.uTime.value = Number.isFinite(t) ? t : 0;
      u.uScale.value = Number.isFinite(pointScale) ? pointScale : 600;
      u.uFirefly.value = firefly;
      u.uIndoor.value = indoor ? 1 : 0;
      u.uPollenVis.value = pollenVis;
      (u.uOrigin.value as THREE.Vector3).set(zone.origin[0], zone.origin[1], zone.origin[2]);
      (u.uSpan.value as THREE.Vector3).set(zone.span[0], zone.span[1], zone.span[2]);

      const targetBlend = firefly > 0 ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (material.blending !== targetBlend) material.blending = targetBlend;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
