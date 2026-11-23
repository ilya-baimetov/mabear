import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pondRadius } from "../../../shared/pond";
import {
  CREEK_POINTS,
  PIER_HEIGHT,
  PIER_START,
  PIER_YAW,
  YARD_BRIDGES_SPEC,
  bridgeDeckY,
} from "../../../shared/yardLayout";
import { GeoBag, xf } from "../../look";
import { rng } from "../../math/rng";
import { V, beam, blob, blossom, box, creekCurve, cyl, leaf, type BuildCtx, type WaterUniforms } from "./geometry";

/** Deterministic flowing creek ripples, Fresnel sky sheen, sun glints and whitewater edge foam. */
export function installWaterRipples(mat: THREE.MeshStandardMaterial, u: WaterUniforms): WaterUniforms {
  mat.roughness = 0.09;
  mat.metalness = 0.04;
  mat.envMapIntensity = 1.55;
  const previous = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, renderer) => {
    previous.call(mat, sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSetWaterWorld;\nvarying vec2 vCreekUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCreekUv = uv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSetWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSetWaterWorld;
varying vec2 vCreekUv;
uniform float uSetWaterTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uDayFade;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float creekFoam = 0.0;
{
  float t = uSetWaterTime;
  float bank = abs(vCreekUv.x - 0.5) * 2.0;
  float streak = sin(vCreekUv.y * 3.7 - t * 2.3 + sin(vCreekUv.x * 9.0) * 1.4) * 0.5 + 0.5;
  float rippleMask = sin(vCreekUv.y * 8.5 - t * 3.2 + vCreekUv.x * 11.0) * 0.5 + 0.5;
  float edgeFoam = smoothstep(0.58, 0.98, bank) * smoothstep(0.30, 0.85, streak * 0.68 + rippleMask * 0.35);
  float midFoam = smoothstep(0.78, 0.98, streak * rippleMask) * 0.24;
  creekFoam = clamp(edgeFoam * 0.65 + midFoam, 0.0, 0.72);
  vec3 waterBody = diffuseColor.rgb * mix(vec3(0.24, 0.32, 0.52), vec3(0.88, 1.0, 0.97), uDayFade);
  vec3 foamCol = mix(vec3(0.36, 0.44, 0.60), vec3(0.88, 0.94, 0.95), uDayFade);
  diffuseColor.rgb = mix(waterBody, foamCol, creekFoam);
}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, creekFoam);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  float t = uSetWaterTime;
  vec2 flowA = vec2(vCreekUv.x * 3.4, vCreekUv.y * 1.45 - t * 1.2);
  vec2 flowB = vec2(vCreekUv.x * 5.8 + 0.4, vCreekUv.y * 2.4 - t * 1.75);
  float wx = cos(flowA.x * 4.5 + sin(flowA.y * 2.2) * 1.3) * 0.055 + cos(flowB.x * 6.0 - flowB.y * 2.5) * 0.032;
  float wz = cos(flowA.y * 3.8 + cos(flowA.x * 3.0) * 0.9) * 0.045 + cos(flowB.y * 5.2 + flowB.x * 2.0) * 0.028;
  normal = normalize(normal + mat3(viewMatrix) * vec3(wx, 0.0, wz));
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  vec3 Vv = normalize(vViewPosition);
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float fresnel = mix(0.06, 0.56, pow(1.0 - max(dot(normal, Vv), 0.0), 4.0));
  vec3 Rv = reflect(-Lv, normal);
  float spec = pow(max(dot(Rv, Vv), 0.0), 84.0);
  totalEmissiveRadiance += uSkyColor * mix(0.25, 0.65, uDayFade) * fresnel * (1.0 - creekFoam * 0.7);
  totalEmissiveRadiance += uSunColor * spec * mix(0.45, 1.15, uDayFade) * (1.0 - creekFoam * 0.6);
}`,
      );
  };
  mat.customProgramCacheKey = () => key + ":set-creek-flow-v2";
  return u;
}

export function buildPond(c: BuildCtx): void {
  const b = c.bag;
  const bankLeaf = (length: number, width: number) => {
    const points: number[] = [], indices: number[] = [];
    for (let row = 0; row <= 8; row++) {
      const t = row / 8, w = Math.pow(Math.sin(Math.PI * t), .75) * width;
      points.push(-w, Math.sin(t * Math.PI) * length * .07, t * length, 0, Math.sin(t * Math.PI) * length * .12, t * length, w, Math.sin(t * Math.PI) * length * .07, t * length);
      if (row) for (let col = 0; col < 2; col++) { const a = (row - 1) * 3 + col, cIdx = row * 3 + col; indices.push(a, cIdx, a + 1, a + 1, cIdx, cIdx + 1); }
    }
    const front = new THREE.BufferGeometry(); front.setAttribute("position", new THREE.Float32BufferAttribute(points, 3)); front.setIndex(indices); front.computeVertexNormals();
    const back = front.clone(); back.setIndex(indices.flatMap((_, i) => i % 3 ? [] : [indices[i], indices[i + 2], indices[i + 1]])); back.computeVertexNormals();
    const a = front.toNonIndexed(), bb = back.toNonIndexed(); front.dispose(); back.dispose();
    const merged = mergeGeometries([a, bb], false)!; a.dispose(); bb.dispose(); return merged;
  };
  // radial water mesh with a depth gradient + edge proximity attribute
  const segs = 128, rings = [0, 0.4, 0.7, 0.88, 1.0];
  const pos: number[] = [], col: number[] = [], edges: number[] = [], idx: number[] = [];
  const deep = new THREE.Color(0x18433b), shallow = new THREE.Color(0x4c795f), cc = new THREE.Color();
  pos.push(0, 0.03, 0);
  col.push(deep.r, deep.g, deep.b);
  edges.push(0);
  for (let ri = 1; ri < rings.length; ri++) {
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const rr = pondRadius(th) * rings[ri];
      pos.push(Math.cos(th) * rr, 0.03, Math.sin(th) * rr);
      cc.copy(deep).lerp(shallow, Math.pow(rings[ri], 2.0));
      col.push(cc.r, cc.g, cc.b);
      edges.push(rings[ri]);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let ri = 1; ri < rings.length - 1; ri++) {
    const o0 = 1 + (ri - 1) * segs, o1 = 1 + ri * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(o0 + s, o0 + s1, o1 + s, o0 + s1, o1 + s1, o1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // ensure upward normals (winding)
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  // Real planar reflection is confined to this scene and rendered at half resolution.
  // It reflects the actual trees/actors instead of painting fake tree shadows into the water.
  const mirrorGeometry = g.clone().translate(0, -.03, 0).rotateX(Math.PI / 2);
  const mirror = new Reflector(mirrorGeometry, { textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .003, color: 0x55735b });
  mirror.name = "set:pond:reflection"; mirror.rotation.x = -Math.PI / 2; mirror.position.y = .032;
  const renderReflection = mirror.onBeforeRender; let software: boolean | undefined, lastReflection = -Infinity;
  const reflectedPosition = new THREE.Vector3(1e6, 1e6, 1e6), reflectedRotation = new THREE.Quaternion();
  mirror.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    if (software === undefined) {
      const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      software = /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
      if (software) { mirror.getRenderTarget().setSize(256, 256); (mirror.material as THREE.ShaderMaterial).uniforms.uReflectionTexel.value = 1 / 256; }
    }
    const t = c.extra.waterUniforms.uSetWaterTime.value;
    // Software WebGL uses a small reflection cache; genuine camera cuts and seeks refresh immediately.
    // Ripple animation still runs every frame, and hardware keeps full-rate actor reflections.
    const cameraCut = camera.position.distanceToSquared(reflectedPosition) > .04 || camera.quaternion.angleTo(reflectedRotation) > .045;
    if (software && !cameraCut && t >= lastReflection && t - lastReflection < .125) return;
    renderReflection.call(this, renderer, scene, camera, geometry, material, group);
    lastReflection = t; reflectedPosition.copy(camera.position); reflectedRotation.copy(camera.quaternion);
  };
  const water = mirror.material as THREE.ShaderMaterial;
  water.fog = true;
  Object.assign(water.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uSetWaterTime: c.extra.waterUniforms.uSetWaterTime,
    uSunDir: c.extra.waterUniforms.uSunDir,
    uSunColor: c.extra.waterUniforms.uSunColor,
    uSkyColor: c.extra.waterUniforms.uSkyColor,
    uDayFade: c.extra.waterUniforms.uDayFade,
    uReflectionTexel: { value: 1 / 512 },
    uRippleCenter: c.extra.pondRippleUniforms.uRippleCenter,
    uRippleStrength: c.extra.pondRippleUniforms.uRippleStrength,
  });
  mirror.userData.rippleUniforms = c.extra.pondRippleUniforms;
  water.vertexShader = /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    varying vec3 vBankColor;
    varying float vEdge;
    attribute vec3 color;
    attribute float aEdge;
    #include <common>
    #include <fog_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vWorldPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      vBankColor = color;
      vEdge = aEdge;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }`;
  water.fragmentShader = /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uSetWaterTime;
    uniform float uReflectionTexel;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform float uDayFade;
    uniform vec2 uRippleCenter;
    uniform float uRippleStrength;
    varying vec4 vUv;
    varying vec3 vWorldPos;
    varying vec3 vBankColor;
    varying float vEdge;
    #include <logdepthbuf_pars_fragment>
    #include <fog_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWorldPos.xz;
      float t = uSetWaterTime;
      // 3-layer oblique animated ripple normals
      float w1 = sin( dot( p, vec2( 2.6, 1.9 ) ) - t * 1.35 );
      float w2 = sin( dot( p, vec2( -3.8, 3.1 ) ) + t * 1.05 );
      float w3 = sin( dot( p, vec2( 5.7, -4.9 ) ) - t * 1.85 );
      vec2 d1 = vec2( 2.6, 1.9 ) * cos( dot( p, vec2( 2.6, 1.9 ) ) - t * 1.35 ) * 0.016;
      vec2 d2 = vec2( -3.8, 3.1 ) * cos( dot( p, vec2( -3.8, 3.1 ) ) + t * 1.05 ) * 0.012;
      vec2 d3 = vec2( 5.7, -4.9 ) * cos( dot( p, vec2( 5.7, -4.9 ) ) - t * 1.85 ) * 0.008;
      vec2 grad = d1 + d2 + d3;
      float rippleCrest = 0.0;
      if ( uRippleStrength > 0.001 ) {
        vec2 rp = p - uRippleCenter;
        float rDist = length( rp );
        vec2 rDir = rDist > 1e-4 ? rp / rDist : vec2( 0.0 );
        float rEnv = clamp( uRippleStrength, 0.0, 2.0 ) * exp( -rDist * 1.75 ) * ( 1.0 - smoothstep( 0.86, 1.0, vEdge ) ) * smoothstep( 0.015, 0.055, rDist );
        float rPhase1 = rDist * 24.0 - t * 6.5;
        float rPhase2 = rDist * 38.0 - t * 9.2;
        float rSlope = ( cos( rPhase1 ) * 0.075 + cos( rPhase2 ) * 0.032 ) * rEnv;
        grad += rDir * rSlope;
        rippleCrest = pow( max( 0.0, sin( rPhase1 ) * 0.72 + sin( rPhase2 ) * 0.28 ), 4.0 ) * rEnv;
      }
      vec3 N = normalize( vec3( -grad.x, 1.0, -grad.y ) );

      // Lively UV reflection distortion (~0.009 amplitude) with soft 5-tap blur
      vec4 rippleUv = vUv;
      rippleUv.xy += clamp( N.xz * 0.09, -0.014, 0.014 ) * vUv.w;
      vec2 stepUv = vec2( uReflectionTexel * 1.4 ) * vUv.w;
      vec4 base = texture2DProj( tDiffuse, rippleUv ) * 0.40;
      base += texture2DProj( tDiffuse, rippleUv + vec4( stepUv.x, stepUv.y, 0.0, 0.0 ) ) * 0.15;
      base += texture2DProj( tDiffuse, rippleUv + vec4( -stepUv.x, stepUv.y, 0.0, 0.0 ) ) * 0.15;
      base += texture2DProj( tDiffuse, rippleUv + vec4( stepUv.x, -stepUv.y, 0.0, 0.0 ) ) * 0.15;
      base += texture2DProj( tDiffuse, rippleUv + vec4( -stepUv.x, -stepUv.y, 0.0, 0.0 ) ) * 0.15;

      // Schlick Fresnel
      vec3 V = normalize( cameraPosition - vWorldPos );
      float ndv = max( dot( N, V ), 0.0 );
      float fresnel = mix( 0.10, 0.78, pow( 1.0 - ndv, 4.0 ) );

      // Rich shallow/deep teal-emerald tint darkening naturally into moonlit indigo at night
      vec3 dayDeep = vec3( 0.035, 0.145, 0.140 );
      vec3 dayShallow = mix( vec3( 0.10, 0.22, 0.16 ), vBankColor * 0.58, 0.45 );
      vec3 dayBody = mix( dayDeep, dayShallow, smoothstep( 0.15, 1.0, vEdge ) );
      vec3 nightBody = mix( vec3( 0.012, 0.024, 0.062 ), vec3( 0.025, 0.048, 0.088 ), vEdge );
      vec3 waterBody = mix( nightBody, dayBody, uDayFade );

      vec3 reflCol = mix( base.rgb, uSkyColor * mix( 0.24, 0.72, uDayFade ), 0.22 );
      vec3 col = mix( waterBody, reflCol, fresnel );

      // Sun/moon specular sparkle
      vec3 L = normalize( uSunDir );
      vec3 R = reflect( -L, N );
      float specTight = pow( max( dot( R, V ), 0.0 ), 96.0 );
      float specBroad = pow( max( dot( R, V ), 0.0 ), 24.0 );
      float glitter = 0.65 + 0.35 * sin( w1 * 3.1 + w2 * 2.7 - w3 * 2.3 );
      col += uSunColor * ( specTight * mix( 0.65, 1.35, uDayFade ) * glitter + specBroad * 0.07 * uDayFade );

      if ( rippleCrest > 0.001 ) {
        vec3 crestCol = mix( vec3( 0.48, 0.60, 0.82 ), vec3( 0.92, 0.98, 0.97 ), uDayFade );
        col = mix( col, crestCol, clamp( rippleCrest * 0.20, 0.0, 0.22 ) );
      }

      // Animated shoreline lapping foam near bank edge
      float lap = sin( vEdge * 28.0 - t * 2.1 + w1 * 1.3 + w2 * 0.9 );
      float shoreMask = smoothstep( 0.84, 0.985, vEdge );
      float foam = shoreMask * smoothstep( 0.18, 0.85, lap * 0.5 + 0.5 ) * 0.52 + smoothstep( 0.958, 1.0, vEdge ) * 0.30;
      vec3 foamCol = mix( vec3( 0.28, 0.36, 0.52 ), vec3( 0.78, 0.85, 0.83 ), uDayFade );
      col = mix( col, foamCol, clamp( foam, 0.0, 0.68 ) );

      gl_FragColor = vec4( col, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  water.needsUpdate = true;
  c.dyn.push(mirror); c.extra.disposables.push(mirror); g.dispose();
  // Natural wet sandy/pebble shoreline ribbon with damp darkened inner edge (dedicated material, no foliage noise).
  const shorePos: number[] = [], shoreIdx: number[] = [], shoreColors: number[] = [], shoreUv: number[] = [];
  const wetSilt = new THREE.Color(0x463d2d), drySand = new THREE.Color(0xb8a373), meadowRim = new THREE.Color(0x6b8747);
  for (let i = 0; i <= 96; i++) {
    const a = i / 96 * Math.PI * 2, rr = pondRadius(a);
    const access = Math.exp(-Math.pow(Math.atan2(Math.sin(a + Math.PI / 4), Math.cos(a + Math.PI / 4)) / .58, 2));
    for (const [j, radius] of [rr - .06, rr + .28 + access * .45 + .16 * Math.sin(a * 5)].entries()) {
      shorePos.push(Math.cos(a) * radius, j ? .017 : .006, Math.sin(a) * radius);
      shoreUv.push(i / 12, j);
      const outer = meadowRim.clone().lerp(drySand, .08 + access * .82);
      const inner = wetSilt.clone().lerp(new THREE.Color(0x6e6043), access * .55);
      const color = j ? outer : inner;
      shoreColors.push(color.r, color.g, color.b);
    }
    if (i) shoreIdx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
  }
  const shore = new THREE.BufferGeometry();
  shore.setAttribute("position", new THREE.Float32BufferAttribute(shorePos, 3));
  shore.setAttribute("color", new THREE.Float32BufferAttribute(shoreColors, 3));
  shore.setAttribute("uv", new THREE.Float32BufferAttribute(shoreUv, 2));
  shore.setIndex(shoreIdx); shore.computeVertexNormals();
  const shoreMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .02 });
  shoreMat.userData.setOwned = true;
  shoreMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vShoreUv;\nvarying vec3 vShoreW;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvShoreUv = uv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvShoreW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vShoreUv;
