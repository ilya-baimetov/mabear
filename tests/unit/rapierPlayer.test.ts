import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {Player} from '../../src/engine/player/player';
import {createRapierReplay,type RapierReplay} from '../../src/engine/physics/rapierReplay';
import {trialStories} from '../../scripts/rapier-trial-fixtures';
import type {FrameState} from '../../src/engine/api';
let player:Player,physics:RapierReplay,raf:FrameRequestCallback,clock=0;
let tl=trialStories().drop;
const step=(ms:number)=>{clock=ms;raf(ms);};
const transforms=(f:FrameState)=>({root:f.actors.masha.pos,ball:f.props.ball});
beforeEach(async()=>{
 clock=0;tl=trialStories().drop;
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.spyOn(performance,'now').mockImplementation(()=>clock);
 physics=await createRapierReplay({sampleBall:()=>({pos:[3,1,4],rotation:[0,0,0,1]})});
 player=new Player({stage:{render:vi.fn()} as never,audio:null,evaluator:physics});player.setTimeline(tl,'en');
});
afterEach(()=>{player.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual Player with Rapier',()=>{
 it('freezes on pause, resumes, and supports forward/backward seek and replay',()=>{
  player.play(0);step(2137);player.pause();const paused=transforms(player.frame!);step(7137);expect(transforms(player.frame!)).toEqual(paused);
  player.play(player.time);step(7337);expect(player.time).toBeCloseTo(2.337);const forward=transforms(player.frame!);
  player.seek(.4);step(7400);player.seek(2.337);step(7500);expect(transforms(player.frame!)).toEqual(forward);
  player.play(0);step(9837);expect(transforms(player.frame!)).toEqual(forward);
 });
 it('shares non-grid endpoint state with full playback and holds at the end',()=>{
  player.seek(2.14731);step(20);const full=transforms(player.frame!);
  player.play(0,2.14731);step(2200);expect(transforms(player.frame!)).toEqual(full);
  step(10000);expect(transforms(player.frame!)).toEqual(full);
  player.seek(tl.duration);step(11000);const end=transforms(player.frame!);step(18000);expect(transforms(player.frame!)).toEqual(end);
 });
 it('rebuilds after an edit while paused, and after an edit during playback',()=>{
  player.seek(2.3);step(100);expect(player.frame!.props.ball.rotation).toBeDefined();
  const drop=tl.segments[0].segment.actorClips.masha.find(c=>c.verb==='drop')!;drop.start+=3;
  player.setTimeline(tl,'en');step(150);expect(player.frame!.props.ball.attachedTo).toBe('masha');
  player.play(2.3);step(300);drop.start-=3;player.setTimeline(tl,'en');step(400);
  expect(player.frame!.props.ball.rotation).toBeDefined();expect(player.time).toBeCloseTo(2.55);
 });
});
