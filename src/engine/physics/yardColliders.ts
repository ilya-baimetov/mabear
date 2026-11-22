// Physical world colliders and per-prop physical material profiles for Rapier replay.
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
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
import { ACTOR_IDS, type ActorId, type PropId } from '../../shared/schema';

export const BALL_RADIUS = 0.15;
export const MASHA_RADIUS = 0.22;
export const MASHA_HALF_HEIGHT = 0.28;
export const SKIN = 0.01;
export const MASHA_SKIN = SKIN;
export const MASHA_CENTER = MASHA_RADIUS + MASHA_HALF_HEIGHT + SKIN;

// Rapier 32-bit interaction groups: (membership << 16) | filter.
// Bit 0 (1): static world colliders
// Bit 1 (2): Masha character controller capsule
// Bit 2 (4): dynamic prop rigid bodies
// Bit 3 (8): generic actor blocker group
// Bits 4..12 (1 << (4 + idx)): per-actor blocker bit so a thrower can be excluded briefly on release
export const STATIC_GROUP = (1 << 16) | 6;
export const MASHA_GROUP = (2 << 16) | 1;
export const BALL_GROUP = (4 << 16) | 1;
export const ACTOR_BLOCKER_GROUP = (8 << 16) | 4;

const ALL_ACTOR_BITS = ((1 << ACTOR_IDS.length) - 1) << 4;
const ALL_BLOCKER_MASK = 8 | ALL_ACTOR_BITS;
export const PROP_GROUP = (4 << 16) | (1 | 4 | ALL_BLOCKER_MASK);

export function actorBlockerBit(actor: ActorId): number {
  const idx = ACTOR_IDS.indexOf(actor);
  return idx >= 0 ? 1 << (4 + idx) : 8;
}

export function actorBlockerGroup(actor: ActorId): number {
  return (actorBlockerBit(actor) << 16) | 4;
}

export function propGroupExcludingActor(actor: ActorId): number {
  return (4 << 16) | (1 | 4 | (ALL_BLOCKER_MASK & ~actorBlockerBit(actor)));
}

export interface PropColliderProfile {
  shape: 'sphere' | 'cylinder' | 'box';
  radius: number;
  halfHeight: number;
  halfExtents?: [number, number, number];
  density: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
}

/**
 * Physical dimensions and material response for all 19 props.
 * Each rigid body origin is centered at `(0, profile.halfHeight, 0)` relative to the
 * rendered base origin so props rest flush on surfaces at every orientation.
 */
