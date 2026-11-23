// Set "Bear's yard" (spec §7.2): orchestrates per-location building (`yard` eagerly; `house`, `pond`, `wolves` lazily)
// and re-exports all public set layout/geometry helpers for backward compatibility.
import * as THREE from "three";
import { MARKS, sceneLocationAt, type SceneLocation } from "../../shared/bible/set";
import { KITCHEN_CUPBOARD } from "../../shared/interactiveObjects";
import { pondRadius } from "../../shared/pond";
import type { Vec3 } from "../../shared/schema";
import {
  CREEK_POINTS, PIER_HEIGHT, PORCH_HEIGHT, SET_ELEMENT_IDS, SET_ELEMENTS, TABLE_TOP,
  restHeightAt, walkHeightAt, type SetElementDef, type SetElementId,
} from "../../shared/yardLayout";
import { GeoBag, TOD_PRESETS, type LightingParams, type LookMaterials } from "../look";
import { applyForestTextures, buildForestLocation } from "./forestLocations";
import { buildHouseInterior, updateHouseInterior, updateHouseInteriorView } from "./houseInterior";
import { NatureAssets, updateNatureWind, type HorizonUniforms } from "./nature";
import type { EnvTextures } from "./textures";
import * as foliage from "./yard/foliage";
import {
  addBirch, addPine, creekDistance, type BuildCtx, type GrassUniforms, type GroundDetailUniforms,
  type HammockUniforms, type PondRippleUniforms, type SetExtras, type WaterUniforms,
} from "./yard/geometry";
import { applyGroundDetailTextures, buildGrass, buildGround, disposeGroundDetail, groundY } from "./yard/ground";
import * as structures from "./yard/structures";
import { buildVan } from "./yard/van";
import * as water from "./yard/water";

export { MARKS, pondRadius, creekDistance, addPine, addBirch, groundY, type GroundDetailUniforms };
export {
  CREEK_POINTS, PIER_HEIGHT, PORCH_HEIGHT, SET_ELEMENT_IDS, SET_ELEMENTS, TABLE_TOP,
  restHeightAt, walkHeightAt, type SetElementDef, type SetElementId,
};

const BUILDERS: Record<SetElementId, (c: BuildCtx) => void> = {
  ground: buildGround, grass: buildGrass, house: structures.buildHouse, garden: structures.buildGarden,
  beehive: structures.buildBeehive, oak_swing: structures.buildOakSwing, hammock: structures.buildHammock,
  pond: water.buildPond, pier: water.buildPier, table: structures.buildTable, samovar: structures.buildSamovar,
  bench: structures.buildBench, woodpile: structures.buildWoodpile, big_pine: foliage.buildBigPine,
  bush: foliage.buildBush, creek: water.buildCreek, footbridge: water.buildFootbridge,
  path_bridge: water.buildPathBridge, van: buildVan, picket_fence: structures.buildFence,
  flowers_patch: foliage.buildFlowers, rocks: structures.buildRocks, forest: foliage.buildForest,
};

const REMOTE_ELEMENTS = new Set<SetElementId>(["pond", "pier", "van"]);
const UNMERGED_ELEMENTS = new Set<SetElementId>(["pond", "pier", "van", "creek"]);

export interface SetHandle {
  setCupboard(open: number): void;
  setDoor(open: number): void;
  root: THREE.Group;
  assetsReady: Promise<void>;
  natureStatus(): { loaded: string[]; failed: string[] };
  updateView(x: number, z: number, location?: SceneLocation, cameraPosition?: THREE.Vector3): void;
  elements: Record<SetElementId, THREE.Group>;
  swingPivot: THREE.Object3D | null;
  swingSeat: THREE.Object3D | null;
  update(t: number, windowGlow: number, pointScale: number, lighting?: LightingParams): void;
  setSwing(angle: number): void;
  swingRopeGrips(angle: number): [Vec3, Vec3];
  setHammock(weight: number, sway: number, t: number): void;
  setPondRipple(x: number, z: number, strength: number): void;
  applyTextures(t: EnvTextures): void;
  dispose(): void;
}

