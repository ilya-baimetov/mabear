// Procedural face rig (spec §7.3): eyes (sclera, big iris, pupil, two specular highlights), upper eyelids that
// blink, acting brows, a morphing mouth (visemes + emotion shapes), emotion presets for all 12 emotions,
// eye look-at toward a world point. Shared by Masha and Bear through FaceConfig. Lives under the Head bone.
import * as THREE from "three";
import type { FaceParams } from "../api";
import type { Emotion, Viseme } from "../../shared/schema";
import { blob, col, mergeSame, paintVertices, smoothstep, type MaterialSet } from "./rig";

/** A sphere (in head-bone local space) that facial features are projected onto. */
export interface FaceSurface {
  center: [number, number, number];
  radius: number;
  /** exact surface depth z(x, y) in head-local space (overrides the sphere when given) */
  zAt?: (x: number, y: number) => number;
}

export interface FaceConfig {
  eyes: {
    surface: FaceSurface;
    /** half distance between eye centres (x), eye centre height (y), both in head-local metres */
    x: number;
    y: number;
    /** sclera radius */
    r: number;
    /** non-uniform eye shape */
    scaleX: number;
    scaleY: number;
    /** eyeball flattening along its forward axis (1 = sphere; < 1 sits flatter in the face) */
    scaleZ: number;
    /** how deep the sclera centre sits below the surface, as a fraction of r (0 = centre on surface) */
    depth: number;
    /** iris radius / r, pupil radius / iris radius */
    iris: number;
    pupil: number;
    irisColor: string;
    irisRim: string;
    sclera: string;
    /** extra outward yaw of each eye (radians) */
    toeOut: number;
    /** lid colour, lash-line colour, lid open angle (radians, negative = more open) */
    lidColor: string;
    lashColor: string;
    lidOpen: number;
    /** lid cap half-angle (radians) */
    lidCap: number;
    /** draw a lash flick at the outer corner (Masha) */
    lashFlick: boolean;
  };
  brows: {
    color: string;
    /** offset above the eye centre, horizontal centre offset from eye x */
    y: number;
    dx: number;
    length: number;
    thickness: number;
    arch: number;
    /** metres of travel for a full raise */
    range: number;
    /** optional vertex-coloured material for the brows (e.g. Bear's fur); default: a plain matte material */
    material?: THREE.Material;
  };
  mouth: {
    surface: FaceSurface;
    y: number;
    /** half width at w = 1 */
    halfWidth: number;
    /** max opening height */
    height: number;
    /** closed-line thickness */
    line: number;
    /** corner lift amount for smile = 1 */
    curve: number;
    interior: string;
    lip: string;
    teeth: string;
    tongue: string;
    /** character signature: one-sided smile added to every emotion (Masha's knowing smirk); 0 = symmetric */
    smirk?: number;
  };
}

