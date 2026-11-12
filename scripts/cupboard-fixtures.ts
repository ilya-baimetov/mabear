import {textStory} from './interactive-objects-fixtures';
import {compileEpisode} from '../src/compiler/episode';
import {getFixture} from '../src/director/fixtures';
import {DEFAULT_REMIX} from '../src/shared/schema';
export const CUPBOARD_TEXTS=['Bear walks to the kitchen.','Bear opens the cupboard, takes a jar of honey out and closes the cupboard.','Bear walks to the living room. Bear waves.'];
export const CUPBOARD_RU=['Медведь идёт на кухню.','Медведь открывает шкаф, достаёт банку мёда и закрывает шкаф.','Медведь идёт в гостиную и машет.'];
export function cupboardStories(){
 const sample=(id:'cozy_evening'|'bears_nap')=>compileEpisode(getFixture(id,'en')!.paragraphs.map((p,i)=>({paragraphId:`${id}-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
 return {cupboard:textStory(CUPBOARD_TEXTS),russian:textStory(CUPBOARD_RU,'ru'),implicit:textStory(['Bear takes a jar of honey from the cupboard. Bear closes it.']),empty:textStory([...CUPBOARD_TEXTS,'Bear opens the cupboard and takes another jar of honey.']),cozy:sample('cozy_evening'),regression:sample('bears_nap')};
}
