import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COOKING_STATION } from "../../../shared/cookingStation";
import type { Vec3 } from "../../../shared/schema";
import {
  PORCH_HEIGHT,
  SET_ELEMENTS,
  TABLE_TOP,
  YARD_BENCH_SPEC,
  YARD_HAMMOCK_SPEC,
  YARD_SAMOVAR_SPEC,
  YARD_TABLE_SPEC,
} from "../../../shared/yardLayout";
import { GeoBag, xf } from "../../look";
import { rng } from "../../math/rng";
import { buildHouseDoor, updateHouseDoor } from "../houseDoor";
import { addFern, queueNature } from "./foliage";
import { V, beam, blob, blossom, box, cyl, leaf, sph, type BuildCtx } from "./geometry";

export { buildHouseDoor, updateHouseDoor };

export function buildHouse(c: BuildCtx): void {
  const b = c.bag;
  const W = 6.4, D = 4.8, r = 0.2, step = 0.37, base = 0.25;
  const rows = 16, groundRows = 9;
  // stone foundation
  b.add("stone", new RoundedBoxGeometry(W + 0.3, base, D + 0.3, 2, 0.06), 0x9a948a, xf([0, base / 2, 0]), { jitter: 0.1 });
  for (let i = 0; i < 13; i++) {
    b.add("stone", blob(.27, i + 500, .1, 1, .7), [0x8b8e7d, 0x989a88, 0x797e71][i % 3],
      xf([-W / 2 + .2 + i * .5, .13, D / 2 + .05], [0, i * 1.7, 0], [1.05, .48, .7]), { aoBottom: .25 });
  }
  const logCols = [0x98704c, 0x8d6747, 0xa27a51];
  const endGrain = 0xc5a379;
  for (let i = 0; i < rows; i++) {
    const y = base + r + i * step;
    const col = logCols[i % 3];
    // front/back (along x)
    for (const z of [D / 2, -D / 2]) {
      b.add("wood", cyl(r, r, W + 0.55, 16), col, xf([0, y, z], [0, 0, Math.PI / 2]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i });
    }
    // sides (along z), half a step higher (interlocking corners)
    for (const x of [W / 2, -W / 2]) {
      b.add("wood", cyl(r, r, D + 0.55, 16), col, xf([x, y + step / 2, 0], [Math.PI / 2, 0, 0]), { capColor: endGrain, capAxis: "y", jitter: 0.06, seed: i + 50 });
    }
  }
  const wallTop = base + rows * step + 0.1;
  // floor band between storeys
  b.add("paint", box(W + 0.7, 0.12, 0.06), 0xf2ead8, xf([0, base + groundRows * step + 0.06, D / 2 + r + 0.02]));
  // gable roof: ridge along z, gable facing front (+z)
  const half = W / 2 + 0.6, rise = 2.4, roofLen = D + 1.3;
  const slope = Math.atan2(rise, half);
  const slant = Math.hypot(half, rise);
  const planks = 13;
  for (const side of [-1, 1]) {
    for (let i = 0; i < planks; i++) {
      const z = -roofLen / 2 + (i + 0.5) * (roofLen / planks);
      const g = box(slant + 0.12, 0.12, roofLen / planks - 0.015);
      const cx = side * half / 2, cy = wallTop + rise / 2 + 0.06;
      b.add("wood", g, [0x9d5634, 0x8f4d2f, 0xa65d38][(i + (side > 0 ? 1 : 0)) % 3], xf([cx, cy + (i % 2) * 0.012, z], [0, 0, -side * slope]), { jitter: 0.08, seed: i * 3 + side });
    }
  }
  // Individual overlapping cedar shakes give the roof an honest thickness and irregular highlight rhythm.
  for (const side of [-1, 1]) {
    const shakeRows = 8, columns = 13;
    for (let row = 0; row < shakeRows; row++) for (let k = 0; k < columns; k++) {
      const d = (row + .5) / shakeRows * slant;
      const z = -roofLen / 2 + (k + .5) * roofLen / columns;
      const x = side * (half - d * Math.cos(slope));
      const y = wallTop + d * Math.sin(slope) + .13;
      const g = new RoundedBoxGeometry(slant / shakeRows + .09, .045, roofLen / columns - .025, 1, .015);
      b.add("wood", g, [0x805b47, 0x906650, 0x9a7055, 0x89604b][(row * 7 + k) % 4],
        xf([x, y + (k % 3) * .003, z], [0, 0, -side * slope]), { jitter: .035, seed: row * 17 + k });
    }
  }
  b.add("wood", cyl(0.11, 0.11, roofLen + 0.1, 8), 0x7a4127, xf([0, wallTop + rise + 0.12, 0], [Math.PI / 2, 0, 0]));
  // gable triangles (vertical boards)
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2 - 0.05, 0);
  tri.lineTo(W / 2 + 0.05, 0);
  tri.lineTo(0, rise * (W / 2 + 0.05) / half);
  tri.closePath();
  for (const z of [D / 2 - 0.05, -D / 2 - 0.15]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
    b.add("wood", g, 0xc98a52, xf([0, wallTop - 0.02, z]), { jitter: 0.05 });
  }
  // gable trim (carved white boards along the roof edge, front)
  for (const side of [-1, 1]) {
    b.add("paint", box(slant + 0.15, 0.16, 0.06), 0xf3ecdc, xf([side * half / 2, wallTop + rise / 2 + 0.02, roofLen / 2 + 0.01], [0, 0, -side * slope]));
  }
  // round attic window
  addWindow(b, 0, wallTop + 0.85, D / 2 + 0.17, 0.62, 0.62, true);
  // windows: ground + upper floor (front), one each side
  const gwY = base + 1.75, uwY = base + 4.75;
  addWindow(b, -1.95, gwY, D / 2 + r + 0.02, 0.95, 1.1);
  addWindow(b, 1.95, gwY, D / 2 + r + 0.02, 0.95, 1.1);
  addWindow(b, -1.6, uwY, D / 2 + r + 0.02, 0.85, 0.95);
  addWindow(b, 1.6, uwY, D / 2 + r + 0.02, 0.85, 0.95);
  for (const s of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationY((s * Math.PI) / 2);
    const wb = new GeoBag();
    addWindow(wb, 0, gwY, D / 2 + r + 0.02, 0.85, 1.0);
    addWindow(wb, 0, uwY, D / 2 + r + 0.02, 0.75, 0.85);
    // side windows sit on the side walls: rotate the front-wall layout by ±90° and scale z→x distance
    const fix = new THREE.Matrix4().makeTranslation(s * (W / 2 - D / 2), 0, 0);
    b.absorb(wb, fix.multiply(m));
    wb.dispose();
  }
  // door
  const dz = D / 2 + r + 0.04;
  const doorH = 2.75, doorW = 1.4, db = PORCH_HEIGHT;
  b.add("wood", box(doorW, doorH, 0.08), 0x8a5230, xf([0, db + doorH / 2, dz]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.x + 0.7) % 0.28) - 0.14) > 0.125) out.multiplyScalar(0.75); },
  });
  b.add("wood", box(doorW - 0.1, 0.1, 0.1), 0x74431f, xf([0, db + doorH * 0.75, dz + 0.04]));
  b.add("wood", box(doorW - 0.1, 0.1, 0.1), 0x74431f, xf([0, db + doorH * 0.25, dz + 0.04]));
  b.add("paint", box(doorW + 0.34, 0.16, 0.1), 0xf3ecdc, xf([0, db + doorH + 0.08, dz + 0.02]));
  for (const s of [-1, 1]) b.add("paint", box(0.14, doorH, 0.1), 0xf3ecdc, xf([s * (doorW / 2 + 0.07), db + doorH / 2, dz + 0.02]));
  b.add("metal", sph(0.06, 8, 6), 0x2b2b2b, xf([0.45, db + 1.3, dz + 0.08]));
  for (const yy of [db + .55, db + 2.2]) {
    b.add("metal", new RoundedBoxGeometry(.34, .045, .016, 1, .01), 0x3b3c32,
      xf([-doorW / 2 + .12, yy, dz + .055]));
    b.add("metal", cyl(.02, .02, .13, 8), 0x3b3c32, xf([-doorW / 2 + .02, yy, dz + .065]));
  }
  // Simple diagonal porch braces make the structure read as built, not floating sheets.
  for (const side of [-1, 1]) {
    const brace = beam(V(side * 2.23, PORCH_HEIGHT + 2.3, D / 2 + 1.82),
      V(side * 1.55, PORCH_HEIGHT + 2.98, D / 2 + 1.82), .065, .065, 8);
    b.add("wood", brace.g, 0x8d6848, brace.m);
  }
  // chimney (stone) on the right slope, toward the back
  b.add("stone", new RoundedBoxGeometry(0.75, 3.5, 0.75, 2, 0.05), 0xa39486, xf([1.9, wallTop + 1.25, -0.9]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.y + 10) % 0.3) - 0.15) < 0.018) out.multiplyScalar(0.7); },
    jitter: 0.12,
  });
  b.add("stone", box(0.92, 0.14, 0.92), 0x7d726a, xf([1.9, wallTop + 3.04, -0.9]));
  // porch: deck, steps, posts, canopy, back railings
  const pz0 = D / 2, pz1 = D / 2 + 2.0;
  b.add("wood", box(4.8, 0.1, 2.0), 0xb07a48, xf([0, PORCH_HEIGHT - 0.05, (pz0 + pz1) / 2]), {
    colorFn: (p, n, out) => { if (n.y > 0.5 && Math.abs(((p.x + 10) % 0.3) - 0.15) > 0.135) out.multiplyScalar(0.7); },
  });
  b.add("wood", box(4.8, PORCH_HEIGHT - 0.1, 0.12), 0x8e5f36, xf([0, (PORCH_HEIGHT - 0.1) / 2, pz1 - 0.06]));
  for (let sI = 0; sI < 2; sI++) {
    const top = PORCH_HEIGHT * (2 - sI) / 3;
    b.add("wood", box(4.8, 0.06, 0.3), 0xb98250, xf([0, top - 0.03, pz1 + 0.15 + sI * 0.3]));
    b.add("wood", box(4.8, top - 0.06, 0.28), 0x8e5f36, xf([0, (top - 0.06) / 2, pz1 + 0.15 + sI * 0.3]));
  }
  const postH = 3.0;
  for (const s of [-1, 1]) {
    b.add("wood", cyl(0.09, 0.1, postH, 10), 0xb07a48, xf([s * 2.25, PORCH_HEIGHT + postH / 2, pz1 - 0.15]), { capColor: endGrain, capAxis: "y" });
    // back railings
    b.add("wood", box(0.07, 0.07, 1.3), 0xb07a48, xf([s * 2.3, PORCH_HEIGHT + 0.6, pz0 + 0.65]));
    for (let k = 0; k < 4; k++) b.add("wood", box(0.05, 0.6, 0.05), 0xa36f40, xf([s * 2.3, PORCH_HEIGHT + 0.3, pz0 + 0.15 + k * 0.33]));
  }
  // canopy (two planked slopes)
  const cLen = 2.35, cRise = 0.45;
  const cSlope = Math.atan2(cRise, cLen);
  b.add("wood", box(5.2, 0.09, Math.hypot(cLen, cRise)), 0x98522f, xf([0, PORCH_HEIGHT + postH + cRise / 2 + 0.05, pz0 + cLen / 2], [cSlope, 0, 0]), {
    colorFn: (p, _n, out) => { if (Math.abs(((p.x + 10) % 0.4) - 0.2) > 0.185) out.multiplyScalar(0.72); },
  });
  b.add("paint", box(5.25, 0.12, 0.05), 0xf3ecdc, xf([0, PORCH_HEIGHT + postH + 0.02, pz1 + 0.2]));
  // a little bench of flowers boxes under the front windows (charm)
  for (const s of [-1, 1]) {
    const fy = gwY - 0.55 - 0.32;
    b.add("wood", box(1.1, 0.18, 0.24), 0x9a6a3e, xf([s * 1.95, fy, D / 2 + r + 0.14]));
    for (let k = 0; k < 6; k++) {
      const px = s * 1.95 - .45 + k * .18, pz = D / 2 + r + .14;
      b.add("foliage", cyl(.008, .012, .21, 5), 0x486b3a, xf([px, fy + .19, pz]));
      for (const side of [-1, 1]) b.add("foliage", leaf(.15, .045, .3), 0x597c44,
        xf([px, fy + .14, pz], [-.4, side * 1.6 + k, side * .3]));
      blossom(b, px, fy + .29 + .03 * (k % 2), pz, .065,
        [0xdb7160, 0xffd84a, 0xe7a3b2, 0xffffff, 0xdb7160, 0xa790bb][k], k);
    }
  }
  // porch lantern (glass glows at night; the look's point light sits here)
  b.add("glass", box(0.18, 0.26, 0.18), 0xffffff, xf([1.3, PORCH_HEIGHT + postH - 0.45, D / 2 + 1.75]));
  b.add("paint", box(0.24, 0.05, 0.24), 0x2a2a2a, xf([1.3, PORCH_HEIGHT + postH - 0.3, D / 2 + 1.75]));
  b.add("paint", cyl(0.01, 0.01, 0.25, 4), 0x2a2a2a, xf([1.3, PORCH_HEIGHT + postH - 0.15, D / 2 + 1.75]));

  // smoke (deterministic, driven by t in update)
  c.extra.smoke = makeSmoke(new THREE.Vector3(1.9, wallTop + 3.25, -0.9));
  c.dyn.push(c.extra.smoke);
}

