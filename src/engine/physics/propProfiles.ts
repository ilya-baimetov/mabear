// Collision groups, actor capsule dimensions, and physical material profiles for all 19 props.
import RAPIER from '@dimforge/rapier3d-compat';
import { ACTOR_IDS, type ActorId, type PropId } from '../../shared/schema';

export const BALL_RADIUS = 0.15;
export const MASHA_RADIUS = 0.22;
export const MASHA_HALF_HEIGHT = 0.28;
export const SKIN = 0.01;
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

export const ACTOR_CAPSULE: Record<ActorId, { radius: number; halfHeight: number }> = {
  masha: { radius: MASHA_RADIUS, halfHeight: MASHA_HALF_HEIGHT },
  bear: { radius: 0.48, halfHeight: 0.72 },
  lady_bear: { radius: 0.45, halfHeight: 0.625 },
  rival_bear: { radius: 0.5, halfHeight: 0.775 },
  wolf_a: { radius: 0.32, halfHeight: 0.705 },
  wolf_b: { radius: 0.3, halfHeight: 0.665 },
  rosie: { radius: 0.26, halfHeight: 0.265 },
  hare: { radius: 0.2, halfHeight: 0.225 },
  squirrel: { radius: 0.17, halfHeight: 0.155 },
};

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

const CARROT_COLLIDER_PROFILE: PropColliderProfile = {
  shape: 'cylinder',
  radius: 0.04,
  halfHeight: 0.14,
  density: 160,
  restitution: 0.16,
  friction: 0.62,
  linearDamping: 0.35,
  angularDamping: 0.55,
};

/**
 * Physical dimensions and material response for all props.
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
  carrot: CARROT_COLLIDER_PROFILE,
  carrot_2: CARROT_COLLIDER_PROFILE,
  carrot_3: CARROT_COLLIDER_PROFILE,
  carrot_4: CARROT_COLLIDER_PROFILE,
  carrot_5: CARROT_COLLIDER_PROFILE,
  carrot_6: CARROT_COLLIDER_PROFILE,
  carrot_7: CARROT_COLLIDER_PROFILE,
  carrot_8: CARROT_COLLIDER_PROFILE,
  carrot_9: CARROT_COLLIDER_PROFILE,
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
