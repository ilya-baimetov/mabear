// The Three.js stage (spec §7.1): renderer + series look + set + characters + props + fx.
// render(frame) is a pure application of a FrameState (no internal clock), so playback and scrubbing look identical.
import * as THREE from "three";
import { ACTOR_IDS, type ActorId } from "../shared/schema";
import type { CharacterRig, FrameState, StageHandle, StageStats } from "./api";
import { assetStatus, gltfSetElements, loadCharacter, loadPropOverrides, loadSetOverrides, TEST_GLTF_ID, type AssetStatus } from "./assets";
import { createFx, type FxHandle } from "./fx/fx";
import { applyLighting, createLook, followCamera, setShadowQuality, setupRenderer, type LookRig } from "./look";
import { createProps, type PropsHandle } from "./props/props";
import { buildBearsYard, walkHeightAt, type SetHandle } from "./set/bearsYard";

/** Extra handles for tools, tests and the behind-the-scenes overlay (additive to the frozen StageHandle). */
export interface StageHandleEx extends StageHandle {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  set: SetHandle;
  look: LookRig;
  props: PropsHandle;
  fx: FxHandle;
  rigs: Record<ActorId, CharacterRig>;
  /** glTF test character (hidden) once loaded — proves the manifest's glTF path */
  testRig: () => CharacterRig | null;
  assets: () => AssetStatus[];
  /** resolves when async glTF loads (test character, overrides) have settled */
  assetsReady: Promise<void>;
  /** createStage phase timings (ms) */
  timings: Record<string, number>;
  /** current adaptive resolution scale (0.5..1) */
  resolutionScale: () => number;
  /** disable/enable adaptive resolution (tools, screenshots) */
  setAdaptive: (on: boolean) => void;
}

/** Drawing-buffer cap: ~1280×720 pixels regardless of canvas size × devicePixelRatio. */
export const MAX_BUFFER_PIXELS = 1280 * 720;
const SCALE_MIN = 0.5;

const NO_FX: FrameState["fx"] = [];

