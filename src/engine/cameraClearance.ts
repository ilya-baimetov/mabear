import type { FrameState } from './api';
import type { CamKey } from '../shared/schema';
import { STYLES } from './motion/verbs/common';
import {sceneLocationAt} from '../shared/bible/set';

// The room's lowest ceiling beams are at 3.43 m. Clearance must leave room for
// the near plane instead of using the outdoor three-metre lift through the roof.
export const INTERIOR_CAMERA_MAX_Y=3.05;

/** Lift a low story camera above an intervening actor. The focal actor is excluded.
 * Uses a smooth clearance band, so body sway doesn't toggle a camera cut or hide a story actor.
 */
export function clearForeground(camera:CamKey,actors:FrameState['actors']):CamKey {
  const followed=camera.followActor&&actors[camera.followActor];
  if(followed&&followed.opacity>.1&&followed.posture!=='offstage'&&sceneLocationAt(followed.pos[0],followed.pos[2])===(camera.location??sceneLocationAt(camera.look[0],camera.look[2]))){
    // Carried-pair tracking follows the evaluated turn/eased path. The planned
    // orbit retains its angle, height and distance; seeking remains stateless.
    const dx=followed.pos[0]-camera.look[0],dz=followed.pos[2]-camera.look[2];
    camera={...camera,pos:[camera.pos[0]+dx,camera.pos[1],camera.pos[2]+dz],look:[followed.pos[0],camera.look[1],followed.pos[2]]};
  }
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
  const indoors=(camera.location??sceneLocationAt(lx,lz))==='house';
  const maxLift=indoors?Math.max(0,INTERIOR_CAMERA_MAX_Y-cy):3;
  return lift>.01&&maxLift>.01?{...camera,pos:[cx,cy+Math.min(maxLift,lift),cz]}:camera;
}
