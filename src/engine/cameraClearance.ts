import type { FrameState } from './api';
import type { CamKey } from '../shared/schema';
import { STYLES } from './motion/verbs/common';

/** Lift a low story camera above an intervening actor. The focal actor is excluded.
 * Uses a smooth clearance band, so body sway doesn't toggle a camera cut or hide a story actor.
 */
export function clearForeground(camera:CamKey,actors:FrameState['actors']):CamKey {
  const [cx,cy,cz]=camera.pos,[lx,ly,lz]=camera.look;
  const dx=lx-cx,dz=lz-cz,l2=dx*dx+dz*dz;if(l2<.01)return camera;
  let lift=0;
  for(const [id,a]of Object.entries(actors)){
    if(a.opacity<.1||a.posture==='offstage')continue;
    const h=STYLES[id as keyof typeof STYLES].height;
    const radius=h*(id==='rival_bear'?.34:.28),x=a.pos[0],z=a.pos[2];
    if(Math.hypot(x-lx,z-lz)<radius+.55)continue;
    const t=((x-cx)*dx+(z-cz)*dz)/l2;
    if(t<-.15||t>.88)continue;
    const lateral=Math.hypot(x-(cx+dx*t),z-(cz+dz*t));
    const edge=Math.min(1,Math.max(0,(radius+.4-lateral)/.4));
    if(edge===0)continue;
    const top=a.pos[1]+h*(a.posture==='sleep'?.28:a.posture==='sit'?.72:1.03);
    const needed=(top+.12-Math.max(0,t)*ly)/(1-Math.max(0,t))-cy;
    lift=Math.max(lift,Math.max(0,needed)*edge*edge*(3-2*edge));
  }
  return lift>.01?{...camera,pos:[cx,cy+Math.min(3,lift),cz]}:camera;
}
