// Static world colliders for Rapier replay (zero Three.js, zero bearsYard imports).
import RAPIER from '@dimforge/rapier3d-compat';
import { COOKING_STATION } from '../../shared/cookingStation';
import {
  HOUSE_COOKING_HELPER,
  HOUSE_FOOTPRINT,
  HOUSE_KITCHEN_OFFSET,
  HOUSE_PREP_TABLE,
  HOUSE_READING_TABLE,
  houseWorld,
} from '../../shared/houseLayout';
import { HOUSE_DOOR, KITCHEN_CUPBOARD } from '../../shared/interactiveObjects';
import { POND_PIER_START } from '../../shared/pond';
import {
  PIER_HEIGHT,
  POND_BENCH_SPEC,
  POND_STUMP_SPEC,
  PORCH_HEIGHT,
  WOLVES_CRATES_SPEC,
  WOLVES_LOGS_SPEC,
  WOLVES_VAN_SPEC,
  YARD_BENCH_SPEC,
  YARD_BRIDGES_SPEC,
  YARD_HAMMOCK_SPEC,
  YARD_SAMOVAR_SPEC,
  YARD_TABLE_SPEC,
  bridgeDeckY,
} from '../../shared/yardLayout';
import type { Quat } from '../api';
import { qeuler } from '../motion/blend';
import {
  STATIC_GROUP,
  createPropColliderDesc,
} from './propProfiles';

export {
  BALL_RADIUS,
  MASHA_RADIUS,
  MASHA_HALF_HEIGHT,
  SKIN,
  MASHA_CENTER,
  STATIC_GROUP,
  MASHA_GROUP,
  BALL_GROUP,
  ACTOR_BLOCKER_GROUP,
  PROP_GROUP,
  actorBlockerBit,
  actorBlockerGroup,
  propGroupExcludingActor,
  type PropColliderProfile,
  PROP_COLLIDER_PROFILES,
  createPropColliderDesc,
} from './propProfiles';

function qfromEuler(x: number, y: number, z: number, order: 'XYZ' | 'YXZ' = 'YXZ'): Quat {
  if (order === 'XYZ') return qeuler(x, y, z);
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

function makeStaticBuilder(world: RAPIER.World) {
  const add = (desc: RAPIER.ColliderDesc) =>
    world.createCollider(desc.setCollisionGroups(STATIC_GROUP).setFriction(0.8));
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    add(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  const rotBox = (
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    rx: number,
    ry: number,
    rz: number,
    order: 'XYZ' | 'YXZ' = 'YXZ',
  ) => {
    const q = qfromEuler(rx, ry, rz, order);
    return add(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }),
    );
  };
  const cyl = (x: number, y: number, z: number, hh: number, r: number) =>
    add(RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y, z));
  const rotCyl = (
    x: number,
    y: number,
    z: number,
    hh: number,
    r: number,
    rx: number,
    ry: number,
    rz: number,
    order: 'XYZ' | 'YXZ' = 'XYZ',
  ) => {
    const q = qfromEuler(rx, ry, rz, order);
    return add(
      RAPIER.ColliderDesc.cylinder(hh, r)
        .setTranslation(x, y, z)
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }),
    );
  };
  return { add, box, rotBox, cyl, rotCyl };
}

