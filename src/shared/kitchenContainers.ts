import type {ActorId,Vec2,Vec3} from './schema';
import {houseWorld,HOUSE_PREP_TABLE,HOUSE_KITCHEN_WORK_SHIFT} from './houseLayout';

/** Two authored container slots, not a general inventory system. Coordinates
 * are shared by the visible furniture, prop placement and hand choreography. */
export const KITCHEN_CONTAINERS={
 kitchen_bowl:{
  position:[...houseWorld([-3.62,1.28+HOUSE_KITCHEN_WORK_SHIFT])] as Vec2,
  baseY:HOUSE_PREP_TABLE.height,radius:.30,height:.23,
  carrotPosition:[houseWorld([-3.80,1.28+HOUSE_KITCHEN_WORK_SHIFT])[0],1.29,houseWorld([-3.80,1.28+HOUSE_KITCHEN_WORK_SHIFT])[1]] as Vec3,
  carrotRotation:[0,0,-Math.PI/2] as Vec3,
  approaches:{masha:{position:houseWorld([-3.23,1.43+HOUSE_KITCHEN_WORK_SHIFT]),yaw:-Math.PI/2},bear:{position:houseWorld([-2.65,.98+HOUSE_KITCHEN_WORK_SHIFT]),yaw:-.65}},
 },
 kitchen_pot:{
  // The existing enamel pot stays on the rear counter. Its smaller footprint
  // and aisle-facing position clear the window sill; never relocate it per beat.
  position:[...houseWorld([-5.70,-1.18])] as Vec2,
  baseY:1.32,radius:.34,height:.49,
  carrotPosition:[houseWorld([-5.745,-1.16])[0],1.365,houseWorld([-5.745,-1.16])[1]] as Vec3,
  carrotRotation:[.30,0,.12] as Vec3,
  approaches:{bear:{position:houseWorld([-5.65,-.31]),yaw:-2.45}},
 },
} as const;
export type KitchenContainer=keyof typeof KITCHEN_CONTAINERS;
export const isKitchenContainer=(mark:unknown):mark is KitchenContainer=>mark==='kitchen_bowl'||mark==='kitchen_pot';
export function kitchenContainerApproach(mark:KitchenContainer,actor:ActorId):{position:Vec2;yaw:number}|undefined{
 const approaches=KITCHEN_CONTAINERS[mark].approaches as Partial<Record<ActorId,{position:Vec2;yaw:number}>>;
 return approaches[actor];
}
