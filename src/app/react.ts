// D9 (P2): tap a character when the story isn't playing → a short in-character reaction.
// Compiled locally from the episode's final world state; no AI call, nothing added to the story.
import { compile } from "../compiler/compile";
import { EMPTY_CARRY } from "../compiler/audioCues";
import { initialWorldState } from "../compiler/worldState";
import { DEFAULT_REMIX, type ActorId, type Beat, type BeatScript, type Lang, type Timeline } from "../shared/schema";
import type { AppState } from "./store";

type Partial = Pick<Beat, "verb" | "emote" | "emotion"> & { line?: Record<Lang, string> };

const REACTIONS: Record<ActorId, Partial[]> = {
  lady_bear: [{ verb: "wave", emote: "hum", emotion: "happy" }, { verb: "dance", emote: "chuckle", emotion: "excited" }],
  hare: [{ verb: "wave", emote: "hum", emotion: "happy" }, { verb: "dance", emote: "chuckle", emotion: "excited" }],
  rosie: [{ verb: "wave", emote: "hum", emotion: "happy" }, { verb: "dance", emote: "chuckle", emotion: "excited" }],
  squirrel: [{ verb: "wave", emote: "hum", emotion: "happy" }, { verb: "dance", emote: "chuckle", emotion: "excited" }],
  rival_bear: [{ verb: "wave", emote: "hum", emotion: "happy" }, { verb: "dance", emote: "chuckle", emotion: "excited" }],

  masha: [
    { verb: "jump", emote: "giggle", emotion: "excited", line: { en: "Hee-hee! That tickles!", ru: "Хи-хи! Щекотно!" } },
    { verb: "spin", emote: "wheee", emotion: "happy" },
    { verb: "wave", emote: null, emotion: "happy", line: { en: "Hi! Let's play!", ru: "Привет! Давай играть!" } },
    { verb: "laugh", emote: "laugh", emotion: "mischievous" },
  ],
  bear: [
    { verb: "facepalm", emote: "sigh", emotion: "annoyed" },
    { verb: "laugh", emote: "chuckle", emotion: "happy" },
    { verb: "wave", emote: "hum", emotion: "happy" },
    { verb: "shrug", emote: "grunt", emotion: "curious" },
  ],
  wolf_a: [
    { verb: "laugh", emote: "snicker", emotion: "mischievous" },
    { verb: "scared", emote: "whimper", emotion: "scared" },
    { verb: "jump", emote: "howl", emotion: "excited" },
  ],
  wolf_b: [
    { verb: "laugh", emote: "snicker", emotion: "mischievous" },
    { verb: "shrug", emote: "whimper", emotion: "curious" },
    { verb: "wave", emote: "howl", emotion: "happy" },
  ],
};

/** Who answers a tapped character: Masha ⇄ Bear; a Wolf's partner Wolf. */
const PARTNER: Record<ActorId, ActorId> = { masha: "bear", bear: "masha", wolf_a: "wolf_b", wolf_b: "wolf_a", lady_bear: "bear", hare: "masha", rosie: "masha", squirrel: "hare", rival_bear: "bear" };

function beat(actor: ActorId, p: Partial, lang: Lang, withPrev: boolean, delay: number): Beat {
  return { actor, verb: p.verb, target: null, item: null, line: p.line ? p.line[lang] : null, emote: p.emote, sfx: null, emotion: p.emotion, with_previous: withPrev, delay_s: delay, shot: "medium" };
}

/** Build a timeline = story + one reaction segment. Returns the playback range of the reaction. */
export function reactionTimeline(s: AppState, actor: ActorId, n: number): { timeline: Timeline; start: number; end: number } {
  const list = REACTIONS[actor];
  const main = list[n % list.length];
  const other = PARTNER[actor];
  const reply = REACTIONS[other][(n + 1) % REACTIONS[other].length];
  const last = s.results[s.results.length - 1];
  const start = last ? last.segment.endState : initialWorldState();
  const carry = last ? last.carry : EMPTY_CARRY;
  const bs: BeatScript = {
    summary: "",
    time_of_day: null,
    mood: "playful",
    music: { mood: carry.music?.mood ?? "none", intensity: "soft", change: "continue" },
    ambience: null,
    beats: [beat(actor, main, s.lang, false, 0), beat(other, reply, s.lang, true, 0.6)],
    rule_hits: [],
  };
  const r = compile(bs, start, { paragraphId: `react-${n}`, version: 1, lang: s.lang, remix: DEFAULT_REMIX, isFirst: false, carry });
  const offset = s.timeline.duration;
  return {
    timeline: { segments: [...s.timeline.segments, { offset, segment: r.segment }], duration: offset + r.segment.duration },
    start: offset,
    end: offset + r.segment.duration,
  };
}
