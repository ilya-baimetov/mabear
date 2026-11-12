import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {KITCHEN_CUPBOARD} from '../../../shared/interactiveObjects';

export interface KitchenShapes {
  kitchen: THREE.Group;
  prepTable: THREE.Group;
  diningChairs: THREE.Group[];
  tableSurfaceY: number;
  seatY: number;
}

/** Reviewed kitchen geometry: supplied flat materials and no texture maps.
 * Fixture anchors follow interior-blockout; proportions are visual estimates.
 * Returned groups are siblings, so the fixture view can hide table and chairs.
 */
export function buildKitchenShapes(materials: Record<string, THREE.MeshStandardMaterial>): KitchenShapes {
  const kitchen = new THREE.Group(); kitchen.name = 'set:house:kitchen';
  const prepTable = new THREE.Group(); prepTable.name = 'Turned-leg preparation table';
  const diningChairs: THREE.Group[] = [];
  const tableSurfaceY = 1.20;
  const seatY = .64;
  const wood = materials.wood;
  const enamel = materials.enamel;
  const metal = materials.metal;
  const dark = materials.black;

  function mesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry,
    material: THREE.Material, x = 0, y = 0, z = 0) {
    const result = new THREE.Mesh(geometry, material);
    result.name = name; result.position.set(x, y, z);
    result.castShadow = result.receiveShadow = true;
    parent.add(result); return result;
  }
  function box(parent: THREE.Object3D, name: string, x: number, y: number, z: number,
    w: number, h: number, d: number, material = wood, radius = 0) {
    const geometry = radius > 0
      ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d);
    return mesh(parent, name, geometry, material, x, y, z);
  }
  function group(parent: THREE.Object3D, name: string, x: number, z: number, angle = 0) {
    const result = new THREE.Group(); result.name = name;
    result.position.set(x, 0, z); result.rotation.y = angle; parent.add(result); return result;
  }
  function lathe(parent: THREE.Object3D, name: string, profile: number[][], material: THREE.Material,
    x = 0, y = 0, z = 0, segments = 40) {
    return mesh(parent, name, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments), material, x, y, z);
  }
  function tube(parent: THREE.Object3D, name: string, points: number[][], radius: number,
    material = metal, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
    return mesh(parent, name, new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 8, closed), material);
  }
  function beam(parent: THREE.Object3D, name: string, a: number[], b: number[], w: number, d = w) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const result = box(parent, name, 0, 0, 0, w, direction.length(), d, wood, .008);
    result.position.copy(start.add(end).multiplyScalar(.5));
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return result;
  }
  function knob(parent: THREE.Object3D, name: string, x: number, y: number, z: number, material = wood) {
    mesh(parent, name, new THREE.SphereGeometry(.035, 14, 8), material, x, y, z);
  }
  function panelDoor(parent: THREE.Object3D, name: string, x: number, y: number, z: number,
    width: number, height: number, knobSide: number) {
    const rail = Math.min(.075, width * .16);
    // Recess is geometric; all five pieces share the same untextured material.
    box(parent, `${name} recessed panel`, x, y, z - .028, width - rail * 2, height - rail * 2, .035, wood, .004);
    for (const dx of [-1, 1]) box(parent, `${name} stile`, x + dx * (width - rail) / 2, y, z,
      rail, height, .065, wood, .004);
    for (const dy of [-1, 1]) box(parent, `${name} rail`, x, y + dy * (height - rail) / 2, z,
      width - rail * 2, rail, .065, wood, .004);
    knob(parent, `${name} knob`, x + knobSide * (width / 2 - rail * .65), y + height * .05, z + .065);
  }

  // Pantry: thick frame, a cupboard above a genuinely open middle bay, and a
  // shorter enclosed base. The bay is deliberately empty at this shapes stage.
  const pantry = group(kitchen, 'Cupboard and open pantry bay', ...KITCHEN_CUPBOARD.local, Math.PI / 2);
  box(pantry, 'Pantry back', 0, 1.58, -.26, 1.91, 2.88, .07);
  for (const side of [-1, 1]) {
    box(pantry, 'Pantry side', side * .935, 1.58, .015, .095, 2.88, .62);
    box(pantry, 'Pantry front stile', side * .91, 1.58, .345, .12, 2.88, .075);
    for (const z of [-.20, .25]) box(pantry, 'Pantry foot', side * .86, .09, z, .13, .18, .15, wood, .014);
  }
  for (const y of [.18, 1.03, KITCHEN_CUPBOARD.shelfY-.0425, 3.00]) box(pantry, 'Pantry shelf and lintel', 0, y, .035, 1.91, .085, .65);
  box(pantry, 'Pantry crown', 0, 3.055, .035, 2.02, .085, .69, wood, .01);
  box(pantry, 'Pantry lower plinth', 0, .21, .065, 1.96, .12, .66);
  for (const side of [-1, 1]) {
    panelDoor(pantry, 'Pantry base door', side * .445, .62, .355, .86, .73, -side);
    if(side===1)panelDoor(pantry, 'Pantry upper door', side * .445, 2.54, .355, .86, .84, -side);
  }
  // Keep the left upper leaf as a distinct group through static mesh batching.
  const leaf=group(pantry,'object:kitchen_cupboard',KITCHEN_CUPBOARD.hingeX,KITCHEN_CUPBOARD.frontZ);
  panelDoor(leaf,'Interactive pantry door',.43,2.54,0,.86,.84,1);
  leaf.getObjectByName('Interactive pantry door knob')!.position.set(.79,2.24,.065);
  leaf.userData.open=0;
  box(pantry, 'Open bay intermediate shelf', 0, 1.58, -.035, 1.79, .055, .51);

  // Rounded refrigerator shoulder and lower corners are in the actual profile,
  // rather than an extra small cube on top of a rectangular cabinet.
  const fridge = group(kitchen, 'Rounded refrigerator', -5.59, -1.62, .59);
  box(fridge, 'Refrigerator shell', 0, 1.37, -.035, 1.10, 2.54, .92, enamel, .18);
  for (const x of [-.35, .35]) for (const z of [-.29, .27]) {
    box(fridge, 'Refrigerator foot', x, .075, z, .12, .15, .12, dark, .035);
  }
  function fridgeDoor(name: string, bottom: number, top: number, topRadius: number, bottomRadius: number) {
    const left = -.455, right = .455;
    const shape = new THREE.Shape();
    shape.moveTo(left + bottomRadius, bottom);
    shape.lineTo(right - bottomRadius, bottom);
    shape.quadraticCurveTo(right, bottom, right, bottom + bottomRadius);
    shape.lineTo(right, top - topRadius);
    shape.quadraticCurveTo(right, top, right - topRadius, top);
    shape.lineTo(left + topRadius, top);
    shape.quadraticCurveTo(left, top, left, top - topRadius);
    shape.lineTo(left, bottom + bottomRadius);
    shape.quadraticCurveTo(left, bottom, left + bottomRadius, bottom);
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: .025, steps: 1, curveSegments: 16,
      bevelEnabled: true, bevelSegments: 6, bevelSize: .065, bevelThickness: .065});
    mesh(fridge, name, geometry, enamel, 0, 0, .405);
  }
  // The sampled source supports one tall softened face. Avoid inventing a
  // contrasting freezer seam from the highlight crossing its upper shoulder.
  fridgeDoor('Continuous crowned refrigerator door', .235, 2.545, .20, .10);
  // A projecting lever and mounts give the characteristic long handle silhouette.
  box(fridge, 'Refrigerator handle upper mount', -.35, 1.57, .515, .12, .10, .09, metal, .024);
  box(fridge, 'Refrigerator handle lower mount', -.35, 1.18, .515, .065, .07, .065, metal, .018);
  tube(fridge, 'Refrigerator curved vertical handle', [[-.35, 1.61, .53], [-.35, 1.54, .59],
    [-.35, 1.31, .59], [-.35, 1.18, .55]], .029);

  const window = group(kitchen, 'Framed divided kitchen window', -4.50, -3.27, .367);
  box(window, 'Window glazing', 0, 2.27, .04, .82, 1.06, .025, materials.glass);
  for (const x of [-.445, .445]) box(window, 'Window outer jamb', x, 2.27, .105, .09, 1.26, .14);
  for (const y of [1.68, 2.86]) box(window, 'Window outer rail', 0, y, .105, .98, .09, .14);
  for (const x of [-.365, .365]) box(window, 'Window inset jamb', x, 2.27, .117, .035, 1.05, .065);
  box(window, 'Window vertical mullion', 0, 2.27, .13, .035, 1.06, .07);
  box(window, 'Window upper transom', 0, 2.49, .13, .77, .048, .07);
  box(window, 'Window sill', 0, 1.665, .18, 1.10, .075, .31, wood, .012);
  box(window, 'Window head casing', 0, 2.90, .11, 1.07, .075, .16, wood, .008);

  function counter(x: number, z: number, width: number, angle: number, doors: number) {
    const unit = group(kitchen, 'Framed base cabinet', x, z, angle);
    box(unit, 'Cabinet rear', 0, .66, -.285, width - .07, 1.08, .06);
    for (const side of [-1, 1]) {
      box(unit, 'Cabinet side', side * (width / 2 - .03), .66, .02, .06, 1.08, .66);
      for (const depth of [-.23, .26]) box(unit, 'Short cabinet foot', side * (width / 2 - .105), .105,
        depth, .12, .21, .12, wood, .012);
    }
    box(unit, 'Cabinet bottom', 0, .19, .02, width, .075, .66);
    box(unit, 'Cabinet front lower rail', 0, .22, .355, width, .09, .08);
    box(unit, 'Cabinet front upper rail', 0, 1.18, .355, width, .08, .08);
    const doorWidth = (width - .09) / doors;
    for (let i = 0; i < doors; i++) {
      panelDoor(unit, 'Cabinet door', (i - (doors - 1) / 2) * doorWidth, .705, .355,
        doorWidth - .016, .86, doors === 1 ? 1 : (i === 0 ? 1 : -1));
    }
    return unit;
  }
  counter(-4.52, -2.91, 1.24, .367, 2);
  counter(-3.57, -2.85, .85, -.94, 1);
  counter(-3.15, -2.24, .66, -.94, 2);
  // A single mitered worktop closes the corner. Three overlapping rectangular
  // boards produced coplanar patches and a dark triangular break in this view.
  const worktopOutline = new THREE.Shape();
  const worktopPoints = [[-5.264, -3.010], [-4.036, -3.482], [-3.552, -3.435],
    [-2.643, -2.156], [-3.280, -1.690], [-3.965, -2.662], [-4.979, -2.272]];
  worktopPoints.forEach(([x, z], index) => {
    if (index === 0) worktopOutline.moveTo(x, -z); else worktopOutline.lineTo(x, -z);
  });
  worktopOutline.closePath();
  const worktop = mesh(kitchen, 'Continuous wrapping worktop', new THREE.ExtrudeGeometry(worktopOutline,
    {depth: .084, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: .008, bevelThickness: .008}), wood,
    0, 1.228, 0);
  worktop.rotation.x = -Math.PI / 2;

  const stove = group(kitchen, 'Freestanding barrel stove', -2.93, -1.65);
  lathe(stove, 'Stove barrel with narrowed waist', [[0, .20], [.31, .20], [.35, .23], [.355, .28],
    [.335, .33], [.325, .47], [.328, .88], [.35, 1.07], [.38, 1.105], [.38, 1.16],
    [.335, 1.16], [.335, 1.10], [0, 1.10]], metal);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    tube(stove, 'Curved splayed stove foot', [[x * .22, .28, z * .22], [x * .29, .19, z * .29],
      [x * .31, .075, z * .30], [x * .35, .045, z * .32]], .045);
  }
  mesh(stove, 'Dark stove opening', new THREE.CylinderGeometry(.335, .335, .016, 32), dark, 0, 1.14, 0);
  for (const angle of [0, Math.PI / 2]) {
    const grate = box(stove, 'Stove pot support', 0, 1.185, 0, .66, .035, .045, dark, .008); grate.rotation.y = angle;
  }
  box(stove, 'Firebox door', 0, .69, .329, .29, .30, .055, metal, .025);
  box(stove, 'Firebox recessed face', 0, .69, .36, .225, .23, .018, dark, .014);
  box(stove, 'Firebox latch', .115, .69, .39, .12, .027, .026, metal, .008);
  box(stove, 'Lower air shutter', 0, .35, .333, .20, .065, .025, dark, .008);

  // Hollow pot: real inner wall and rolled lip, no lid or painted ornament.
  const pot = group(stove, 'Open enamel cooking pot', 0, 0);
  pot.position.y = 1.205;
  lathe(pot, 'Cooking pot bowl', [[0, 0], [.32, 0], [.385, .025], [.414, .075], [.418, .45],
    [.43, .47], [.43, .49], [.398, .49], [.394, .075], [.35, .045], [0, .045]], materials.blue);
  const lip = mesh(pot, 'Rolled pot rim', new THREE.TorusGeometry(.416, .016, 8, 48), metal, 0, .485, 0);
  lip.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) tube(pot, 'Pot loop handle', [[side * .40, .35, -.10], [side * .54, .35, -.10],
    [side * .56, .35, 0], [side * .54, .35, .10], [side * .40, .35, .10]], .026, materials.blue);

  for (const [x, y, z, radius] of [[-3.60, 2.50, -3.10, .28], [-3.23, 2.43, -2.60, .33], [-2.86, 2.51, -2.10, .24]]) {
    const pan = group(kitchen, 'Hanging bowl-shaped pan', x, z, -.94); pan.position.y = y;
    const bowl = lathe(pan, 'Pan bowl and lip', [[0, 0], [radius * .70, 0], [radius * .90, .024],
      [radius, .078], [radius, .090], [radius * .945, .090], [radius * .85, .041], [0, .024]], metal);
    bowl.rotation.x = Math.PI / 2;
    box(pan, 'Long pan handle', 0, radius + .13, .005, .048, .34, .035, metal, .012);
    mesh(pan, 'Pan handle hanging eye', new THREE.TorusGeometry(.027, .010, 6, 16), metal, 0, radius + .315, .005);
  }

  prepTable.position.set(-3.28, 0, .15);
  box(prepTable, 'Thick preparation tabletop', 0, tableSurfaceY - .08, 0, 2.55, .16, 1.62, wood, .018);
  box(prepTable, 'Tabletop under-edge', 0, 1.045, 0, 2.43, .07, 1.51, wood, .009);
  for (const z of [-.61, .61]) box(prepTable, 'Long table apron', 0, .925, z, 2.20, .24, .10, wood, .008);
  for (const x of [-1.04, 1.04]) box(prepTable, 'End table apron', x, .925, 0, .10, .24, 1.22, wood, .008);
  const legProfile = [[0, 0], [.045, 0], [.052, .08], [.085, .095], [.095, .115], [.08, .14],
    [.075, .20], [.09, .36], [.115, .54], [.125, .64], [.108, .70], [.065, .76],
    [.072, .795], [.115, .825], [.125, .86], [.107, .895], [.085, .92], [.115, .97], [.115, 1.035], [0, 1.035]];
  for (const x of [-1.03, 1.03]) for (const z of [-.59, .59]) {
    lathe(prepTable, 'Turned table leg', legProfile, wood, x, 0, z, 28);
    box(prepTable, 'Square leg shoulder', x, .99, z, .245, .10, .245, wood, .006);
  }

  for (const x of [-4.50, -2.10]) {
    const chair = new THREE.Group(); chair.name = 'Slatted wooden dining chair';
    chair.position.set(x, 0, -.83); diningChairs.push(chair);
    box(chair, 'Solid chair seat', 0, seatY - .055, 0, .67, .11, .65, wood, .015);
    for (const side of [-1, 1]) {
      beam(chair, 'Front chair leg', [side * .282, .025, .275], [side * .245, .59, .235], .075);
      beam(chair, 'Continuous rear chair post', [side * .285, .025, -.275], [side * .265, 1.60, -.36], .078);
      beam(chair, 'Side chair stretcher', [side * .267, .275, -.285], [side * .262, .275, .255], .055);
      box(chair, 'Seat side rail', side * .265, .51, 0, .075, .14, .57, wood, .006);
    }
    for (const z of [-.282, .255]) box(chair, 'Chair cross stretcher', 0, .265, z, .52, .06, .055, wood, .006);
    box(chair, 'Seat front rail', 0, .51, .255, .56, .14, .075, wood, .006);
    const upper = box(chair, 'Wide upper back slat', 0, 1.455, -.352, .61, .235, .075, wood, .012);
    upper.rotation.x = -.054;
    const lower = box(chair, 'Narrow lower back slat', 0, 1.025, -.329, .535, .085, .060, wood, .008);
    lower.rotation.x = -.054;
  }
  return {kitchen, prepTable, diningChairs, tableSurfaceY, seatY};
}
