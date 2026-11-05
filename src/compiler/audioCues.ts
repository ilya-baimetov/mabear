// Compiler-side audio cue resolution (spec §7.6). Pure.
import type { AmbienceCue, BeatScript, DialogueCue, DuckingCue, EmoteCue, FoleyCue, MusicTrackCue, SfxCue, ActorClip, ActorId, TimeOfDay, CameraCue } from "../shared/schema";
import type { CarryAudio } from "./types";

export const EMPTY_CARRY: CarryAudio = { music: null, ambience: [] };

export interface AudioCueInput {
  bs: BeatScript;
  actorClips: Record<ActorId, ActorClip[]>;
  /** start time of each beat's main clip (index-aligned with bs.beats; -1 = dropped) */
  beatTimes: { start: number; dur: number }[];
  dialogue: DialogueCue[];
  camera: CameraCue[];
  timeOfDay: TimeOfDay;
  carry: CarryAudio;
  duration: number;
  musicMoodOverride: import("../shared/schema").MusicMood | null;
}

export interface AudioCueOutput {
  foley: FoleyCue[];
  emotes: EmoteCue[];
  sfx: SfxCue[];
  music: MusicTrackCue[];
  ambience: AmbienceCue[];
  ducking: DuckingCue[];
  carry: CarryAudio;
}

export function buildAudioCues(input: AudioCueInput): AudioCueOutput {
  return { foley: [], emotes: [], sfx: [], music: [], ambience: [], ducking: [], carry: input.carry };
}