export const PROP_COLLIDER_PROFILES: Record<PropId, PropColliderProfile> = {
  ball: {
    shape: 'sphere',
    radius: BALL_RADIUS,
    halfHeight: BALL_RADIUS,
    density: 100,
    restitution: 0.5,
    friction: 0.8,
    linearDamping: 0.35,
    angularDamping: 0.6,
  },
  jam_jar: {
    shape: 'cylinder',
    radius: 0.065,
    halfHeight: 0.072,
    density: 320,
    restitution: 0.22,
    friction: 0.65,
    linearDamping: 0.32,
    angularDamping: 0.58,
  },
  honey_pot: {
    shape: 'cylinder',
    radius: 0.105,
    halfHeight: 0.1,
    density: 340,
    restitution: 0.2,
    friction: 0.7,
    linearDamping: 0.34,
    angularDamping: 0.6,
  },
  pantry_honey: {
    shape: 'cylinder',
    radius: 0.105,
    halfHeight: 0.155,
    density: 340,
    restitution: 0.22,
    friction: 0.65,
    linearDamping: 0.32,
    angularDamping: 0.58,
  },
  teapot: {
    shape: 'cylinder',
    radius: 0.085,
    halfHeight: 0.075,
    density: 320,
    restitution: 0.18,
    friction: 0.68,
    linearDamping: 0.34,
    angularDamping: 0.6,
  },
  frying_pan: {
    shape: 'box',
    radius: 0.14,
    halfHeight: 0.025,
    halfExtents: [0.135, 0.025, 0.18],
    density: 850,
    restitution: 0.14,
    friction: 0.72,
    linearDamping: 0.25,
    angularDamping: 0.45,
  },
  book: {
    shape: 'box',
    radius: 0.085,
    halfHeight: 0.0175,
    halfExtents: [0.085, 0.0175, 0.068],
    density: 220,
    restitution: 0.08,
    friction: 0.76,
    linearDamping: 0.38,
    angularDamping: 0.72,
  },
  pancakes: {
    shape: 'cylinder',
    radius: 0.15,
    halfHeight: 0.062,
    density: 140,
    restitution: 0.05,
    friction: 0.85,
    linearDamping: 0.45,
    angularDamping: 0.75,
  },
  pillow: {
    shape: 'box',
    radius: 0.15,
    halfHeight: 0.07,
    halfExtents: [0.22, 0.07, 0.15],
    density: 35,
    restitution: 0.06,
    friction: 0.92,
    linearDamping: 0.65,
    angularDamping: 0.85,
  },
  flour_bag: {
    shape: 'box',
    radius: 0.12,
    halfHeight: 0.14,
    halfExtents: [0.13, 0.14, 0.105],
    density: 180,
    restitution: 0.05,
    friction: 0.88,
    linearDamping: 0.48,
    angularDamping: 0.78,
  },
  carrot: {
    shape: 'cylinder',
    radius: 0.04,
    halfHeight: 0.14,
    density: 160,
    restitution: 0.16,
    friction: 0.62,
    linearDamping: 0.35,
    angularDamping: 0.55,
  },
  fish: {
    shape: 'box',
    radius: 0.05,
    halfHeight: 0.05,
    halfExtents: [0.17, 0.05, 0.032],
    density: 180,
    restitution: 0.12,
    friction: 0.55,
    linearDamping: 0.35,
    angularDamping: 0.6,
  },
  lollipop: {
    shape: 'cylinder',
    radius: 0.065,
    halfHeight: 0.13,
    density: 130,
    restitution: 0.18,
    friction: 0.65,
    linearDamping: 0.38,
    angularDamping: 0.62,
  },
  flowers: {
    shape: 'cylinder',
    radius: 0.075,
    halfHeight: 0.16,
    density: 60,
    restitution: 0.08,
    friction: 0.85,
    linearDamping: 0.52,
    angularDamping: 0.75,
  },
  broom: {
    shape: 'cylinder',
    radius: 0.1,
    halfHeight: 0.55,
    density: 110,
    restitution: 0.12,
    friction: 0.78,
    linearDamping: 0.42,
    angularDamping: 0.68,
  },
  bucket: {
    shape: 'cylinder',
    radius: 0.115,
    halfHeight: 0.1,
    density: 320,
    restitution: 0.22,
    friction: 0.58,
    linearDamping: 0.3,
    angularDamping: 0.52,
  },
  watering_can: {
    shape: 'cylinder',
    radius: 0.11,
    halfHeight: 0.11,
    density: 300,
    restitution: 0.2,
    friction: 0.58,
    linearDamping: 0.32,
    angularDamping: 0.55,
  },
  cake: {
    shape: 'cylinder',
    radius: 0.17,
    halfHeight: 0.09,
    density: 140,
    restitution: 0.04,
    friction: 0.88,
    linearDamping: 0.5,
    angularDamping: 0.82,
  },
  fishing_rod: {
    shape: 'cylinder',
    radius: 0.03,
    halfHeight: 0.75,
    density: 110,
    restitution: 0.15,
    friction: 0.7,
    linearDamping: 0.4,
    angularDamping: 0.65,
  },
};

