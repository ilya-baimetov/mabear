// Episode compilation: chain endState → startState and carry audio across paragraphs (spec §6.5). Pure.
import type { Lang, Timeline, WorldState } from "../shared/schema";
import type { CompileResult, EpisodeParagraphInput } from "./types";
import { compile } from "./compile";
import { EMPTY_CARRY } from "./audioCues";
import { initialWorldState } from "./worldState";

export function compileEpisode(paras: EpisodeParagraphInput[], lang: Lang, initial?: WorldState): { results: CompileResult[]; timeline: Timeline } {
  let state = initial ?? initialWorldState();
  let carry = EMPTY_CARRY;
  const results: CompileResult[] = [];
  const segments: Timeline["segments"] = [];
  let offset = 0;
  paras.forEach((p, i) => {
    const r = compile(p.beatScript, state, { paragraphId: p.paragraphId, version: p.version, lang, remix: p.remix, isFirst: i === 0, carry });
    results.push(r);
    segments.push({ offset, segment: r.segment });
    offset += r.segment.duration;
    state = r.segment.endState;
    carry = r.carry;
  });
  return { results, timeline: { segments, duration: offset } };
}
