import {KITCHEN_CONTAINERS,isKitchenContainer} from './kitchenContainers';
import {isCarrot} from './schema';
import {looseGardenCarrotPlacement,plantedCarrotPlacement} from './gardenCarrots';
import {MARKS} from './bible/set';
import {PROP_IDS,type MarkId,type PropId,type Vec3} from './schema';
import {HOUSE_PREP_TABLE,HOUSE_READING_TABLE,houseWorld,houseWorkPropZ} from './houseLayout';
import {CUPBOARD_JAR_POSITION,KITCHEN_CUPBOARD} from './interactiveObjects';

/** Semantic resting heights shared by compiler choreography and the evaluator. */
export const PROP_REST_HEIGHT:Partial<Record<MarkId,number>>={
 kitchen_bowl:KITCHEN_CONTAINERS.kitchen_bowl.baseY,kitchen_pot:KITCHEN_CONTAINERS.kitchen_pot.baseY,
 cupboard:KITCHEN_CUPBOARD.shelfY,
 table:.78,bench:.47,porch:.32,pier:.28,hammock:.66,beehive:.62,woodpile:.55,swing:.47,house_kitchen:HOUSE_PREP_TABLE.height,house_living:HOUSE_READING_TABLE.height,
};
export function propRestPosition(prop:PropId,mark:MarkId):Vec3{
 if(isKitchenContainer(mark)){const c=KITCHEN_CONTAINERS[mark];return[c.position[0],c.baseY,c.position[1]];}
 if(mark==='cupboard')return [...CUPBOARD_JAR_POSITION];
 if(mark==='house_kitchen'){const p=houseWorld([prop==='frying_pan'?-3.47:-3.40,houseWorkPropZ(prop)]);return[p[0],HOUSE_PREP_TABLE.height+(prop==='flour_bag'?.027:0),p[1]];}
 const angle=PROP_IDS.indexOf(prop)*2.399963,radius=mark==='table'?.32:.4,p=mark==='house_living'?HOUSE_READING_TABLE.position:MARKS[mark].pos;
 // The bench seat is narrow: spread along its width, never off its front edge.
 return[p[0]+Math.cos(angle)*radius,PROP_REST_HEIGHT[mark]??.03,p[1]+(mark==='bench'?0:Math.sin(angle)*radius)];
}

/** Physical prop slots, also used by rendering. Keep choreography on the same surface. */
export const PROP_SLOTS:Partial<Record<PropId,{mark:MarkId;pos:Vec3;rot?:Vec3}>>={
 pantry_honey:{mark:'cupboard',pos:[...CUPBOARD_JAR_POSITION]},
 jam_jar:{mark:'table',pos:[1.62,.78,1.74]},frying_pan:{mark:'table',pos:[1.6,.78,1.2],rot:[0,.8,0]},
 flour_bag:{mark:'table',pos:[2.42,.78,1.8]},teapot:{mark:'table',pos:[2.22,1.25,1.28]},
 pancakes:{mark:'table',pos:[1.92,.78,1.88]},cake:{mark:'table',pos:[1.9,.78,1.6]},
 honey_pot:{mark:'beehive',pos:[9.55,0,-8.55]},fishing_rod:{mark:'pier',pos:[-5.15,.28,8.95],rot:[Math.PI/2,.37,0]},
 bucket:{mark:'pier',pos:[-5,.28,8.4]},fish:{mark:'pier',pos:[-5.35,.28,9.25],rot:[0,.6,0]},
 flowers:{mark:'garden',pos:[3.9,0,-4.7],rot:[Math.PI/2.2,.8,0]},
 watering_can:{mark:'garden',pos:[6.5,0,-4.75],rot:[0,-.6,0]},broom:{mark:'porch',pos:[-7.5,.32,-3.75],rot:[-.22,0,.05]},
 book:{mark:'bench',pos:[2.45,.47,3],rot:[0,.3,0]},pillow:{mark:'hammock',pos:[-11.95,.88,3.01],rot:[0,.8,.12]},
 ball:{mark:'clearing',pos:[.4,0,1.0]},lollipop:{mark:'table',pos:[2.3,.79,1.62],rot:[Math.PI/2,.9,0]},
};
export const PROP_REST_ROTATIONS:Partial<Record<PropId,Vec3>>={fishing_rod:[Math.PI/2,0,.3],lollipop:[Math.PI/2,0,0],flowers:[Math.PI/2.2,0,0],carrot:[Math.PI/2,0,.4],broom:[-.22,0,0]};