export interface BuildSetOptions {
  merge?: boolean;
  skip?: readonly SetElementId[];
  timings?: Record<string, number>;
}

/** Elements whose static geometry renders into the shadow map (perf: everything else only receives). */
export const SHADOW_CASTERS: ReadonlySet<SetElementId> = new Set<SetElementId>([
  "house", "van", "oak_swing", "table", "bench", "beehive", "woodpile", "samovar", "big_pine", "pier", "footbridge", "path_bridge",
]);

const _updSunDir = new THREE.Vector3(6, 13, 9).normalize();
const _updSunCol = new THREE.Color(0xfff0d8);
const _updSkyCol = new THREE.Color(0x9ccbf5);
const _updTmpCol = new THREE.Color();

function updateSunSkyState(g: number, lighting?: LightingParams): number {
  if (lighting) {
    _updSunDir.set(lighting.sunDir[0], lighting.sunDir[1], lighting.sunDir[2]);
    if (_updSunDir.lengthSq() > 1e-6) _updSunDir.normalize();
    else _updSunDir.set(6, 13, 9).normalize();
    _updSunCol.setHex(lighting.sunColor);
    _updSkyCol.setHex(lighting.skyHorizon).lerp(_updTmpCol.setHex(lighting.skyTop), 0.35);
    return 1 - THREE.MathUtils.clamp(lighting.stars, 0, 1);
  }
  _updSunDir.set(6 - 11 * g, 13 - 3 * g, 9 - 2 * g).normalize();
  if (g < 0.45) {
    const k = g / 0.45;
    _updSunCol.setHex(TOD_PRESETS.day.sunColor).lerp(_updTmpCol.setHex(TOD_PRESETS.sunset.sunColor), k);
    _updSkyCol.setHex(TOD_PRESETS.day.skyHorizon).lerp(_updTmpCol.setHex(TOD_PRESETS.sunset.skyHorizon), k);
  } else {
    const k = (g - 0.45) / 0.55;
    _updSunCol.setHex(TOD_PRESETS.sunset.sunColor).lerp(_updTmpCol.setHex(TOD_PRESETS.night.sunColor), k);
    _updSkyCol.setHex(TOD_PRESETS.sunset.skyHorizon).lerp(_updTmpCol.setHex(TOD_PRESETS.night.skyHorizon), k);
  }
  return 1 - g;
}

function disposeSetGraph(root: THREE.Group): void {
  const disposedTex = new Set<THREE.Texture>();
  const disposedMat = new Set<THREE.Material>();
  root.traverse((o) => {
    const shadow = (o as { shadow?: THREE.LightShadow | null }).shadow;
    if (o instanceof THREE.Light && shadow?.map) shadow.map.dispose();
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const list = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of list) {
      if (disposedMat.has(mat)) continue;
      if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
        disposedMat.add(mat);
        mat.dispose();
      } else if (mat.userData.setOwned) {
        disposedMat.add(mat);
        const std = mat as THREE.MeshStandardMaterial;
        for (const tex of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.emissiveMap, std.aoMap]) {
          if (tex && !disposedTex.has(tex)) { disposedTex.add(tex); tex.dispose(); }
        }
        mat.dispose();
      }
    }
  });
}

