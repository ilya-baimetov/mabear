import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {store} from '../../src/app/store';
import {playback} from '../../src/app/playback';
import {FIXTURES} from '../../src/director/fixtures';
import type {AudioEngine} from '../../src/engine/api';
import type {Player} from '../../src/engine/player/player';
import type {Lang,Timeline} from '../../src/shared/schema';

const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('voice preparation does not play stale user intent',()=>{
  const pending:{lang:Lang;resolve:(durations:Record<string,number>)=>void}[]=[];
  const player={time:0,isPlaying:false,cameraOverride:null,castOverride:null,setTimeline:vi.fn(),play:vi.fn(),pause:vi.fn(),seek:vi.fn()};
  const audio={unlock:async()=>{},prepare:vi.fn((_tl:Timeline,lang:Lang)=>new Promise<Record<string,number>>(resolve=>pending.push({lang,resolve})))};
  beforeEach(()=>{
    playback.pause();playback.attach(null,null);pending.length=0;vi.clearAllMocks();
    store.newStory();store.setLang('en');store.loadFixture(FIXTURES.find(f=>f.id==='garden_party'&&f.lang==='en')!);
    store.setTitle('My edited title'); // Language switch must preserve this story.
    playback.attach(player as unknown as Player,audio as unknown as AudioEngine);
  });
  afterEach(()=>{playback.pause();playback.attach(null,null);});
  it('re-prepares interjections if UI language changes while speech is loading',async()=>{
    playback.playAll();expect(pending.map(p=>p.lang)).toEqual(['en']);expect(store.getState().waiting).toBe(true);
    const episode=store.getState().episodeId;store.setLang('ru');expect(store.getState().episodeId).toBe(episode);
    pending[0].resolve({});await flush();
    expect(player.play).not.toHaveBeenCalled();expect(pending.map(p=>p.lang)).toEqual(['en','ru']);
    pending[1].resolve({});await flush();
    expect(player.play).toHaveBeenCalledOnce();expect(player.setTimeline.mock.calls.at(-1)?.[1]).toBe('ru');
  });
  it('a replaced episode cannot be started by the old preparation completion',async()=>{
    playback.playAll();const old=pending[0];
    store.newStory();playback.reset();
    old.resolve({});await flush();
    expect(player.play).not.toHaveBeenCalled();expect(store.getState().playing).toBe(false);expect(store.getState().waiting).toBe(false);
  });
});
