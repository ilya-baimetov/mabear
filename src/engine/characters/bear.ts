// Bear — procedural stand-in rig (spec §7.3). 2.4 m, pear-shaped, big round belly with a tan patch, tan muzzle
// and face mask, small round dark ears, small eyes with highlights, big glossy black nose, heavy brows.
// Colours sampled from references (docs/LIKENESS.md).
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../api";
import { buildFace, type FaceConfig } from "./face";
import {
  attach, blob, buildSkeleton, bump, col, dir, furMaterial, limb, makeRig, materialSet, mergeSame, paintVertices,
  restWorld, smoothstep, type SkeletonProportions,
} from "./rig";

export const BEAR_LOOK = {
  height: 2.4,
  colors: {
    fur: "#6E4128",
    furDark: "#4E2C1C",
    furSheen: "#C08A5C",
    tan: "#D9A062",
    muzzle: "#E8B676",
    earInner: "#9A6646",
    nose: "#1E1410",
    iris: "#3A261A",
    irisRim: "#140B07",
    sclera: "#FFFDF8",
    brows: "#4A2A1A",
    lash: "#3A2416",
    mouthInterior: "#4A1418",
    lip: "#3A1E16",
    teeth: "#FFF4E6",
    tongue: "#D45A5A",
    pads: "#5A3424",
  },
  skeleton: {
    hipsHeight: 0.85,
    spine: 0.15,
    spine1: 0.2,
    spine2: 0.22,
    neck: 0.34,
    head: 0.12,
    shoulder: [0.1, 0.17],
    clavicle: 0.22,
    upperArm: 0.42,
    foreArm: 0.36,
    upLeg: [0.21, -0.04],
    upperLeg: 0.38,
    lowerLeg: 0.32,
    toe: [0.08, 0.14],
  } satisfies SkeletonProportions,
  head: {
    center: [0, 0.22, 0] as [number, number, number],
    radius: 0.27,
    /** snout ellipsoid (Head-bone space) */
    snoutCenter: [0, 0.12, 0.19] as [number, number, number],
    snoutRadii: [0.155, 0.125, 0.165] as [number, number, number],
  },
  belly: { centerY: 1.03, halfW: 0.37, halfH: 0.43 },
} as const;

type V3 = [number, number, number];

