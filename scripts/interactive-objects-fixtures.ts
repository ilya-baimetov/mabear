import {parseParagraph} from '../src/director/offline/parser';
import {compile} from '../src/compiler/compile';
import {initialWorldState} from '../src/compiler/worldState';
import {EMPTY_CARRY} from '../src/compiler/audioCues';
import {DEFAULT_REMIX,type Lang,type Timeline,type WorldState} from '../src/shared/schema';
import {getFixture} from '../src/director/fixtures';
import {compileEpisode} from '../src/compiler/episode';

export const ENTRY_TEXT='Bear goes to the house, opens the door and comes in.';
export const ENTRY_RU='Медведь идёт к дому, открывает дверь и входит.';
export function textStory(texts:string[],lang:Lang='en',world:WorldState=initialWorldState()):Timeline {
  const timeline:Timeline={segments:[],duration:0};let carry=EMPTY_CARRY;
  texts.forEach((text,i)=>{
    const script=parseParagraph(text,lang,world);
    const result=compile(script,world,{paragraphId:`door-${i}`,version:1,lang,remix:DEFAULT_REMIX,isFirst:i===0,carry});
    timeline.segments.push({offset:timeline.duration,segment:result.segment});timeline.duration+=result.segment.duration;
    world=result.segment.endState;carry=result.carry;
  });return timeline;
}
export function objectStories():Record<string,Timeline>{
  const prop=initialWorldState();prop.actors.bear.holding='book';prop.props.book.at='bear';
  const sample=(id:'cozy_evening'|'bears_nap')=>compileEpisode(getFixture(id,'en')!.paragraphs.map((p,i)=>({paragraphId:`${id}-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
  return {
    entry:textStory([ENTRY_TEXT,'Bear closes the door. Bear waves.']),
    russian:textStory([ENTRY_RU,'Медведь закрывает дверь и машет.'],'ru'),
    roundtrip:textStory([ENTRY_TEXT,'Bear closes the door.','Bear walks outside to the clearing. Bear closes the door.']),
    held:textStory([ENTRY_TEXT,'Bear waves.'],'en',prop),
    approach:textStory(['Bear walks to the door.']),
    cozy:sample('cozy_evening'),regression:sample('bears_nap'),
  };
}
