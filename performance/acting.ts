import * as THREE from 'three';
import {restFrame} from '../src/engine/characters/rig';
import {evaluatePose, STYLES, type VerbCtx} from '../src/engine/motion/library';
import type {ActorFrame, Quat} from '../src/engine/api';
import type {Emotion, Viseme} from '../src/shared/schema';

export type StudyMode = 'face' | 'hold' | 'clap';
type Beat = {at:number; blend:number; emotion:Emotion; label:string; look:[number,number,number]; head:[number,number,number]};
const ease=(x:number)=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const beats:Beat[]=[
  {at:0,blend:0,emotion:'neutral',label:'A quiet look',look:[0,.75,2],head:[0,0,0]},
  {at:1,blend:.55,emotion:'curious',label:'Something catches her eye',look:[.65,.85,2],head:[-.025,.04,-.065]},
  {at:2.8,blend:.5,emotion:'happy',label:'Recognition → delight',look:[0,.76,2],head:[-.025,-.02,.025]},
  {at:5,blend:.24,emotion:'surprised',label:'A little surprise',look:[-.22,.86,2],head:[-.065,-.035,0]},
  {at:6.6,blend:.72,emotion:'sad',label:'The smile fades',look:[-.15,.36,1.8],head:[.095,-.025,.025]},
  {at:8.9,blend:.65,emotion:'mischievous',label:'An idea…',look:[.35,.74,2],head:[.01,.025,-.065]},
  {at:10.5,blend:.55,emotion:'happy',label:'A playful smile',look:[0,.77,2],head:[-.015,0,.025]},
  {at:11.55,blend:.45,emotion:'neutral',label:'And settle',look:[0,.75,2],head:[0,0,0]},
];
function beatAt(time:number){
  let index=0;for(let i=1;i<beats.length;i++)if(time>=beats[i].at)index=i;
  const current=beats[index],previous=beats[Math.max(0,index-1)],k=current.blend?ease((time-current.at)/current.blend):1;
  return {current,previous,k};
}
function blink(time:number,start:number){
  const t=time-start;
  if(t<0||t>.20)return 0;
  if(t<.065)return ease(t/.065);
  if(t<.095)return 1;
  return 1-ease((t-.095)/.105);
}
export function studyBeat(mode:StudyMode,time:number):string {
  if(mode==='face')return beatAt(time).current.label;
  if(mode==='hold')return (time%3)<.6?'A relaxed, secure grasp':(time%3)<1.8?'Bring the candy to the mouth':'Lower it without losing the grip';
  const phase=((time%.6)+.6)%.6;
  return phase<.15?'Hands apart':phase<.27?'Approach':phase<.33?'Palm contact':phase<.57?'Release and recover':'Hands apart';
}

/** Identical, deterministic acting inputs feed BOTH renderers. These authored
 * beats demonstrate the rig; they do not claim generated dialogue lip sync. */
export function studyFrame(mode:StudyMode,time:number):ActorFrame {
  const verb=mode==='clap'?'clap':mode==='hold'?'eat':'idle';
  const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:12,emotion:'neutral',posture:'stand',fromPosture:'stand',speed:0,dist:0,turned:0,targetLocal:null,seat:0};
  const pose=evaluatePose(verb,time,{},ctx);
  const f=restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb,holding:mode==='hold'?'lollipop':null,secondary:{sway:0,jiggle:0,breathe:pose.breathe}});
  f.action={time,duration:12};
  if(mode==='face'){
    const {current,previous,k}=beatAt(time);
    f.face.emotion=current.emotion;
    f.face.emotionTransition={from:previous.emotion,progress:k};
    f.face.lookAt=current.look.map((v,i)=>THREE.MathUtils.lerp(previous.look[i],v,k)) as [number,number,number];
    const head=current.head.map((v,i)=>THREE.MathUtils.lerp(previous.head[i],v,k));
    f.bones.Head=new THREE.Quaternion().fromArray(f.bones.Head??[0,0,0,1]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...head as [number,number,number]))).toArray() as Quat;
    f.face.lidClose=Math.max(...[.62,2.62,4.72,8.68,10.29].map(start=>blink(time,start)));
    // A short restrained articulation passage, separated from expression holds.
    const syllables:Viseme[]=['open_small','e','o','open_small','rest'];
    const speech=time>=3.25&&time<4.5,local=(time-3.25)*4;
    f.face.viseme=speech?syllables[Math.min(4,Math.floor(local))]:'rest';
    f.face.visemeWeight=speech?Math.sin(Math.PI*(local%1))**1.15*.65:0;
  }else{
    f.face.emotion=mode==='clap'?'happy':'neutral';
    f.face.lidClose=Math.max(blink(time%3,.28),blink(time%3,2.57));
    f.face.lookAt=mode==='hold'?[-.08,.61,1.1]:[0,.77,2];
    if(mode==='hold'){
      const taste=(1-Math.cos(time/3*Math.PI*2))*.5;
      f.face.viseme='open_small';f.face.visemeWeight=Math.max(0,(taste-.65)/.35);
    }
  }
  return f;
}
