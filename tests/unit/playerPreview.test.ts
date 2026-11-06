import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player } from '../../src/engine/player/player';
import { evaluate } from '../../src/engine/player/evaluate';
import { compileEpisode } from '../../src/compiler/episode';
import { FIXTURES } from '../../src/director/fixtures';
import { DEFAULT_REMIX } from '../../src/shared/schema';

const fixture = FIXTURES.find(f => f.id === 'garden_party' && f.lang === 'en')!;
const { timeline } = compileEpisode(fixture.paragraphs.map((p, i) => ({paragraphId: `p${i}`, version: 1, beatScript: p.beatScript, remix: {...DEFAULT_REMIX}})), 'en');
let player: Player, clock = 0, raf: FrameRequestCallback;
const audio = { play: vi.fn(), stop: vi.fn(), updateListener: vi.fn() };
const render = vi.fn();
function step(ms: number) { clock = ms; raf(ms); }

describe('real Player moment boundaries', () => {
  beforeEach(() => {
    clock = 0; vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { raf = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    player = new Player({ stage: { render } as never, audio: audio as never });
    player.setTimeline(timeline, 'en');
  });
  afterEach(() => { player.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('stops on the selected moment final frame, without rendering or scheduling the next moment', () => {
    const firstEnd = timeline.segments[1].offset;
    expect(evaluate(timeline, firstEnd).segmentIndex).toBe(1); // reproduces the former boundary jump
    player.play(0, firstEnd);
    step(firstEnd * 1000 + 20);
    expect(player.isPlaying).toBe(false);
    expect(player.time).toBe(firstEnd);
    expect(player.frame!.segmentIndex).toBe(0);
    expect(player.frame!.localT).toBe(timeline.segments[0].segment.duration);
    const view = audio.play.mock.calls[0][0];
    expect(view.segments).toHaveLength(1);
    expect(view.duration).toBe(firstEnd);
    const finalCamera = evaluate(view, firstEnd).camera;
    expect(player.frame!.camera).toEqual(finalCamera);
    step(firstEnd * 1000 + 1200);
    expect(player.frame!.segmentIndex).toBe(0);
    expect(player.frame!.camera).toEqual(finalCamera);
  });

  it('seeks to a middle moment end with earlier context, then releases the bound for whole-story review', () => {
    const end = timeline.segments[2].offset;
    player.seek(end, end); step(16);
    expect(player.frame!.segmentIndex).toBe(1);
    expect(player.time).toBe(end);
    player.setTimeline(timeline, 'en'); step(32);
    expect(player.frame!.segmentIndex).toBe(1);
    player.seek(end); step(48);
    expect(player.frame!.segmentIndex).toBe(2);
    player.play(0);
    expect(audio.play.mock.calls.at(-1)![0]).toBe(timeline);
    step(48 + end * 1000 + 20);
    expect(player.frame!.segmentIndex).toBe(2);
    expect(player.isPlaying).toBe(true);
  });

  it('holds a partial-clip endpoint without advancing the action during pause', () => {
    player.play(0, 1); step(1100);
    const frame = player.frame;
    step(2200);
    expect(player.time).toBe(1);
    expect(player.frame).toEqual(frame);
  });
});
