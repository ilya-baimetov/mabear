import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {parallelStories} from '../../scripts/parallel-interactions-fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {clearForeground} from '../../src/engine/cameraClearance';

describe('actual-story initial ball pickup visibility',()=>{
 it('keeps the ground ball and hands in frame with no picnic table or samovar in front',()=>{
  const tl=parallelStories().continuity,entry=tl.segments[0],take=entry.segment.actorClips.masha.find(c=>c.verb==='take'&&c.params.item==='ball')!;
  expect(take.params.pickUpAt).toBe('clearing');
  for(const u of [.05,.2,.35,.49,.5,.6,.8,.95]){
   const f=evaluate(tl,entry.offset+take.start+take.dur*u),view=clearForeground(f.camera,f.actors),ball=take.params.pickUpPosition!;
   const subject=new Vector3(ball[0],ball[1]+.15,ball[2]),eye=new Vector3(...view.pos);
   const camera=new PerspectiveCamera(view.fov,16/9,.05,100);camera.position.copy(eye);camera.lookAt(...view.look);camera.updateMatrixWorld();
   const projected=subject.clone().project(camera);expect(Math.abs(projected.x)).toBeLessThan(.9);expect(Math.abs(projected.y)).toBeLessThan(.9);
   // Conservatively enclose the actual picnic tabletop and samovar together.
   // A ray through this box would obscure the action, even if the actor is visible.
   for(let k=.02;k<1;k+=.02){const p=eye.clone().lerp(subject,k);expect(p.x>1.1&&p.x<2.9&&p.y>0&&p.y<1.9&&p.z>.65&&p.z<2.35).toBe(false);}
  }
 });
});
