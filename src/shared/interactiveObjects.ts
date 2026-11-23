import {clamp01,smooth} from './math';
import type {Vec2, Vec3, Segment} from './schema';
import {houseWorld,HOUSE_KITCHEN_OFFSET} from './houseLayout';

/** Left upper pantry compartment. One panel and one independently owned jar.
 * Coordinates are shared by the fixture mesh, staging, contacts and prop slot. */
export const KITCHEN_CUPBOARD = {
  id:'kitchen_cupboard' as const,
  local:[-6.03,-.15] as Vec2,
  center:houseWorld([-6.03+HOUSE_KITCHEN_OFFSET[0],-.15+HOUSE_KITCHEN_OFFSET[1]]),
  approach:houseWorld([-6.30,1.64]),
  shelfY:2.10,
  duration:2.2,
  angle:-1.75,
  hingeX:-.875,
  frontZ:.355,
};
export function cupboardPoint(x:number,y:number,z:number):Vec3 {
  const [cx,cz]=KITCHEN_CUPBOARD.center;return[cx+z,y,cz-x];
}
export const CUPBOARD_JAR_POSITION=cupboardPoint(-.35,KITCHEN_CUPBOARD.shelfY,.23);
export function cupboardHandleAt(open:number):Vec3 {
  const a=KITCHEN_CUPBOARD.angle*open,x=.79,z=.065;
  return cupboardPoint(KITCHEN_CUPBOARD.hingeX+x*Math.cos(a)+z*Math.sin(a),2.24,KITCHEN_CUPBOARD.frontZ-x*Math.sin(a)+z*Math.cos(a));
}

/** One logical entrance, represented on two separately staged sets. Animation
 * owns the panel; opening and passage are reconstructed from story timestamps. */
export const HOUSE_DOOR = {
  id:'house_door' as const,
  exterior:{center:[-6.63,-5.48] as Vec2, approach:[-6.63,-4.35] as Vec2, threshold:[-6.63,-5.50] as Vec2, yaw:0, base:.48, width:1.86,height:2.66},
  interior:{center:houseWorld([3.37,2.57]),yaw:-2.10,base:.48,width:1.8,height:2.7},
  duration:1.4,
};
export function entryPoint(depth:number):Vec2 {
  const d=HOUSE_DOOR.interior;
  return [d.center[0]+Math.sin(d.yaw)*depth,d.center[1]+Math.cos(d.yaw)*depth].map(v=>Math.round(v*1000)/1000) as Vec2;
}
export const INTERIOR_THRESHOLD=entryPoint(.18);
export const INTERIOR_APPROACH=entryPoint(2.1);
export function entranceSupportAt(x:number,z:number):number {
  if(Math.abs(x-HOUSE_DOOR.exterior.center[0])<1.15&&z<-4.05&&z>-5.8)return .24*(smooth((-4.05-z)/.35)+smooth((-4.55-z)/.32));
  const d=HOUSE_DOOR.interior,dx=x-d.center[0],dz=z-d.center[1];
  const lateral=Math.cos(d.yaw)*dx-Math.sin(d.yaw)*dz,depth=Math.sin(d.yaw)*dx+Math.cos(d.yaw)*dz;
  if(Math.abs(lateral)>1.05||depth<-.25||depth>1.96)return 0;
  return .16*(smooth((1.92-depth)/.35)+smooth((1.50-depth)/.3)+smooth((1.05-depth)/.25));
}
export function objectOpenAt(segment:Segment,t:number,id:'house_door'|'kitchen_cupboard'):number {
  let value=segment.startState.objects?.[id]??0;
  for(const cue of segment.objectCues??[]){
    if(cue.object!==id||t<cue.start)continue;
    const k=smooth((t-cue.start)/cue.dur);
    value=cue.from+(cue.to-cue.from)*k;
  }
  return value;
}
export const doorOpenAt=(segment:Segment,t:number)=>objectOpenAt(segment,t,'house_door');
/** Exact world-space position of the accessible (+Z local) drop-ring handle on `buildHouseDoor(inside)`. */
export function doorHandleAt(open:number,inside:boolean):Vec3 {
  const d=inside?HOUSE_DOOR.interior:HOUSE_DOOR.exterior;
  const a=(inside?-1:1)*clamp01(open)*Math.PI*.53;
  const hx=d.width-.18,hy=1.155,hz=.088;
  const rx=-d.width/2+hx*Math.cos(a)+hz*Math.sin(a);
  const rz=-hx*Math.sin(a)+hz*Math.cos(a);
  return [
    d.center[0]+rx*Math.cos(d.yaw)+rz*Math.sin(d.yaw),
    d.base+hy,
    d.center[1]-rx*Math.sin(d.yaw)+rz*Math.cos(d.yaw),
  ];
}
