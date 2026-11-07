import { describe, expect, it } from 'vitest';
import { compileEpisode } from '../../src/compiler/episode';
import { pathLength, planPath, pointAlong } from '../../src/compiler/path';
import { initialWorldState } from '../../src/compiler/worldState';
import { parseParagraph } from '../../src/director/offline/parser';
import { evaluate } from '../../src/engine/player/evaluate';
import { MARKS, sceneLocationAt } from '../../src/shared/bible/set';
import { DEFAULT_REMIX, type MarkId } from '../../src/shared/schema';

describe('local yard routes remain in the yard', () => {
  it('takes a short grass route around the table instead of detouring across the porch',()=>{
    const path=planPath([.25,.5],MARKS.bench.pos);
    expect(pathLength(path)).toBeLessThan(5);
    for(let i=0;i<=100;i++){
      const p=pointAlong(path,pathLength(path)*i/100);
      expect(sceneLocationAt(...p)).toBe('yard');
      expect(p[0]).toBeGreaterThanOrEqual(0);
    }
  });
  const pairs: [MarkId, MarkId][] = [['hammock', 'path_entry'], ['clearing', 'creek'], ['bench', 'clearing']];
  for (const [a, b] of pairs) for (const [from, to] of [[a, b], [b, a]]) {
    it(`${from} → ${to} reaches its mark without revealing another set or hiding the actor`, () => {
      const path = planPath(MARKS[from].pos, MARKS[to].pos);
      expect(path.at(-1)).toEqual(MARKS[to].pos);
      const length = pathLength(path);
      expect(length).toBeGreaterThan(1);
      for (let i = 0; i <= 200; i++) expect(sceneLocationAt(...pointAlong(path, length * i / 200))).toBe('yard');

      const state = initialWorldState();
      state.actors.bear.pos = [...MARKS[from].pos];
      state.actors.bear.mark = from;
      const beatScript = parseParagraph('Bear walks.', 'en', state);
      beatScript.beats[0].target = to;
      const { timeline } = compileEpisode([{ paragraphId: 'p', version: 1, remix: DEFAULT_REMIX, beatScript }], 'en', state);
      const clip = timeline.segments[0].segment.actorClips.bear.find(c => c.verb === 'walk_to')!;
      expect(clip.params.sceneCut).not.toBe(true);
      // A shared mark can spread its arrival point slightly around an actor.
      expect(Math.hypot(clip.params.to![0] - MARKS[to].pos[0], clip.params.to![1] - MARKS[to].pos[1])).toBeLessThan(1.25);
      for (let t = .025; t < timeline.duration; t += .05) {
        const frame = evaluate(timeline, t);
        expect(sceneLocationAt(frame.actors.bear.pos[0], frame.actors.bear.pos[2])).toBe('yard');
        expect(frame.camera.location).toBe('yard');
        expect(frame.actors.bear.opacity).toBeGreaterThan(.99);
      }
    });
  }
});
