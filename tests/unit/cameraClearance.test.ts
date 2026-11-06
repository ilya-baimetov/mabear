import {describe,it,expect} from 'vitest';
import {clearForeground} from '../../src/engine/cameraClearance';
import {evaluate} from '../../src/engine/player/evaluate';
import type {CamKey} from '../../src/shared/schema';
const camera:CamKey={pos:[0,1,5],look:[0,.8,0],fov:35};
describe('foreground cast clearance',()=>{
 it('raises a low camera above an intervening bear while retaining the focal point',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.rival_bear,{opacity:1,pos:[0,0,3]});const c=clearForeground(camera,actors);expect(c.pos[1]).toBeGreaterThan(2.5);expect(c.look).toEqual(camera.look);expect(clearForeground(camera,actors)).toEqual(c);});
 it('does not treat the focal actor or offstage cast as obstructions',()=>{const actors=evaluate({segments:[],duration:0},0).actors;for(const a of Object.values(actors))a.opacity=0;Object.assign(actors.masha,{opacity:1,pos:[0,0,0]});expect(clearForeground(camera,actors)).toEqual(camera);});
});
