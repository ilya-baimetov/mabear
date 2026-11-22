// The Wolves: distinct rounded silhouettes and facial proportions, referenced against Animaccord's
// Sly/Silly Wolf character portraits and episode 17 at 300s. The porridge-swollen bellies in that
// episode are a story gag, not their rest anatomy. Keep the common Mixamo rig so all story verbs work.
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../api";
import { buildFace, blendedMouthShape, type FaceConfig } from "./face";
import {
  blob, bump, buildSkeleton, col, dir, extraBone, eyeMaterial, furMaterial, limb, makeRig, materialSet, mergeSame,
  noise3, paintVertices, plushSurface, profile, restWorld, roughen, sdEllipsoid, sdfBlob, skinBody, smin, smoothstep, toLocal,
  welded, type SkeletonProportions, type SkinPart, type Weights,
} from "./rig";

export type WolfVariant = "a" | "b";

const BASE_HEIGHT = 2.0;

/** Proportions at BASE_HEIGHT (each variant scales them uniformly to its height). */
const WOLF_SKELETON: SkeletonProportions = {
  hipsHeight: 0.8,
  spine: 0.16,
  spine1: 0.16,
  spine2: 0.19,
  neck: 0.09,
  head: 0.06,
  shoulder: [0.1, 0.065],
  clavicle: 0.155,
  upperArm: 0.29,
  foreArm: 0.27,
  upLeg: [0.135, -0.05],
  upperLeg: 0.35,
  lowerLeg: 0.33,
  toe: [0.07, 0.185],
};

