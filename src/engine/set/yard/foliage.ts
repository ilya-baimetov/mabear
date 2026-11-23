import * as THREE from "three";
import { GeoBag, xf } from "../../look";
import { rng } from "../../math/rng";
import { buildPineRidgeHorizon, type NatureId, type NatureSpot } from "../nature";
import { addBirch, addPine, blob, blossom, creekDistance, leaf, openGround, sph, type BuildCtx } from "./geometry";
import { groundY } from "./ground";

/** Only failed model requests use the coarse local fallback; successful loads always use authored geometry. */
export function queueNature(c: BuildCtx, parent: THREE.Group, id: NatureId, spots: NatureSpot[], castShadow = false, foliageOnly = false): void {
  c.extra.nature.add(parent, id, spots, castShadow, foliageOnly, () => {
    const bag = new GeoBag();
    spots.forEach((sp, i) => {
      const m = xf([sp.x, sp.y ?? 0, sp.z], [0, sp.yaw ?? 0, 0]);
      if (id.startsWith("Pine")) addPine(bag, sp.height, i + 93, m, "foliage", 1);
      else if (id.startsWith("Common") || id.startsWith("Birch")) addBirch(bag, sp.height, i + 109, m, "foliage", 1);
      else bag.add("foliage", blob(sp.height * .45, i, .1, 1, .7), 0x5b7848,
        xf([sp.x, (sp.y ?? 0) + sp.height * .45, sp.z]));
    });
    const fallback = bag.build(c.mats, `nature:fallback:${id}`, { cast: castShadow });
    fallback.userData = { fallback: true, failedAsset: id };
    parent.add(fallback);
    bag.dispose();
  });
}

export function addFern(b: GeoBag, x: number, z: number, scale: number, seed: number): void {
  const r = rng(seed);
  for (let frond = 0; frond < 5; frond++) {
    const a = frond * 2.39996 + seed;
    const len = scale * (.6 + r() * .3);
    for (let k = 1; k <= 6; k++) {
      const t = k / 7, bend = Math.sin(t * Math.PI * .85);
      const px = x + Math.cos(a) * len * t, pz = z + Math.sin(a) * len * t;
      const y = scale * .6 * bend;
      for (const side of [-1, 1]) {
        const size = scale * .24 * Math.sin(t * Math.PI);
        b.add("foliage", leaf(size, size * .18, .2), frond % 2 ? 0x6b8c4a : 0x547a43,
          xf([px, y, pz], [-.1, -a + Math.PI / 2 + side * 1.04, side * .2]));
      }
    }
  }
}

export function buildBigPine(c: BuildCtx): void {
  const tree = new THREE.Group(); tree.name = "set:big_pine:authored"; c.dyn.push(tree);
  queueNature(c, tree, "Pine_2", [{ x: 0, z: 0, height: 10.5, yaw: 2.6 }], true);
}

export function buildBush(c: BuildCtx): void {
  const b = c.bag;
  const shrub = new THREE.Group(); shrub.name = "set:bush:authored"; c.dyn.push(shrub);
  queueNature(c, shrub, "Bush_Common", [{ x: 0, z: 0, height: 1.6, yaw: .8 }]);
  const r = rng(61);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, e = r() * 1.0 + 0.1;
    const rr = 0.86;
    b.add("paint", sph(0.05, 6, 5), 0xd8283a, xf([Math.cos(a) * Math.cos(e) * rr, 0.75 + Math.sin(e) * rr * 0.8, Math.sin(a) * Math.cos(e) * rr]));
  }
}