export interface FaceRig {
  group: THREE.Group;
  update(p: FaceParams, sleeping: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Emotion presets and visemes
// ---------------------------------------------------------------------------------------------

export interface MouthShape {
  w: number; // width factor
  smile: number; // -1..1 corner lift
  open: number; // 0..1
  round: number; // 0..1 (o-shape)
  teeth: number; // 0..1 upper teeth visible
  asym: number; // -1..1 one-sided smirk (positive = character's left corner up)
}

export interface EmotionPreset {
  /** brow raise for the character's left / right brow (-1..1) */
  browL: number;
  browR: number;
  /** brow tilt: + inner ends up (worried/sad), - inner ends down (angry) */
  tilt: number;
  /** lid: -0.3 = wide open, 0 = default, 1 = closed */
  lid: number;
  mouth: MouthShape;
}

const M = (w: number, smile: number, open: number, round = 0, teeth = 0, asym = 0): MouthShape => ({ w, smile, open, round, teeth, asym });

export const EMOTION_PRESETS: Record<Emotion, EmotionPreset> = {
  neutral: { browL: 0, browR: 0, tilt: 0, lid: 0, mouth: M(0.85, 0.35, 0) },
  happy: { browL: 0.25, browR: 0.25, tilt: 0.1, lid: 0.05, mouth: M(1.2, 0.9, 0.5, 0, 0.7) },
  excited: { browL: 0.55, browR: 0.55, tilt: 0.05, lid: -0.25, mouth: M(1.1, 0.8, 0.75, 0.15, 0.6) },
  mischievous: { browL: 0.35, browR: -0.2, tilt: -0.3, lid: 0.3, mouth: M(0.95, 0.65, 0.06, 0, 0, 0.6) },
  curious: { browL: 0.5, browR: 0.1, tilt: 0.15, lid: -0.15, mouth: M(0.6, 0.15, 0.2, 0.75) },
  surprised: { browL: 0.8, browR: 0.8, tilt: 0.15, lid: -0.3, mouth: M(0.55, 0, 0.65, 1) },
  sad: { browL: 0.1, browR: 0.1, tilt: 0.7, lid: 0.3, mouth: M(0.8, -0.7, 0.06) },
  angry: { browL: -0.45, browR: -0.45, tilt: -0.8, lid: 0.25, mouth: M(0.9, -0.5, 0.18, 0, 0.5) },
  scared: { browL: 0.65, browR: 0.65, tilt: 0.6, lid: -0.3, mouth: M(0.85, -0.35, 0.45, 0.4, 0.3) },
  sleepy: { browL: -0.15, browR: -0.15, tilt: 0.15, lid: 0.62, mouth: M(0.7, 0.1, 0.04) },
  proud: { browL: 0.3, browR: 0.3, tilt: -0.15, lid: 0.35, mouth: M(1.0, 0.75, 0) },
  annoyed: { browL: -0.25, browR: -0.05, tilt: -0.4, lid: 0.4, mouth: M(0.8, -0.3, 0, 0, 0, -0.4) },
};

/** Viseme targets; `smile: null` keeps the emotion's smile. */
export const VISEME_SHAPES: Record<Viseme, Partial<MouthShape> | null> = {
  rest: null,
  open_small: { w: 0.8, open: 0.38, round: 0.35, teeth: 0.3 },
  open_wide: { w: 0.95, open: 0.95, round: 0.4, teeth: 0.55 },
  o: { w: 0.55, open: 0.6, round: 1, teeth: 0 },
  e: { w: 1.12, open: 0.32, round: 0, teeth: 0.9, smile: 0.35 },
  frown: { w: 0.85, open: 0.1, round: 0, teeth: 0, smile: -0.85 },
  grin: { w: 1.15, open: 0.5, round: 0, teeth: 1, smile: 0.95 },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Mouth shape for an emotion + viseme at weight (pure; exported for tests and tools). */
export function mouthShapeFor(emotion: Emotion, viseme: Viseme, weight: number): MouthShape {
  const base = EMOTION_PRESETS[emotion].mouth;
  const v = VISEME_SHAPES[viseme];
  if (!v || weight <= 0) return { ...base };
  const w = Math.min(1, weight);
  return {
    w: lerp(base.w, v.w ?? base.w, w),
    smile: lerp(base.smile, v.smile ?? base.smile * 0.6, w),
    open: lerp(base.open, v.open ?? base.open, w),
    round: lerp(base.round, v.round ?? base.round, w),
    teeth: lerp(base.teeth, v.teeth ?? base.teeth, w),
    asym: lerp(base.asym, 0, w),
  };
}

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

function surfZ(s: FaceSurface, x: number, y: number): number {
  if (s.zAt) return s.zAt(x, y);
  const dx = x - s.center[0];
  const dy = y - s.center[1];
  const q = s.radius * s.radius - dx * dx - dy * dy;
  return s.center[2] + Math.sqrt(Math.max(q, 0));
}

function surfNormal(s: FaceSurface, x: number, y: number): THREE.Vector3 {
  const e = 0.002;
  const dzdx = (surfZ(s, x + e, y) - surfZ(s, x - e, y)) / (2 * e);
  const dzdy = (surfZ(s, x, y + e) - surfZ(s, x, y - e)) / (2 * e);
  return new THREE.Vector3(-dzdx, -dzdy, 1).normalize();
}

/** upper-lid shell radius / sclera radius (just above the highlights at 1.035; larger reads as bulging lids) */
const LID_R = 1.045;
const U_SEG = 28;
const V_SEG = 8;

export function buildFace(cfg: FaceConfig, mats: MaterialSet): FaceRig {
  const group = new THREE.Group();
  group.name = "face";
  const geoms: THREE.BufferGeometry[] = [];
  const E = cfg.eyes;

  // ---- materials
  const scleraMat = mats.add(
    new THREE.MeshStandardMaterial({ color: col(E.sclera), roughness: 0.4, metalness: 0, emissive: col(E.sclera), emissiveIntensity: 0.22 }),
  );
  const irisMat = mats.add(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  const hiMat = mats.add(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const lidMat = mats.add(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, sheen: 0.5, sheenColor: col(E.lidColor) }),
  );
  const browMat = cfg.brows.material ?? mats.add(new THREE.MeshStandardMaterial({ color: col(cfg.brows.color), roughness: 0.85 }));
  const browCol = col(cfg.brows.color);
  const mouthMat = mats.add(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55 }));

  // ---- eyes
  interface Eye {
    g: THREE.Group;
    rot: THREE.Object3D;
    lid: THREE.Object3D;
    side: 1 | -1;
  }
  const eyes: Eye[] = [];
  const scleraGeoms: THREE.BufferGeometry[] = [];
  const hiGeoms: THREE.BufferGeometry[] = [];
  const lidColor = col(E.lidColor);
  const lashColor = col(E.lashColor);
  const irisC = col(E.irisColor);
  const irisRim = col(E.irisRim);
  const black = new THREE.Color(0.006, 0.005, 0.005);

  for (const side of [1, -1] as const) {
    const x = side * E.x;
    const n = surfNormal(E.surface, x, E.y);
    const surf = new THREE.Vector3(x, E.y, surfZ(E.surface, x, E.y));
    const centre = surf.clone().addScaledVector(n, -E.depth * E.r * E.scaleZ);
    const g = new THREE.Group();
    g.name = side === 1 ? "eyeL" : "eyeR";
    g.position.copy(centre);
    const yaw = Math.atan2(n.x, n.z) + side * E.toeOut;
    const pitch = -Math.asin(Math.max(-1, Math.min(1, n.y)));
    g.rotation.set(pitch, yaw, 0, "YXZ");
    g.scale.set(E.scaleX, E.scaleY, E.scaleZ);
    group.add(g);
    g.updateMatrix();

    // sclera (baked into one merged mesh in face space)
    const sg = new THREE.SphereGeometry(E.r, 22, 14);
    sg.applyMatrix4(g.matrix);
    scleraGeoms.push(sg);

    // iris + pupil: domed disc with radial vertex colours, on a rotator for gaze
    const rot = new THREE.Object3D();
    rot.name = "gaze";
    g.add(rot);
    const ri = E.r * E.iris;
    const rp = ri * E.pupil;
    const ig = new THREE.RingGeometry(0, ri, 32, 9);
    const ipos = ig.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < ipos.count; i++) {
      const px = ipos.getX(i);
      const py = ipos.getY(i);
      const z = Math.sqrt(Math.max(E.r * E.r * 1.025 - px * px - py * py, 0)); // stands off the sclera (no z-fight)
      ipos.setZ(i, z);
    }
    ig.deleteAttribute("uv");
    // analytic sphere normals (the ring centre is degenerate for computeVertexNormals)
    const inrm = ig.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < ipos.count; i++) {
      const nv = new THREE.Vector3(ipos.getX(i), ipos.getY(i), ipos.getZ(i)).normalize();
      inrm.setXYZ(i, nv.x, nv.y, nv.z);
    }
    paintVertices(ig, (p, out) => {
      const rr = Math.hypot(p.x, p.y);
      const t = rr / ri;
      // inner iris lighter, darker rim; subtle top shadow (lid occlusion)
      const base = irisC.clone().lerp(irisRim, smoothstep(0.55, 1.0, t));
      base.lerp(new THREE.Color(1, 1, 1).lerp(irisC, 0.35), (1 - smoothstep(0.45, 0.75, t)) * 0.25 * (p.y < 0 ? 1 : 0.2));
      base.multiplyScalar(1 - 0.35 * smoothstep(0.2, 1, p.y / ri));
      const pupil = 1 - smoothstep(rp * 0.92, rp * 1.08, rr);
      out.copy(base.lerp(black, pupil));
    });
    const im = new THREE.Mesh(ig, irisMat);
    im.name = "iris";
    rot.add(im);
    geoms.push(ig);

