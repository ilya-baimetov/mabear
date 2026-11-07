import type {FaceParams} from '../api';
import type {Emotion} from '../../shared/schema';
import {smooth} from './blend';

export type EmotionWeights=Partial<Record<Emotion,number>>;

/** Convex, time-derived expression weights. An interrupted reaction starts
 * from the expression actually on screen, rather than snapping to its target. */
export function emotionWeights(face:Pick<FaceParams,'emotion'|'emotionTransition'>,progress=face.emotionTransition?.progress??1):EmotionWeights{
 const transition=face.emotionTransition;
 if(!transition)return {[face.emotion]:1};
 const source=transition.fromWeights??{[transition.from]:1},weight=smooth(progress),out:EmotionWeights={};
 const total=Object.values(source).reduce((sum,n)=>sum+Math.max(0,n??0),0)||1;
 for(const [emotion,n] of Object.entries(source))out[emotion as Emotion]=Math.max(0,n??0)/total*(1-weight);
 out[face.emotion]=(out[face.emotion]??0)+weight;
 return out;
}

export const emotionBlendSeconds=(emotion:Emotion)=>emotion==='surprised'?.24:emotion==='scared'?.28:emotion==='sad'?.56:emotion==='sleepy'?.65:.42;
