import * as THREE from 'three';
import type {ActorFrame} from '../api';
import {smooth,window01} from '../motion/blend';

/** Reuses the same measured palm/paw surface for props and actor contacts. */
export interface ContactHand {
 side:1|-1;
 place(target:THREE.Vector3,long:THREE.Vector3,normal:THREE.Vector3,strength:number,pole?:THREE.Vector3):{error:number;point:THREE.Vector3};
}
export const contactHands=new WeakMap<THREE.Object3D,ContactHand[]>();

/** Torso-space outward-backward-downward elbow pole for natural two-bone arm IK. */
export function torsoElbowPole(shoulder:THREE.Vector3,side:1|-1,scale:number,torsoQ:THREE.Quaternion,back=.12):THREE.Vector3{
 return shoulder.clone().add(new THREE.Vector3(side*scale*.22,-scale*.22,-scale*back).applyQuaternion(torsoQ));
}

/** Deterministic tool-use wrist pitch/roll delta in actor yaw space for cook,
 * water_plants and fish, strictly gated off during pickup/putDown and smoothed
 * within < 0.12s of clip boundaries so hand continuity stays < 0.001m. */
export function toolWristDelta(frame:ActorFrame):THREE.Quaternion|null{
 if(frame.pickup||frame.putDown||!frame.action)return null;
 const lt=frame.action.time,dur=frame.action.duration;
 const endT=(frame.verb==='fish'?frame.action.contactEnd:undefined)??dur;
 if(lt<=0||lt>=endT||endT<=0||dur<=0)return null;
 const fadeW=Math.min(.11,endT*.45),fade=Math.min(smooth(lt/fadeW),smooth((endT-lt)/fadeW));
 if(fade<=0)return null;
 let pitch=0,roll=0;
 if(frame.verb==='cook'&&frame.holding==='frying_pan'){
  const flipT=(lt%1.6)/1.6,flip=window01(flipT,.55,.80,.08);
  pitch=(-0.28*flip+0.04*Math.sin(lt*4))*fade;
  roll=(0.08*Math.sin(lt*2.5)+0.05*flip*Math.sin(lt*8))*fade;
 }else if(frame.verb==='water_plants'&&frame.holding==='watering_can'){
  const pour=.5+.5*Math.sin(lt*1.3);
  pitch=(0.48*pour+0.06)*fade;
  roll=0.14*Math.sin(lt*1.3+.4)*fade;
 }else if(frame.verb==='fish'&&frame.holding==='fishing_rod'){
  const u=lt/dur,back=window01(u,.02,.22,.08),cast=window01(u,.18,.34,.06);
  const jig=Math.sin(lt*1.7)*.06,tug=window01(u,.50,.68,.06)*Math.sin(lt*11)*.10;
  pitch=(-0.42*back+0.24*cast+jig+tug)*fade;
  roll=(0.06*Math.sin(lt*1.3)+0.06*tug)*fade;
 }else return null;
 return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,0,roll,'YXZ'));
}

/** Smooth 0..1 suppression weight during strict hand-to-target contact windows. */
export function contactWindowSuppression(frame:ActorFrame):number{
 const active=!!(frame.pickup||frame.putDown||frame.interaction||frame.objectContact||frame.objectContacts?.length);
 if(!active)return 0;
 const dur=frame.action?.duration??0,lt=frame.action?.time??0;
 if(dur<=0)return 1;
 const fadeW=Math.min(.11,dur*.45);
 return Math.min(smooth(lt/fadeW),smooth((dur-lt)/fadeW));
}