    // highlights: fixed (reflections do not follow gaze), baked into one merged mesh
    const addHi = (dx: number, dy: number, rad: number) => {
      const d = new THREE.Vector3(dx, dy, 1).normalize();
      const hg = new THREE.CircleGeometry(rad, 16);
      hg.deleteAttribute("uv");
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      hg.applyQuaternion(q);
      hg.translate(d.x * E.r * 1.03, d.y * E.r * 1.03, d.z * E.r * 1.03);
      // wrap the disc onto the sphere (r 1.03: above the iris cap at 1.012, below the lid shell) so its rim
      // never pokes through a closing lid
      const hp = hg.getAttribute("position") as THREE.BufferAttribute;
      const tv = new THREE.Vector3();
      for (let i = 0; i < hp.count; i++) {
        tv.fromBufferAttribute(hp, i).setLength(E.r * 1.03);
        hp.setXYZ(i, tv.x, tv.y, tv.z);
      }
      hg.applyMatrix4(g.matrix);
      hiGeoms.push(hg);
    };
    addHi(-0.28, 0.32, E.r * 0.2);
    addHi(0.22, -0.22, E.r * 0.085);

    // upper lid: a spherical cap slightly larger than the sclera, rotating about x; lash line at its rim
    const lid = new THREE.Object3D();
    lid.name = "lid";
    g.add(lid);
    const lg = new THREE.SphereGeometry(E.r * LID_R, 30, 9, 0, Math.PI * 2, 0, E.lidCap);
    lg.deleteAttribute("uv");
    const capCos = Math.cos(E.lidCap);
    paintVertices(lg, (p, out) => {
      const c = p.y / (E.r * LID_R); // cos(polar)
      const lash = smoothstep(capCos + 0.22, capCos + 0.02, c);
      out.copy(lidColor).lerp(lashColor, lash);
    });
    let lidGeom: THREE.BufferGeometry = lg;
    if (E.lashFlick) {
      // small outer-corner lash flick (attached to the lid so it closes with it)
      const fl = blob(2, (d, out) => {
        out.set(d.x * E.r * 0.2, d.y * E.r * 0.05, d.z * E.r * 0.05);
      });
      fl.rotateZ(side === 1 ? 0.5 : -0.5);
      // positioned at the outer rim of the cap
      const ang = E.lidCap;
      fl.translate(side * E.r * LID_R * Math.sin(ang) * 0.95, E.r * LID_R * Math.cos(ang) + E.r * 0.06, E.r * 0.25);
      paintVertices(fl, (_p, out) => out.copy(lashColor));
      lidGeom = mergeSame([lg, fl]);
    }
    const lm = new THREE.Mesh(lidGeom, lidMat);
    lm.name = "lidMesh";
    lid.add(lm);
    geoms.push(lidGeom);
    eyes.push({ g, rot, lid, side });
  }
  const scleraGeom = mergeSame(scleraGeoms);
  const sclera = new THREE.Mesh(scleraGeom, scleraMat);
  sclera.name = "sclera";
  group.add(sclera);
  geoms.push(scleraGeom);
  const hiGeom = mergeSame(hiGeoms);
  const hi = new THREE.Mesh(hiGeom, hiMat);
  hi.name = "highlights";
  group.add(hi);
  geoms.push(hiGeom);

  // ---- brows: sculpted tapered arcs following the face surface
  const B = cfg.brows;
  interface Brow {
    g: THREE.Group;
    side: 1 | -1;
    x: number;
    y: number;
  }
  const brows: Brow[] = [];
  for (const side of [1, -1] as const) {
    const bx = side * (E.x + B.dx);
    const by = E.y + B.y;
    const g = new THREE.Group();
    g.name = side === 1 ? "browL" : "browR";
    g.position.set(bx, by, 0);
    const bg = blob(3, (d, out) => {
      const t = d.x; // -1..1 along the brow
      const taper = 1 - 0.55 * t * t;
      const lx = (t * B.length) / 2;
      const ly = B.arch * (1 - t * t) + d.y * B.thickness * taper;
      const z0 = surfZ(E.surface, bx + lx, by + ly);
      out.set(lx, ly, z0 + d.z * B.thickness * 0.55 * taper + B.thickness * 0.3);
    });
    if (cfg.brows.material) paintVertices(bg, (_p, out) => out.copy(browCol));
    const bm = new THREE.Mesh(bg, browMat);
    bm.name = "brow";
    g.add(bm);
    geoms.push(bg);
    group.add(g);
    brows.push({ g, side, x: bx, y: by });
  }

  // ---- mouth: one grid mesh (U × V) whose vertices are rebuilt from a MouthShape every update
  const Mo = cfg.mouth;
  const mouthGeom = new THREE.BufferGeometry();
  const nVert = (U_SEG + 1) * (V_SEG + 1);
  const mPos = new Float32Array(nVert * 3);
  const mCol = new Float32Array(nVert * 3);
  const idx: number[] = [];
  for (let j = 0; j < V_SEG; j++) {
    for (let i = 0; i < U_SEG; i++) {
      const a = j * (U_SEG + 1) + i;
      const b = a + 1;
      const c = a + (U_SEG + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  mouthGeom.setIndex(idx);
  mouthGeom.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
  mouthGeom.setAttribute("color", new THREE.BufferAttribute(mCol, 3));
  const mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.name = "mouth";
  mouth.frustumCulled = false;
  group.add(mouth);
  geoms.push(mouthGeom);
  const cInterior = col(Mo.interior);
  const cLip = col(Mo.lip);
  const cTeeth = col(Mo.teeth);
  const cTongue = col(Mo.tongue);
  const tmpC = new THREE.Color();

  function writeMouth(s: MouthShape): void {
    const halfW = Mo.halfWidth * s.w * (1 - 0.3 * s.round);
    const open = Math.max(0, s.open) * Mo.height;
    const topFrac = THREE.MathUtils.clamp(0.42 - 0.22 * s.smile, 0.15, 0.7);
    const openness = smoothstep(0.0, 0.25, s.open);
    for (let j = 0; j <= V_SEG; j++) {
      const v = j / V_SEG; // 0 = top lip edge, 1 = bottom lip edge
      for (let i = 0; i <= U_SEG; i++) {
        const u = (i / U_SEG) * 2 - 1;
        const uu = u * u;
        const env = lerp(Math.pow(Math.max(0, 1 - uu), 0.75), Math.sqrt(Math.max(0, 1 - uu)), s.round);
        const lineEnv = 0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - uu));
        const c = s.smile * Mo.curve * uu + s.asym * Mo.curve * 0.45 * (u + 1) * 0.5 * Math.max(0, u) * 2;
        const top = c + open * topFrac * env + (Mo.line / 2) * lineEnv;
        const bot = c - open * (1 - topFrac) * env - (Mo.line / 2) * lineEnv;
        const x = u * halfW;
        const y = Mo.y + lerp(top, bot, v);
        const z = surfZ(Mo.surface, x, y) + 0.0015;
        const k = (j * (U_SEG + 1) + i) * 3;
        mPos[k] = x;
        mPos[k + 1] = y;
        mPos[k + 2] = z;
        // colour bands: lip edge, teeth (top), interior, tongue (bottom)
        const edge = j === 0 || j === V_SEG ? 1 : 0;
        tmpC.copy(cInterior);
        if (v < 0.34 && s.teeth > 0) tmpC.lerp(cTeeth, Math.min(1, s.teeth * 1.2) * (1 - smoothstep(0.7, 1, Math.abs(u))));
        if (v > 0.68) tmpC.lerp(cTongue, 0.85 * (1 - Math.abs(u)));
        tmpC.lerp(cLip, Math.max(edge * 0.8, 1 - openness));
        mCol[k] = tmpC.r;
        mCol[k + 1] = tmpC.g;
        mCol[k + 2] = tmpC.b;
      }
    }
    (mouthGeom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (mouthGeom.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    mouthGeom.computeVertexNormals();
  }

  // ---- state (light smoothing between emotion changes so faces don't pop)
  const cur = { browL: 0, browR: 0, tilt: 0, lid: 0, mouth: { ...EMOTION_PRESETS.neutral.mouth } };
  let first = true;
  const v3 = new THREE.Vector3();
  const eyeMid = new THREE.Vector3();
  const gazeDir = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const LID_CLOSED = Math.PI / 2 + 0.12;

  writeMouth(cur.mouth);

  function update(p: FaceParams, sleeping: boolean): void {
    const pre = EMOTION_PRESETS[p.emotion] ?? EMOTION_PRESETS.neutral;
    const target = mouthShapeFor(p.emotion, p.viseme, p.visemeWeight);
    target.asym += (Mo.smirk ?? 0) * (1 - Math.min(1, Math.max(0, p.visemeWeight)));
    const k = first ? 1 : 0.35;
    first = false;
    cur.browL = lerp(cur.browL, pre.browL, k);
    cur.browR = lerp(cur.browR, pre.browR, k);
    cur.tilt = lerp(cur.tilt, pre.tilt, k);
    cur.lid = lerp(cur.lid, pre.lid, k);
    const km = p.visemeWeight > 0 ? 0.6 : k; // visemes are fast
    const m = cur.mouth;
    m.w = lerp(m.w, target.w, km);
    m.smile = lerp(m.smile, target.smile, km);
    m.open = lerp(m.open, target.open, km);
    m.round = lerp(m.round, target.round, km);
    m.teeth = lerp(m.teeth, target.teeth, km);
    m.asym = lerp(m.asym, target.asym, km);
    writeMouth(m);

    // lids: emotion openness then blink/sleep
    const lidBase = cur.lid < 0 ? lerp(E.lidOpen, E.lidOpen - 0.35, -cur.lid / 0.3) : lerp(E.lidOpen, LID_CLOSED, cur.lid * 0.85);
    const close = sleeping ? 1 : Math.min(1, Math.max(0, p.lidClose));
    const lidAngle = lerp(lidBase, LID_CLOSED, close);
    // parallel gaze: one world direction from between the eyes (per-eye targets made the eyes converge)
    eyes[0].g.getWorldPosition(eyeMid);
    eyes[1].g.getWorldPosition(v3);
    eyeMid.add(v3).multiplyScalar(0.5);
    if (p.lookAt) gazeDir.set(p.lookAt[0] - eyeMid.x, p.lookAt[1] - eyeMid.y, p.lookAt[2] - eyeMid.z);
    else gazeDir.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(tmpQ));
    if (gazeDir.lengthSq() < 1e-8) gazeDir.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(tmpQ));
    gazeDir.normalize();
    for (const e of eyes) {
      e.lid.rotation.set(lidAngle, 0, 0);
      // gaze
      v3.copy(gazeDir).applyQuaternion(e.g.getWorldQuaternion(tmpQ).invert());
      const yaw = Math.atan2(v3.x, Math.max(1e-4, v3.z)) + e.side * 0.02; // a hair of divergence reads relaxed
      const pitch = Math.atan2(v3.y, Math.hypot(v3.x, v3.z));
      e.rot.rotation.set(-THREE.MathUtils.clamp(pitch, -0.3, 0.3), THREE.MathUtils.clamp(yaw, -0.45, 0.45), 0, "YXZ");
    }

    // brows
    const raise = THREE.MathUtils.clamp(p.browRaise, -1, 1);
    for (const b of brows) {
      const r = (b.side === 1 ? cur.browL : cur.browR) + raise * 0.6;
      const y = b.y + r * B.range;
      b.g.position.set(b.x, y, 0);
      b.g.position.y = y;
      // keep the brow on the surface when it travels
      b.g.position.z = surfZ(E.surface, b.x, y) - surfZ(E.surface, b.x, b.y);
      b.g.rotation.set(0, 0, -b.side * cur.tilt * 0.5);
    }
  }

  return {
    group,
    update,
    dispose(): void {
      for (const g of geoms) g.dispose();
    },
  };
}
