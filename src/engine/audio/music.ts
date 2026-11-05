// Procedural folk-flavored score (spec §7.6): plucked "balalaika" (Karplus-Strong), accordion-like pad (detuned saws +
// low-pass, bellows tremolo), light percussion. Tempo / key / feel / instrumentation per MusicMood × intensity.
// Consecutive cues with the same mood are merged into ONE section → one continuous voice (no restart); mood changes
// crossfade. composeBar() and karplusStrong() are pure (unit-tested in node).
import type { Intensity, MusicMood } from "../../shared/schema";
import { intensityAt, type MusicSection } from "./scheduler";
import { SILENT, biquad, burst, clamp, gainNode, mtof, mulberry32, susEnv, tone, type Ctx, type Out } from "./synth";

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const;
export type ScaleName = keyof typeof SCALES;

export type Feel = "polka" | "gallop" | "waltz" | "ballad" | "lullaby" | "ostinato" | "creep" | "march";
export type Inst = "pluck" | "strum" | "bass" | "pad" | "lead" | "whistle" | "kick" | "shaker" | "tamb";

export interface MoodSpec {
  bpm: number;
  beatsPerBar: 2 | 3 | 4;
  /** MIDI note of the tonic (octave 4) */
  root: number;
  scale: ScaleName;
  /** chord root per bar, as 0-based scale degree */
  progression: number[];
  feel: Feel;
  melody: "pluck" | "lead" | "whistle";
  /** 0..1 melody note density */
  density: number;
  perc: boolean;
  /** balalaika tremolo on long melody notes at full intensity */
  tremolo: boolean;
}

export type PlayableMood = Exclude<MusicMood, "none">;

/** Tempo / key / instrumentation table per mood. */
export const MOOD_SPECS: Record<PlayableMood, MoodSpec> = {
  playful: { bpm: 126, beatsPerBar: 2, root: 62, scale: "major", progression: [0, 0, 4, 4, 0, 3, 4, 0], feel: "polka", melody: "pluck", density: 0.7, perc: true, tremolo: false },
  calm: { bpm: 80, beatsPerBar: 4, root: 67, scale: "major", progression: [0, 5, 3, 4], feel: "ballad", melody: "pluck", density: 0.4, perc: false, tremolo: true },
  sleepy: { bpm: 60, beatsPerBar: 3, root: 65, scale: "major", progression: [0, 3, 0, 4], feel: "lullaby", melody: "whistle", density: 0.35, perc: false, tremolo: false },
  tense: { bpm: 104, beatsPerBar: 4, root: 57, scale: "harmonicMinor", progression: [0, 0, 5, 4], feel: "ostinato", melody: "pluck", density: 0.3, perc: true, tremolo: false },
  spooky: { bpm: 72, beatsPerBar: 4, root: 62, scale: "harmonicMinor", progression: [0, 3, 0, 4], feel: "creep", melody: "whistle", density: 0.25, perc: false, tremolo: false },
  chase: { bpm: 168, beatsPerBar: 2, root: 64, scale: "harmonicMinor", progression: [0, 0, 4, 4, 5, 3, 4, 4], feel: "gallop", melody: "pluck", density: 0.9, perc: true, tremolo: false },
  triumphant: { bpm: 116, beatsPerBar: 4, root: 60, scale: "major", progression: [0, 3, 4, 0, 5, 3, 4, 0], feel: "march", melody: "lead", density: 0.55, perc: true, tremolo: true },
  sad: { bpm: 66, beatsPerBar: 4, root: 57, scale: "minor", progression: [0, 5, 3, 4], feel: "ballad", melody: "lead", density: 0.35, perc: false, tremolo: false },
  romantic_waltz: { bpm: 156, beatsPerBar: 3, root: 65, scale: "major", progression: [0, 5, 1, 4, 0, 3, 4, 0], feel: "waltz", melody: "lead", density: 0.6, perc: true, tremolo: false },
};

export const INTENSITY_LEVEL: Record<Intensity, number> = { soft: 0, medium: 1, full: 2 };
export const INTENSITY_GAIN: Record<Intensity, number> = { soft: 0.6, medium: 0.82, full: 1 };