export function buildBearsYard(mats: LookMaterials, opts: BuildSetOptions = {}): SetHandle {
  const merge = opts.merge ?? true;
  const skip = new Set(opts.skip ?? []);
  const root = new THREE.Group();
  root.name = "set:bears_yard";
  const waterUniforms: WaterUniforms = {
    uSetWaterTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(6, 13, 9).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d8) }, uSkyColor: { value: new THREE.Color(0x9ccbf5) }, uDayFade: { value: 1 },
  };
  const grassUniforms: GrassUniforms = {
    uTime: { value: 0 }, uWind: { value: 1 }, uSunDir: { value: new THREE.Vector3(6, 13, 9).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d8) }, uDayFade: { value: 1 },
  };
  const pondRippleUniforms: PondRippleUniforms = { uRippleCenter: { value: new THREE.Vector2(-8, 10) }, uRippleStrength: { value: 0 } };
  const hammockUniforms: HammockUniforms = { uHammockWeight: { value: 0 }, uHammockSway: { value: 0 }, uHammockTime: { value: 0 } };
  const extra: SetExtras = {
    nature: new NatureAssets(), disposables: [],
    waterUniforms: water.installWaterRipples(mats.water, waterUniforms),
    pondRippleUniforms, hammockUniforms, grassUniforms,
  };
  const global = new GeoBag();
  const globalNoCast = new GeoBag();
  const elements = {} as Record<SetElementId, THREE.Group>;

  const buildElement = (id: SetElementId, mergeIntoYard: boolean) => {
    const anchor = elements[id];
    const ctx: BuildCtx = { bag: new GeoBag(), dyn: [], mats, extra };
    const t0 = performance.now();
    BUILDERS[id](ctx);
    for (const o of ctx.dyn) anchor.add(o);
    if (ctx.bag.parts.size) {
      const cast = SHADOW_CASTERS.has(id);
      if (mergeIntoYard && merge && !skip.has(id) && !UNMERGED_ELEMENTS.has(id)) {
        anchor.updateMatrix();
        (cast ? global : globalNoCast).absorb(ctx.bag, anchor.matrix);
        anchor.userData.merged = true;
      } else {
        anchor.add(ctx.bag.build(mats, `set:${id}:static`, cast ? {} : { cast: false }));
      }
    }
    ctx.bag.dispose();
    if (opts.timings) opts.timings[id] = Math.round(performance.now() - t0);
  };

  for (const id of SET_ELEMENT_IDS) {
    const def = SET_ELEMENTS[id];
    const anchor = new THREE.Group();
    anchor.name = `set:${id}`;
    anchor.position.set(def.pos[0], def.pos[1], def.pos[2]);
    anchor.rotation.y = def.rotY;
    anchor.userData = { setElement: id, mark: def.mark, description: def.description, source: skip.has(id) ? "gltf" : "procedural" };
    root.add(anchor);
    elements[id] = anchor;
    if (REMOTE_ELEMENTS.has(id)) { anchor.visible = false; if (opts.timings) opts.timings[id] = 0; }
    else buildElement(id, true);
  }
  const tm = performance.now();
  if (merge) {
    root.add(global.build(mats, "set:merged_static"));
    root.add(globalNoCast.build(mats, "set:merged_static_nocast", { cast: false }));
  }
  global.dispose(); globalNoCast.dispose();
  if (opts.timings) opts.timings.merge = Math.round(performance.now() - tm);
  root.updateMatrixWorld(true);

  const outsideDoor = structures.buildHouseDoor();
  root.add(outsideDoor);

  let interior: THREE.Group | null = null;
  let cupboardPanel: THREE.Object3D | undefined;
  let insideDoor: THREE.Group | null = null;
  let pondLocation: THREE.Group | null = null;
  let wolvesLocation: THREE.Group | null = null;
  let latestDoorOpen = 0, latestCupboardOpen = 0, latestTime = 0, latestWindowGlow = 0, latestDayFade = 1;
  let latestEnvTex: EnvTextures | null = null;
  const builtLocations = new Set<SceneLocation>(["yard"]);

  const syncForestLocation = (locGroup: THREE.Group | null) => {
    if (!locGroup) return;
    const ru = locGroup.userData.grassUniforms as GrassUniforms | undefined;
    if (ru) { ru.uTime.value = latestTime; ru.uSunDir.value.copy(_updSunDir); ru.uSunColor.value.copy(_updSunCol); ru.uDayFade.value = latestDayFade; }
    const hu = locGroup.userData.horizonUniforms as HorizonUniforms | undefined;
    if (hu) { hu.uSkyColor.value.copy(_updSkyCol); hu.uSunColor.value.copy(_updSunCol); hu.uDayFade.value = latestDayFade; }
  };

  const ensureLocation = (loc: SceneLocation) => {
    if (builtLocations.has(loc)) return;
    builtLocations.add(loc);
    if (loc === "house") {
      interior = buildHouseInterior(mats);
      root.add(interior);
      cupboardPanel = interior.getObjectByName("object:kitchen_cupboard");
      insideDoor = structures.buildHouseDoor(true);
      interior.add(insideDoor);
      insideDoor.position.sub(interior.position);
      structures.updateHouseDoor(insideDoor, latestDoorOpen);
      if (cupboardPanel) { cupboardPanel.rotation.y = KITCHEN_CUPBOARD.angle * latestCupboardOpen; cupboardPanel.userData.open = latestCupboardOpen; }
      updateHouseInterior(interior, latestWindowGlow, latestTime);
      interior.updateMatrixWorld(true);
    } else if (loc === "pond") {
      if (!elements.pond.children.length) buildElement("pond", false);
      if (!elements.pier.children.length) buildElement("pier", false);
      water.applyPierLayout(elements.pier);
      pondLocation = buildForestLocation("pond", mats, extra.nature, pondRadius);
      root.add(pondLocation);
      if (latestEnvTex) applyForestTextures(pondLocation, latestEnvTex);
      syncForestLocation(pondLocation);
      pondLocation.updateMatrixWorld(true);
    } else if (loc === "wolves") {
      if (!elements.van.children.length) buildElement("van", false);
      wolvesLocation = buildForestLocation("wolves", mats, extra.nature);
      root.add(wolvesLocation);
      if (latestEnvTex) applyForestTextures(wolvesLocation, latestEnvTex);
      syncForestLocation(wolvesLocation);
      wolvesLocation.updateMatrixWorld(true);
    }
  };

  const smokeMat = extra.smoke?.material as THREE.ShaderMaterial | undefined;
  const beesMat = extra.bees?.material as THREE.ShaderMaterial | undefined;

  return {
    setDoor(open) {
      latestDoorOpen = open;
      structures.updateHouseDoor(outsideDoor, open);
      if (insideDoor) structures.updateHouseDoor(insideDoor, open);
    },
    setCupboard(open) {
      latestCupboardOpen = open;
      if (cupboardPanel) { cupboardPanel.rotation.y = KITCHEN_CUPBOARD.angle * open; cupboardPanel.userData.open = open; }
    },
    root,
    assetsReady: Promise.all([...extra.nature.jobs]).then(() => undefined),
    updateView(x, z, location = sceneLocationAt(x, z), cameraPosition) {
      ensureLocation(location);
      for (const child of root.children) child.visible = false;
      if (location === "house") {
        interior!.visible = true;
        if (cameraPosition) updateHouseInteriorView(interior!, cameraPosition);
      } else if (location === "pond") {
        pondLocation!.visible = true; elements.pond.visible = true; elements.pier.visible = true;
      } else if (location === "wolves") {
        wolvesLocation!.visible = true; elements.van.visible = true;
      } else {
        for (const child of root.children) child.visible = child !== interior && child !== pondLocation && child !== wolvesLocation;
        for (const id of ["pond", "pier", "van"] as const) elements[id].visible = false;
      }
      root.userData.location = location;
    },
    natureStatus: () => ({ loaded: [...extra.nature.loaded], failed: [...extra.nature.failed] }),
    elements,
    swingPivot: extra.swingPivot ?? null,
    swingSeat: extra.swingSeat ?? null,
    update(t, windowGlow, pointScale, lighting) {
      latestTime = t; latestWindowGlow = windowGlow;
      const g = THREE.MathUtils.clamp(windowGlow, 0, 1);
      if (interior) updateHouseInterior(interior, windowGlow, t);
      const houseGlow = elements.house.userData.glowMaterials as THREE.MeshStandardMaterial[] | undefined;
      const houseGlowMesh = elements.house.userData.glowMesh as THREE.Object3D | undefined;
      if (houseGlow?.length) {
        for (const gm of houseGlow) { gm.emissiveIntensity = g * 2.6; gm.opacity = g * 0.92; }
        if (houseGlowMesh) houseGlowMesh.visible = g > 0.01;
      }
      latestDayFade = updateSunSkyState(g, lighting);
      extra.grassUniforms.uTime.value = t; extra.grassUniforms.uSunDir.value.copy(_updSunDir);
      extra.grassUniforms.uSunColor.value.copy(_updSunCol); extra.grassUniforms.uDayFade.value = latestDayFade;
      syncForestLocation(pondLocation); syncForestLocation(wolvesLocation);
      extra.waterUniforms.uSetWaterTime.value = t; extra.waterUniforms.uSunDir.value.copy(_updSunDir);
      extra.waterUniforms.uSunColor.value.copy(_updSunCol); extra.waterUniforms.uSkyColor.value.copy(_updSkyCol);
      extra.waterUniforms.uDayFade.value = latestDayFade;
      if (extra.horizonUniforms) {
        extra.horizonUniforms.uSkyColor.value.copy(_updSkyCol);
        extra.horizonUniforms.uSunColor.value.copy(_updSunCol);
        extra.horizonUniforms.uDayFade.value = latestDayFade;
      }
      updateNatureWind(t, { sunDir: [_updSunDir.x, _updSunDir.y, _updSunDir.z], sunColor: _updSunCol.getHex(), dayFade: latestDayFade });
      if (smokeMat) {
        smokeMat.uniforms.uTime.value = t; smokeMat.uniforms.uScale.value = pointScale;
        (smokeMat.uniforms.uColor.value as THREE.Color).setHex(windowGlow > 0.6 ? 0x6f7890 : 0xf4f1ec);
        smokeMat.uniforms.uAlpha.value = 0.5 - windowGlow * 0.2;
      }
      if (beesMat) {
        beesMat.uniforms.uTime.value = t; beesMat.uniforms.uScale.value = pointScale;
        if (extra.bees) extra.bees.visible = windowGlow < 0.7;
      }
    },
    setSwing(angle) { if (extra.swingPivot) extra.swingPivot.rotation.x = angle; },
    swingRopeGrips: structures.swingRopeGripsAt,
    setHammock(weight, sway, t) {
      hammockUniforms.uHammockWeight.value = Number.isFinite(weight) ? Math.max(0, weight) : 0;
      hammockUniforms.uHammockSway.value = Number.isFinite(sway) ? sway : 0;
      hammockUniforms.uHammockTime.value = Number.isFinite(t) ? t : 0;
    },
    setPondRipple(x, z, strength) {
      pondRippleUniforms.uRippleCenter.value.set(Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0);
      pondRippleUniforms.uRippleStrength.value = Number.isFinite(strength) ? Math.max(0, strength) : 0;
    },
    applyTextures(t) {
      latestEnvTex = t;
      if (pondLocation) applyForestTextures(pondLocation, t);
      if (wolvesLocation) applyForestTextures(wolvesLocation, t);
      if (extra.groundUniforms) applyGroundDetailTextures(extra.groundUniforms, t);
    },
    dispose() {
      extra.nature.dispose();
      disposeSetGraph(root);
      const interiorExtras = interior?.userData.extraDisposables as { dispose(): void }[] | undefined;
      if (interiorExtras) for (const d of interiorExtras) d.dispose();
      for (const d of extra.disposables) d.dispose();
      if (extra.groundUniforms) disposeGroundDetail(extra.groundUniforms);
    },
  };
}