export function buildFlowers(c: BuildCtx): void {
  // Dedicated crisp vertex-colored material (no foliage clump darkening) + gentle wind sway.
  const fb = new GeoBag();
  const r = rng(21);
  const heads = [0xfffbf0, 0xf2ca52, 0xe87358, 0xffffff, 0xf5d66b, 0x87a8f2, 0xffffff];
  const clusters: [number, number, number, number][] = [
    [-9.9, -3.4, 1.0, 34], [-2.3, -3.2, 0.9, 28], [2.6, -4.6, 0.6, 18], [3.4, 3.9, 0.7, 8], [7.4, 6.6, 0.7, 8],
    [-3.9, 12.2, 1.2, 32], [2.1, 11.2, 0.8, 24], [-2.1, 11.6, 0.8, 25], [-12.6, 3.6, 0.8, 8], [9.6, 0.6, 0.7, 7],
    [-13.6, -2.8, 0.7, 7], [12.4, -6.2, 0.7, 7], [6.4, 10.4, 0.8, 8], [-9.2, -0.9, 0.5, 6], [8.8, -3.4, 0.6, 7],
  ];
  const plant = (x: number, z: number, k: number) => {
    const h = 0.22 + r() * 0.29;
    const lean: [number, number, number] = [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3];
    fb.add("paint", new THREE.CylinderGeometry(0.008, 0.01, h, 3, 1, true), 0x4f913a, xf([x, h / 2, z], lean));
    const hc = heads[k % heads.length];
    const hx = x - lean[2] * h * 0.5, hz = z + lean[0] * h * 0.5;
    for (const side of [-1, 1]) fb.add("paint", leaf(h * .36, h * .075, .18), 0x628c44,
      xf([x, h * .48, z], [-.2, k + side * 1.2, side * .7]));
    blossom(fb, hx, h, hz, .062 + r() * .022, hc, k * 7, "paint");
  };
  for (const [cx, cz, rad, n] of clusters) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      plant(cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.floor(r() * 7));
    }
  }
  for (let i = 0; i < 24; i++) {
    const x = (r() - 0.5) * 34, z = (r() - 0.5) * 30 + 1;
    if (!openGround(x, z, 0.8) || (x > -8 && x < 1 && z > -2.4 && z < 3)) continue;
    plant(x, z, Math.floor(r() * 7));
  }
  const merged = fb.merged().get("paint");
  fb.dispose();
  if (merged) {
    const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
    flowerMat.userData.setOwned = true;
    const fu = { uTime: c.extra.grassUniforms.uTime, uWind: c.extra.grassUniforms.uWind };
    flowerMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fu);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  float fh = clamp(position.y - 0.02, 0.0, 0.6);
  float fph = uTime * 1.55 + position.x * 0.45 + position.z * 0.35;
  float fsw = sin(fph) * uWind * fh * fh * 0.42;
  transformed.x += fsw;
  transformed.z += fsw * 0.55;
}`,
        );
    };
    flowerMat.customProgramCacheKey = () => "set:flowers:sway-v1";
    const mesh = new THREE.Mesh(merged, flowerMat);
    mesh.name = "set:flowers_patch:mesh";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    c.dyn.push(mesh);
  }
}

/**
 * Distant forest silhouettes: multi-layered soft undulating pine-ridge horizons (74–122 m) behind the instanced
 * forest with dedicated aerial-perspective mist shading; scene fog fades them smoothly into the sky.
 */
function addForestSilhouettes(c: BuildCtx): void {
  const horizon = buildPineRidgeHorizon([
    { radius: 74, base: 6.0, amp: 5.0, color: 0x244c30, seed: 1 },
    { radius: 96, base: 8.2, amp: 6.2, color: 0x2c5442, seed: 2 },
    { radius: 122, base: 10.6, amp: 7.5, color: 0x365b50, seed: 3 },
  ], groundY, 0, 0);
  c.extra.horizonUniforms = horizon.uniforms;
  c.dyn.push(horizon.mesh);
}

export function buildForest(c: BuildCtx): void {
  const r = rng(6073);
  const group = new THREE.Group(); group.name = "set:forest:authored"; c.dyn.push(group);
  const kinds: NatureId[] = ["Pine_1", "Pine_2", "Pine_3", "Pine_5", "BirchTree_1", "BirchTree_3", "CommonTree_1", "CommonTree_2", "CommonTree_4"];
  const spots: Partial<Record<NatureId, NatureSpot[]>> = Object.fromEntries(kinds.map((id) => [id, [] as NatureSpot[]]));
  const accepted: { x: number; z: number }[] = [];
  for (let i = 0; i < 5200 && accepted.length < 350; i++) {
    const a = r() * Math.PI * 2, rad = 17 + Math.sqrt(r()) * 47;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if ((x / 18.3) ** 2 + ((z - 1) / 16) ** 2 < 1) continue;
    if (z > 8 && z < 37 && Math.abs(x) < 25 + (z - 8) * .22) continue;
    if (creekDistance(x, z) < 2.2 || Math.hypot(x - 14, z + 1) < 4) continue;
    const spacing = rad < 31 ? 2.5 : 3.8;
    if (accepted.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
    // Pockets of trees, with occasional gaps showing the deeper canopy.
    const pocket = Math.sin(x * .21 + z * .09) * Math.cos(z * .14 - .6);
    if (pocket < -.55 && r() < .75) continue;
    const pick = r();
    const id = rad > 37 ? (pick < .7 ? "Pine_5" : "CommonTree_4") : kinds[Math.floor(r() * kinds.length)];
    const height = 6.5 + r() * 4.5 + (rad > 37 ? 1.5 : 0);
    spots[id]!.push({ x, z, y: groundY(x, z), height, yaw: r() * Math.PI * 2, tint: .82 + r() * .24 });
    accepted.push({ x, z });
  }
  for (const id of kinds) queueNature(c, group, id, spots[id] ?? []);
  // A lower, irregular edge roots the trees in the meadow instead of revealing a wall of naked trunks.
  const shrubs: NatureSpot[] = [], ferns: NatureSpot[] = [];
  for (let i = 0; i < 105; i++) {
    const a = Math.PI + r() * Math.PI, rad = 15.5 + r() * 9;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (!openGround(x, z, .4)) continue;
    shrubs.push({ x, z, height: .65 + r() * 1.25, yaw: r() * 6, tint: .8 + r() * .25 });
    if (i % 3 === 0) ferns.push({ x: x + 1, z: z + 1.2, height: .5 + r() * .45, yaw: r() * 6 });
  }
  // Dense shrub islands screen the rear tree trunks, while preserving every named acting mark.
  for (const [x, z, h] of [[-13, -9, 1.8], [-11.8, -10.7, 1.4], [-10.6, -11.8, 1.7], [-.5, -13.2, 1.6], [2.5, -11.5, 1.7], [4, -11.8, 1.4], [6.2, -11.4, 1.5], [8.1, -12.2, 1.8], [11, -12.3, 1.5], [13.3, -10.6, 1.7], [14.8, -7.8, 1.5]] as const)
    shrubs.push({ x, z, height: h, yaw: r() * 6, tint: 1 });
  queueNature(c, group, "Bush_Common", shrubs);
  queueNature(c, group, "Fern_1", ferns);
  addForestSilhouettes(c);
}
