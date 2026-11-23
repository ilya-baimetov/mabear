import * as THREE from "three";
import type { Vec2 } from "../../../shared/schema";
import { paint, xf } from "../../look";
import { rng } from "../../math/rng";
import { DETAIL_MEAN_SRGB, type EnvTextures } from "../textures";
import { openGround, pathX, type BuildCtx, type GroundDetailUniforms } from "./geometry";

export type { GroundDetailUniforms };

/** Ground elevation: flat in the yard, gentle rolling hills beyond ~26 m. */
export function groundY(x: number, z: number): number {
  const d = Math.hypot(x, z * 1.1);
  if (d < 24) return 0;
  const k = Math.min(1, (d - 24) / 18);
  return k * k * (1.4 + Math.sin(x * 0.11) * 0.9 + Math.cos(z * 0.13 + 1) * 0.8);
}

/** linear value of the detail maps' neutral mean (they multiply the painted layout without shifting its palette) */
const DETAIL_MEAN_LIN = Math.pow((DETAIL_MEAN_SRGB + 0.055) / 1.055, 2.4);

type GroundTexKey = "uGrass" | "uDirt" | "uGrassN" | "uDirtN";
const detailPlaceholders = new WeakMap<GroundDetailUniforms, Partial<Record<GroundTexKey, THREE.DataTexture>>>();