export function buildBear(): CharacterRig {
  const L = BEAR_LOOK;
  const C = L.colors;
  const mats = materialSet();
  const geoms: THREE.BufferGeometry[] = [];
  const built = buildSkeleton(L.skeleton);
  const B = built.bones;
  const root = new THREE.Group();
  root.name = "bear";
  root.add(built.skeletonRoot);
  root.updateMatrixWorld(true);

  const fur = mats.add(furMaterial(C.furSheen));
  const nose = mats.add(
    new THREE.MeshPhysicalMaterial({ color: col(C.nose), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0 }),
  );
  const cFur = col(C.fur);
  const cFurDark = col(C.furDark);
  const cTan = col(C.tan);
  const cMuzzle = col(C.muzzle);

  /** belly patch: tan ellipse on the front of the body, in rest-world coordinates */
  const bellyMask = (pw: THREE.Vector3, nz: number): number => {
    const e = Math.hypot(pw.x / L.belly.halfW, (pw.y - L.belly.centerY) / L.belly.halfH);
    return smoothstep(1.05, 0.88, e) * smoothstep(0.0, 0.35, nz);
  };
  const paintBody = (g: THREE.BufferGeometry, offset: THREE.Vector3) => {
    const nrm = g.getAttribute("normal");
    let i = 0;
    paintVertices(g, (p, out) => {
      const nz = nrm.getZ(i++);
      const pw = p.clone().add(offset);
      out.copy(cFur).lerp(cTan, bellyMask(pw, nz));
    });
  };

  // ---- body: pear-shaped belly blob on Hips (jiggles), chest/shoulder blob on Spine2 (breathes)
  const belly = new THREE.Group();
  belly.name = "belly";
  B.Hips.add(belly);
  const hipsW = restWorld(B.Hips);
  {
    const g = blob(28, (d, out) => {
      const y = d.y < 0 ? d.y * 0.4 : d.y * 0.56;
      const t = (d.y + 1) / 2; // 0 bottom .. 1 top
      const w = 0.5 * (0.78 + 0.32 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.95)));
      out.set(d.x * w * 1.04, 0.16 + y, d.z * w * 0.9 + 0.03);
      out.z += 0.09 * bump(d, dir(0, -0.05, 1), 0.65);
    });
    paintBody(g, hipsW);
    attach(belly, g, fur, "bellyBody");
    geoms.push(g);
  }
  const chest = new THREE.Group();
  chest.name = "chest";
  B.Spine2.add(chest);
  const spine2W = restWorld(B.Spine2);
  {
    const g = blob(24, (d, out) => {
      const t = (d.y + 1) / 2;
      const w = 0.43 - 0.1 * t * t;
      out.set(d.x * w * 1.05, 0.06 + d.y * 0.32, d.z * w * 0.86 + 0.0);
      out.z += 0.03 * bump(d, dir(0, -0.3, 1), 0.6);
    });
    paintBody(g, spine2W);
    attach(chest, g, fur, "chestBody");
    geoms.push(g);
  }
  // neck: thick fur collar joining chest and head
  {
    const g = limb(new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.14, 0.01), (t) => 0.22 - 0.03 * t, { detail: 10, sq: 0.9 });
    paintVertices(g, (_p, out) => out.copy(cFur));
    attach(B.Neck, g, fur, "neck");
    geoms.push(g);
  }

  // ---- head: cranium + fluffy cheeks + snout, tan face mask in vertex colours, big glossy nose
  const H = L.head;
  const hc = new THREE.Vector3(...H.center);
  const sc = new THREE.Vector3(...H.snoutCenter);
  const sr = H.snoutRadii;
  const craniumR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      0.13 * (bump(d, dir(0.78, -0.3, 0.45), 0.36) + bump(d, dir(-0.78, -0.3, 0.45), 0.36)) +
      0.04 * (bump(d, dir(0.35, 0.3, 0.88), 0.25) + bump(d, dir(-0.35, 0.3, 0.88), 0.25)) -
      0.06 * bump(d, dir(0, 1, 0.1), 0.6));
  const cranium = blob(30, (d, out) => {
    out.copy(d).multiplyScalar(craniumR(d)).add(hc);
  });
  const snout = blob(22, (d, out) => {
    const fz = (d.z + 1) / 2;
    out.set(d.x * sr[0] * (1 - 0.18 * fz), d.y * sr[1] * (1 - 0.1 * fz), d.z * sr[2]).add(sc);
  });
  paintVertices(cranium, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    const yl = p.y - hc.y;
    const thr = 0.075 - 0.075 * Math.exp(-((p.x / 0.05) ** 2)); // brown widow's peak between the eyes
    const front = smoothstep(0.25, 0.55, d.z);
    const mask = front * smoothstep(thr + 0.02, thr - 0.02, yl);
    out.copy(cFur).lerp(cTan, mask);
  });
  paintVertices(snout, (_p, out) => out.copy(cMuzzle));
  const headGeom = mergeSame([cranium, snout]);
  attach(B.Head, headGeom, fur, "head");
  geoms.push(headGeom);

  const noseAt = new THREE.Vector3(0, sc.y + sr[1] * 0.55, sc.z + sr[2] * 0.86);
  const noseGeom = blob(14, (d, out) => {
    const top = d.y > 0 ? 1 : 0.85;
    out.set(d.x * 0.085, d.y * 0.056 * top, d.z * 0.062 - 0.012 * d.y * d.y).add(noseAt);
  });
  attach(B.Head, noseGeom, nose, "nose");
  geoms.push(noseGeom);

  // ---- ears: round, dark, cupped, with a tan-brown inner; each in a group for wiggle
  const cEarIn = col(C.earInner);
  const ears: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const eg = new THREE.Group();
    eg.name = s === 1 ? "earL" : "earR";
    const ed = dir(0.6 * s, 0.76, -0.12);
    eg.position.copy(ed.clone().multiplyScalar(H.radius * 0.93).add(hc));
    eg.rotation.set(-0.1, 0.25 * s, -0.42 * s);
    const g = blob(12, (d, out) => {
      const rr = d.x * d.x + d.y * d.y;
      const cup = d.z > 0 ? 0.03 * (1 - rr) : 0;
      out.set(d.x * 0.1, d.y * 0.095, d.z * 0.045 - cup);
    });
    paintVertices(g, (p, out) => {
      const inner = smoothstep(0.072, 0.055, Math.hypot(p.x, p.y + 0.008)) * smoothstep(-0.02, 0.01, p.z);
      out.copy(cFurDark).lerp(cEarIn, inner);
    });
    attach(eg, g, fur, "ear");
    B.Head.add(eg);
    ears.push(eg);
    geoms.push(g);
  }

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
      r: 0.033,
      scaleX: 0.92,
      scaleY: 1.12,
      depth: 0.4,
      iris: 0.6,
      pupil: 0.55,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -0.25,
      lidColor: C.tan,
      lashColor: C.lash,
      lidOpen: -0.55,
      lidCap: 1.3,
      lashFlick: false,
    },
    brows: { color: C.brows, y: 0.058, dx: 0.006, length: 0.11, thickness: 0.019, arch: 0.016, range: 0.03 },
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
  B.Head.add(face.group);
  for (const m of face.group.children) m.castShadow = false;

  // ---- arms: long, thick; paws
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const ua = limb(new THREE.Vector3(-0.06 * s, 0, 0), new THREE.Vector3(0.42 * s, 0, 0), (t) => 0.15 - 0.03 * t + 0.015 * Math.sin(Math.PI * t), {
      detail: 14,
      sq: 0.95,
    });
    paintVertices(ua, (_p, out) => out.copy(cFur));
    attach(B[`${side}Arm`], ua, fur, `${side}UpperArm`);
    const fa = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.36 * s, 0, 0), (t) => 0.125 - 0.02 * t, { detail: 14, sq: 0.95 });
    paintVertices(fa, (_p, out) => out.copy(cFur));
    attach(B[`${side}ForeArm`], fa, fur, `${side}ForeArm`);
    const paw = blob(12, (d, out) => {
      out.set(0.085 * s + d.x * 0.115, d.y * 0.08, d.z * 0.1);
    });
    paintVertices(paw, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.03, -0.07, p.y) * 0.5));
    attach(B[`${side}Hand`], paw, fur, `${side}Paw`);
    geoms.push(ua, fa, paw);
  }

  // ---- legs: short, thick; big feet
  for (const side of ["Left", "Right"] as const) {
    const th = limb(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, -0.38, 0), (t) => 0.21 - 0.045 * t, { detail: 14 });
    paintVertices(th, (_p, out) => out.copy(cFur));
    attach(B[`${side}UpLeg`], th, fur, `${side}Thigh`);
    const sh = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, 0), (t) => 0.165 - 0.02 * t, { detail: 12 });
    paintVertices(sh, (_p, out) => out.copy(cFur));
    attach(B[`${side}Leg`], sh, fur, `${side}Shin`);
    const ft = blob(14, (d, out) => {
      const fz = (d.z + 1) / 2;
      const yy = d.y < -0.35 ? -0.35 - (d.y + 0.35) * 0.2 : d.y;
      out.set(d.x * 0.13 * (0.9 + 0.2 * fz), -0.045 + yy * 0.075 * (1 - 0.25 * fz), 0.06 + d.z * 0.17);
    });
    paintVertices(ft, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.08, -0.105, p.y)));
    attach(B[`${side}Foot`], ft, fur, `${side}Foot`);
    geoms.push(th, sh, ft);
  }

  // ---- secondary motion: belly jiggle (lags the hips), ear wiggle
  const secondary = {
    update(frame: ActorFrame, phase: number): void {
      const j = frame.secondary.jiggle;
      const hy = frame.hipsOffset[1];
      const wob = Math.sin(phase * 2.1);
      belly.position.set(0, -hy * 0.18 * j + 0.008 * j * wob, 0.004 * j * Math.cos(phase * 2.1));
      belly.scale.set(1 + 0.012 * j * wob, 1 - 0.018 * j * wob, 1 + 0.012 * j * wob);
      const w = frame.secondary.sway;
      ears[0].rotation.z = -0.42 + w * 0.18 * Math.sin(phase * 3.0);
      ears[1].rotation.z = 0.42 - w * 0.18 * Math.sin(phase * 3.0 + 0.8);
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
    geometries: geoms,
    secondary,
    socketOffset: new THREE.Vector3(-0.1, -0.02, 0.08),
  });
}
