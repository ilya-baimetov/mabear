import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {LookMaterials} from '../look';
import {HOUSE_ORIGIN, HOUSE_FOOTPRINT, HOUSE_KITCHEN_OFFSET, HOUSE_COOKING_HELPER, HOUSE_READING_TABLE, houseLocal} from '../../shared/houseLayout';
import {buildArchitectureShapes, roundedRoomOutline} from './interiorShapes/architecture';
import {buildLivingShapes} from './interiorShapes/living';
import {buildKitchenShapes} from './interiorShapes/kitchen';
import {
  bicycleWallpaper,
  butterCreamPlasterMaterial,
  castIronMaterial,
  curtainLinenMaterial,
  floorboardMaterial,
  honeyWalnutMaterial,
  paintedPanelMaterial,
  upholsteryMaterial,
  wainscotBoardNormal,
  windowLandscape,
} from './interiorDecor';

const DAY_CEILING_LIGHT = new THREE.Color(0xffe5bc);
const NIGHT_CEILING_LIGHT = new THREE.Color(0xffcc82);
const DAY_READING_LIGHT = new THREE.Color(0xffce8b);
const NIGHT_READING_LIGHT = new THREE.Color(0xffb45c);

/** Absolute time-of-day tint and deterministic hearth animation; seeking never compounds previous frames. */
export function updateHouseInterior(interior: THREE.Group, windowGlow: number, t = 0): void {
  const night = THREE.MathUtils.clamp(windowGlow, 0, 1);
  const windowMaterials = interior.userData.windowMaterials as THREE.MeshStandardMaterial[] | undefined;
  if (windowMaterials) {
    for (const material of windowMaterials) {
      const base = material.userData.windowBaseColor as THREE.Color | undefined;
      material.color.setRGB((base?.r ?? 1) * (1 - .80 * night), (base?.g ?? 1) * (1 - .72 * night), (base?.b ?? 1) * (1 - .55 * night));
      material.emissive.setRGB(1 - .60 * night, 1 - .45 * night, 1 - .20 * night);
      material.emissiveIntensity = .3 * (1 - .75 * night);
    }
  }
  const time = Number.isFinite(t) ? t : 0;
  const flicker = .88 + .07 * Math.sin(time * 7.3) + .05 * Math.sin(time * 13.7 + 1.1);
  const hearthLight = interior.userData.hearthLight as THREE.PointLight | undefined;
  if (hearthLight) hearthLight.intensity = (6.0 + 1.4 * night) * flicker;
  const emberMat = interior.userData.emberMaterial as THREE.MeshStandardMaterial | undefined;
  if (emberMat) emberMat.emissiveIntensity = (1.35 + .35 * night) * (.92 + .08 * Math.sin(time * 5.1 + .6));
  const flameMaterials = interior.userData.flameMaterials as THREE.ShaderMaterial[] | undefined;
  if (flameMaterials) {
    for (const mat of flameMaterials) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
      if (mat.uniforms.uIntensity) mat.uniforms.uIntensity.value = .92 + .18 * night;
    }
  }
  const ceilingLight = interior.userData.ceilingLight as THREE.PointLight | undefined;
  if (ceilingLight) {
    ceilingLight.intensity = 15 + 6 * night;
    ceilingLight.color.lerpColors(DAY_CEILING_LIGHT, NIGHT_CEILING_LIGHT, night);
  }
  const kitchenLight = interior.userData.kitchenLight as THREE.PointLight | undefined;
  if (kitchenLight) kitchenLight.intensity = 11 + 3 * night;
  const readingLight = interior.userData.readingLight as THREE.PointLight | undefined;
  if (readingLight) {
    readingLight.intensity = 2.2 + 1.0 * night;
    readingLight.color.lerpColors(DAY_READING_LIGHT, NIGHT_READING_LIGHT, night);
  }
  const pendantMat = interior.userData.pendantMaterial as THREE.MeshStandardMaterial | undefined;
  if (pendantMat) pendantMat.emissiveIntensity = .55 + 1.15 * night;
  const sunbeamMat = interior.userData.sunbeamMaterial as THREE.ShaderMaterial | undefined;
  if (sunbeamMat?.uniforms.uOpacity) sunbeamMat.uniforms.uOpacity.value = .14 * (1 - night);
}

/** Only a foreground perimeter section outside the camera is cut away; the
 * fireplace recess and flat return always retain their reviewed geometry. */
