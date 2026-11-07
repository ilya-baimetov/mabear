import {describe,it,expect} from 'vitest';
import {ACTOR_IDS,type ActorClip} from '../../src/shared/schema';
import {foleyForClip} from '../../src/compiler/audioCues';
import {clapOpen} from '../../src/shared/contactTiming';

describe('story clap contact and foley',()=>{
 it('places every audible clap inside the rendered contact hold for every actor',()=>{
  const clip:ActorClip={start:2.15,dur:2.4,verb:'clap',emotion:'happy',params:{from:[0,0],posture:'stand'}};
  for(const actor of ACTOR_IDS){
   const sounds=foleyForClip(actor,clip,[]);
   expect(sounds.map(s=>s.start)).toEqual([2.45,3.05,3.65,4.25]);
   for(const sound of sounds)expect(clapOpen(sound.start-clip.start)).toBe(0);
  }
 });
 it('does not schedule a clap before the first contact or after an interrupted beat',()=>{
  expect(foleyForClip('masha',{start:0,dur:.2,verb:'clap',emotion:'happy',params:{}},[])).toEqual([]);
  expect(clapOpen(.15)).toBe(1);
  expect(clapOpen(.28)).toBe(0);
  expect(clapOpen(.48)).toBeGreaterThan(0);
  expect(clapOpen(.60)).toBe(1);
 });
});
