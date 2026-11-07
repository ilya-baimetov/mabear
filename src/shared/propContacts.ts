import type {PropId} from './schema';

export type PropGrip={point:[number,number,number];radius:number;rotation?:[number,number,number];support?:boolean};
/** Authored contact points in the actual prop meshes, independent of actor size. */
export const PROP_CONTACTS:Record<PropId,PropGrip>={
 lollipop:{point:[0,.07,0],radius:.006},flowers:{point:[0,.1,0],radius:.028},carrot:{point:[0,.04,0],radius:.035},
 fishing_rod:{point:[0,.12,0],radius:.015,rotation:[.9,0,0]},frying_pan:{point:[0,.03,-.24],radius:.013},
 watering_can:{point:[0,.23,-.02],radius:.012},bucket:{point:[0,.315,0],radius:.006},broom:{point:[0,.5,0],radius:.018,rotation:[.25,0,0]},
 pancakes:{point:[0,0,0],radius:0,support:true},cake:{point:[0,0,0],radius:0,support:true},
 honey_pot:{point:[0,0,0],radius:0,support:true},jam_jar:{point:[0,0,0],radius:0,support:true},
 teapot:{point:[-.105,.075,0],radius:.009},book:{point:[0,.0175,-.065],radius:0},
 ball:{point:[0,0,0],radius:0,support:true},pillow:{point:[0,0,0],radius:0,support:true},
 flour_bag:{point:[0,0,0],radius:0,support:true},fish:{point:[-.12,.05,0],radius:.025,rotation:[0,Math.PI/2,0]},
};
