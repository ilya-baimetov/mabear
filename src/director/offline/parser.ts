// Offline deterministic EN/RU parser (spec §10): paragraph → BeatScript. Pure.
import type { BeatScript, Lang, WorldState } from "../../shared/schema";

export function parseParagraph(text: string, lang: Lang, startState: WorldState): BeatScript {
  return {
    summary: text.slice(0, 140), time_of_day: null, mood: "playful",
    music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null,
    beats: [{ actor: "masha", verb: "idle", target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto" }],
    rule_hits: [],
  };
}
