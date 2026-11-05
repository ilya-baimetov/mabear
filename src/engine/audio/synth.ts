// Tiny WebAudio synthesis toolkit shared by the audio modules (spec §7.6).
// Every function takes an `Out` (context + destination + source tracker) so a play session can kill all its sources.
// Works with AudioContext and OfflineAudioContext. Pure helpers (PRNG, mtof, dB) are safe to import in node.

export type Ctx = BaseAudioContext;

export interface Out {
  ctx: Ctx;
  dest: AudioNode;
  /** register a scheduled source so stop() can cancel it */
  track: (n: AudioScheduledSourceNode) => void;
}

export const SILENT = 0.0001;

/** Deterministic PRNG (mulberry32) → [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export type NoiseColor = "white" | "pink" | "brown";
const noiseCache = new WeakMap<Ctx, Partial<Record<NoiseColor, AudioBuffer>>>();

/** 3 s mono noise buffer, generated once per context. */
export function noiseBuffer(ctx: Ctx, color: NoiseColor): AudioBuffer {
  let m = noiseCache.get(ctx);
  if (!m) {
    m = {};
    noiseCache.set(ctx, m);
  }
  const hit = m[color];
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * 3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(color === "white" ? 11 : color === "pink" ? 23 : 37);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    if (color === "white") d[i] = w * 0.5;
    else if (color === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.08;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 2.5;
    }
  }
  // crossfade the loop seam
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[len - fade + i] * (1 - k);
  }
  m[color] = buf;
  return buf;
}

export function gainNode(ctx: Ctx, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function biquad(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Percussive envelope: silence → peak in `a` s, exponential decay to silence at t+dur. */
export function percEnv(p: AudioParam, t: number, a: number, dur: number, peak: number): void {
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(Math.max(SILENT, peak), t + Math.max(0.001, a));
  p.exponentialRampToValueAtTime(SILENT, t + Math.max(a + 0.005, dur));
}

/** Sustained envelope: attack, hold until t+dur-release, release to silence at t+dur. */
export function susEnv(p: AudioParam, t: number, a: number, r: number, dur: number, peak: number): void {
  const pk = Math.max(SILENT, peak);
  const aa = Math.min(a, dur * 0.5);
  const rr = Math.min(r, dur - aa);
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(pk, t + Math.max(0.002, aa));
  p.setValueAtTime(pk, t + Math.max(0.003, dur - rr));
  p.exponentialRampToValueAtTime(SILENT, t + Math.max(0.004, dur));
}

function chainEnd(o: Out, pan: number | undefined): AudioNode {
  if (pan === undefined || pan === 0) return o.dest;
  const p = o.ctx.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  p.connect(o.dest);
  return p;
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** glide target frequency (exponential) at t+dur (or t+glide) */
  f2?: number;
  glide?: number;
  /** frequency curve (overrides f2) spread over dur */
  curve?: number[];
  t: number;
  dur: number;
  a?: number;
  peak?: number;
  /** sustained (hold) envelope instead of percussive */
  sustain?: boolean;
  release?: number;
  filter?: BiquadFilterType;
  ff?: number;
  q?: number;
  vibrato?: [number, number];
  detune?: number;
  pan?: number;
}

export function tone(o: Out, p: ToneOpts): OscillatorNode {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = p.type ?? "sine";
  osc.frequency.setValueAtTime(p.f, p.t);
  if (p.curve && p.curve.length > 1) {
    osc.frequency.setValueCurveAtTime(Float32Array.from(p.curve), p.t, Math.max(0.01, p.dur));
  } else if (p.f2 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.f2), p.t + (p.glide ?? p.dur));
  }
  if (p.detune) osc.detune.value = p.detune;
  if (p.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.vibrato[0];
    const lg = gainNode(ctx, p.vibrato[1]);
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(p.t);
    lfo.stop(p.t + p.dur + 0.05);
    o.track(lfo);
  }
  const g = ctx.createGain();
  if (p.sustain) susEnv(g.gain, p.t, p.a ?? 0.01, p.release ?? 0.05, p.dur, p.peak ?? 0.5);
  else percEnv(g.gain, p.t, p.a ?? 0.003, p.dur, p.peak ?? 0.5);
  let node: AudioNode = osc;
  if (p.filter) {
    const f = biquad(ctx, p.filter, p.ff ?? 1000, p.q ?? 0.707);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(chainEnd(o, p.pan));
  osc.start(p.t);
  osc.stop(p.t + p.dur + 0.05);
  o.track(osc);
  return osc;
}

export interface BurstOpts {
  color?: NoiseColor;
  t: number;
  dur: number;
  a?: number;
  peak?: number;
  sustain?: boolean;
  release?: number;
  filter?: BiquadFilterType;
  f?: number;
  /** filter sweep target at t+dur */
  f2?: number;
  q?: number;
  pan?: number;
  /** second filter in series (e.g. highpass then lowpass) */
  filter2?: BiquadFilterType;
  f2b?: number;
}

export function burst(o: Out, p: BurstOpts): AudioBufferSourceNode {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, p.color ?? "white");
  src.loop = true;
  const g = ctx.createGain();
  if (p.sustain) susEnv(g.gain, p.t, p.a ?? 0.01, p.release ?? 0.05, p.dur, p.peak ?? 0.5);
  else percEnv(g.gain, p.t, p.a ?? 0.002, p.dur, p.peak ?? 0.5);
  let node: AudioNode = src;
  if (p.filter) {
    const f = biquad(ctx, p.filter, p.f ?? 1000, p.q ?? 0.707);
    if (p.f2 !== undefined) {
      f.frequency.setValueAtTime(p.f ?? 1000, p.t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, p.f2), p.t + p.dur);
    }
    node.connect(f);
    node = f;
  }
  if (p.filter2) {
    const f = biquad(ctx, p.filter2, p.f2b ?? 4000, 0.707);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(chainEnd(o, p.pan));
  src.start(p.t, (p.t * 7.31) % 2.5);
  src.stop(p.t + p.dur + 0.05);
  o.track(src);
  return src;
}

/** Inharmonic partials (bells, metal, glass). */
export function partials(
  o: Out,
  p: { f: number; ratios: number[]; t: number; dur: number; peak?: number; amps?: number[]; pan?: number },
): void {
  const end = chainEnd(o, p.pan);
  const sub: Out = { ...o, dest: end };
  p.ratios.forEach((r, i) => {
    const amp = (p.amps?.[i] ?? 1 / (i + 1)) * (p.peak ?? 0.3);
    tone(sub, { f: p.f * r, t: p.t, dur: p.dur / (1 + i * 0.35), a: 0.002, peak: amp });
  });
}
