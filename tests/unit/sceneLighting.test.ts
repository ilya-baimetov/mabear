import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {TOD_PRESETS} from '../../src/engine/look';
import {applySceneLightIntensities} from '../../src/engine/sceneLighting';

describe('cached time-of-day lighting across indoor frames',()=>{
  it('retains steady indoor light and restores yard daylight without changing the lighting key',()=>{
    const rig={key:new THREE.DirectionalLight(),hemi:new THREE.HemisphereLight(),rim:new THREE.DirectionalLight()};
    const p=TOD_PRESETS.day;
    applySceneLightIntensities(rig,p,'house');
    const first=[rig.key.intensity,rig.hemi.intensity,rig.rim.intensity];
    for(let frame=0;frame<300;frame++)applySceneLightIntensities(rig,p,'house');
    expect([rig.key.intensity,rig.hemi.intensity,rig.rim.intensity]).toEqual(first);
    expect(first.every(v=>v>0)).toBe(true);
    applySceneLightIntensities(rig,p,'yard');
    expect([rig.key.intensity,rig.hemi.intensity,rig.rim.intensity]).toEqual([p.sunIntensity,p.hemiIntensity,p.rimIntensity]);
    applySceneLightIntensities(rig,p,'house');
    expect([rig.key.intensity,rig.hemi.intensity,rig.rim.intensity]).toEqual(first);
  });
});
