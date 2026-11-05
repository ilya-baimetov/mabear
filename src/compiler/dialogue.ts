// Dialogue cues and visemes from text (spec §7.6). Pure.
// The child's words are kept verbatim: this module never rewrites `text`.
import type { ActorId, DialogueCue, Lang, Viseme } from "../shared/schema";

/** Dialogue duration = max(1.2 s, chars / 13) + 0.3 s. */
export function dialogueDuration(text: string): number {
  return Math.max(1.2, text.length / 13) + 0.3;
}

const VOWELS: Record<Lang, Record<string, Viseme>> = {
  en: { a: "open_wide", e: "e", i: "e", o: "o", u: "o", y: "e" },
  ru: { а: "open_wide", о: "o", у: "o", э: "e", и: "e", ы: "e", е: "e", ё: "o", ю: "o", я: "open_wide" },
};
const PUNCT = /[.,!?;:…—–()"«»]/;
const LETTER = /\p{L}/u;
/** Target viseme rate (per second). */
export const VISEME_RATE = 12;

/** Viseme tokens for a text: vowels → open shapes, consonant runs → open_small, punctuation → rest. */
export function visemeTokens(text: string, lang: Lang): Viseme[] {
  const map = { ...VOWELS.en, ...VOWELS.ru, ...VOWELS[lang] };
  const out: Viseme[] = [];
  let inConsonants = false;
  for (const ch of text.toLowerCase()) {
    const v = map[ch];
    if (v) {
      out.push(v);
      inConsonants = false;
    } else if (LETTER.test(ch) || /\d/.test(ch)) {
      if (!inConsonants) out.push("open_small");
      inConsonants = true;
    } else if (PUNCT.test(ch)) {
      if (out[out.length - 1] !== "rest") out.push("rest");
      inConsonants = false;
    } else {
      inConsonants = false; // whitespace: word boundary, no shape of its own
    }
  }
  while (out.length && out[0] === "rest") out.shift();
  return out;
}

/** Visemes with times (relative to the cue start). Spread over the speaking time (dur − 0.3 s), at most ~12/s;
 *  always ends with a `rest`. */
export function visemesFor(text: string, lang: Lang, dur?: number): { t: number; v: Viseme }[] {
  const total = dur ?? dialogueDuration(text);
  const speak = Math.max(0.3, total - 0.3);
  let tokens = visemeTokens(text, lang);
  const maxN = Math.max(1, Math.round(speak * VISEME_RATE));
  if (tokens.length > maxN) {
    // downsample evenly, keep rests
    const k = tokens.length / maxN;
    const ds: Viseme[] = [];
    for (let i = 0; i < maxN; i++) ds.push(tokens[Math.floor(i * k)]);
    tokens = ds;
  }
  if (tokens.length === 0) return [{ t: 0, v: "rest" }];
  const step = speak / tokens.length;
  const out = tokens.map((v, i) => ({ t: round3(i * step), v }));
  out.push({ t: round3(speak), v: "rest" });
  return out;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function makeDialogueCue(start: number, actor: ActorId, text: string, lang: Lang): DialogueCue {
  const dur = dialogueDuration(text);
  return { start, dur, actor, text, lang, visemes: visemesFor(text, lang, dur) };
}

/** A "shouted" line (for ambient reactions and camera emphasis). */
export function isShouted(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return /!/.test(text) || (letters.length > 3 && letters === letters.toUpperCase());
}
