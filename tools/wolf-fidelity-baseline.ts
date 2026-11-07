// Wolves — procedural stand-in rigs (spec §7.3 approach): the two Wolves from the series walk upright, so they use
// the same Mixamo-named humanoid skeleton as Masha and Bear. Lanky and thin, grey (variant a: taller, cooler grey;
// variant b: shorter, warmer grey), long snout with a black nose, tall pointed ears, bushy tail on the Hips (three
// extra tail bones, secondary sway), small sly half-lidded eyes, lighter throat/belly and muzzle.
// Everything merges into skinned meshes: fur (1 mesh + shadow), eyes + nose (1), mouth (1) → 4 draw calls.
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../src/engine/api";
import { buildFace, type FaceConfig } from "../src/engine/characters/face";
import {
  blob, bump, buildSkeleton, col, dir, extraBone, eyeMaterial, frontSurface, furMaterial, limb, makeRig, materialSet, mergeSame,
  noise3, paintVertices, plushSurface, profile, restWorld, roughen, sdEllipsoid, sdfBlob, skinBody, smin, smoothstep, toLocal,
  welded, type SkeletonProportions, type SkinPart, type Weights,
} from "../src/engine/characters/rig";

export type WolfVariant = "a" | "b";

const BASE_HEIGHT = 2.0;

/** Proportions at BASE_HEIGHT (each variant scales them uniformly to its height). */
const WOLF_SKELETON: SkeletonProportions = {
  hipsHeight: 0.98,
  spine: 0.12,
  spine1: 0.14,
  spine2: 0.15,
  neck: 0.15,
  head: 0.07,
  shoulder: [0.07, 0.11],
  clavicle: 0.12,
  upperArm: 0.31,
  foreArm: 0.3,
  upLeg: [0.1, -0.05],
  upperLeg: 0.44,
  lowerLeg: 0.41,
  toe: [0.06, 0.13],
};

export const WOLF_LOOK = {
  variants: {
    a: {
      height: 2.05,
      colors: { fur: "#7C8288", furDark: "#4C5157", light: "#C6CACB", earInner: "#9A8C8C", iris: "#7A5418" },
      /** a little thinner than b */
      girth: 0.95,
    },
    b: {
      height: 1.93,
      colors: { fur: "#76716C", furDark: "#47423E", light: "#C2BBB1", earInner: "#9C8580", iris: "#6E4A16" },
      girth: 1.05,
    },
  },
  colors: {
    furSheen: "#9EA4AA",
    nose: "#141212",
    irisRim: "#2A1A08",
    sclera: "#EDE2B4",
    brows: "#3A3D42",
    lash: "#2A2A2E",
    mouthInterior: "#4A161A",
    lip: "#2A2526",
    teeth: "#FBF5E8",
    tongue: "#D0646A",
  },
  head: {
    /** cranium centre (Head-bone space, base height) and radius */
    center: [0, 0.12, -0.01] as [number, number, number],
    radius: 0.125,
    /** long snout: from inside the cranium forward, tip ≈ 0.33 m in front of the Head bone */
    snoutCenter: [0, 0.075, 0.165] as [number, number, number],
    snoutRadii: [0.072, 0.064, 0.165] as [number, number, number],
  },
  furNoise: { amp: 0.003, freq: 28 },
} as const;

type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A sculpted tube along a Catmull-Rom curve (radius profile r(t), closed ends when r → 0). */
function tube(curve: THREE.Curve<THREE.Vector3>, r: (t: number) => number, detail: number): THREE.BufferGeometry {
  const up = new THREE.Vector3(1, 0, 0);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const Bn = new THREE.Vector3();
  return blob(detail, (d, out) => {
    const t = (d.y + 1) / 2;
    curve.getPointAt(t, out);
    curve.getTangentAt(t, T);
    N.crossVectors(T, up).normalize();
    Bn.crossVectors(T, N).normalize();
    const h = Math.hypot(d.x, d.z) || 1;
    const rr = r(t);
    out.addScaledVector(Bn, (d.x / h) * rr).addScaledVector(N, (d.z / h) * rr);
  });
}

/**
 * A pointed fur clump (7-sided lathe, ~60 triangles): base at `base`, growing along `direction`, drooping under
 * gravity toward the tip, coloured from `cBase` to `cTip`. Dozens of these break the silhouette (ruff, shoulders,
 * cheeks, elbows) and merge into the fur mesh, so they cost no draw calls.
 */