/** Central bounded yard colliders (preserved intact for rapierReplay.test.ts). Returns the ground collider. */
export function createYardColliders(world: RAPIER.World): RAPIER.Collider {
  const { add, box } = makeStaticBuilder(world);
  // groundY is identically zero throughout this bounded yard.
  const ground = box(0, -0.2, 0, 19, 0.2, 19);
  // Round table: top, pedestal and cross feet. The capsule hits the top's rim.
  add(
    RAPIER.ColliderDesc.cylinder(0.035, YARD_TABLE_SPEC.colliderRadius).setTranslation(
      YARD_TABLE_SPEC.pos[0],
      YARD_TABLE_SPEC.top - 0.035,
      YARD_TABLE_SPEC.pos[1],
    ),
  );
  add(RAPIER.ColliderDesc.cylinder(0.355, 0.1).setTranslation(YARD_TABLE_SPEC.pos[0], 0.355, YARD_TABLE_SPEC.pos[1]));
  box(YARD_TABLE_SPEC.pos[0], 0.035, YARD_TABLE_SPEC.pos[1], 0.5, 0.035, 0.1);
  box(YARD_TABLE_SPEC.pos[0], 0.035, YARD_TABLE_SPEC.pos[1], 0.1, 0.035, 0.5);
  // Bench seat and two log supports, matching buildBench's nominal dimensions.
  box(
    YARD_BENCH_SPEC.pos[0],
    YARD_BENCH_SPEC.centerY,
    YARD_BENCH_SPEC.pos[1],
    YARD_BENCH_SPEC.width / 2,
    YARD_BENCH_SPEC.thickness / 2,
    YARD_BENCH_SPEC.depth / 2,
  );
  for (const x of YARD_BENCH_SPEC.legXs) {
    add(
      RAPIER.ColliderDesc.cylinder(YARD_BENCH_SPEC.legHeight / 2, 0.17).setTranslation(
        x,
        YARD_BENCH_SPEC.legHeight / 2,
        YARD_BENCH_SPEC.pos[1],
      ),
    );
  }
  const s = COOKING_STATION;
  box(s.position[0], s.top / 2, (s.topBack + s.topFront) / 2, s.width / 2, s.top / 2, (s.topFront - s.topBack) / 2);
  box(
    s.position[0],
    s.stepTop / 2,
    (s.stepBack + s.topBack) / 2,
    s.width / 2,
    s.stepTop / 2,
    (s.topBack - s.stepBack) / 2,
  );
  return ground;
}

