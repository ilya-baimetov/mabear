// Bear — procedural stand-in rig (spec §7.3). 2.4 m, pear-shaped, big round belly with a tan patch, tan muzzle
// and face mask, small round dark ears, small eyes with highlights, big glossy black nose, heavy brows.
// Colours sampled from references (docs/LIKENESS.md).
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../api";
import { buildFace, type FaceConfig } from "./face";
import {
  attach, blob, buildSkeleton, bump, col, dir, furMaterial, limb, makeRig, materialSet, mergeSame, paintVertices,
  noise3, restWorld, roughen, smoothstep, type SkeletonProportions,
} from "./rig";

export const BEAR_LOOK = {
  height: 2.4,
  colors: {
    fur: "#5E3622",
    furDark: "#40241A",
    furSheen: "#C08A5C",
    tan: "#D9A062",
    muzzle: "#E8B676",
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
    neck: 0.36,
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
  head: {
    center: [0, 0.2, -0.02] as [number, number, number],
    radius: 0.255,
    /** snout ellipsoid (Head-bone space) */
    snoutCenter: [0, 0.09, 0.2] as [number, number, number],
    snoutRadii: [0.15, 0.12, 0.235] as [number, number, number],
  },
  belly: { centerY: 1.0, halfW: 0.38, halfH: 0.5 },
  /** fur breakup: displacement amplitude (m) and spatial frequency (1/m) */
  furNoise: { amp: 0.011, freq: 14 },
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
  let seed = 0;
  const fuzz = (g: THREE.BufferGeometry, k = 1) => roughen(g, L.furNoise.amp * k, L.furNoise.freq, (seed += 3.7));

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
    const g = blob(11, (d, out) => {
      const y = d.y < 0 ? d.y * 0.42 : d.y * 0.58;
      const t = (d.y + 1) / 2; // 0 bottom .. 1 top
      const w = 0.54 * (0.76 + 0.32 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.95)));
      out.set(d.x * w * 1.04, 0.2 + y, d.z * w * 0.9 + 0.03);
      out.z += 0.1 * bump(d, dir(0, -0.05, 1), 0.65);
    });
    fuzz(g);
    paintBody(g, hipsW);
    attach(belly, g, fur, "bellyBody");
    geoms.push(g);
  }
  const chest = new THREE.Group();
  chest.name = "chest";
  B.Spine2.add(chest);
  const spine2W = restWorld(B.Spine2);
  {
    // One smooth surface for chest + shoulder caps + neck ruff: a soft union of ellipsoids, ray-cast from the chest
    // centre along every icosphere direction. No creases where shoulders and neck meet the chest. The caps are
    // spheres around the arm joints, so the arms rotate inside them without exposing a seam.
    const sc0 = new THREE.Vector3(0, 0.1, -0.02);
    const parts: Array<{ c: THREE.Vector3; r: THREE.Vector3 }> = [
      { c: new THREE.Vector3(0, 0.06, -0.02), r: new THREE.Vector3(0.52, 0.46, 0.42) },
      { c: new THREE.Vector3(0.32, 0.19, -0.01), r: new THREE.Vector3(0.2, 0.2, 0.19) },
      { c: new THREE.Vector3(-0.32, 0.19, -0.01), r: new THREE.Vector3(0.2, 0.2, 0.19) },
      { c: new THREE.Vector3(0, 0.45, -0.05), r: new THREE.Vector3(0.27, 0.17, 0.21) },
    ];
    const q = new THREE.Vector3();
    const sdf = (p: THREE.Vector3): number => {
      let res = Infinity;
      for (const e of parts) {
        q.copy(p).sub(e.c);
        const k0 = Math.hypot(q.x / e.r.x, q.y / e.r.y, q.z / e.r.z);
        const k1 = Math.hypot(q.x / (e.r.x * e.r.x), q.y / (e.r.y * e.r.y), q.z / (e.r.z * e.r.z));
        const dd = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(e.r.x, e.r.y, e.r.z);
        // polynomial smooth min, k = 0.12 m
        const k = 0.12;
        const h = Math.max(k - Math.abs(res - dd), 0) / k;
        res = res === Infinity ? dd : Math.min(res, dd) - h * h * k * 0.25;
      }
      return res;
    };
    const pt = new THREE.Vector3();
    const g = blob(12, (d, out) => {
      let lo = 0;
      let hi = 1.2;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        if (sdf(pt.copy(d).multiplyScalar(mid).add(sc0)) < 0) lo = mid;
        else hi = mid;
      }
      out.copy(d).multiplyScalar((lo + hi) / 2).add(sc0);
      out.z += 0.03 * bump(d, dir(0, -0.3, 1), 0.6);
    });
    fuzz(g);
    paintBody(g, spine2W);
    attach(chest, g, fur, "chestBody");
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
      0.14 * (bump(d, dir(0.8, -0.32, 0.45), 0.36) + bump(d, dir(-0.8, -0.32, 0.45), 0.36)) +
      0.04 * (bump(d, dir(0.35, 0.3, 0.88), 0.25) + bump(d, dir(-0.35, 0.3, 0.88), 0.25)) -
      0.09 * bump(d, dir(0, 1, 0.1), 0.55));
  const cranium = blob(13, (d, out) => {
    out.copy(d).multiplyScalar(craniumR(d)).add(hc);
  });
  const snout = blob(8, (d, out) => {
    const fz = (d.z + 1) / 2;
    out.set(d.x * sr[0] * (1 - 0.18 * fz), d.y * sr[1] * (1 - 0.1 * fz), d.z * sr[2]).add(sc);
  });
  paintVertices(cranium, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    const yl = p.y - hc.y;
    const thr = 0.075 - 0.075 * Math.exp(-((p.x / 0.05) ** 2)); // brown widow's peak between the eyes
    const front = smoothstep(0.4, 0.68, d.z);
    const mask = front * smoothstep(thr + 0.02, thr - 0.02, yl);
    out.copy(cFur).lerp(cTan, mask);
  });
  fuzz(cranium, 0.6);
  paintVertices(snout, (_p, out) => out.copy(cMuzzle));
  const headGeom = mergeSame([cranium, snout]);
  // the head does not cast onto the chest (a hard dark "bib" under the chin read as stacked primitives)
  attach(B.Head, headGeom, fur, "head").castShadow = false;
  geoms.push(headGeom);

  const noseAt = new THREE.Vector3(0, sc.y + sr[1] * 0.55, sc.z + sr[2] * 0.86);
  const noseGeom = blob(5, (d, out) => {
    const top = d.y > 0 ? 1 : 0.85;
    out.set(d.x * 0.088, d.y * 0.058 * top, d.z * 0.064 - 0.012 * d.y * d.y).add(noseAt);
  });
  attach(B.Head, noseGeom, nose, "nose", false);
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
    const g = blob(4, (d, out) => {
      const rr = d.x * d.x + d.y * d.y;
      const cup = d.z > 0 ? 0.03 * (1 - rr) : 0;
      out.set(d.x * 0.112, d.y * 0.106, d.z * 0.05 - cup);
    });
    paintVertices(g, (p, out) => {
      const inner = smoothstep(0.08, 0.06, Math.hypot(p.x, p.y + 0.01)) * smoothstep(-0.02, 0.01, p.z);
      out.copy(cFurDark).lerp(cEarIn, inner);
    });
    attach(eg, g, fur, "ear", false);
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
      r: 0.03,
      scaleX: 0.92,
      scaleY: 1.12,
      scaleZ: 0.6,
      depth: 0.3,
      iris: 0.82,
      pupil: 0.55,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -0.25,
      lidColor: C.tan,
      lashColor: C.lash,
      lidOpen: -0.38,
      lidCap: 1.3,
      lashFlick: false,
    },
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
  B.Head.add(face.group);
  for (const m of face.group.children) m.castShadow = false;

  // ---- arms: long, thick; paws
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const ua = limb(new THREE.Vector3(-0.06 * s, 0, 0), new THREE.Vector3(0.42 * s, 0, 0), (t) => 0.19 - 0.055 * t + 0.015 * Math.sin(Math.PI * t), {
      detail: 5,
      sq: 0.95,
    });
    fuzz(ua);
    paintVertices(ua, (_p, out) => out.copy(cFur));
    attach(B[`${side}Arm`], ua, fur, `${side}UpperArm`);
    const fa = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.34 * s, 0, 0), (t) => 0.135 - 0.02 * t, { detail: 5, sq: 0.95 });
    fuzz(fa);
    paintVertices(fa, (_p, out) => out.copy(cFur));
    attach(B[`${side}ForeArm`], fa, fur, `${side}ForeArm`);
    const paw = blob(5, (d, out) => {
      out.set(0.09 * s + d.x * 0.13, d.y * 0.09, d.z * 0.115);
    });
    fuzz(paw, 0.5);
    paintVertices(paw, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.03, -0.07, p.y) * 0.5));
    attach(B[`${side}Hand`], paw, fur, `${side}Paw`);
    geoms.push(ua, fa, paw);
  }

  // ---- legs: short, thick; big feet
  for (const side of ["Left", "Right"] as const) {
    const th = limb(new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(0, -0.29, 0), (t) => 0.24 - 0.045 * t, { detail: 5 });
    fuzz(th);
    paintVertices(th, (_p, out) => out.copy(cFur));
    attach(B[`${side}UpLeg`], th, fur, `${side}Thigh`);
    const sh = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.24, 0), (t) => 0.185 - 0.025 * t, { detail: 5 });
    fuzz(sh);
    paintVertices(sh, (_p, out) => out.copy(cFur));
    attach(B[`${side}Leg`], sh, fur, `${side}Shin`);
    const ft = blob(4, (d, out) => {
      const fz = (d.z + 1) / 2;
      const yy = d.y < -0.35 ? -0.35 - (d.y + 0.35) * 0.2 : d.y;
      out.set(d.x * 0.16 * (0.9 + 0.2 * fz), -0.035 + yy * 0.075 * (1 - 0.25 * fz), 0.07 + d.z * 0.2);
    });
    fuzz(ft, 0.5);
    paintVertices(ft, (p, out) => out.copy(cFur).lerp(cFurDark, smoothstep(-0.07, -0.095, p.y)));
    attach(B[`${side}Foot`], ft, fur, `${side}Foot`);
    geoms.push(th, sh, ft);
  }

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

  // fur clumps: subtle value breakup in the vertex colours (darker in the noise valleys)
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.material !== fur) return;
    const c = m.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    const p = m.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!c) return;
    for (let i = 0; i < c.count; i++) {
      const k = 0.9 + 0.1 * noise3(p.getX(i) * 24, p.getY(i) * 24 + 1.7, p.getZ(i) * 24);
      c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
    }
  });

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