export const beatSeconds = (spec: MoodSpec): number => 60 / spec.bpm;
export const barSeconds = (spec: MoodSpec): number => (60 / spec.bpm) * spec.beatsPerBar;

export function degreeToMidi(spec: MoodSpec, degree: number, octaveShift = 0): number {
  const sc = SCALES[spec.scale];
  const o = Math.floor(degree / 7);
  const d = ((degree % 7) + 7) % 7;
  return spec.root + sc[d] + 12 * (o + octaveShift);
}

export function chordTones(spec: MoodSpec, degree: number, octaveShift = 0): number[] {
  return [degree, degree + 2, degree + 4].map((d) => degreeToMidi(spec, d, octaveShift));
}

export interface NoteEvent {
  /** beat offset within the bar */
  beat: number;
  /** duration in beats */
  dur: number;
  inst: Inst;
  midi: number;
  /** 0..1 */
  vel: number;
  tremolo?: boolean;
}

/** Deterministic bar of music for a mood / intensity / bar index / section seed. Pure. */
export function composeBar(mood: PlayableMood, intensity: Intensity, bar: number, seed: number): NoteEvent[] {
  const spec = MOOD_SPECS[mood];
  const bpb = spec.beatsPerBar;
  const lvl = INTENSITY_LEVEL[intensity];
  const deg = spec.progression[((bar % spec.progression.length) + spec.progression.length) % spec.progression.length];
  // registers: bass ~D2–A2, accompaniment ~D3–E4, melody ~D4–D6 (keeps the strums out of the melody's way)
  const accOct = spec.root >= 62 ? -1 : 0;
  const bassOct = spec.root >= 60 ? -2 : -1;
  const chord = chordTones(spec, deg, accOct);
  const chordLow = chord;
  const bassRoot = degreeToMidi(spec, deg, bassOct);
  const bassFifth = degreeToMidi(spec, deg + 4, bassOct);
  const ev: NoteEvent[] = [];
  const add = (beat: number, dur: number, inst: Inst, midi: number, vel: number): void => {
    ev.push({ beat, dur, inst, midi, vel });
  };
  const strum = (beat: number, dur: number, vel: number, tones = chord): void =>
    tones.forEach((m, k) => add(beat + k * 0.02, dur, "strum", m, vel * (1 - k * 0.1)));
  const pad = (beat: number, dur: number, vel: number, tones = chordLow): void => tones.forEach((m) => add(beat, dur, "pad", m, vel));

  switch (spec.feel) {
    case "polka":
    case "gallop": {
      add(0, 0.5, "bass", bassRoot, 0.9);
      if (lvl >= 1 || spec.feel === "gallop") add(1, 0.5, "bass", bassFifth, 0.75);
      if (lvl === 0) pad(0, bpb, 0.3);
      if (lvl >= 1) { strum(0.5, 0.3, 0.45); strum(1.5, 0.3, 0.4); }
      if (lvl >= 2) { pad(0.5, 0.35, 0.22); pad(1.5, 0.35, 0.2); }
      if (spec.perc && lvl >= 1) { add(0.5, 0.1, "shaker", 0, 0.5); add(1.5, 0.1, "shaker", 0, 0.45); }
      if (spec.perc && spec.feel === "gallop" && lvl >= 1) { add(0, 0.1, "shaker", 0, 0.3); add(1, 0.1, "shaker", 0, 0.3); }
      if (spec.perc && lvl >= 2) { add(0, 0.2, "kick", 0, 0.8); add(1, 0.2, "kick", 0, 0.6); add(0.5, 0.2, "tamb", 0, 0.5); add(1.5, 0.2, "tamb", 0, 0.5); }
      break;
    }
    case "waltz": {
      add(0, 0.9, "bass", bar % 2 === 0 ? bassRoot : bassFifth, 0.85);
      pad(1, 0.7, lvl === 0 ? 0.25 : 0.3);
      pad(2, 0.7, lvl === 0 ? 0.22 : 0.28);
      if (lvl >= 1) { strum(1, 0.4, 0.3); strum(2, 0.4, 0.27); }
      if (spec.perc && lvl >= 2) { add(0, 0.2, "kick", 0, 0.45); add(1, 0.2, "tamb", 0, 0.3); add(2, 0.2, "tamb", 0, 0.3); }
      break;
    }
    case "ballad": {
      pad(0, bpb, 0.28 + 0.06 * lvl);
      add(0, 2, "bass", bassRoot, 0.7);
      if (lvl >= 1) add(2, 2, "bass", bassFifth, 0.55);
      const arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[1]];
      if (lvl >= 1) arp.forEach((m, k) => add(k * 0.5, 0.5, "strum", m, 0.26));
      else [0, 2].forEach((b, k) => add(b, 2, "strum", arp[k * 2], 0.22));
      if (spec.perc && lvl >= 2) { add(1, 0.1, "shaker", 0, 0.3); add(3, 0.1, "shaker", 0, 0.3); }
      break;
    }
    case "lullaby": {
      pad(0, bpb, 0.24 + 0.04 * lvl);
      add(0, 1.5, "bass", bassRoot, 0.5);
      chord.forEach((m, k) => {
        if (lvl === 0 && k === 1) return;
        add(k, 1, "strum", m + 12, 0.22);
      });
      break;
    }
    case "ostinato": {
      const r = bassRoot + 12;
      const pat = [r, r, r + 7, r, r + 8, r, r + 7, r];
      pat.forEach((m, k) => {
        if (lvl === 0 && k % 2 === 1) return;
        add(k * 0.5, 0.25, "strum", m, k % 2 === 0 ? 0.45 : 0.32);
      });
      if (lvl >= 1) pad(0, bpb, 0.2, [bassRoot + 12, bassRoot + 19]);
      if (spec.perc && lvl >= 1) { add(0, 0.2, "kick", 0, 0.55); add(0.5, 0.2, "kick", 0, 0.35); }
      if (spec.perc && lvl >= 2) [0.5, 1.5, 2.5, 3.5].forEach((b) => add(b, 0.1, "shaker", 0, 0.3));
      break;
    }
    case "creep": {
      const r = bassRoot + 12;
      const hits: [number, number][] = [[0, r], [1.5, r + 7], [2, r + 6], [3.5, r + 7]];
      hits.forEach(([b, m], k) => {
        if (lvl === 0 && k % 2 === 1) return;
        add(b, 0.2, "strum", m, 0.4);
      });
      pad(0, bpb, 0.18 + 0.04 * lvl);
      if (lvl >= 2) add(0, 0.3, "kick", 0, 0.4);
      break;
    }
    case "march": {
      add(0, 1, "bass", bassRoot, 0.85);
      add(2, 1, "bass", bassFifth, 0.75);
      if (lvl >= 1) { strum(1, 0.4, 0.4); strum(3, 0.4, 0.38); pad(1, 0.5, 0.2); pad(3, 0.5, 0.2); }
      else pad(0, bpb, 0.25);
      if (spec.perc && lvl >= 1) { add(0, 0.2, "kick", 0, 0.7); add(2, 0.2, "kick", 0, 0.6); }
      if (spec.perc && lvl >= 2) {
        add(1, 0.2, "tamb", 0, 0.5); add(3, 0.2, "tamb", 0, 0.5);
        [0.5, 1.5, 2.5, 3.5].forEach((b) => add(b, 0.1, "shaker", 0, 0.3));
      }
      break;
    }
  }

  // Melody: a 2-bar motif repeated over 4-bar phrases (A A'), snapped to chord tones on strong beats, cadence on bar 4.
  const stepB = spec.density >= 0.6 ? 0.5 : 1;
  const steps = Math.round(bpb / stepB);
  const mrnd = mulberry32((seed >>> 0) + (bar % 2) * 977 + (Math.floor(bar / 4) % 2) * 31 + 1);
  const dens = spec.density * (lvl === 0 ? 0.5 : lvl === 1 ? 0.85 : 1);
  const cadence = bar % 4 === 3;
  const octave = spec.melody === "whistle" ? 1 : spec.root < 62 ? 1 : 0;
  const placed: { beat: number; deg: number }[] = [];
  let walk = Math.floor(mrnd() * 3) * 2; // start on a chord tone offset 0 / 2 / 4
  for (let s = 0; s < steps; s++) {
    const beat = s * stepB;
    const strong = Math.abs(beat - Math.round(beat)) < 1e-6 && (Math.round(beat) % 2 === 0 || bpb === 3);
    const roll = mrnd();
    const move = Math.floor(mrnd() * 5) - 2;
    const on = s === 0 ? roll < 0.85 : roll < dens * (strong ? 1 : 0.75);
    if (cadence && beat >= bpb / 2) {
      placed.push({ beat, deg: deg + (mrnd() < 0.5 ? 0 : 7) });
      break;
    }
    if (!on) continue;
    walk = clamp(walk + move, -3, 8);
    if (strong) {
      const tonesOff = [-3, 0, 2, 4, 7];
      walk = tonesOff.reduce((best, x) => (Math.abs(x - walk) < Math.abs(best - walk) ? x : best), tonesOff[1]);
    }
    placed.push({ beat, deg: deg + walk });
  }
  const melInst: Inst = spec.melody;
  placed.forEach((n, k) => {
    const next = placed[k + 1]?.beat ?? bpb;
    const span = Math.min(2, next - n.beat);
    const dur = melInst === "pluck" ? Math.max(0.25, span * 0.9) : span * 0.95;
    const midi = degreeToMidi(spec, n.deg, octave);
    const vel = (k === 0 ? 0.7 : 0.6) + 0.1 * lvl;
    const tremolo = lvl >= 2 && spec.tremolo && span >= 1 && melInst !== "whistle";
    ev.push({ beat: n.beat, dur, inst: melInst, midi, vel, tremolo });
    if (lvl >= 2 && melInst === "lead") ev.push({ beat: n.beat, dur, inst: "pluck", midi: midi + 12, vel: 0.3, tremolo });
  });
  return ev;
}