function addFullYardColliders(world: RAPIER.World): void {
  const { box, rotBox, cyl } = makeStaticBuilder(world);

  // Outer ground aprons beyond [-19, 19] so far throws never fall through the floor.
  box(0, -0.2, -33.5, 48, 0.2, 14.5);
  box(0, -0.2, 33.5, 48, 0.2, 14.5);
  box(-33.5, -0.2, 0, 14.5, 0.2, 19);
  box(33.5, -0.2, 0, 14.5, 0.2, 19);

  // Brass samovar resting on the round table (y = 0.78..1.25).
  cyl(
    YARD_SAMOVAR_SPEC.pos[0],
    YARD_SAMOVAR_SPEC.baseY + 0.23,
    YARD_SAMOVAR_SPEC.pos[1],
    0.23,
    YARD_SAMOVAR_SPEC.radius,
  );

  // Bear's house exterior (pos [-6, 0, -6.4], W=6.4, D=4.8).
  // Trim the north-west back corner (-9.2..-7.85, -8.8..-8.55) so it does not intersect the interior stage room.
  box(-5.325, 3.135, -6.4, 2.525, 3.135, 2.4);
  box(-8.525, 3.135, -6.275, 0.675, 3.135, 2.275);
  const half = 3.8;
  const rise = 2.4;
  const wallTop = 6.27;
  const slope = Math.atan2(rise, half);
  const slant = Math.hypot(half, rise);
  for (const side of [-1, 1]) {
    rotBox(-6 + (side * half) / 2, wallTop + rise / 2, -6.4, slant / 2, 0.08, 3.05, 0, 0, -side * slope);
  }
  // Porch deck (y = 0.32), two front steps, posts, and canopy.
  box(-6, PORCH_HEIGHT / 2, -3.0, 2.4, PORCH_HEIGHT / 2, 1.0);
  box(-6, 0.1065, -1.85, 2.4, 0.1065, 0.15);
  box(-6, 0.0535, -1.55, 2.4, 0.0535, 0.15);
  for (const s of [-1, 1]) cyl(-6 + s * 2.25, 1.82, -2.15, 1.5, 0.1);
  const cSlope = Math.atan2(0.45, 2.35);
  rotBox(-6, 3.57, -2.825, 2.6, 0.05, 1.25, cSlope, 0, 0);

  // Raised garden beds & back picket fence.
  for (const dz of [-1.2, 0, 1.2]) box(5.4, 0.07, -7.1 + dz, 2.225, 0.07, 0.44);
  box(5.4, 0.35, -9.05, 2.6, 0.35, 0.05);

  // Beehive on stump.
  cyl(10.2, 0.25, -9.1, 0.25, 0.45);
  box(10.2, 0.85, -9.1, 0.32, 0.35, 0.27);

  // Oak swing trunk & resting seat.
  cyl(8.6, 1.9, -0.6, 1.9, 0.42);
  box(8.0, 0.45, 2.0, 0.39, 0.03, 0.15);

  // Hammock between two rotated pines.
  const [hx, hz] = YARD_HAMMOCK_SPEC.center;
  const hc = Math.cos(YARD_HAMMOCK_SPEC.rotY);
  const hs = Math.sin(YARD_HAMMOCK_SPEC.rotY);
  cyl(hx - YARD_HAMMOCK_SPEC.trunkSpan * hc, 2.0, hz + YARD_HAMMOCK_SPEC.trunkSpan * hs, 2.0, 0.28);
  cyl(hx + YARD_HAMMOCK_SPEC.trunkSpan * hc, 2.0, hz - YARD_HAMMOCK_SPEC.trunkSpan * hs, 2.0, 0.3);
  rotBox(hx, YARD_HAMMOCK_SPEC.seatY, hz, 1.5, 0.04, 0.45, 0, YARD_HAMMOCK_SPEC.rotY, 0);

  // Woodpile & chopping stump.
  box(-12.2, 0.425, -6.4, 0.88, 0.425, 0.5);
  cyl(-13.4, 0.225, -4.6, 0.225, 0.32);

  // Big pine & round bush.
  cyl(-2, 2.5, -10.6, 2.5, 0.42);
  cyl(6, 0.6, 7.6, 0.6, 0.8);

  // Arched creek bridges (footbridge & path_bridge).
  for (const br of YARD_BRIDGES_SPEC) {
    const bc = Math.cos(br.rotY);
    const bs = Math.sin(br.rotY);
    const n = 10;
    const plankW = 2.7 / n;
    for (let i = 0; i < n; i++) {
      const lx = -1.35 + (i + 0.5) * plankW;
      const ly = bridgeDeckY(lx) - 0.03;
      const slopeZ = Math.atan(-0.2 * (Math.PI / 2.8) * Math.sin((Math.PI * lx) / 2.8));
      const wx = br.pos[0] + lx * bc;
      const wz = br.pos[1] - lx * bs;
      rotBox(wx, ly, wz, plankW / 2, 0.03, br.width / 2, 0, br.rotY, slopeZ);
    }
  }
}

