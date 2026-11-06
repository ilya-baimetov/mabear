// Bear — procedural stand-in rig (spec §7.3). 2.4 m, pear-shaped, big round belly with a tan patch, tan muzzle
// and face mask, small round dark ears, small eyes with highlights, big glossy black nose, heavy brows.
// Colours sampled from references (docs/LIKENESS.md).
// Body: ONE sculpted pear torso (soft union of ellipsoids, smooth-skinned from Hips to Spine2, belly and chest on
// secondary bones), continuous arms and legs smooth-skinned across elbows and knees, all merged per material into
// skinned meshes (≈ 5 draw calls + 1 shadow draw).
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../api";
import { buildFace, type FaceConfig } from "./face";
import {
  blob, bump, buildSkeleton, col, dir, extraBone, eyeMaterial, furMaterial, limb, makeRig, materialSet, mergeSame,
  noise3, paintVertices, plushSurface, profile, restWorld, roughen, sdEllipsoid, sdfBlob, skinBody, smin, smoothstep, toLocal,
  type SkeletonProportions, type SkinPart, type Weights,
} from "./rig";

export const BEAR_LOOK = {
  height: 2.4,
  colors: {
    fur: "#6B432C",
    furDark: "#40241A",
    furSheen: "#B07A50",
    tan: "#CDA475",
    muzzle: "#E2BB8B",
    earInner: "#C8955E",
    nose: "#1E1410",
    iris: "#3A261A",
    irisRim: "#140B07",
    sclera: "#EFE2D2",
    brows: "#4A2A1A",
    lash: "#3A2416",
    mouthInterior: "#4A1418",
    lip: "#3A1E16",
    teeth: "#FFF4E6",
    tongue: "#D45A5A",
    pads: "#5A3424",
  },
  skeleton: {
    hipsHeight: 0.66,
    spine: 0.18,
    spine1: 0.25,
    spine2: 0.27,
    neck: 0.285,
    head: 0.14,
    shoulder: [0.12, 0.2],
    clavicle: 0.22,
    upperArm: 0.4,
    foreArm: 0.34,
    upLeg: [0.22, -0.03],
    upperLeg: 0.29,
    lowerLeg: 0.25,
    toe: [0.07, 0.15],
  } satisfies SkeletonProportions,
  /** the whole head (cranium, muzzle, ears, face rig) is built at this base size and scaled by `headScale` */
  headScale: 1.29,
  head: {
    center: [0, 0.2, -0.02] as [number, number, number],
    radius: 0.255,
    /** snout ellipsoid (head space, before headScale) */
    snoutCenter: [0, 0.09, 0.2] as [number, number, number],
    snoutRadii: [0.174, 0.12, 0.202] as [number, number, number],
  },
  /** tan belly patch ellipse (rest-world metres) */
  belly: { centerY: 1.0, halfW: 0.37, halfH: 0.52 },
  /** fur breakup: displacement amplitude (m) and spatial frequency (1/m) */
  furNoise: { amp: 0.0035, freq: 24 },
} as const;

