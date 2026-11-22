import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Player} from '../../src/engine/player/player';
import {evaluate} from '../../src/engine/player/evaluate';
import {trialStories} from '../../scripts/rapier-trial-fixtures';
const stories=trialStories();
let player:Player,clock=0,raf:FrameRequestCallback;
const audio={play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),updateListener:vi.fn()};
const render=vi.fn(),onPreparing=vi.fn();
const evaluator={ready:true,setTimeline:vi.fn(),evaluate:vi.fn(evaluate),dispose:vi.fn()};
function step(ms:number){clock=ms;raf(ms);}
describe('Player preparation ownership and clock',()=>{
  beforeEach(()=>{
    clock=0;vi.clearAllMocks();evaluator.ready=true;
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
    vi.spyOn(performance,'now').mockImplementation(()=>clock);
    player=new Player({stage:{render} as never,audio:audio as never,evaluator,onPreparing});player.setTimeline(stories.obstacle,'en');
  });
  afterEach(()=>{player.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
  it('retains the rendered picture and playback intent while preparing, then starts time and audio together',()=>{
    step(10);const held=player.frame;render.mockClear();evaluator.evaluate.mockClear();
    evaluator.ready=false;player.setTimeline(stories.drop,'en');player.play(2);
    step(3000);expect(player.time).toBe(2);expect(player.isPlaying).toBe(true);expect(player.frame).toBe(held);
    expect(render).not.toHaveBeenCalled();expect(evaluator.evaluate).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
    evaluator.ready=true;step(4000);expect(player.time).toBe(2);expect(audio.play).toHaveBeenCalledExactlyOnceWith(stories.drop,2,'en');
    step(4500);expect(player.time).toBe(2.5);expect(onPreparing.mock.calls).toEqual([[true],[false]]);
  });
  it('honors the latest queued seek and cancels pending play without later audio',()=>{
    evaluator.ready=false;player.setTimeline(stories.drop,'en');player.play(0);step(1000);
    player.seek(5);player.seek(2.337);step(2000);evaluator.ready=true;step(3000);
    expect(player.time).toBe(2.337);expect(player.isPlaying).toBe(false);expect(player.frame).toEqual(evaluate(stories.drop,2.337));expect(audio.play).not.toHaveBeenCalled();
  });
  it('pauses a queued play, then resumes from that exact timestamp with fresh audio',()=>{
    evaluator.ready=false;player.setTimeline(stories.drop,'en');player.play(2);step(1000);player.pause();
    evaluator.ready=true;step(3000);expect(player.time).toBe(2);expect(audio.play).not.toHaveBeenCalled();
    player.play(player.time);step(3500);expect(player.time).toBe(2.5);expect(audio.resume).not.toHaveBeenCalled();expect(audio.play).toHaveBeenCalledOnce();
  });
  it('stops old audio on an edit and resumes the revised scene at the retained timestamp',()=>{
    player.play(0);step(1000);evaluator.ready=false;player.setTimeline(stories.drop,'en');step(5000);
    expect(player.time).toBe(1);expect(audio.play).toHaveBeenCalledOnce();
    evaluator.ready=true;step(6000);expect(audio.play).toHaveBeenLastCalledWith(stories.drop,1,'en');step(6500);expect(player.time).toBe(1.5);
  });
  it('starts audio only once when an immediate authored edit replaces a pending physical story',()=>{
    evaluator.ready=false;player.setTimeline(stories.drop,'en');player.play(2);step(1000);
    evaluator.ready=true;player.setTimeline(stories.regression,'en');step(2000);
    expect(audio.play).toHaveBeenCalledExactlyOnceWith(stories.regression,2,'en');expect(player.time).toBe(2);
  });
});