export const WOLF_LOOK = {
  variants: {
    a: {
      height: 2.05,
      colors: { fur: "#737679", furDark: "#45474B", light: "#DDDCD7", earInner: "#9A9892", iris: "#8C8B4E" },
      girth: 1.04,
    },
    b: {
      height: 1.93,
      colors: { fur: "#746F68", furDark: "#474540", light: "#DCD5C7", earInner: "#A29A8C", iris: "#85804F" },
      girth: 0.87,
    },
  },
  colors: {
    furSheen: "#9EA4AA",
    nose: "#141212",
    irisRim: "#2A1A08",
    sclera: "#FFFDF2",
    brows: "#3A3D42",
    lash: "#2A2A2E",
    mouthInterior: "#23171B",
    lip: "#2A2526",
    teeth: "#FBF5E8",
    tongue: "#D0646A",
  },
  // Big Wolf: high round forehead, blunt wide muzzle. Little Wolf: flatter brow and longer nose.
  heads: {
    a: { center: [0, 0.15, -0.005] as V3, radius: 0.195,
      snoutCenter: [0, 0.095, 0.225] as V3, snoutRadii: [0.142, 0.09, 0.183] as V3,
      nose: [0.069, 0.055, 0.051] as V3, eyeX: 0.073, eyeY: 0.235, eyeR: 0.041, eyeHeight: 1.22 },
    b: { center: [0, 0.137, -0.005] as V3, radius: 0.178,
      snoutCenter: [0, 0.082, 0.243] as V3, snoutRadii: [0.116, 0.073, 0.215] as V3,
      nose: [0.055, 0.037, 0.041] as V3, eyeX: 0.072, eyeY: 0.204, eyeR: 0.034, eyeHeight: 1.03 },
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
  headS.scale.setScalar(1.25 * k);
  headS.position.y = -.1 * k; // larger cartoon head without increasing the ear-tip height
  // tail: three bones off the back of the hips, drooping
  const tail0 = extraBone(B.Hips, "tail0", 0, -0.02 * k, -0.11 * k);
  // the tail hangs a little to the character's left so it shows beside the leg from the front
  const tail1 = extraBone(tail0, "tail1", 0.07 * k, -0.13 * k, -0.11 * k);
  const tail2 = extraBone(tail1, "tail2", 0.07 * k, -0.17 * k, -0.02 * k);
  root.updateMatrixWorld(true);
  const parts: SkinPart[] = [];

  const fur = mats.add(furMaterial(C.furSheen));
  fur.name = "fur";
  // Fine short guard hairs; the old shared bump scale read as deep vertical grooves on a close wolf face.
  const compileFur = fur.onBeforeCompile;
  fur.onBeforeCompile = (shader, renderer) => {
    compileFur.call(fur, shader, renderer);
    shader.uniforms.furFreq.value = 180;
    shader.uniforms.furStretch.value = .28;
    shader.uniforms.furValue.value = .13;
    shader.uniforms.furBump.value = .0018;
  };
  fur.customProgramCacheKey = () => "mabear-wolf-short-coat-v1";
  const eyeMat = mats.add(eyeMaterial());
  eyeMat.name = "eyes";
  const cFur = col(C.fur);
  const cDark = col(C.furDark);
  const cLight = col(C.light);
  let seed = variant === "a" ? 11 : 23;
  const fuzz = (g: THREE.BufferGeometry, s = 1) => roughen(g, WOLF_LOOK.furNoise.amp * s * k, WOLF_LOOK.furNoise.freq / k, (seed += 3.1));

  const W = (n: keyof typeof B) => restWorld(B[n]);
  const legW = W("LeftUpLeg");

  // ---- torso: round chest and low abdomen flow into substantial haunches; no separate feather collar.
  {
    const core = [
      { c: v(0, 1.25, -0.015), r: v(0.255 * g8, 0.235, 0.19 * g8) },
      { c: v(0, 1.15, 0.045), r: v(0.225 * g8, 0.26, 0.205 * g8) },
      { c: v(0, 0.94, 0.035), r: v(0.225 * g8, 0.235, 0.2 * g8) },
      { c: v(0, 0.79, -0.025), r: v(0.235 * g8, 0.145, 0.16 * g8) },
    ];
    const extras = [
      { c: v(0.225, 1.35, -0.02), r: v(0.1, 0.11, 0.105) },
      { c: v(-0.225, 1.35, -0.02), r: v(0.1, 0.11, 0.105) },
      { c: v(0, 1.43, -0.005), r: v(0.12, 0.15, 0.12) },
    ];
    const sdf = (p0: THREE.Vector3): number => {
      const p = p0.clone().divideScalar(k);
      let d = sdEllipsoid(p, core[0].c, core[0].r);
      for (let i = 1; i < core.length; i++) d = smin(d, sdEllipsoid(p, core[i].c, core[i].r), 0.14);
      for (const e of extras) d = smin(d, sdEllipsoid(p, e.c, e.r), 0.07);
      return d * k;
    };
    const g = sdfBlob(10, v(0, 1.1 * k, 0), sdf, 0.9 * k);
    // A few short silhouette breaks at the nape. The long overlapping old ruff read as feathers.
    const nape = [-1, 1].map(side => tuft(v(side * .115 * k, 1.45 * k, -.055 * k),
      v(side * .8, -.35, -.7), .065 * k, .042 * k, cFur, cDark, .12));
    parts.push({ geom: toLocal(mergeSame(nape), chest), bone: chest, material: fur });
    fuzz(g);
    const nrm = g.getAttribute("normal");
    let i = 0;
    paintVertices(g, (p, out) => {
      // Broad, continuous cream bib and abdomen; slightly ragged boundary follows the real fur marking.
      const nz = nrm.getZ(i++);
      const y = p.y / k;
      const x = p.x / k;
      const halfW = (.105 + .08 * Math.exp(-(((y - 1.04) / .29) ** 2))) * g8;
      const edge = noise3(x * 61, y * 48, 3) * .008;
      const m = smoothstep(halfW + .023, halfW - .012, Math.abs(x) + edge)
        * smoothstep(.12, .58, nz) * smoothstep(.7, .81, y) * smoothstep(1.57, 1.45, y);
      out.copy(cFur).lerp(cDark, smoothstep(.05, -.19, p.z / k) * .28).lerp(cLight, m);
    });
    const chain: Array<[THREE.Object3D, number]> = [
      [B.Hips, .8 * k], [B.Spine, .96 * k], [B.Spine1, 1.12 * k],
      [chest, 1.31 * k], [B.Neck, 1.4 * k], [B.Head, 1.46 * k],
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
      const sh = smoothstep(0.14 * k, 0.24 * k, ax) * smoothstep(1.24 * k, 1.34 * k, p.y);
      if (sh > 0) {
        const arm = smoothstep(0.23 * k, 0.31 * k, ax) * 0.7;
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
  const H = WOLF_LOOK.heads[variant];
  const hc = new THREE.Vector3(...H.center);
  const sc = new THREE.Vector3(...H.snoutCenter);
  const sr = H.snoutRadii;
  const craniumR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      0.34 * (bump(d, dir(0.9, -0.42, 0.05), 0.13) + bump(d, dir(-0.9, -0.42, 0.05), 0.13)) + // pointed cheek ruffs
      0.14 * (bump(d, dir(0.72, -0.66, -0.2), 0.12) + bump(d, dir(-0.72, -0.66, -0.2), 0.12)) +
      0.06 * (bump(d, dir(0.3, 0.42, 0.85), 0.22) + bump(d, dir(-0.3, 0.42, 0.85), 0.22)) - // brow ridge
      0.06 * bump(d, dir(0, 1, 0), 0.5) +
      0.08 * bump(d, dir(0, 0.2, -1), 0.6)); // long skull at the back
  const cranium = blob(9, (d, out) => {
    out.copy(d).multiplyScalar(craniumR(d)).add(hc);
  });
  const snout = blob(8, (d, out) => {
    const fz = (d.z + 1) / 2;
    const taper = 1 - .22 * fz * fz;
    // Rounded bridge, flattened underside: a physical upper muzzle above an articulated lower jaw.
    const yy = d.y < -.2 ? -.2 + (d.y + .2) * .22 : d.y;
    out.set(d.x * sr[0] * taper, yy * sr[1] - .005 * fz, d.z * sr[2]).add(sc);
  });
  paintVertices(cranium, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    // light cheeks/throat under the eye line, darker crown and back of the head
    const cheek = smoothstep(.25, -.1, d.y) * smoothstep(-.58, -.05, d.z);
    out.copy(cFur).lerp(cLight, cheek * .95).lerp(cDark, smoothstep(0.55, 0.95, d.y) * 0.35);
  });
  paintVertices(snout, (p, out) => {
    const pale = smoothstep(sc.y + sr[1] * .9, sc.y, p.y);
    out.copy(cFur).lerp(cLight, .62 + .33 * pale);
  });
  fuzz(cranium, 0.5);
  parts.push({ geom: mergeSame([cranium, snout]), bone: headS, material: fur });
  const tipZ = sc.z + sr[2];
  const noseAt = new THREE.Vector3(0, sc.y + sr[1] * 0.3, tipZ - 0.019);
  const noseGeom = blob(4, (d, out) => {
    out.set(d.x * H.nose[0], d.y * H.nose[1] * (d.y > 0 ? 1 : .88), d.z * H.nose[2]).add(noseAt);
  });
  paintVertices(noseGeom, (_p, out) => out.copy(col(C.nose)));
  parts.push({ geom: noseGeom, bone: headS, material: eyeMat, shadow: false });
  {
    // scruffy head: three pointed cheek tufts per side sweeping back, a little crest between the ears
    const tufts: THREE.BufferGeometry[] = [];
    const cl = cLight.clone();
    for (const s of [1, -1]) {
      for (const [dy, dz, len] of [[-0.2, .18, .055], [-0.4, .03, .065], [-0.55, -.18, .05]] as const) {
        const d = dir(0.9 * s, dy, dz);
        const b = d.clone().multiplyScalar(craniumR(d) * 0.94).add(hc);
        tufts.push(tuft(b, v(0.85 * s, dy * 0.6 - 0.15, -0.45), len, 0.045, cFur.clone().lerp(cl, 0.8), cl, 0.18));
      }
    }
    for (const [x, len] of [[-0.035, 0.032], [0.0, 0.045], [0.035, 0.025]] as const) {
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
      const w = (variant === "a" ? .072 : .067) * Math.pow(1 - t, .75) + .003;
      const cup = d.z > 0 ? 0.017 * (1 - d.x * d.x) * (1 - t) : 0;
      out.set(d.x * w, t * (variant === "a" ? .18 : .21), d.z * 0.025 * (1 - 0.5 * t) - cup);
    });
    paintVertices(g, (q, out) => {
      const inner = smoothstep(0.0, 0.012, q.z + 0.006) * smoothstep(0.055, 0.025, Math.abs(q.x) + q.y * 0.25) * smoothstep(0.18, 0.1, q.y);
      out.copy(cDark).lerp(cEarIn, inner * 0.85);
    });
    ears.push(eb);
    parts.push({ geom: g, bone: eb, material: fur });
  }
  root.updateMatrixWorld(true);

  // ---- face: readable white eyes with small pupils; pair-specific brow and skull proportions.
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
  const faceCfg: FaceConfig = {
    eyes: {
      surface: { center: H.center as V3, radius: H.radius, zAt: craniumZ },
      x: H.eyeX,
      y: H.eyeY,
      r: H.eyeR,
      scaleX: 1.03,
      scaleY: H.eyeHeight,
      scaleZ: .55,
      depth: .28,
      iris: .35,
      pupil: .79,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -.02,
      surfaceAlignment: .35,
      lidColor: C.fur,
      lashColor: C.lash,
      lidOpen: variant === "a" ? -.3 : -.12,
      lidCap: 1.3,
      lashFlick: false,
      lidMaterial: fur,
    },
    eyeMaterial: eyeMat,
    brows: { color: variant === "b" ? "#5e5a56" : C.furDark, y: .054, dx: .005, length: .09, thickness: .013, arch: variant === "a" ? .012 : .004, range: .027, material: fur },
    mouth: {
      surface: { center: H.snoutCenter as V3, radius: sr[2], zAt: () => sc.z + sr[2] },
      y: sc.y - 0.026,
      halfWidth: 0.03,
      height: 0.045,
      line: 0.005,
      curve: 0.014,
      interior: C.mouthInterior,
      lip: C.lip,
      teeth: C.teeth,
      tongue: C.tongue,
      smirk: variant === "b" ? .25 : .05,
    },
  };
  const face = buildFace(faceCfg, mats);
  headS.add(face.group);
  // The general humanoid mouth is a decal; a long canine muzzle needs a real moving jaw in profile.
  face.group.getObjectByName("mouth")!.visible = false;
  const jaw = extraBone(headS, "jaw", 0, .066, .045);
  const jawWidth = sr[0] * .92;
  const jawLength = sr[2] * .94;
  const jawCenterZ = sc.z - .045;
  const lowerJaw = blob(7, (d, out) => {
    const yy = d.y > .12 ? .12 + (d.y - .12) * .18 : d.y;
    out.set(d.x * jawWidth * (1 - .13 * Math.max(0, d.z)), -.01 + yy * .041,
      jawCenterZ + d.z * jawLength);
  });
  paintVertices(lowerJaw, (_p, out) => out.copy(cLight).lerp(cFur, .16));
  parts.push({ geom: lowerJaw, bone: jaw, material: fur });
  const mouthMat = mats.add(new THREE.MeshStandardMaterial({color: 0xffffff, vertexColors: true, roughness: .82}));
  mouthMat.onBeforeCompile = (shader) => {
    if (shader.fragmentShader.includes("#include <roughnessmap_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
{
  float toothMask = smoothstep(0.45, 0.72, min(diffuseColor.g, diffuseColor.b));
  float tongueMask = smoothstep(0.15, 0.35, diffuseColor.r - diffuseColor.g) * (1.0 - toothMask);
  roughnessFactor = mix(0.94, 0.38, tongueMask);
  roughnessFactor = mix(roughnessFactor, 0.28, toothMask);
}`,
      );
    }
  };
  mouthMat.customProgramCacheKey = () => "mabear-wolf-mouth-v1";
  const interior = blob(4, (d, out) => out.set(d.x * jawWidth * .91, .002 + d.y * .009,
    jawCenterZ + d.z * jawLength * .9));
  paintVertices(interior, (_p, out) => out.copy(col(C.mouthInterior)));
  parts.push({ geom: interior, bone: jaw, material: mouthMat });
  const palate = interior.clone();
  palate.scale(.94, .45, .95);
  palate.translate(0, .065, .045);
  parts.push({ geom: palate, bone: headS, material: mouthMat });
  const throat = blob(5, (d, out) => out.set(d.x * jawWidth * .8, .066 + d.y * .027, .125 + d.z * .071));
  paintVertices(throat, (_p, out) => out.copy(col(C.mouthInterior)));
  parts.push({ geom: throat, bone: headS, material: mouthMat });
  const tongue = blob(3, (d, out) => out.set(d.x * jawWidth * .54, .013 + d.y * .008, jawCenterZ + .047 + d.z * .07));
  paintVertices(tongue, (_p, out) => out.copy(col(C.tongue)));
  parts.push({ geom: tongue, bone: jaw, material: mouthMat });
  // Small lower incisors and two side canines; avoid a human-looking full-width denture.
  const teeth = [-.72, -.42, -.14, .14, .42, .72].map(x => blob(2, (d, out) => {
    const fang = Math.abs(x) > .6;
    const taper = 1 - (fang ? .38 : .08) * Math.max(0, d.y);
    const round = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), .65);
    out.set(x * jawWidth + (fang ? d.x : round(d.x)) * (fang ? .011 : .0175) * taper,
      .012 + (fang ? d.y : round(d.y)) * (fang ? .018 : .008),
      jawCenterZ + jawLength * (.84 - .23 * Math.abs(x)) + (fang ? d.z : round(d.z)) * .008 * taper);
  }));
  const teethGeom = mergeSame(teeth);
  paintVertices(teethGeom, (_p, out) => out.copy(col(C.teeth)));
  parts.push({ geom: teethGeom, bone: jaw, material: mouthMat });
  // Soft mouth corners connect the upper muzzle to the moving jaw. Without these
  // two weighted cheek folds the open jaw reads as a separate floating paddle in profile.
  const headRestInverse = headS.matrixWorld.clone().invert();
  const cheekUpper = sc.y - .008, cheekLower = .053;
  for (const side of [-1, 1]) {
    const positions: number[] = [], indices: number[] = [];
    const cols = 12, rows = 3;
    for (let iy = 0; iy <= rows; iy++) for (let iz = 0; iz <= cols; iz++) {
      const t = iz / cols, q = iy / rows;
      const z = .075 + (.16 - .025 * Math.sin(q * Math.PI) - .075) * t;
      const radius = Math.sqrt(Math.max(.08, 1 - ((z - sc.z) / sr[2]) ** 2));
      positions.push(side * sr[0] * radius * (.985 + .12 * Math.sin(q * Math.PI) * Math.sin(t * Math.PI)),
        cheekUpper * (1 - q) + cheekLower * q, z);
    }
    for (let iy = 0; iy < rows; iy++) for (let iz = 0; iz < cols; iz++) {
      const a = iy * (cols + 1) + iz, b = a + 1, c = a + cols + 1, d = c + 1;
      indices.push(...(side > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
    }
    const cheek = new THREE.BufferGeometry();
    cheek.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    cheek.setIndex(indices); cheek.computeVertexNormals();
    paintVertices(cheek, (_p, out) => out.copy(cLight).lerp(cFur, .1));
    parts.push({ geom: cheek, bone: headS, material: fur, weights: (p) => {
      const local = p.clone().applyMatrix4(headRestInverse);
      const w = Math.min(1, Math.max(0, (cheekUpper - local.y) / (cheekUpper - cheekLower)));
      return [[headS, 1 - w], [jaw, w]];
    } });
  }
  const faceUpdate = face.update.bind(face);
  face.update = (params, sleeping) => {
    faceUpdate(params, sleeping);
    const shape = blendedMouthShape(params);
    jaw.rotation.x = sleeping ? .035 : .035 + shape.open * .72;
    jaw.rotation.z = shape.asym * .025;
    jaw.updateMatrixWorld(true);
  };
  root.updateMatrixWorld(true);
  for (const p of face.parts) parts.push({ ...p, shadow: p.material === fur ? true : p.shadow });

  // ---- arms: rounded shoulder and forearm masses, with soft pale paws.
  const armLen = skel.upperArm + skel.foreArm;
  const armR = profile([
    [0, 0.091],
    [0.12, 0.097],
    [0.35, 0.079],
    [0.5, 0.06],
    [0.62, 0.075],
    [0.85, 0.059],
    [1, 0.05],
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
    paintVertices(g, (p, out) => out.copy(cFur).lerp(cLight, smoothstep(.25 * k, .56 * k, Math.abs(p.x)) * .5));
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
    const wrist = blob(4, (d, out) => out.set(d.x * .043 * s, d.y * .039, d.z * .045));
    const fingers: THREE.BufferGeometry[] = [palm, wrist];
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
    hg.scale(1.28 * k, 2.05 * k, 1.65 * k);
    paintVertices(hg, (_p, out) => out.copy(cLight).lerp(cFur, .36));
    parts.push({ geom: hg, bone: B[`${side}Hand`], material: fur });
    const elbowTuft = tuft(v(-.01 * k * s, 0, -.04 * k), v(.35 * s, -.1, -1),
      .045 * k, .029 * k, cFur, cDark, .1);
    parts.push({ geom: elbowTuft, bone: fore, material: fur });
  }

  // ---- legs: substantial round haunches taper into hocks; large soft feet.
  const legLen = skel.upperLeg + skel.lowerLeg;
  const legR = profile([
    [0, 0.145],
    [0.2, 0.152],
    [0.4, 0.117],
    [0.52, 0.079],
    [0.6, 0.075],
    [0.72, 0.067],
    [0.88, 0.049],
    [1, 0.043],
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
      out.set(d.x * 0.087, -0.058 + yy * 0.042, 0.13 + d.z * 0.09);
    });
    const toes = [-0.05, 0, 0.05].map((x) =>
      blob(2, (d, out) => out.set(x + d.x * 0.031, -0.047 + d.y * 0.023, 0.201 - Math.abs(x) * 0.3 + d.z * 0.03)),
    );
    const pawG = mergeSame([paw, ...toes]);
    paintVertices(pawG, (_p, out) => out.copy(cLight).lerp(cFur, .54));
    const ftG = mergeSame([meta, heel, pawG]);
    ftG.scale(k, k, k);
    ftG.translate(0, .018 * k, 0);
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
    const g = tube(curve, (t) => tr(t) * k * (1 + 0.025 * Math.sin(t * 28)), 6);
    g.computeVertexNormals();
    // bushy breakup: big soft tufts + fine noise
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      // shaggy: lobes of fur along the length + fine breakup
      const n = (noise3(x * 30, y * 30 + 2.1, z * 30) * 0.005 + Math.max(0, noise3(x * 70 + 3, y * 70, z * 70)) * 0.006) * k;
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
      out.copy(cFur).lerp(cDark, 0.2 * smoothstep(0.3, 0.6, t)).lerp(cDark, smoothstep(0.78, 0.95, t) * .55);
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
    part.geom = plushSurface(part.geom, Math.min(600, Math.floor(part.geom.getAttribute("position").count * 0.12)), 0.009 * k, ++furSeed);
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
