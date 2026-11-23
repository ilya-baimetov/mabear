// Event SFX (spec §7.6): every SfxId synthesized (no samples). renderSfx(out, id, t, gain) schedules at ctx time t.
import type { SfxId } from "../../shared/schema";
import { biquad, burst, gainNode, mulberry32, partials, tone, SILENT, type Out } from "./synth";

/** Approximate length of each effect (s); used for debug/tests and to size tails. */
export const SFX_LENGTH: Record<SfxId, number> = {
  door_creak: 1.0, door_slam: 0.6, knock: 0.6, crash: 1.4, splash: 1.0, thunder_clap: 3.2, pop: 0.12, boing: 0.8,
  whoosh: 0.6, bell: 2.2, pot_clang: 1.4, sizzle: 1.6, munch: 0.6, glass_clink: 0.6, van_horn: 1.0,
  engine_start: 2.2, magic_chime: 1.6, drum_roll: 1.8, rimshot: 1.0, cuckoo: 1.4,
};

function creak(o: Out, t: number, dur: number, f0: number, f1: number, f2: number, peak: number, seed: number): void {
  // a creak is a slow, irregular pulse train through a resonant body
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const rnd = mulberry32(seed);
  const pts = 24;
  const curve = new Float32Array(pts);
  for (let i = 0; i < pts; i++) {
    const k = i / (pts - 1);
    const base = k < 0.5 ? f0 + (f1 - f0) * (k * 2) : f1 + (f2 - f1) * ((k - 0.5) * 2);
    curve[i] = base * (0.85 + rnd() * 0.3);
  }
  osc.frequency.setValueCurveAtTime(curve, t, dur);
  const bp = biquad(ctx, "bandpass", 900, 6);
  const bp2 = biquad(ctx, "bandpass", 2300, 8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.05);
  g.gain.setValueAtTime(peak, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  osc.connect(bp).connect(g);
  osc.connect(bp2).connect(g);
  g.connect(o.dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  o.track(osc);
}

function woodHit(o: Out, t: number, peak: number, f = 220): void {
  tone(o, { type: "triangle", f: f * 1.6, f2: f, glide: 0.03, t, dur: 0.16, peak: peak * 0.8 });
  burst(o, { color: "white", t, dur: 0.05, filter: "bandpass", f: f * 4, q: 3, peak: peak * 0.9 });
}

function thud(o: Out, t: number, peak: number, f = 80, dur = 0.35): void {
  tone(o, { type: "sine", f: f * 1.8, f2: f * 0.6, glide: dur * 0.6, t, dur, peak });
  burst(o, { color: "brown", t, dur: dur * 0.7, filter: "lowpass", f: 400, peak: peak * 0.9 });
}

function splashy(o: Out, t: number, peak: number, dur: number, seed: number): void {
  burst(o, { color: "white", t, dur, a: 0.01, filter: "bandpass", f: 2500, f2: 700, q: 0.8, peak });
  burst(o, { color: "pink", t, dur: dur * 0.5, filter: "lowpass", f: 900, peak: peak * 0.6 });
  const rnd = mulberry32(seed);
  for (let i = 0; i < 6; i++) {
    const tt = t + 0.05 + rnd() * dur * 0.8;
    const f = 500 + rnd() * 900;
    tone(o, { type: "sine", f, f2: f * 1.8, glide: 0.05, t: tt, dur: 0.06, peak: peak * 0.25 });
  }
}

export function sizzle(o: Out, t: number, dur: number, peak: number, seed = 5): void {
  burst(o, { color: "white", t, dur, a: 0.08, sustain: true, release: 0.3, filter: "highpass", f: 3500, peak: peak * 0.35 });
  const rnd = mulberry32(seed);
  const n = Math.floor(dur * 40);
  for (let i = 0; i < n; i++) {
    burst(o, { color: "white", t: t + rnd() * dur, dur: 0.012, filter: "highpass", f: 2500 + rnd() * 3000, peak: peak * (0.2 + rnd() * 0.5) });
  }
}

export function munch(o: Out, t: number, peak: number, seed = 9): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.18 + rnd() * 0.03;
    burst(o, { color: "white", t: tt, dur: 0.09, a: 0.004, filter: "bandpass", f: 1400 + rnd() * 900, q: 1.2, peak: peak * 0.8 });
    burst(o, { color: "brown", t: tt, dur: 0.07, filter: "lowpass", f: 500, peak: peak * 0.5 });
  }
}

