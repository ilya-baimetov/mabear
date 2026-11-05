// Masha — procedural stand-in rig (spec §7.3). A respectful maquette: 1.0 m, head ≈ 40 % of height,
// magenta kerchief with an oval face opening + chin knot + two short tails, A-line sarafan over a pale
// lilac blouse, big green eyes, blond fringe, rosy cheeks. Colours sampled from references (docs/LIKENESS.md).
import * as THREE from "three";
import type { CharacterRig } from "../api";
import { buildFace, type FaceConfig } from "./face";
import {
  attach, blob, buildSkeleton, bump, col, dir, fabricMaterial, lathe, limb, makeRig, materialSet, mergeSame,
  paintVertices, skinMaterial, smoothstep, type SkeletonProportions,
} from "./rig";

/** All colours and proportions in one object (easy tuning; production swap = a glTF via the asset manifest). */
export const MASHA_LOOK = {
  height: 1.0,
  colors: {
    skin: "#F9CBA8",
    skinSheen: "#FFB59A",
    cheeks: "#F59A8C",
    kerchief: "#B8327A",
    kerchiefSheen: "#F07DB8",
    dress: "#B8327A",
    dressSheen: "#F07DB8",
    hemTrim: "#D9506A",
    sleeves: "#CFCDE8",
    sleevesSheen: "#FFFFFF",
    stockings: "#F2E2EA",
    shoes: "#7A2A5C",
    soles: "#D99A4A",
    hair: "#E2AE62",
    hairDark: "#B57A3A",
    iris: "#4E9A4A",
    irisRim: "#1F4A24",
    sclera: "#FFFFFF",
    brows: "#7A4A2A",
    lash: "#3A2018",
    mouthInterior: "#6A1E26",
    lip: "#B85A5A",
    teeth: "#FFF8F0",
    tongue: "#E57A7A",
  },
  skeleton: {
    hipsHeight: 0.36,
    spine: 0.05,
    spine1: 0.06,
    spine2: 0.06,
    neck: 0.07,
    head: 0.04,
    shoulder: [0.03, 0.04],
    clavicle: 0.06,
    upperArm: 0.11,
    foreArm: 0.1,
    upLeg: [0.062, -0.02],
    upperLeg: 0.15,
    lowerLeg: 0.14,
    toe: [0.035, 0.06],
  } satisfies SkeletonProportions,
  head: {
    /** skull sphere centre in Head-bone space and radius */
    center: [0, 0.158, 0.008] as [number, number, number],
    radius: 0.168,
    cheekBulge: 0.075,
    /** kerchief shell radius factor, opening (elevation top/bottom, azimuth half width; radians) */
    kerchief: 1.1,
    openTop: 0.8,
    openBottom: -1.02,
    openHalfAz: 1.0,
    /** how far the kerchief's cape falls below the skull centre at the back/sides (m) */
    capeDrop: 0.26,
  },
  eyes: { x: 0.053, y: 0.134, r: 0.045, iris: 0.63, pupil: 0.47 },
} as const;

type V3 = [number, number, number];

