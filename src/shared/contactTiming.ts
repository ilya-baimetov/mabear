import { smooth } from './math';

/** One clap cadence for the rendered contact and its sound. Seconds are clip-local. */
export const CLAP_PERIOD = .6;
export const CLAP_CONTACT = .3;
export const CLAP_HOLD_START = .27;
export const CLAP_HOLD_END = .33;

export function clapOpen(time:number):number {
 const cycle=((time%CLAP_PERIOD)+CLAP_PERIOD)%CLAP_PERIOD;
 return cycle<.15?1:cycle<CLAP_HOLD_START?1-smooth((cycle-.15)/.12):cycle<CLAP_HOLD_END?0:smooth((cycle-CLAP_HOLD_END)/.24);
}

export function clapContactTimes(duration:number):number[] {
 const times:number[]=[];
 for(let t=CLAP_CONTACT;t<duration-.05;t+=CLAP_PERIOD)times.push(t);
 return times;
}