function tuft(
  base: THREE.Vector3, direction: THREE.Vector3, len: number, r0: number, cBase: THREE.Color, cTip: THREE.Color, droop = 0.3,
): THREE.BufferGeometry {
  // soft leaf-shaped clump: full body, rounded shoulders, a short point
  const pts = [
    new THREE.Vector2(0.0001, -0.4 * r0),
    new THREE.Vector2(r0 * 0.8, -0.15 * r0),
    new THREE.Vector2(r0, 0.2 * len),
    new THREE.Vector2(r0 * 0.88, 0.45 * len),
    new THREE.Vector2(r0 * 0.38, 0.75 * len),
    new THREE.Vector2(0.0001, len),
  ];
  const g = welded(new THREE.LatheGeometry(pts, 8));
  g.scale(1, 1, 0.75); // clumps are a little flat
  const dn = direction.clone().normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dn));
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const ts: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, (pos.getX(i) * dn.x + pos.getY(i) * dn.y + pos.getZ(i) * dn.z) / len);
    ts.push(t);
    pos.setXYZ(i, pos.getX(i) + base.x, pos.getY(i) + base.y - droop * len * t * t, pos.getZ(i) + base.z);
  }
  g.computeVertexNormals();
  let i = 0;
  paintVertices(g, (_p, out) => out.copy(cBase).lerp(cTip, smoothstep(0.2, 1, ts[i++])));
  return g;
}

