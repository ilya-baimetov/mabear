import {createRapierReplay} from '../../src/engine/physics/rapierReplay';
import {beat,story} from '../../scripts/rapier-trial-fixtures';
import {initialWorldState} from '../../src/compiler/worldState';
const initial=initialWorldState();initial.actors.masha={...initial.actors.masha,pos:[2,4.6],mark:null,facing:Math.PI};
const tl=story([beat('walk_to',{target:'clearing'}),beat('hug',{actor:'hare',target:'masha'}),beat('wave')],initial);
const rr=await createRapierReplay({sampleBall:f=>({pos:[0,1,0],rotation:[0,0,0,1]})});rr.setTimeline(tl);
console.log('reason',rr.inspect(tl,tl.duration).reason,'end',rr.evaluate(tl,tl.duration).actors.masha.pos);
console.log('Masha',tl.segments[0].segment.actorClips.masha.map(c=>[c.verb,c.params.target,c.params.ambient]));
console.log('hare',tl.segments[0].segment.actorClips.hare.map(c=>[c.verb,c.params.target,c.params.ambient]));rr.dispose();
