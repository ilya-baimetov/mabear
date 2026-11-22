// Deliberately small, conservative collision set. No mesh colliders or other locations.
import RAPIER from '@dimforge/rapier3d-compat';
import {COOKING_STATION} from '../../shared/cookingStation';

export const BALL_RADIUS = .15;
export const MASHA_RADIUS = .22;
export const MASHA_HALF_HEIGHT = .28;
export const SKIN = .01;
export const MASHA_CENTER = MASHA_RADIUS + MASHA_HALF_HEIGHT + SKIN;
export const STATIC_GROUP = (1 << 16) | 6;
export const MASHA_GROUP = (2 << 16) | 1;
export const BALL_GROUP = (4 << 16) | 1;

/** Returns the ground collider so material changes can follow real contacts. */
export function createYardColliders(world: RAPIER.World): RAPIER.Collider {
  const add = (desc: RAPIER.ColliderDesc) => world.createCollider(desc.setCollisionGroups(STATIC_GROUP).setFriction(.8));
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    add(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  // groundY is identically zero throughout this bounded yard.
  const ground=box(0, -.2, 0, 19, .2, 19);
  // Round table: top, pedestal and cross feet. The capsule hits the top's rim.
  add(RAPIER.ColliderDesc.cylinder(.035, .75).setTranslation(2, .745, 1.5));
  add(RAPIER.ColliderDesc.cylinder(.355, .1).setTranslation(2, .355, 1.5));
  box(2, .035, 1.5, .5, .035, .1);
  box(2, .035, 1.5, .1, .035, .5);
  // Bench seat and two log supports, matching buildBench's nominal dimensions.
  box(2, .42, 3, .85, .05, .19);
  for (const x of [1.4, 2.6]) add(RAPIER.ColliderDesc.cylinder(.19, .17).setTranslation(x, .19, 3));
  const s = COOKING_STATION;
  box(s.position[0], s.top / 2, (s.topBack + s.topFront) / 2, s.width / 2, s.top / 2, (s.topFront - s.topBack) / 2);
  box(s.position[0], s.stepTop / 2, (s.stepBack + s.topBack) / 2, s.width / 2, s.stepTop / 2, (s.topBack - s.stepBack) / 2);
  return ground;
}
