import type {Vec2, Segment} from './schema';
import {houseWorld} from './houseLayout';

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
  const smooth=(a:number)=>{const k=Math.max(0,Math.min(1,a));return k*k*(3-2*k);};
  if(Math.abs(x-HOUSE_DOOR.exterior.center[0])<1.15&&z<-4.05&&z>-5.8)return .24*(smooth((-4.05-z)/.35)+smooth((-4.55-z)/.32));
  const d=HOUSE_DOOR.interior,dx=x-d.center[0],dz=z-d.center[1];
  const lateral=Math.cos(d.yaw)*dx-Math.sin(d.yaw)*dz,depth=Math.sin(d.yaw)*dx+Math.cos(d.yaw)*dz;
  if(Math.abs(lateral)>1.05||depth<-.25||depth>1.96)return 0;
  return .16*(smooth((1.92-depth)/.35)+smooth((1.50-depth)/.3)+smooth((1.05-depth)/.25));
}
export function doorOpenAt(segment:Segment,t:number):number {
  let value=segment.startState.objects?.house_door??0;
  for(const cue of segment.objectCues??[]){
    if(t<cue.start)break;
    const u=Math.max(0,Math.min(1,(t-cue.start)/cue.dur)),k=u*u*(3-2*u);
    value=cue.from+(cue.to-cue.from)*k;
  }
  return value;
}