// ---------- Karplus-Strong plucked string ----------

export interface KsOpts {
  /** seconds to decay by 60 dB */
  t60?: number;
  /** 0..1 excitation brightness (one-pole low-pass on the noise burst) */
  brightness?: number;
  seed?: number;
}

/** Karplus-Strong plucked string as raw samples (peak-normalized to 0.9, 8 ms fade-out). Pure. */
export function karplusStrong(freq: number, sampleRate: number, seconds: number, opts: KsOpts = {}): Float32Array {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(len);
  if (!(freq > 0) || !(sampleRate > 0)) return out;
  const n = Math.max(2, Math.round(sampleRate / freq));
  const t60 = opts.t60 ?? 1.2;
  const bright = clamp(opts.brightness ?? 0.6, 0.05, 1);
  const decay = Math.min(0.99999, Math.pow(0.001, 1 / Math.max(1, freq * t60)));
  const rnd = mulberry32(opts.seed ?? 1234);
  const ring = new Float32Array(n);
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    lp += bright * (rnd() * 2 - 1 - lp);
    ring[i] = lp;
    mean += lp;
  }
  mean /= n;
  for (let i = 0; i < n; i++) ring[i] -= mean;
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const nxt = ring[idx + 1 === n ? 0 : idx + 1];
    ring[idx] = decay * 0.5 * (cur + nxt);
    out[i] = cur;
    const a = cur < 0 ? -cur : cur;
    if (a > peak) peak = a;
    idx = idx + 1 === n ? 0 : idx + 1;
  }
  const norm = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.min(len, Math.floor(sampleRate * 0.008));
  for (let i = 0; i < len; i++) {
    out[i] *= norm;
    const left = len - i;
    if (left < fade) out[i] *= left / fade;
  }
  return out;
}

