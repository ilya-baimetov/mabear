// The Three.js stage (spec §7.1): renderer + series look + set + characters + props + fx.
// render(frame) is a pure application of a FrameState (no internal clock), so playback and scrubbing look identical.
import * as THREE from "three";
import { ACTOR_IDS, type ActorId } from "../shared/schema";
import type { CharacterRig, FrameState, StageHandle, StageStats } from "./api";
import { assetStatus, gltfSetElements, loadCharacter, loadPropOverrides, loadSetOverrides, TEST_GLTF_ID, type AssetStatus } from "./assets";
import { createFx, type FxHandle } from "./fx/fx";
import { applyLighting, createLook, followCamera, setupRenderer, type LookRig } from "./look";
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
}

export async function createStage(canvas: HTMLCanvasElement): Promise<StageHandleEx> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  setupRenderer(renderer);
  renderer.info.autoReset = false; // we reset per frame so shadow passes are counted in drawCalls

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 400);
  camera.position.set(3, 3.2, 11);
  camera.lookAt(-2, 1, -1);

  const look = createLook(scene, renderer);
  const set = buildBearsYard(look.materials, { skip: gltfSetElements() });
  scene.add(set.root);

  const [masha, bear] = await Promise.all([loadCharacter("masha"), loadCharacter("bear")]);
  const rigs = { masha, bear } as Record<ActorId, CharacterRig>;
  for (const id of ACTOR_IDS) scene.add(rigs[id].root);

  const props = createProps(look.materials);
  scene.add(props.root);
  const fx = createFx();
  scene.add(fx.root);

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

  // ---- size / point-sprite scale ----
  const size = new THREE.Vector2();
  let pointScale = 600;
  const updatePointScale = () => {
    renderer.getDrawingBufferSize(size);
    pointScale = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  const resize = (w: number, h: number) => {
    const W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    updatePointScale();
  };
  resize(canvas.clientWidth || canvas.width || 1280, canvas.clientHeight || canvas.height || 720);

  // ---- stats: rolling FPS over the last ~60 rendered frames ----
  const times: number[] = [];
  let last: StageStats = { fps: 0, drawCalls: 0, triangles: 0 };

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
    assets: assetStatus,
    assetsReady,
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
        rig.root.position.y += walkHeightAt(a.pos[0], a.pos[2]);
        rig.root.updateMatrixWorld(true);
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
      fx.apply(frame.fx ?? [], pointScale);
      renderer.info.reset();
      renderer.render(scene, camera);
      // stats
      const now = performance.now();
      times.push(now);
      while (times.length > 61) times.shift();
      const span = times.length > 1 ? (times[times.length - 1] - times[0]) / 1000 : 0;
      last = {
        fps: span > 0 ? (times.length - 1) / span : 0,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    resize,
    stats: () => last,
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
  return handle;
}