export function renderSfx(o: Out, id: SfxId, t: number, gain = 1): void {
  const g = Math.max(0, Math.min(2, Number.isFinite(gain) ? gain : 1));
  const p = (v: number): number => v * g;
  switch (id) {
    case "door_creak":
      creak(o, t, 0.95, 28, 55, 22, p(1.2), 3);
      return;
    case "door_slam":
      thud(o, t, p(0.65), 70, 0.4);
      woodHit(o, t, p(0.5), 160);
      burst(o, { color: "white", t: t + 0.02, dur: 0.25, filter: "bandpass", f: 3000, q: 2, peak: p(0.2) }); // rattle
      return;
    case "knock":
      [0, 0.17, 0.34].forEach((d) => woodHit(o, t + d, p(0.7), 240));
      return;
    case "crash": {
      burst(o, { color: "white", t, dur: 1.2, a: 0.003, filter: "highpass", f: 1500, peak: p(0.4) });
      thud(o, t, p(0.5), 90, 0.4);
      const rnd = mulberry32(17);
      for (let i = 0; i < 7; i++) {
        const tt = t + 0.03 + rnd() * 0.6;
        partials(o, { f: 900 + rnd() * 1800, ratios: [1, 2.3, 3.9], t: tt, dur: 0.35, peak: p(0.12) });
      }
      return;
    }
    case "splash":
      splashy(o, t, p(1.4), 0.9, 21);
      return;
    case "thunder_clap":
      burst(o, { color: "white", t, dur: 0.25, a: 0.002, filter: "highpass", f: 1200, peak: p(0.5) });
      burst(o, { color: "brown", t: t + 0.05, dur: 3.0, a: 0.08, filter: "lowpass", f: 260, f2: 80, peak: p(1.1) });
      burst(o, { color: "pink", t: t + 0.03, dur: 1.6, a: 0.04, filter: "lowpass", f: 700, f2: 150, peak: p(0.45) });
      return;
    case "pop":
      tone(o, { type: "sine", f: 900, f2: 300, glide: 0.06, t, dur: 0.1, peak: p(0.7) });
      burst(o, { color: "white", t, dur: 0.02, filter: "highpass", f: 2000, peak: p(0.4) });
      return;
    case "boing": {
      const { ctx } = o;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.12);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 14;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(90, t);
      lg.gain.exponentialRampToValueAtTime(2, t + 0.75);
      lfo.connect(lg).connect(osc.frequency);
      const env = ctx.createGain();
      env.gain.setValueAtTime(SILENT, t);
      env.gain.linearRampToValueAtTime(p(0.55), t + 0.01);
      env.gain.exponentialRampToValueAtTime(SILENT, t + 0.8);
      osc.connect(env).connect(o.dest);
      osc.start(t); lfo.start(t);
      osc.stop(t + 0.85); lfo.stop(t + 0.85);
      o.track(osc); o.track(lfo);
      return;
    }
    case "whoosh":
      burst(o, { color: "pink", t, dur: 0.6, a: 0.3, sustain: false, filter: "bandpass", f: 300, f2: 2600, q: 1.5, peak: p(3) });
      return;
    case "bell":
      partials(o, { f: 660, ratios: [1, 2.0, 2.76, 5.4, 8.93], amps: [1, 0.5, 0.45, 0.25, 0.12], t, dur: 2.2, peak: p(0.35) });
      return;
    case "pot_clang":
      partials(o, { f: 420, ratios: [1, 1.58, 2.33, 3.86, 5.1], amps: [1, 0.8, 0.6, 0.4, 0.3], t, dur: 1.3, peak: p(0.3) });
      burst(o, { color: "white", t, dur: 0.04, filter: "highpass", f: 3000, peak: p(0.4) });
      return;
    case "sizzle":
      sizzle(o, t, 1.5, p(0.8));
      return;
    case "munch":
      munch(o, t, p(1.6));
      return;
    case "glass_clink":
      partials(o, { f: 2100, ratios: [1, 2.45, 3.8], amps: [1, 0.6, 0.3], t, dur: 0.6, peak: p(0.25) });
      partials(o, { f: 2100, ratios: [1, 2.45], amps: [0.6, 0.3], t: t + 0.11, dur: 0.4, peak: p(0.15) });
      return;
    case "van_horn":
      [0, 0.42].forEach((d) => {
        for (const f of [349, 440]) {
          tone(o, { type: "square", f, t: t + d, dur: 0.32, a: 0.01, sustain: true, release: 0.04, filter: "lowpass", ff: 1800, peak: p(0.12) });
        }
      });
      return;
    case "engine_start": {
      // starter cranking then idle rumble
      for (let i = 0; i < 7; i++) {
        burst(o, { color: "brown", t: t + i * 0.11, dur: 0.09, filter: "lowpass", f: 600, peak: p(0.6) });
        tone(o, { type: "sawtooth", f: 55, t: t + i * 0.11, dur: 0.08, filter: "lowpass", ff: 300, peak: p(0.25) });
      }
      const t2 = t + 0.8;
      const { ctx } = o;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(35, t2);
      osc.frequency.linearRampToValueAtTime(70, t2 + 0.3);
      osc.frequency.linearRampToValueAtTime(42, t2 + 1.3);
      const lp = biquad(ctx, "lowpass", 380, 2);
      const env = ctx.createGain();
      env.gain.setValueAtTime(SILENT, t2);
      env.gain.linearRampToValueAtTime(p(0.4), t2 + 0.08);
      env.gain.setValueAtTime(p(0.35), t2 + 1.0);
      env.gain.exponentialRampToValueAtTime(SILENT, t2 + 1.4);
      const am = ctx.createOscillator();
      am.frequency.value = 18;
      const amg = gainNode(ctx, 0.15);
      am.connect(amg).connect(env.gain);
      osc.connect(lp).connect(env).connect(o.dest);
      osc.start(t2); am.start(t2);
      osc.stop(t2 + 1.45); am.stop(t2 + 1.45);
      o.track(osc); o.track(am);
      return;
    }
    case "magic_chime": {
      const notes = [72, 76, 79, 84, 88, 91];
      notes.forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        tone(o, { type: "sine", f, t: t + i * 0.08, dur: 0.9, peak: p(0.18) });
        tone(o, { type: "triangle", f: f * 2.01, t: t + i * 0.08, dur: 0.5, peak: p(0.05) });
      });
      burst(o, { color: "white", t, dur: 1.2, a: 0.3, filter: "highpass", f: 8000, peak: p(0.05) });
      return;
    }
    case "drum_roll": {
      const n = 28;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        burst(o, { color: "white", t: t + i * 0.05, dur: 0.06, filter: "bandpass", f: 1800, q: 0.9, peak: p(0.12 + 0.3 * k) });
      }
      thud(o, t + n * 0.05, p(0.7), 90, 0.3);
      partials(o, { f: 480, ratios: [1, 2.7, 4.1, 6.3], t: t + n * 0.05, dur: 0.8, peak: p(0.12) });
      return;
    }
    case "rimshot":
      // ba-dum-tss
      tone(o, { type: "sine", f: 200, f2: 140, t, dur: 0.18, peak: p(0.5) });
      tone(o, { type: "sine", f: 150, f2: 100, t: t + 0.16, dur: 0.22, peak: p(0.55) });
      burst(o, { color: "white", t: t + 0.42, dur: 0.6, a: 0.002, filter: "highpass", f: 6000, peak: p(0.3) });
      return;
    case "cuckoo":
      [0, 0.6].forEach((d) => {
        tone(o, { type: "sine", f: 784, t: t + d, dur: 0.2, a: 0.02, sustain: true, release: 0.06, filter: "lowpass", ff: 2000, peak: p(0.3) });
        tone(o, { type: "sine", f: 622, t: t + d + 0.24, dur: 0.28, a: 0.02, sustain: true, release: 0.08, filter: "lowpass", ff: 2000, peak: p(0.3) });
      });
      return;
  }
}
