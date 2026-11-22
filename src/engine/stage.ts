// The Three.js stage (spec §7.1): renderer + series look + set + characters + props + fx.
// render(frame) is a pure application of a FrameState (no internal clock), so playback and scrubbing look identical.
import * as THREE from "three";
import { sceneLocationAt } from "../shared/bible/set";
import { ACTOR_IDS, PROP_IDS, type ActorId } from "../shared/schema";
import type { CharacterRig, FrameState, StageHandle, StageStats } from "./api";
import { assetStatus, disposeGenerated, gltfSetElements, loadCharacter, loadPropOverrides, loadSetOverrides, TEST_GLTF_ID, type AssetStatus } from "./assets";
import { createAtmosphere } from "./fx/atmosphere";
import { createFx, type FxHandle } from "./fx/fx";
import { applyLighting, applyLookTextures, createLook, focusKeyShadow, followCamera, loadHdri, setShadowQuality, setupRenderer, updateEnvironment, updateSkyTime, type LookRig } from "./look";
import { adaptStep, createPost, DEFAULT_GRADE, defaultPostQuality, isSoftwareRenderer, parsePostQuality, type PostPipeline, type PostQuality } from "./post/post";

/** `?post=` flag, or null when absent. */
function parsePostQualityFlag(search: string): PostQuality | null {
  const v = new URLSearchParams(search).get("post");
  return v === null || v === "" ? null : parsePostQuality(search);
}

/** Unmasked GL renderer string when available (e.g. "ANGLE (Google, Vulkan … SwiftShader …)"). */
function rendererName(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch {
    return "";
  }
}
import { createProps, type PropsHandle } from "./props/props";
import { buildBearsYard, walkHeightAt, type SetHandle } from "./set/bearsYard";
import { clearForeground } from './cameraClearance';
import { applySceneLightIntensities } from './sceneLighting';
import {applyHugContacts} from './characters/hugContacts';
import {applyCarryContacts} from './characters/carryContacts';
import {applyObjectContacts} from './characters/objectContacts';
import { loadGeneratedYard } from './set/generatedYard';
import { assetUrl, loadEnvTextures } from "./set/textures";

/** CC0 HDRI used for image-based lighting (docs/ASSETS.md). */
export const HDRI_URL = "assets/hdri/meadow_2_1k.hdr";

export interface StageOptions {
  /** post-processing tier 0..3 (off | low | medium | high). Default: `?post=` URL flag, else 3 (high). */
  post?: PostQuality;
}

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
  /** disable/enable adaptive resolution + post degradation (tools, screenshots); off restores full quality */
  setAdaptive: (on: boolean) => void;
  /** current post-processing tier (0 off, 1 grade+SMAA, 2 +bloom, 3 +AO) */
  postQuality: () => PostQuality;
  /** force a post-processing tier (0..3, capped at what the device supports) */
  setPostQuality: (q: PostQuality) => void;
}

/** Drawing-buffer cap: ~1280×720 pixels regardless of canvas size × devicePixelRatio. */
export const MAX_BUFFER_PIXELS = 1920 * 1080;
const SCALE_MIN = 0.5;

const NO_FX: FrameState["fx"] = [];
const INDOOR_BACKGROUND = new THREE.Color(0x453c30);

const ACTOR_SHADOW_RADIUS: Record<ActorId, number> = {
  bear: 0.72,
  rival_bear: 0.78,
  lady_bear: 0.68,
  wolf_a: 0.44,
  wolf_b: 0.42,
  masha: 0.30,
  rosie: 0.36,
  hare: 0.28,
  squirrel: 0.24,
};