function addWindow(b: GeoBag, x: number, y: number, z: number, w: number, h: number, round = false): void {
  const white = 0xe8dec7, blue = 0x4b817c;
  if (round) {
    b.add("glass", new THREE.CircleGeometry(w / 2, 20), 0xffffff, xf([x, y, z + 0.01]));
    b.add("paint", new THREE.TorusGeometry(w / 2, 0.06, 6, 20), white, xf([x, y, z + 0.03]));
    b.add("paint", box(w, 0.05, 0.04), white, xf([x, y, z + 0.03]));
    b.add("paint", box(0.05, h, 0.04), white, xf([x, y, z + 0.03]));
    return;
  }
  b.add("glass", box(w, h, 0.04), 0xffffff, xf([x, y, z]));
  const f = 0.09;
  b.add("paint", box(w + 2 * f, f, 0.08), white, xf([x, y + h / 2 + f / 2, z + 0.02]));
  b.add("paint", box(w + 2 * f + 0.12, f * 1.2, 0.12), white, xf([x, y - h / 2 - f / 2, z + 0.04]));
  for (const s of [-1, 1]) b.add("paint", box(f, h, 0.08), white, xf([x + s * (w / 2 + f / 2), y, z + 0.02]));
  b.add("paint", box(w, 0.045, 0.05), white, xf([x, y + h * 0.12, z + 0.03]));
  b.add("paint", box(0.045, h, 0.05), white, xf([x, y, z + 0.03]));
  // carved crown (nalichnik)
  const crown = new THREE.Shape();
  crown.moveTo(-w / 2 - f - 0.06, 0);
  crown.lineTo(w / 2 + f + 0.06, 0);
  crown.quadraticCurveTo(w / 4, 0.12, 0, 0.26);
  crown.quadraticCurveTo(-w / 4, 0.12, -w / 2 - f - 0.06, 0);
  b.add("paint", new THREE.ExtrudeGeometry(crown, { depth: 0.04, bevelEnabled: true, bevelSize: .018, bevelThickness: .012, bevelSegments: 2, steps: 1, curveSegments: 16 }), white, xf([x, y + h / 2 + f, z]));
  // open shutters
  for (const s of [-1, 1]) {
    const sx = x + s * (w / 2 + f + w / 4 + 0.02);
    b.add("paint", box(w / 2, h, 0.05), blue, xf([sx, y, z + 0.02]));
    for (const yy of [-0.4, 0, 0.4]) b.add("paint", box(w / 2 + 0.02, 0.05, 0.06), white, xf([sx, y + yy * h, z + 0.04]));
  }
}