const ksCache = new WeakMap<Ctx, Map<string, { buf: AudioBuffer; rate: number }>>();

function ksBuffer(ctx: Ctx, midi: number, bright: number, t60: number): { buf: AudioBuffer; rate: number } {
  let m = ksCache.get(ctx);
  if (!m) {
    m = new Map();
    ksCache.set(ctx, m);
  }
  const key = `${midi}:${bright}:${t60}`;
  const hit = m.get(key);
  if (hit) return hit;
  const f = mtof(midi);
  const sr = ctx.sampleRate;
  const secs = Math.min(2.5, t60 + 0.2);
  const data = karplusStrong(f, sr, secs, { t60, brightness: bright, seed: midi * 31 + 7 });
  const buf = ctx.createBuffer(1, data.length, sr);
  buf.getChannelData(0).set(data);
  // the ring length was rounded to whole samples: correct the pitch with playbackRate
  const n = Math.max(2, Math.round(sr / f));
  const entry = { buf, rate: f / (sr / n) };
  m.set(key, entry);
  return entry;
}

const INST_PAN: Record<Inst, number> = {
  pluck: 0.25, strum: -0.3, bass: 0, pad: -0.1, lead: 0.15, whistle: 0.2, kick: 0, shaker: 0.35, tamb: -0.35,
};

