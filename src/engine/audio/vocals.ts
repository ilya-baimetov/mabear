// Vocalizations (spec §7.6). Bear: synthesized low vocal tones (formant-filtered sawtooth + breath noise) per emote.
// Masha: short TTS interjections from the bible (handled in index.ts via tts.ts) with this synthesized high "blip"
// as the fallback when no voice is available or speech is busy.
import type { ActorId, Emote } from "../../shared/schema";
import { biquad, gainNode, mulberry32, noiseBuffer, SILENT, type Out } from "./synth";

export type Vowel = "a" | "o" | "u" | "e" | "i" | "m" | "h";

/** Adult formants F1..F3 (Hz) and relative gains. Pure data. */
export const FORMANTS: Record<Vowel, { f: [number, number, number]; g: [number, number, number] }> = {
  a: { f: [730, 1090, 2440], g: [1, 0.55, 0.25] },
  o: { f: [520, 880, 2400], g: [1, 0.45, 0.18] },
  u: { f: [320, 760, 2300], g: [1, 0.3, 0.12] },
  e: { f: [530, 1840, 2480], g: [1, 0.45, 0.25] },
  i: { f: [300, 2200, 3000], g: [1, 0.35, 0.25] },
  m: { f: [260, 1000, 2200], g: [1, 0.1, 0.04] },
  h: { f: [650, 1250, 2500], g: [0.7, 0.5, 0.4] },
};

export interface Syllable {
  /** onset (s) relative to the emote start */
  at: number;
  dur: number;
  /** f0 contour (Hz) spread over dur */
  f0: number[];
  vowel: Vowel | [Vowel, Vowel];
  amp: number;
  /** 0 = fully voiced, 1 = breath only */
  noise: number;
  /** 0..1 amplitude roughness (growl / snore rattle) */
  rough?: number;
}

const s = (at: number, dur: number, f0: number[], vowel: Syllable["vowel"], amp: number, noise: number, rough?: number): Syllable =>
  ({ at, dur, f0, vowel, amp, noise, rough });

/** Bear's vocal emotes (low, big vocal tract). Pure data. */
export const BEAR_VOCALS: Partial<Record<Emote, Syllable[]>> = {
  grunt: [s(0, 0.24, [115, 85], "u", 1, 0.25, 0.2)],
  sigh: [s(0, 1.0, [150, 120, 90], ["a", "u"], 0.55, 0.85)],
  hum: [s(0, 0.36, [120, 121], "m", 0.6, 0.04), s(0.38, 0.3, [135, 136], "m", 0.6, 0.04), s(0.7, 0.55, [110, 106], "m", 0.55, 0.05)],
  growl_soft: [s(0, 0.75, [85, 80, 92, 75], "o", 0.7, 0.35, 0.6)],
  chuckle: [s(0, 0.1, [135, 115], "o", 0.6, 0.4), s(0.15, 0.1, [130, 112], "o", 0.5, 0.4), s(0.3, 0.12, [125, 105], "o", 0.4, 0.45)],
  laugh: [0, 0.17, 0.34, 0.51, 0.68].map((t, k) => s(t, 0.13, [165 - k * 6, 135 - k * 6], "o", 0.9 - k * 0.12, 0.3)),
  snore: [s(0, 1.0, [52, 58, 55], ["h", "o"], 0.65, 0.75, 0.9), s(1.15, 0.9, [70, 62], "u", 0.3, 0.95)],
  huff: [s(0, 0.32, [100, 80], "h", 0.85, 0.95)],
  roar_soft: [s(0, 0.95, [95, 140, 110], ["a", "o"], 1, 0.3, 0.35)],
  yawn: [s(0, 1.4, [110, 150, 120, 90], ["a", "u"], 0.8, 0.35)],
  gasp: [s(0, 0.25, [180, 220], "h", 0.7, 0.9)],
  sneeze: [s(0, 0.22, [130, 170], "a", 0.55, 0.3), s(0.28, 0.24, [150, 200], "a", 0.65, 0.3), s(0.6, 0.25, [230, 120], "u", 1, 0.95)],
  hmph: [s(0, 0.06, [140, 140], "h", 0.6, 1), s(0.05, 0.22, [140, 100], "m", 0.8, 0.4)],
};

