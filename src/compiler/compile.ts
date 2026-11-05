// Deterministic BeatScript → Segment compiler (spec §6.4, §6.5, §7.5, §7.6). Pure.
import type { CompileFn } from "./types";
import { cloneWorldState } from "./worldState";

export const compile: CompileFn = (bs, startState, opts) => {
  const empty = { masha: [], bear: [] };
  return {
    segment: {
      paragraphId: opts.paragraphId, version: opts.version, duration: 1,
      startState: cloneWorldState(startState), endState: cloneWorldState(startState),
      actorClips: empty, dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [], ambience: [], ducking: [], lighting: [], fx: [],
    },
    beatScript: bs, repairs: [], errors: [], carry: opts.carry,
  };
};

export const compileParagraph = compile;