/** Render one note on a voice's per-instrument outputs. t/dur in ctx seconds. */
export function renderNote(o: Out, n: NoteEvent, t: number, dur: number, padBus: AudioNode, spooky: boolean): void {
  const { ctx } = o;
  switch (n.inst) {
    case "pluck":
    case "strum":
    case "bass": {
      const bass = n.inst === "bass";
      const hits = n.tremolo ? Math.max(2, Math.floor(dur / 0.075)) : 1;
      for (let h = 0; h < hits; h++) {
        const th = t + h * 0.075;
        const { buf, rate } = ksBuffer(ctx, n.midi, bass ? 0.35 : n.inst === "strum" ? 0.5 : 0.7, bass ? 1.6 : 1.1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        const peak = n.vel * (bass ? 0.75 : 0.5) * (hits > 1 ? (h === 0 ? 0.9 : 0.55) : 1);
        const ring = hits > 1 ? 0.12 : Math.min(1.3, dur + 0.45);
        g.gain.setValueAtTime(peak, th);
        g.gain.setValueAtTime(peak, th + ring * 0.6);
        g.gain.exponentialRampToValueAtTime(SILENT, th + ring);
        src.connect(g).connect(o.dest);
        src.start(th);
        src.stop(th + ring + 0.05);
        o.track(src);
      }
      return;
    }
    case "pad":
    case "lead": {
      const lead = n.inst === "lead";
      const f = mtof(n.midi);
      const lp = biquad(ctx, "lowpass", lead ? 2400 : spooky ? 900 : 1500, 0.9);
      const g = ctx.createGain();
      susEnv(g.gain, t, lead ? 0.03 : 0.07, lead ? 0.08 : 0.14, Math.max(0.12, dur), n.vel * (lead ? 0.16 : 0.1));
      lp.connect(g).connect(lead ? o.dest : padBus);
      const det = lead ? 5 : 8;
      for (const d of [-det, det]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = d;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + dur + 0.1);
        o.track(osc);
      }
      if (!lead) {
        const sub = ctx.createOscillator();
        sub.type = "square";
        sub.frequency.value = f / 2;
        const sg = gainNode(ctx, 0.25);
        sub.connect(sg).connect(lp);
        sub.start(t);
        sub.stop(t + dur + 0.1);
        o.track(sub);
      }
      return;
    }
    case "whistle":
      tone(o, { type: "sine", f: mtof(n.midi), t, dur: Math.max(0.15, dur), a: 0.08, release: 0.15, sustain: true, peak: n.vel * 0.22, vibrato: [5.5, mtof(n.midi) * (spooky ? 0.025 : 0.012)] });
      tone(o, { type: "triangle", f: mtof(n.midi) * 2, t, dur: Math.max(0.15, dur), a: 0.08, release: 0.15, sustain: true, peak: n.vel * 0.03 });
      return;
    case "kick":
      tone(o, { type: "sine", f: 120, f2: 45, glide: 0.12, t, dur: 0.3, a: 0.002, peak: n.vel * 0.7 });
      return;
    case "shaker":
      burst(o, { color: "white", t, dur: 0.06, a: 0.01, filter: "highpass", f: 7000, peak: n.vel * 0.18 });
      return;
    case "tamb":
      burst(o, { color: "white", t, dur: 0.16, a: 0.002, filter: "bandpass", f: 8500, q: 1.5, peak: n.vel * 0.35 });
      return;
  }
}