export async function createStage(canvas: HTMLCanvasElement): Promise<StageHandleEx> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  setupRenderer(renderer);
  renderer.info.autoReset = false; // we reset per frame so shadow passes are counted in drawCalls

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 400);
  camera.position.set(3, 3.2, 11);
  camera.lookAt(-2, 1, -1);

  const timings: Record<string, number> = {};
  let tp = performance.now();
  const mark = (k: string) => {
    const n = performance.now();
    timings[k] = Math.round(n - tp);
    tp = n;
  };
  const look = createLook(scene, renderer);
  mark("look");
  const setTimings: Record<string, number> = {};
  const set = buildBearsYard(look.materials, { skip: gltfSetElements(), timings: setTimings });
  scene.add(set.root);
  mark("set");

  const [masha, bear] = await Promise.all([loadCharacter("masha"), loadCharacter("bear")]);
  mark("characters");
  const rigs = { masha, bear } as Record<ActorId, CharacterRig>;
  for (const id of ACTOR_IDS) scene.add(rigs[id].root);

  const props = createProps(look.materials);
  scene.add(props.root);
  const fx = createFx();
  scene.add(fx.root);
  mark("props_fx");

  let testRig: CharacterRig | null = null;
  const assetsReady = Promise.all([
    loadCharacter(TEST_GLTF_ID).then((r) => {
      testRig = r;
      r.root.position.set(16.5, 0, 4);
      r.root.rotation.y = -1.2;
      scene.add(r.root);
    }),
    loadSetOverrides(set.elements),
    loadPropOverrides(props.objects),
  ]).then(() => undefined);

  // ---- size / adaptive resolution / point-sprite scale ----
  const size = new THREE.Vector2();
  let pointScale = 600;
  let cssW = 1280, cssH = 720;
  let scale = 1; // adaptive resolution scale (SCALE_MIN..1)
  let adaptive = true;
  const updatePointScale = () => {
    renderer.getDrawingBufferSize(size);
    pointScale = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  const applyPixelRatio = () => {
    // cap the drawing buffer at ~1280×720 pixels, then apply the adaptive scale
    const cap = Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, cssW * cssH));
    const pr = Math.max(0.25, Math.min(dpr, cap) * scale);
    if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    setShadowQuality(look, scale < 1 ? 1024 : 2048);
    updatePointScale();
  };
  const resize = (w: number, h: number) => {
    cssW = Math.max(1, Math.floor(w));
    cssH = Math.max(1, Math.floor(h));
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    applyPixelRatio();
  };
  resize(canvas.clientWidth || canvas.width || 1280, canvas.clientHeight || canvas.height || 720);

  // ---- stats: rolling FPS over the last 60 rendered frames (ring buffer, no allocation) ----
  const RING = 60;
  const ring = new Float64Array(RING);
  let ringN = 0, ringI = 0;
  let lastNow = 0;
  let lastAdjust = 0;
  const last: StageStats = { fps: 0, drawCalls: 0, triangles: 0 };
  const adapt = (now: number, fps: number) => {
    if (!adaptive || ringN < 30 || now - lastAdjust < 1500) return;
    if (fps < 30 && scale > SCALE_MIN) {
      scale = Math.max(SCALE_MIN, scale * 0.75);
    } else if (fps > 55 && scale < 1) {
      scale = Math.min(1, scale * 1.2);
    } else return;
    lastAdjust = now;
    ringN = 0; // re-measure at the new resolution
    applyPixelRatio();
  };

  const sockets: Partial<Record<ActorId, THREE.Object3D>> = {};
  const yaws: Partial<Record<ActorId, number>> = {};

  const handle: StageHandleEx = {
    camera,
    scene,
    renderer,
    set,
    look,
    props,
    fx,
    rigs,
    testRig: () => testRig,
    timings,
    assets: assetStatus,
    assetsReady,
    resolutionScale: () => scale,
    setAdaptive(on: boolean) {
      adaptive = on;
      if (!on && scale !== 1) {
        scale = 1;
        applyPixelRatio();
      }
    },
    render(frame: FrameState) {
      // camera
      const c = frame.camera;
      camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
      if (Math.abs(camera.fov - c.fov) > 1e-3) {
        camera.fov = c.fov;
        camera.updateProjectionMatrix();
        updatePointScale();
      }
      camera.lookAt(c.look[0], c.look[1], c.look[2]);
      followCamera(look, camera);
      // light
      const lp = applyLighting(look, scene, renderer, frame.lighting);
      set.update(frame.t, lp.windowGlow, pointScale);
      // actors (stand on the porch / pier / bridges)
      let swing = 0;
      for (const id of ACTOR_IDS) {
        const a = frame.actors?.[id];
        const rig = rigs[id];
        if (!a || !rig) continue;
        rig.apply(a);
        const lift = walkHeightAt(a.pos[0], a.pos[2]);
        if (lift !== 0) rig.root.position.y += lift; // world matrices refresh in renderer.render / getWorldPosition
        sockets[id] = rig.handSocket;
        yaws[id] = a.yaw;
        if (a.verb === "swing") {
          // the seat follows the swinger's fore/aft displacement around the pivot (pivot at (8, 3.42, 2))
          const dz = a.pos[2] + a.hipsOffset[2] - 2;
          swing = Math.atan2(dz, 3.0);
        }
      }
      set.setSwing(swing);
      props.apply(frame.props, sockets, yaws);
      fx.apply(frame.fx ?? NO_FX, pointScale);
      renderer.info.reset();
      renderer.render(scene, camera);
      // stats: frame intervals between renders; gaps > 250 ms are pauses (scrub/idle), not slow frames
      const now = performance.now();
      const dt = now - lastNow;
      lastNow = now;
      if (dt > 0 && dt < 250) {
        ring[ringI] = dt;
        ringI = (ringI + 1) % RING;
        ringN = Math.min(RING, ringN + 1);
      }
      let sum = 0;
      for (let i = 0; i < ringN; i++) sum += ring[i];
      last.fps = ringN && sum > 0 ? (1000 * ringN) / sum : 0;
      last.drawCalls = renderer.info.render.calls;
      last.triangles = renderer.info.render.triangles;
      adapt(now, last.fps);
    },
    resize,
    stats: () => ({ fps: last.fps, drawCalls: last.drawCalls, triangles: last.triangles }),
    dispose() {
      for (const id of ACTOR_IDS) rigs[id]?.dispose();
      (testRig as CharacterRig | null)?.dispose();
      props.dispose();
      fx.dispose();
      set.dispose();
      look.dispose();
      renderer.dispose();
    },
  };
  // compile every material up front (avoids a long hitch on the first played frame)
  try {
    if (renderer.extensions.has("KHR_parallel_shader_compile")) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch {
    /* compile lazily on first render */
  }
  mark("compile");
  for (const [k, v] of Object.entries(setTimings)) if (v >= 20) timings[`set.${k}`] = v;
  return handle;
}
