// Episode compilation: chain endState → startState and carry audio across paragraphs (spec §6.5). Pure.
import type { Lang, Timeline, WorldState } from "../shared/schema";
import type { CompileResult, EpisodeParagraphInput } from "./types";
import { compile } from "./compile";
import { EMPTY_CARRY } from "./audioCues";
import { initialWorldState } from "./worldState";
import {isActor} from './validate';
import {ACTOR_IDS} from '../shared/schema';
import type {SpeechDurations} from '../shared/speech';

export function compileEpisode(paras: EpisodeParagraphInput[], lang: Lang, initial?: WorldState, speechDurations?: SpeechDurations): { results: CompileResult[]; timeline: Timeline } {
  let state = initial ?? initialWorldState();
  let carry = EMPTY_CARRY;
  const results: CompileResult[] = [];
  const segments: Timeline["segments"] = [];
  let offset = 0;
  const introduced=new Set<(typeof ACTOR_IDS)[number]>();
  paras.forEach((p, i) => {
    for(const beat of p.beatScript.beats){introduced.add(beat.actor);if(isActor(beat.target))introduced.add(beat.target);}
    const cast=ACTOR_IDS.filter(a=>introduced.has(a));
    const r = compile(p.beatScript, state, { paragraphId: p.paragraphId, version: p.version, lang, remix: p.remix, isFirst: i === 0, carry,cast,speechDurations });
    results.push(r);
    segments.push({ offset, segment: r.segment });
    offset += r.segment.duration;
    state = r.segment.endState;
    carry = r.carry;
  });
  return { results, timeline: { segments, duration: offset } };
}
