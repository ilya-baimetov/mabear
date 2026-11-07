import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {FIXTURES} from '../src/director/fixtures';
import {DEFAULT_REMIX,type Beat,type BeatScript,type ActorId,type CamKey} from '../src/shared/schema';
import {evaluate} from '../src/engine/player/evaluate';
import {setShadowQuality} from '../src/engine/look';
const stage=await createStage(document.querySelector('canvas')!);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const timelines=FIXTURES.map(f=>compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),f.lang).timeline);
const beat=(actor:ActorId,verb:Beat['verb'],extra:Partial<Beat>={}):Beat=>({actor,verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'wide',...extra});
const script:BeatScript={summary:'The wolves beside their ambulance',time_of_day:'day',mood:'calm',music:{mood:'calm',intensity:'soft',change:'start'},ambience:null,rule_hits:[],beats:[beat('wolf_a','walk_to',{target:'van'}),beat('wolf_b','wave',{target:'wolf_a',with_previous:true}),beat('wolf_a','laugh'),beat('wolf_b','nod',{target:'wolf_a',with_previous:true})]};
const wolves=compileEpisode([{paragraphId:'wolves',version:1,beatScript:script,remix:DEFAULT_REMIX}],'en').timeline;
const findT=(i:number,actor:ActorId,verb:string)=>timelines[i].segments.flatMap(s=>s.segment.actorClips[actor].filter(c=>c.verb===verb&&!c.params.ambient).map(c=>s.offset+c.start+c.dur*.45))[0];
const shots:Record<string,{index:number;t:number;camera?:CamKey;empty?:boolean}>={
 'pond-story':{index:6,t:findT(6,'bear','fish')},
 'pond-reference':{index:6,t:findT(6,'bear','fish'),camera:{pos:[-8.2,1.05,12.35],look:[-3.8,.8,5.7],fov:54,location:'pond'},empty:true},
 'pond-overview':{index:6,t:findT(6,'bear','fish'),camera:{pos:[-.5,4.6,15],look:[-8.5,.3,8.5],fov:48,location:'pond'},empty:true},
 'wolves-story':{index:-1,t:2.12},
 'ambulance-reference':{index:-1,t:2.12,camera:{pos:[10.8,1.75,-6.3],look:[14.1,1.25,-1],fov:48,location:'wolves'},empty:true},
 'interior-story':{index:8,t:findT(8,'bear','cook')},
 'interior-reference':{index:8,t:findT(8,'masha','eat'),camera:{pos:[-5.4,1.65,-3.8],look:[-8.15,1.25,-7],fov:56,location:'house'},empty:true},
 'yard-story':{index:0,t:6.692},
};
(window as unknown as {__sceneFidelity:unknown}).__sceneFidelity={shots,stage,render(name:string){
 const shot=shots[name],timeline=shot.index<0?wolves:timelines[shot.index],frame=evaluate(timeline,shot.t);
 if(shot.camera)frame.camera=shot.camera;if(shot.empty){frame.cast=[];frame.fx=[];for(const prop of Object.values(frame.props))prop.visible=false;}
 stage.render(frame);stage.render(frame);
 return{png:document.querySelector('canvas')!.toDataURL(),t:shot.t,camera:frame.camera,stats:stage.stats()};
},async bench(name:string,n=8,reflection=true,width=640,height=360,shadow=2048){
 stage.resize(width,height);setShadowQuality(stage.look,shadow);const mirror=stage.set.elements.pond.getObjectByName('set:pond:reflection')!;mirror.visible=reflection;
 const shot=shots[name],timeline=shot.index<0?wolves:timelines[shot.index],gl=stage.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 stage.render(evaluate(timeline,shot.t));gl.finish();await new Promise(requestAnimationFrame);
 const start=performance.now();let calls=0;for(let i=0;i<n;i++){stage.render(evaluate(timeline,shot.t+i/30));calls+=stage.stats().drawCalls;gl.finish();await new Promise(requestAnimationFrame);}const ms=performance.now()-start;
 mirror.visible=true;return{ms,n,fps:n*1000/ms,averageDrawCalls:calls/n,renderer:String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),reflection,buffer:[width,height],shadow};
}};