function makeSmoke(at: THREE.Vector3): THREE.Points {
  const N = 26;
  const seeds = new Float32Array(N * 4);
  const r = rng(99);
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = i / N;
    seeds[i * 4 + 1] = r();
    seeds[i * 4 + 2] = r();
    seeds[i * 4 + 3] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uColor: { value: new THREE.Color(0xf4f1ec) }, uAlpha: { value: 0.5 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        float ph = fract(aSeed.x + uTime / 7.0);
        vec3 p = position + vec3(ph * 1.6 + sin(ph * 6.0 + aSeed.y * 6.28) * 0.25, ph * 3.4, sin(ph * 4.0 + aSeed.z * 6.28) * 0.3 - ph * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.35 + ph * 1.3 + aSeed.w * 0.2;
        gl_PointSize = size * uScale / max(0.1, -mv.z);
        vA = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * vA * uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.position.copy(at);
  pts.frustumCulled = false;
  pts.name = "set:chimney_smoke";
  return pts;
}

export function buildGarden(c: BuildCtx): void {
  const b = c.bag;
  const carrotBag = new GeoBag();
  const L = 4.45, Wd = 0.88;
  const beds = [1.2, 0, -1.2];
  beds.forEach((z, bi) => {
    // frame
    for (const s of [-1, 1]) {
      b.add("wood", box(L, 0.12, 0.07), 0x947049, xf([0, 0.06, z + s * (Wd / 2)]), { jitter: 0.08, seed: bi * 2 + s });
      b.add("wood", box(0.07, 0.12, Wd), 0x947049, xf([s * L / 2, 0.06, z]));
    }
    // Tilled dark loam soil bed with subtle sculpted longitudinal furrows
    const soilGeo = new THREE.BoxGeometry(L - 0.07, 0.12, Wd - 0.07, 18, 1, 8);
    const sp = soilGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      if (sp.getY(i) > 0.03) {
        const zz = sp.getZ(i), xx = sp.getX(i);
        const furrow = 0.016 * Math.cos((zz / (Wd * 0.45)) * Math.PI * 2.5) + 0.006 * Math.sin(xx * 4.5 + bi);
        sp.setY(i, sp.getY(i) + furrow);
      }
    }
    soilGeo.computeVertexNormals();
    b.add("soil", soilGeo, 0x4c3c2b, xf([0, 0.07, z]), {
      jitter: 0.22,
      seed: bi,
      colorFn: (p, _n, out) => {
        if (p.y > 0.04) out.multiplyScalar(0.84 + 0.28 * (0.5 + 0.5 * Math.cos((p.z / (Wd * 0.45)) * Math.PI * 2.5)));
      },
    });
    if (bi === 1) {
      for (let k = 0; k < 6; k++) addCabbage(b, -1.75 + k * 0.7, 0.13, z, 100 + k);
    } else {
      for (let k = 0; k < 9; k++) addCarrotTop(carrotBag, -1.7 + k * 0.42, 0.13, z + (k % 2 ? 0.1 : -0.1), bi * 20 + k);
    }
  });
  if (carrotBag.parts.size) {
    const fallback = carrotBag.build(c.mats, "set:garden:procedural_carrots", { cast: false });
    fallback.name = "set:garden:procedural_carrots";
    c.dyn.push(fallback);
  }
  carrotBag.dispose();
  // small picket fence on W, N, E sides (south side open: the garden mark)
  const runs: [number, number, number, number][] = [
    [-2.6, -1.95, 2.6, -1.95],
  ];
  for (const [x0, z0, x1, z1] of runs) addPickets(b, x0, z0, x1, z1, 0.68, 0.32, 0x9f8c65, 0.065);
  // Row markers, a low tool rest and border flowers make a tended kitchen garden.
  for (const z of beds) {
    b.add("wood", box(.025, .43, .025), 0xb39769, xf([-2.08, .22, z]));
    b.add("wood", box(.19, .12, .025), 0xd3b784, xf([-2.08, .43, z]));
  }
  for (const side of [-1, 1]) for (let k = 0; k < 8; k++) {
    const x = side * 2.55, z = -1.55 + k * .42, h = .30 + (k % 3) * .08;
    b.add("foliage", cyl(.01, .014, h, 5), 0x567d37, xf([x, h / 2, z]));
    for (const a of [0, 2.1, 4.2]) b.add("foliage", leaf(.21, .055, .4), 0x659044, xf([x, h * .4, z], [-.3, a + k, 0]));
    blossom(b, x, h, z, .09, k % 3 === 0 ? 0xe4ad37 : 0xf0cd57, k);
  }
}

/** Cupped cabbage leaf petal with curved ribs and outward-curled rim (two-sided closed shell for FrontSide). */
function cabbagePetal(radius: number, height: number): THREE.BufferGeometry {
  const cols = 3, rows = 3;
  const pts: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = base, 1 = curled rim
    const widthScale = Math.sin(v * Math.PI * 0.78 + 0.25);
    const y = v * height;
    const rad = radius * (0.55 + 0.55 * Math.sin(v * Math.PI * 0.52) + Math.pow(v, 3) * 0.26);
    for (let c = 0; c <= cols; c++) {
      const u = (c / cols - 0.5) * 2; // -1..1 across leaf width
      const ang = u * 0.95 * widthScale;
      const cup = rad + (1 - u * u) * radius * 0.12 * (1 - v * 0.4);
      pts.push(Math.sin(ang) * cup, y, Math.cos(ang) * cup);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, bb = a + cols + 1;
      idx.push(a, a + 1, bb, a + 1, bb + 1, bb);
    }
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  front.setIndex(idx);
  front.computeVertexNormals();
  const back = front.clone();
  back.setIndex(idx.flatMap((_, i) => (i % 3 ? [] : [idx[i], idx[i + 2], idx[i + 1]])));
  back.computeVertexNormals();
  const a = front.toNonIndexed(), b = back.toNonIndexed();
  front.dispose(); back.dispose();
  const merged = mergeGeometries([a, b], false)!;
  a.dispose(); b.dispose();
  return merged;
}

function addCabbage(b: GeoBag, x: number, y: number, z: number, seed: number): void {
  const r = rng(seed);
  // Crisp pale-green inner cabbage heart
  b.add("foliage", blob(0.115, seed, 0.05, 2, 0.78), 0xa7cd75, xf([x, y + 0.11, z]), { jitter: 0.06, aoBottom: 0.2, seed });
  const leafTint = (p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => {
    if (p.y > 0.14) out.lerp(new THREE.Color(0xa6cd75), 0.42);
    else if (p.y < 0.05) out.multiplyScalar(0.8);
  };
  // Inner cupped ring (4 leaves)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.4;
    b.add("foliage", cabbagePetal(0.125, 0.19), 0x7aa956, xf([x, y + 0.02, z], [0.12, a, 0]), { jitter: 0.07, seed: seed + i, colorFn: leafTint });
  }
  // Outer spreading rosette ring (6 curled leaves)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52 + r() * 0.3;
    b.add("foliage", cabbagePetal(0.175, 0.21), 0x5c8b43, xf([x, y, z], [0.34, a, 0]), { jitter: 0.08, seed: seed + 10 + i, colorFn: leafTint });
  }
}