varying vec3 vShoreW;
float shoreHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float grain = shoreHash(floor(vShoreW.xz * 26.0)) * 0.55 + shoreHash(floor(vShoreW.xz * 11.0)) * 0.45;
  float damp = 1.0 - smoothstep(0.0, 0.55, vShoreUv.y);
  diffuseColor.rgb *= (0.86 + 0.24 * grain) * mix(1.0, 0.72, damp);
}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(0.24, 0.58, smoothstep(0.0, 0.7, vShoreUv.y));`);
  };
  shoreMat.customProgramCacheKey = () => "pond-wet-shore-v1";
  const shoreMesh = new THREE.Mesh(shore, shoreMat);
  shoreMesh.name = "set:pond:shoreline"; shoreMesh.castShadow = false; shoreMesh.receiveShadow = true;
  c.dyn.push(shoreMesh);
  // Smooth mossy shore stones (skip the pier/shore-mark sector)
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + r() * 0.8;
    const deg = ((Math.atan2(Math.sin(th + Math.PI / 4), Math.cos(th + Math.PI / 4)) * 180) / Math.PI);
    if (Math.abs(deg) < 32) continue;
    const rr = pondRadius(th) + 0.05 + r() * 0.2;
    const s = 0.18 + r() * 0.22;
    b.add("stone", blob(s, 200 + i, 0.16, 2, 0.65), 0x8f8c82, xf([Math.cos(th) * rr, s * 0.24, Math.sin(th) * rr], [r(), r() * 6, r()], [1.15, 0.58, 1]), {
      jitter: 0.1, seed: i, aoBottom: 0.35,
      colorFn: (p, n, out) => {
        if (n.y > 0.35 && p.y > 0.04) out.lerp(new THREE.Color(0x55713f), 0.45);
        else if (p.y < -0.02) out.multiplyScalar(0.72);
      },
    });
  }
  // Reeds and cattails on the far (north-west) edge with gentle wind sway
  const reedBag = new GeoBag();
  for (let i = 0; i < 65; i++) {
    const th = Math.PI * (0.65 + r() * 1.15);
    const rr = pondRadius(th) - 0.2 + r() * 0.5;
    const h = 0.7 + r() * 0.7;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const lean: [number, number, number] = [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25];
    for (let k = 0; k < 4; k++) reedBag.add("foliage", leaf(.55 + r() * .55, .045, .5), 0x486d35, xf([x, .015, z], [-.7, r() * 6.28, 0]));
    reedBag.add("foliage", cyl(0.012, 0.02, h, 4), 0x61913c, xf([x, h / 2, z], lean));
    if (i % 2 === 0) reedBag.add("foliage", cyl(0.035, 0.035, 0.16, 6), 0x6b3e22, xf([x + lean[2] * -h * 0.5, h - 0.05, z + lean[0] * h * 0.5], lean));
  }
  const reedGeo = reedBag.merged().get("foliage");
  reedBag.dispose();
  if (reedGeo) {
    const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
    reedMat.userData.setOwned = true;
    const ru = { uTime: c.extra.waterUniforms.uSetWaterTime };
    reedMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, ru);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  float rh = max(position.y, 0.0);
  float rsw = sin(uTime * 1.45 + position.x * 0.7 + position.z * 0.55) * pow(rh, 1.6);
  transformed.x += rsw * 0.085;
  transformed.z += rsw * 0.04;
}`,
        );
    };
    reedMat.customProgramCacheKey = () => "pond-reeds-sway-v1";
    const reeds = new THREE.Mesh(reedGeo, reedMat);
    reeds.name = "set:pond:reeds";
    reeds.castShadow = false;
    reeds.receiveShadow = true;
    c.dyn.push(reeds);
  }
  // Wide waxy bank leaves, low grasses and water plants interrupt the shoreline at different scales.
  for (let i = 0; i < 175; i++) {
    const th = r() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(th + Math.PI / 4), Math.cos(th + Math.PI / 4))) < .44) continue;
    const rr = pondRadius(th) - .12 + r() * .62, x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    for (let k = 0; k < 3; k++) b.add("foliage", bankLeaf(.18 + r() * .23, .065 + r() * .045), [0x537341, 0x64834c, 0x476139][i % 3], xf([x, .035, z], [-.2 - r() * .35, r() * Math.PI * 2, 0]));
  }
  // lily pads resting flush on the water surface (y = 0.036) with two pink flowers
  for (let i = 0; i < 7; i++) {
    const th = r() * Math.PI * 2;
    const rr = pondRadius(th) * (0.35 + r() * 0.45);
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const s = 0.22 + r() * 0.12;
    const pad = new THREE.CylinderGeometry(s, s, 0.012, 16, 1, false, 0.3, Math.PI * 2 - 0.6);
    b.add("foliage", pad, 0x547d40, xf([x, 0.036, z], [0, r() * 6, 0]), {
      colorFn: (p, _n, out) => {
        const d = Math.hypot(p.x, p.z) / s;
        if (d > 0.85) out.lerp(new THREE.Color(0x6e9850), 0.35);
      },
    });
    if (i < 2) blossom(b, x, 0.052, z, .11, 0xe5a6b9, i + 92);
  }
}

