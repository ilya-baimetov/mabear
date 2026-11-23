import type { Lang } from './schema';

/** User-selected audition #2 / #6. Do not pitch-shift or substitute browser voices. */
export const MASHA_VOICE = { endpoint: 'fal-ai/minimax/speech-2.8-hd', id: 'Lively_Girl', revision: 'lively-v1' } as const;
export function speechText(text: string): string { return text.normalize('NFC').replace(/\s+/g, ' ').trim(); }
export function speechLanguage(text: string, fallback: Lang): Lang {
  return /[\u0400-\u04FF]/.test(text) ? 'ru' : /[A-Za-z]/.test(text) ? 'en' : fallback;
}
export function speechKey(text: string, lang: Lang): string { return `${lang}:${speechText(text)}`; }
export interface SpeechRecording { text: string; lang: Lang; url: string; duration: number; }
export type SpeechDurations = Readonly<Record<string, number>>;

export const SPEECH_ERROR_CODES = [
  "invalid_request",
  "invalid_id",
  "line_too_long",
  "voice_allowance_reached",
  "speech_not_configured",
  "speech_submission_needs_review",
  "speech_generation_failed",
  "speech_failed",
  "job_not_found",
  "recording_not_found",
  "recording_incomplete",
  "method_not_allowed",
  "origin_not_allowed",
  "rate_limited",
  "unauthorized",
] as const;
export type SpeechErrorCode = (typeof SPEECH_ERROR_CODES)[number];

export interface SpeechRequest {
  text: string;
  lang: Lang;
}

export type SpeechStatusResponse =
  | { status: "pending"; id: string }
  | { status: "ready"; id: string; url: string; duration: number };

export interface SpeechErrorResponse {
  error: SpeechErrorCode;
}

export function mashaSpeechInput(text: string, lang: Lang): Record<string, unknown> {
  return {
    prompt: speechText(text), language_boost: lang === 'ru' ? 'Russian' : 'English',
    voice_setting: { voice_id: MASHA_VOICE.id, speed: 1, vol: 1, pitch: 0, emotion: 'happy', english_normalization: false },
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3', channel: 1 },
    normalization_setting: { enabled: true, target_loudness: -18, target_range: 8, target_peak: -0.5 },
    output_format: 'url',
  };
}