/** Authored non-physics counterpart of the bounded leftward bench roll. */
export function ballOriginFromSupport(support:Vec3,rotation:Vec3):Vec3{
 const centre=propGripWorld([0,0,0],rotation,[0,.15,0]);
 return[support[0]-centre[0],support[1]+.15-centre[1],support[2]-centre[2]];
}
const benchRestRotation:Vec3=[0,0,-(1.90-.62)/.15];
export const BENCH_BALL_FALLBACK={support:[.62,0,3.075] as Vec3,position:ballOriginFromSupport([.62,0,3.075],benchRestRotation),rotation:benchRestRotation,rollSeconds:1.25,edgeSeconds:.75};

/** Exact known furniture transform without loading any renderer dependency. */
export function propPlacementAtMark(item:PropId,mark:MarkId):{pos:Vec3;rot:Vec3}{
 if(isCarrot(item)&&isKitchenContainer(mark)){const c=KITCHEN_CONTAINERS[mark];return{pos:[...c.carrotPosition],rot:[...c.carrotRotation]};}
 if(item==='ball'&&mark==='bench')return{pos:[1.90,.47,3.075],rot:[0,0,0]};
 if(isCarrot(item)&&mark==='bench'){return{pos:[1.5,.606,3.0],rot:[Math.PI/2,Math.PI/2,0]};}
 if(isCarrot(item)&&mark==='garden')return looseGardenCarrotPlacement(item);
 const slot=PROP_SLOTS[item],rot=PROP_REST_ROTATIONS[item]??[0,0,0];
 if(slot?.mark===mark)return {pos:[...slot.pos],rot:[...(slot.rot??rot)]};
 if(mark==='house_kitchen')return {pos:propRestPosition(item,mark),rot:item==='frying_pan'?[0,-Math.PI/2,0]:[...rot]};
 const pos=propRestPosition(item,mark);
 if(isCarrot(item))return{pos:[pos[0],(PROP_REST_HEIGHT[mark]??0)+.136,pos[2]],rot:[Math.PI/2,0,.15]};
 if(!['table','bench','house_living','cupboard'].includes(mark))pos[1]=0;
 return{pos,rot:[...rot]};
}

/** Resolve an identified carrot without converting a harvested object back into a plant. */
export function propPlacementInState(item:PropId,state:{at:MarkId;planted?:boolean;position?:Vec3;rotation?:Vec3}):{pos:Vec3;rot:Vec3}{
 if(state.position)return{pos:[...state.position],rot:[...(state.rotation??[0,0,0])]};
 return isCarrot(item)&&state.at==='garden'&&state.planted?plantedCarrotPlacement(item):propPlacementAtMark(item,state.at);
}

/** Rotate a local prop grip using the renderer's Euler YXZ convention. */
export function propGripWorld(position:Vec3,rotation:Vec3,point:Vec3):Vec3{
 const [rx,ry,rz]=rotation,[x,y,z]=point;
 const zx=x*Math.cos(rz)-y*Math.sin(rz),zy=x*Math.sin(rz)+y*Math.cos(rz);
 const xy=zy*Math.cos(rx)-z*Math.sin(rx),xz=zy*Math.sin(rx)+z*Math.cos(rx);
 return[position[0]+zx*Math.cos(ry)+xz*Math.sin(ry),position[1]+xy,position[2]-zx*Math.sin(ry)+xz*Math.cos(ry)];
}
