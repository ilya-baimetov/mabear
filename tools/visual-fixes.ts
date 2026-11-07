// Bounded evidence harness: the same assets, fixtures, compiler and renderer as the main app.
import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {FIXTURES} from '../src/director/fixtures';
import {DEFAULT_REMIX,type ActorId} from '../src/shared/schema';
import {evaluate} from '../src/engine/player/evaluate';
const stage=await createStage(document.querySelector('canvas')!);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const timelines=FIXTURES.map(f=>compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),f.lang).timeline);
const w=window as unknown as {__visualFixes:unknown};
w.__visualFixes={stage,timelines,timeFor(index:number,actor:ActorId,verb:string,n=0){return timelines[index].segments.flatMap(s=>s.segment.actorClips[actor].filter(c=>c.verb===verb&&!c.params.ambient).map(c=>s.offset+c.start+c.dur*.45))[n];},render(index:number,t:number,focus?:ActorId,angle=.45){
 const frame=evaluate(timelines[index],t);
 if(focus){const actor=frame.actors[focus],h=stage.rigs[focus].height,yaw=actor.yaw+angle,d=h*1.9;
  const look:[number,number,number]=[actor.pos[0],actor.pos[1]+h*.56,actor.pos[2]];
  frame.camera={pos:[look[0]+Math.sin(yaw)*d,look[1]+h*.16,look[2]+Math.cos(yaw)*d],look,fov:35};
 }
 stage.render(frame);return {png:document.querySelector('canvas')!.toDataURL('image/png'),actors:frame.actors};
}};