function addHouseInteriorColliders(world: RAPIER.World): void {
  const { box, rotBox, cyl } = makeStaticBuilder(world);
  const hw = (lx: number, lz: number): [number, number] => houseWorld([lx, lz]);

  // 11 perimeter walls around HOUSE_FOOTPRINT (pushed outward by half thickness 0.10 m).
  for (let i = 0; i < HOUSE_FOOTPRINT.length; i++) {
    const a = hw(HOUSE_FOOTPRINT[i][0], HOUSE_FOOTPRINT[i][1]);
    const b = hw(HOUSE_FOOTPRINT[(i + 1) % HOUSE_FOOTPRINT.length][0], HOUSE_FOOTPRINT[(i + 1) % HOUSE_FOOTPRINT.length][1]);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = dz / len;
    const nz = -dx / len;
    const cx = (a[0] + b[0]) * 0.5 + nx * 0.1;
    const cz = (a[1] + b[1]) * 0.5 + nz * 0.1;
    const rotY = Math.atan2(-dz, dx);
    rotBox(cx, 1.92, cz, len * 0.5 + 0.1, 1.92, 0.1, 0, rotY, 0);
  }

  // Interior entrance landing (y = 0.48) and two steps (y = 0.32, y = 0.16).
  const door = HOUSE_DOOR.interior;
  const dc = Math.cos(door.yaw);
  const ds = Math.sin(door.yaw);
  const entryWorld = (lx: number, lz: number): [number, number] => [
    door.center[0] + lx * dc + lz * ds,
    door.center[1] - lx * ds + lz * dc,
  ];
  const [landX, landZ] = entryWorld(0, 0.55);
  rotBox(landX, 0.24, landZ, 1.335, 0.24, 0.58, 0, door.yaw, 0);
  const [step2X, step2Z] = entryWorld(-0.3, 1.175);
  rotBox(step2X, 0.16, step2Z, 0.915, 0.16, 0.345, 0, door.yaw, 0);
  const [step1X, step1Z] = entryWorld(-0.3, 1.5);
  rotBox(step1X, 0.08, step1Z, 1.075, 0.08, 0.47, 0, door.yaw, 0);

  // 1. Preparation table (top y = 1.20) + legs.
  const [ptx, ptz] = HOUSE_PREP_TABLE.position;
  box(ptx, HOUSE_PREP_TABLE.height - 0.08, ptz, HOUSE_PREP_TABLE.width / 2, 0.08, HOUSE_PREP_TABLE.depth / 2);
  box(ptx, 0.52, ptz, HOUSE_PREP_TABLE.width / 2 - 0.12, 0.52, HOUSE_PREP_TABLE.depth / 2 - 0.12);

  // 2. Reading table (top y = 0.793) + legs/apron.
  const [rtx, rtz] = HOUSE_READING_TABLE.position;
  box(rtx, HOUSE_READING_TABLE.height - 0.105, rtz, HOUSE_READING_TABLE.width / 2, 0.105, HOUSE_READING_TABLE.depth / 2);
  box(rtx, 0.29, rtz, HOUSE_READING_TABLE.width / 2 - 0.16, 0.29, HOUSE_READING_TABLE.depth / 2 - 0.16);

  // 3. Reading chair: seat cushion (top y = 0.53), backrest, and arms.
  const [rcx, rcz] = hw(0.65, -1.275);
  box(rcx, 0.265, rcz + 0.045, 0.655, 0.265, 0.54);
  const [rbx, rbz] = hw(0.65, -1.78);
  box(rbx, 0.86, rbz, 0.74, 0.86, 0.16);
  for (const side of [-1, 1]) {
    const [ax, az] = hw(0.65 + side * 0.725, -1.35);
    box(ax, 0.41, az, 0.1, 0.41, 0.49);
  }

  // 4. Chair side tray (top y = 0.7975).
  const [ctX, ctZ] = hw(1.73, -1.27);
  box(ctX, 0.399, ctZ, 0.24, 0.399, 0.385);

  // 5. Fireplace: low hearth (y = 0.14), mantel body (y = 1.41), chimney breast (y = 3.84).
  const [fhx, fhz] = hw(-1.07, -2.045);
  box(fhx, 0.07, fhz, 0.7, 0.07, 0.755);
  const [fmx, fmz] = hw(-1.07, -2.12);
  box(fmx, 0.775, fmz, 0.695, 0.635, 0.68);
  const [fcx, fcz] = hw(-1.07, -2.575);
  box(fcx, 2.625, fcz, 0.415, 1.215, 0.225);

  // 6. Five-bay bookcase.
  const [bkx, bkz] = hw(1.6, -2.37);
  box(bkx, 1.69, bkz, 1.28, 1.69, 0.39);

  // 7. Pantry & upper cupboard (shelf top y = KITCHEN_CUPBOARD.shelfY = 2.10).
  const [px, pz] = hw(KITCHEN_CUPBOARD.local[0] + HOUSE_KITCHEN_OFFSET[0], KITCHEN_CUPBOARD.local[1] + HOUSE_KITCHEN_OFFSET[1]);
  box(px, 0.535, pz, 0.35, 0.535, 0.96);
  box(px, 1.58, pz, 0.26, 0.028, 0.9);
  box(px, KITCHEN_CUPBOARD.shelfY - 0.0425, pz, 0.325, 0.0425, 0.955);
  box(px - 0.26, 1.55, pz, 0.06, 1.55, 0.96);
  for (const sz of [-0.94, 0.94]) box(px, 1.55, pz + sz, 0.35, 1.55, 0.06);
  box(px, 3.03, pz, 0.35, 0.07, 1.0);

  // 8. Angled refrigerator.
  const [frx, frz] = hw(-5.59 + HOUSE_KITCHEN_OFFSET[0], -1.62 + HOUSE_KITCHEN_OFFSET[1]);
  rotBox(frx, 1.32, frz, 0.55, 1.32, 0.48, 0, 0.59, 0);

  // 9. Wraparound kitchen counters (worktop top y = 1.228).
  const counters: [number, number, number, number][] = [
    [-4.52, -2.91, 1.24, 0.367],
    [-3.57, -2.85, 0.85, -0.94],
    [-3.15, -2.24, 0.66, -0.94],
  ];
  for (const [cx, cz, width, angle] of counters) {
    const [wx, wz] = hw(cx + HOUSE_KITCHEN_OFFSET[0], cz + HOUSE_KITCHEN_OFFSET[1]);
    rotBox(wx, 0.614, wz, width / 2, 0.614, 0.36, 0, angle, 0);
  }

  // 10. Freestanding barrel stove (top y = 1.185) + flue pipe.
  const [stx, stz] = hw(-2.93 + HOUSE_KITCHEN_OFFSET[0], -1.65 + HOUSE_KITCHEN_OFFSET[1]);
  cyl(stx, 0.5925, stz, 0.5925, 0.38);
  cyl(stx, 2.51, stz - 0.3, 1.325, 0.06);

  // 11 & 12. Kitchen dining chairs (seat top y = 0.64).
  const [c1x, c1z] = hw(-4.5 + HOUSE_KITCHEN_OFFSET[0], -0.83 + HOUSE_KITCHEN_OFFSET[1]);
  box(c1x, 0.32, c1z, 0.335, 0.32, 0.325);
  box(c1x, 1.12, c1z - 0.31, 0.335, 0.48, 0.05);

  const [c2x, c2z] = hw(-5.05, 2.82);
  box(c2x, 0.32, c2z, 0.335, 0.32, 0.325);
  box(c2x, 1.12, c2z + 0.31, 0.335, 0.48, 0.05);

  // 13. House cooking helper (three treads, top y = 0.80).
  const hh = HOUSE_COOKING_HELPER;
  for (let i = 0; i < hh.steps; i++) {
    const h = (hh.height * (hh.steps - i)) / hh.steps;
    const w = i === 0 ? hh.width : hh.stepDepth;
    const x = hh.position[0] + (i === 0 ? 0 : hh.width / 2 + hh.stepDepth * (i - 0.5));
    box(x, h / 2, hh.position[1], w / 2, h / 2, hh.depth / 2);
  }
}

