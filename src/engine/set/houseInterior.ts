import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {LookMaterials} from '../look';
import {HOUSE_ORIGIN, HOUSE_FOOTPRINT, HOUSE_KITCHEN_OFFSET, HOUSE_COOKING_HELPER, HOUSE_READING_TABLE, houseLocal} from '../../shared/houseLayout';
import {buildArchitectureShapes, roundedRoomOutline} from './interiorShapes/architecture';
import {buildLivingShapes} from './interiorShapes/living';
import {buildKitchenShapes} from './interiorShapes/kitchen';

/** Lower and upper surfaces meet at a single edge rather than overlapping. */
export const HOUSE_WALL_BANDS = {panelTop: 1.16, upperBottom: 1.16, upperTop: 3.84} as const;

/** Absolute time-of-day tint; seeking never compounds a previous frame's tint. */
export function updateHouseInterior(interior: THREE.Group, windowGlow: number): void {
  const night = THREE.MathUtils.clamp(windowGlow, 0, 1);
  for (const material of interior.userData.windowMaterials as THREE.MeshStandardMaterial[]) {
    const base = material.userData.windowBaseColor as THREE.Color | undefined;
    material.color.setRGB((base?.r ?? 1) * (1 - .80 * night), (base?.g ?? 1) * (1 - .72 * night), (base?.b ?? 1) * (1 - .55 * night));
    material.emissive.setRGB(1 - .60 * night, 1 - .45 * night, 1 - .20 * night);
    material.emissiveIntensity = .3 * (1 - .75 * night);
  }
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

/** Batch siblings by material while preserving fixture and cutaway groups.
 * A six-face point-light shadow must not redraw every individual shelf rail. */
function batchStaticGeometry(group: THREE.Group): void {
  for (const child of [...group.children]) if (child instanceof THREE.Group) batchStaticGeometry(child);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
    const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometryParts = meshes.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
      geometry.applyMatrix4(mesh.matrix); return geometry;
    });
    const geometry = mergeGeometries(geometryParts);
    for (const part of geometryParts) part.dispose();
    if (!geometry) throw new Error(`Cannot batch house fixture ${group.name}`);
    const batch = new THREE.Mesh(geometry, material);
    batch.name = `set:house:batch:${group.name}:${material.name}`;
    batch.castShadow = meshes.some(mesh => mesh.castShadow);
    batch.receiveShadow = meshes.some(mesh => mesh.receiveShadow);
    batch.userData.partNames = meshes.map(mesh => mesh.name);
    for (const mesh of meshes) {group.remove(mesh); mesh.geometry.dispose();}
    group.add(batch);
  }
}

/** The reviewed room is now the actual game set. Semantic marks and physical
 * contacts share its world transform, furniture heights and cooking helper. */
export function buildHouseInterior(_materials: LookMaterials): THREE.Group {
  const root = new THREE.Group(); root.name = 'set:house_interior';
  root.position.set(HOUSE_ORIGIN[0], 0, HOUSE_ORIGIN[1]);
  const material = (name: string, color: string, roughness = .88) => {
    const result = new THREE.MeshStandardMaterial({color, roughness});
    result.name = name; result.userData.setOwned = true; return result;
  };
  // Surface detail is deferred: continuous colors expose silhouette and staging.
  const m = {
    chair: material('warm upholstery', '#a26a50'), plaster: material('ivory plaster', '#dfd6be'),
    wood: material('aged timber', '#786044'), panel: material('green wainscot', '#7d9172'),
    paper: material('muted green wall', '#a5ae90'), floor: material('warm floor', '#ae9472'),
    kitchen: material('yellow kitchen wall', '#cdbb7c'), enamel: material('cream enamel', '#e1dfd1', .50),
    metal: material('stove iron', '#666b65', .54), glass: material('window light', '#a2b7b5', .42),
    blue: material('painted blue', '#748e98'), curtain: material('plain curtain', '#b5a27a'),
    black: material('deep charcoal', '#343933'), figure: material('felt', '#b1ada3'),
    ceiling: material('ceiling', '#bfc5ac'),
  };
  m.glass.userData.windowBaseColor = m.glass.color.clone();
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(roundedRoomOutline(HOUSE_FOOTPRINT)), m.floor);
  floor.name = 'set:house:floor'; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const {envelope, ceiling, opposite, wallSections} = buildArchitectureShapes(m, HOUSE_FOOTPRINT);
  envelope.name = 'set:house:wall-shell';
  const {fireplace, furnishings, chair} = buildLivingShapes(m);
  const readingTable = furnishings.getObjectByName('rounded low checkers table')!;
  const [tx, tz] = houseLocal(HOUSE_READING_TABLE.position); readingTable.position.set(tx, 0, tz);
  const {kitchen, prepTable, diningChairs, tableSurfaceY, seatY} = buildKitchenShapes(m);
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

  root.userData = {
    setElement: 'house_interior', revision: 'reviewed-wall-return-04', geometryVersion: 'integrated-interior-v1',
    description: 'Connected kitchen and living room from the reviewed cartoon shape study',
    wallSections, ceiling, cookingPot, windowMaterials: [m.glass], assetsReady: Promise.resolve(),
    anchors: {chair, prepTable, tableSurfaceY, diningSeatY: seatY, helper},
  };
  batchStaticGeometry(root);
  const warm = new THREE.PointLight(0xffe5bc, 28, 15, 2);
  warm.name = 'set:house:ceiling-light'; warm.position.set(-.7, 3.24, 1.15);
  warm.castShadow = true; warm.shadow.mapSize.set(1024, 1024); warm.shadow.camera.near = .1;
  warm.shadow.camera.far = 15; warm.shadow.bias = -.00015; warm.shadow.normalBias = .025; warm.shadow.radius = 3; root.add(warm);
  const kitchenLight = new THREE.PointLight(0xffe9cb, 13, 9, 2);
  kitchenLight.name = 'set:house:kitchen-light'; kitchenLight.position.set(-5.6, 3.12, 1.2); root.add(kitchenLight);
  const reading = new THREE.PointLight(0xffce8b, 2.2, 4, 2);
  reading.name = 'set:house:reading-light'; reading.position.set(1.8, 1.75, -.1); root.add(reading);
  updateHouseInterior(root, 0);
  root.visible = false;
  return root;
}