// ---------- Voices and director ----------

const MOOD_INDEX: Record<PlayableMood, number> = {
  playful: 1, calm: 2, sleepy: 3, tense: 4, spooky: 5, chase: 6, triumphant: 7, sad: 8, romantic_waltz: 9,
};

export function sectionSeed(sec: MusicSection): number {
  const mi = sec.mood === "none" ? 0 : MOOD_INDEX[sec.mood];
  return (mi * 7919 + Math.round(sec.start * 10) * 104729) >>> 0;
}

class MusicVoice {
  readonly spec: MoodSpec;
  private gain: GainNode | null = null;
  private padBus: AudioNode | null = null;
  private pans = new Map<Inst, StereoPannerNode>();
  private bars = new Map<string, NoteEvent[]>();
  private startedAt = 0;
  private fadeIn = 0.05;
  private stopping = false;
  private stopAt = Infinity;
  private lfo: OscillatorNode | null = null;
  private scheduledTo = -Infinity;
  private seed: number;

  constructor(
    private o: Out | null,
    public sec: MusicSection,
    private toCtx: (ep: number) => number,
  ) {
    this.spec = MOOD_SPECS[sec.mood as PlayableMood];
    this.seed = sectionSeed(sec);
  }

  start(atEp: number, fade: number): void {
    this.startedAt = atEp;
    this.fadeIn = Math.max(0.05, fade);
    const o = this.o;
    if (!o) return;
    const { ctx } = o;
    const g = ctx.createGain();
    const t = this.toCtx(atEp);
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(1, t + this.fadeIn);
    g.connect(o.dest);
    this.gain = g;
    // accordion bellows: shared tremolo stage for pad notes
    const trem = gainNode(ctx, 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = this.sec.mood === "spooky" ? 7 : 4.8;
    const depth = gainNode(ctx, this.sec.mood === "spooky" ? 0.3 : 0.12);
    lfo.connect(depth).connect(trem.gain);
    lfo.start(t);
    o.track(lfo);
    this.lfo = lfo;
    const padPan = ctx.createStereoPanner();
    padPan.pan.value = INST_PAN.pad;
    trem.connect(padPan).connect(g);
    this.padBus = trem;
  }

  stop(atEp: number, fade: number): void {
    if (this.stopping) return;
    this.stopping = true;
    const at = Math.max(atEp, this.startedAt + this.fadeIn);
    this.stopAt = at;
    const g = this.gain;
    if (!g || !this.o) return;
    const t = this.toCtx(at);
    const end = t + Math.max(0.05, fade);
    g.gain.setValueAtTime(1, t);
    g.gain.linearRampToValueAtTime(SILENT, end);
    try {
      this.lfo?.stop(end + 0.1);
    } catch {
      /* ignore */
    }
  }

  /** The section was extended (timeline grew): cancel a pending fade-out and keep playing. */
  retarget(sec: MusicSection, nowEp: number): void {
    this.sec = sec;
    if (!this.stopping || sec.end <= this.stopAt) return;
    this.stopping = false;
    this.stopAt = Infinity;
    const g = this.gain;
    if (!g || !this.o) return;
    const now = this.o.ctx.currentTime;
    g.gain.cancelScheduledValues(Math.max(now, this.toCtx(Math.max(nowEp, this.startedAt + this.fadeIn))));
    g.gain.setValueAtTime(1, Math.max(now, this.toCtx(nowEp)));
    try {
      this.lfo?.stop(now + 1e6);
    } catch {
      /* ignore */
    }
  }

  private out(inst: Inst): Out | null {
    const o = this.o;
    if (!o || !this.gain) return null;
    let p = this.pans.get(inst);
    if (!p) {
      p = o.ctx.createStereoPanner();
      p.pan.value = INST_PAN[inst];
      p.connect(this.gain);
      this.pans.set(inst, p);
    }
    return { ctx: o.ctx, dest: p, track: o.track };
  }

  private bar(bar: number, intensity: Intensity): NoteEvent[] {
    const key = `${bar}:${intensity}`;
    let b = this.bars.get(key);
    if (!b) {
      b = composeBar(this.sec.mood as PlayableMood, intensity, bar, this.seed);
      if (this.bars.size > 64) this.bars.clear();
      this.bars.set(key, b);
    }
    return b;
  }

  /** Schedule notes whose onset lies in [fromEp, toEp) (episode time). */
  schedule(fromEp: number, toEp: number): number {
    const first = this.scheduledTo === -Infinity;
    const from = Math.max(fromEp, this.scheduledTo, this.sec.start);
    if (toEp <= from) return 0;
    this.scheduledTo = toEp;
    const beat = beatSeconds(this.spec);
    const barLen = barSeconds(this.spec);
    const b0 = Math.floor((from - this.sec.start) / barLen) - (first ? 1 : 0);
    const b1 = Math.floor((toEp - this.sec.start) / barLen);
    let count = 0;
    for (let b = Math.max(0, b0); b <= b1; b++) {
      const barStart = this.sec.start + b * barLen;
      const intensity = intensityAt(this.sec, barStart);
      const lvlGain = INTENSITY_GAIN[intensity];
      for (const n of this.bar(b, intensity)) {
        let tEp = barStart + n.beat * beat;
        let durS = n.dur * beat;
        if (tEp < from) {
          // mid-section start: only sustained notes still sounding are joined late
          const sustained = n.inst === "pad" || n.inst === "lead" || n.inst === "whistle";
          if (!first || !sustained || tEp + durS <= from + 0.1) continue;
          durS -= from - tEp;
          tEp = from;
        }
        if (tEp >= toEp) continue;
        count++;
        const o = this.out(n.inst);
        if (!o || !this.padBus) continue;
        renderNote(o, { ...n, vel: n.vel * lvlGain }, this.toCtx(tEp), durS, this.padBus, this.sec.mood === "spooky");
      }
    }
    return count;
  }
}

/** Owns the music sections of one play session: starts/crossfades voices and schedules their notes ahead. */
export class MusicDirector {
  /** number of distinct voices started (one per section actually reached) */
  voicesStarted = 0;
  notesScheduled = 0;
  private voices = new Map<MusicSection, MusicVoice>();

