import type {Beat,BeatScript,FixtureEpisode,Lang} from '../../shared/schema';

const beat=(actor:Beat['actor'],verb:Beat['verb'],extra:Partial<Beat>={}):Beat=>({actor,verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'auto',...extra});
const script=(summary:string,beats:Beat[],first=false):BeatScript=>({summary,time_of_day:first?'sunset':null,mood:'calm',music:{mood:'calm',intensity:'soft',change:first?'start':'continue'},ambience:first?['night_crickets']:null,beats,rule_hits:[]});

/** An indoor story, using exactly the same actions available to authored text. */
export function cozyEvening(lang:Lang):FixtureEpisode{
 const ru=lang==='ru';
 return {id:'cozy_evening',lang,title:ru?'Уютный вечер':'Cozy evening',paragraphs:[
  {text:ru?'На закате Медведь берёт сковороду, идёт на кухню и готовит блины. Маша идёт в гостиную и садится в кресло: «Как уютно!» Играет тихая музыка, за окном стрекочут сверчки.':'At sunset, Bear takes the frying pan, walks into the kitchen and cooks pancakes. Masha walks into the living room and sits in the armchair: "So cozy!" Soft music plays, and crickets chirp outside.',
   beatScript:script(ru?'Медведь готовит блины на кухне, а Маша устраивается в гостиной.':'Bear cooks in the kitchen while Masha settles in the living room.',[
    beat('bear','take',{target:'frying_pan',item:'frying_pan',emote:'grunt',sfx:'pot_clang'}),
    beat('bear','walk_to',{target:'house_kitchen'}),beat('masha','walk_to',{target:'house_living',with_previous:true}),
    beat('bear','cook',{target:'house_kitchen',with_previous:true,shot:'wide',emote:'hum'}),beat('masha','sit',{target:'house_living',with_previous:true,line:ru?'Как уютно!':'So cozy!',emote:'sigh'}),
   ],true)},
  {text:ru?'Медведь берёт блины на кухне и отдаёт их Маше. Маша ест блины в кресле и говорит: «Как вкусно!»':'Bear takes the pancakes from the kitchen and gives them to Masha. Masha eats in the armchair and says, "Delicious!"',
   beatScript:script(ru?'Медведь приносит блины, и Маша пробует их в гостиной.':'Bear brings the pancakes to Masha in the living room.',[
    beat('bear','take',{target:'pancakes',item:'pancakes'}),beat('bear','give',{target:'masha',item:'pancakes',emote:'chuckle'}),
    beat('masha','eat',{item:'pancakes',line:ru?'Как вкусно!':'Delicious!',shot:'close',emote:'giggle'}),beat('bear','nod'),
   ])},
  {text:ru?'Маша встаёт и идёт во двор. Медведь идёт за ней на поляну. Маша машет ему: «Спасибо за блины!»':'Masha stands up and walks outside to the clearing. Bear follows her into the yard. Masha waves, "Thank you for the pancakes!"',
   beatScript:script(ru?'После уютного ужина друзья выходят во двор.':'After their cozy supper, the friends return to the yard.',[
    beat('masha','stand_up'),beat('masha','walk_to',{target:'clearing'}),beat('bear','walk_to',{target:'clearing',with_previous:true}),
    beat('masha','wave',{target:'bear',line:ru?'Спасибо за блины!':'Thank you for the pancakes!',emote:'cheer'}),
   ])},
 ]};
}
