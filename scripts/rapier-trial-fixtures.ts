import {compileEpisode} from '../src/compiler/episode';
import {initialWorldState} from '../src/compiler/worldState';
import {FIXTURES} from '../src/director/fixtures';
import {DEFAULT_REMIX,type Beat,type BeatScript,type Timeline,type WorldState,type CamKey} from '../src/shared/schema';
import recordings from '../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../src/shared/speech';
const speechDurations=Object.fromEntries((recordings as SpeechRecording[]).map(r=>[speechKey(r.text,r.lang),r.duration]));
export function beat(verb:Beat['verb'],extra:Partial<Beat>={}):Beat {
  return {actor:'masha',verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'wide',...extra};
}
export function story(beats:Beat[],initial:WorldState=initialWorldState()):Timeline {
  const script:BeatScript={summary:'Local yard physics trial',time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'start'},ambience:[],beats,rule_hits:[]};
  return compileEpisode([{paragraphId:'rapier-story',version:1,beatScript:script,remix:DEFAULT_REMIX}],'en',initial,speechDurations).timeline;
}
export function trialStories():Record<string,Timeline> {
  const initial=initialWorldState();
  initial.actors.masha={...initial.actors.masha,pos:[2,4.6],mark:null,facing:Math.PI};
  // Existing compiler route: the bench is absent from path-planning obstacles.
  const obstacle=story([beat('walk_to',{target:'bench'}),beat('idle'),beat('walk_to',{target:'clearing'}),beat('wave')],initial);
  const dropState=initialWorldState();
  dropState.actors.masha={...dropState.actors.masha,pos:[2,2.56],mark:'clearing',facing:Math.PI/2,holding:'ball'};
  dropState.props.ball={at:'masha'};
  const drop=story([beat('wave'),beat('drop',{item:'ball'}),beat('surprised'),beat('idle',{delay_s:5}),beat('wave')],dropState);
  // Authored, matched coverage for the contact evidence, through the normal camera track.
  const cameras:Record<string,CamKey>={obstacle:{pos:[5,2.7,6.5],look:[1,.55,2.8],fov:48,location:'yard'},drop:{pos:[5.5,1.65,2],look:[2,.5,2.8],fov:40,location:'yard'}};
  for(const [id,tl] of Object.entries({obstacle,drop})){
    const camera=cameras[id as keyof typeof cameras];
    for(const {segment} of tl.segments)segment.camera=[{start:0,dur:segment.duration,from:structuredClone(camera),to:structuredClone(camera),shot:'wide',overridden:true}];
  }
  const nap=FIXTURES.find(f=>f.id==='bears_nap'&&f.lang==='en')!;
  const regression=compileEpisode(nap.paragraphs.map((p,i)=>({paragraphId:`nap-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en',undefined,speechDurations).timeline;
  return {obstacle,drop,regression};
}