  constructor(
    private o: Out | null,
    public sections: MusicSection[],
    private toCtx: (ep: number) => number,
  ) {}

  /**
   * The timeline changed while playing (e.g. a paragraph was appended): adopt the new sections, keeping every voice
   * whose section still exists (same mood, same start) so the music continues seamlessly; others fade out.
   */
  retarget(sections: MusicSection[], nowEp: number): void {
    const next = new Map<MusicSection, MusicVoice>();
    for (const [sec, v] of this.voices) {
      const match = sections.find((n) => n.mood === sec.mood && Math.abs(n.start - sec.start) < 1e-3 && !next.has(n));
      if (match && match.end > nowEp) {
        v.retarget(match, nowEp);
        next.set(match, v);
      } else v.stop(nowEp, 0.6);
    }
    this.voices = next;
    this.sections = sections;
  }

  /** Look-ahead step: [fromEp, toEp) is the window being scheduled; nowEp the playhead. */
  update(fromEp: number, toEp: number, nowEp: number): void {
    for (const sec of this.sections) {
      if (sec.mood === "none") continue;
      const tail = sec.end + sec.fadeOut;
      if (sec.start >= toEp || tail <= fromEp) continue;
      let v = this.voices.get(sec);
      if (!v) {
        if (sec.end <= nowEp) continue; // section already over at play start
        v = new MusicVoice(this.o, sec, this.toCtx);
        const late = sec.start < nowEp - 0.05;
        v.start(late ? nowEp : sec.start, late ? 0.3 : sec.fadeIn);
        this.voices.set(sec, v);
        this.voicesStarted++;
      }
      this.notesScheduled += v.schedule(fromEp, Math.min(toEp, tail));
      if (sec.end < toEp) v.stop(sec.end, sec.fadeOut);
    }
  }

  activeMoods(nowEp: number): MusicMood[] {
    return [...this.voices.keys()].filter((s) => s.start <= nowEp && nowEp < s.end + s.fadeOut).map((s) => s.mood);
  }
}
