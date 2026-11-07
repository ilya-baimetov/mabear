import type {Segment} from '../shared/schema';

const TRAVEL = new Set(['walk_to', 'run_to', 'tiptoe_to', 'chase', 'enter', 'exit']);

/** A thumbnail describes the moment's action, rather than its incoming setup.
 * Sample a spoken line or substantial action, outside hidden location handoffs.
 * This only chooses a render time; it never seeks the actual player.
 */
export function storyboardTime(segment: Segment): number {
  const end = Math.max(0, segment.duration - .001);
  const dialogue = [...segment.dialogue].filter(c => c.dur > 0).sort((a, b) => a.start - b.start)[0];
  const clips = Object.values(segment.actorClips).flat();
  const action = clips.filter(c => c.dur > 0 && !c.params.ambient && c.verb !== 'idle' && !TRAVEL.has(c.verb))
    .sort((a, b) => b.dur - a.dur || a.start - b.start)[0];
  let time = dialogue ? dialogue.start + dialogue.dur / 2
    : action ? action.start + action.dur / 2 : segment.duration / 2;
  // A scene-cut actor fades out/in around the camera cut. The settled frame
  // after the handoff is more informative than either the old location or a ghost.
  const handoffs = clips.filter(c => c.params.sceneCut).map(c => ({start: c.start, end: c.start + c.dur}));
  for (const camera of segment.camera) if (camera.from.location !== camera.to.location) {
    const cut = camera.cutAt ?? camera.start + camera.dur / 2;
    handoffs.push({start: cut - .12, end: cut + .12});
  }
  for (const handoff of handoffs.sort((a, b) => a.start - b.start)) {
    if (time >= handoff.start && time <= handoff.end) time = handoff.end + .05;
  }
  return Math.max(0, Math.min(end, time));
}
