// Compiler-side contracts (frozen after M1; additive changes only).
import type { Ambience, BeatScript, Intensity, Lang, MusicMood, Remix, RuleHit, Segment, Timeline, WorldState } from "../shared/schema";

/** Audio context carried across paragraph boundaries (resolved music + ambience of the previous segment). */
export interface CarryAudio {
  music: { mood: MusicMood; intensity: Intensity } | null;
  ambience: Ambience[];
}

export interface CompileOptions {
  paragraphId: string;
  version: number;
  lang: Lang;
  remix: Remix;
  /** true for the first paragraph of the episode (establishing wide shot) */
  isFirst: boolean;
  carry: CarryAudio;
}

export interface CompileResult {
  segment: Segment;
  /** the BeatScript actually compiled (after trivial auto-repairs, e.g. inserted `take`) */
  beatScript: BeatScript;
  /** auto-repairs performed */
  repairs: string[];
  /** non-repairable problems → caller marks paragraph `draft` and re-directs */
  errors: string[];
  carry: CarryAudio;
}

/** compile(bs, startState, opts) — deterministic; same input → identical output. */
export type CompileFn = (bs: BeatScript, startState: WorldState, opts: CompileOptions) => CompileResult;

export interface EpisodeParagraphInput {
  paragraphId: string;
  version: number;
  beatScript: BeatScript;
  remix: Remix;
}

export interface ValidateResult {
  beatScript: BeatScript;
  hits: RuleHit[];
  /** structural problems that were fixed or remain */
  errors: string[];
}

export type { Timeline };
