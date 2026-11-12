import {CHARACTER_REACH} from './characterReach';
import type {ActorId,Vec2} from './schema';

/** Conservative torso clearance based on the normalized shipped rigs. */
export const interactionRadius = (actor:ActorId) => Math.max(.12,Math.abs(CHARACTER_REACH[actor].shoulder[0])*1.6);
/** An embrace closes the hands, not the two torso roots. */
export const hugSpacing = (a:ActorId,b:ActorId,seated=false) => (interactionRadius(a)+interactionRadius(b))*.68+.17+(seated?.20:0);

/** Physical cloth transform from the yard, independent of the semantic mark. */
export const HAMMOCK_SUPPORT = {center:[-11,2.2] as Vec2,yaw:.8,halfWidth:.55,halfLength:1.8};
/** Seconds, rather than a fraction of a dialogue-stretched clip: unsupported
 * travel is a brief hop, with anticipation and a supported landing on either side. */
export function hammockTiming(mount:boolean,duration:number){
 const launch=mount?Math.min(.48,duration*.20):Math.min(.82,duration*.52);
 const land=launch+Math.min(mount?.62:.48,duration*.30);
 return{launch,land,settled:Math.min(duration,land+(mount?.24:.30))};
}
/** Ballistic horizontal motion is constant-speed while unsupported. */
export function hammockTravelProgress(mount:boolean,progress:number,duration:number):number{
 const {launch,land}=hammockTiming(mount,duration);
 return Math.max(0,Math.min(1,(progress*duration-launch)/(land-launch)));
}
export function hammockWorld(point:Vec2):Vec2 {
 const c=Math.cos(HAMMOCK_SUPPORT.yaw),s=Math.sin(HAMMOCK_SUPPORT.yaw);
 return [HAMMOCK_SUPPORT.center[0]+point[0]*c+point[1]*s,HAMMOCK_SUPPORT.center[1]-point[0]*s+point[1]*c];
}
export function hammockClothHeight(point:Vec2):number|null{
 const [x,z]=hammockLocal(point),u=(x/HAMMOCK_SUPPORT.halfLength+1)*.5;
 if(u<0||u>1)return null;
 const narrow=.35+.65*Math.sin(Math.PI*u),width=HAMMOCK_SUPPORT.halfWidth*narrow;
 if(Math.abs(z)>width)return null;
 return 1.05-.43*Math.sin(Math.PI*u)+.12*(z/width)**2*narrow;
}
export function hammockLocal(point:readonly number[]):Vec2 {
  const dx=point[0]-HAMMOCK_SUPPORT.center[0],dz=point[1]-HAMMOCK_SUPPORT.center[1],c=Math.cos(HAMMOCK_SUPPORT.yaw),s=Math.sin(HAMMOCK_SUPPORT.yaw);
  return [dx*c-dz*s,dx*s+dz*c];
}
/** Keep the lengthwise coordinate; leave through a long side, away from ropes. */
export function hammockExitPoint(from:Vec2,actor:ActorId,side:1|-1):Vec2 {
  const [along]=hammockLocal(from),across=side*(HAMMOCK_SUPPORT.halfWidth+interactionRadius(actor)+.40),c=Math.cos(HAMMOCK_SUPPORT.yaw),s=Math.sin(HAMMOCK_SUPPORT.yaw);
  return [HAMMOCK_SUPPORT.center[0]+along*c+across*s,HAMMOCK_SUPPORT.center[1]-along*s+across*c];
}

/** A child first rises in front of the armchair, then moves back over its
 * cushion. An adult can lower onto it without a hop. Shared by pose, root and
 * camera so neither the body nor the framing gets ahead of the mount. */
export function armchairMountMotion(child:boolean,progress:number){
 const clamp=(v:number)=>Math.max(0,Math.min(1,v)),smooth=(v:number)=>{const k=clamp(v);return k*k*(3-2*k);},u=clamp(progress);
 if(!child)return{travel:smooth((u-.16)/.64),pose:smooth(u/.8),lift:0,crouch:0,ground:1-smooth(u/.8)};
 const flight=clamp((u-.18)/.54);
 return{travel:smooth((u-.30)/.42),pose:smooth((u-.12)/.50),lift:.25*4*flight*(1-flight),crouch:u<.18?Math.sin(u/.18*Math.PI):0,ground:1-smooth(u/.18)};
}

/** Route around the cloth and its end trunks; endpoints inside the support
 * retain their authored mount/dismount instead of being detoured. */
export function avoidHammock(path:Vec2[],actor:ActorId,overheadClearance=0):Vec2[]{
 const radius=interactionRadius(actor),halfW=HAMMOCK_SUPPORT.halfWidth+radius+.12+overheadClearance,halfL=2.1+radius+.42+overheadClearance;
 const inside=(p:Vec2)=>{
  const u=(p[0]/HAMMOCK_SUPPORT.halfLength+1)*.5;
  const fabric=u>=0&&u<=1&&Math.abs(p[1])<HAMMOCK_SUPPORT.halfWidth*(.35+.65*Math.sin(Math.PI*u))+radius+.015;
  return fabric||[-2.1,2.1].some(x=>Math.hypot(p[0]-x,p[1])<radius+.30);
 };
 const out:Vec2[]=[path[0]];
 for(let i=1;i<path.length;i++){
  const a=hammockLocal(path[i-1]),b=hammockLocal(path[i]);
  const crosses=!inside(a)&&!inside(b)&&Array.from({length:21},(_,n)=>{const k=n/20;return inside([a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k]);}).some(Boolean);
  if(crosses){
   const routes=([-1,1] as const).map(side=>{const x=side*halfL,ay=Math.sign(a[1]||1)*halfW,by=Math.sign(b[1]||-1)*halfW;return [
    // A shoulder rider must first move out from under the low branches;
    // cutting diagonally toward an end trunk clears cloth but hits its crown.
    ...(overheadClearance>0?[hammockWorld([a[0],ay])]:[]),
    hammockWorld([x,ay]),hammockWorld([x,by]),
   ];});
   const length=(route:Vec2[])=>{const p=[path[i-1],...route,path[i]];return p.slice(1).reduce((s,q,j)=>s+Math.hypot(q[0]-p[j][0],q[1]-p[j][1]),0);};
   routes.sort((p,q)=>length(p)-length(q));out.push(...routes[0]);
  }
  out.push(path[i]);
 }
 return out;
}