function addPondColliders(world: RAPIER.World): void {
  const { box, rotBox, cyl } = makeStaticBuilder(world);
  const norm = Math.hypot(-1, 2.6);
  const dx = -1 / norm;
  const dz = 2.6 / norm;
  const pierYaw = Math.atan2(dx, dz);

  // Flat pier deck (lz in [0, 3.1], top y = PIER_HEIGHT).
  const midAlong = 1.55;
  rotBox(
    POND_PIER_START[0] + dx * midAlong,
    PIER_HEIGHT / 2,
    POND_PIER_START[1] + dz * midAlong,
    0.6,
    PIER_HEIGHT / 2,
    1.55,
    0,
    pierYaw,
    0,
  );
  // Shore approach ramp (lz in [-0.5, 0.0], rising 0 -> PIER_HEIGHT).
  const rampAlong = -0.25;
  const rampPitch = -Math.atan2(PIER_HEIGHT, 0.5);
  rotBox(
    POND_PIER_START[0] + dx * rampAlong,
    PIER_HEIGHT / 2,
    POND_PIER_START[1] + dz * rampAlong,
    0.6,
    0.04,
    0.29,
    rampPitch,
    pierYaw,
    0,
  );
  // Pier mooring posts.
  const pc = Math.cos(pierYaw);
  const ps = Math.sin(pierYaw);
  for (const lz of [0.6, 1.8, 3.0]) {
    const h = lz === 3.0 ? 1.15 : 0.75;
    const cy = PIER_HEIGHT + h / 2 - 0.55;
    for (const side of [-1, 1]) {
      const lx = side * 0.6;
      cyl(POND_PIER_START[0] + lx * pc + lz * ps, cy, POND_PIER_START[1] - lx * ps + lz * pc, h / 2, 0.075);
    }
  }

  // Lakeside bench (top y = 0.535) & supports.
  box(
    POND_BENCH_SPEC.center[0],
    POND_BENCH_SPEC.topY,
    POND_BENCH_SPEC.center[1],
    POND_BENCH_SPEC.width / 2,
    POND_BENCH_SPEC.thickness / 2,
    POND_BENCH_SPEC.depth / 2,
  );
  for (const x of POND_BENCH_SPEC.postXs) {
    cyl(x, POND_BENCH_SPEC.postHeight / 2, POND_BENCH_SPEC.center[1], POND_BENCH_SPEC.postHeight / 2, 0.19);
  }

  // Lakeside stump (h = 0.40).
  cyl(
    POND_STUMP_SPEC.pos[0],
    POND_STUMP_SPEC.height / 2,
    POND_STUMP_SPEC.pos[1],
    POND_STUMP_SPEC.height / 2,
    POND_STUMP_SPEC.radius,
  );
}

