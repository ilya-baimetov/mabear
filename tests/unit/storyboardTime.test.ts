import {describe, expect, it} from 'vitest';
import {storyboardTime} from '../../src/app/storyboardTime';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {parseParagraph} from '../../src/director/offline/parser';
import {initialWorldState} from '../../src/compiler/worldState';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX, type Segment} from '../../src/shared/schema';

describe('representative storyboard frames', () => {
  it.each(['en', 'ru'] as const)('shows the actual indoor dialogue and subsequent yard action in %s', lang => {
    const fixture = getFixture('cozy_evening', lang)!;
    const {timeline} = compileEpisode(fixture.paragraphs.map((p, i) => ({paragraphId: `p${i}`, version: 1, remix: DEFAULT_REMIX, beatScript: p.beatScript})), lang);
    const first = timeline.segments[0];
    // This is the live bug: a fixed early still misrepresents an indoor moment.
    expect(evaluate(timeline, first.offset + .4).camera.location).toBe('yard');
    for (const [index, place] of [[0, 'house'], [1, 'house'], [2, 'yard']] as const) {
      const entry = timeline.segments[index], local = storyboardTime(entry.segment);
      const frame = evaluate(timeline, entry.offset + local);
      expect(frame.camera.location).toBe(place);
      expect(frame.actors.masha.opacity).toBeGreaterThan(.99);
      expect(entry.segment.dialogue.some(d => local >= d.start && local < d.start + d.dur)).toBe(true);
    }
  });

  it('shows fishing over the pond rather than the incoming yard handoff', () => {
    const {timeline} = compileEpisode([{paragraphId: 'fish', version: 1, remix: DEFAULT_REMIX, beatScript: parseParagraph('Bear walks to the pier and goes fishing.', 'en', initialWorldState())}], 'en');
    const segment = timeline.segments[0].segment, time = storyboardTime(segment);
    const frame = evaluate(timeline, time);
    expect(frame.camera.location).toBe('pond');
    expect(frame.actors.bear.opacity).toBeGreaterThan(.99);
    expect(segment.actorClips.bear.some(c => c.verb === 'fish' && time >= c.start && time < c.start + c.dur)).toBe(true);
  });

  it('avoids the hidden midpoint even when a location change is the entire moment', () => {
    const {timeline} = compileEpisode([{paragraphId: 'travel', version: 1, remix: DEFAULT_REMIX, beatScript: parseParagraph('Bear walks to the pier.', 'en', initialWorldState())}], 'en');
    const segment = timeline.segments[0].segment, time = storyboardTime(segment), frame = evaluate(timeline, time);
    expect(time).toBeGreaterThanOrEqual(0);
    expect(time).toBeLessThan(segment.duration);
    expect(frame.camera.location).toBe('pond');
    expect(frame.actors.bear.opacity).toBeGreaterThan(.99);
  });

  it('keeps empty/very short saved segments bounded', () => {
    const minimal = {duration: 0, dialogue: [], actorClips: {}, camera: []} as unknown as Segment;
    expect(storyboardTime(minimal)).toBe(0);
    expect(storyboardTime({...minimal, duration: .0001})).toBe(0);
  });
});
