// Standalone stage dev page: renders the set + both characters with a static test FrameState.
// Params: ?tod=morning|day|sunset|night  ?to=<tod>&k=0..1 (blend)  ?cam=wide|house|yard|pond|east|garden|masha|bear|top
//         ?fx=hearts,sparkles…  ?k=0.4 (fx age)  ?robot=1 (show the glTF test character)  ?t=seconds  ?hold=1  ?anim=1
import { createStage } from "../src/engine/stage";
import type { ActorFrame, FrameState, PropFrame } from "../src/engine/api";
import { MARKS } from "../src/shared/bible/set";
import { PROPS } from "../src/shared/bible/props";
import { FX_IDS, PROP_IDS, TIMES_OF_DAY, type CamKey, type FxId, type MarkId, type PropId, type TimeOfDay, type Vec3 } from "../src/shared/schema";

const q = new URLSearchParams(location.search);
const tod = (TIMES_OF_DAY as readonly string[]).includes(q.get("tod") ?? "") ? (q.get("tod") as TimeOfDay) : "day";
const to = (TIMES_OF_DAY as readonly string[]).includes(q.get("to") ?? "") ? (q.get("to") as TimeOfDay) : tod;
const k = Number(q.get("k") ?? 0);

const CAMS: Record<string, CamKey> = {
  wide: { pos: [3, 3.2, 11], look: [-2, 1, -1], fov: 45 },
  yard: { pos: [6, 7.5, 21], look: [-1, 0.5, -2], fov: 50 },
  house: { pos: [-2.5, 2.2, 5.5], look: [-6, 2.2, -4], fov: 50 },
  pond: { pos: [0.5, 2.6, 15], look: [-7, 0.4, 9], fov: 48 },
  east: { pos: [3, 2.6, 6], look: [12, 1, 2], fov: 55 },
  garden: { pos: [3.5, 2.4, 1.5], look: [7, 0.4, -7], fov: 50 },
  masha: { pos: [0, 0.82, 1.4], look: [0, 0.72, 0], fov: 35 },
  bear: { pos: [-5.2, 2.3, 0.4], look: [-6, 1.8, -2.6], fov: 40 },
  top: { pos: [0, 45, 12], look: [0, 0, 0], fov: 55 },
  robot: { pos: [0.9, 1.3, 3.6], look: [0.6, 0.75, 0], fov: 40 },
};
const vec = (k: string): Vec3 | null => {
  const v = (q.get(k) ?? "").split(",").map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? (v as Vec3) : null;
};
const cam: CamKey = vec("campos") && vec("camlook") ? { pos: vec("campos")!, look: vec("camlook")!, fov: Number(q.get("fov") ?? 45) } : CAMS[q.get("cam") ?? "wide"] ?? CAMS.wide;

const face = { emotion: "happy" as const, lidClose: 0, viseme: "rest" as const, visemeWeight: 0, lookAt: null, browRaise: 0 };
function actor(x: number, z: number, yaw: number, holding: PropId | null = null): ActorFrame {
  return { pos: [x, 0, z], yaw, opacity: 1, bones: {}, hipsOffset: [0, 0, 0], face: { ...face }, holding, posture: "stand", verb: "idle", secondary: { sway: 0.5, jiggle: 0.5, breathe: 0.5 } };
}
// same resting rule as the player (golden-angle spread around the mark, per-mark rest height)
const REST_Y: Partial<Record<MarkId, number>> = { table: 0.78, bench: 0.47, porch: 0.32, pier: 0.28, hammock: 0.66, beehive: 0.62, woodpile: 0.55, swing: 0.47 };
function restPos(id: PropId, mark: MarkId): Vec3 {
  const i = PROP_IDS.indexOf(id);
  const ang = i * 2.399963;
  const r = mark === "table" ? 0.32 : 0.4;
  const p = MARKS[mark].pos;
  return [p[0] + Math.cos(ang) * r, REST_Y[mark] ?? 0.03, p[1] + Math.sin(ang) * r];
}
const hold = q.get("hold") === "1";
const props = {} as Record<PropId, PropFrame>;
for (const id of PROP_IDS) {
  const home = PROPS[id].home;
  if (home === "hidden" || home === "masha" || home === "bear") props[id] = { visible: false, pos: [0, -10, 0], attachedTo: null };
  else props[id] = { visible: true, pos: restPos(id, home), attachedTo: null };
}
if (hold) {
  props.jam_jar = { visible: true, pos: [0, 0, 0], attachedTo: "masha" };
  props.honey_pot = { visible: true, pos: [0, 0, 0], attachedTo: "bear" };
}
const fxIds = (q.get("fx") ?? "").split(",").filter((s): s is FxId => (FX_IDS as readonly string[]).includes(s));
const fxK = Number(q.get("fxk") ?? 0.4);