export function buildPier(c: BuildCtx): void {
  const b = c.bag;
  const L0 = -0.4, L1 = 3.1, Wd = 1.2, H = PIER_HEIGHT;
  const n = 12;
  const plank = (L1 - L0) / n;
  for (let i = 0; i < n; i++) {
    const z = L0 + (i + 0.5) * plank;
    b.add("wood", box(Wd + (i % 3 === 0 ? 0.06 : 0), 0.05, plank - 0.03), [0xab845a, 0x9f7a52, 0xb48c60][i % 3], xf([0, H - 0.025, z], [0, (i % 2 ? 0.015 : -0.01), 0]), { jitter: 0.08, seed: i });
  }
  for (const s of [-1, 1]) b.add("wood", box(0.08, 0.12, L1 - L0), 0x7d5c3c, xf([s * (Wd / 2 - 0.08), H - 0.1, (L0 + L1) / 2]));
  for (const zz of [0.6, 1.8, 3.0]) {
    for (const s of [-1, 1]) {
      const tall = zz === 3.0;
      const h = tall ? 1.15 : 0.75;
      b.add("wood", cyl(0.07, 0.08, h, 8), 0x7d5c3c, xf([s * (Wd / 2), H + h / 2 - 0.55, zz]), { capColor: 0xc8a070, capAxis: "y" });
    }
  }
}

