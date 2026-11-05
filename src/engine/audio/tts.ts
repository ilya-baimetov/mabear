// Dialogue + Masha interjections via Web Speech `speechSynthesis` (spec §7.6). TTS can't be routed through WebAudio:
// its level is utterance.volume = MIX.voice × master. Never blocks or throws; no voice (headless) → silently skipped.
import type { ActorId, Lang } from "../../shared/schema";
import { CHARACTERS, type VoiceProfile } from "../../shared/bible/characters";

export interface VoiceLike {
  name: string;
  lang: string;
}

const norm = (l: string): string => (l || "").replace("_", "-").toLowerCase();

/** Best voice for a BCP-47 tag: "Google" + exact lang, then exact lang, then same base language. Pure. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], bcp47: string): V | null {
  const want = norm(bcp47);
  const base = want.split("-")[0];
  const exact = voices.filter((v) => norm(v.lang) === want);
  const google = exact.find((v) => /google/i.test(v.name));
  if (google) return google;
  if (exact.length) return exact[0];
  const sameBase = voices.filter((v) => norm(v.lang).split("-")[0] === base);
  return sameBase.find((v) => /google/i.test(v.name)) ?? sameBase[0] ?? null;
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

function synth(): SpeechSynthesis | null {
  try {
    const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: unknown };
    return g.speechSynthesis && typeof g.SpeechSynthesisUtterance === "function" ? g.speechSynthesis : null;
  } catch {
    return null;
  }
}

export class Tts {
  private voices: SpeechSynthesisVoice[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    const s = synth();
    if (!s) return;
    this.refresh();
    try {
      s.addEventListener?.("voiceschanged", () => this.refresh());
    } catch {
      /* ignore */
    }
  }

  private refresh(notify = true): void {
    const before = this.voices.length;
    try {
      this.voices = synth()?.getVoices() ?? [];
    } catch {
      this.voices = [];
    }
    if (notify && before !== this.voices.length) this.listeners.forEach((l) => l());
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  get available(): boolean {
    if (!this.voices.length) this.refresh(false);
    return this.voices.length > 0;
  }

  get speaking(): boolean {
    try {
      return !!synth()?.speaking;
    } catch {
      return false;
    }
  }

  /** Speak now. Returns false when no voice is available (caller may fall back). Never throws. */
  speak(text: string, bcp47: string, pitch: number, rate: number, volume: number): boolean {
    const s = synth();
    if (!s || !text.trim() || !this.available) return false;
    try {
      const voice = pickVoice(this.voices, bcp47);
      if (!voice) return false;
      const U = (globalThis as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
      const u = new U(text);
      u.voice = voice;
      u.lang = voice.lang || bcp47;
      u.pitch = Math.max(0, Math.min(2, pitch));
      u.rate = Math.max(0.1, Math.min(10, rate));
      u.volume = Math.max(0, Math.min(1, volume));
      u.onerror = () => {};
      s.speak(u);
      return true;
    } catch {
      return false;
    }
  }

  /** Prime speech inside a user gesture (some browsers only allow TTS after one). */
  prime(): void {
    const s = synth();
    if (!s) return;
    try {
      const U = (globalThis as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
      const u = new U(" ");
      u.volume = 0;
      s.speak(u);
    } catch {
      /* ignore */
    }
  }

  cancel(): void {
    try {
      synth()?.cancel();
    } catch {
      /* ignore */
    }
  }
}
