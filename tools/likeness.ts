// Likeness bench (spec §7.3 step 4): renders ONE character with the series light rig for side-by-side review.
// Query params: char=masha|bear  angle=front|three|side|back|face  sil=1 (black silhouette on white)
//               emotion=<Emotion>  viseme=<Viseme>  vw=0..1  pose=a|t  look=cam|none  size=<px>  label=0
import * as THREE from "three";
import { buildMasha } from "../src/engine/characters/masha";
import { buildBear } from "../src/engine/characters/bear";
import { restFrame } from "../src/engine/characters/rig";
import type { Quat } from "../src/engine/api";
import type { Emotion, Viseme } from "../src/shared/schema";

const q = new URLSearchParams(location.search);
const char = q.get("char") === "bear" ? "bear" : "masha";
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(sil ? "#ffffff" : "#a9cbe6");

const rig = char === "bear" ? buildBear() : buildMasha();
scene.add(rig.root);
const h = rig.height;

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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6 * h, 64), new THREE.MeshStandardMaterial({ color: "#6f9a45", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
} else {
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  rig.root.traverse((o) => {
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

function armsDown(): Record<string, Quat> {
  if (pose === "t") return {};
  const ang = char === "bear" ? 1.05 : 1.15;
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

rig.apply(restFrame({ bones: armsDown() }));
const headPos = new THREE.Vector3().setFromMatrixPosition(rig.bones.Head.matrixWorld);
if (angle === "face") {
  const headSize = char === "bear" ? 0.62 : 0.4;
  const target = headPos.clone().add(new THREE.Vector3(0, char === "bear" ? 0.2 : 0.15, 0));
  placeCamera(target, headSize * 2.6);
} else {
  placeCamera(new THREE.Vector3(0, h * 0.5, 0), h * 2.25);
}

let frames = 0;
function frame(): void {
  rig.apply(
    restFrame({
      bones: armsDown(),
      face: {
        emotion,
        lidClose: 0,
        viseme,
        visemeWeight: vw,
        lookAt: look === "cam" ? [camera.position.x, camera.position.y, camera.position.z] : null,
        browRaise: 0,
      },
    }),
  );
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
