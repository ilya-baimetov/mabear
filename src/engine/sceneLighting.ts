import type {LightingParams,LookRig} from './look';
import type {SceneLocation} from '../shared/bible/set';

/** Reapply absolute intensities after the time-of-day cache, so scene switches and
 * repeated indoor frames cannot cumulatively dim the persistent light rig. */
export function applySceneLightIntensities(rig:Pick<LookRig,'key'|'hemi'|'rim'>,params:LightingParams,location:SceneLocation):void{
  const indoor=location==='house';
  rig.key.intensity=params.sunIntensity*(indoor?.32:1);
  rig.hemi.intensity=params.hemiIntensity*(indoor?.72:1);
  rig.rim.intensity=params.rimIntensity*(indoor?.28:1);
}
