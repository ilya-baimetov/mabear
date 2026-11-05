// Automatic foley (spec §7.6), fully synthesized: footsteps per surface (heavy = lower + louder + ground thump),
// landing thud, body fall, cloth rustle, prop pickup/putdown, rope creak, sizzle loop, munch, small splash, water pour, clap.
import type { FoleyId, Surface } from "../../shared/schema";
import { FOLEY_IDS } from "../../shared/schema";
import { munch, sizzle } from "./sfx";
import { biquad, burst, mulberry32, tone, SILENT, type Out } from "./synth";

let stepSeed = 1;

/** Approximate length (s) of each foley sound (mid-cue starts on play()). */
export const FOLEY_LENGTH: Record<FoleyId, number> = {
  footstep: 0.12, footstep_heavy: 0.2, ground_thump: 0.2, landing_thud: 0.25, body_fall: 0.4, cloth_rustle: 0.25,
  prop_pickup: 0.2, prop_putdown: 0.1, rope_creak: 0.55, sizzle_loop: 2.0, munch: 0.6, splash_small: 0.35,
  water_pour: 1.3, clap: 0.07,
};

/** Per-surface footstep recipe: filter centre (Hz), length (s), noise colour. Pure data. */
export const SURFACE_STEP: Record<Surface, { f: number; dur: number; q: number; body: number }> = {
  grass: { f: 3200, dur: 0.09, q: 0.8, body: 0.2 },
  wood: { f: 900, dur: 0.07, q: 2.5, body: 0.8 },
  water: { f: 1600, dur: 0.18, q: 0.9, body: 0.3 },
  dirt: { f: 700, dur: 0.07, q: 1.0, body: 0.5 },
};

export function footstep(o: Out, surface: Surface, t: number, gain: number, heavy: boolean): void {
  const s = SURFACE_STEP[surface] ?? SURFACE_STEP.grass;
  const rnd = mulberry32(stepSeed++);
  const k = heavy ? 0.6 : 1; // heavy steps are lower
  const vol = gain * (heavy ? 1.5 : 1.4);
  const jitter = 0.9 + rnd() * 0.2;
  const f = s.f * k * jitter;
  switch (surface) {
    case "grass":
      // two quick crunchy bursts (heel, toe)
      burst(o, { color: "white", t, dur: s.dur, a: 0.006, filter: "bandpass", f, q: s.q, peak: vol * 0.35 });
      burst(o, { color: "white", t: t + 0.035, dur: s.dur * 0.8, a: 0.004, filter: "bandpass", f: f * 1.3, q: s.q, peak: vol * 0.22 });
      burst(o, { color: "brown", t, dur: 0.06, filter: "lowpass", f: 300 * k, peak: vol * 0.25 });
      break;
    case "wood":
      tone(o, { type: "triangle", f: 210 * k * jitter, f2: 150 * k, glide: 0.04, t, dur: 0.11, peak: vol * 0.45 });
      burst(o, { color: "white", t, dur: s.dur, filter: "bandpass", f, q: s.q, peak: vol * 0.4 });
      if (rnd() < 0.3) tone(o, { type: "sawtooth", f: 90 + rnd() * 40, t: t + 0.02, dur: 0.12, filter: "bandpass", ff: 700, q: 6, peak: vol * 0.06 }); // board creak
      break;
    case "water":
      burst(o, { color: "white", t, dur: s.dur, a: 0.01, filter: "bandpass", f: f * 1.2, f2: f * 0.5, q: s.q, peak: vol * 0.45 });
      tone(o, { type: "sine", f: 400 * k + rnd() * 300, f2: 900 * k, glide: 0.06, t: t + 0.03, dur: 0.07, peak: vol * 0.15 });
      tone(o, { type: "sine", f: 600 * k + rnd() * 300, f2: 1200 * k, glide: 0.05, t: t + 0.08, dur: 0.06, peak: vol * 0.1 });
      break;
    case "dirt":
      burst(o, { color: "pink", t, dur: s.dur, a: 0.004, filter: "lowpass", f, q: s.q, peak: vol * 0.5 });
      burst(o, { color: "white", t: t + 0.01, dur: 0.05, filter: "bandpass", f: 2200 * k, q: 1, peak: vol * 0.12 });
      break;
  }
  if (heavy) groundThump(o, t, gain * 0.8);
}

export function groundThump(o: Out, t: number, gain: number): void {
  tone(o, { type: "sine", f: 70, f2: 34, glide: 0.12, t, dur: 0.2, peak: gain * 0.7 });
}

export function clothRustle(o: Out, t: number, gain: number, dur = 0.25): void {
  // two overlapping band-passed noise swishes
  burst(o, { color: "white", t, dur, a: dur * 0.3, filter: "bandpass", f: 3200, f2: 2200, q: 0.9, peak: gain * 0.5 });
  burst(o, { color: "pink", t: t + dur * 0.2, dur: dur * 0.7, a: 0.02, filter: "bandpass", f: 1800, q: 1.2, peak: gain * 0.25 });
}

