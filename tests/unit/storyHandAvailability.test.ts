import {describe,it,expect} from 'vitest';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX} from '../../src/shared/schema';

describe('props and two-handed story gestures',()=>{
 it('sets down the frying pan before Masha claps in the actual pancake story',()=>{
  const story=getFixture('pancake_morning','en')!;
  const {timeline}=compileEpisode(story.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.startState.actors.masha.holding==='frying_pan'&&s.segment.actorClips.masha.some(c=>c.verb==='clap'))!;
  const clap=segment.segment.actorClips.masha.find(c=>c.verb==='clap')!;
  const putDown=segment.segment.actorClips.masha.find(c=>c.params.putDown)!;
  expect(putDown.params.item).toBe('frying_pan');
  expect(putDown.start+putDown.dur).toBeLessThanOrEqual(clap.start+1e-8);
  const before=evaluate(timeline,segment.offset+putDown.start+putDown.dur*.49);
  const after=evaluate(timeline,segment.offset+putDown.start+putDown.dur*.51);
  expect(before.actors.masha.holding).toBe('frying_pan');
  expect(after.actors.masha.holding).toBe(null);
  expect(after.props.frying_pan.visible).toBe(true);
  expect(after.props.frying_pan.attachedTo).toBe(null);
  const contact=evaluate(timeline,segment.offset+clap.start+.3);
  expect(contact.actors.masha.holding).toBe(null);
  expect(contact.props.frying_pan.visible).toBe(true);
  expect(segment.segment.foley.some(f=>f.id==='prop_putdown'&&Math.abs(f.start-putDown.start-putDown.dur*.5)<.002)).toBe(true);
  expect(evaluate(timeline,segment.offset+putDown.start+putDown.dur*.49)).toEqual(before);
 });
});
