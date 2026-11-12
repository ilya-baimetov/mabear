import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {buildArchitectureShapes, roundedRoomOutline} from './interior-shapes/architecture';
import {buildLivingShapes} from './interior-shapes/living';
import {buildKitchenShapes} from './interior-shapes/kitchen';

// A separate review model. Nothing here is imported by the game.
// Coordinates, angles and connections are proposals, never measured canon.
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e9e2');
const perspective = new THREE.PerspectiveCamera(43, 16 / 9, .05, 60);
const planCamera = new THREE.OrthographicCamera(-8.27, 8.27, 4.65, -4.65, .05, 60);
planCamera.up.set(0, 0, -1);
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
const controls = new OrbitControls(perspective, canvas);
controls.enableDamping = true;
controls.minDistance = .8;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * .49;
const color = (value: string) => new THREE.MeshStandardMaterial({color: value, roughness: 1});
const mat = {
  chair: color('#b77e6d'), plaster: color('#e3dbca'), wood: color('#716253'),
  panel: color('#7d9184'), paper: color('#aab39e'), floor: color('#b3a894'),
  kitchen: color('#d5c993'), enamel: color('#e5e0ce'), metal: color('#787b72'), glass: color('#a2b7b5'),
  blue: color('#748d9d'), curtain: color('#b7a08d'), black: color('#393d37'),
  figure: color('#b1ada3'), masha: color('#b3a0b3'), ceiling: color('#c5ccbc'),
};
const room = new THREE.Group(); scene.add(room);
const connectionMarks = new THREE.Group(); room.add(connectionMarks);
const planMarks = new THREE.Group(); room.add(planMarks);
function box(parent: THREE.Object3D, name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function oval(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, material = mat.figure) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
// Cartoon shots establish local adjacency, not a measured full-house plan.
// The rear return gives the shaped bookcase enough clearance at its right corner.
const kitchenOffset = new THREE.Vector3(-1.25, 0, 1.4);
const footprint = [[-7.05, 5.3], [-7.70, 2.65], [-7.50, -.1], [-6.35, -1.75], [-5.05, -2.25], [-3.80, -.55], [-3.40, -2.8], [3.02, -2.8], [4.1, -1.2], [4.1, 1.5], [2.75, 3.8]];
const floor = new THREE.Mesh(new THREE.ShapeGeometry(roundedRoomOutline(footprint)), mat.floor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
const {envelope, nearWall, ceiling, opposite} = buildArchitectureShapes(mat, footprint);
const {fireplace, furnishings} = buildLivingShapes(mat);
const {kitchen, prepTable, diningChairs, tableSurfaceY, seatY} = buildKitchenShapes(mat);
kitchen.add(prepTable, ...diningChairs); kitchen.position.copy(kitchenOffset);
room.add(envelope, ceiling, opposite, fireplace, furnishings, kitchen);
// A diagrammatic line crosses shared floor in front of the post; not a doorway.
const openPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-4.60, .03, 2.9), new THREE.Vector3(-3.35, .03, 2.9), new THREE.Vector3(-1.8, .03, 2.15), new THREE.Vector3(-.35, .03, 1.15)]);
const openLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(openPath.getPoints(30)), new THREE.LineDashedMaterial({color: '#277f79', dashSize: .13, gapSize: .08, depthTest: false}));
openLine.computeLineDistances(); openLine.renderOrder = 10; connectionMarks.add(openLine);