function addCarrotTop(b: GeoBag, x: number, y: number, z: number, seed: number): void {
  const r = rng(seed);
  b.add("paint", cyl(0.045, 0.03, 0.06, 8), 0xf07f2a, xf([x, y + 0.02, z]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    b.add("foliage", new THREE.ConeGeometry(0.035, 0.28, 3, 1, true), 0x4f9e3a, xf([x + Math.cos(a) * 0.03, y + 0.17, z + Math.sin(a) * 0.03], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
  }
}

function addPickets(b: GeoBag, x0: number, z0: number, x1: number, z1: number, h: number, spacing: number, col: number, w = 0.06, seed = 1, missing = 0): void {
  const r = rng(seed * 17 + 3);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    if (missing && r() < missing) continue;
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const lean = (r() - 0.5) * 0.08;
    const hh = h * (0.92 + r() * 0.12);
    b.add("paint", box(w * 0.4, hh, w), col, xf([x, hh / 2, z], [lean, yaw, 0]), { aoBottom: 0.4, jitter: 0.08, seed: i });
    b.add("paint", new THREE.ConeGeometry(w * 0.72, w * 1.1, 4), col, xf([x, hh + w * 0.5, z], [lean, yaw + Math.PI / 4, 0]));
  }
  for (const ry of [0.32, 0.78]) {
    const g = box(0.035, 0.05, len);
    b.add("wood", g, 0xb08a60, xf([(x0 + x1) / 2, h * ry, (z0 + z1) / 2], [0, yaw, 0]));
  }
}

export function buildBeehive(c: BuildCtx): void {
  const b = c.bag;
  b.add("bark", cyl(0.42, 0.48, 0.5, 14), 0x6e4a2c, xf([0, 0.25, 0]), { capColor: 0xd8ad78, capAxis: "y", aoBottom: 0.3 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    b.add("bark", new THREE.ConeGeometry(0.14, 0.5, 6), 0x6e4a2c, xf([Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]));
  }
  const hiveCol = [0xf2c75c, 0xe9b94a];
  for (let t = 0; t < 2; t++) {
    b.add("paint", new RoundedBoxGeometry(0.62, 0.3, 0.52, 2, 0.03), hiveCol[t], xf([0, 0.5 + 0.15 + t * 0.31, 0]), { jitter: 0.05 });
  }
  b.add("paint", box(0.3, 0.05, 0.03), 0x2a1a10, xf([0, 0.58, 0.265]));
  b.add("paint", box(0.4, 0.03, 0.12), 0xd9a744, xf([0, 0.555, 0.31]));
  const rs = Math.atan2(0.18, 0.38);
  for (const s of [-1, 1]) {
    b.add("paint", box(0.44, 0.04, 0.66), 0xb04a2f, xf([s * 0.19, 1.22, 0], [0, 0, -s * rs]));
  }
  c.extra.bees = makeBees(new THREE.Vector3(0, 0.9, 0.1));
  c.dyn.push(c.extra.bees);
}

function makeBees(at: THREE.Vector3): THREE.Points {
  const N = 7;
  const seeds = new Float32Array(N * 4);
  const r = rng(77);
  for (let i = 0; i < N * 4; i++) seeds[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform float uScale;
      void main() {
        float t = uTime * (0.8 + aSeed.x) + aSeed.y * 6.28;
        vec3 p = position + vec3(sin(t * 1.3) * (0.4 + aSeed.z * 0.5), 0.15 + sin(t * 2.1) * 0.25 + aSeed.w * 0.4, cos(t * 1.1) * (0.4 + aSeed.w * 0.5));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.07 * uScale / max(0.1, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        if (length(q) > 0.5) discard;
        vec3 col = mod(floor((q.x + 0.5) * 4.0), 2.0) < 1.0 ? vec3(1.0, 0.8, 0.15) : vec3(0.12, 0.08, 0.05);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.position.copy(at);
  pts.frustumCulled = false;
  pts.name = "set:bees";
  return pts;
}

const SWING_PIVOT_LOCAL: Vec3 = [-0.6, 3.42, 2.6];
const SWING_ROPE_HALF_SPAN = 0.3;
const SWING_ROPE_LENGTH = 2.97;
const SWING_GRIP_LOCAL_Y = -2.72; // 0.25 m above seat center (-2.97), y = 0.70 m at rest

export function swingRopeGripsAt(angle: number): [Vec3, Vec3] {
  const a = Number.isFinite(angle) ? angle : 0;
  const oak = SET_ELEMENTS.oak_swing.pos;
  const px = oak[0] + SWING_PIVOT_LOCAL[0];
  const py = oak[1] + SWING_PIVOT_LOCAL[1];
  const pz = oak[2] + SWING_PIVOT_LOCAL[2];
  // +X right-hand rule matching THREE.Object3D.rotation.x = angle on local (x, yLocal, 0)
  const wy = py + SWING_GRIP_LOCAL_Y * Math.cos(a);
  const wz = pz + SWING_GRIP_LOCAL_Y * Math.sin(a);
  return [
    [px + SWING_ROPE_HALF_SPAN, wy, wz],
    [px - SWING_ROPE_HALF_SPAN, wy, wz],
  ];
}

export function buildOakSwing(c: BuildCtx): void {
  const b = c.bag;
  const barkC = 0x6f4b2f;
  b.add("bark", cyl(0.32, 0.5, 3.8, 12, 3), barkC, xf([0, 1.9, 0]), { aoBottom: 0.35, jitter: 0.12 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.3;
    b.add("bark", new THREE.ConeGeometry(0.22, 0.9, 6), barkC, xf([Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25]));
  }
  const branches: [THREE.Vector3, THREE.Vector3, number][] = [
    [V(0, 3.3, 0), V(-0.65, 3.55, 3.0), 0.17], // swing branch (toward +z)
    [V(0, 3.4, 0), V(1.8, 5.0, -0.6), 0.2],
    [V(0, 3.6, 0), V(-1.6, 5.2, -0.8), 0.18],
    [V(0, 3.7, 0), V(0.3, 5.6, 1.2), 0.18],
  ];
  for (const [a, e, rr] of branches) {
    const { g, m } = beam(a, e, rr, rr * 0.6, 8);
    b.add("bark", g, barkC, m);
  }
  const crown = new THREE.Group(); crown.name = "set:oak:authored-crown"; c.dyn.push(crown);
  queueNature(c, crown, "CommonTree_1", [{ x: 0, z: 0, y: .1, height: 7.0, yaw: -.7 }], true, true);
  // swing: pivot under the branch; ropes + seat move as one object
  const pivot = new THREE.Group();
  pivot.name = "set:swing_pivot";
  pivot.position.set(SWING_PIVOT_LOCAL[0], SWING_PIVOT_LOCAL[1], SWING_PIVOT_LOCAL[2]);
  const sb = new GeoBag();
  const ropeL = SWING_ROPE_LENGTH;
  for (const s of [-1, 1]) sb.add("wood", cyl(0.02, 0.02, ropeL, 5), 0xd2bc8e, xf([s * SWING_ROPE_HALF_SPAN, -ropeL / 2, 0]));
  sb.add("wood", new RoundedBoxGeometry(0.78, 0.06, 0.3, 2, 0.02), 0xa8703e, xf([0, -ropeL, 0]));
  const seatGrp = sb.build(c.mats, "set:swing_seat");
  sb.dispose();
  seatGrp.name = "set:swing_seat";
  pivot.add(seatGrp);
  c.extra.swingPivot = pivot;
  c.extra.swingSeat = seatGrp;
  c.dyn.push(pivot);
}

export function buildHammock(c: BuildCtx): void {
  const b = c.bag;
  const trees = new THREE.Group(); trees.name = "set:hammock:trees"; c.dyn.push(trees);
  queueNature(c, trees, "Pine_3", [{ x: -YARD_HAMMOCK_SPEC.trunkSpan, z: 0, height: 8.5, yaw: YARD_HAMMOCK_SPEC.rotY }], true);
  queueNature(c, trees, "Pine_1", [{ x: YARD_HAMMOCK_SPEC.trunkSpan, z: 0, height: 9.4, yaw: 2.1 }], true);
  // fabric: sagging striped grid (dynamic cloth mesh replaces static fabric batch 1:1)
  const U = 24, Vn = 6, L = 3.6, Wd = 1.1;
  const sagDepth = 1.05 - YARD_HAMMOCK_SPEC.seatY;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const stripes = [0xf3e6c8, 0xd0483a, 0xf3e6c8, 0x3d7fc1, 0xf3e6c8, 0xd0483a];
  const cc = new THREE.Color();
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    for (let j = 0; j <= Vn; j++) {
      const v = j / Vn;
      const x = -L / 2 + u * L;
      const narrow = 0.35 + 0.65 * Math.sin(Math.PI * u);
      const z = (v - 0.5) * Wd * narrow;
      const y = 1.05 - sagDepth * Math.sin(Math.PI * u) + 0.12 * Math.pow(2 * v - 1, 2) * narrow;
      pos.push(x, y, z);
      cc.setHex(stripes[Math.min(stripes.length - 1, Math.floor(v * stripes.length * 0.999))]);
      col.push(cc.r, cc.g, cc.b);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < Vn; j++) {
    const a = i * (Vn + 1) + j, bb = a + Vn + 1;
    idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // underside (flipped winding + normals) instead of a DoubleSide material
  const under = g.clone();
  const ui = under.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < ui.length; i += 3) { const t = ui[i + 1]; ui[i + 1] = ui[i + 2]; ui[i + 2] = t; }
  const un = under.attributes.normal;
  for (let i = 0; i < un.count; i++) un.setXYZ(i, -un.getX(i), -un.getY(i), -un.getZ(i));
  under.translate(0, -0.006, 0);
  const clothGeo = mergeGeometries([g, under], false) ?? g.clone();
  g.dispose();
  under.dispose();

  const clothMat = c.mats.fabric.clone();
  clothMat.name = "set:hammock:cloth";
  const hu = c.extra.hammockUniforms;
  const prevCompile = clothMat.onBeforeCompile;
  const prevKeyFn = clothMat.customProgramCacheKey;
  clothMat.onBeforeCompile = (sh, renderer) => {
    prevCompile?.call(clothMat, sh, renderer);
    Object.assign(sh.uniforms, hu);
    if (sh.vertexShader.includes("#include <common>") && sh.vertexShader.includes("#include <begin_vertex>")) {
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uHammockWeight;
uniform float uHammockSway;
uniform float uHammockTime;
void hammockMotion(in vec3 pos, out float theta, out float sag, out float pinch) {
  float hU = clamp((pos.x + 1.8) / 3.6, 0.0, 1.0);
  float span = sin(3.14159265 * hU);
  float narrow = 0.35 + 0.65 * span;
  float edge = clamp(pos.z / max(0.05, 0.55 * narrow), -1.0, 1.0);
  float w = max(uHammockWeight, 0.0);
  sag = w * span * (0.65 + 0.35 * span) * 0.095 * (1.0 - 0.32 * edge * edge);
  pinch = 1.0 - 0.12 * min(w * span, 1.5);
  theta = uHammockSway * span * (0.09 * cos(uHammockTime * 1.45) + 0.025 * sin(uHammockTime * 2.85 + hU * 3.14159265));
}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  if (uHammockWeight != 0.0 || uHammockSway != 0.0) {
    float hTheta;
    float hSag;
    float hPinch;
    hammockMotion(position, hTheta, hSag, hPinch);
    transformed.y -= hSag;
    transformed.z *= hPinch;
    float dy = transformed.y - 1.05;
    float cs = cos(hTheta);
    float sn = sin(hTheta);
    transformed.y = 1.05 + dy * cs - transformed.z * sn;
    transformed.z = dy * sn + transformed.z * cs;
  }
}`,
        );
      if (sh.vertexShader.includes("#include <beginnormal_vertex>")) {
        sh.vertexShader = sh.vertexShader.replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
{
  if (uHammockSway != 0.0) {
    float nTheta;
    float nSag;
    float nPinch;
    hammockMotion(position, nTheta, nSag, nPinch);
    float csN = cos(nTheta);
    float snN = sin(nTheta);
    objectNormal = vec3(objectNormal.x, objectNormal.y * csN - objectNormal.z * snN, objectNormal.y * snN + objectNormal.z * csN);
  }
}`,
        );
      }
    }
  };
  clothMat.customProgramCacheKey = () => {
    const pk = prevKeyFn && prevKeyFn !== THREE.Material.prototype.customProgramCacheKey ? prevKeyFn.call(clothMat) : "";
    return pk ? `${pk}:set:hammock:cloth-v1` : "set:hammock:cloth-v1";
  };
  const cloth = new THREE.Mesh(clothGeo, clothMat);
  cloth.name = "set:hammock:cloth";
  cloth.castShadow = false;
  cloth.receiveShadow = true;
  cloth.userData.hammockUniforms = hu;
  c.dyn.push(cloth);
  c.extra.disposables.push(clothMat);

  for (const s of [-1, 1]) {
    for (const zz of [-0.12, 0.12]) {
      const { g: rg, m } = beam(V(s * 1.8, 1.05, zz * 0.6), V(s * 2.0, 1.45, 0), 0.015, 0.015, 4);
      b.add("wood", rg, 0xd2bc8e, m);
    }
  }
}

export function buildTable(c: BuildCtx): void {
  const b = c.bag;
  // Build the tabletop from individual chamfered planks clipped to the circle + oak rim apron
  // so there are no diagonal triangle vertex-color artifacts on the cap.
  const R = YARD_TABLE_SPEC.radius, topY = TABLE_TOP;
  b.add("wood", cyl(R, R - 0.015, 0.036, 28), 0xa37142, xf([0, topY - 0.052, 0]), { jitter: 0.06 });
  b.add("wood", new THREE.TorusGeometry(R - 0.008, 0.018, 8, 28), 0xae7948, xf([0, topY - 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.9]), { jitter: 0.05 });
  const plankCols = [0xc08b57, 0xb5804d, 0xc7925e];
  const plankCount = 7, pitch = (R * 1.88) / plankCount, pw = pitch - 0.012;
  for (let i = 0; i < plankCount; i++) {
    const pz = (i - (plankCount - 1) / 2) * pitch;
    const zEdge = Math.min(R - 0.02, Math.abs(pz) + pw * 0.45);
    const len = 2 * Math.sqrt(Math.max(0.04, (R - 0.015) ** 2 - zEdge * zEdge));
    b.add("wood", new RoundedBoxGeometry(len, 0.035, pw, 1, 0.008), plankCols[i % plankCols.length], xf([0, topY - 0.0175, pz]), { jitter: 0.07, seed: 30 + i });
  }
  b.add("wood", cyl(0.08, 0.1, topY - 0.07, 10), 0x9a6a3e, xf([0, (topY - 0.07) / 2, 0]));
  for (let i = 0; i < 2; i++) b.add("wood", box(1.0, 0.07, 0.1), 0x8e5f36, xf([0, 0.035, 0], [0, (i * Math.PI) / 2 + 0.4, 0]));
  // Child-sized helper: keep the adult table, raise Masha onto visible support.
  // Build in table-local coordinates; the shared station is world-space.
  const s = COOKING_STATION;
  const x = s.position[0] - YARD_TABLE_SPEC.pos[0];
  const z0 = s.topBack - YARD_TABLE_SPEC.pos[1];
  const z1 = s.topFront - YARD_TABLE_SPEC.pos[1];
  b.add("wood", new RoundedBoxGeometry(s.width, .065, z1 - z0, 2, .018), 0xa47b50, xf([x, s.top - .0325, (z0 + z1) / 2]));
  const stepZ = (s.stepBack + s.topBack) / 2 - YARD_TABLE_SPEC.pos[1];
  b.add("wood", new RoundedBoxGeometry(s.width, .06, s.topBack - s.stepBack + .04, 2, .015), 0xa47b50, xf([x, s.stepTop - .03, stepZ]));
  for (const side of [-1, 1]) {
    for (const z of [z0 + .08, z1 - .08]) b.add("wood", box(.075, s.top - .065, .075), 0x8b633f, xf([x + side * (s.width / 2 - .075), (s.top - .065) / 2, z]));
    b.add("wood", box(.065, s.stepTop - .06, .075), 0x8b633f, xf([x + side * (s.width / 2 - .075), (s.stepTop - .06) / 2, s.stepBack - YARD_TABLE_SPEC.pos[1] + .09]));
    b.add("wood", box(.06, .07, s.topFront - s.stepBack - .12), 0x8b633f, xf([x + side * (s.width / 2 - .075), .10, (s.stepBack + s.topFront) / 2 - YARD_TABLE_SPEC.pos[1]]));
  }
}

export function buildSamovar(c: BuildCtx): void {
  const b = c.bag;
  const R = YARD_SAMOVAR_SPEC.radius;
  const prof = [
    [0.0, 0.0], [0.09, 0.0], [0.07, 0.04], [0.06, 0.07], [0.12, 0.09], [0.16, 0.15], [R, 0.22], [0.16, 0.29],
    [0.12, 0.33], [0.1, 0.35], [0.1, 0.37], [0.06, 0.39], [0.04, 0.41], [0.0, 0.41],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const brass = 0xdca64a;
  b.add("metal", new THREE.LatheGeometry(prof, 20), brass, undefined, {
    colorFn: (p, _n, out) => { if (Math.abs(p.y - 0.22) < 0.012) out.setHex(0xa8742a); },
  });
  b.add("metal", cyl(0.035, 0.04, 0.06, 10), brass, xf([0, YARD_SAMOVAR_SPEC.height - 0.03, 0]));
  for (const s of [-1, 1]) b.add("paint", new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), 0x2a2018, xf([s * 0.18, 0.28, 0], [0, 0, (s * Math.PI) / 2]));
  b.add("metal", cyl(0.012, 0.016, 0.1, 6), brass, xf([0, 0.12, R], [Math.PI / 2.4, 0, 0]));
  b.add("paint", sph(0.02, 6, 5), 0x2a2018, xf([0, 0.16, 0.16]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("metal", sph(0.025, 6, 5), brass, xf([Math.cos(a) * 0.075, 0.015, Math.sin(a) * 0.075]));
  }
}

export function buildBench(c: BuildCtx): void {
  const b = c.bag;
  b.add("wood", new RoundedBoxGeometry(YARD_BENCH_SPEC.width, YARD_BENCH_SPEC.thickness, YARD_BENCH_SPEC.depth, 2, 0.03), 0xb07a46, xf([0, YARD_BENCH_SPEC.centerY, 0]), { jitter: 0.05 });
  for (const legX of YARD_BENCH_SPEC.legXs) {
    b.add("bark", cyl(0.15, 0.17, YARD_BENCH_SPEC.legHeight, 10), 0x7a5232, xf([legX - YARD_BENCH_SPEC.pos[0], YARD_BENCH_SPEC.legHeight / 2, 0]), { capColor: 0xd8b07c, capAxis: "y" });
  }
}

export function buildWoodpile(c: BuildCtx): void {
  const b = c.bag;
  const r = rng(12);
  const rows = [6, 5, 4, 3];
  const lr = 0.13;
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * lr * 2.02;
      const y = lr + ri * lr * 1.75;
      b.add("bark", cyl(lr * (0.9 + r() * 0.15), lr, 0.95 + r() * 0.1, 9), 0x7d5434, xf([x, y, (r() - 0.5) * 0.08], [Math.PI / 2, 0, 0]), {
        capColor: 0xe5bd88, capAxis: "y", jitter: 0.1, seed: ri * 10 + i,
      });
    }
  });
  for (const s of [-1, 1]) b.add("wood", box(0.08, 1.0, 0.08), 0x6e4a2c, xf([s * 0.88, 0.5, 0]));
  // chopping stump (no axe)
  b.add("bark", cyl(0.3, 0.34, 0.45, 12), 0x6e4a2c, xf([-1.2, 0.225, 1.8]), { capColor: 0xdcb27c, capAxis: "y" });
  for (let i = 0; i < 6; i++) b.add("wood", box(0.12, 0.03, 0.05), 0xd9b27e, xf([-1.2 + (r() - 0.5) * 1.2, 0.015, 1.8 + (r() - 0.5) * 1.0], [0, r() * 3, 0]));
}

export function buildFence(c: BuildCtx): void {
  const col = 0xece2cf;
  addPickets(c.bag, 2.4, 12.4, 6.6, 13.5, 0.85, 0.2, col, 0.08, 3, 0.12);
  addPickets(c.bag, -2.4, 12.4, -4.1, 13.2, 0.85, 0.2, col, 0.08, 4, 0.15);
  addPickets(c.bag, -14.6, -2.2, -14.6, 0.6, 0.85, 0.2, col, 0.08, 5, 0.1);
}

export function buildRocks(c: BuildCtx): void {
  const b = c.bag;
  const r = rng(44);
  const spots: [number, number, number][] = [
    [1.6, 8.4, 0.35], [-1.6, 13.8, 0.3], [9.2, 4.4, 0.28], [-13.8, -8.6, 0.6], [15.8, 5.6, 0.7], [-15.2, 8.6, 0.8],
    [4.6, -11.6, 0.55], [13.2, -12.6, 0.6], [-6.2, 14.6, 0.4], [7.4, 13.4, 0.35], [-10.8, 6.4, 0.3], [16.4, -7.2, 0.5],
  ];
  spots.forEach(([x, z, s], i) => {
    if (i % 2 === 0) addFern(b, x + s, z - s * .5, .55 + s * .35, 600 + i);
    b.add("stone", blob(s, 500 + i, 0.2, 1), 0x9a978d, xf([x, s * 0.3, z], [r(), r() * 6, r()], [1.2, 0.65, 1]), {
      jitter: .07, aoBottom: .3, seed: i,
      colorFn: (p, n, out) => { if (n.y > .3 && p.y > .05) out.lerp(new THREE.Color(0x718359), .35); },
    });
    if (i % 3 === 0) b.add("stone", blob(s * 0.45, 600 + i, 0.2, 1), 0xa7a398, xf([x + s * 0.9, s * 0.12, z + s * 0.4], [r(), r(), r()], [1, 0.6, 1]));
  });
}
