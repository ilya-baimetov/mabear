import {trialStories} from './rapier-trial-fixtures';
import {createRapierReplay} from '../src/engine/physics/rapierReplay';
import {evaluate} from '../src/engine/player/evaluate';
const stories=trialStories();
for(const [id,tl] of Object.entries(stories)){
 const replay=await createRapierReplay({sampleBall:f=>({pos:[f.actors.masha.pos[0],1,f.actors.masha.pos[2]],rotation:[0,0,0,1]})});replay.setTimeline(tl);
 console.log(id,tl.duration,tl.segments.flatMap(s=>s.segment.actorClips.masha.filter(c=>!c.params.ambient).map(c=>({t:s.offset+c.start,dur:c.dur,verb:c.verb,params:c.params}))));
 for(let t=0;t<=Math.min(15,tl.duration);t+=.5){const raw=evaluate(tl,t),f=replay.evaluate(tl,t),s=replay.inspect(tl,t);console.log(JSON.stringify({t,raw:raw.actors.masha.pos,p:f.actors.masha.pos,ball:f.props.ball,ground:s.grounded,reason:s.reason,stride:s.stride}));}
 console.log('end',replay.inspect(tl,tl.duration));replay.dispose();
}
