// Masha — procedural stand-in rig (spec §7.3). A respectful maquette: 1.0 m, head ≈ 40 % of height,
// magenta kerchief with a small round face opening + chin knot + two short tails, A-line sarafan over a pink-lilac
// blouse, big green eyes, blond fringe tucked under the kerchief rim, rosy cheeks. Colours sampled from references
// (docs/LIKENESS.md). All parts are merged per material into skinned meshes; arms and legs are continuous and
// smooth-skinned across elbows and knees.
import * as THREE from "three";
import type { ActorFrame, CharacterRig } from "../api";
import { buildFace, type FaceConfig } from "./face";
import {
  blob, bump, buildSkeleton, col, dir, extraBone, eyeMaterial, fabricMaterial, lathe, limb, makeRig, materialSet,
  mergeSame, paintVertices, restWorld, skinBody, skinMaterial, smoothstep, welded, type SkeletonProportions,
  type SkinPart,
} from "./rig";

/** All colours and proportions in one object (easy tuning; production swap = a glTF via the asset manifest). */
export const MASHA_LOOK = {
  height: 1.0,
  colors: {
    skin: "#FFD2BA",
    skinSheen: "#FFB59A",
    cheeks: "#F59A8C",
    kerchief: "#AA2C77",
    kerchiefSheen: "#D685BB",
    dress: "#AA2C77",
    dressSheen: "#D685BB",
    hemTrim: "#E8643C",
    /** pink-lilac blouse sleeves (series renders; the printed stamp sample #A2A5B3 is a shadowed, desaturated read) */
    sleeves: "#DBA8D3",
    sleevesSheen: "#FFE6F6",
    stockings: "#F2E2EA",
    shoes: "#7A2A5C",
    soles: "#E3B04A",
    hair: "#E8CC94",
    hairDark: "#BA9863",
    iris: "#83B570",
    irisRim: "#3E6C42",
    sclera: "#FFF9EF",
    brows: "#A0683F",
    lash: "#3A2018",
    mouthInterior: "#6A1E26",
    lip: "#A04646",
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
    cheekBulge: 0.14,
    /** kerchief shell radius factor, face opening (elevation top/bottom, azimuth half width; radians): small, round */
    kerchief: 1.06,
    openTop: 0.6,
    openBottom: -1.0,
    openHalfAz: 0.9,
    /** how far the kerchief's cape falls below the skull centre at the back/sides (m) */
    capeDrop: 0.18,
    /** azimuth where the cape starts to drape (independent of the opening, so the shell never folds onto itself) */
    drapeAz: 1.08,
  },
  eyes: { x: 0.057, y: 0.141, r: 0.035, iris: 0.58, pupil: 0.43 },
} as const;

