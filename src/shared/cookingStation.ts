import type {Vec2} from './schema';
import {houseCookingSupportHeightAt} from './houseLayout';

/** A real two-step helper beside the outdoor table. Shared by set geometry,
 * compiler staging and camera height; it is not a hidden actor-only lift. */
export const COOKING_STATION = {
  position: [1.1, .65] as Vec2,
  facing: Math.atan2(.9,.85),
  width: .76,
  top: .48,
  topBack: .31,
  topFront: 1.01,
  stepBack: -.09,
  stepTop: .24,
} as const;

/** Continuous support while the walk cycle mounts/dismounts the two treads.
 * The flat central landing covers both feet throughout cooking/gestures. */
export function cookingSupportHeightAt(x:number,z:number):number {
  const indoors=houseCookingSupportHeightAt(x,z);if(indoors>0)return indoors;
  const s=COOKING_STATION,dx=Math.abs(x-s.position[0]);
  if(dx>=s.width/2||z<=s.stepBack||z>=s.topFront)return 0;
  const ramp=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
  const first=s.stepTop*ramp((z-s.stepBack)/.20);
  const second=(s.top-s.stepTop)*ramp((z-(s.topBack-.10))/.20);
  return (first+second)*ramp((s.width/2-dx)/.10)*ramp((s.topFront-z)/.12);
}
