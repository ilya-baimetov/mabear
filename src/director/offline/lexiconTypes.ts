import type {
  ActorId, Ambience, Emote, Emotion, Lang, MarkId, MusicMood, PropId, SfxId, TimeOfDay, Verb,
} from "../../shared/schema";

export interface Lexicon {
  lang: Lang;
  /** `plural` = a group mention ("the wolves"): both Wolves act, in parallel */
  actors: { re: RegExp; id: ActorId; nominative: boolean; plural?: boolean }[];
  pronouns: { re: RegExp; id: ActorId; subject: boolean }[];
  both: RegExp;
  objectPrepositions: RegExp;
  clauseSplit: RegExp;
  simultaneous: RegExp;
  verbs: { re: RegExp; verb: Verb }[];
  speech: RegExp;
  speechVerb: { re: RegExp; verb: Verb; emotion: Emotion }[];
  emotes: { re: RegExp; emote: Emote }[];
  marks: { re: RegExp; id: MarkId }[];
  props: { re: RegExp; id: PropId }[];
  itPronoun: RegExp;
  /** non-actor nouns that can be a clause subject (sun, music, ball...) */
  things: RegExp;
  /** weather/time nouns that are never objects of an action (RU subject after the verb) */
  weather: RegExp;
  musicWord: RegExp;
  musicStop: RegExp;
  musicMoods: { re: RegExp; mood: MusicMood }[];
  ambience: { re: RegExp; id: Ambience }[];
  sfx: { re: RegExp; id: SfxId }[];
  timeOfDay: { re: RegExp; tod: TimeOfDay }[];
  emotions: { re: RegExp; emotion: Emotion }[];
  verbLabels: Record<Verb, string>;
  names: Record<ActorId, string>;
  says: string;
}