const seatedBear = new THREE.Group(); seatedBear.position.set(.65, 0, -1.20); seatedBear.rotation.y = -.78; room.add(seatedBear);
oval(seatedBear, 0, 1.09, 0, .71, .73, .53);
oval(seatedBear, 0, 1.90, .03, .39, .36, .33);
for (const x of [-.30, .30]) oval(seatedBear, x, 2.14, 0, .14, .14, .11);
oval(seatedBear, 0, 1.78, .30, .29, .18, .20);
for (const x of [-.66, .66]) oval(seatedBear, x, .91, .13, .20, .39, .20);
for (const x of [-.33, .33]) oval(seatedBear, x, .29, .53, .26, .25, .31);
const floorBear = new THREE.Group(); floorBear.position.set(.65, 0, 2.30); floorBear.rotation.y = -2.89; room.add(floorBear);
const leaningBody = oval(floorBear, 0, 1.0, 0, .73, .91, .62); leaningBody.rotation.x = .43;
oval(floorBear, 0, 1.65, .56, .42, .39, .37);
for (const x of [-.32, .32]) oval(floorBear, x, 1.91, .49, .15, .15, .12);
oval(floorBear, 0, 1.51, .87, .30, .21, .24);
for (const x of [-.62, .62]) oval(floorBear, x * .7, .21, .12, .32, .20, .42);
oval(floorBear, .62, .70, .51, .23, .57, .25);
oval(floorBear, .62, .11, .67, .25, .11, .30);
const reachingArm = oval(floorBear, -.58, .90, .58, .23, .42, .25); reachingArm.rotation.x = -.55;
oval(floorBear, -.58, .61, .90, .24, .18, .23);
const masha = new THREE.Group(); masha.position.set(.35, 0, 1.15); room.add(masha);
oval(masha, 0, .44, 0, .15, .24, .13, mat.masha);
oval(masha, 0, .75, 0, .19, .20, .17, mat.masha);
for (const x of [-.11, .11]) { oval(masha, x, .14, .025, .065, .14, .07, mat.masha); oval(masha, x * 1.65, .45, 0, .06, .16, .06, mat.masha); }

for (const x of [-.11, .11]) oval(masha, x, .045, .045, .075, .045, .12, mat.masha);

const kitchenMasha = masha.clone(); kitchenMasha.position.set(-3.40, tableSurfaceY, .10).add(kitchenOffset); room.add(kitchenMasha);
const seatedSmallActor = masha.clone(); seatedSmallActor.position.set(-2.10, seatY, -.83).add(kitchenOffset); room.add(seatedSmallActor);

// Dashed perimeter = proposed topology. Solid furniture masses = observed clusters.
const outline = new THREE.BufferGeometry().setFromPoints([...footprint, footprint[0]].map(([x, z]) => new THREE.Vector3(x, .34, z)));
const perimeter = new THREE.Line(outline, new THREE.LineDashedMaterial({color: '#b76a2a', dashSize: .15, gapSize: .1, depthTest: false})); perimeter.computeLineDistances(); perimeter.renderOrder = 10; planMarks.add(perimeter);
const zone = box(planMarks, 'open acting floor', -.7, .015, 1.15, 4.8, .012, 1.20, new THREE.MeshBasicMaterial({color: '#9aaea0', transparent: true, opacity: .3, depthWrite: false})); zone.castShadow = false;

const sun = new THREE.DirectionalLight('#fff3da', 2.0);
sun.position.set(-3.3, 6, 2.0); sun.target.position.set(.5, 0, -2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: .1, far: 25});
sun.shadow.normalBias = .025; sun.shadow.bias = -.0001;
scene.add(sun, sun.target, new THREE.HemisphereLight('#e1e7ed', '#8b8376', 1.8), new THREE.AmbientLight('#fff9e9', 1.0));