/** Masha's synthesized fallback blips (child voice, high pitch). Pure data. */
export const MASHA_VOCALS: Partial<Record<Emote, Syllable[]>> = {
  giggle: [0, 0.11, 0.22, 0.33].map((t, k) => s(t, 0.08, [560 - k * 15, 500 - k * 15], "i", 0.7 - k * 0.1, 0.25)),
  laugh: [0, 0.15, 0.3, 0.45].map((t, k) => s(t, 0.11, [470 - k * 12, 410 - k * 12], "a", 0.85 - k * 0.12, 0.2)),
  gasp: [s(0, 0.22, [420, 620], "h", 0.7, 0.85)],
  wheee: [s(0, 0.85, [520, 880, 700], "i", 0.85, 0.1)],
  hmph: [s(0, 0.05, [380, 380], "h", 0.6, 1), s(0.04, 0.2, [390, 300], "m", 0.8, 0.3)],
  uh_oh: [s(0, 0.18, [430, 440], "a", 0.8, 0.15), s(0.24, 0.26, [350, 320], "o", 0.8, 0.15)],
  yawn: [s(0, 1.0, [380, 460, 300], ["a", "o"], 0.6, 0.35)],
  cry: [s(0, 1.0, [480, 420, 470, 400, 440, 380], "a", 0.7, 0.25)],
  cheer: [s(0, 0.16, [420, 450], "u", 0.7, 0.15), s(0.18, 0.4, [560, 640, 600], "a", 0.9, 0.1)],
  scream_fun: [s(0, 0.8, [700, 820, 650], "a", 0.85, 0.2)],
  sneeze: [s(0, 0.18, [420, 520], "a", 0.5, 0.3), s(0.24, 0.18, [480, 600], "a", 0.6, 0.3), s(0.5, 0.2, [640, 380], "u", 0.9, 0.95)],
  hum: [s(0, 0.25, [440, 441], "m", 0.6, 0.05), s(0.27, 0.25, [494, 495], "m", 0.6, 0.05), s(0.54, 0.35, [392, 390], "m", 0.6, 0.05)],
  sigh: [s(0, 0.7, [360, 260], ["a", "u"], 0.5, 0.85)],
};

/** f0 contour with vibrato baked in: `base` (Hz) points interpolated over n samples, ±depth (fraction) at `rate` Hz
 *  across a syllable of `dur` s, the vibrato fading in after `onset` (fraction of dur). Pure. */
export function vibratoCurve(base: number[], dur: number, rate: number, depth: number, onset = 0.3, n = 48): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = u * (base.length - 1);
    const k = Math.min(base.length - 2, Math.floor(x));
    const f = base[k] + (base[k + 1] - base[k]) * (x - k);
    const w = Math.max(0, Math.min(1, (u - onset) / 0.15));
    out.push(Math.round(f * (1 + depth * w * Math.sin(2 * Math.PI * rate * u * dur)) * 10) / 10);
  }
  return out;
}

/** The Wolves' own vocal emotes (lanky adult voice, a touch nasal). Pure data. */
export const WOLF_VOCALS: Partial<Record<Emote, Syllable[]>> = {
  // a classic cartoon howl: a rising "oo" glide into a long vibrato "ow", tailing off
  howl: [s(0, 1.8, vibratoCurve([240, 330, 520, 540, 520, 380], 1.8, 6, 0.04, 0.35), ["u", "o"], 0.85, 0.12)],
  // short high falling glides (a frightened little whine), three in a row
  whimper: [s(0, 0.17, [640, 450], "i", 0.55, 0.3), s(0.24, 0.15, [610, 440], "i", 0.5, 0.3), s(0.46, 0.3, [660, 380], ["i", "u"], 0.5, 0.35)],
  // rapid nasal pulses through the snout: "nhn-nhn-nhn"
  snicker: [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t, k) => s(t, 0.055, [340 - k * 6, 300 - k * 6], "m", 0.7 - k * 0.07, 0.45)),
};
const WOLF_VOICE: Record<"wolf_a" | "wolf_b", VocalVoice> = { wolf_a: { pitch: 1, formant: 0.95 }, wolf_b: { pitch: 1.14, formant: 1.02 } };
/** Bear's recipes the Wolves borrow for their other emotes, raised to a lankier, smaller voice. */
const WOLF_FROM_BEAR = 1.7;

/** Emotes Bear doesn't have → nearest Bear sound. */
const BEAR_ALIAS: Partial<Record<Emote, Emote>> = {
  giggle: "chuckle", wheee: "hum", cheer: "laugh", cry: "sigh", uh_oh: "gasp", scream_fun: "roar_soft",
  howl: "roar_soft", whimper: "sigh", snicker: "chuckle",
};

export interface VocalVoice {
  /** f0 multiplier */
  pitch: number;
  /** formant multiplier (smaller vocal tract → higher) */
  formant: number;
}

const BEAR_VOICE: VocalVoice = { pitch: 1, formant: 0.82 };
const MASHA_VOICE: VocalVoice = { pitch: 1, formant: 1.3 };