function frame(t: number): FrameState {
  return {
    t,
    segmentIndex: 0,
    localT: t,
    actors: { masha: actor(0, 0, 0.25, hold ? "jam_jar" : null), bear: actor(-6, -2.6, 0.35, hold ? "honey_pot" : null), wolf_a: actor(12.1,.3,-1.5), wolf_b: actor(12,-1.9,-1.5) },
    camera: cam,
    lighting: { from: tod, to, k },
    props,
    fx: fxIds.map((id, i) => ({ id, at: [-1.2 + i * 1.2, 0, 1.5] as Vec3, k: fxK })),
  };
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud")!;
const stage = await createStage(canvas, { loadTestRig: true } as Parameters<typeof createStage>[1]);
const fit = () => stage.resize(canvas.clientWidth, canvas.clientHeight);
fit();
addEventListener("resize", fit);
const t0 = Number(q.get("t") ?? 3);
await stage.assetsReady;
const robot = stage.testRig();
if (robot && q.get("robot") === "1") {
  robot.root.visible = true;
  robot.root.position.set(1.2, 0, -0.1);
  robot.root.rotation.y = -0.2;
}
let n = 0;
// ?anim=1 keeps rendering (live FPS); otherwise render a few frames and go idle (fast headless screenshots)
const anim = q.get("anim") === "1";
let renderMs = 0;
function loop() {
  const t = anim ? t0 + performance.now() / 1000 : t0;
  const a = performance.now();
  stage.render(frame(t));
  renderMs = performance.now() - a;
  n++;
  if (n % 15 === 0 || (!anim && n === 3)) {
    const s = stage.stats();
    hud.textContent = `tod ${tod}${to !== tod ? "→" + to + " " + k : ""} · ${s.fps.toFixed(0)} fps · ${s.drawCalls} draws · ${(s.triangles / 1000).toFixed(0)}k tris · ${renderMs.toFixed(0)} ms/frame`;
  }
  if (n === 3) (window as unknown as { __ready: boolean; __renderMs: number }).__ready = true;
  (window as unknown as { __renderMs: number }).__renderMs = renderMs;
  if (anim || n < 3) requestAnimationFrame(loop);
}
(window as unknown as { __stage: unknown }).__stage = stage;
// draw-call estimate per top-level group (+1 per visible drawable, +1 if it casts shadows)
(window as unknown as { __breakdown: () => Record<string, number> }).__breakdown = () => {
  const out: Record<string, number> = {};
  const groups = [...stage.scene.children.filter((o) => o !== stage.set.root), ...stage.set.root.children];
  for (const g of groups) {
    let n = 0;
    g.traverseVisible((o) => {
      const m = o as unknown as { isMesh?: boolean; isPoints?: boolean; castShadow: boolean };
      if (m.isMesh || m.isPoints) n += 1 + (m.castShadow && m.isMesh ? 1 : 0);
    });
    if (n) out[g.name || g.type] = n;
  }
  return out;
};
// triangles per top-level group (×2 when the object also renders into the shadow map)
(window as unknown as { __tris: () => Record<string, number> }).__tris = () => {
  const out: Record<string, number> = {};
  const groups = [...stage.scene.children.filter((o) => o !== stage.set.root), ...stage.set.root.children];
  for (const g of groups) {
    let n = 0;
    g.traverseVisible((o) => {
      const m = o as unknown as { isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } } }; count?: number; isInstancedMesh?: boolean; castShadow: boolean };
      if (!m.isMesh || !m.geometry) return;
      const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      n += t * (m.isInstancedMesh ? m.count ?? 1 : 1) * (m.castShadow ? 2 : 1);
    });
    if (n) out[g.name || g.type] = Math.round(n);
  }
  return out;
};
// ms/frame with gl.finish() (GPU-inclusive), n frames
(window as unknown as { __bench: (n: number) => number }).__bench = (count: number) => {
  const gl = stage.renderer.getContext();
  const f = frame(t0);
  stage.render(f);
  gl.finish();
  const a = performance.now();
  for (let i = 0; i < count; i++) stage.render(f);
  gl.finish();
  return (performance.now() - a) / count;
};
loop();
