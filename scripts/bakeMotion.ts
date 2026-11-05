// Bakes open motion clips into compact keyframes for our skeleton convention (spec §7.4).
// Usage: npx tsx scripts/bakeMotion.ts [robot.glb] [xbot.glb]
//   defaults: public/assets/motion/RobotExpressive.glb, .cache/motion/Xbot.glb
//   (Xbot is a Mixamo-derived asset: download it from the URL in docs/ASSETS.md; it is not redistributed.)
// Output: src/engine/motion/clips.generated.ts
// Parses the GLB JSON + BIN chunks directly (no Three.js, no textures), samples every clip at FPS,
// and retargets each frame with src/engine/motion/retarget.ts.
import fs from "node:fs";
import path from "node:path";
import type { Quat } from "../src/engine/api";
import type { Vec3 } from "../src/shared/schema";
import { qmul, qnorm, qrot, qslerp } from "../src/engine/motion/blend";
import { BONE_MAPS, BONES, makeSetup, retargetFrame, type SourcePoseWorld } from "../src/engine/motion/retarget";

const FPS = 20;

interface GNode {
  name?: string;
  children?: number[];
  rotation?: Quat;
  translation?: Vec3;
  scale?: Vec3;
}
interface Gltf {
  nodes: GNode[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[];
}

function readGlb(file: string): { json: Gltf; bin: Buffer } {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  let off = 12;
  let json: Gltf | null = null;
  let bin: Buffer | null = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8")) as Gltf;
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`${file}: missing chunks`);
  return { json, bin };
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(g: Gltf, bin: Buffer, i: number): number[][] {
  const a = g.accessors[i];
  const bv = g.bufferViews[a.bufferView];
  const n = NCOMP[a.type];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out: number[][] = [];
  const size = a.componentType === 5126 ? 4 : a.componentType === 5123 || a.componentType === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? n * size;
  for (let k = 0; k < a.count; k++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) {
      const o = base + k * stride + c * size;
      let v: number;
      switch (a.componentType) {
        case 5126: v = bin.readFloatLE(o); break;
        case 5122: v = Math.max(bin.readInt16LE(o) / 32767, -1); break;
        case 5123: v = bin.readUInt16LE(o) / 65535; break;
        case 5120: v = Math.max(bin.readInt8(o) / 127, -1); break;
        case 5121: v = bin.readUInt8(o) / 255; break;
        default: throw new Error(`componentType ${a.componentType}`);
      }
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

interface Track { node: number; path: string; times: number[]; values: number[][]; interp: string }

function sampleTrack(tr: Track, t: number): number[] {
  const { times, values } = tr;
  const cubic = tr.interp === "CUBICSPLINE";
  const val = (k: number) => (cubic ? values[k * 3 + 1] : values[k]);
  if (t <= times[0]) return val(0);
  const last = times.length - 1;
  if (t >= times[last]) return val(last);
  let k = 0;
  while (k < last && times[k + 1] < t) k++;
  const u = (t - times[k]) / (times[k + 1] - times[k] || 1);
  if (tr.interp === "STEP") return val(k);
  const a = val(k);
  const b = val(k + 1);
  if (tr.path === "rotation") return qslerp(a as Quat, b as Quat, u);
  return a.map((x, i) => x + (b[i] - x) * u);
}

function worldPose(g: Gltf, local: { r: Quat; t: Vec3; s: number }[]): SourcePoseWorld {
  const parent: number[] = new Array(g.nodes.length).fill(-1);
  g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const wr: Quat[] = [];
  const wp: Vec3[] = [];
  const ws: number[] = [];
  const visit = (i: number) => {
    if (wr[i]) return;
    const p = parent[i];
    if (p >= 0) visit(p);
    const L = local[i];
    if (p < 0) {
      wr[i] = L.r; wp[i] = L.t; ws[i] = L.s;
    } else {
      wr[i] = qnorm(qmul(wr[p], L.r));
      const v = qrot(wr[p], [L.t[0] * ws[p], L.t[1] * ws[p], L.t[2] * ws[p]]);
      wp[i] = [wp[p][0] + v[0], wp[p][1] + v[1], wp[p][2] + v[2]];
      ws[i] = ws[p] * L.s;
    }
  };
  g.nodes.forEach((_, i) => visit(i));
  const rot: Record<string, Quat> = {};
  const pos: Record<string, Vec3> = {};
  g.nodes.forEach((n, i) => {
    if (n.name) { rot[n.name] = wr[i]; pos[n.name] = wp[i]; }
  });
  return { rot, pos };
}

function restLocals(g: Gltf) {
  return g.nodes.map((n) => ({
    r: (n.rotation ?? [0, 0, 0, 1]) as Quat,
    t: (n.translation ?? [0, 0, 0]) as Vec3,
    s: n.scale ? n.scale[0] : 1,
  }));
}

interface BakeSpec { src: string; as: string; loop: boolean; source: "robot" | "xbot"; detrend: boolean }

const ROBOT_CLIPS: BakeSpec[] = [
  { src: "Idle", as: "robot_idle", loop: true, source: "robot", detrend: true },
  { src: "Dance", as: "robot_dance", loop: true, source: "robot", detrend: true },
  { src: "Wave", as: "robot_wave", loop: false, source: "robot", detrend: true },
  { src: "Yes", as: "robot_yes", loop: false, source: "robot", detrend: true },
  { src: "No", as: "robot_no", loop: false, source: "robot", detrend: true },
  { src: "ThumbsUp", as: "robot_thumbsup", loop: false, source: "robot", detrend: true },
];
const XBOT_CLIPS: BakeSpec[] = [
  { src: "idle", as: "xbot_idle", loop: true, source: "xbot", detrend: true },
  { src: "walk", as: "xbot_walk", loop: true, source: "xbot", detrend: true },
  { src: "run", as: "xbot_run", loop: true, source: "xbot", detrend: true },
  { src: "agree", as: "xbot_agree", loop: false, source: "xbot", detrend: true },
  { src: "headShake", as: "xbot_headshake", loop: false, source: "xbot", detrend: true },
  { src: "sad_pose", as: "xbot_sad", loop: false, source: "xbot", detrend: false },
  { src: "sneak_pose", as: "xbot_sneak", loop: false, source: "xbot", detrend: false },
];

const r4 = (x: number) => {
  const v = Math.round(x * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
};

function bakeFile(file: string, specs: BakeSpec[], mapName: string) {
  const { json: g, bin } = readGlb(file);
  const rest = restLocals(g);
  const setup = makeSetup(BONE_MAPS[mapName], worldPose(g, rest));
  const nodeIndex = new Map<number, number>();
  g.nodes.forEach((_, i) => nodeIndex.set(i, i));
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const anim = g.animations.find((a) => a.name === spec.src);
    if (!anim) { console.warn(`missing clip ${spec.src} in ${file}`); continue; }
    const tracks: Track[] = anim.channels.map((ch) => {
      const s = anim.samplers[ch.sampler];
      return { node: ch.target.node, path: ch.target.path, times: readAccessor(g, bin, s.input).map((r) => r[0]), values: readAccessor(g, bin, s.output), interp: s.interpolation ?? "LINEAR" };
    });
    const t0 = Math.min(...tracks.map((tr) => tr.times[0]));
    const t1 = Math.max(...tracks.map((tr) => tr.times[tr.times.length - 1]));
    const dur = Math.max(t1 - t0, 1 / FPS);
    const frames = Math.max(2, Math.round(dur * FPS) + 1);
    const bones: Record<string, number[]> = Object.fromEntries(BONES.map((b) => [b, [] as number[]]));
    const hips: Vec3[] = [];
    for (let f = 0; f < frames; f++) {
      const t = t0 + (dur * f) / (frames - 1);
      const local = rest.map((l) => ({ ...l }));
      for (const tr of tracks) {
        const v = sampleTrack(tr, t);
        const L = local[tr.node];
        if (tr.path === "rotation") L.r = qnorm(v as Quat);
        else if (tr.path === "translation") L.t = v as Vec3;
        else if (tr.path === "scale") L.s = v[0];
      }
      const res = retargetFrame(setup, worldPose(g, local));
      for (const b of BONES) bones[b].push(...res.bones[b]);
      hips.push(res.hips);
    }
    // remove horizontal drift (root motion comes from the compiled path, not the clip)
    if (spec.detrend) {
      const n = hips.length;
      for (const axis of [0, 2]) {
        const a = hips[0][axis];
        const b = hips[n - 1][axis];
        for (let f = 0; f < n; f++) hips[f][axis] -= a + ((b - a) * f) / (n - 1);
      }
    }
    // keep sign continuity per bone (avoid q / -q flips between frames), round, drop constant bones
    const packed: Record<string, number[]> = {};
    for (const b of BONES) {
      const arr = bones[b];
      for (let f = 1; f < frames; f++) {
        const o = f * 4;
        const dot = arr[o] * arr[o - 4] + arr[o + 1] * arr[o - 3] + arr[o + 2] * arr[o - 2] + arr[o + 3] * arr[o - 1];
        if (dot < 0) for (let c = 0; c < 4; c++) arr[o + c] = -arr[o + c];
      }
      const rounded = arr.map(r4);
      let constant = true;
      for (let f = 1; f < frames && constant; f++) {
        for (let c = 0; c < 4; c++) if (Math.abs(rounded[f * 4 + c] - rounded[c]) > 2e-3) { constant = false; break; }
      }
      const isIdentity = constant && Math.abs(rounded[3]) > 0.99995;
      if (isIdentity) continue;
      packed[b] = constant ? rounded.slice(0, 4) : rounded;
    }
    out[spec.as] = { source: spec.source, src: spec.src, fps: (frames - 1) / dur, frames, dur: r4(dur), loop: spec.loop, bones: packed, hips: hips.flat().map(r4) };
    console.log(`${spec.as}: ${frames} frames, ${dur.toFixed(2)} s, ${Object.keys(packed).length} bones`);
  }
  return out;
}

const robotFile = process.argv[2] ?? "public/assets/motion/RobotExpressive.glb";
const xbotFile = process.argv[3] ?? ".cache/motion/Xbot.glb";
const clips: Record<string, unknown> = {};
Object.assign(clips, bakeFile(robotFile, ROBOT_CLIPS, "robot"));
if (fs.existsSync(xbotFile)) Object.assign(clips, bakeFile(xbotFile, XBOT_CLIPS, "mixamo"));
else console.warn(`skipping Xbot clips: ${xbotFile} not found`);

const header = `// GENERATED by scripts/bakeMotion.ts — do not edit by hand.
// Open motion clips retargeted to our skeleton (Mixamo names, identity-rest T-pose, faces +z).
// Sources and licenses: docs/ASSETS.md ("Motion clips"). Quaternions [x,y,z,w] flattened per frame;
// hips = Hips offset per frame [x,y,z] normalized by the source hip height (× target hip height = metres).
export interface BakedClip {
  source: "robot" | "xbot";
  src: string;
  fps: number;
  frames: number;
  dur: number;
  loop: boolean;
  /** bone → flat quats (4 per frame), or a single quat when constant; bones absent = identity */
  bones: Record<string, number[]>;
  hips: number[];
}
`;
const body = `export const CLIPS: Record<string, BakedClip> = ${JSON.stringify(clips)};\n`;
const outFile = path.join("src/engine/motion/clips.generated.ts");
fs.writeFileSync(outFile, header + body);
console.log(`wrote ${outFile} (${((header.length + body.length) / 1024).toFixed(0)} KB)`);