export function updateHouseInteriorView(interior: THREE.Group, cameraPosition: THREE.Vector3 | readonly [number, number, number]): void {
  const x = (cameraPosition instanceof THREE.Vector3 ? cameraPosition.x : cameraPosition[0]) - interior.position.x;
  const y = cameraPosition instanceof THREE.Vector3 ? cameraPosition.y : cameraPosition[1];
  const z = (cameraPosition instanceof THREE.Vector3 ? cameraPosition.z : cameraPosition[2]) - interior.position.z;
  for (const section of interior.userData.wallSections as THREE.Group[]) {
    const {start, end, cuttable} = section.userData;
    const side = (end[0] - start[0]) * (z - start[1]) - (end[1] - start[1]) * (x - start[0]);
    section.visible = !cuttable || side >= -.02;
  }
  (interior.userData.ceiling as THREE.Group).visible = y < 3.60;
}

function synthesizeBoxProjectedUvs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor ? Math.abs(nor.getX(i)) : 0;
    const ny = nor ? Math.abs(nor.getY(i)) : 1;
    const nz = nor ? Math.abs(nor.getZ(i)) : 0;
    let u: number, v: number;
    if (ny >= nx && ny >= nz) {u = x * .5; v = z * .5;}
    else if (nx >= ny && nx >= nz) {u = z * .5; v = y * .5;}
    else {u = x * .5; v = y * .5;}
    uvs[i * 2] = u; uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/** Recursively batch static subtrees by material while preserving interactive,
 * anchor, raycast and cutaway boundary groups. */
function batchStaticGeometry(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const glossyBatchMat = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .24, metalness: .04, vertexColors: true});
  glossyBatchMat.name = 'cream enamel'; glossyBatchMat.userData.setOwned = true;
  const matteBatchMat = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .90, metalness: 0, vertexColors: true});
  matteBatchMat.name = 'deep charcoal'; matteBatchMat.userData.setOwned = true;
  const ceilingBatchMat = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: .90, metalness: 0, side: THREE.DoubleSide, vertexColors: true});
  ceilingBatchMat.name = 'ceiling'; ceilingBatchMat.userData.setOwned = true;

  const anchors = root.userData.anchors as Record<string, unknown> | undefined;
  const wallSectionSet = new Set<THREE.Object3D>((root.userData.wallSections as THREE.Object3D[] | undefined) ?? []);
  const isBoundaryGroup = (g: THREE.Group): boolean =>
    g === root ||
    g.name === 'set:house:wall-shell' ||
    g.userData.cuttable === true ||
    g === root.userData.ceiling ||
    g === root.userData.cookingPot ||
    g === anchors?.chair ||
    g === anchors?.prepTable ||
    g === anchors?.helper ||
    g.name === 'rounded low checkers table' ||
    g.name === 'object:kitchen_cupboard';

  const replacedMaterials = new Set<THREE.Material>();

  const mergeBoundary = (boundary: THREE.Group): void => {
    const subBoundaries: THREE.Group[] = [];
    const findSubBoundaries = (node: THREE.Object3D) => {
      for (const child of node.children) {
        if (child instanceof THREE.Group) {
          if (isBoundaryGroup(child)) subBoundaries.push(child);
          else findSubBoundaries(child);
        }
      }
    };
    findSubBoundaries(boundary);
    for (const sub of subBoundaries) mergeBoundary(sub);

    const collected: THREE.Mesh[] = [];
    const collectMeshes = (node: THREE.Object3D) => {
      for (const child of node.children) {
        if (child instanceof THREE.Group) {
          if (!isBoundaryGroup(child)) collectMeshes(child);
        } else if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.name !== 'set:house:floor') {
          collected.push(child);
        }
      }
    };
    collectMeshes(boundary);

    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const mesh of collected) {
      const srcMat = mesh.material as THREE.Material;
      const kind = srcMat.userData.vertexBatch as string | undefined;
      const targetMat = kind === 'glossy' ? glossyBatchMat : kind === 'matte' ? matteBatchMat : kind === 'ceiling' ? ceilingBatchMat : srcMat;
      if (targetMat !== srcMat && srcMat.userData.setOwned) replacedMaterials.add(srcMat);
      const list = batches.get(targetMat) ?? [];
      list.push(mesh);
      batches.set(targetMat, list);
    }

    const boundaryInverse = boundary.matrixWorld.clone().invert();
    const relMatrix = new THREE.Matrix4();

    for (const [material, meshes] of batches) {
      if (meshes.length === 1 && material === meshes[0].material && meshes[0].parent === boundary) continue;
      const useVertexColors = (material as THREE.MeshStandardMaterial).vertexColors === true;
      const geometryParts = meshes.map(mesh => {
        relMatrix.multiplyMatrices(boundaryInverse, mesh.matrixWorld);
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const name of Object.keys(geometry.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv' && (!useVertexColors || name !== 'color')) {
            geometry.deleteAttribute(name);
          }
        }
        if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
        geometry.applyMatrix4(relMatrix);
        if (!geometry.hasAttribute('uv')) synthesizeBoxProjectedUvs(geometry);
        if (useVertexColors && !geometry.hasAttribute('color')) {
          const count = geometry.getAttribute('position').count;
          const colors = new Float32Array(count * 3);
          const srcMat = mesh.material as THREE.MeshStandardMaterial;
          const c = (mesh.userData.vertexColor as THREE.Color | undefined) ?? srcMat.color ?? new THREE.Color(1, 1, 1);
          for (let i = 0; i < count; i++) {
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        geometry.clearGroups();
        return geometry;
      });
      const geometry = geometryParts.length === 1 ? geometryParts[0] : mergeGeometries(geometryParts);
      if (geometryParts.length > 1) for (const part of geometryParts) part.dispose();
      if (!geometry) throw new Error(`Cannot batch house fixture ${boundary.name}`);
      const batch = new THREE.Mesh(geometry, material);
      const allSameName = meshes.every(mesh => mesh.name === meshes[0].name) && meshes[0].name.length > 0;
      batch.name = allSameName ? meshes[0].name : `set:house:batch:${boundary.name}:${material.name}`;
      batch.castShadow = meshes.some(mesh => mesh.castShadow);
      batch.receiveShadow = meshes.some(mesh => mesh.receiveShadow);
      if (meshes.length === 1) {
        batch.renderOrder = meshes[0].renderOrder;
        batch.raycast = meshes[0].raycast;
      }
      batch.userData.partNames = meshes.map(mesh => mesh.name);
      const oldGeometries = new Set<THREE.BufferGeometry>();
      for (const mesh of meshes) {
        mesh.parent?.remove(mesh);
        oldGeometries.add(mesh.geometry);
      }
      for (const oldGeo of oldGeometries) oldGeo.dispose();
      boundary.add(batch);
    }

    const pruneEmptyGroups = (group: THREE.Group) => {
      for (const child of [...group.children]) {
        if (child instanceof THREE.Group) {
          pruneEmptyGroups(child);
          if (child.children.length === 0 && !isBoundaryGroup(child) && !wallSectionSet.has(child) && child.name !== 'set:house:kitchen') {
            group.remove(child);
          }
        }
      }
    };
    pruneEmptyGroups(boundary);
  };

  mergeBoundary(root);
  for (const mat of replacedMaterials) mat.dispose();
}