export function createPropColliderDesc(prop: PropId): RAPIER.ColliderDesc {
  const p = PROP_COLLIDER_PROFILES[prop];
  let desc: RAPIER.ColliderDesc;
  if (p.shape === 'sphere') {
    desc = RAPIER.ColliderDesc.ball(p.radius);
  } else if (p.shape === 'box') {
    const [hx, hy, hz] = p.halfExtents ?? [p.radius, p.halfHeight, p.radius];
    desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
  } else {
    desc = RAPIER.ColliderDesc.cylinder(p.halfHeight, p.radius);
  }
  return desc
    .setDensity(p.density)
    .setRestitution(p.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setFriction(p.friction);
}

function makeStaticBuilder(world: RAPIER.World) {
  const qTmp = new Quaternion();
  const eTmp = new Euler();
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
    eTmp.set(rx, ry, rz, order);
    qTmp.setFromEuler(eTmp);
    return add(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setRotation({ x: qTmp.x, y: qTmp.y, z: qTmp.z, w: qTmp.w }),
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
    eTmp.set(rx, ry, rz, order);
    qTmp.setFromEuler(eTmp);
    return add(
      RAPIER.ColliderDesc.cylinder(hh, r)
        .setTranslation(x, y, z)
        .setRotation({ x: qTmp.x, y: qTmp.y, z: qTmp.z, w: qTmp.w }),
    );
  };
  return { add, box, rotBox, cyl, rotCyl };
}

/** Central bounded yard colliders (preserved intact for rapierReplay.test.ts). */
export function createYardColliders(world: RAPIER.World): void {
  const { add, box } = makeStaticBuilder(world);
  // groundY is identically zero throughout this bounded yard.
  box(0, -0.2, 0, 19, 0.2, 19);
  // Round table: top, pedestal and cross feet. The capsule hits the top's rim.
  add(RAPIER.ColliderDesc.cylinder(0.035, 0.75).setTranslation(2, 0.745, 1.5));
  add(RAPIER.ColliderDesc.cylinder(0.355, 0.1).setTranslation(2, 0.355, 1.5));
  box(2, 0.035, 1.5, 0.5, 0.035, 0.1);
  box(2, 0.035, 1.5, 0.1, 0.035, 0.5);
  // Bench seat and two log supports, matching buildBench's nominal dimensions.
  box(2, 0.42, 3, 0.85, 0.05, 0.19);
  for (const x of [1.4, 2.6]) add(RAPIER.ColliderDesc.cylinder(0.19, 0.17).setTranslation(x, 0.19, 3));
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
}

function addFullYardColliders(world: RAPIER.World): void {
  const { box, rotBox, cyl } = makeStaticBuilder(world);

  // Outer ground aprons beyond [-19, 19] so far throws never fall through the floor.
  box(0, -0.2, -33.5, 48, 0.2, 14.5);
  box(0, -0.2, 33.5, 48, 0.2, 14.5);
  box(-33.5, -0.2, 0, 14.5, 0.2, 19);
  box(33.5, -0.2, 0, 14.5, 0.2, 19);

  // Brass samovar resting on the round table (y = 0.78..1.25).
  cyl(2.22, 0.78 + 0.23, 1.28, 0.23, 0.17);

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
  box(-6, 0.16, -3.0, 2.4, 0.16, 1.0);
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

  // Hammock between two rotated pines (center [-11, 0, 2.2], rotY = 0.8).
  const hc = Math.cos(0.8);
  const hs = Math.sin(0.8);
  cyl(-11 - 2.1 * hc, 2.0, 2.2 + 2.1 * hs, 2.0, 0.28);
  cyl(-11 + 2.1 * hc, 2.0, 2.2 - 2.1 * hs, 2.0, 0.3);
  rotBox(-11, 0.62, 2.2, 1.5, 0.04, 0.45, 0, 0.8, 0);

  // Woodpile & chopping stump.
  box(-12.2, 0.425, -6.4, 0.88, 0.425, 0.5);
  cyl(-13.4, 0.225, -4.6, 0.225, 0.32);

  // Big pine & round bush.
  cyl(-2, 2.5, -10.6, 2.5, 0.42);
  cyl(6, 0.6, 7.6, 0.6, 0.8);

  // Arched creek bridges (footbridge & path_bridge).
  const bridges: { pos: [number, number]; rotY: number; width: number }[] = [
    { pos: [12, 9], rotY: 0.149, width: 1.05 },
    { pos: [0, 17.9], rotY: Math.PI / 2, width: 1.6 },
  ];
  for (const br of bridges) {
    const bc = Math.cos(br.rotY);
    const bs = Math.sin(br.rotY);
    const n = 10;
    const plankW = 2.7 / n;
    for (let i = 0; i < n; i++) {
      const lx = -1.35 + (i + 0.5) * plankW;
      const ly = 0.05 + 0.2 * Math.cos((Math.PI * Math.max(-1.4, Math.min(1.4, lx))) / 2.8) - 0.03;
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

  // Flat pier deck (lz in [0, 3.1], top y = 0.28).
  const midAlong = 1.55;
  rotBox(
    POND_PIER_START[0] + dx * midAlong,
    0.14,
    POND_PIER_START[1] + dz * midAlong,
    0.6,
    0.14,
    1.55,
    0,
    pierYaw,
    0,
  );
  // Shore approach ramp (lz in [-0.5, 0.0], rising 0 -> 0.28).
  const rampAlong = -0.25;
  const rampPitch = -Math.atan2(0.28, 0.5);
  rotBox(
    POND_PIER_START[0] + dx * rampAlong,
    0.14,
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
    const cy = 0.28 + h / 2 - 0.55;
    for (const side of [-1, 1]) {
      const lx = side * 0.6;
      cyl(POND_PIER_START[0] + lx * pc + lz * ps, cy, POND_PIER_START[1] - lx * ps + lz * pc, h / 2, 0.075);
    }
  }

  // Lakeside bench (top y = 0.535) & supports.
  box(-4.1, 0.5, 5.8, 1.3, 0.035, 0.24);
  for (const x of [-5.1, -3.2]) cyl(x, 0.24, 5.8, 0.24, 0.19);

  // Lakeside stump (h = 0.40).
  cyl(-2.28, 0.2, 5.9, 0.2, 0.32);
}

function addWolvesColliders(world: RAPIER.World): void {
  const { box, rotCyl } = makeStaticBuilder(world);
  // Wolves' ambulance van ([13, -3.2]..[15.2, 1.2], full height ~2.22 m) + front nose bumper.
  box(14.1, 1.11, -1.0, 1.1, 1.11, 2.2);
  box(14.1, 0.85, 1.1, 0.97, 0.42, 0.2);

  // Two fallen logs.
  for (const [x, z, angle] of [
    [10.2, -3.7, 0.35],
    [17, -1.3, -0.3],
  ] as const) {
    rotCyl(x, 0.25, z, 1.025, 0.24, Math.PI / 2, 0, angle, 'XYZ');
  }

  // Two wooden crates.
  for (let k = 0; k < 2; k++) {
    box(16.2 + k * 0.65, 0.24, -3.6, 0.305, 0.24, 0.32);
  }
}

/** Full multi-location static colliders: central + full yard, house interior, pond, wolves. */
export function createWorldColliders(world: RAPIER.World): void {
  createYardColliders(world);
  addFullYardColliders(world);
  addHouseInteriorColliders(world);
  addPondColliders(world);
  addWolvesColliders(world);
}