/** Sync pier anchor transform from shared layout constants. */
export function applyPierLayout(anchor: THREE.Group): void {
  anchor.position.set(PIER_START[0], 0, PIER_START[1]);
  anchor.rotation.y = PIER_YAW;
}

export function buildCreek(c: BuildCtx): void {
  const b = c.bag;
  const curve = creekCurve(CREEK_POINTS);
  const N = 220;
  const pts = curve.getSpacedPoints(N);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const edge = new THREE.Color(0x5c8f88), mid = new THREE.Color(0x265d62);
  let distAlong = 0;
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    if (i > 0) distAlong += p.distanceTo(pts[i - 1]);
    const tan = curve.getTangentAt(i / N);
    const nx = -tan.z, nz = tan.x;
    const t = i / N;
    const w = (1.0 + 0.25 * Math.sin(t * 23) + 0.15 * Math.sin(t * 57)) * (t > 0.92 ? 1 + (t - 0.92) * 6 : 1);
    for (const [s, cc] of [[-1, edge], [-0.35, mid], [0.35, mid], [1, edge]] as [number, THREE.Color][]) {
      pos.push(p.x + nx * s * w * 0.6, 0.035, p.z + nz * s * w * 0.6);
      col.push(cc.r, cc.g, cc.b);
      uv.push((s + 1) * 0.5, distAlong);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) {
    const a = i * 4 + j, bb = (i + 1) * 4 + j;
    idx.push(a, a + 1, bb, a + 1, bb + 1, bb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const nrm = new Float32Array((N + 1) * 4 * 3);
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  b.addPainted("water", g);
  // smooth mossy bank stones (skip bridge approaches)
  const r = rng(33);
  for (let i = 0; i < 34; i++) {
    const t = r();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const s = r() < 0.5 ? -1 : 1;
    const off = 0.7 + r() * 0.3;
    const x = p.x - tan.z * s * off, z = p.z + tan.x * s * off;
    if (YARD_BRIDGES_SPEC.some((br) => Math.hypot(x - br.pos[0], z - br.pos[1]) < 1.6)) continue;
    const sz = 0.1 + r() * 0.18;
    b.add("stone", blob(sz, 300 + i, 0.16, 2, 0.65), 0x908e84, xf([x, sz * 0.25, z], [r(), r() * 6, r()], [1.1, 0.55, 1]), {
      jitter: 0.1, seed: i, aoBottom: 0.3,
      colorFn: (pt, n, out) => {
        if (n.y > 0.35 && pt.y > 0.02) out.lerp(new THREE.Color(0x577140), 0.42);
      },
    });
  }
}

export function buildBridge(c: BuildCtx, long: number): void {
  const b = c.bag;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = -1.35 + (i + 0.5) * (2.7 / n);
    const y = bridgeDeckY(x);
    const slope = -0.2 * (Math.PI / 2.8) * Math.sin((Math.PI * x) / 2.8);
    b.add("wood", box(2.7 / n - 0.03, 0.06, long), [0xa8794b, 0x9c6f45, 0xb38352][i % 3], xf([x, y - 0.03, 0], [0, 0, Math.atan(slope)]), { jitter: 0.08, seed: i });
  }
  for (const s of [-1, 1]) {
    const zz = s * (long / 2 - 0.04);
    for (const x of [-1.25, 0, 1.25]) {
      const y = bridgeDeckY(x);
      b.add("wood", cyl(0.045, 0.05, 0.75, 6), 0x7d5434, xf([x, y + 0.3, zz]));
    }
    for (const [x0, x1] of [[-1.25, 0], [0, 1.25]]) {
      const { g, m } = beam(V(x0, bridgeDeckY(x0) + 0.65, zz), V(x1, bridgeDeckY(x1) + 0.65, zz), 0.035, 0.035, 6);
      b.add("wood", g, 0x9a6a3e, m);
    }
  }
}

export const buildFootbridge = (c: BuildCtx): void => buildBridge(c, YARD_BRIDGES_SPEC[0].width);
export const buildPathBridge = (c: BuildCtx): void => buildBridge(c, YARD_BRIDGES_SPEC[1].width);