type V3 = [number, number, number];
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildMasha(): CharacterRig {
  const L = MASHA_LOOK;
  const C = L.colors;
  const mats = materialSet();
  const built = buildSkeleton(L.skeleton);
  const B = built.bones;
  const root = new THREE.Group();
  root.name = "masha";
  root.add(built.skeletonRoot);
  const chest = extraBone(B.Spine1, "chest");
  const skirt = extraBone(B.Hips, "skirt", 0, 0.1, 0); // pivot at the waist
  root.updateMatrixWorld(true);
  const parts: SkinPart[] = [];

  // ---- materials (one per look; everything vertex-coloured so parts merge)
  const skin = mats.add(skinMaterial(C.skin, C.skinSheen, true));
  skin.name = "skin";
  const fabric = mats.add(fabricMaterial(C.dress, C.dressSheen, true));
  fabric.name = "fabric";
  fabric.side = THREE.DoubleSide;
  const light = mats.add(fabricMaterial(C.sleeves, C.sleevesSheen, true));
  light.name = "blouse";
  light.roughness = 0.82;
  const shoe = mats.add(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  );
  shoe.name = "shoes";
  const hair = mats.add(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.65, specularIntensity: 0.4, sheen: 0.65, sheenColor: col("#FFE2A0"), sheenRoughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  hair.name = "hair";
  hair.onBeforeCompile = (shader) => {
    shader.vertexShader=shader.vertexShader
      .replace("#include <common>","#include <common>\nvarying vec3 vHairRest;")
      .replace("#include <begin_vertex>","#include <begin_vertex>\nvHairRest=position;");
    shader.fragmentShader=shader.fragmentShader
      .replace("#include <common>","#include <common>\nvarying vec3 vHairRest;")
      .replace("#include <color_fragment>",`#include <color_fragment>
        float strandPhase=vHairRest.x*2300.0+sin(vHairRest.y*38.0)*3.0;
        float strandFade=1.0-smoothstep(0.7,2.5,fwidth(strandPhase));
        diffuseColor.rgb*=1.0+0.09*sin(strandPhase)*strandFade;`);
  };
  hair.customProgramCacheKey=()=>"mabear-blonde-fibres-v1";
  const eyeMat = mats.add(eyeMaterial());
  eyeMat.name = "eyes";

  // ---- head (sculpted sphere: chubby cheeks, small chin) + nose button, cheek blush in vertex colours
  const H = L.head;
  const hc = new THREE.Vector3(...H.center);
  const cheekL = dir(0.64, -0.45, 0.64);
  const cheekR = dir(-0.64, -0.45, 0.64);
  const chin = dir(0, -0.85, 0.5);
  const jaw = dir(0, -1, -0.1);
  const headR = (d: THREE.Vector3): number =>
    H.radius *
    (1 +
      H.cheekBulge * (bump(d, cheekL, 0.34) + bump(d, cheekR, 0.34)) -
      0.035 * bump(d, chin, 0.28) -
      0.05 * bump(d, jaw, 0.6) +
      0.02 * bump(d, dir(0, 0.55, 0.85), 0.5) +
      0.04 * (bump(d, dir(0.35,-0.48,0.85),0.19) + bump(d,dir(-0.35,-0.48,0.85),0.19)) -
      0.025 * (bump(d,dir(0.35,-0.08,1),0.21)+bump(d,dir(-0.35,-0.08,1),0.21)));
  // Relief is measured in face x/y rather than radial space: this gives a small
  // button nose without stretching the whole central face into a long ridge.
  const noseRelief = (x: number,y: number): number => {
    const ny=y-(hc.y-0.041);
    return 0.013*Math.exp(-0.5*((x/0.013)**2+(ny/0.011)**2));
  };
  const headGeom = blob(15, (d, out) => {
    out.copy(d).multiplyScalar(headR(d)).add(hc);
    if(d.z>0.4) out.z+=noseRelief(out.x,out.y);
  });
  const cSkin = col(C.skin);
  const cCheek = col(C.cheeks);
  paintVertices(headGeom, (p, out) => {
    const d = p.clone().sub(hc).normalize();
    const blush = Math.max(bump(d, dir(0.58, -0.3, 0.76), 0.24), bump(d, dir(-0.58, -0.3, 0.76), 0.24));
    out.copy(cSkin).lerp(cCheek, smoothstep(0.04, 0.8, blush));
  });
  parts.push({ geom: headGeom, bone: B.Head, material: skin });

  /** exact skin depth for features (fixed-point iteration over the sculpt function) */
  const skinZ = (x: number, y: number): number => {
    let z = hc.z + Math.sqrt(Math.max(H.radius ** 2 - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    const d = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      d.set(x - hc.x, y - hc.y, z - hc.z).normalize();
      const r = headR(d);
      z = hc.z + Math.sqrt(Math.max(r * r - (x - hc.x) ** 2 - (y - hc.y) ** 2, 0));
    }
    return z + noseRelief(x,y);
  };

  // ---- face opening (ellipse in azimuth/elevation) and the fringe envelope it shares with the kerchief
  const ay0 = (H.openTop + H.openBottom) / 2;
  const Bv = (H.openTop - H.openBottom) / 2;
  const A = H.openHalfAz;
  const openK = (ax: number, ay: number) => Math.hypot(ax / A, (ay - ay0) / Bv);
  const FR = { az: 0.8, locks: [-0.5, -0.22, 0.06, 0.34, 0.6] };
  const lockTip = (ax: number): number => {
    let tip = 0;
    for (const c of FR.locks) {
      const off = ax - c;
      const w = off < 0 ? 0.26 : 0.15; // asymmetric locks: swept toward the character's left
      const u = Math.min(1, Math.abs(off) / w);
      tip = Math.max(tip, Math.pow(Math.cos((u * Math.PI) / 2), 1.6)); // rounded lock tips
    }
    return tip;
  };
  /** lower (tip) edge of the fringe and the elevation where it tucks under the kerchief rim (k = 1.12) */
  const fringeEdge = (ax: number) => {
    const a = Math.abs(ax) / FR.az;
    return 0.31 + 0.16 * a * a - 0.045 * lockTip(ax) + 0.004 * Math.sin(ax * 51) + 0.0015 * Math.sin(ax * 103);
  };
  const fringeTop = (ax: number) => {
    const q = 1.30 * 1.30 - (ax / A) ** 2;
    const top = q > 0 ? ay0 + Bv * Math.sqrt(q) : fringeEdge(ax);
    return Math.max(fringeEdge(ax) + 0.08, top);
  };
  /** fringe thickness above the skin (fraction of the head radius); 0 outside the fringe. `v` runs edge → top. */
  const fringeThick = (ax: number, ay: number): number => {
    if (Math.abs(ax) >= FR.az) return 0;
    const e = fringeEdge(ax);
    const t = fringeTop(ax);
    const vv = (ay - e) / (t - e);
    if (vv <= 0 || vv >= 1.4) return 0;
    const a = Math.abs(ax) / FR.az;
    const base = 0.058 * (1 - 0.3 * a) + 0.012 * lockTip(ax);
    const vc = Math.min(1, vv);
    return base * Math.sqrt(vc) * (1 - 0.65 * smoothstep(0.7, 1.0, vv)) * smoothstep(1.4, 1.0, vv) * smoothstep(FR.az, FR.az - 0.1, Math.abs(ax));
  };

  // ---- fringe: a thick swoosh of blond hair visible ONLY in the face opening; its root tucks under the rim
  {
    const cols = 88;
    const rows = 12;
    const pos: number[] = [];
    const colr: number[] = [];
    const idx: number[] = [];
    const cHair = col(C.hair);
    const cHairDark = col(C.hairDark);
    for (let i = 0; i <= cols; i++) {
      const ax = -FR.az + (2 * FR.az * i) / cols;
      const tip = lockTip(ax);
      const e = fringeEdge(ax);
      const t = fringeTop(ax);
      for (let j = 0; j <= rows; j++) {
        const vv = j / rows;
        const ay = e + (t - e) * vv;
        const d = new THREE.Vector3(Math.cos(ay) * Math.sin(ax), Math.sin(ay), Math.cos(ay) * Math.cos(ax));
        const ridge = (0.0012 * Math.cos(ax * 72 + vv * 1.8) + 0.00045 * Math.cos(ax * 119)) * Math.sqrt(vv) * (1 - vv);
        const m = 0.996 + fringeThick(ax, ay + 1e-4) + ridge;
        const p = d.clone().multiplyScalar(headR(d) * m).add(hc);
        const peak = Math.exp(-((ax / 0.4) ** 2)) * Math.exp(-(((ay - (H.openTop + 0.2)) / 0.22) ** 2));
        p.z += 0.023 * peak;
        p.y += 0.025 * peak;
        pos.push(p.x, p.y, p.z);
        const c = cHair.clone().lerp(cHairDark, 0.45 * vv + 0.35 * (1 - tip) * (1 - vv) + 0.07 * (0.5 - 0.5 * Math.cos(ax * 72 + vv * 1.8)));
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
    parts.push({ geom: g, bone: B.Head, material: hair, shadow: false });
  }

  // ---- kerchief: shell with a small round face opening (pinched boundary), rolled rim lying OVER the fringe,
  //      forward peak, drape to the shoulders, knot under the chin and two short tails. One material.
  const cK = col(C.kerchief);
  {
    const Rk = H.radius * H.kerchief;
    const shapeAt = (ax: number, ay: number, k: number, out: THREE.Vector3): void => {
      const dd = new THREE.Vector3(Math.cos(ay) * Math.sin(ax), Math.sin(ay), Math.cos(ay) * Math.cos(ax));
      // the rim dives just under the skin (edge reads as fabric lying on the face), rolled lip just outside it
      const tuck = smoothstep(1.0, 1.16, k);
      const roll = Math.exp(-(((k - 1.09) / 0.1) ** 2));
      const hr = headR(dd);
      const skinR = hr * (0.985 + 0.027 * smoothstep(1.0, 1.05, k));
      let r = skinR + (Rk - skinR) * tuck + 0.011 * roll;
      // over the fringe the rim rides on top of the hair (the fringe never pokes through)
      const ft = fringeThick(ax, ay);
      if (ft > 0) r = Math.max(r, hr * (1.0 + ft) + 0.0035 + 0.004 * roll);
      // flatter crown, soft fullness low over the ears; never closer than 2.5 % above the skull away from the rim
      r += -0.012 * bump(dd, dir(0, 1, -0.1), 0.55) - 0.012 * bump(dd, dir(0, 0.1, -1), 0.7) + 0.008 * (bump(dd, dir(1, -0.6, 0.0), 0.6) + bump(dd, dir(-1, -0.6, 0.0), 0.6));
      r = Math.max(r, hr * (0.985 + 0.04 * tuck));
      out.copy(dd).multiplyScalar(r).add(hc);
      // forward peak over the forehead
      const peak = Math.exp(-((ax / 0.4) ** 2)) * Math.exp(-(((ay - (H.openTop + 0.2)) / 0.22) ** 2));
      out.z += 0.028 * peak;
      out.y += 0.032 * peak;
      // drape: sides and back become a bell cape over the shoulders; the front under the chin keeps the head shape
      if (ay < -0.05) {
        const t = (-0.05 - ay) / (Math.PI / 2 - 0.05); // 0 at the cheek line .. 1 at the bottom
        const w = smoothstep(H.drapeAz * 0.85, H.drapeAz * 1.45, Math.abs(ax)) * smoothstep(0, 0.3, t);
        const bh = Rk * (1.0 + 0.18 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 8)));
        const backness = 0.5 - 0.5 * Math.cos(ax); // the cape comes to a soft point at the back
        const drop = t * L.head.capeDrop * (0.95 + 0.1 * backness);
        const bell = new THREE.Vector3(hc.x + Math.sin(ax) * bh * 1.04, hc.y - 0.01 - drop, hc.z + Math.cos(ax) * bh * 0.9);
        out.lerp(bell, w);
      }
    };
    // icosphere shell; triangles wholly inside the face opening are dropped, boundary vertices snap onto the oval
    const shell = welded(new THREE.IcosahedronGeometry(1, 15));
    {
      const pos = shell.getAttribute("position") as THREE.BufferAttribute;
      const inside: boolean[] = [];
      const d = new THREE.Vector3();
      const o = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        d.fromBufferAttribute(pos, i).normalize();
        let ax = Math.atan2(d.x, d.z);
        let ay = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
        let k = openK(ax, ay);
        inside.push(k < 1);
        if (k < 1) {
          const kk = Math.max(k, 1e-3);
          ax /= kk;
          ay = ay0 + (ay - ay0) / kk;
          k = 1;
        }
        shapeAt(ax, ay, k, o);
        pos.setXYZ(i, o.x, o.y, o.z);
      }
      const src = shell.index!.array;
      const keep: number[] = [];
      for (let t = 0; t < src.length; t += 3) {
        if (inside[src[t]] && inside[src[t + 1]] && inside[src[t + 2]]) continue;
        keep.push(src[t], src[t + 1], src[t + 2]);
      }
      shell.setIndex(keep);
      shell.computeVertexNormals();
    }
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
        const vv = (d.y + 1) / 2; // 0 bottom .. 1 top
        const w = 0.022 * Math.sin(Math.PI * (0.15 + 0.85 * (1 - vv))) * (0.5 + 0.5 * (1 - vv)) + 0.004;
        out.set(d.x * w, (vv - 1) * 0.075, d.z * 0.008 + 0.004 * Math.cos(d.x * 2));
      });
      t.rotateZ(s * 0.5);
      t.rotateX(-0.25);
      t.translate(knotAt.x + s * 0.008, knotAt.y - 0.006, knotAt.z + 0.008);
      tails.push(t);
    }
    for (const g of [knot, ...tails]) paintVertices(g, (_p, out) => out.copy(cK).multiplyScalar(0.97));
    parts.push({ geom: mergeSame([shell, knot, ...tails]), bone: B.Head, material: fabric });
  }

  // ---- face rig (lids and brows in the skin material, eyes in the shared eye material)
  const E = L.eyes;
  const faceCfg: FaceConfig = {
    eyes: {
      surface: { center: H.center as V3, radius: H.radius, zAt: skinZ },
      x: E.x,
      y: E.y,
      r: E.r,
      scaleX: 1.03,
      scaleY: 1.04,
      scaleZ: 0.28,
      depth: 0.12,
      surfaceAlignment: 0.2,
      iris: E.iris,
      pupil: E.pupil,
      irisColor: C.iris,
      irisRim: C.irisRim,
      sclera: C.sclera,
      toeOut: 0,
      lidColor: C.skin,
      lashColor: C.lash,
      lidOpen: -0.73,
      lidCap: 1.25,
      lashFlick: true,
      lidMaterial: skin,
    },
    eyeMaterial: eyeMat,
    brows: { color: C.brows, y: 0.058, dx: 0.003, length: 0.042, thickness: 0.003, arch: 0.006, range: 0.011, material: skin },
    mouth: {
      surface: { center: H.center as V3, radius: H.radius, zAt: skinZ },
      y: H.center[1] - 0.086,
      halfWidth: 0.034,
      height: 0.047,
      line: 0.0052,
      curve: 0.01,
      interior: C.mouthInterior,
      lip: C.lip,
      teeth: C.teeth,
      tongue: C.tongue,
      smirk: 0.1,
      frontTeeth: true,
    },
  };
  const face = buildFace(faceCfg, mats);
  B.Head.add(face.group);
  root.updateMatrixWorld(true);
  parts.push(...face.parts);

  // ---- sarafan: bodice (chest bone on Spine1, scaled for breathing) + A-line skirt on its bone (sways)
  const cDress = col(C.dress);
  const cTrim = col(C.hemTrim);
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
      { sq: 0.82, segments: 32, samples: 22 },
    );
    paintVertices(g, (_p, out) => out.copy(cDress));
    parts.push({ geom: g, bone: chest, material: fabric });
  }
  {
    const g = lathe(
      [
        [0.178, -0.315],
        [0.198, -0.32],
        [0.207, -0.312],
        [0.198, -0.293],
        [0.188, -0.272],
        [0.175, -0.235],
        [0.158, -0.2],
        [0.125, -0.12],
        [0.103, -0.04],
        [0.094, 0.0],
        [0.075, 0.025],
        [0.0, 0.035],
      ],
      {
        sq: 0.86,
        segments: 72,
        samples: 28,
        ripple: (phi, y) => 1 + 0.04 * smoothstep(-0.06, -0.28, y) * Math.sin(phi * 9),
      },
    );
    paintVertices(g, (p, out) => {
      // soft occlusion deep in the folds; orange-red hem stripes
      const phi = Math.atan2(p.x, p.z);
      out.copy(cDress).multiplyScalar(1 - 0.06 * smoothstep(-0.06, -0.28, p.y) * (0.5 - 0.5 * Math.sin(phi * 9)));
      const band = Math.exp(-(((p.y + 0.292) / 0.0035) ** 2)) + Math.exp(-(((p.y + 0.278) / 0.002) ** 2));
      out.lerp(cTrim, Math.min(1, band));
      // A woven herringbone border, following the real dress rather than plain stripes.
      const border = smoothstep(-0.30, -0.294, p.y) * smoothstep(-0.264,-0.273,p.y);
      const stitch = Math.pow(Math.max(0,Math.cos(phi * 36 + Math.abs(p.y + 0.284) * 850)),6);
      out.lerp(cTrim.clone().lerp(col("#F4CE76"),0.55), border * stitch * 0.85);
    });
    parts.push({ geom: g, bone: skirt, material: fabric });
  }

  // ---- arms: one puffed pink-lilac sleeve per arm (puff at the shoulder, cuff at the wrist), smooth-skinned
  //      across the elbow; small hands
  const cSleeve = col(C.sleeves);
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const up = L.skeleton.upperArm;
    const len = up + L.skeleton.foreArm - 0.012;
    const g = limb(v3(-0.012 * s, 0, 0), v3(len * s, 0, 0), (t) => {
      const x = t * (len + 0.012) - 0.012;
      const puff = 0.013 * Math.exp(-(((x - 0.045) / 0.045) ** 2));
      const cuff = 0.006 * smoothstep(len - 0.03, len - 0.008, x);
      return 0.036 + puff - 0.006 * smoothstep(0, len, x) + cuff;
    }, { detail: 7 });
    paintVertices(g, (p, out) => {
      // soft fold shading in the elbow crease
      const x = Math.abs(p.x);
      out.copy(cSleeve).multiplyScalar(1 - 0.08 * Math.exp(-(((x - up) / 0.02) ** 2)));
    });
    const upper = B[`${side}Arm`];
    const fore = B[`${side}ForeArm`];
    const ex = restWorld(fore).x;
    parts.push({
      geom: g, bone: upper, material: light,
      weights: (p) => [
        [upper, 1 - smoothstep(ex - 0.025 * s, ex + 0.025 * s, p.x)],
        [fore, smoothstep(ex - 0.025 * s, ex + 0.025 * s, p.x)],
      ],
    });
    // hand: soft mitten + thumb (forward, +z)
    const palm = blob(3, (d, out) => {
      out.set(0.028 * s + d.x * 0.03, d.y * 0.02, d.z * 0.026);
    });
    const thumb = blob(2, (d, out) => {
      out.set(0.012 * s + d.x * 0.012, -0.002 + d.y * 0.01, 0.022 + d.z * 0.012);
    });
    const hg = mergeSame([palm, thumb]);
    paintVertices(hg, (_p, out) => out.copy(cSkin));
    parts.push({ geom: hg, bone: B[`${side}Hand`], material: skin });
  }

  // ---- legs: pale stockings (one piece across the knee), dark-pink shoes
  const cStock = col(C.stockings);
  const cShoe = col(C.shoes);
  const cSole = col(C.soles);
  for (const side of ["Left", "Right"] as const) {
    const len = L.skeleton.upperLeg + L.skeleton.lowerLeg - 0.01;
    const g = limb(v3(0, 0.02, 0), v3(0, -len, 0), (t) => {
      const y = 0.02 - t * (len + 0.02);
      return 0.045 - 0.006 * smoothstep(0.02, -0.15, y) - 0.004 * smoothstep(-0.16, -len, y) + 0.002 * Math.exp(-(((y + 0.2) / 0.03) ** 2));
    }, { detail: 6 });
    paintVertices(g, (_p, out) => out.copy(cStock));
    const up = B[`${side}UpLeg`];
    const lo = B[`${side}Leg`];
    const ky = restWorld(lo).y;
    parts.push({
      geom: g, bone: up, material: light,
      weights: (p) => [
        [up, smoothstep(ky - 0.025, ky + 0.025, p.y)],
        [lo, smoothstep(ky + 0.025, ky - 0.025, p.y)],
      ],
    });
    const sg = blob(4, (d, out) => {
      const fz = (d.z + 1) / 2; // 0 heel .. 1 toe
      const w = 0.041 * (0.85 + 0.3 * Math.sin(Math.PI * Math.min(1, fz * 1.1)));
      const yy = d.y < -0.3 ? -0.3 - (d.y + 0.3) * 0.25 : d.y; // flat-ish sole
      out.set(d.x * w, -0.02 + yy * 0.032 * (1 - 0.3 * fz), 0.026 + d.z * 0.072);
    });
    paintVertices(sg, (p, out) => out.copy(cShoe).lerp(cSole, smoothstep(-0.041, -0.046, p.y)));
    parts.push({ geom: sg, bone: B[`${side}Foot`], material: shoe });
  }

  const body = skinBody(root, parts);

  // ---- secondary motion: skirt follows the legs (no poke-through) and sways
  const down = new THREE.Vector3();
  const qL = new THREE.Quaternion();
  const secondary = {
    update(frame: ActorFrame, phase: number): void {
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
      // sway is an oscillating driver in 0..1 (0.5 = rest) produced by evaluate(); the hem swings with it
      const sw = (frame.secondary.sway - 0.5) * 2;
      skirt.rotation.set(-0.55 * Math.max(0, fwd) - 0.035 * Math.abs(sw) + 0.01 * Math.sin(phase), 0, side * 0.25 + 0.08 * sw);
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
    geometries: [],
    secondary,
    socketOffset: new THREE.Vector3(-0.03, -0.005, 0.03),
    body,
  });
}