const views = {
  connection: {number: '1', pos: [-.4, 5.2, 7.4], look: [-2.85, .8, .8], fov: 55, ref: 'macro', file: 'episode24-112_8s-kitchen-fireplace.jpg', seconds: 112, time: '1:52.8', episode: '24', url: 'p84nSJl2iNI', title: 'Kitchen ↔ fireplace', note: 'The prep table, yellow pan wall and fireplace/gallery are visible together in one cartoon shot. The blockout keeps a timber return but leaves the foreground floor open between cooking and living areas. Use Overview to inspect the shared floor and proposed route around the table. Exact angles and the movable table position are proposed.', decision: 'Does the open connection beside the stove and fireplace read correctly?', referenceNote: 'Direct evidence: kitchen wall and fireplace share this frame.'},
  kitchen: {number: '2', pos: [-5.60, 2.18, 2.90], look: [-5.43, 1.35, -1.08], fov: 56, ref: 'macro', file: 'episode17-340s-kitchen-wide.png', seconds: 340, time: '5:40', episode: '17', url: 'qBp1rCz_yQU', title: 'Wrapping kitchen', note: 'Pantry and fridge on the left; window and counters wrap around the nook; cylindrical stove at the fireplace end. The movable prep table and chairs are hidden in this fixture view; the pot is hidden only in Reference angle to match the empty stove in this shot; the connected plan shows its position. The reference is after the porridge spill; the mess is not being reproduced.', decision: 'Compare the rounded fridge, cabinet height, stove and pot proportions.', referenceNote: 'Wide view establishes the fixture order across several wall planes.'},
  corner: {number: '3', pos: [-.50, 1.92, 1.62], look: [.40, 1.17, -1.40], fov: 43, ref: 'episode', file: 'episode17-95s.jpg', seconds: 95, time: '1:35', episode: '17', url: 'qBp1rCz_yQU', title: 'Reading corner', note: 'Fireplace, broad seated Bear, nearby bookcase and low table remain a compact group. The curtain now follows the bookcase around the room, as shown in episode 17 at 5:45 and episode 24 at 1:17.8.', decision: 'Compare the chair silhouette, arched hearth and furniture scale.', referenceNote: 'Local furniture relationship; other shots establish the adjacent curtain.'},
  opposite: {number: '4', pos: [-2.50, 2.30, 2.45], look: [2.70, .90, .70], fov: 64, ref: 'macro', file: 'episode17-250s-entry.png', seconds: 250, time: '4:10', episode: '17', url: 'qBp1rCz_yQU', title: 'Curtain & raised entry', note: 'The curtain follows the bookcase, beside the blue entrance area. Episode 17 at 4:10 resolves the entrance as a raised platform with short log steps. Episode 26 also reveals a separate tall stair flight near the entrance; its route and upper destination are not yet modeled. The curtain’s destination remains unknown.', decision: 'Compare the wide shallow steps and landing; use Overview for the curtain.', referenceNote: 'Two broad log-slice steps, a thick landing and oversized felt boots.'},
  architecture: {number: '5', pos: [.8, 3.5, 5.8], look: [-2.3, 1.3, -1.4], fov: 56, ref: 'macro', file: 'episode26-160s-bare-return.png', seconds: 160, time: '2:40', episode: '26', url: 'lzDDCCQuuVA', title: 'Bare wall return', note: 'The pre-wallpaper shot resolves the return as a flat side wall between a foreground timber and a rear corner. The modeled front moves farther left and toward the acting floor; the fireplace stays against the recessed rear wall. Kitchen fixtures shift together, preserving access around the front end. Exact distances are inferred, not measured.', decision: 'Compare the front timber, receding wall plane, rear corner and clear wall beside the fireplace.', referenceNote: 'Permanent geometry is visible before wallpapering. Soot and damage are not reproduced.'},
  reveal: {number: '6', pos: [.8, 3.5, 5.8], look: [-2.3, 1.3, -1.4], fov: 56, ref: 'macro', file: 'episode26-343s-recess-both-returns.png', seconds: 343, time: '5:43', episode: '26', url: 'lzDDCCQuuVA', title: 'Fireplace recess', note: 'The same recess after wallpapering. The bright floral sheet curls outward and down to the floor; that temporary bulge must not become a structural column. Compare the floor and ceiling junctions with the bare-wall view. The right side of the room and stair route remain provisional.', decision: 'Judge the setback and rear-wall gap; ignore the loose wallpaper silhouette.', referenceNote: 'Temporary wallpaper exaggerates the left silhouette. The clean model omits it.'},
  plan: {number: '', pos: [-1.60, 12, 1.25], look: [-1.60, 0, 1.25], fov: 43, ref: 'macro', file: 'episode24-112_8s-kitchen-fireplace.jpg', seconds: 112, time: '', episode: '', url: '', title: 'Connected plan', note: 'Observed local order: cooking zone → fireplace/gallery → chair/bookcase → curtain → raised blue entry. The dashed perimeter, exact angles and table placement remain proposals. Teal dashes show the open floor connection. Arrows show overview directions; long camera distances are compressed in plan.', decision: 'Does the connected layout give the kitchen and living area useful staging space?', referenceNote: ''},
} as const;
type View = keyof typeof views;
let selected: View = 'connection';
let figuresOn = false;
let cameraMode: 'reference' | 'overview' = 'reference';
// Approximate the source's viewing direction and height, not an exact lens solve.
const referenceCameras = {
  connection: {pos: [-3.6, 2.0, 4.8], look: [-2.9, 1.9, -.6], fov: 44},
  kitchen: {pos: [-5.50, 1.90, 2.50], look: [-5.70, 1.45, -.90], fov: 67},
  corner: {pos: [-.25, 2.10, 3.25], look: [.35, 1.30, -1.35], fov: 38},
  opposite: {pos: [.15, 1.05, .62], look: [2.84, .76, 2.30], fov: 44},
  architecture: {pos: [.3, 1.1, 6.6], look: [-.6, 2.15, -2.3], fov: 40},
  reveal: {pos: [.7, 1.85, 7.2], look: [-.2, 1.85, -2.5], fov: 43},
} as const;
const labels: [string, number, number][] = [['Pantry / fridge', -6.90, .60], ['Window / counters', -5.60, -1.25], ['Stove', -4.19, -.20], ['Prep table', -4.53, 1.55], ['Open connection', -2.6, 2.7], ['Front timber', -3.80, -.55], ['Rear corner', -3.40, -2.8], ['Fireplace', -1.05, -2.20], ['Chair / bookcase', 1.35, -1.15], ['Curtain · unknown beyond', 3.55, -1.75], ['Raised entry / short steps', 3.10, 2.50]];
// Direction markers, with long camera distances compressed to the plan edge.
// Views5/6 share an overview angle and therefore share one marker.
const cameraMarkers = Object.values(views).filter(view => view.number && view.number !== '6').map(view => ({
  label: view.number === '5' ? '5/6' : view.number,
  x: view.pos[0], z: Math.min(view.pos[2],4.6), view,
}));
for (const marker of cameraMarkers) labels.push([marker.label,marker.x,marker.z]);
const labelLayer = document.querySelector('#plan-labels')!;
for (const [text] of labels) { const label = document.createElement('span'); label.textContent = text; if (/^[1-6](\/[1-6])?$/.test(text)) label.className = 'camera-marker'; labelLayer.append(label); }
for (const {view,x,z} of cameraMarkers) {
  const origin = new THREE.Vector3(x,.45,z);
  const direction = new THREE.Vector3(view.look[0]-view.pos[0],0,view.look[2]-view.pos[2]).normalize();
  const arrow = new THREE.ArrowHelper(direction,origin,.70,'#425c80',.20,.13);
  arrow.traverse(object => { const drawable = object as THREE.Mesh; if (drawable.material) { const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material]; materials.forEach(material => { material.depthTest = false; }); object.renderOrder = 11; } });
  planMarks.add(arrow);
}
function updateLabels() {
  labels.forEach(([, x, z], i) => { const v = new THREE.Vector3(x, .15, z).project(planCamera); const e = labelLayer.children[i] as HTMLElement; e.style.left = `${(v.x + 1) * 50}%`; e.style.top = `${(1 - v.y) * 50}%`; });
}
function updateFigures() {
  seatedBear.visible = figuresOn && (selected === 'corner' || selected === 'plan');
  floorBear.visible = figuresOn && selected === 'opposite';
  masha.visible = figuresOn && (selected === 'opposite' || selected === 'plan');
  kitchenMasha.visible = figuresOn && selected === 'connection';
  seatedSmallActor.visible = figuresOn && selected === 'connection';
}
function setView(key: View) {
  selected = key; const view = views[key]; const isPlan = key === 'plan'; const shellOnly = key === 'architecture' || key === 'reveal';
  // Consume residual orbit damping before applying a preset or reset.
  controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  camera = isPlan ? planCamera : perspective;
  controls.enabled = !isPlan;
  controls.enableRotate = !isPlan;
  if (isPlan) { planCamera.position.fromArray(view.pos); planCamera.lookAt(view.look[0], view.look[1], view.look[2]); planCamera.updateMatrixWorld(); }
  else { const preset = cameraMode === 'reference' ? referenceCameras[key as Exclude<View, 'plan'>] : view; perspective.position.fromArray(preset.pos); perspective.fov = preset.fov; controls.target.fromArray(preset.look); perspective.updateProjectionMatrix(); controls.update(); }
  nearWall.visible = isPlan;
  ceiling.visible = shellOnly;
  furnishings.visible = !shellOnly;
  opposite.visible = !shellOnly;
  kitchen.visible = !shellOnly;
  prepTable.visible = key !== 'kitchen';
  kitchen.getObjectByName('Open enamel cooking pot')!.visible = key !== 'kitchen' || cameraMode === 'overview';
  diningChairs.forEach(chair => { chair.visible = key !== 'kitchen'; });
  connectionMarks.visible = isPlan || (key === 'connection' && cameraMode === 'overview');
  renderer.shadowMap.enabled = !isPlan;
  // In plan all walls remain as low cutaway masses so footprints stay readable.
  envelope.scale.y = isPlan ? .08 : 1;
  planMarks.visible = isPlan;
  updateFigures(); updateLabels();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === key)));
  document.querySelector('#plan-labels')!.toggleAttribute('hidden', !isPlan);
  document.querySelector('#camera-key')!.toggleAttribute('hidden', !isPlan);
  document.querySelector('#reference-collage')!.toggleAttribute('hidden', !isPlan);
  document.querySelector('#reference')!.toggleAttribute('hidden', isPlan);
  const ref = document.querySelector<HTMLImageElement>('#reference')!;
  const prefix = view.ref === 'macro' ? document.documentElement.dataset.macro! : document.documentElement.dataset.references!;
  ref.src = prefix + view.file;
  ref.alt = `${view.title}: official cartoon reference`;
  document.querySelector('#reference-title')!.textContent = isPlan ? 'Observed connections — four source views' : `Cartoon · episode ${view.episode} · ${view.time}`;
  document.querySelector('#render-title')!.textContent = `Shapes · ${view.title.toLowerCase()}`;
  const source = document.querySelector<HTMLAnchorElement>('#source')!;
  source.hidden = isPlan; source.href = `https://www.youtube.com/watch?v=${view.url}&t=${view.seconds}s`;
  document.querySelector('#reference-note')!.textContent = isPlan ? 'Local adjacencies are observed; the complete perimeter and dimensions are inferred.' : view.referenceNote;
  document.querySelector('#view-note')!.textContent = view.note;
  document.querySelector('#decision')!.textContent = view.decision;
  document.querySelector('#render-hint')!.textContent = isPlan ? 'Cutaway · proposed connections' : 'Drag to orbit · scroll to zoom';
  document.querySelector<HTMLSelectElement>('#camera-mode')!.disabled = isPlan;
  document.querySelector('#camera-caption')!.textContent = isPlan ? 'Connected plan · dimensions remain proposed.' : cameraMode === 'reference' ? 'Approximate reference angle · plain geometry, no textures.' : 'Inspection overview · plain geometry, no textures.';
  document.querySelector<HTMLInputElement>('#scale')!.disabled = shellOnly;
  document.querySelector('#scale-label')!.classList.toggle('inactive', shellOnly);
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view as View));
document.querySelector<HTMLSelectElement>('#camera-mode')!.onchange = e => {cameraMode = (e.target as HTMLSelectElement).value as typeof cameraMode; setView(selected);};
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => setView(selected);
document.querySelector<HTMLInputElement>('#scale')!.onchange = e => { figuresOn = (e.target as HTMLInputElement).checked; updateFigures(); };
const resize = () => {
  const width = canvas.parentElement!.clientWidth;
  renderer.setSize(width, width * 9 / 16);
  perspective.aspect = 16 / 9; perspective.updateProjectionMatrix(); updateLabels();
};
new ResizeObserver(resize).observe(canvas.parentElement!); resize(); setView('architecture');
renderer.setAnimationLoop(() => { if (controls.enabled) controls.update(); renderer.render(scene, camera); });
(window as any).__interiorBlockout = {setView, snapshot: () => {renderer.render(scene, camera); return canvas.toDataURL();}, get camera() {return camera;}, controls, scene, get view() {return selected;}, get cameraMode() {return cameraMode;}};