function solidTex(r: number, g: number, b: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Ground detail (A5): the painted 64 m layout texture stays the macro colour (paths, worn clearing, shore); tiled CC0
 * grass and dirt detail + normal maps are blended on top by a mask derived from the layout colour (brown = dirt).
 * Neutral 1×1 placeholders until the textures load (identical to the pre-A5 look), so the program never recompiles.
 */
export function installGroundDetail(mat: THREE.MeshStandardMaterial, T: number): GroundDetailUniforms {
  const placeholders: Record<GroundTexKey, THREE.DataTexture> = {
    uGrass: solidTex(217, 217, 217, true),
    uDirt: solidTex(217, 217, 217, true),
    uGrassN: solidTex(128, 128, 255, false),
    uDirtN: solidTex(128, 128, 255, false),
  };
  const u: GroundDetailUniforms = {
    uGrass: { value: placeholders.uGrass },
    uDirt: { value: placeholders.uDirt },
    uGrassN: { value: placeholders.uGrassN },
    uDirtN: { value: placeholders.uDirtN },
    uDetailScale: { value: T / 2.4 }, // one grass tile per 2.4 m
    uDetailAmt: { value: 0 },
    uNormalAmt: { value: 0 },
  };
  detailPlaceholders.set(u, placeholders);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uGrassN; uniform sampler2D uDirtN;
uniform float uDetailScale; uniform float uDetailAmt; uniform float uNormalAmt;
float gDirt = 0.0;
vec2 rotDetailUv(vec2 uv, float a, vec2 off) {
  float c = cos(a), s = sin(a);
  return vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + off;
}
vec2 rotDetailN(vec2 xy, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * xy.x - s * xy.y, s * xy.x + c * xy.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  vec2 duv = vMapUv * uDetailScale;
  vec3 mc = sampledDiffuseColor.rgb;
  gDirt = smoothstep(0.0, 0.05, mc.r - mc.g * 0.9);
  float macroMix = 0.36 + 0.16 * (0.5 + 0.5 * sin(duv.x * 0.21 + sin(duv.y * 0.17) * 1.4));
  // Dual-scale rotated UV breakup on both grass and dirt eliminates far-hillside tiling stripes
  vec2 guv2 = rotDetailUv(duv * 0.37, 0.73, vec2(0.37, 0.71));
  vec2 duv2 = rotDetailUv(duv * 0.53, -0.58, vec2(0.19, 0.43));
  vec3 gr = mix(texture2D(uGrass, duv).rgb, texture2D(uGrass, guv2).rgb, macroMix);
  vec3 dt = mix(texture2D(uDirt, duv * 1.3).rgb, texture2D(uDirt, duv2).rgb, macroMix);
  vec3 det = mix(gr, dt, gDirt) / ${DETAIL_MEAN_LIN.toFixed(4)};
  diffuseColor.rgb *= mix(vec3(1.0), det, uDetailAmt);
}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  vec2 duv = vMapUv * uDetailScale;
  float macroMix = 0.36 + 0.16 * (0.5 + 0.5 * sin(duv.x * 0.21 + sin(duv.y * 0.17) * 1.4));
  vec2 guv2 = rotDetailUv(duv * 0.37, 0.73, vec2(0.37, 0.71));
  vec2 duv2 = rotDetailUv(duv * 0.53, -0.58, vec2(0.19, 0.43));
  vec3 tg1 = texture2D(uGrassN, duv).xyz * 2.0 - 1.0;
  vec3 tg2 = texture2D(uGrassN, guv2).xyz * 2.0 - 1.0;
  tg2.xy = rotDetailN(tg2.xy, -0.73);
  vec3 tg = normalize(mix(tg1, tg2, macroMix));
  vec3 td1 = texture2D(uDirtN, duv * 1.3).xyz * 2.0 - 1.0;
  vec3 td2 = texture2D(uDirtN, duv2).xyz * 2.0 - 1.0;
  td2.xy = rotDetailN(td2.xy, 0.58);
  vec3 td = normalize(mix(td1, td2, macroMix));
  vec3 tn = normalize(mix(tg, td, gDirt));
  // tangent ≈ +x, bitangent ≈ -z on the (nearly flat) ground; perturb the geometric normal by the detail delta
  vec3 wn = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(tn.x, tn.z, -tn.y), uNormalAmt));
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  normal = normalize(normal + (viewMatrix * vec4(wn, 0.0)).xyz - up);
}`,
      );
  };
  mat.customProgramCacheKey = () => "set:ground:detail:v2";
  return u;
}

/** Swap loaded CC0 detail textures into ground uniforms, disposing any replaced placeholder DataTextures. */
export function applyGroundDetailTextures(u: GroundDetailUniforms, t: EnvTextures): void {
  const placeholders = detailPlaceholders.get(u);
  const swap = (uk: GroundTexKey, tex?: THREE.Texture) => {
    if (!tex) return;
    const ph = placeholders?.[uk];
    if (ph && u[uk].value === ph && tex !== ph) {
      ph.dispose();
      delete placeholders[uk];
    }
    u[uk].value = tex;
  };
  swap("uGrass", t.grass);
  swap("uDirt", t.dirt);
  swap("uGrassN", t.grassN);
  swap("uDirtN", t.dirtN);
  u.uDetailAmt.value = t.grass || t.dirt ? 0.58 : 0;
  u.uNormalAmt.value = t.grassN || t.dirtN ? 0.35 : 0;
}

/** Dispose ground detail textures and any unreplaced placeholder DataTextures. */
export function disposeGroundDetail(u: GroundDetailUniforms): void {
  const placeholders = detailPlaceholders.get(u);
  const seen = new Set<THREE.Texture>();
  for (const k of ["uGrass", "uDirt", "uGrassN", "uDirtN"] as const) {
    if (!seen.has(u[k].value)) {
      seen.add(u[k].value);
      u[k].value.dispose();
    }
    const ph = placeholders?.[k];
    if (ph && !seen.has(ph)) {
      seen.add(ph);
      ph.dispose();
    }
  }
  detailPlaceholders.delete(u);
}

function groundTexture(T: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  // Paint the low-frequency layers on a small canvas (cheap), upscale smoothly (free blur), then add fine grain.
  const L = 512, S = 1024;
  const lo = document.createElement("canvas");
  lo.width = lo.height = L;
  // CPU-backed canvas: no GPU readback, no canvas filters (both are very slow under SwiftShader)
  const ctx = lo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const px = L / T;
  const X = (x: number) => (x + T / 2) * px;
  const Z = (z: number) => (z + T / 2) * px;
  const r = rng(9);
  ctx.fillStyle = "#7d9f50";
  ctx.fillRect(0, 0, L, L);
  const greens = ["#68934c", "#91ae61", "#618447", "#86a853", "#a3b96a", "#7b9f4e"];
  for (let i = 0; i < 520; i++) {
    ctx.fillStyle = greens[i % greens.length];
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(r() * L, r() * L, (0.6 + r() * 3) * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // forest-floor fade toward the border (matches the clamped edge)
  const grd = ctx.createRadialGradient(L / 2, L / 2, 21 * px, L / 2, L / 2, 31 * px);
  grd.addColorStop(0, "rgba(84,128,48,0)");
  grd.addColorStop(1, "rgba(84,128,48,1)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, L, L);
  // sun-dried worn clearing
  ctx.fillStyle = "rgba(169,177,91,0.19)";
  ctx.beginPath();
  ctx.ellipse(X(-1.5), Z(-0.5), 5.5 * px, 3.8 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  // under the house and porch, the woodpile, the garden
  ctx.fillStyle = "rgba(82,100,50,0.85)";
  ctx.beginPath(); ctx.ellipse(X(-6.5), Z(-6.0), 4.2 * px, 3.3 * px, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(170,146,100,0.7)";
  ctx.beginPath();
  ctx.ellipse(X(-12.6), Z(-5.6), 1.9 * px, 1.6 * px, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(130,104,66,0.55)";
  ctx.fillRect(X(2.7), Z(-9.1), 5.4 * px, 4.2 * px);
  // dirt path from the south into the yard, and worn trails
  const strokePath = (pts: Vec2[], w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * px;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.stroke();
  };
  const path: Vec2[] = [];
  for (let z = 33; z >= 9; z -= 1) path.push([pathX(z), z]);
  path.push([0.2, 6], [-0.6, 3], [-2.6, 0.2], [-4.6, -1.2], [-6, -3.95]);
  strokePath(path, 2.15, "rgba(181,158,101,0.95)");
  strokePath(path, 1.55, "rgba(218,195,139,0.95)");
  strokePath(path.slice(0, 26), 1.28, "rgba(230,208,157,0.8)");
  strokePath([[-2.6, .2], [0, -1.5], [3, -3.8], [5, -4.8], [8, -5.4], [10, -7.9]], 1.0, "rgba(207,182,126,0.72)");
  strokePath([[-12.2, -5.0], [-10.5, -2.4], [-7.4, -1.6]], 0.9, "rgba(168,150,92,0.4)");
  // soften (separable box blur, radius 2) and upsample bilinearly with fine grain into a DataTexture
  const src = ctx.getImageData(0, 0, L, L).data;
  const tmp = new Float32Array(L * L * 3);
  const sm = new Float32Array(L * L * 3);
  const R = 2;
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const xx = Math.min(L - 1, Math.max(0, x + k));
      const i = (y * L + xx) * 4;
      r0 += src[i]; g0 += src[i + 1]; b0 += src[i + 2]; n++;
    }
    const o = (y * L + x) * 3;
    tmp[o] = r0 / n; tmp[o + 1] = g0 / n; tmp[o + 2] = b0 / n;
  }
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const yy = Math.min(L - 1, Math.max(0, y + k));
      const i = (yy * L + x) * 3;
      r0 += tmp[i]; g0 += tmp[i + 1]; b0 += tmp[i + 2]; n++;
    }
    const o = (y * L + x) * 3;
    sm[o] = r0 / n; sm[o + 1] = g0 / n; sm[o + 2] = b0 / n;
  }
  const out = new Uint8Array(S * S * 4);
  const f = L / S;
  for (let y = 0; y < S; y++) {
    const sy = Math.min(L - 1.001, y * f);
    const y0 = Math.floor(sy), ty = sy - y0;
    for (let x = 0; x < S; x++) {
      const sx = Math.min(L - 1.001, x * f);
      const x0 = Math.floor(sx), tx = sx - x0;
      const i00 = (y0 * L + x0) * 3, i10 = i00 + 3, i01 = i00 + L * 3, i11 = i01 + 3;
      const nz = 1 + (r() - 0.5) * 0.2;
      // DataTexture rows go bottom-up (flipY is not applied): row y=0 is v=0 (south edge, z=+T/2)
      const o = ((S - 1 - y) * S + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sm[i00 + c] * (1 - tx) + sm[i10 + c] * tx;
        const bot = sm[i01 + c] * (1 - tx) + sm[i11 + c] * tx;
        out[o + c] = Math.min(255, (top * (1 - ty) + bot * ty) * nz);
      }
      out[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function buildGround(c: BuildCtx): void {
  const size = 300, seg = 60;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const T = 64; // textured area (m)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    uv.setXY(i, (x + T / 2) / T, 1 - (z + T / 2) / T);
  }
  g.computeVertexNormals();
  paint(g, 0xffffff); // white vertex colours: same shader program as the vertex-coloured, textured set materials
  const tex = groundTexture(T);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, ...(tex ? { map: tex } : {}) });
  if (!tex) mat.color.setHex(0x7c9b5e);
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    c.extra.groundUniforms = installGroundDetail(mat, T);
  }
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "set:ground:mesh";
  mesh.receiveShadow = true;
  c.dyn.push(mesh);
  c.extra.groundTex = tex;
  c.extra.disposables.push(g, mat);
  if (tex) c.extra.disposables.push(tex);
}

export function buildGrass(c: BuildCtx): void {
  // tuft prototype: 5 soft, slightly curved blades (2 segments each) fanning out, dark base -> sunlit tip
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color(0x6e8c4c), mid = new THREE.Color(0x9ab470), tip = new THREE.Color(0xc8d490);
  let v = 0;
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + (b % 2) * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const w = 0.035 + 0.012 * (b % 2);
    const hgt = 0.6 + 0.4 * ((b * 37) % 7) / 7;
    const lean = 0.3 + 0.18 * (b % 3);
    const px = -dz, pz = dx; // blade width direction
    const o = 0.05;
    // base pair, mid pair (bent outward), tip
    pos.push(dx * o + px * w, 0, dz * o + pz * w, dx * o - px * w, 0, dz * o - pz * w);
    pos.push(dx * lean * 0.45 + px * w * 0.7, hgt * 0.55, dz * lean * 0.45 + pz * w * 0.7, dx * lean * 0.45 - px * w * 0.7, hgt * 0.55, dz * lean * 0.45 - pz * w * 0.7);
    pos.push(dx * lean, hgt, dz * lean);
    for (const cc of [base, base, mid, mid, tip]) col.push(cc.r, cc.g, cc.b);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2, v + 2, v + 3, v + 4);
    v += 5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // normals pointing up so tufts light like the ground (soft, no harsh backfaces)
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  mat.name = "set:grass";
  // wind sway + warm sunlit tip translucency in the shader (deterministic in frame time t)
  const wind = c.extra.grassUniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wind);
    // two-sided blades keep the UP normal on both faces (no back-face flip → no dark blades)
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uDayFade;\nvarying float vGrassTip;")
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);")
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
{
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 Vv = normalize(vViewPosition);
  float back = pow(clamp(dot(-Vv, Lv) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  float gtip = pow(clamp(vGrassTip, 0.0, 1.0), 1.4);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * vec3(0.75, 0.90, 0.35) * (0.18 + 0.32 * back) * gtip * uDayFade;
}`,
      );
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying float vGrassTip;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  #else
  vec2 ip = vec2(0.0);
  #endif
  float hh = max(position.y, 0.0);
  vGrassTip = hh;
  float ph = uTime * 1.6 + ip.x * 0.31 + ip.y * 0.23;
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ip.x * 0.05 - ip.y * 0.04);
  float sw = (sin(ph) * 0.7 + sin(ph * 2.7 + ip.y) * 0.3) * gust * uWind;
  transformed.x += sw * hh * hh * 0.32;
  transformed.z += sw * hh * hh * 0.12;
}`,
      );
  };
  mat.customProgramCacheKey = () => "set:grass:wind-sss:v2";
  const r = rng(808);
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 65000 && mats.length < 14500; i++) {
    const x = (r() - 0.5) * 48, z = (r() - 0.5) * 46 + 3;
    const s = 0.09 + r() * 0.18;
    const rot = r() * Math.PI * 2;
    if (!openGround(x, z, 0.1)) continue;
    // clumpy: denser along edges, fences, house, trees; sparse in the worn clearing and on the path
    const worn = ((x + 1.5) / 6) ** 2 + ((z + 0.5) / 4.2) ** 2 < 1;
    const clump = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.cos(z * 0.7) * 2) * Math.cos(z * 1.1 - x * 0.3);
    if (r() > (worn ? 0.12 : 0.25 + 0.75 * clump)) continue;
    mats.push(xf([x, groundY(x, z), z], [0, rot, 0], [s * 1.3, s * (0.8 + r() * 0.6), s * 1.3]));
  }
  const im = new THREE.InstancedMesh(g, mat, mats.length);
  const ic = new THREE.Color(), warm = new THREE.Color(0xc4d278), lush = new THREE.Color(0x9ec06c), cool = new THREE.Color(0x7ca65c);
  mats.forEach((m, i) => {
    im.setMatrixAt(i, m);
    const t = r();
    ic.copy(t < 0.34 ? warm : t < 0.68 ? lush : cool).multiplyScalar(0.90 + r() * 0.18);
    im.setColorAt(i, ic);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = "set:grass:tufts";
  im.receiveShadow = true;
  im.castShadow = false;
  c.dyn.push(im);
  c.extra.grassMat = mat;
  c.extra.disposables.push(g, mat);
}