/** The reviewed room is now the actual game set. Semantic marks and physical
 * contacts share its world transform, furniture heights and cooking helper. */
export function buildHouseInterior(_materials: LookMaterials): THREE.Group {
  const root = new THREE.Group(); root.name = 'set:house_interior';
  root.position.set(HOUSE_ORIGIN[0], 0, HOUSE_ORIGIN[1]);
  const material = (name: string, color: string, roughness = .88, metalness = 0) => {
    const result = new THREE.MeshStandardMaterial({color, roughness, metalness});
    result.name = name; result.userData.setOwned = true; return result;
  };
  const readyPromises: Promise<void>[] = [];

  const panel = paintedPanelMaterial();
  panel.name = 'green wainscot';
  panel.vertexColors = false;
  panel.color.set('#7d9172');
  panel.roughness = .82;
  panel.userData.setOwned = true;
  const panelNormal = wainscotBoardNormal();
  if (panelNormal) {
    panel.normalMap = panelNormal;
    panel.normalScale.set(.75, .75);
  }

  const wallpaper = bicycleWallpaper();
  const paper = wallpaper ?? material('muted green wall', '#a5ae90', .94);
  paper.name = 'muted green wall';
  paper.userData.setOwned = true;

  const win = windowLandscape();
  let glass: THREE.MeshStandardMaterial;
  let doorLandscape: THREE.MeshStandardMaterial;
  if (win) {
    glass = win.material;
    readyPromises.push(win.ready);
    glass.name = 'window light';
    glass.side = THREE.DoubleSide;
    glass.userData.setOwned = true;
    glass.userData.windowBaseColor = glass.color.clone();
    doorLandscape = glass;
  } else {
    glass = material('window light', '#a2b7b5', .42);
    glass.side = THREE.DoubleSide;
    glass.userData.windowBaseColor = glass.color.clone();
    doorLandscape = glass;
  }

  const m = {
    chair: upholsteryMaterial(),
    plaster: material('ivory plaster', '#dfd6be', .90),
    wood: honeyWalnutMaterial({color: '#8c6a46', roughness: .68, name: 'aged timber'}),
    panel,
    paper,
    floor: floorboardMaterial(),
    kitchen: butterCreamPlasterMaterial(),
    enamel: material('cream enamel', '#eae7d8', .24, .04),
    metal: castIronMaterial('#4a4e4c', .74, .42, 'stove iron'),
    chrome: material('brushed chrome', '#dce2e6', .22, .88),
    glass,
    doorLandscape,
    blue: material('painted blue', '#648898', .24, .04),
    curtain: curtainLinenMaterial(),
    black: material('deep charcoal', '#343933', .92),
    figure: material('felt', '#b1ada3', .95),
    ceiling: material('ceiling', '#bfc5ac', .92),
  };
  m.enamel.userData.vertexBatch = 'glossy';
  m.blue.userData.vertexBatch = 'glossy';
  m.chrome.userData.vertexBatch = 'glossy';
  m.black.userData.vertexBatch = 'matte';
  m.figure.userData.vertexBatch = 'matte';

  const floorGeo = new THREE.ShapeGeometry(roundedRoomOutline(HOUSE_FOOTPRINT));
  const floorPos = floorGeo.getAttribute('position');
  const floorUv = new Float32Array(floorPos.count * 2);
  for (let i = 0; i < floorPos.count; i++) {
    floorUv[i * 2] = floorPos.getX(i) * .45;
    floorUv[i * 2 + 1] = floorPos.getY(i) * .45;
  }
  floorGeo.setAttribute('uv', new THREE.BufferAttribute(floorUv, 2));
  const floor = new THREE.Mesh(floorGeo, m.floor);
  floor.name = 'set:house:floor'; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  const {envelope, ceiling, opposite, wallSections} = buildArchitectureShapes(m, HOUSE_FOOTPRINT);
  envelope.name = 'set:house:wall-shell';

  // Wrought-iron and frosted-glass pendant lamp shade around (-0.7, 3.05, 1.15) with castShadow = false.
  const pendant = new THREE.Group();
  pendant.name = 'set:house:pendant-lamp';
  pendant.position.set(-.7, 0, 1.15);
  const pendantIronMat = material('pendant iron', '#4a4e4c', .42, 0);
  pendantIronMat.userData.vertexBatch = 'ceiling';
  const addPendantPart = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, y = 0) => {
    const part = new THREE.Mesh(geometry, mat);
    part.name = name; part.position.y = y; part.castShadow = false; part.receiveShadow = false;
    pendant.add(part);
    return part;
  };
  addPendantPart('Pendant canopy', new THREE.CylinderGeometry(.09, .12, .05, 18), pendantIronMat, 3.87);
  addPendantPart('Pendant stem', new THREE.CylinderGeometry(.016, .016, .70, 10), pendantIronMat, 3.51);
  const shadeProfile = [[0, 3.17], [.05, 3.17], [.08, 3.15], [.18, 3.10], [.27, 3.04], [.285, 3.01], [.255, 3.01], [.16, 3.08], [.05, 3.14], [0, 3.14]].map(([r, y]) => new THREE.Vector2(r, y));
  addPendantPart('Pendant wrought-iron shade', new THREE.LatheGeometry(shadeProfile, 24), pendantIronMat);
  const pendantMaterial = new THREE.MeshStandardMaterial({
    color: '#fff4da',
    emissive: new THREE.Color('#ffcf7d'),
    emissiveIntensity: .55,
    roughness: .35,
  });
  pendantMaterial.name = 'frosted pendant glass'; pendantMaterial.userData.setOwned = true;
  const diffuserProfile = [[0, 2.91], [.06, 2.915], [.12, 2.95], [.145, 3.00], [.13, 3.05], [0, 3.05]].map(([r, y]) => new THREE.Vector2(r, y));
  addPendantPart('Pendant frosted diffuser', new THREE.LatheGeometry(diffuserProfile, 20), pendantMaterial);
  ceiling.add(pendant);

  const {fireplace, furnishings, chair, flameMaterial, emberMaterial} = buildLivingShapes(m);
  const readingTable = furnishings.getObjectByName('rounded low checkers table')!;
  const [tx, tz] = houseLocal(HOUSE_READING_TABLE.position); readingTable.position.set(tx, 0, tz);
  for (const child of [...readingTable.children]) {
    if (child instanceof THREE.Mesh && child.name.endsWith('checker piece')) {
      child.position.add(readingTable.position);
      furnishings.add(child);
    }
  }
  const {kitchen, prepTable, diningChairs, tableSurfaceY, seatY, sunbeamMaterial} = buildKitchenShapes(m);
  // Keep the stove approach open for Bear's full body; the second chair now
  // faces its table from the south side instead of blocking the cooking aisle.
  diningChairs[1].position.set(-5.05 - HOUSE_KITCHEN_OFFSET[0], 0, 2.82 - HOUSE_KITCHEN_OFFSET[1]);
  diningChairs[1].rotation.y = Math.PI;
  kitchen.add(prepTable, ...diningChairs); kitchen.position.set(HOUSE_KITCHEN_OFFSET[0], 0, HOUSE_KITCHEN_OFFSET[1]);
  // Keep the pot in one believable place through the entire story. The stove
  // is reserved for an actor's pan, so cooking never pops set dressing away.
  const cookingPot = kitchen.getObjectByName('Open enamel cooking pot')!;
  kitchen.add(cookingPot); cookingPot.position.set(-4.52, 1.32, -2.88);
  root.add(envelope, ceiling, opposite, fireplace, furnishings, kitchen);

  // The helper uses the exact support footprint followed by Masha's feet.
  const helper = new THREE.Group(); helper.name = 'set:house:cooking-helper';
  const [hx, hz] = houseLocal(HOUSE_COOKING_HELPER.position);
  const {height, width, depth, stepDepth, steps} = HOUSE_COOKING_HELPER;
  for (let i = 0; i < steps; i++) {
    const h = height * (steps - i) / steps, w = i === 0 ? width : stepDepth;
    const x = hx + (i === 0 ? 0 : width / 2 + stepDepth * (i - .5));
    const tread = new THREE.Mesh(new RoundedBoxGeometry(w, h, depth, 2, .015), m.wood);
    tread.name = `set:house:helper-tread:${steps - i}`; tread.position.set(x, h / 2, hz);
    tread.castShadow = tread.receiveShadow = true; helper.add(tread);
  }
  root.add(helper);

  const warm = new THREE.PointLight(0xffe5bc, 15, 15, 2);
  warm.name = 'set:house:ceiling-light'; warm.position.set(-.7, 2.86, 1.15);
  warm.castShadow = true; warm.shadow.mapSize.set(1024, 1024); warm.shadow.camera.near = .1;
  warm.shadow.camera.far = 15; warm.shadow.bias = -.00015; warm.shadow.normalBias = .025; warm.shadow.radius = 3; root.add(warm);
  const kitchenLight = new THREE.PointLight(0xffe9cb, 11, 9, 2);
  kitchenLight.name = 'set:house:kitchen-light'; kitchenLight.position.set(-5.6, 3.12, 1.2); root.add(kitchenLight);
  const reading = new THREE.PointLight(0xffce8b, 2.2, 4, 2);
  reading.name = 'set:house:reading-light'; reading.position.set(1.8, 1.75, -.1); root.add(reading);
  const hearthLight = new THREE.PointLight(0xff7f2a, 6.0, 7.5, 2);
  hearthLight.name = 'set:house:hearth-light'; hearthLight.position.set(-1.07, .48, -1.82); root.add(hearthLight);

  root.userData = {
    setElement: 'house_interior', revision: 'reviewed-wall-return-04', geometryVersion: 'integrated-interior-v1',
    description: 'Connected kitchen and living room from the reviewed cartoon shape study',
    wallSections, ceiling, cookingPot,
    windowMaterials: glass === doorLandscape ? [glass] : [glass, doorLandscape],
    extraDisposables: [panel, paper, m.kitchen, m.curtain, m.figure],
    assetsReady: Promise.all(readyPromises).then(() => undefined),
    anchors: {chair, prepTable, tableSurfaceY, diningSeatY: seatY, helper},
    hearthLight, ceilingLight: warm, kitchenLight, readingLight: reading,
    pendantMaterial, flameMaterials: [flameMaterial], emberMaterial, sunbeamMaterial,
  };
  batchStaticGeometry(root);
  updateHouseInterior(root, 0, 0);
  root.visible = false;
  return root;
}
