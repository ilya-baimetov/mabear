// Golden-path fixtures (spec §6.6): three hand-authored example episodes × {en, ru}.
// Each paragraph carries a hand-written BeatScript; loading an example never calls the LLM.
// They double as e2e test data and few-shot examples for the director prompt (§8.3.7).
import { BeatScriptSchema, type FixtureEpisode, type Lang } from "../../shared/schema";
import pancakeEn from "./pancake_morning.en.json";
import pancakeRu from "./pancake_morning.ru.json";
import napEn from "./bears_nap.en.json";
import napRu from "./bears_nap.ru.json";
import fishingEn from "./fishing_trip.en.json";
import fishingRu from "./fishing_trip.ru.json";

/** JSON imports widen literal types; re-validate every BeatScript through the frozen schema. */
function load(raw: unknown): FixtureEpisode {
  const e = raw as FixtureEpisode;
  return {
    id: e.id,
    lang: e.lang,
    title: e.title,
    paragraphs: e.paragraphs.map((p) => ({ text: p.text, beatScript: BeatScriptSchema.parse(p.beatScript) })),
  };
}

export const FIXTURES: FixtureEpisode[] = [pancakeEn, pancakeRu, napEn, napRu, fishingEn, fishingRu].map(load);

export const FIXTURE_IDS: FixtureEpisode["id"][] = ["pancake_morning", "bears_nap", "fishing_trip"];

/** Collapse whitespace, trim, and unify curly quotes so pasted text still matches. */
export function normalizeFixtureText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact (whitespace-normalized) lookup of a paragraph in any fixture episode. */
export function findFixtureParagraph(text: string): { episode: FixtureEpisode; index: number } | null {
  const needle = normalizeFixtureText(text);
  if (!needle) return null;
  for (const episode of FIXTURES) {
    const index = episode.paragraphs.findIndex((p) => normalizeFixtureText(p.text) === needle);
    if (index >= 0) return { episode, index };
  }
  return null;
}

export function getFixture(id: FixtureEpisode["id"], lang: Lang): FixtureEpisode | null {
  return FIXTURES.find((e) => e.id === id && e.lang === lang) ?? null;
}
