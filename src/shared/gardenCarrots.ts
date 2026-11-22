import {CARROT_IDS,isCarrot,type CarrotId,type Vec3} from './schema';
/** The front/south carrot bed. These replace its decorative instances, not add a second crop. */
export const GARDEN_CARROTS = CARROT_IDS.map((id,index)=>({
 id,index,position:[3.7+index*.42,-.13,-5.57+(index%2?.01:-.01)] as Vec3,
 yaw:index*1.7+1,
}));
export function plantedCarrotPlacement(id:CarrotId):{pos:Vec3;rot:Vec3}{
 const slot=GARDEN_CARROTS[CARROT_IDS.indexOf(id)];
 return{pos:[...slot.position],rot:[0,slot.yaw,0]};
}
/** Harvested carrots put down in the garden lie on the front path, never replant. */
export function looseGardenCarrotPlacement(id:CarrotId):{pos:Vec3;rot:Vec3}{
 const slot=GARDEN_CARROTS[CARROT_IDS.indexOf(id)];
 return{pos:[slot.position[0],.136,-5.12],rot:[Math.PI/2,.25,.15]};
}
export function numberedCarrot(text:string):CarrotId|null{
 const n=/(?:carrot(?:s)?|морков\p{L}*)\s*(?:number|no\.?|#|номер|№)?\s*([1-9])(?!\d)/iu.exec(text)?.[1];
 if(n)return CARROT_IDS[Number(n)-1];
 const ordinal=/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\s+carrot\b/iu.exec(text)?.[1]?.toLowerCase();
 const ru=/(перв\p{L}*|втор\p{L}*|треть\p{L}*|четв[её]рт\p{L}*|пят\p{L}*|шест\p{L}*|седьм\p{L}*|восьм\p{L}*|девят\p{L}*)\s+морков/iu.exec(text)?.[1]?.toLowerCase();
 const i=ordinal?['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth'].indexOf(ordinal):ru?['перв','втор','треть','четв','пят','шест','седьм','восьм','девят'].findIndex(p=>ru.startsWith(p)):-1;
 return i>=0?CARROT_IDS[i]:null;
}
export {isCarrot};
