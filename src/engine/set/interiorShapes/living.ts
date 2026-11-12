import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Production geometry ported from the reviewed interior shape study. No texture maps. */
export function buildLivingShapes(materials: Record<string, THREE.MeshStandardMaterial>) {
  const fireplace = new THREE.Group();
  fireplace.name = 'shaped fireplace';
  // The flue's back face meets the rear wall at Z -2.8. The lower masonry
  // and mantel extend back to that same plane; this is a wall-built fireplace.
  fireplace.position.set(-1.07, 0, -2.095);
  const furnishings = new THREE.Group();
  furnishings.name = 'shaped living room furniture';
  const chair = new THREE.Group();
  chair.name = 'curved reading chair and side tray';
  chair.position.set(.65, 0, -1.35);
  furnishings.add(chair);

  const mesh = (parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const item = new THREE.Mesh(geometry, material);
    item.name = name;
    item.position.set(x, y, z);
    item.castShadow = item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const block = (parent: THREE.Object3D, name: string, x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material, radius = .025) =>
    mesh(parent, name, radius > 0 ? new RoundedBoxGeometry(width, height, depth, 3, Math.min(radius, width / 2, height / 2, depth / 2)) : new THREE.BoxGeometry(width, height, depth), material, x, y, z);
  const extrude = (parent: THREE.Object3D, name: string, shape: THREE.Shape, depth: number, material: THREE.Material, z: number, bevel = .015) =>
    mesh(parent, name, new THREE.ExtrudeGeometry(shape, {depth, steps: 1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24}), material, 0, 0, z);
  const rod = (parent: THREE.Object3D, name: string, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, topRadius = radius) => {
    const axis = end.clone().sub(start);
    const item = mesh(parent, name, new THREE.CylinderGeometry(topRadius, radius, axis.length(), 16), material);
    item.position.copy(start).add(end).multiplyScalar(.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    return item;
  };

  // One genuinely hollow extruded body, not a dark rectangle pasted on a box.
  // Front is +Z. Its side cheeks and the underside of the arch run into the firebox.
  const body = new THREE.Shape();
  body.moveTo(-.635, .14);
  body.lineTo(-.635, 1.29);
  body.lineTo(.635, 1.29);
  body.lineTo(.635, .14);
  body.lineTo(.40, .14);
  body.lineTo(.40, .45);
  body.bezierCurveTo(.40, .61, .24, .73, 0, .73);
  body.bezierCurveTo(-.24, .73, -.40, .61, -.40, .45);
  body.lineTo(-.40, .14);
  body.closePath();
  extrude(fireplace, 'plaster cheeks and arched vault', body, 1.26, materials.plaster, -.70, .012);
  // Fill the rear masonry behind the recessed black firebox. Its side/top
  // surfaces sit inside the shell to avoid coincident exterior faces.
  block(fireplace, 'solid rear masonry to wall', 0, .715, -.54, 1.23, 1.12, .34, materials.plaster, .008);
  // The stripped-room reference (episode 26) puts the flue at about 60% of
  // hearth width. A narrower lower body also restores the gap beside the chair.
  block(fireplace, 'low projecting hearth', 0, .07, .05, 1.40, .14, 1.51, materials.plaster, .035);
  block(fireplace, 'firebox floor behind the opening', 0, .155, .065, .80, .035, 1.00, materials.black, .008);
  const back = new THREE.Shape();
  back.moveTo(-.40, .17); back.lineTo(.40, .17); back.lineTo(.40, .45);
  back.bezierCurveTo(.40, .61, .24, .73, 0, .73);
  back.bezierCurveTo(-.24, .73, -.40, .61, -.40, .45); back.closePath();
  extrude(fireplace, 'recessed firebox back', back, .045, materials.black, -.39, 0);
  // Dark reveals end behind the face, so the opening retains readable thickness.
  block(fireplace, 'left inner firebox reveal', -.396, .305, .045, .012, .31, .78, materials.black, 0);
  block(fireplace, 'right inner firebox reveal', .396, .305, .045, .012, .31, .78, materials.black, 0);
  const arch = new THREE.Shape();
  arch.moveTo(-.50, .45);
  arch.bezierCurveTo(-.50, .69, -.29, .90, 0, .90);
  arch.bezierCurveTo(.29, .90, .50, .69, .50, .45);
  arch.lineTo(.40, .45);
  arch.bezierCurveTo(.40, .61, .24, .73, 0, .73);
  arch.bezierCurveTo(-.24, .73, -.40, .61, -.40, .45);
  arch.closePath();
  const surround = materials.wood.clone();
  surround.color.lerp(materials.chair.color, .5);
  extrude(fireplace, 'plain raised arch surround', arch, .035, surround, .567, .005);
  block(fireplace, 'mantel lower lip', 0, 1.312, -.04, 1.32, .055, 1.33, materials.wood, .016);
  block(fireplace, 'thin projecting mantel', 0, 1.37, -.0225, 1.39, .075, 1.365, materials.wood, .028);
  block(fireplace, 'slender chimney breast', 0, 2.615, -.48, .83, 2.43, .45, materials.wood, .018);

  // The back is a padded volume with a gently bowed face, not a flat plaque.
  // Its superellipsoid contour gives broad flat-ish areas and soft shoulders.
  const paddedBack = (name: string, width: number, height: number, depth: number, centerY: number, centerZ: number, material: THREE.Material) => {
    const geometry = new THREE.SphereGeometry(1, 64, 40);
    const positions = geometry.getAttribute('position');
    const soft = (value: number) => Math.sign(value) * Math.pow(Math.abs(value), .36);
    for (let i = 0; i < positions.count; i++) {
      const sy = soft(positions.getY(i));
      const sx = soft(positions.getX(i));
      const sz = soft(positions.getZ(i));
      const taper = .94 + .06 * (sy + 1) / 2;
      positions.setXYZ(i, sx * width / 2 * taper, centerY + sy * height / 2,
        centerZ + sz * depth / 2 - .055 * sy + .035 * sx * sx);
    }
    geometry.computeVertexNormals();
    return mesh(chair, name, geometry, material);
  };
  // Rear-most geometry remains in front of the bookcase shelf fronts (-1.975).
  paddedBack('softly curved wooden back rim', 1.53, 1.30, .10, 1.075, -.485, materials.wood);
  paddedBack('convex reclining back cushion', 1.46, 1.26, .28, 1.075, -.385, materials.chair);
  block(chair, 'low wooden seat frame', 0, .295, .045, 1.39, .17, 1.19, materials.wood, .055);
  block(chair, 'single rounded seat cushion', 0, .43, .075, 1.31, .20, 1.13, materials.chair, .085);
  // Tapered feet and open space under the arms avoid a heavy club-chair mass.
  for (const x of [-.57, .57]) for (const z of [-.43, .48]) {
    const foot = rod(chair, 'splayed tapered chair foot', new THREE.Vector3(x * 1.06, .035, z * 1.08), new THREE.Vector3(x, .31, z), .055, materials.wood, .07);
    foot.position.y -= new THREE.Box3().setFromObject(foot).min.y;
  }
  for (const side of [-1, 1]) {
    // In the source the rolled arm continues into a filled upholstered cheek;
    // a tube with open air under it misreads the chair as bent tubular furniture.
    const cheek = new THREE.Shape();
    cheek.moveTo(-.43, .19);
    cheek.lineTo(-.43, .81);
    cheek.bezierCurveTo(-.22, .84, .04, .81, .27, .775);
    cheek.bezierCurveTo(.48, .75, .55, .71, .55, .63);
    cheek.bezierCurveTo(.55, .54, .46, .50, .445, .44);
    cheek.bezierCurveTo(.425, .36, .45, .26, .48, .19);
    cheek.closePath();
    const geometry = new THREE.ExtrudeGeometry(cheek, {depth: .16, steps: 1, bevelEnabled: true, bevelThickness: .035, bevelSize: .03, bevelSegments: 5, curveSegments: 24});
    geometry.rotateY(-Math.PI / 2);
    mesh(chair, 'padded side cheek with rolled front contour', geometry, materials.chair, side * .725 + .08, 0, 0);
    block(chair, 'wooden side frame lower rail', side * .725, .20, .025, .10, .075, .89, materials.wood, .02);
  }
  block(chair, 'thin rounded right hand book tray', 1.08, .765, .08, .48, .065, .77, materials.wood, .03);
  block(chair, 'lower right hand tray shelf', 1.08, .25, .08, .45, .055, .73, materials.wood, .02);
  for (const z of [-.20, .37]) rod(chair, 'slender tray upright', new THREE.Vector3(1.23, 0, z), new THREE.Vector3(1.23, .735, z), .026, materials.wood);

  const bookcase = new THREE.Group();
  bookcase.name = 'five bay solid bookcase';
  bookcase.position.set(1.60, 0, -2.37);
  furnishings.add(bookcase);
  block(bookcase, 'recessed case back', 0, 1.72, -.34, 2.35, 3.13, .07, materials.wood, .01);
  for (const x of [-1.18, 1.18]) {
    block(bookcase, 'substantial side stile', x, 1.715, 0, .16, 3.13, .70, materials.wood, .018);
    block(bookcase, 'front side lip', x, 1.715, .345, .17, 3.13, .07, materials.wood, .012);
  }
  block(bookcase, 'projecting low plinth', 0, .125, 0, 2.56, .19, .78, materials.wood, .026);
  block(bookcase, 'simple bookcase top cap', 0, 3.315, -.005, 2.55, .13, .77, materials.wood, .02);
  const shelfHeights = [.25, .85, 1.45, 2.05, 2.65];
  for (const y of shelfHeights) {
    block(bookcase, 'thick horizontal shelf', 0, y, .015, 2.28, .085, .69, materials.wood, .014);
    block(bookcase, 'shelf front edge', 0, y - .015, .36, 2.28, .095, .07, materials.wood, .01);
  }
  // A few generic, unlettered volumes establish shelf capacity and scale.
  // They are solid monochrome book shapes rather than finished asset detail.
  const bookMaterials = [materials.paper, materials.blue, materials.chair, materials.black].map(source => {
    const material = source.clone();
    material.color.lerp(materials.wood.color, .45);
    return material;
  });
  const bookHeights = [.40, .46, .43, .34, .47, .41, .49, .38];
  const bookWidths = [.12, .16, .11, .15, .12, .17, .13, .15];
  shelfHeights.forEach((shelfY, row) => {
    let x = -1.065;
    for (let index = 0; index < 6; index++) {
      const pattern = (index + row * 3) % bookHeights.length;
      const width = bookWidths[pattern], height = bookHeights[pattern];
      x += width / 2;
      block(bookcase, 'plain upright book volume', x, shelfY + .043 + height / 2, .10 + (index % 3) * .015, width, height, .38, bookMaterials[(index + row) % bookMaterials.length], .008);
      x += width / 2 + .017;
    }
    if (row % 2 === 0) {
      for (let index = 0; index < 3; index++) {
        const height = .40 + index * .025;
        const item = block(bookcase, 'slightly leaning right book volume', .70 + index * .15, shelfY + .043 + height / 2, .10, .12, height, .38, bookMaterials[(index + row + 1) % bookMaterials.length], .008);
        item.rotation.z = index === 0 ? -.16 : 0;
        item.position.y = shelfY + .043 + Math.cos(item.rotation.z) * height / 2 + Math.abs(Math.sin(item.rotation.z)) * .06;
      }
    } else {
      block(bookcase, 'horizontal book volume', .52, shelfY + .085, .11, .60, .085, .38, bookMaterials[row % bookMaterials.length], .008);
      const item = block(bookcase, 'leaning end volume', .94, shelfY + .25, .1, .13, .42, .38, bookMaterials[(row + 1) % bookMaterials.length], .008);
      item.rotation.z = -.17;
      item.position.y = shelfY + .043 + Math.cos(.17) * .21 + Math.sin(.17) * .065;
    }
  });

  // Empty inset panels show the gallery's silhouette, without inventing artwork.
  const frame = (x: number, y: number, width: number, height: number) => {
    const rail = .047;
    block(furnishings, 'blank inset gallery panel', x, y, -2.703, width - rail, height - rail, .025, materials.plaster, .003);
    for (const sign of [-1, 1]) {
      block(furnishings, 'vertical gallery frame rail', x + sign * (width - rail) / 2, y, -2.67, rail, height, .075, materials.wood, .006);
      block(furnishings, 'horizontal gallery frame rail', x, y + sign * (height - rail) / 2, -2.67, width - rail, rail, .075, materials.wood, .006);
    }
  };
  frame(-.05, 2.15, .71, 1.17);
  frame(-1.72, 2.12, .32, .72);
  frame(-.08, 3.09, .72, .38);
  frame(-1.72, 3.0, .32, .46);

  const table = new THREE.Group();
  table.name = 'rounded low checkers table';
  table.position.set(-.28, 0, -.22);
  furnishings.add(table);
  block(table, 'softly rounded table edge', 0, .645, 0, 1.96, .14, 1.45, materials.wood, .065);
  block(table, 'inset upper table surface', 0, .714, 0, 1.87, .045, 1.36, materials.wood, .022);
  block(table, 'square unmarked board mass', -.04, .760, 0, 1.265, .065, 1.265, materials.plaster, .018);
  for (const x of [-.77, .77]) for (const z of [-.49, .49]) {
    const leg = rod(table, 'tapered table leg', new THREE.Vector3(x * 1.07, .03, z * 1.08), new THREE.Vector3(x, .60, z), .045, materials.wood, .065);
    leg.position.y -= new THREE.Box3().setFromObject(leg).min.y;
  }
  for (const z of [-.51, .51]) block(table, 'long shallow table apron', 0, .535, z, 1.58, .13, .065, materials.wood, .012);
  for (const x of [-.79, .79]) block(table, 'short shallow table apron', x, .535, 0, .065, .13, 1.02, materials.wood, .012);

  return {fireplace, furnishings, chair};
}