function addWolvesColliders(world: RAPIER.World): void {
  const { box, rotCyl } = makeStaticBuilder(world);
  // Wolves' ambulance van ([13, -3.2]..[15.2, 1.2], full height ~2.22 m) + front nose bumper.
  box(
    WOLVES_VAN_SPEC.center[0],
    WOLVES_VAN_SPEC.halfExtents[1],
    WOLVES_VAN_SPEC.center[1],
    WOLVES_VAN_SPEC.halfExtents[0],
    WOLVES_VAN_SPEC.halfExtents[1],
    WOLVES_VAN_SPEC.halfExtents[2],
  );
  box(14.1, 0.85, 1.1, 0.97, 0.42, 0.2);

  // Two fallen logs.
  for (const [x, z, angle] of WOLVES_LOGS_SPEC) {
    rotCyl(x, 0.25, z, 1.025, 0.24, Math.PI / 2, 0, angle, 'XYZ');
  }

  // Two wooden crates.
  for (let k = 0; k < WOLVES_CRATES_SPEC.count; k++) {
    box(
      WOLVES_CRATES_SPEC.startX + k * WOLVES_CRATES_SPEC.stepX,
      WOLVES_CRATES_SPEC.size[1] / 2,
      WOLVES_CRATES_SPEC.z,
      WOLVES_CRATES_SPEC.size[0] / 2 + 0.015,
      WOLVES_CRATES_SPEC.size[1] / 2,
      WOLVES_CRATES_SPEC.size[2] / 2 + 0.02,
    );
  }
}

/** Full multi-location static colliders: central + full yard, house interior, pond, wolves. Returns the yard ground collider. */
export function createWorldColliders(world: RAPIER.World): RAPIER.Collider {
  const ground = createYardColliders(world);
  addFullYardColliders(world);
  addHouseInteriorColliders(world);
  addPondColliders(world);
  addWolvesColliders(world);
  return ground;
}
