import {smooth} from './math';
import type {Vec2,PropId} from './schema';

/** The revised house is a separate stage. Semantic marks connect it to the
 * exterior by an editorial cut; its larger floor need not distort the yard. */
export const HOUSE_ORIGIN:Vec2=[-8,-13];
export const HOUSE_KITCHEN_OFFSET:Vec2=[-1.25,1.4];
export const HOUSE_FOOTPRINT:Vec2[]=[[-7.05,5.3],[-7.70,2.65],[-7.50,-.1],[-6.35,-1.75],[-5.05,-2.25],[-3.80,-.55],[-3.40,-2.8],[3.02,-2.8],[4.1,-1.2],[4.1,1.5],[2.75,3.8]];
export const houseWorld=([x,z]:readonly number[]):Vec2=>[x+HOUSE_ORIGIN[0],z+HOUSE_ORIGIN[1]];
export const houseLocal=([x,z]:readonly number[]):Vec2=>[x-HOUSE_ORIGIN[0],z-HOUSE_ORIGIN[1]];
export function isHousePoint(x:number,z:number):boolean {
 const p=houseLocal([x,z]);let inside=false;
 for(let i=0,j=HOUSE_FOOTPRINT.length-1;i<HOUSE_FOOTPRINT.length;j=i++){
  const a=HOUSE_FOOTPRINT[i],b=HOUSE_FOOTPRINT[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export const HOUSE_LIVING_MARK=houseWorld([.65,-1.275]);
export const HOUSE_LIVING_SEAT_HEIGHT=.53;
export const HOUSE_KITCHEN_MARK=houseWorld([-3.05,-.15]);
export const HOUSE_STOVE=houseWorld([-4.18,-.25]);
// Offset the adult's right-paw reach: facing the root directly at the stove
// put the pan behind the hotplate, over the adjacent wooden counter.
export const HOUSE_KITCHEN_FACING=Math.atan2(HOUSE_STOVE[0]-HOUSE_KITCHEN_MARK[0],HOUSE_STOVE[1]-HOUSE_KITCHEN_MARK[1])+.30;
export const HOUSE_PREP_TABLE={position:houseWorld([-4.53,1.55]),height:1.20,width:2.55,depth:1.62} as const;
export const HOUSE_READING_TABLE={position:houseWorld([-.83,-.22]),height:.793,width:1.96,depth:1.45} as const;
/** A three-tread helper beside the prep table, approached from its east side.
 * It leaves the stove's adult standing space and the front circulation clear. */
export const HOUSE_COOKING_HELPER={position:houseWorld([-2.96,1.95]),height:.80,width:.70,depth:1.20,stepDepth:.28,steps:3,
 facing:-Math.PI/2,entry:houseWorld([-1.83,1.95])} as const;
export const HOUSE_CHILD_COOK_POSITION=houseWorld([-2.96,2.30]);
/** Working objects sit on the reachable east edge, away from the active pan. */
export const houseWorkPropZ=(item:PropId):number=>item==='pancakes'||item==='cake'||item==='jam_jar'?1.48:item==='frying_pan'?2.30:item==='flour_bag'?1.86:2.02;
export const housePickupPosition=(item:PropId):Vec2=>houseWorld([-3.22,houseWorkPropZ(item)]);
export function houseCookingSupportHeightAt(x:number,z:number):number {
 const s=HOUSE_COOKING_HELPER,dx=x-s.position[0],dz=Math.abs(z-s.position[1]);
 if(dz>=s.depth/2||dx<-.35||dx>.35+s.stepDepth*2)return 0;
 const far=.35+s.stepDepth*2;
 const h=s.height/3*(smooth((far-dx)/.14)+smooth((far-s.stepDepth-dx)/.14)+smooth((.35-dx)/.14));
 return h*smooth((dx+.35)/.08)*smooth((s.depth/2-dz)/.08);
}