export function buildMasha(): CharacterRig {
  const L = MASHA_LOOK;
  const C = L.colors;
  const mats = materialSet();
  const geoms: THREE.BufferGeometry[] = [];
  const built = buildSkeleton(L.skeleton);
  const B = built.bones;
  const root = new THREE.Group();
  root.name = "masha";
  root.add(built.skeletonRoot);

  // ---- materials
  const skin = mats.add(skinMaterial(C.skin, C.skinSheen, true));
  const skinPlain = mats.add(skinMaterial(C.skin, C.skinSheen, false));
  const fabric = mats.add(fabricMaterial(C.dress, C.dressSheen, true));
  fabric.side = THREE.DoubleSide;
  const sleeve = mats.add(fabricMaterial(C.sleeves, C.sleevesSheen, false));
  const stocking = mats.add(fabricMaterial(C.stockings, "#FFFFFF", false));
  stocking.roughness = 0.75;
  const shoe = mats.add(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  );
  const hair = mats.add(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, sheen: 0.6, sheenColor: col("#FFE2A0") }),
  );

  // ---- head (sculpted sphere: chubby cheeks, small chin) + nose button, cheek blush in vertex colours
  const H = L.head;
  const hc = new THREE.Vector3(...H.center);
  const cheekL = dir(0.62, -0.4, 0.68);
  const cheekR = dir(-0.62, -0.4, 0.68);
  const chin = dir(0, -0.85, 0.5);
  const jaw = dir(0, -1, -0.1);
  const headR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      H.cheekBulge * (bump(d, cheekL, 0.34) + bump(d, cheekR, 0.34)) -
      0.035 * bump(d, chin, 0.28) -
      0.05 * bump(d, jaw, 0.6) +
      0.02 * bump(d, dir(0, 0.55, 0.85), 0.5));
  const headGeom = blob(14, (d, out) => {
    out.copy(d).multiplyScalar(headR(d)).add(hc);
  });
  const cSkin = col(C.skin);
  const cCheek = col(C.cheeks);
  paintVertices(headGeom, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    const blush = Math.max(bump(d, dir(0.55, -0.32, 0.77), 0.2), bump(d, dir(-0.55, -0.32, 0.77), 0.2));
    out.copy(cSkin).lerp(cCheek, smoothstep(0.04, 0.8, blush));
  });
  // nose: a small soft button
  const noseDir = dir(0, -0.24, 1);
  const noseAt = noseDir.clone().multiplyScalar(headR(noseDir) * 0.975).add(hc);
  const noseGeom = blob(3, (d, out) => {
    out.set(d.x * 0.0145, d.y * 0.0125, d.z * 0.0125).add(noseAt);
  });
  paintVertices(noseGeom, (_p, out) => out.copy(cSkin).lerp(cCheek, 0.05));
  const headMesh = attach(B.Head, mergeSame([headGeom, noseGeom]), skin, "head");
  geoms.push(headMesh.geometry);

  /** exact skin depth for features (fixed-point iteration over the sculpt function) */
  const skinZ = (x: number, y: number): number => {
    let z = hc.z + Math.sqrt(Math.max(H.radius ** 2 - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    const d = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      d.set(x - hc.x, y - hc.y, z - hc.z).normalize();
      const r = headR(d);
      z = hc.z + Math.sqrt(Math.max(r * r - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    }
    return z;
  };

  // ---- fringe: a thick swoosh of blond hair emerging from the forehead, scalloped strand tips
  {
    const cols = 44;
    const rows = 10;
    const az0 = -0.95;
    const az1 = 0.95;
    const top = H.openTop + 0.12;
    const pos: number[] = [];
    const colr: number[] = [];
    const idx: number[] = [];
    const cHair = col(C.hair);
    const cHairDark = col(C.hairDark);
    for (let i = 0; i <= cols; i++) {
      const ax = az0 + ((az1 - az0) * i) / cols;
      const a = Math.abs(ax) / az1;
      // 5 pointed locks sweeping slightly to the character's right
      let tip = 0;
      for (const c of [-0.6, -0.26, 0.08, 0.42, 0.72]) {
        const off = ax - c;
        const w = off < 0 ? 0.3 : 0.17; // asymmetric locks: swept toward the character's left
        tip = Math.max(tip, Math.pow(Math.max(0, 1 - Math.abs(off) / w), 1.25));
      }
      const edge = 0.52 + 0.22 * a * a - 0.17 * tip;
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const ay = edge + (top - edge) * v;
        const d = new THREE.Vector3(Math.cos(ay) * Math.sin(ax), Math.sin(ay), Math.cos(ay) * Math.cos(ax));
        const ridge = 0.006 * Math.cos(ax * 15) * Math.sqrt(v);
        const m = 0.996 + 0.062 * Math.sqrt(v) * (1 - 0.3 * a) + 0.012 * tip * Math.sqrt(v) + ridge;
        const p = d.clone().multiplyScalar(headR(d) * m).add(hc);
        pos.push(p.x, p.y, p.z);
        const c = cHair.clone().lerp(cHairDark, 0.4 * v + 0.35 * (1 - tip) * (1 - v) + 0.12 * (0.5 - 0.5 * Math.cos(ax * 15)));
        colr.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    hair.side = THREE.DoubleSide;
    attach(B.Head, g, hair, "fringe", false);
    geoms.push(g);
  }

  // ---- kerchief: shell with an oval face opening (pinched boundary), rolled rim, forward peak, drape to the
  //      shoulders, knot under the chin and two short tails. One mesh, one material.
  const cK = col(C.kerchief);
  {
    const Rk = H.radius * H.kerchief;
    const ay0 = (H.openTop + H.openBottom) / 2;
    const Bv = (H.openTop - H.openBottom) / 2;
    const A = H.openHalfAz;
    const shell = blob(16, (d, out) => {
      let ax = Math.atan2(d.x, d.z);
      let ay = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
      let k = Math.hypot(ax / A, (ay - ay0) / Bv);
      if (k < 1) {
        // squeeze the inside of the opening into a thin band just outside it (keeps vertex order: no folds)
        const kk = Math.max(k, 1e-3);
        const k2 = 1 + 0.015 * kk;
        ax = (ax / kk) * k2;
        ay = ay0 + ((ay - ay0) / kk) * k2;
        k = k2;
      }
      const dd = new THREE.Vector3(Math.cos(ay) * Math.sin(ax), Math.sin(ay), Math.cos(ay) * Math.cos(ax));
      // tuck the rim toward the skin, with a rolled lip just outside it
      const tuck = smoothstep(1.0, 1.16, k);
      const roll = Math.exp(-(((k - 1.09) / 0.1) ** 2));
      // inside the squeezed band the shell dives just under the skin, so the edge reads as fabric on the face
      const skinR = headR(dd) * (0.985 + 0.027 * smoothstep(1.0, 1.04, k));
      let r = skinR + (Rk - skinR) * tuck + 0.011 * roll;
      // soft puff on the crown and over the ears
      r += -0.012 * bump(dd, dir(0, 1, -0.1), 0.55) + 0.01 * (bump(dd, dir(1, -0.6, 0.0), 0.6) + bump(dd, dir(-1, -0.6, 0.0), 0.6));
      out.copy(dd).multiplyScalar(r).add(hc);
      // forward peak over the forehead
      const peak = Math.exp(-((ax / 0.4) ** 2)) * Math.exp(-(((ay - (H.openTop + 0.18)) / 0.22) ** 2));
      out.z += 0.022 * peak;
      out.y += 0.01 * peak;
      // drape: back and sides fall to the shoulders and flare (bell silhouette)
      // (the front under the chin keeps the head shape; sides and back become a cape over the shoulders)
      if (ay < -0.05) {
        const t = (-0.05 - ay) / (Math.PI / 2 - 0.05); // 0 at the cheek line .. 1 at the bottom
        const w = smoothstep(A * 0.85, A * 1.45, Math.abs(ax)) * smoothstep(0, 0.3, t);
        const bh = Rk * (1.0 + 0.3 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 8)));
        const bell = new THREE.Vector3(hc.x + Math.sin(ax) * bh * 1.04, hc.y - 0.01 - t * L.head.capeDrop, hc.z + Math.cos(ax) * bh * 0.9);
        out.lerp(bell, w);
      }
    });
    paintVertices(shell, (p, out) => {
      // gentle fold shading (darker in the drape) — fabric sheen does the rest
      const s = 1 - 0.12 * smoothstep(0.0, -0.12, p.y - hc.y + 0.05);
      out.copy(cK).multiplyScalar(s);
    });
    // knot under the chin + two short tails
    const knotAt = new THREE.Vector3(0, hc.y + Math.sin(H.openBottom) * H.radius * 1.02, hc.z + Math.cos(H.openBottom) * H.radius * 1.05);
    const knot = blob(4, (d, out) => {
      out.set(d.x * 0.03, d.y * 0.024, d.z * 0.022).add(knotAt);
    });
    const tails: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      const t = blob(4, (d, out) => {
        // teardrop: wide at the bottom, pinched at the knot
        const v = (d.y + 1) / 2; // 0 bottom .. 1 top
        const w = 0.022 * Math.sin(Math.PI * (0.15 + 0.85 * (1 - v))) * (0.5 + 0.5 * (1 - v)) + 0.004;
        out.set(d.x * w, (v - 1) * 0.075, d.z * 0.008 + 0.004 * Math.cos(d.x * 2));
      });
      t.rotateZ(s * 0.5);
      t.rotateX(-0.25);
      t.translate(knotAt.x + s * 0.008, knotAt.y - 0.006, knotAt.z + 0.008);
      tails.push(t);
    }
    for (const g of [knot, ...tails]) paintVertices(g, (_p, out) => out.copy(cK).multiplyScalar(0.97));
    const kGeom = mergeSame([shell, knot, ...tails]);
    attach(B.Head, kGeom, fabric, "kerchief");
    geoms.push(kGeom);
  }

  // ---- face rig
  const E = L.eyes;
  const faceCfg: FaceConfig = {
    eyes: {
      surface: { center: H.center as V3, radius: H.radius, zAt: skinZ },
      x: E.x,
      y: E.y,
      r: E.r,
      scaleX: 0.94,
      scaleY: 1.08,
      scaleZ: 0.55,
      depth: 0.32,
      iris: E.iris,
      pupil: E.pupil,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: -0.2,
      lidColor: C.skin,
      lashColor: C.lash,
      lidOpen: -0.8,
      lidCap: 1.25,
      lashFlick: true,
    },
    brows: { color: C.brows, y: 0.06, dx: 0.004, length: 0.042, thickness: 0.0034, arch: 0.0065, range: 0.011 },
    mouth: {
      surface: { center: H.center as V3, radius: H.radius, zAt: skinZ },
      y: H.center[1] - 0.09,
      halfWidth: 0.028,
      height: 0.042,
      line: 0.0036,
      curve: 0.008,
      interior: C.mouthInterior,
      lip: C.lip,
      teeth: C.teeth,
      tongue: C.tongue,
    },
  };
  const face = buildFace(faceCfg, mats);
  B.Head.add(face.group);
  for (const m of face.group.children) m.castShadow = false;

  // ---- sarafan: bodice (chest group on Spine1, scaled for breathing) + A-line skirt on Hips (sways)
  const cDress = col(C.dress);
  const cTrim = col(C.hemTrim);
  const chest = new THREE.Group();
  chest.name = "chest";
  B.Spine1.add(chest);
  {
    const g = lathe(
      [
        [0.0, -0.06],
        [0.085, -0.05],
        [0.094, 0.0],
        [0.1, 0.05],
        [0.098, 0.09],
        [0.082, 0.118],
        [0.05, 0.135],
        [0.0, 0.14],
      ],
      { sq: 0.82, segments: 24, samples: 16 },
    );
    paintVertices(g, (_p, out) => out.copy(cDress));
    attach(chest, g, fabric, "bodice");
    geoms.push(g);
  }
  const skirt = new THREE.Group();
  skirt.name = "skirt";
  skirt.position.set(0, 0.1, 0); // pivot at the waist
  B.Hips.add(skirt);
  {
    const g = lathe(
      [
        [0.17, -0.285],
        [0.19, -0.29],
        [0.2, -0.282],
        [0.19, -0.265],
        [0.158, -0.2],
        [0.125, -0.12],
        [0.103, -0.04],
        [0.094, 0.0],
        [0.075, 0.025],
        [0.0, 0.035],
      ],
      {
        sq: 0.86,
        segments: 36,
        samples: 22,
        ripple: (phi, y) => 1 + 0.04 * smoothstep(-0.06, -0.28, y) * Math.sin(phi * 9),
      },
    );
    paintVertices(g, (p, out) => {
      out.copy(cDress);
      const band = Math.exp(-(((p.y + 0.262) / 0.007) ** 2)) + 0.7 * Math.exp(-(((p.y + 0.243) / 0.004) ** 2));
      out.lerp(cTrim, Math.min(1, band));
    });
    attach(skirt, g, fabric, "skirt");
    geoms.push(g);
  }

  // ---- arms: puffed lilac sleeves, small hands
  const sleeveGeoms: Record<string, THREE.BufferGeometry> = {};
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const ua = limb(new THREE.Vector3(-0.01 * s, 0, 0), new THREE.Vector3(0.11 * s, 0, 0), (t) => 0.04 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 0.006 * t, {
      detail: 4,
    });
    attach(B[`${side}Arm`], ua, sleeve, `${side}Sleeve`);
    const fa = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.088 * s, 0, 0), (t) => 0.033 - 0.004 * t + 0.006 * smoothstep(0.75, 1, t), {
      detail: 4,
    });
    attach(B[`${side}ForeArm`], fa, sleeve, `${side}ForeSleeve`);
    sleeveGeoms[side] = ua;
    // hand: soft mitten + thumb (forward, +z)
    const palm = blob(3, (d, out) => {
      out.set(0.028 * s + d.x * 0.03, d.y * 0.02, d.z * 0.026);
    });
    const thumb = blob(2, (d, out) => {
      out.set(0.012 * s + d.x * 0.012, -0.002 + d.y * 0.01, 0.022 + d.z * 0.012);
    });
    const hg = mergeSame([palm, thumb]);
    attach(B[`${side}Hand`], hg, skinPlain, `${side}Hand`);
    geoms.push(ua, fa, hg);
  }

  // ---- legs: pale stockings, dark-pink shoes
  const cShoe = col(C.shoes);
  const cSole = col(C.soles);
  for (const side of ["Left", "Right"] as const) {
    const th = limb(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, -0.15, 0), (t) => 0.045 - 0.006 * t, { detail: 4 });
    attach(B[`${side}UpLeg`], th, stocking, `${side}Thigh`);
    const sh = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.13, 0), (t) => 0.039 - 0.007 * t, { detail: 4 });
    attach(B[`${side}Leg`], sh, stocking, `${side}Shin`);
    const sg = blob(4, (d, out) => {
      const fz = (d.z + 1) / 2; // 0 heel .. 1 toe
      const w = 0.036 * (0.85 + 0.3 * Math.sin(Math.PI * Math.min(1, fz * 1.1)));
      const yy = d.y < -0.3 ? -0.3 - (d.y + 0.3) * 0.25 : d.y; // flat-ish sole
      out.set(d.x * w, -0.022 + yy * 0.03 * (1 - 0.3 * fz), 0.024 + d.z * 0.064);
    });
    paintVertices(sg, (p, out) => out.copy(cShoe).lerp(cSole, smoothstep(-0.041, -0.046, p.y)));
    attach(B[`${side}Foot`], sg, shoe, `${side}Shoe`);
    geoms.push(th, sh, sg);
  }

  // ---- secondary motion: skirt follows the legs (no poke-through) and sways
  const down = new THREE.Vector3();
  const qL = new THREE.Quaternion();
  const secondary = {
    update(frame: import("../api").ActorFrame, phase: number): void {
      let fwd = 0;
      let side = 0;
      for (const n of ["LeftUpLeg", "RightUpLeg"] as const) {
        const q = frame.bones[n];
        if (!q) continue;
        qL.set(q[0], q[1], q[2], q[3]);
        down.set(0, -1, 0).applyQuaternion(qL);
        fwd = Math.max(fwd, down.z);
        side += down.x;
      }
      const sw = frame.secondary.sway;
      skirt.rotation.set(-0.55 * Math.max(0, fwd) - sw * 0.05 * Math.cos(phase * 0.7), 0, side * 0.25 + sw * 0.07 * Math.sin(phase));
      const flare = 1 + 0.25 * Math.max(0, fwd);
      skirt.scale.set(1, 1 / Math.sqrt(flare), flare);
    },
  };

  return makeRig({
    id: "masha",
    root,
    built,
    height: L.height,
    face,
    chest,
    materials: mats,
    geometries: geoms,
    secondary,
    socketOffset: new THREE.Vector3(-0.03, -0.005, 0.03),
  });
}
