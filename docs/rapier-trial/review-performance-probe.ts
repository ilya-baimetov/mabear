import {createRapierReplay} from '../../src/engine/physics/rapierReplay';
import {beat,story} from '../../scripts/rapier-trial-fixtures';
const tl=story([beat('idle')]);tl.duration=180;tl.segments[0].segment.duration=180;
const r=await createRapierReplay({sampleBall:()=>({pos:[0,1,0],rotation:[0,0,0,1]})});r.setTimeline(tl);
const s=performance.now();r.evaluate(tl,180);console.log(JSON.stringify({coldSeekMs:performance.now()-s,diagnostics:r.inspect(tl,180)}));r.dispose();