/** Resolve the syllables + voice for an actor's emote (null = silence). Pure. */
export function vocalFor(actor: ActorId, emote: Emote): { syl: Syllable[]; voice: VocalVoice } | null {
  if (emote === "none") return null;
  if (actor === "masha") {
    const m = MASHA_VOCALS[emote];
    if (m) return { syl: m, voice: MASHA_VOICE };
    const b = BEAR_VOCALS[emote];
    return b ? { syl: b, voice: { pitch: 3.4, formant: 1.3 } } : null;
  }
  if (actor === "wolf_a" || actor === "wolf_b") {
    const v = WOLF_VOICE[actor];
    const w = WOLF_VOCALS[emote];
    if (w) return { syl: w, voice: v };
    const b = BEAR_VOCALS[emote];
    return b ? { syl: b, voice: { pitch: v.pitch * WOLF_FROM_BEAR, formant: v.formant } } : null;
  }
  const b = BEAR_VOCALS[emote] ?? BEAR_VOCALS[BEAR_ALIAS[emote] ?? "none"];
  return b ? { syl: b, voice: BEAR_VOICE } : null;
}

export function vocalLength(syl: Syllable[]): number {
  return syl.reduce((m, x) => Math.max(m, x.at + x.dur), 0);
}

function renderSyllable(o: Out, x: Syllable, v: VocalVoice, t: number, gain: number): void {
  const { ctx } = o;
  const dur = Math.max(0.04, x.dur);
  const end = t + dur;
  const env = ctx.createGain();
  const peak = Math.max(SILENT, x.amp * gain);
  env.gain.setValueAtTime(SILENT, t);
  env.gain.linearRampToValueAtTime(peak, t + Math.min(0.04, dur * 0.25));
  env.gain.setValueAtTime(peak * 0.85, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(SILENT, end);
  let out: AudioNode = env;
  if (x.rough) {
    // amplitude rattle (growl / snore)
    const am = gainNode(ctx, 1 - x.rough * 0.5);
    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 24 + x.rough * 10;
    const depth = gainNode(ctx, x.rough * 0.5);
    lfo.connect(depth).connect(am.gain);
    lfo.start(t);
    lfo.stop(end + 0.05);
    o.track(lfo);
    env.connect(am);
    out = am;
  }
  out.connect(o.dest);

  const [v1, v2] = Array.isArray(x.vowel) ? x.vowel : [x.vowel, x.vowel];
  const F1 = FORMANTS[v1];
  const F2 = FORMANTS[v2];
  const src = gainNode(ctx, 1);
  for (let k = 0; k < 3; k++) {
    const bp = biquad(ctx, "bandpass", F1.f[k] * v.formant, 6 + k * 3);
    if (v1 !== v2) {
      bp.frequency.setValueAtTime(F1.f[k] * v.formant, t);
      bp.frequency.linearRampToValueAtTime(F2.f[k] * v.formant, end);
    }
    const g = gainNode(ctx, F1.g[k] * 2.2);
    src.connect(bp).connect(g).connect(env);
  }
  // voiced source
  if (x.noise < 1) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const curve = x.f0.map((f) => Math.max(20, f * v.pitch));
    if (curve.length > 1) {
      osc.frequency.value = curve[0];
      osc.frequency.setValueCurveAtTime(Float32Array.from(curve), t, dur);
    } else osc.frequency.value = curve[0] ?? 120;
    const vg = gainNode(ctx, (1 - x.noise) * 0.6);
    osc.connect(vg).connect(src);
    osc.start(t);
    osc.stop(end + 0.05);
    o.track(osc);
  }
  // breath
  if (x.noise > 0) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, "white");
    n.loop = true;
    const ng = gainNode(ctx, x.noise * 0.9);
    n.connect(ng).connect(src);
    n.start(t, (t * 3.17) % 2.5);
    n.stop(end + 0.05);
    o.track(n);
  }
}

/** Schedule an actor's synthesized vocal emote at ctx time t. Returns its length (0 = nothing). */
export function renderVocal(o: Out, actor: ActorId, emote: Emote, t: number, gain = 1): number {
  const r = vocalFor(actor, emote);
  if (!r) return 0;
  const rnd = mulberry32(Math.floor(t * 1000));
  const vary = 0.94 + rnd() * 0.12; // slight per-take pitch variation
  const voice = { pitch: r.voice.pitch * vary, formant: r.voice.formant };
  for (const x of r.syl) renderSyllable(o, x, voice, t + x.at, gain * (actor === "bear" ? 1.6 : 1.25));
  return vocalLength(r.syl);
}
