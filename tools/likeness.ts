// Likeness bench (spec §7.3 step 4): renders ONE character with the series light rig for side-by-side review.
// Query params: char=masha|bear|wolf_a|wolf_b|wolves|lineup  angle=front|three|side|back|face  sil=1 (black silhouette)
//               emotion=<Emotion>  viseme=<Viseme>  vw=0..1  pose=a|t  look=cam|none  size=<px>  label=0
// Motion filmstrip (motion feel): motion=<fixture index> char=masha|bear t0=<s> dt=<s> n=<frames> cols=<n>
//   compiles the fixture episode with the real compiler, samples evaluate() and renders a grid of tiles with a
//   camera tracking the chosen character (both characters are in the scene).
// In-app render: stage=<fixture index> t=<s> [focus=masha|bear] renders the REAL engine stage (set, look, props, fx)
//   at time t of the compiled fixture; focus overrides the camera with a ¾ medium close-up on that character.
import * as THREE from "three";
import { buildMasha } from "../src/engine/characters/masha";
import { buildBear } from "../src/engine/characters/bear";
import { buildWolf } from "../src/engine/characters/wolf";
import { restFrame } from "../src/engine/characters/rig";
import type { CharacterRig, Quat } from "../src/engine/api";
import { DEFAULT_REMIX, type Emotion, type Viseme } from "../src/shared/schema";
import { FIXTURES } from "../src/director/fixtures";
import { compileEpisode } from "../src/compiler/episode";
import { evaluate } from "../src/engine/player/evaluate";
import { createStage } from "../src/engine/stage";

const q = new URLSearchParams(location.search);
const CHARS = ["masha", "bear", "wolf_a", "wolf_b", "wolves", "lineup"] as const;
type CharKey = (typeof CHARS)[number];
const char: CharKey = (CHARS as readonly string[]).includes(q.get("char") ?? "") ? (q.get("char") as CharKey) : "masha";
const BUILD: Record<string, () => CharacterRig> = {
  masha: buildMasha,
  bear: buildBear,
  wolf_a: () => buildWolf("a"),
  wolf_b: () => buildWolf("b"),
};
const angle = q.get("angle") ?? "front";
const sil = q.get("sil") === "1";
const emotion = (q.get("emotion") ?? "neutral") as Emotion;
const viseme = (q.get("viseme") ?? "rest") as Viseme;
const vw = Number(q.get("vw") ?? (viseme === "rest" ? 0 : 1));
const pose = q.get("pose") ?? "a";
const look = q.get("look") ?? "cam";
const size = Number(q.get("size") ?? 800);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(size, size);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !sil;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(sil ? "#ffffff" : "#a9cbe6");

const motionIdx = q.get("motion");
const stageIdx = q.get("stage");
if (stageIdx !== null) void runStage(Number(stageIdx));
else if (motionIdx !== null) runMotion(Number(motionIdx));
else runStills();

async function runStage(idx: number): Promise<void> {
  renderer.domElement.style.display = "none";
  const fx = FIXTURES[idx] ?? FIXTURES[0];
  const { timeline } = compileEpisode(
    fx.paragraphs.map((p, i) => ({ paragraphId: `p${i}`, version: 1, beatScript: p.beatScript, remix: { ...DEFAULT_REMIX } })),
    fx.lang,
  );
  const canvas = document.createElement("canvas");
  canvas.style.width = "1280px";
  canvas.style.height = "720px";
  document.body.appendChild(canvas);
  const stage = await createStage(canvas);
  stage.setAdaptive(false);
  stage.resize(1280, 720);
  await Promise.race([stage.assetsReady, new Promise((r) => setTimeout(r, 8000))]);
  const t = Math.min(timeline.duration - 1e-3, Number(q.get("t") ?? 1));
  let fr = evaluate(timeline, t);
  const focus = q.get("focus") as "masha" | "bear" | "wolf_a" | "wolf_b" | null;
  if (focus && fr.actors[focus]) {
    const a = fr.actors[focus];
    const hh = stage.rigs[focus]?.height ?? 1.0;
    const yaw = a.yaw + 0.45;
    const dist = hh * 1.7;
    const look: [number, number, number] = [a.pos[0], a.pos[1] + hh * 0.7, a.pos[2]];
    fr = { ...fr, camera: { pos: [look[0] + Math.sin(yaw) * dist, look[1] + hh * 0.1, look[2] + Math.cos(yaw) * dist], look, fov: 35 } };
  }
  let n = 0;
  const tick = (): void => {
    stage.render(fr);
    if (++n < 12) requestAnimationFrame(tick);
    else {
      // capture in the same task as the render (the stage's drawing buffer is not preserved)
      (window as unknown as { __png: string }).__png = canvas.toDataURL("image/png");
      const st = stage.stats();
      console.log(`stage ${fx.id} t=${t.toFixed(2)} calls=${st.drawCalls} tris=${st.triangles} :: ` +
        Object.entries(fr.actors).map(([id, a]) => `${id}:${a.verb}/${a.face.emotion}`).join(" "));
      (window as unknown as { __ready: boolean }).__ready = true;
    }
  };
  requestAnimationFrame(tick);
}

