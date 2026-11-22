import {textStory} from './interactive-objects-fixtures';
import {parallelStories} from './parallel-interactions-fixtures';
import {compile} from '../src/compiler/compile';
import {EMPTY_CARRY} from '../src/compiler/audioCues';
import {DEFAULT_REMIX,type BeatScript,type Timeline} from '../src/shared/schema';
import {directorCases} from './kitchen-bench-director-fixtures';

export const KITCHEN_TEXTS=['Masha picks carrot number 2 from the garden.','Masha carries carrot number 2 into the kitchen.','Masha puts carrot number 2 in the bowl.','Bear takes carrot number 2 from the bowl and puts it into the pot.'];
export const KITCHEN_RU=['Маша берёт морковку номер 2 с грядки.','Маша несёт морковку номер 2 на кухню.','Маша кладёт морковку номер 2 в миску.','Медведь берёт морковку номер 2 из миски и кладёт её в кастрюлю.'];
export const BENCH_TEXTS=['Masha takes the ball and puts it on the bench.','Masha nudges the ball off the bench and waits.','Masha walks to the clearing, waits, and picks up the ball.'];
export const BENCH_RU=['Маша берёт мяч и кладёт его на скамейку.','Маша толкает мяч со скамейки и ждёт.','Маша идёт на поляну, ждёт и поднимает мяч.'];
export function kitchenBenchStories():Record<string,Timeline>{
 const previous=parallelStories();
 const stories:Record<string,Timeline>={kitchen:textStory(KITCHEN_TEXTS),kitchenRu:textStory(KITCHEN_RU,'ru'),bench:textStory(BENCH_TEXTS),benchRu:textStory(BENCH_RU,'ru'),...previous};
 for(const c of directorCases){
  const result=compile(c.script as BeatScript,c.world as any,{paragraphId:c.id,version:1,lang:c.lang as 'en'|'ru',remix:DEFAULT_REMIX,isFirst:true,carry:EMPTY_CARRY});
  stories[`live-${c.id}`]={segments:[{offset:0,segment:result.segment}],duration:result.segment.duration};
 }
 return stories;
}
