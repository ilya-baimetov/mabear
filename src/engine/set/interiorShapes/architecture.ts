import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Materials = Record<string, THREE.MeshStandardMaterial>;
type Point = [number, number];

function corners(points: number[][]) {
  return points.map((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const before = new THREE.Vector2(previous[0] - point[0], previous[1] - point[1]);
    const after = new THREE.Vector2(next[0] - point[0], next[1] - point[1]);
    const radius = Math.min(i === 5 || i === 6 ? .055 : .18, before.length() * .30, after.length() * .30);
    before.setLength(radius); after.setLength(radius);
    return {point: new THREE.Vector2(...point as Point), entry: new THREE.Vector2(point[0], point[1]).add(before), exit: new THREE.Vector2(point[0], point[1]).add(after)};
  });
}
export function roundedRoomOutline(points: number[][]) {
  const cs = corners(points); const shape = new THREE.Shape();
  shape.moveTo(cs[0].exit.x, -cs[0].exit.y);
  for (let i = 0; i < cs.length; i++) {
    const next = cs[(i + 1) % cs.length];
    shape.lineTo(next.entry.x, -next.entry.y);
    shape.quadraticCurveTo(next.point.x, -next.point.y, next.exit.x, -next.exit.y);
  }
  shape.closePath(); return shape;
}
export function buildArchitectureShapes(m: Materials, footprint: number[][]) {
  const envelope = new THREE.Group(); envelope.name = 'Softened room envelope';
  const nearWall = new THREE.Group(); nearWall.name = 'set:house:near-wall'; envelope.add(nearWall);
  const wallSections: THREE.Group[] = [];
  const ceiling = new THREE.Group(); ceiling.name = 'Ceiling masses';
  const opposite = new THREE.Group(); opposite.name = 'Curtain and entrance shapes';
  function mesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material); object.name = name; object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  }
  function rounded(parent: THREE.Object3D, name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radius = .04) {
    return mesh(parent, name, new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), material, x, y, z);
  }
  function tube(parent: THREE.Object3D, name: string, path: THREE.Vector3[], radius: number, material: THREE.Material) {
    return mesh(parent, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), Math.max(16, path.length * 3), radius, 8, false), material, 0, 0, 0);
  }
  function wallStrip(parent: THREE.Object3D, points: THREE.Vector2[], lower: number, upper: number, material: THREE.Material) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    let cumulativeArcLen = 0;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) cumulativeArcLen += points[i].distanceTo(points[i - 1]);
      const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
      const normal = new THREE.Vector2(-tangent.y, tangent.x);
      const u = cumulativeArcLen / 1.4;
      for (const y of [lower, upper]) {
        positions.push(points[i].x, y, points[i].y);
        normals.push(normal.x, 0, normal.y);
        uvs.push(u, (y - lower) / 1.4);
      }
      if (i < points.length - 1) {const b = i * 2; indices.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);}
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const faceMaterial = material.clone() as THREE.MeshStandardMaterial;
    faceMaterial.side = THREE.DoubleSide;
    faceMaterial.vertexColors = false;
    faceMaterial.userData.setOwned = true;
    return mesh(parent, 'Continuous curved wall face', geometry, faceMaterial, 0, 0, 0);
  }
  const cs = corners(footprint);
  for (let i = 0; i < cs.length; i++) {
    const next = cs[(i + 1) % cs.length];
    const arc = new THREE.QuadraticBezierCurve(next.entry, next.point, next.exit).getPoints(12);
    const path = [cs[i].exit, next.entry, ...arc.slice(1)];
    const isKitchen = i >= 1 && i <= 4;
    const parent = new THREE.Group(); parent.name = `set:house:wall-section:${i}`;
    parent.userData = {edge: i, start: [...footprint[i]], end: [...footprint[(i + 1) % footprint.length]], cuttable: i === 0 || i >= 8};
    (i === cs.length - 1 ? nearWall : envelope).add(parent); wallSections.push(parent);
    // The entry's separate jamb/header assembly provides a genuine open portal.
    if (i !== 9) {
      wallStrip(parent, path, 0, 1.16, isKitchen ? m.kitchen : m.panel);
      wallStrip(parent, path, 1.16, 3.84, isKitchen ? m.kitchen : m.paper);
      tube(parent, 'Low skirting profile', path.map(p => new THREE.Vector3(p.x, .075, p.y)), .045, m.wood);
      if (!isKitchen) tube(parent, 'Rounded wainscot cap', path.map(p => new THREE.Vector3(p.x, 1.175, p.y)), .045, m.plaster);
    }
    tube(ceiling, 'Soft ceiling edge', path.map(p => new THREE.Vector3(p.x, 3.72, p.y)), .13, m.ceiling);
  }
  // Episode26 at2:40 exposes a flat receding side wall, not a bulbous pier.
  // The front timber is distinct from the rear corner; later wallpaper curls
  // are intentionally excluded from the clean architecture.
  const front = footprint[5];
  rounded(envelope,'Foreground timber at flat return',front[0],1.92,front[1],.20,3.84,.20,m.wood,.025);
  const ceilingMaterial = m.ceiling.clone(); ceilingMaterial.side = THREE.DoubleSide; ceilingMaterial.userData.setOwned = true;
  const plane = mesh(ceiling, 'Ceiling plane', new THREE.ShapeGeometry(roundedRoomOutline(footprint)), ceilingMaterial, 0, 3.91, 0); plane.rotation.x = -Math.PI / 2;
  for (const z of [-1.05, 1.25]) rounded(ceiling, 'Heavy rounded beam', -.9, 3.72, z, 9.7, .23, .29, m.ceiling, .07);
  ceiling.traverse(object => {if (object instanceof THREE.Mesh) object.castShadow = false;});

  const curtain = new THREE.Group(); curtain.position.set(3.48, 0, -1.78); curtain.rotation.y = -.85; opposite.add(curtain);
  const drapePositions: number[] = [], drapeUvs: number[] = [], drapeIndices: number[] = [];
  const columns = 72, rows = 30;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const u = column / columns, v = row / rows;
    const hem = .40 + .028 * Math.sin(u * Math.PI * 6) + .025 * Math.cos(u * Math.PI * 2);
    const x = (u - .5) * (1.78 + .04 * (1 - v));
    const y = THREE.MathUtils.lerp(hem, 3.23, v);
    const z = .10 + Math.cos(u * Math.PI * 12) * (.048 + .018 * (1 - v));
    drapePositions.push(x, y, z);
    drapeUvs.push(u, v);
    if (row < rows && column < columns) {const a = row * (columns + 1) + column, b = a + columns + 1; drapeIndices.push(a, a + 1, b, a + 1, b + 1, b);}
  }
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.Float32BufferAttribute(drapePositions, 3));
  cloth.setAttribute('uv', new THREE.Float32BufferAttribute(drapeUvs, 2));
  cloth.setIndex(drapeIndices); cloth.computeVertexNormals();
  const clothMaterial = m.curtain.clone(); clothMaterial.side = THREE.DoubleSide; clothMaterial.userData.setOwned = true;
  mesh(curtain, 'Untextured hanging curtain', cloth, clothMaterial, 0, 0, 0);
  rounded(curtain, 'Curtain rail', 0, 3.27, .08, 1.95, .06, .06, m.wood, .02);

  const entry = new THREE.Group(); entry.position.set(3.37, 0, 2.57); entry.rotation.y = -2.10; opposite.add(entry);
  for (const x of [-1.24, 1.24]) rounded(entry, 'Blue doorway side wall', x, 1.92, -.07, .67, 3.84, .14, m.blue, .025);
  rounded(entry, 'Blue doorway header', 0, 3.43, -.07, 1.34, .82, .14, m.blue, .02);
  rounded(entry, 'Wall below entrance threshold', 0, .24, -.07, 1.34, .48, .14, m.wood, .02);
  const daylight = m.doorLandscape ?? m.glass;
  daylight.side = THREE.DoubleSide;
  daylight.userData.setOwned = true;
  const backdrop = mesh(entry, 'Neutral daylight beyond opening (not a garden model)', new THREE.PlaneGeometry(1.8, 2.65), daylight, 0, 1.81, -.30);
  backdrop.castShadow = false;
  for (const x of [-.98, .98]) rounded(entry, 'Rounded door jamb', x, 1.78, .04, .16, 2.64, .25, m.wood, .045);
  rounded(entry, 'Rounded door header', 0, 3.12, .04, 1.52, .18, .25, m.wood, .04);
  rounded(entry, 'Solid entrance landing foundation', 0, .12, .53, 2.60, .24, 1.10, m.wood, .035);
  rounded(entry, 'Thick entrance landing', 0, .35, .55, 2.67, .26, 1.16, m.wood, .08);
  function logStep(name: string, width: number, depth: number, height: number, baseY: number, back: number) {
    const outline = new THREE.Shape(); const half = width / 2;
    outline.moveTo(-half, 0); outline.lineTo(half, 0);
    outline.bezierCurveTo(half * 1.08, -depth * .55, half * .60, -depth, 0, -depth);
    outline.bezierCurveTo(-half * .60, -depth, -half * 1.08, -depth * .55, -half, 0);
    const geometry = new THREE.ExtrudeGeometry(outline, {depth: height - .035, bevelEnabled: true, bevelThickness: .0175, bevelSize: .025, bevelSegments: 3, curveSegments: 28, steps: 1});
    const step = mesh(entry, name, geometry, m.wood, 0, baseY + .0175, back); step.rotation.x = -Math.PI / 2; step.position.x = -.30; return step;
  }
  logStep('Lower broad log-slice step', 2.15, .94, .16, 0, 1.03);
  logStep('Upper broad log-slice step', 1.83, .69, .16, .16, .83);
  // The large felt boots distinguish the entrance grouping in the source frame.
  // Shape only: no fibers, stitches, branding or surface maps.
  const felt = m.figure.clone(); felt.color.set('#b7b3a7'); felt.userData.setOwned = true;
  for (const [x, z] of [[.93, .24], [1.04, .64]]) {
    const boot = new THREE.Group(); boot.position.set(x, .48, z); boot.rotation.y = -1.35; entry.add(boot);
    // Continuous foot-to-shaft silhouette: wide toes taper into the ankle and
    // open up again at the cuff. No sphere/cylinder seam or painted surface.
    const rings = [[.015,.14,.11,.29],[.075,.19,.10,.35],[.16,.19,.085,.35],
      [.24,.175,.04,.29],[.32,.15,-.035,.21],[.43,.145,-.075,.16],
      [.72,.155,-.075,.165],[1.02,.175,-.075,.18],[1.06,.18,-.075,.185]];
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = []; const segments = 40;
    for (const [y, rx, centerZ, rz] of rings) for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      vertices.push(Math.cos(angle) * rx, y, centerZ + Math.sin(angle) * rz);
      uvs.push(i / segments, y);
    }
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < segments; i++) {
      const a = r * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(boot, 'Continuous felt boot silhouette', geometry, felt);
    const rim = mesh(boot, 'Soft boot cuff', new THREE.TorusGeometry(.171,.012,8,40), felt, 0,1.055,-.075); rim.rotation.x = -Math.PI / 2;
    const opening = mesh(boot, 'Boot opening', new THREE.CircleGeometry(.16,32), m.black,0,1.035,-.075); opening.rotation.x = -Math.PI / 2;
  }
  return {envelope, nearWall, ceiling, opposite, wallSections};
}