type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildBear(): CharacterRig {
  const L = BEAR_LOOK;
  const C = L.colors;
  const mats = materialSet();
  const built = buildSkeleton(L.skeleton);
  const B = built.bones;
  const root = new THREE.Group();
  root.name = "bear";
  root.add(built.skeletonRoot);
  // secondary bones: belly jiggle (Hips), breathing chest (Spine2), the scaled head
  const belly = extraBone(B.Hips, "belly");
  const chest = extraBone(B.Spine2, "chest");
  const headS = extraBone(B.Head, "headScale");
  headS.scale.setScalar(L.headScale);
  root.updateMatrixWorld(true);
  const parts: SkinPart[] = [];

  const fur = mats.add(furMaterial(C.furSheen));
  fur.name = "fur";
  const eyeMat = mats.add(eyeMaterial());
  eyeMat.name = "eyes";
  const cFur = col(C.fur);
  const cFurDark = col(C.furDark);
  const cTan = col(C.tan);
  const cMuzzle = col(C.muzzle);
  let seed = 0;
  const fuzz = (g: THREE.BufferGeometry, k = 1) => roughen(g, L.furNoise.amp * k, L.furNoise.freq, (seed += 3.7));

  /** belly patch: tan ellipse on the front of the body, in rest-world coordinates */
  const bellyMask = (pw: THREE.Vector3, nz: number): number => {
    const e = Math.hypot(pw.x / L.belly.halfW, (pw.y - L.belly.centerY) / L.belly.halfH);
    return smoothstep(1.05, 0.88, e) * smoothstep(0.0, 0.35, nz);
  };

  const W = (name: keyof typeof B) => restWorld(B[name]);
  const hipsY = W("Hips").y;
  const spineY = W("Spine").y;
  const spine1Y = W("Spine1").y;
  const spine2Y = W("Spine2").y;
  const armW = W("LeftArm");
  const legW = W("LeftUpLeg");

  // ---- torso: ONE pear (hips + belly + chest + shoulder caps + neck ruff), no crease anywhere
  {
    const core = [
      { c: v(0, 0.94, 0.05), r: v(0.56, 0.52, 0.49) }, // belly: the widest, lowest mass
      { c: v(0, 0.7, -0.01), r: v(0.5, 0.31, 0.43) }, // seat / hips
      { c: v(0, 1.38, -0.03), r: v(0.45, 0.36, 0.37) }, // chest, narrower: the pear tapers up
    ];
    const caps = [
      { c: v(0.31, armW.y, -0.02), r: v(0.18, 0.18, 0.18) },
      { c: v(-0.31, armW.y, -0.02), r: v(0.18, 0.18, 0.18) },
      { c: v(0, 1.69, -0.05), r: v(0.30, 0.24, 0.27) }, // neck ruff: the head sinks into it, no visible neck
    ];
    const sdf = (p: THREE.Vector3): number => {
      let d = sdEllipsoid(p, core[0].c, core[0].r);
      for (let i = 1; i < core.length; i++) d = smin(d, sdEllipsoid(p, core[i].c, core[i].r), 0.34);
      for (const e of caps) d = smin(d, sdEllipsoid(p, e.c, e.r), 0.16);
      return d;
    };
    const g = sdfBlob(15, v(0, 1.1, 0), sdf, 1.3, (d, out) => {
      // soft forward belly sag, slightly lower than the centre
      out.z += 0.05 * bump(d, dir(0, -0.25, 1), 0.55);
    });
    fuzz(g);
    const nrm = g.getAttribute("normal");
    let i = 0;
    paintVertices(g, (p, out) => {
      out.copy(cFur).lerp(cTan, bellyMask(p, nrm.getZ(i++)));
    });
    const knots: Array<[THREE.Object3D, number]> = [
      [B.Hips, hipsY + 0.12],
      [B.Spine, spineY + 0.16],
      [B.Spine1, spine1Y + 0.14],
      [B.Spine2, spine2Y + 0.1],
    ];
    const weights = (p: THREE.Vector3): Weights => {
      const w: Weights = [];
      // chain partition of unity along height
      if (p.y <= knots[0][1]) w.push([knots[0][0], 1]);
      else if (p.y >= knots[3][1]) w.push([knots[3][0], 1]);
      else {
        for (let k = 0; k < 3; k++) {
          const [b0, y0] = knots[k];
          const [b1, y1] = knots[k + 1];
          if (p.y >= y0 && p.y <= y1) {
            const t = smoothstep(y0, y1, p.y);
            w.push([b0, 1 - t], [b1, t]);
          }
        }
      }
      // belly front → belly bone (jiggle); upper body → chest bone (breathing)
      const front = smoothstep(-0.05, 0.3, p.z) * smoothstep(1.32, 1.05, p.y);
      for (const e of w) {
        if (e[0] === B.Hips || e[0] === B.Spine) {
          const k = e[1] * front * 0.8;
          e[1] -= k;
          w.push([belly, k]);
        } else if (e[0] === B.Spine2) {
          e[0] = chest;
        }
      }
      const ax = Math.abs(p.x);
      const s = p.x > 0 ? "Left" : "Right";
      // shoulder caps ride the clavicle and, outermost, the arm (a deltoid that follows the arm down)
      const sh = smoothstep(0.12, 0.34, ax) * smoothstep(spine2Y, armW.y, p.y);
      if (sh > 0) {
        const arm = smoothstep(0.3, 0.52, ax) * smoothstep(armW.y - 0.2, armW.y, p.y) * 0.5;
        const tot = w.reduce((a, e) => a + e[1], 0);
        for (const e of w) e[1] *= 1 - sh * 0.7;
        w.push([B[`${s}Shoulder`], tot * sh * 0.7 * (1 - arm)], [B[`${s}Arm`], tot * sh * 0.7 * arm]);
      }
      // the seat follows the thighs a little
      const lg = smoothstep(legW.y + 0.02, legW.y - 0.16, p.y) * smoothstep(0.06, 0.2, ax);
      if (lg > 0) {
        for (const e of w) e[1] *= 1 - lg * 0.55;
        w.push([B[`${s}UpLeg`], lg * 0.55]);
      }
      return w;
    };
    parts.push({ geom: toLocal(g, B.Hips), bone: B.Hips, material: fur, weights });
  }

  // ---- head: cranium + fluffy cheeks + snout, tan face mask in vertex colours, big glossy nose (all ×headScale)
  const H = L.head;
  const hc = new THREE.Vector3(...H.center);
  const sc = new THREE.Vector3(...H.snoutCenter);
  const sr = H.snoutRadii;
  const craniumR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      0.14 * (bump(d, dir(0.8, -0.32, 0.45), 0.36) + bump(d, dir(-0.8, -0.32, 0.45), 0.36)) +
      0.04 * (bump(d, dir(0.35, 0.3, 0.88), 0.25) + bump(d, dir(-0.35, 0.3, 0.88), 0.25)) -
      0.09 * bump(d, dir(0, 1, 0.1), 0.55));
  // A single implicit sculpt joins the muzzle into the cheeks. The old two
  // intersecting spheres left a hard circular seam in every three-quarter shot.
  const headSdf = (p: THREE.Vector3): number => {
    const delta = p.clone().sub(hc);
    const cran = delta.length() - craniumR(delta.clone().normalize());
    const fz = Math.max(0,Math.min(1,((p.z-sc.z)/sr[2]+1)*0.5));
    const muzzle = sdEllipsoid(p,sc,v(sr[0]*(1-0.18*fz),sr[1]*(1-0.10*fz),sr[2]));
    return smin(cran,muzzle,0.055);
  };
  const headGeom = sdfBlob(14,hc,headSdf,0.7);
  paintVertices(headGeom,(p,out)=>{
    const d=p.clone().sub(hc).normalize();
    const yl=p.y-hc.y;
    const thr=0.075-0.075*Math.exp(-((p.x/0.05)**2));
    const mask=smoothstep(0.4,0.68,d.z)*smoothstep(thr+0.02,thr-0.02,yl);
    const muzzle=smoothstep(sc.z-0.02,sc.z+0.14,p.z)*smoothstep(hc.y+0.03,hc.y-0.04,p.y);
    out.copy(cFur).lerp(cTan,mask).lerp(cMuzzle,muzzle);
  });
  fuzz(headGeom,0.6);
  // The unified head overlaps the neck ruff, keeping the seam under the jaw.
  parts.push({geom:headGeom,bone:headS,material:fur,shadow:false});

  const noseAt = new THREE.Vector3(0, sc.y + sr[1] * 0.55, sc.z + sr[2] * 0.86);
  const noseGeom = blob(5, (d, out) => {
    const top = d.y > 0 ? 1 : 0.85;
    out.set(d.x * 0.088, d.y * 0.058 * top, d.z * 0.064 - 0.012 * d.y * d.y).add(noseAt);
  });
  paintVertices(noseGeom, (_p, out) => out.copy(col(C.nose)));
  parts.push({ geom: noseGeom, bone: headS, material: eyeMat, shadow: false });

  // ---- ears: round, dark, cupped, with a tan-brown inner; each on a bone for wiggle
  const cEarIn = col(C.earInner);
  const ears: THREE.Bone[] = [];
  for (const s of [1, -1]) {
    const ed = dir(0.6 * s, 0.76, -0.12);
    const p = ed.clone().multiplyScalar(H.radius * 0.93).add(hc);
    const eb = extraBone(headS, s === 1 ? "earL" : "earR", p.x, p.y, p.z);
    eb.rotation.set(-0.1, 0.25 * s, -0.42 * s);
    const g = blob(4, (d, out) => {
      const rr = d.x * d.x + d.y * d.y;
      const cup = d.z > 0 ? 0.03 * (1 - rr) : 0;
      out.set(d.x * 0.112, d.y * 0.106, d.z * 0.05 - cup);
    });
    paintVertices(g, (q, out) => {
      const inner = smoothstep(0.08, 0.06, Math.hypot(q.x, q.y + 0.01)) * smoothstep(-0.02, 0.01, q.z);
      out.copy(cFurDark).lerp(cEarIn, inner);
    });
    ears.push(eb);
    parts.push({ geom: g, bone: eb, material: fur, shadow: false });
  }
  root.updateMatrixWorld(true);

  // ---- face rig: small eyes at the top of the snout, heavy brows, mouth on the muzzle
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
  const snoutZ = (x: number, y: number): number => {
    // un-tapered ellipsoid approximation, corrected for the front taper
    const ex = x / (sr[0] * 0.86);
    const ey = (y - sc.y) / (sr[1] * 0.93);
    return sc.z + sr[2] * Math.sqrt(Math.max(1 - ex * ex - ey * ey, 0));
  };
  const faceCfg: FaceConfig = {
    eyes: {
      surface: { center: H.center as V3, radius: H.radius, zAt: craniumZ },
      x: 0.098,
      y: hc.y + 0.05,
      r: 0.034,
      scaleX: 0.98,
      scaleY: 1.06,
      scaleZ: 0.6,
      depth: 0.3,
      iris: 0.70,
      pupil: 0.58,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -0.25,
      lidColor: C.tan,
      lashColor: C.lash,
      lidOpen: -0.38,
      lidCap: 1.3,
      lashFlick: false,
      lidMaterial: fur,
    },
    eyeMaterial: eyeMat,
    brows: { color: C.brows, y: 0.058, dx: 0.006, length: 0.11, thickness: 0.019, arch: 0.016, range: 0.03, material: fur },
    mouth: {
      surface: { center: H.snoutCenter as V3, radius: sr[2], zAt: snoutZ },
      y: sc.y - 0.035,
      halfWidth: 0.072,
      height: 0.085,
      line: 0.0075,
      curve: 0.026,
      interior: C.mouthInterior,
      lip: C.lip,
      teeth: C.teeth,
      tongue: C.tongue,
    },
  };
  const face = buildFace(faceCfg, mats);
  headS.add(face.group);
  root.updateMatrixWorld(true);
  parts.push(...face.parts);

  // ---- arms: one continuous mass per arm (deltoid → biceps → elbow → heavy forearm → wrist), smooth-skinned
  //      across the elbow; big paws with a thumb pad
  const upperLen = L.skeleton.upperArm;
  const armLen = upperLen + L.skeleton.foreArm;
  const armR = profile([
    [0, 0.19],
    [0.12, 0.185],
    [0.32, 0.158],
    [0.52, 0.128],
    [0.6, 0.13],
    [0.72, 0.148],
    [0.88, 0.132],
    [1, 0.118],
  ]);
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const x0 = -0.07;
    const g = limb(v(x0 * s, 0, 0), v(armLen * s, 0, 0), (t) => armR(t), { detail: 8, sq: 0.94 });
    // elbow point at the back, a soft forearm flexor bulge at the front-top
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * s;
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const e = Math.exp(-(((x - upperLen) / 0.06) ** 2)) * smoothstep(0, -0.12, z);
      const f = Math.exp(-(((x - upperLen - 0.12) / 0.1) ** 2)) * smoothstep(0, 0.1, y + z * 0.5);
      pos.setZ(i, z - 0.022 * e);
      pos.setY(i, y + 0.012 * f);
    }
    g.computeVertexNormals();
    fuzz(g);
    paintVertices(g, (_p, out) => out.copy(cFur));
    const upper = B[`${side}Arm`];
    const fore = B[`${side}ForeArm`];
    const elbowX = restWorld(fore).x;
    parts.push({
      geom: g,
      bone: upper,
      material: fur,
      weights: (p) => [
        [upper, 1 - smoothstep(elbowX - 0.07 * s, elbowX + 0.07 * s, p.x)],
        [fore, smoothstep(elbowX - 0.07 * s, elbowX + 0.07 * s, p.x)],
      ],
    });
    const paw = blob(5, (d, out) => {
      out.set(0.1 * s + d.x * 0.155, d.y * 0.11, d.z * 0.14);
      out.z += 0.02 * bump(d, dir(0, 0, 1), 0.6);
    });
    const thumb = blob(3, (d, out) => {
      out.set(0.04 * s + d.x * 0.065, -0.012 + d.y * 0.058, 0.12 + d.z * 0.058);
    });
    const pawG = mergeSame([paw, thumb]);
    fuzz(pawG, 0.5);
    paintVertices(pawG, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.03, -0.08, p.y) * 0.55));
    parts.push({ geom: pawG, bone: B[`${side}Hand`], material: fur });
  }

  // ---- legs: short, thick; one mass from the seat to the ankle, smooth-skinned across the knee; big feet
  const legLen = L.skeleton.upperLeg + L.skeleton.lowerLeg;
  const legR = profile([
    [0, 0.25],
    [0.3, 0.225],
    [0.52, 0.18],
    [0.68, 0.19],
    [1, 0.155],
  ]);
  for (const side of ["Left", "Right"] as const) {
    const g = limb(v(0, 0.07, 0), v(0, -legLen, 0), legR, { detail: 8 });
    fuzz(g);
    paintVertices(g, (_p, out) => out.copy(cFur));
    const up = B[`${side}UpLeg`];
    const lo = B[`${side}Leg`];
    const kneeY = restWorld(lo).y;
    parts.push({ geom: g, bone: up, material: fur, weights: (p) => [[up, smoothstep(kneeY - 0.06, kneeY + 0.06, p.y)], [lo, smoothstep(kneeY + 0.06, kneeY - 0.06, p.y)]] });
    const ft = blob(5, (d, out) => {
      const fz = (d.z + 1) / 2;
      const yy = d.y < -0.35 ? -0.35 - (d.y + 0.35) * 0.2 : d.y;
      out.set(d.x * 0.16 * (0.9 + 0.2 * fz), -0.035 + yy * 0.075 * (1 - 0.25 * fz), 0.07 + d.z * 0.2);
    });
    fuzz(ft, 0.5);
    paintVertices(ft, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.07, -0.095, p.y)));
    parts.push({ geom: ft, bone: B[`${side}Foot`], material: fur });
  }

  // fur clumps: subtle value breakup in the vertex colours (darker in the noise valleys)
  for (const part of parts) {
    if (part.material !== fur) continue;
    const c = part.geom.getAttribute("color") as THREE.BufferAttribute | undefined;
    const p = part.geom.getAttribute("position") as THREE.BufferAttribute;
    if (!c) continue;
    for (let i = 0; i < c.count; i++) {
      const k = 0.9 + 0.1 * noise3(p.getX(i) * 24, p.getY(i) * 24 + 1.7, p.getZ(i) * 24);
      c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
    }
  }

  // Silhouette fibres complement the fine strand shader. Budget stays in the
  // existing batches: there is no transparent shell stack and no extra draw call.
  let furSeed = 133;
  for (const part of parts) {
    if (part.material !== fur || /Foot|Leg/.test(part.bone.name) || part.geom.getAttribute("position").count < 400) continue;
    const n = Math.min(750, Math.floor(part.geom.getAttribute("position").count * 0.13));
    part.geom = plushSurface(part.geom, n, part.shadow === false ? 0.009 : 0.017, ++furSeed);
  }
  const body = skinBody(root, parts);

  // ---- secondary motion: belly jiggle (lags the hips), ear wiggle
  const secondary = {
    update(frame: ActorFrame, phase: number): void {
      // jiggle / sway are oscillating drivers in 0..1 (0.5 = rest) produced by evaluate()
      const j = (frame.secondary.jiggle - 0.5) * 2;
      const w = (frame.secondary.sway - 0.5) * 2;
      const hy = frame.hipsOffset[1];
      belly.position.set(0, -hy * 0.15 + 0.014 * j, 0.006 * j);
      belly.scale.set(1 + 0.014 * j, 1 - 0.02 * j, 1 + 0.014 * j);
      ears[0].rotation.z = -0.42 + 0.12 * w + 0.02 * Math.sin(phase);
      ears[1].rotation.z = 0.42 + 0.12 * w * 0.8 - 0.02 * Math.sin(phase + 0.8);
    },
  };

  return makeRig({
    id: "bear",
    root,
    built,
    height: L.height,
    face,
    chest,
    materials: mats,
    geometries: [],
    secondary,
    socketOffset: new THREE.Vector3(-0.1, -0.02, 0.08),
    body,
  });
}