export function buildWolf(variant: WolfVariant): CharacterRig {
  const V = WOLF_LOOK.variants[variant];
  const C = { ...WOLF_LOOK.colors, ...V.colors };
  const k = V.height / BASE_HEIGHT; // uniform scale of every length
  const g8 = V.girth;
  const S = WOLF_SKELETON;
  const skel: SkeletonProportions = {
    hipsHeight: S.hipsHeight * k,
    spine: S.spine * k,
    spine1: S.spine1 * k,
    spine2: S.spine2 * k,
    neck: S.neck * k,
    head: S.head * k,
    shoulder: [S.shoulder[0] * k, S.shoulder[1] * k],
    clavicle: S.clavicle * k,
    upperArm: S.upperArm * k,
    foreArm: S.foreArm * k,
    upLeg: [S.upLeg[0] * k, S.upLeg[1] * k],
    upperLeg: S.upperLeg * k,
    lowerLeg: S.lowerLeg * k,
    toe: [S.toe[0] * k, S.toe[1] * k],
  };
  const id = variant === "a" ? "wolf_a" : "wolf_b";
  const mats = materialSet();
  const built = buildSkeleton(skel);
  const B = built.bones;
  const root = new THREE.Group();
  root.name = id;
  root.add(built.skeletonRoot);
  const chest = extraBone(B.Spine2, "chest");
  // the head is authored at base size and scaled (like Bear) so the face rig stays exact
  const headS = extraBone(B.Head, "headScale");
  headS.scale.setScalar(k);
  // tail: three bones off the back of the hips, drooping
  const tail0 = extraBone(B.Hips, "tail0", 0, -0.02 * k, -0.11 * k);
  // the tail hangs a little to the character's left so it shows beside the leg from the front
  const tail1 = extraBone(tail0, "tail1", 0.07 * k, -0.13 * k, -0.11 * k);
  const tail2 = extraBone(tail1, "tail2", 0.07 * k, -0.17 * k, -0.02 * k);
  root.updateMatrixWorld(true);
  const parts: SkinPart[] = [];

  const fur = mats.add(furMaterial(C.furSheen));
  fur.name = "fur";
  const eyeMat = mats.add(eyeMaterial());
  eyeMat.name = "eyes";
  const cFur = col(C.fur);
  const cDark = col(C.furDark);
  const cLight = col(C.light);
  let seed = variant === "a" ? 11 : 23;
  const fuzz = (g: THREE.BufferGeometry, s = 1) => roughen(g, WOLF_LOOK.furNoise.amp * s * k, WOLF_LOOK.furNoise.freq / k, (seed += 3.1));

  const W = (n: keyof typeof B) => restWorld(B[n]);
  const armW = W("LeftArm");
  const legW = W("LeftUpLeg");

  // ---- torso + neck: one thin sculpted surface (narrow chest, slight pot belly, bony shoulders, long neck)
  {
    const core = [
      { c: v(0, 1.37, -0.01), r: v(0.225 * g8, 0.22, 0.16 * g8) }, // deep chest: the widest part
      { c: v(0, 1.43, 0.05), r: v(0.15 * g8, 0.11, 0.12 * g8) }, // pigeon chest under the ruff
      { c: v(0, 1.13, 0.025), r: v(0.15 * g8, 0.2, 0.145 * g8) }, // narrow waist, a little pot belly
      { c: v(0, 0.96, -0.02), r: v(0.18 * g8, 0.12, 0.13 * g8) }, // pelvis flowing into thick thighs
    ];
    const extras = [
      { c: v(0.19, 1.49, -0.02), r: v(0.085, 0.075, 0.075) },
      { c: v(-0.19, 1.49, -0.02), r: v(0.085, 0.075, 0.075) },
      { c: v(0, 1.6, -0.005), r: v(0.068, 0.14, 0.068) }, // neck column
    ];
    const sdf = (p0: THREE.Vector3): number => {
      const p = p0.clone().divideScalar(k);
      let d = sdEllipsoid(p, core[0].c, core[0].r);
      for (let i = 1; i < core.length; i++) d = smin(d, sdEllipsoid(p, core[i].c, core[i].r), 0.14);
      for (const e of extras) d = smin(d, sdEllipsoid(p, e.c, e.r), 0.07);
      return d * k;
    };
    const g = sdfBlob(11, v(0, 1.25 * k, 0), sdf, 0.9 * k);
    // fur tufts on the body surface: a two-row chest ruff (light), a mane on the nape (fur)
    const surf = (o: THREE.Vector3, dn: THREE.Vector3): THREE.Vector3 => {
      let lo = 0;
      let hi = 0.6 * k;
      const q = new THREE.Vector3();
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (sdf(q.copy(dn).multiplyScalar(mid).add(o)) < 0) lo = mid;
        else hi = mid;
      }
      return dn.clone().multiplyScalar(lo - 0.012 * k).add(o);
    };
    const ruff: THREE.BufferGeometry[] = [];
    const cLightTip = cLight.clone().multiplyScalar(1.08);
    const rows: Array<[number, number, number, number]> = [
      // [y, phi half-range, count, length] — overlapping, irregular clumps (deterministic jitter)
      [1.57, 1.3, 7, 0.1],
      [1.49, 1.1, 7, 0.12],
      [1.42, 0.8, 5, 0.12],
      [1.36, 0.45, 3, 0.09],
    ];
    let jit = variant === "a" ? 1.3 : 4.1;
    const rnd = () => ((jit = (jit * 9301 + 49297) % 233280) / 233280) * 2 - 1;
    rows.forEach(([y, half, n, len], ri) => {
      for (let j = 0; j < n; j++) {
        const phi = -half + (2 * half * (j + 0.5 * (ri % 2))) / Math.max(1, n - 1 + (ri % 2)) + rnd() * 0.08;
        const o = v(0, (y + rnd() * 0.012) * k, 0.02 * k);
        const dn = v(Math.sin(phi), 0, Math.cos(phi));
        const b = surf(o, dn);
        // pale only at the front centre of the bib; the sides blend into the grey. Centre clumps lie flatter on the
        // chest (fewer dark gaps → reads as fur, not feathers); side clumps stand out to break the silhouette.
        const centre = smoothstep(0.9, 0.2, Math.abs(phi));
        const dirv = dn.clone().multiplyScalar(0.55 - 0.3 * centre + 0.12 * rnd()).add(v(rnd() * 0.15, -0.85, 0));
        b.addScaledVector(dn, -0.012 * k * centre);
        const cb = cFur.clone().lerp(cLight, 0.15 + 0.55 * centre);
        ruff.push(tuft(b, dirv, len * k * (0.85 + 0.3 * Math.abs(rnd())), 0.058 * k, cb, cb.clone().lerp(cLightTip, 0.25), 0.45));
      }
    });
    for (let j = 0; j < 5; j++) {
      const phi = Math.PI + (j - 2) * 0.32;
      const dn = v(Math.sin(phi), 0, Math.cos(phi));
      const b = surf(v(0, 1.57 * k, -0.01 * k), dn);
      ruff.push(tuft(b, dn.clone().multiplyScalar(0.7).add(v(0, -0.5, 0)), 0.1 * k, 0.035 * k, cFur, cDark, 0.2));
    }
    const ruffG = mergeSame(ruff);
    roughen(ruffG, 0.006 * k, 60 / k, 5.3); // break the clean leaf edges into scruffy fur
    parts.push({ geom: toLocal(ruffG, chest), bone: chest, material: fur });
    fuzz(g);
    const nrm = g.getAttribute("normal");
    let i = 0;
    paintVertices(g, (p, out) => {
      // lighter throat-to-belly patch on the front
      const nz = nrm.getZ(i++);
      const y = p.y / k;
      const halfW = 0.02 + 0.045 * smoothstep(1.62, 1.42, y) * smoothstep(1.05, 1.28, y); // throat stripe → chest bib
      const m = 0.8 * smoothstep(halfW + 0.025, halfW, Math.abs(p.x / k)) * smoothstep(0.2, 0.6, nz) * smoothstep(1.02, 1.22, y) * smoothstep(1.72, 1.6, y);
      out.copy(cFur).lerp(cLight, m);
    });
    const chain: Array<[THREE.Object3D, number]> = [
      [B.Hips, 1.0 * k],
      [B.Spine, 1.13 * k],
      [B.Spine1, 1.27 * k],
      [chest, 1.42 * k],
      [B.Neck, 1.56 * k],
      [B.Head, 1.68 * k],
    ];
    const weights = (p: THREE.Vector3): Weights => {
      const w: Weights = [];
      if (p.y <= chain[0][1]) w.push([chain[0][0], 1]);
      else if (p.y >= chain[chain.length - 1][1]) w.push([chain[chain.length - 1][0], 1]);
      else
        for (let c = 0; c < chain.length - 1; c++) {
          if (p.y >= chain[c][1] && p.y <= chain[c + 1][1]) {
            const t = smoothstep(chain[c][1], chain[c + 1][1], p.y);
            w.push([chain[c][0], 1 - t], [chain[c + 1][0], t]);
          }
        }
      const ax = Math.abs(p.x);
      const s = p.x > 0 ? "Left" : "Right";
      const sh = smoothstep(0.08 * k, 0.16 * k, ax) * smoothstep(1.38 * k, 1.46 * k, p.y);
      if (sh > 0) {
        const arm = smoothstep(0.18 * k, 0.24 * k, ax) * 0.7;
        for (const e of w) e[1] *= 1 - sh * 0.7;
        w.push([B[`${s}Shoulder`], sh * 0.7 * (1 - arm)], [B[`${s}Arm`], sh * 0.7 * arm]);
      }
      const lg = smoothstep(legW.y + 0.02 * k, legW.y - 0.08 * k, p.y) * smoothstep(0.03 * k, 0.09 * k, ax);
      if (lg > 0) {
        for (const e of w) e[1] *= 1 - lg * 0.6;
        w.push([B[`${s}UpLeg`], lg * 0.6]);
      }
      return w;
    };
    parts.push({ geom: toLocal(g, B.Hips), bone: B.Hips, material: fur, weights });
  }

  // ---- head (base size, on the scaled head bone): cranium with cheek ruffs, long tapering snout, black nose
  const H = WOLF_LOOK.head;
  const hc = new THREE.Vector3(...H.center);
  const sc = new THREE.Vector3(...H.snoutCenter);
  const sr = H.snoutRadii;
  const craniumR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      0.42 * (bump(d, dir(0.9, -0.42, 0.05), 0.13) + bump(d, dir(-0.9, -0.42, 0.05), 0.13)) + // pointed cheek ruffs
      0.22 * (bump(d, dir(0.72, -0.66, -0.2), 0.12) + bump(d, dir(-0.72, -0.66, -0.2), 0.12)) +
      0.06 * (bump(d, dir(0.3, 0.42, 0.85), 0.22) + bump(d, dir(-0.3, 0.42, 0.85), 0.22)) - // brow ridge
      0.06 * bump(d, dir(0, 1, 0), 0.5) +
      0.08 * bump(d, dir(0, 0.2, -1), 0.6)); // long skull at the back
  const cranium = blob(9, (d, out) => {
    out.copy(d).multiplyScalar(craniumR(d)).add(hc);
  });
  const snout = blob(7, (d, out) => {
    const fz = (d.z + 1) / 2; // 0 back .. 1 tip
    const taper = 1 - 0.3 * fz * fz; // blunt tip: room for the nose and a mouth under it
    // flat-ish top bridge, rounder jaw underneath
    const yy = d.y > 0 ? d.y * (1 - 0.15 * fz) : d.y * 1.05;
    out.set(d.x * sr[0] * taper, yy * sr[1] * taper - 0.012 * fz * fz, d.z * sr[2]).add(sc);
  });
  paintVertices(cranium, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    // light cheeks/throat under the eye line, darker crown and back of the head
    const cheek = smoothstep(-0.05, -0.35, d.y) * smoothstep(-0.3, 0.3, d.z);
    out.copy(cFur).lerp(cLight, cheek * 0.85).lerp(cDark, smoothstep(0.55, 0.95, d.y) * 0.35);
  });
  const snoutShape = snout.clone(); // un-fuzzed copy: the mouth's projection surface
  paintVertices(snout, (p, out) => {
    const below = smoothstep(sc.y + 0.01, sc.y - 0.03, p.y);
    out.copy(cFur).lerp(cLight, 0.15 + 0.75 * below);
  });
  fuzz(cranium, 0.5);
  parts.push({ geom: mergeSame([cranium, snout]), bone: headS, material: fur });
  const tipZ = sc.z + sr[2];
  const noseAt = new THREE.Vector3(0, sc.y + sr[1] * 0.3, tipZ - 0.012);
  const noseGeom = blob(4, (d, out) => {
    out.set(d.x * 0.034, d.y * 0.024 * (d.y > 0 ? 1 : 0.8), d.z * 0.026).add(noseAt);
  });
  paintVertices(noseGeom, (_p, out) => out.copy(col(C.nose)));
  parts.push({ geom: noseGeom, bone: headS, material: eyeMat, shadow: false });
  {
    // scruffy head: three pointed cheek tufts per side sweeping back, a little crest between the ears
    const tufts: THREE.BufferGeometry[] = [];
    const cl = cLight.clone();
    for (const s of [1, -1]) {
      for (const [dy, dz, len] of [[-0.3, 0.12, 0.085], [-0.45, -0.05, 0.1], [-0.6, -0.22, 0.08]] as const) {
        const d = dir(0.9 * s, dy, dz);
        const b = d.clone().multiplyScalar(craniumR(d) * 0.94).add(hc);
        tufts.push(tuft(b, v(0.85 * s, dy * 0.6 - 0.15, -0.45), len, 0.03, cFur.clone().lerp(cl, 0.7), cl, 0.3));
      }
    }
    for (const [x, len] of [[-0.03, 0.06], [0.0, 0.075], [0.03, 0.055]] as const) {
      const d = dir(x * 4, 1, 0.25);
      const b = d.clone().multiplyScalar(craniumR(d) * 0.94).add(hc);
      tufts.push(tuft(b, v(x * 3, 1, 0.55), len, 0.022, cFur, cDark, 0.35));
    }
    parts.push({ geom: mergeSame(tufts), bone: headS, material: fur });
  }

  // ---- ears: tall, pointed, slightly cupped, pinkish-grey inside; on bones for wiggle
  const cEarIn = col(C.earInner);
  const ears: THREE.Bone[] = [];
  for (const s of [1, -1]) {
    const ed = dir(0.5 * s, 0.84, -0.12);
    const p = ed.clone().multiplyScalar(H.radius * 0.9).add(hc);
    const eb = extraBone(headS, s === 1 ? "earL" : "earR", p.x, p.y, p.z);
    eb.rotation.set(-0.12, 0.3 * s, -0.28 * s);
    const g = blob(4, (d, out) => {
      const t = (d.y + 1) / 2; // 0 base .. 1 tip
      const w = 0.07 * Math.pow(1 - t, 0.8) + 0.004;
      const cup = d.z > 0 ? 0.017 * (1 - d.x * d.x) * (1 - t) : 0;
      out.set(d.x * w, t * 0.205, d.z * 0.025 * (1 - 0.5 * t) - cup);
    });
    paintVertices(g, (q, out) => {
      const inner = smoothstep(0.0, 0.012, q.z + 0.006) * smoothstep(0.055, 0.025, Math.abs(q.x) + q.y * 0.25) * smoothstep(0.18, 0.1, q.y);
      out.copy(cDark).lerp(cEarIn, inner * 0.85);
    });
    ears.push(eb);
    parts.push({ geom: g, bone: eb, material: fur });
  }
  root.updateMatrixWorld(true);

  // ---- face rig: small, narrow, half-lidded (sly) eyes close above the snout root; heavy dark brows
  const craniumZ = (x: number, y: number): number => {
    let z = hc.z + Math.sqrt(Math.max(H.radius ** 2 - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    const d = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      d.set(x - hc.x, y - hc.y, z - hc.z).normalize();
      const r = craniumR(d);
      z = hc.z + Math.sqrt(Math.max(r * r - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    }
    return z;
  };
  const snoutFront = frontSurface(snoutShape, { x0: -0.06, x1: 0.06, y0: sc.y - 0.075, y1: sc.y + 0.01 }, 0.002);
  const snoutZ = (x: number, y: number) => snoutFront(x, y) + 0.002;
  const faceCfg: FaceConfig = {
    eyes: {
      surface: { center: H.center as V3, radius: H.radius, zAt: craniumZ },
      x: 0.05,
      y: hc.y + 0.012,
      r: 0.021,
      scaleX: 1.2,
      scaleY: 0.85,
      scaleZ: 0.6,
      depth: 0.3,
      iris: 0.78,
      pupil: 0.45,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -0.15,
      lidColor: C.fur,
      lashColor: C.lash,
      lidOpen: -0.08, // half-lidded: the sly look
      lidCap: 1.3,
      lashFlick: false,
      lidMaterial: fur,
    },
    eyeMaterial: eyeMat,
    brows: { color: C.brows, y: 0.03, dx: 0.004, length: 0.06, thickness: 0.012, arch: 0.006, range: 0.02, material: fur },
    mouth: {
      surface: { center: H.snoutCenter as V3, radius: sr[2], zAt: snoutZ },
      y: sc.y - 0.026,
      halfWidth: 0.03,
      height: 0.045,
      line: 0.005,
      curve: 0.014,
      interior: C.mouthInterior,
      lip: C.lip,
      teeth: C.teeth,
      tongue: C.tongue,
      smirk: 0.5, // a sly one-sided grin is the Wolves' resting face
    },
  };
  const face = buildFace(faceCfg, mats);
  headS.add(face.group);
  root.updateMatrixWorld(true);
  for (const p of face.parts) parts.push({ ...p, shadow: p.material === fur ? true : p.shadow });

  // ---- arms: long and thin, smooth-skinned across the elbow; hands with a thumb and finger lumps
  const armLen = skel.upperArm + skel.foreArm;
  const armR = profile([
    [0, 0.062],
    [0.12, 0.066],
    [0.35, 0.055],
    [0.5, 0.042],
    [0.62, 0.05],
    [0.85, 0.04],
    [1, 0.035],
  ]);
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const x0 = -0.045 * k;
    const g = limb(v(x0 * s, 0, 0), v(armLen * s, 0, 0), (t) => armR(t) * k * g8, { detail: 6, sq: 0.92 });
    // elbow tuft: a soft point of fur at the back of the elbow
    {
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const ex0 = skel.upperArm;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) * s;
        const z = pos.getZ(i);
        const e = Math.exp(-(((x - ex0 + 0.01 * k) / (0.035 * k)) ** 2)) * smoothstep(-0.01, -0.045 * k, z);
        pos.setZ(i, z - 0.028 * k * e);
        pos.setX(i, pos.getX(i) - 0.012 * k * e * s);
      }
      g.computeVertexNormals();
    }
    fuzz(g, 0.6);
    paintVertices(g, (_p, out) => out.copy(cFur));
    const upper = B[`${side}Arm`];
    const fore = B[`${side}ForeArm`];
    const ex = restWorld(fore).x;
    const bw = 0.05 * k * s;
    parts.push({
      geom: g, bone: upper, material: fur,
      weights: (p) => [
        [upper, 1 - smoothstep(ex - bw, ex + bw, p.x)],
        [fore, smoothstep(ex - bw, ex + bw, p.x)],
      ],
    });
    const palm = blob(3, (d, out) => {
      out.set((0.045 + d.x * 0.05) * s, d.y * 0.022, d.z * 0.042);
    });
    const fingers: THREE.BufferGeometry[] = [palm];
    for (let f = 0; f < 3; f++) {
      fingers.push(
        blob(2, (d, out) => {
          out.set((0.1 + d.x * 0.035) * s, -0.004 + d.y * 0.014, -0.022 + f * 0.022 + d.z * 0.012);
        }),
      );
    }
    fingers.push(
      blob(2, (d, out) => {
        out.set((0.035 + d.x * 0.022) * s, -0.006 + d.y * 0.012, 0.045 + d.z * 0.014);
      }),
    );
    const hg = mergeSame(fingers);
    hg.scale(1.75 * k, 1.6 * k, 1.6 * k); // big hands
    paintVertices(hg, (_p, out) => out.copy(cDark));
    parts.push({ geom: hg, bone: B[`${side}Hand`], material: fur });
    // shaggy shoulders (on the arm: they follow it down) and an elbow tuft
    const sh: THREE.BufferGeometry[] = [];
    for (const [x, dx, dy, dz, len] of [
      [-0.01, 0.2, 1, -0.1, 0.12], [0.04, 0.6, 0.8, 0.15, 0.14], [0.03, 0.5, 0.75, -0.6, 0.13], [0.08, 0.9, 0.5, -0.2, 0.12],
    ] as const) {
      sh.push(tuft(v(x * k * s, 0.04 * k, 0), v(dx * s, dy, dz), len * k * 0.9, 0.05 * k, cFur, cFur.clone().lerp(cLight, 0.15), 0.35));
    }
    parts.push({ geom: mergeSame(sh), bone: upper, material: fur });
    const el = [
      tuft(v(-0.01 * k * s, 0, -0.03 * k), v(0.45 * s, -0.1, -1), 0.08 * k, 0.026 * k, cFur, cDark, 0.15),
      tuft(v(0.02 * k * s, -0.01 * k, -0.025 * k), v(0.7 * s, -0.3, -0.8), 0.065 * k, 0.022 * k, cFur, cDark, 0.15),
    ];
    parts.push({ geom: mergeSame(el), bone: fore, material: fur });
  }

  // ---- legs: long, thin, one piece across the knee; long dark feet
  const legLen = skel.upperLeg + skel.lowerLeg;
  const legR = profile([
    [0, 0.11],
    [0.2, 0.106],
    [0.4, 0.08],
    [0.52, 0.056],
    [0.6, 0.054],
    [0.72, 0.048],
    [0.88, 0.037],
    [1, 0.034],
  ]);
  for (const side of ["Left", "Right"] as const) {
    const g = limb(v(0, 0.02 * k, 0), v(0, -legLen, 0), (t) => legR(t) * k * g8, { detail: 6 });
    fuzz(g, 0.6);
    paintVertices(g, (_p, out) => out.copy(cFur));
    const up = B[`${side}UpLeg`];
    const lo = B[`${side}Leg`];
    const ky = restWorld(lo).y;
    const bw = 0.05 * k;
    parts.push({
      geom: g, bone: up, material: fur,
      weights: (p) => [
        [up, smoothstep(ky - bw, ky + bw, p.y)],
        [lo, smoothstep(ky + bw, ky - bw, p.y)],
      ],
    });
    // digitigrade-looking foot: a raised heel knob, a sloping metatarsal and a big paw with three toes
    const meta = limb(v(0, 0.012, -0.004), v(0, -0.046, 0.088), (t) => 0.036 + 0.008 * t, { detail: 3 });
    paintVertices(meta, (_p, out) => out.copy(cFur));
    const heel = blob(2, (d, out) => out.set(d.x * 0.03, 0.006 + d.y * 0.03, -0.022 + d.z * 0.028));
    paintVertices(heel, (_p, out) => out.copy(cFur));
    const paw = blob(3, (d, out) => {
      const yy = d.y < -0.2 ? -0.2 - (d.y + 0.2) * 0.25 : d.y; // flat sole
      out.set(d.x * 0.066, -0.05 + yy * 0.032, 0.12 + d.z * 0.072);
    });
    const toes = [-0.038, 0, 0.038].map((x) =>
      blob(2, (d, out) => out.set(x + d.x * 0.024, -0.052 + d.y * 0.024, 0.178 - Math.abs(x) * 0.3 + d.z * 0.03)),
    );
    const pawG = mergeSame([paw, ...toes]);
    paintVertices(pawG, (_p, out) => out.copy(cDark));
    const ftG = mergeSame([meta, heel, pawG]);
    ftG.scale(k, k, k);
    parts.push({ geom: ftG, bone: B[`${side}Foot`], material: fur });
    // a tuft on the outer hip so the thigh mass reads in the front silhouette
    const s = side === "Left" ? 1 : -1;
    parts.push({ geom: tuft(v(0.075 * k * s, -0.05 * k, -0.01 * k), v(s, -0.9, -0.2), 0.09 * k, 0.035 * k, cFur, cDark, 0.15), bone: up, material: fur });
  }

  // ---- tail: bushy, drooping from the back of the hips, lighter tip; smooth-skinned along three bones
  {
    const t0 = restWorld(tail0);
    const t1 = restWorld(tail1);
    const t2 = restWorld(tail2);
    const end = t2.clone().add(v(0.03 * k, -0.17 * k, 0.03 * k));
    const start = t0.clone().add(v(0, 0.05 * k, 0.07 * k));
    const curve = new THREE.CatmullRomCurve3([start, t0, t1, t2, end]);
    const tr = profile([
      [0, 0.035],
      [0.15, 0.065],
      [0.45, 0.14],
      [0.72, 0.15],
      [0.9, 0.09],
      [1, 0.0],
    ]);
    const g = tube(curve, (t) => tr(t) * k * (1 + 0.1 * Math.sin(t * 40)), 6);
    g.computeVertexNormals();
    // bushy breakup: big soft tufts + fine noise
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // shaggy: lobes of fur along the length + fine breakup
      const n = (noise3(x * 30, y * 30 + 2.1, z * 30) * 0.016 + Math.max(0, noise3(x * 70 + 3, y * 70, z * 70)) * 0.02) * k;
      pos.setXYZ(i, x + nrm.getX(i) * n, y + nrm.getY(i) * n, z + nrm.getZ(i) * n);
    }
    g.computeVertexNormals();
    // per-vertex curve parameter (nearest sample) drives both the colour and the weights
    const samples = Array.from({ length: 61 }, (_, i) => curve.getPointAt(i / 60));
    const tAt = (p: THREE.Vector3): number => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const d = samples[i].distanceToSquared(p);
        if (d < bd) {
          bd = d;
          best = i / 60;
        }
      }
      return best;
    };
    paintVertices(g, (p, out) => {
      const t = tAt(p);
      out.copy(cFur).lerp(cDark, 0.2 * smoothstep(0.3, 0.6, t)).lerp(cLight, smoothstep(0.78, 0.92, t));
    });
    parts.push({
      geom: toLocal(g, B.Hips),
      bone: B.Hips,
      material: fur,
      weights: (p): Weights => {
        const t = tAt(p);
        if (t < 0.12) return [[B.Hips, 1 - smoothstep(0.02, 0.12, t)], [tail0, smoothstep(0.02, 0.12, t)]];
        if (t < 0.5) return [[tail0, 1 - smoothstep(0.25, 0.45, t)], [tail1, smoothstep(0.25, 0.45, t)]];
        return [[tail1, 1 - smoothstep(0.55, 0.72, t)], [tail2, smoothstep(0.55, 0.72, t)]];
      },
    });
  }

  let furSeed = variant === "a" ? 201 : 307;
  for (const part of parts) {
    if (part.material !== fur || /Foot|Leg/.test(part.bone.name) || part.geom.getAttribute("position").count < 600) continue;
    part.geom = plushSurface(part.geom, Math.min(320, Math.floor(part.geom.getAttribute("position").count * 0.065)), 0.012 * k, ++furSeed);
  }
  const body = skinBody(root, parts);

  // ---- secondary motion: tail sway (lags behind the hips, follows the sway driver), ear twitch
  const secondary = {
    update(frame: ActorFrame, phase: number): void {
      const w = (frame.secondary.sway - 0.5) * 2;
      const j = (frame.secondary.jiggle - 0.5) * 2;
      const a = 0.18 * w + 0.06 * Math.sin(phase * 0.7);
      tail0.rotation.set(0.1 + 0.05 * j, a * 0.6, 0);
      tail1.rotation.set(0.05, a, 0.04 * Math.sin(phase * 0.7 + 0.6));
      tail2.rotation.set(0.0, a * 1.3, 0.06 * Math.sin(phase * 0.7 + 1.2));
      ears[0].rotation.z = -0.28 + 0.08 * w + 0.02 * Math.sin(phase * 1.3);
      ears[1].rotation.z = 0.28 + 0.08 * w * 0.8 - 0.02 * Math.sin(phase * 1.3 + 0.9);
    },
  };

  return makeRig({
    id,
    root,
    built,
    height: V.height,
    face,
    chest,
    materials: mats,
    geometries: [],
    secondary,
    socketOffset: new THREE.Vector3(-0.09 * k, -0.01 * k, 0.05 * k),
    body,
  });
}