function runMotion(idx: number): void {
  const fx = FIXTURES[idx] ?? FIXTURES[0];
  const { timeline } = compileEpisode(
    fx.paragraphs.map((p, i) => ({ paragraphId: `p${i}`, version: 1, beatScript: p.beatScript, remix: { ...DEFAULT_REMIX } })),
    fx.lang,
  );
  const n = Number(q.get("n") ?? 12);
  const cols = Number(q.get("cols") ?? 4);
  const rows = Math.ceil(n / cols);
  const t0 = Number(q.get("t0") ?? 0);
  const dt = Number(q.get("dt") ?? (timeline.duration - t0) / n);
  const tw = 400;
  const th = 300;
  renderer.setSize(tw * cols, th * rows);
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  const hemi = new THREE.HemisphereLight("#cfe3ff", "#7a6a48", 1.15);
  const key = new THREE.DirectionalLight("#ffe4c4", 2.6);
  key.position.set(-6, 9, 8);
  const rim = new THREE.DirectionalLight("#fff0d8", 1.5);
  rim.position.set(5, 6, -8);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: "#6f9a45", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(hemi, key, rim, ground);
  const rigs: Record<string, CharacterRig> = { masha: buildMasha(), bear: buildBear(), wolf_a: buildWolf("a"), wolf_b: buildWolf("b") };
  for (const r of Object.values(rigs)) scene.add(r.root);
  const focusId = char in rigs ? char : "masha";
  const cam = new THREE.PerspectiveCamera(35, tw / th, 0.05, 200);
  const info: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(timeline.duration - 1e-3, t0 + i * dt);
    const fr = evaluate(timeline, t);
    for (const id of Object.keys(rigs)) {
      const a = fr.actors[id as keyof typeof fr.actors];
      if (a) for (let k = 0; k < 8; k++) rigs[id].apply(a); // let face easing settle per tile
      else rigs[id].root.visible = false;
    }
    const a = fr.actors[focusId as keyof typeof fr.actors] ?? fr.actors.masha;
    const tgt = new THREE.Vector3(a.pos[0], a.pos[1] + rigs[focusId].height * 0.55, a.pos[2]);
    const dist = rigs[focusId].height * (q.get("close") === "1" ? 2.0 : 2.6);
    const yaw = a.yaw + 0.5; // three-quarter view relative to the character's facing
    cam.position.set(tgt.x + Math.sin(yaw) * dist, tgt.y + dist * 0.12, tgt.z + Math.cos(yaw) * dist);
    cam.lookAt(tgt);
    const x = (i % cols) * tw;
    const y = (rows - 1 - Math.floor(i / cols)) * th;
    renderer.setViewport(x, y, tw, th);
    renderer.setScissor(x, y, tw, th);
    renderer.setClearColor("#a9cbe6");
    renderer.clear();
    renderer.render(scene, cam);
    info.push(`${t.toFixed(2)}s ${a.verb} ${a.face.emotion}`);
  }
  const label = document.getElementById("label");
  if (label && q.get("label") !== "0") label.textContent = info.join(" | ");
  console.log(`${fx.id} (${fx.lang}) duration ${timeline.duration.toFixed(1)}s :: ` + info.join(" | "));
  (window as unknown as { __ready: boolean }).__ready = true;
}

