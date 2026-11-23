import {compileEpisode} from '../src/compiler/episode';
import {initialWorldState} from '../src/compiler/worldState';
import {parseParagraph} from '../src/director/offline/parser';
import {DEFAULT_REMIX,type Beat,type BeatScript,type Timeline,type CamKey} from '../src/shared/schema';
import {textStory,objectStories} from './interactive-objects-fixtures';
import {getFixture} from '../src/director/fixtures';
import {cupboardStories} from './cupboard-fixtures';
export const CARROT_TEXTS=['Masha picks carrot number 2 from the garden.','Masha walks to the bench and puts carrot number 2 on the bench.','Masha walks to the clearing.','Masha picks carrot number 2 from the bench. Masha waves.'];
export const CARROT_RU=['Маша берёт морковку номер 2 с грядки.','Маша идёт к скамейке и кладёт морковку номер 2 на скамейку.','Маша идёт на поляну.','Маша берёт морковку номер 2 со скамейки. Маша машет.'];
export function beat(verb:Beat['verb'],extra:Partial<Beat>={}):Beat{return{actor:'masha',verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'wide',...extra};}
export function script(beats:Beat[],summary='Local continuity story'):BeatScript{return{summary,time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'start'},ambience:[],beats,rule_hits:[]};}
export const BALL_TEXTS=['Masha takes the ball and walks to the bench.','Masha drops the ball. Masha waits. Masha walks to the clearing. Masha waits. Masha picks up the ball. Masha waves.'];
export const BALL_BEATS=[beat('drop',{item:'ball',shot:'medium'}),beat('surprised'),beat('idle',{delay_s:5}),beat('walk_to',{target:'clearing'}),beat('idle'),beat('take',{item:'ball',target:'ball',shot:'medium'}),beat('wave',{shot:'medium'})];
export function parallelFixtures(){return{
 rapierParsed:{id:'garden_party' as const,lang:'en' as const,title:'Find the ball again — parsed text',paragraphs:BALL_TEXTS.map(text=>({text,beatScript:parseParagraph(text,'en',initialWorldState())}))},
 carrots:{id:'garden_party' as const,lang:'en' as const,title:'One carrot, one story',paragraphs:CARROT_TEXTS.map(text=>({text,beatScript:parseParagraph(text,'en',initialWorldState())}))},
 rapier:{id:'garden_party' as const,lang:'en' as const,title:'Find the ball again',paragraphs:[{text:'Masha takes the ball and walks to the bench.',beatScript:script([beat('take',{item:'ball',target:'ball',shot:'medium'}),beat('walk_to',{target:'bench'})])},{text:'Masha drops the ball, watches it settle, walks to the clearing, then comes back and picks it up.',beatScript:script(BALL_BEATS)}]},
};}
export function parallelStories():Record<string,Timeline>{
 const fixture=parallelFixtures().rapier;
 const continuity=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`ball-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
 const continuityWide=structuredClone(continuity);
 const camera:CamKey={pos:[5.8,3.2,7.8],look:[1.3,.55,2.6],fov:48,location:'yard'};
 for(const {segment} of continuityWide.segments)segment.camera=[{start:0,dur:segment.duration,from:structuredClone(camera),to:structuredClone(camera),shot:'wide',overridden:true}];
 const fixtures=parallelFixtures(),compileFixture=(paragraphs:{beatScript:BeatScript}[],lang:'en'|'ru'='en')=>compileEpisode(paragraphs.map((p,i)=>({paragraphId:`story-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang).timeline;
 const carrots=compileFixture(fixtures.carrots.paragraphs),carrotsRu=compileFixture(CARROT_RU.map(text=>({beatScript:parseParagraph(text,'ru',initialWorldState())})),'ru'),objects=objectStories(),cupboard=cupboardStories();
 const fishing=compileFixture(getFixture('fishing_trip','en')!.paragraphs);
 return{fishing,continuity,continuityWide,parsedContinuity:compileFixture(fixtures.rapierParsed.paragraphs),carrots,carrotsRu,cupboard:cupboard.cupboard,entry:objects.entry,regression:objects.regression,cozy:objects.cozy};
}
