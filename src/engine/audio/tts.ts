// Dialogue + Masha interjections via Web Speech `speechSynthesis` (spec §7.6). TTS can't be routed through WebAudio:
// its level is utterance.volume = MIX.voice × master. Never blocks or throws; no voice (headless) → silently skipped.
import type { ActorId, Lang } from "../../shared/schema";
import { CHARACTERS, type VoiceProfile } from "../../shared/bible/characters";

export interface VoiceLike {
  name: string;
  lang: string;
  /** true = installed on the device; false = online voice (e.g. Chrome's "Google …" voices) */
  localService?: boolean;
}

const norm = (l: string): string => (l || "").replace("_", "-").toLowerCase();

// Voice ranking. Browser TTS has no studio Masha; we pick the most child-like, natural voice the device offers and
// raise the pitch (spec §7.6: placeholder voice, swapped for the real one in production).
/** Real child voices some platforms ship (e.g. Edge "Microsoft Ana Online (Natural)", macOS "Junior"). */
const CHILD = /\b(ana\b.*(natural|online|neural)|junior|child|kid|girl)/i;
/** macOS Eloquence + novelty voices: listed for every language but speak it with a heavy English accent. */
const BAD = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|ralph|kathy)\b/i;
const QUALITY = /(natural|neural|enhanced|premium|online|wavenet)/i;
const FEMALE = /\b(milena|katya|svetlana|dariya|irina|anna|alyona|samantha|ava|allison|susan|zira|jenny|aria|serena|karen|moira|tessa|victoria|female|женский)\b/i;
const MALE = /\b(yuri|pavel|dmitry|maxim|daniel|alex|david|mark|guy|tom|oliver|arthur|aaron|male|мужской)\b/i;

export function isChildVoice(v: VoiceLike): boolean {
  return CHILD.test(v.name);
}
export function isMaleVoice(v: VoiceLike): boolean {
  return !FEMALE.test(v.name) && MALE.test(v.name);
}

/** Higher is better for a young character's voice in `bcp47`. Pure. */
export function scoreVoice(v: VoiceLike, bcp47: string): number {
  const want = norm(bcp47);
  const lang = norm(v.lang);
  let s = lang === want ? 1000 : lang.split("-")[0] === want.split("-")[0] ? 500 : -10_000;
  if (BAD.test(v.name.trim())) s -= 800; // never an accented novelty voice when a native one exists
  if (isChildVoice(v)) s += 120;
  // installed voices first: when an online voice fails mid-utterance Chrome silently falls back to the system's
  // default (English) voice, which reads Russian with a heavy English accent
  if (v.localService === true) s += 80;
  if (/google/i.test(v.name)) s += 20;
  if (QUALITY.test(v.name)) s += 40;
  if (FEMALE.test(v.name)) s += 30;
  if (isMaleVoice(v)) s -= 30;
  return s;
}

/** Best voice for a BCP-47 tag (child > Google > natural/enhanced > female; never an accented novelty voice
 *  when a native one exists; exact language before same base language). Pure. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], bcp47: string): V | null {
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const sc = scoreVoice(v, bcp47);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return best && bestScore > 0 ? best : null;
}

/** Pitch for a young character on this voice: a real child voice needs little lift; adult voices are raised. */
export function childPitch(v: VoiceLike, profilePitch: number): number {
  if (isChildVoice(v)) return Math.min(2, Math.max(1, profilePitch - 0.45));
  if (isMaleVoice(v)) return 2;
  return Math.min(2, profilePitch);
}

/** localStorage key for a voice the person picked for a language (Behind the scenes → voice picker). */
export function voicePrefKey(bcp47: string): string {
  return `mabear.voice.${norm(bcp47).split("-")[0]}`;
}
export function preferredVoiceName(bcp47: string): string | null {
  try {
    return globalThis.localStorage?.getItem(voicePrefKey(bcp47)) || null;
  } catch {
    return null;
  }
}
/** The person's picked voice when it's installed and speaks this language, else the best-ranked one. */
export function chooseVoice<V extends VoiceLike>(voices: readonly V[], bcp47: string, preferred: string | null = preferredVoiceName(bcp47)): V | null {
  if (preferred) {
    const base = norm(bcp47).split("-")[0];
    const v = voices.find((x) => x.name === preferred && norm(x.lang).split("-")[0] === base);
    if (v) return v;
  }
  return pickVoice(voices, bcp47);
}

/** Fallback voice profile for a character with `voice: null` (e.g. if Bear's `speaks` flag is ever flipped). */
const FALLBACK_PROFILE: VoiceProfile = { lang: { en: "en-US", ru: "ru-RU" }, pitch: 0.5, rate: 0.9 };

export function profileFor(actor: ActorId): VoiceProfile {
  return CHARACTERS[actor]?.voice ?? FALLBACK_PROFILE;
}

/** Masha's interjection text for an emote, if the bible has one. */
export function interjection(actor: ActorId, emote: string, lang: Lang): string | null {
  const ij = CHARACTERS[actor]?.interjections as Record<string, Record<Lang, string>> | undefined;
  return ij?.[emote]?.[lang] ?? null;
}