function createContactShadows() {
  let texture: THREE.CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0.0, "rgba(255,255,255,0.68)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.34)");
      grad.addColorStop(0.8, "rgba(255,255,255,0.08)");
      grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  }
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const alphas = new Float32Array(ACTOR_IDS.length);
  const alphaAttr = new THREE.InstancedBufferAttribute(alphas, 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aShadowAlpha", alphaAttr);

  const material = new THREE.MeshBasicMaterial({
    color: 0x161c15,
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    if (shader.vertexShader.includes("#include <common>") && shader.vertexShader.includes("#include <begin_vertex>")) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aShadowAlpha;\nvarying float vShadowAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShadowAlpha = aShadowAlpha;");
    }
    if (shader.fragmentShader.includes("#include <common>") && shader.fragmentShader.includes("#include <map_fragment>")) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vShadowAlpha;")
        .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= vShadowAlpha;");
    }
  };
  material.customProgramCacheKey = () => "stage:contact-shadows-v1";

  const mesh = new THREE.InstancedMesh(geometry, material, ACTOR_IDS.length);
  mesh.name = "stage:contact-shadows";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  mesh.visible = false;

  const dummy = new THREE.Object3D();
  return {
    mesh,
    update(rigs: Record<ActorId, CharacterRig>, frame: FrameState, location: string, stars: number, lifts: Partial<Record<ActorId, number>>) {
      if (!texture) {
        mesh.visible = false;
        return;
      }
      material.color.setHex(location === "house" ? 0x241a12 : 0x161e14);
      const baseStrength = location === "house" ? 0.36 : Math.max(0.20, 0.44 - 0.18 * stars);
      let count = 0;
      for (const id of ACTOR_IDS) {
        const a = frame.actors?.[id];
        const rig = rigs[id];
        if (!a || !rig || !rig.root.visible || a.posture === "offstage") continue;
        const supportY = a.pos[1] + (lifts[id] ?? 0);
        const extraAir = Math.max(0, rig.root.position.y - supportY) + (a.verb === "jump" ? Math.max(0, a.hipsOffset[1]) : 0);
        const heightFade = Math.max(0, 1 - extraAir / 0.75);
        const alpha = baseStrength * THREE.MathUtils.clamp(a.opacity, 0, 1) * heightFade;
        if (alpha <= 0.01) continue;
        const r = ACTOR_SHADOW_RADIUS[id] * (a.posture === "sit" || a.posture === "sleep" ? 1.15 : 1.0) * (1 - 0.25 * Math.min(1, extraAir));
        dummy.position.set(rig.root.position.x, supportY + 0.005, rig.root.position.z);
        dummy.rotation.set(0, a.yaw, 0);
        dummy.scale.set(r * 2.1, 1, r * 1.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(count, dummy.matrix);
        alphas[count] = alpha;
        count++;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        alphaAttr.needsUpdate = true;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}

export async function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): Promise<StageHandleEx> {
  const postFlag: PostQuality | null = opts.post ?? parsePostQualityFlag(typeof location !== "undefined" ? location.search : "");
  // with post-processing on, SMAA anti-aliases the composited image; native MSAA is only used by the plain path
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: postFlag === 0, powerPreference: "high-performance", preserveDrawingBuffer: false });
  // no explicit flag: full effects on a GPU, the light tier on a software renderer (AO/bloom there stall the GPU queue)
  const glName = rendererName(renderer);
  const postWanted: PostQuality = postFlag ?? defaultPostQuality(glName);
  // software WebGL (no GPU): start at the lowest resolution step too — its GPU queue can't keep up otherwise
  const software = isSoftwareRenderer(glName);
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
  let post: PostPipeline | null = null;
  try {
    post = createPost(renderer, scene, camera, postWanted);
  } catch {
    post = null; // plain renderer path (pre-A5 look), never a black screen
  }
  const postMax: PostQuality = post ? post.quality : 0;
  mark("look");
  const setTimings: Record<string, number> = {};
  const set = buildBearsYard(look.materials, { skip: gltfSetElements(), timings: setTimings });
  scene.add(set.root);
  mark("set");

  const loadedRigs = await Promise.all(ACTOR_IDS.map((id) => loadCharacter(id)));
  mark("characters");
  const rigs = Object.fromEntries(ACTOR_IDS.map((id, i) => [id, loadedRigs[i]])) as Record<ActorId, CharacterRig>;
  for (const id of ACTOR_IDS) scene.add(rigs[id].root);

  const props = createProps(look.materials);
  scene.add(props.root);
  const fx = createFx();
  scene.add(fx.root);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.root);
  const contactShadows = createContactShadows();
  scene.add(contactShadows.mesh);
  mark("props_fx");

  let testRig: CharacterRig | null = null;
  let disposed = false;
  let readyAt = Infinity;
  const assetsReady = Promise.all([
    set.assetsReady,
    loadCharacter(TEST_GLTF_ID).then((r) => {
      if (disposed) {
        r.dispose();
        return;
      }
      testRig = r;
      r.root.position.set(16.5, 0, 4);
      r.root.rotation.y = -1.2;
      scene.add(r.root);
    }),
    loadSetOverrides(set.elements,undefined,()=>disposed),
    loadGeneratedYard(set.elements,()=>disposed).catch(error=>console.warn('Garden assets could not load',error)),
    loadPropOverrides(props.objects,undefined,()=>disposed),
    // A5 environment: CC0 HDRI + PBR textures swap in asynchronously; failures keep the procedural look
    loadHdri(look, assetUrl(HDRI_URL), () => disposed),
    loadEnvTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy())).then(({ textures }) => {
      if (disposed) {
        for (const t of Object.values(textures)) (t as THREE.Texture | null | undefined)?.dispose?.();
        return;
      }
      applyLookTextures(look.materials, textures);
      set.applyTextures(textures);
    }),
  ]).then(() => { readyAt = performance.now(); });

  // ---- size / adaptive resolution / point-sprite scale ----
  const size = new THREE.Vector2();
  let pointScale = 600;
  let cssW = 1280, cssH = 720;
  let scale = software ? SCALE_MIN : 1; // adaptive resolution scale (SCALE_MIN..1)
  let adaptive = !software; // software WebGL: frame timing measures the CPU queue, not the GPU — keep the low preset fixed
  const updatePointScale = () => {
    renderer.getDrawingBufferSize(size);
    pointScale = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  const applyPixelRatio = () => {
    // cap the drawing buffer at ~1920×1080 pixels, then apply the adaptive scale
    const cap = Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, cssW * cssH));
    const pr = Math.max(0.25, Math.min(dpr, cap) * scale);
    if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    setShadowQuality(look, scale < 1 ? 2048 : 4096);
    updatePointScale();
    post?.setSize(size.x, size.y);
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
  let postCeiling: PostQuality = postMax;
  const adapt = (now: number, fps: number) => {
    if (!adaptive || now - readyAt < 5000 || ringN < 30 || now - lastAdjust < 1500) return;
    // slow: drop AO, then bloom, then resolution; fast: resolution back up (dropped post tiers stay dropped)
    const next = adaptStep({ quality: post ? post.quality : 0, ceiling: postCeiling, scale }, fps, SCALE_MIN);
    if (!next) return;
    lastAdjust = now;
    ringN = 0; // re-measure at the new settings
    postCeiling = next.ceiling;
    if (post && next.quality !== post.quality) post.setQuality(next.quality);
    if (next.scale !== scale) {
      scale = next.scale;
      applyPixelRatio();
    }
  };

  const sockets: Partial<Record<ActorId, THREE.Object3D>> = {};
  const yaws: Partial<Record<ActorId, number>> = {};
  const lifts: Partial<Record<ActorId, number>> = {};

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
      if (!on) {
        postCeiling = postMax;
        post?.setQuality(postMax);
      }
      if (!on && scale !== 1) {
        scale = 1;
        applyPixelRatio();
      }
    },
    postQuality: () => (post ? post.quality : 0),
    setPostQuality(q: PostQuality) {
      if (!post) return;
      const nq = Math.max(0, Math.min(postMax, q)) as PostQuality;
      postCeiling = nq;
      post.setQuality(nq);
    },
    render(frame: FrameState) {
      // camera
      const location=frame.camera.location??sceneLocationAt(frame.camera.look[0],frame.camera.look[2]);
      const localActors=Object.fromEntries(Object.entries(frame.actors).filter(([id,a])=>(!frame.cast||frame.cast.includes(id as ActorId))&&sceneLocationAt(a.pos[0],a.pos[2])===location)) as FrameState['actors'];
      const c = clearForeground(frame.camera,localActors);
      camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
      if (Math.abs(camera.fov - c.fov) > 1e-3) {
        camera.fov = c.fov;
        camera.updateProjectionMatrix();
        updatePointScale();
      }
      camera.lookAt(c.look[0], c.look[1], c.look[2]);
      set.updateView(c.look[0],c.look[2],location,camera.position);
      followCamera(look, camera);
      // light
      const lp = applyLighting(look, scene, renderer, frame.lighting);
      const indoor = location === 'house';
      look.sky.visible = !indoor;
      look.lantern.visible = location === 'yard';
      look.key.castShadow = !indoor;
      scene.fog = indoor ? null : look.fog;
      scene.background = indoor ? INDOOR_BACKGROUND : null;
      applySceneLightIntensities(look, lp, location);
      scene.environmentIntensity = indoor ? 0.22 : lp.envIntensity;
      updateSkyTime(look, frame.t);
      if (!indoor) {
        if (location === 'pond') {
          focusKeyShadow(look, THREE.MathUtils.clamp(c.look[0], -14, -2), THREE.MathUtils.clamp(c.look[2], 4, 16), 14);
        } else if (location === 'wolves') {
          focusKeyShadow(look, THREE.MathUtils.clamp(c.look[0], 8, 20), THREE.MathUtils.clamp(c.look[2], -7, 5), 14);
        } else {
          focusKeyShadow(look, THREE.MathUtils.clamp(c.look[0], -10, 10), THREE.MathUtils.clamp(c.look[2], -9, 11), 17);
        }
      }
      if (post) {
        const g = post.grade;
        if (indoor) {
          g.gain[0] = 1.03; g.gain[1] = 1.005; g.gain[2] = 0.965;
          g.lift[0] = 0.007; g.lift[1] = 0.004; g.lift[2] = 0.003;
          g.saturation = 1.06;
          g.contrast = 0.08;
          g.bloomStrength = 0.21 + 0.04 * lp.windowGlow;
        } else if (lp.stars >= 0.5) {
          g.gain[0] = 0.99; g.gain[1] = 1.0; g.gain[2] = 1.025;
          g.lift[0] = 0.004; g.lift[1] = 0.005; g.lift[2] = 0.009;
          g.saturation = DEFAULT_GRADE.saturation - 0.16 * lp.stars; // calmer night palette
          g.contrast = DEFAULT_GRADE.contrast;
          g.bloomStrength = 0.24;
        } else {
          const twilight = THREE.MathUtils.clamp(lp.windowGlow * 2.0, 0, 1);
          g.gain[0] = 1.02 + 0.015 * twilight; g.gain[1] = 1.005; g.gain[2] = 0.985 - 0.015 * twilight;
          g.lift[0] = 0.005 + 0.001 * twilight; g.lift[1] = 0.004; g.lift[2] = 0.006;
          g.saturation = DEFAULT_GRADE.saturation + 0.02 * twilight;
          g.contrast = DEFAULT_GRADE.contrast;
          g.bloomStrength = DEFAULT_GRADE.bloomStrength + 0.06 * twilight;
        }
      }
      set.update(frame.t, lp.windowGlow, pointScale, lp);
      renderer.localClippingEnabled=true;
      set.setDoor(frame.objects?.house_door??0);
      set.setCupboard(frame.objects?.kitchen_cupboard??0);
      // actors (stand on the porch / pier / bridges)
      let swing = 0;
      for (const id of ACTOR_IDS) {
        const a = frame.actors?.[id];
        const rig = rigs[id];
        if (!a || !rig) continue;
        const lift = a.physicsRoot ? 0 : walkHeightAt(a.pos[0], a.pos[2]);
        lifts[id] = lift;
        // Contacts solve before the stage lifts the complete rig onto decking.
        // Convert the resting prop's world target into that same coordinate space.
        const contactFrame=lift!==0?{...a,
          ...(a.putDown?{putDown:{...a.putDown,position:[a.putDown.position[0],a.putDown.position[1]-lift,a.putDown.position[2]] as [number,number,number]}}:{}),
          ...(a.pickup?{pickup:{...a.pickup,position:[a.pickup.position[0],a.pickup.position[1]-lift,a.pickup.position[2]] as [number,number,number]}}:{}),
          face:{...a.face,lookAt:a.face.lookAt?[a.face.lookAt[0],a.face.lookAt[1]-lift,a.face.lookAt[2]] as [number,number,number]:null},
        }:a;
        rig.apply(contactFrame);
        rig.root.visible=rig.root.visible&&(!frame.cast||frame.cast.includes(id))&&sceneLocationAt(a.pos[0],a.pos[2])===location;
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
      applyCarryContacts(rigs,frame);
      applyHugContacts(rigs,frame);
      applyObjectContacts(rigs,frame);
      contactShadows.update(rigs, frame, location, lp.stars, lifts);
      props.apply(frame.props, sockets, yaws, frame.actors);
      for(const id of PROP_IDS) {
        const p=frame.props[id],holder=p.attachedTo?frame.actors[p.attachedTo]:null;
        const pos=holder?.pos??p.pos;
        props.objects[id].visible=props.objects[id].visible&&(!p.attachedTo||!frame.cast||frame.cast.includes(p.attachedTo))&&sceneLocationAt(pos[0],pos[2])===location;
      }
      fx.apply(frame.fx?.filter(f=>sceneLocationAt(f.at[0],f.at[2])===location) ?? NO_FX, pointScale, { sunColor: lp.sunColor, skyHorizon: lp.skyHorizon, stars: lp.stars });
      atmosphere.update(frame.t, location, lp.windowGlow, pointScale);
      updateEnvironment(look, scene, performance.now());
      renderer.info.reset();
      if (post) post.render();
      else renderer.render(scene, camera);
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
      disposed = true;
      for (const id of ACTOR_IDS) rigs[id]?.dispose();
      (testRig as CharacterRig | null)?.dispose();
      props.dispose();
      disposeGenerated(props.root);disposeGenerated(set.root);
      fx.dispose();
      atmosphere.dispose();
      contactShadows.dispose();
      set.dispose();
      look.dispose();
      post?.dispose();
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
