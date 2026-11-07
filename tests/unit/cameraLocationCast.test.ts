import { describe, expect, it } from 'vitest';
import { compileEpisode } from '../../src/compiler/episode';
import { occlusionCost } from '../../src/compiler/camera';
import { initialWorldState } from '../../src/compiler/worldState';
import { parseParagraph } from '../../src/director/offline/parser';
import { evaluate } from '../../src/engine/player/evaluate';
import { sceneLocationAt } from '../../src/shared/bible/set';
import { DEFAULT_REMIX, type ActorId } from '../../src/shared/schema';

function wideStory(text: string, state = initialWorldState()) {
  const beatScript = parseParagraph(text, 'en', state);
  for (const beat of beatScript.beats) beat.shot = 'wide';
  return compileEpisode([{ paragraphId: 'p', version: 1, remix: DEFAULT_REMIX, beatScript }], 'en', state).timeline;
}

describe('camera location follows the visible cast', () => {
  it('does not avoid an invisible yard tree when composing the wolves clearing', () => {
    const key={pos:[5.9,3.2,3.7] as [number,number,number],look:[12,1,-1.45] as [number,number,number],fov:44};
    const heads=[{head:[12,1.6,-1.45] as [number,number,number],w:1}];
    expect(occlusionCost({...key,location:'yard'},heads)).toBeGreaterThan(0);
    expect(occlusionCost({...key,location:'wolves'},heads)).toBe(0);
  });

  it('frames the wolves beside the ambulance from the open west side', () => {
    const state=initialWorldState();
    state.actors.wolf_a.pos=[12,-1];state.actors.wolf_b.pos=[12,-1.9];
    const timeline=wideStory('Wolf waves at the other wolf. Wolf laughs.',state);
    const wide=timeline.segments[0].segment.camera.find(c=>c.shot==='wide')!;
    expect(wide.from.location).toBe('wolves');
    expect(wide.from.pos[0]).toBeLessThan(10);
    expect(wide.from.pos[2]).toBeGreaterThan(-1);
  });

  it('keeps a solo guest on screen when a long wide is split into alternate framings', () => {
    const timeline = wideStory('Wolf dances. Wolf waves. Wolf dances.');
    expect(timeline.segments[0].segment.cast).toEqual(['wolf_a']);
    expect(timeline.segments[0].segment.camera.length).toBeGreaterThan(1);
    for (let t = .1; t < timeline.duration; t += .2) {
      const frame = evaluate(timeline, t);
      expect(frame.camera.location).toBe('wolves');
      expect(Math.hypot(frame.camera.look[0] - frame.actors.wolf_a.pos[0], frame.camera.look[2] - frame.actors.wolf_a.pos[2])).toBeLessThan(1);
    }
  });

  it('follows the only actor to the pond through a split wide instead of filming absent Masha', () => {
    const timeline = wideStory('Bear walks to the pier. Bear fishes. Bear fishes.');
    expect(timeline.segments[0].segment.cast).toEqual(['bear']);
    for (let t = .1; t < timeline.duration; t += .2) {
      const frame = evaluate(timeline, t);
      if (frame.actors.bear.opacity < .1) continue; // brief intentional location handoff
      expect(frame.camera.location).toBe(sceneLocationAt(frame.actors.bear.pos[0], frame.actors.bear.pos[2]));
    }
    expect(evaluate(timeline, 7).camera.location).toBe('pond');
  });

  it('retains a target-only listener in a group shot while resolving the active participant', () => {
    const state = initialWorldState();
    state.actors.masha.pos = [-5, 8];
    state.actors.bear.pos = [-6.5, 8];
    const timeline = wideStory('Bear waves at Masha. Bear dances. Bear waves at Masha.', state);
    const segment = timeline.segments[0].segment;
    expect(segment.cast).toEqual(['masha', 'bear']);
    expect(segment.actorClips.masha.every(clip => clip.params.ambient)).toBe(true);
    const wide = segment.camera.find(cue => cue.shot === 'wide')!;
    const frame = evaluate(timeline, wide.start + .1);
    expect(frame.camera.location).toBe('pond');
    for (const actor of ['masha', 'bear'] as ActorId[]) {
      expect(Math.hypot(frame.camera.look[0] - frame.actors[actor].pos[0], frame.camera.look[2] - frame.actors[actor].pos[2])).toBeLessThan(2);
    }
  });
});