function runStills(): void {
  // one character, or a group (wolves: both Wolves side by side; lineup: the whole cast for scale)
  const ids = char === "wolves" ? ["wolf_a", "wolf_b"] : char === "lineup" ? ["wolf_a", "bear", "masha", "wolf_b"] : [char];
  const spacing: Record<string, number> = { masha: 0.75, bear: 1.45, wolf_a: 0.85, wolf_b: 0.85 };
  const rigs = ids.map((id) => BUILD[id]());
  const xs: number[] = [];
  {
    let x = 0;
    rigs.forEach((r, i) => {
      if (i > 0) x += spacing[ids[i - 1]] + spacing[ids[i]];
      xs.push(x);
    });
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    for (let i = 0; i < xs.length; i++) xs[i] -= mid;
  }
  for (const r of rigs) scene.add(r.root);
  const rig = rigs[0];
  const h = Math.max(...rigs.map((r) => r.height));
  const groupW = rigs.length > 1 ? xs[xs.length - 1] - xs[0] + 1.5 : 0;

  if (!sil) {
    const hemi = new THREE.HemisphereLight("#cfe3ff", "#7a6a48", 1.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight("#ffe4c4", 2.6);
    key.position.set(-2.2 * h, 3.2 * h, 3.0 * h);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -h; sc.right = h; sc.top = h * 1.3; sc.bottom = -h * 0.3; sc.near = 0.1; sc.far = 10 * h;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01 * h;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#fff0d8", 1.7);
    rim.position.set(1.6 * h, 2.0 * h, -3.0 * h);
    scene.add(rim);
    if (rigs.length > 1) {
      sc.left = -h - groupW / 2;
      sc.right = h + groupW / 2;
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6 * h + groupW, 64), new THREE.MeshStandardMaterial({ color: "#6f9a45", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  } else {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    for (const r of rigs)
      r.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = black;
      });
  }

  // camera framing
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const az = { front: 0, three: 0.62, side: Math.PI / 2, back: Math.PI, face: 0.35 }[angle] ?? 0;
  function placeCamera(target: THREE.Vector3, dist: number): void {
    camera.position.set(target.x + Math.sin(az) * dist, target.y + dist * 0.08, target.z + Math.cos(az) * dist);
    camera.lookAt(target);
  }

  function armsDown(id: string): Record<string, Quat> {
    if (pose === "t") return {};
    const ang = id === "bear" ? 1.05 : id.startsWith("wolf") ? 1.25 : 1.15;
    const l = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang);
    const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    const fl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.25);
    const fr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.25);
    return {
      LeftArm: [l.x, l.y, l.z, l.w],
      RightArm: [r.x, r.y, r.z, r.w],
      LeftForeArm: [fl.x, fl.y, fl.z, fl.w],
      RightForeArm: [fr.x, fr.y, fr.z, fr.w],
    };
  }

  const applyAll = (face?: import("../src/engine/api").FaceParams) =>
    rigs.forEach((r, i) => r.apply(restFrame({ pos: [xs[i], 0, 0], bones: armsDown(ids[i]), ...(face ? { face } : {}) })));
  applyAll();
  const headPos = new THREE.Vector3().setFromMatrixPosition(rig.bones.Head.matrixWorld);
  if (angle === "face") {
    const headSize = ids[0] === "bear" ? 0.74 : ids[0].startsWith("wolf") ? 0.5 : 0.4;
    const target = headPos.clone().add(new THREE.Vector3(0, ids[0] === "bear" ? 0.24 : ids[0].startsWith("wolf") ? 0.1 : 0.15, 0));
    if (rigs.length > 1) target.x = 0;
    placeCamera(target, headSize * 2.6 + groupW * 0.9);
  } else {
    placeCamera(new THREE.Vector3(0, h * 0.5, 0), h * 2.25 + groupW * 1.1);
  }

  let frames = 0;
  function frame(): void {
    applyAll({
      emotion,
      lidClose: 0,
      viseme,
      visemeWeight: vw,
      lookAt: look === "cam" ? [camera.position.x, camera.position.y, camera.position.z] : null,
      browRaise: 0,
    });
    renderer.render(scene, camera);
    frames++;
    if (frames === 12) {
      (window as unknown as { __ready: boolean }).__ready = true;
      const label = document.getElementById("label");
      if (label && q.get("label") !== "0") {
        label.textContent = `${char} · ${angle}${sil ? " · silhouette" : ""} · ${emotion} · calls ${renderer.info.render.calls} · tris ${renderer.info.render.triangles}`;
      }
    }
    if (frames < 12) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