function ropeCreak(o: Out, t: number, gain: number): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(18, t);
  osc.frequency.linearRampToValueAtTime(34, t + 0.25);
  osc.frequency.linearRampToValueAtTime(22, t + 0.5);
  const bp = biquad(ctx, "bandpass", 1100, 9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(gain * 2, t + 0.08);
  g.gain.exponentialRampToValueAtTime(SILENT, t + 0.55);
  osc.connect(bp).connect(g).connect(o.dest);
  osc.start(t);
  osc.stop(t + 0.6);
  o.track(osc);
}

function waterPour(o: Out, t: number, gain: number): void {
  const dur = 1.3;
  burst(o, { color: "white", t, dur, a: 0.1, sustain: true, release: 0.25, filter: "bandpass", f: 500, f2: 1600, q: 2.5, peak: gain * 0.35 });
  burst(o, { color: "pink", t, dur, a: 0.1, sustain: true, release: 0.25, filter: "lowpass", f: 900, peak: gain * 0.15 });
  const rnd = mulberry32(stepSeed++);
  for (let i = 0; i < 10; i++) {
    const tt = t + rnd() * dur;
    const f = 500 + (tt - t) * 600 + rnd() * 300;
    tone(o, { type: "sine", f, f2: f * 1.5, glide: 0.04, t: tt, dur: 0.05, peak: gain * 0.08 });
  }
}

export function renderFoley(o: Out, id: FoleyId, surface: Surface, t: number, gain = 1, heavyActor = false): void {
  const g = Math.max(0, Math.min(2, Number.isFinite(gain) ? gain : 1));
  switch (id) {
    case "footstep":
      footstep(o, surface, t, g, heavyActor);
      return;
    case "footstep_heavy":
      footstep(o, surface, t, g, true);
      return;
    case "ground_thump":
      groundThump(o, t, g);
      return;
    case "landing_thud":
      tone(o, { type: "sine", f: heavyActor ? 90 : 150, f2: heavyActor ? 40 : 70, glide: 0.1, t, dur: 0.22, peak: g * 0.7 });
      burst(o, { color: "brown", t, dur: 0.15, filter: "lowpass", f: heavyActor ? 300 : 600, peak: g * 0.6 });
      footstep(o, surface, t + 0.01, g * 0.6, heavyActor);
      return;
    case "body_fall":
      tone(o, { type: "sine", f: heavyActor ? 80 : 130, f2: heavyActor ? 35 : 60, glide: 0.18, t, dur: 0.35, peak: g * 0.8 });
      burst(o, { color: "brown", t, dur: 0.3, filter: "lowpass", f: 450, peak: g * 0.7 });
      clothRustle(o, t - 0.08 > 0 ? t - 0.08 : t, g * 0.8, 0.3);
      return;
    case "cloth_rustle":
      clothRustle(o, t, g);
      return;
    case "prop_pickup":
      burst(o, { color: "white", t, dur: 0.05, filter: "bandpass", f: 2500, q: 2, peak: g * 0.8 });
      clothRustle(o, t + 0.03, g * 1.2, 0.15);
      return;
    case "prop_putdown":
      tone(o, { type: "triangle", f: 320, f2: 220, glide: 0.03, t, dur: 0.1, peak: g * 0.35 });
      burst(o, { color: "white", t, dur: 0.04, filter: "bandpass", f: 1500, q: 2, peak: g * 0.3 });
      return;
    case "rope_creak":
      ropeCreak(o, t, g);
      return;
    case "sizzle_loop":
      sizzle(o, t, 2.0, g * 0.7, stepSeed++);
      return;
    case "munch":
      munch(o, t, g * 0.8, stepSeed++);
      return;
    case "splash_small":
      burst(o, { color: "white", t, dur: 0.35, a: 0.005, filter: "bandpass", f: 2200, f2: 800, q: 0.9, peak: g * 0.9 });
      tone(o, { type: "sine", f: 500, f2: 1100, glide: 0.06, t: t + 0.05, dur: 0.08, peak: g * 0.15 });
      return;
    case "water_pour":
      waterPour(o, t, g);
      return;
    case "clap":
      burst(o, { color: "white", t, dur: 0.07, a: 0.001, filter: "bandpass", f: 1700, q: 1.3, peak: g * 2 });
      burst(o, { color: "white", t: t + 0.006, dur: 0.05, a: 0.001, filter: "bandpass", f: 2600, q: 1.5, peak: g * 1 });
      return;
  }
}

export const ALL_FOLEY: readonly FoleyId[] = FOLEY_IDS;
