// Ambience (spec §7.6): synthesized loops per Ambience layer — filtered noise beds (wind, strong wind, rain, creek,
// thunderstorm with random thunder), chirp generators (birds, crickets) and a bee buzz. Layers present in consecutive
// AmbienceCues keep playing; others crossfade by the cue's fade. Creek and beehive layers are positional.
import type { Ambience, Vec3 } from "../../shared/schema";
import { MARKS } from "../../shared/bible/set";
import type { AmbienceSpan } from "./scheduler";
import { renderSfx } from "./sfx";
import { SILENT, biquad, burst, clamp, gainNode, mulberry32, noiseBuffer, tone, type NoiseColor, type Out } from "./synth";

/** Relative level per layer (before the ambience bus). */
export const LAYER_GAIN: Record<Ambience, number> = {
  birds_day: 1.5, forest_wind: 0.7, creek: 0.55, rain: 0.75, thunderstorm: 0.85, night_crickets: 1.3, bees: 1.0, strong_wind: 0.8,
};

/** World position of positional layers ([x, z] from the set bible). */
export const LAYER_POS: Partial<Record<Ambience, [number, number]>> = {
  creek: MARKS.creek.pos,
  bees: MARKS.beehive.pos,
};

function noiseSrc(o: Out, color: NoiseColor, at: number): AudioBufferSourceNode {
  const src = o.ctx.createBufferSource();
  src.buffer = noiseBuffer(o.ctx, color);
  src.loop = true;
  src.start(at, (at * 1.37 + color.length) % 2.5);
  o.track(src);
  return src;
}

function lfo(o: Out, rate: number, depth: number, target: AudioParam, at: number, type: OscillatorType = "sine"): void {
  const osc = o.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;
  const g = gainNode(o.ctx, depth);
  osc.connect(g).connect(target);
  osc.start(at);
  o.track(osc);
}

function bed(o: Out, layer: Ambience, at: number): void {
  const { ctx } = o;
  const chain = (src: AudioNode, ...nodes: AudioNode[]): AudioNode => {
    let n = src;
    for (const x of nodes) {
      n.connect(x);
      n = x;
    }
    n.connect(o.dest);
    return n;
  };
  switch (layer) {
    case "forest_wind": {
      const lp = biquad(ctx, "lowpass", 420, 0.7);
      lfo(o, 0.07, 260, lp.frequency, at);
      chain(noiseSrc(o, "brown", at), lp, gainNode(ctx, 0.9));
      const bp = biquad(ctx, "bandpass", 900, 0.7);
      lfo(o, 0.11, 400, bp.frequency, at);
      const g = gainNode(ctx, 0.18);
      lfo(o, 0.05, 0.1, g.gain, at);
      chain(noiseSrc(o, "pink", at), bp, g);
      return;
    }
    case "strong_wind": {
      const bp = biquad(ctx, "bandpass", 550, 0.9);
      lfo(o, 0.13, 350, bp.frequency, at);
      const g = gainNode(ctx, 1.0);
      lfo(o, 0.17, 0.35, g.gain, at);
      chain(noiseSrc(o, "pink", at), bp, g);
      const wh = biquad(ctx, "bandpass", 1300, 14);
      lfo(o, 0.09, 500, wh.frequency, at);
      chain(noiseSrc(o, "white", at), wh, gainNode(ctx, 0.35));
      chain(noiseSrc(o, "brown", at), biquad(ctx, "lowpass", 300), gainNode(ctx, 0.6));
      return;
    }
    case "rain":
    case "thunderstorm": {
      const heavy = layer === "thunderstorm";
      chain(noiseSrc(o, "white", at), biquad(ctx, "highpass", 900), biquad(ctx, "lowpass", 7500), gainNode(ctx, heavy ? 0.55 : 0.4));
      chain(noiseSrc(o, "pink", at), biquad(ctx, "lowpass", 1800), gainNode(ctx, heavy ? 0.5 : 0.35));
      if (heavy) chain(noiseSrc(o, "brown", at), biquad(ctx, "lowpass", 140), gainNode(ctx, 0.5));
      return;
    }
    case "creek": {
      const src = noiseSrc(o, "pink", at);
      const sum = gainNode(ctx, 0.8);
      sum.connect(o.dest);
      [[450, 1.7], [800, 2.3], [1400, 3.1], [2400, 1.3]].forEach(([f, r], k) => {
        const bp = biquad(ctx, "bandpass", f, 4);
        lfo(o, r, f * 0.15, bp.frequency, at, k % 2 ? "triangle" : "sine");
        const g = gainNode(ctx, 0.9 - k * 0.15);
        src.connect(bp).connect(g).connect(sum);
      });
      chain(noiseSrc(o, "white", at), biquad(ctx, "highpass", 3000), gainNode(ctx, 0.05));
      return;
    }
    case "bees": {
      const bp = biquad(ctx, "bandpass", 520, 1.2);
      const g = gainNode(ctx, 0.07);
      lfo(o, 0.3, 0.03, g.gain, at);
      bp.connect(g).connect(o.dest);
      [196, 208, 221].forEach((f, k) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        lfo(o, 5 + k * 1.7, 4 + k, osc.frequency, at);
        osc.connect(bp);
        osc.start(at);
        o.track(osc);
      });
      return;
    }
    case "birds_day":
    case "night_crickets": {
      // faint air bed under the chirps
      chain(noiseSrc(o, "pink", at), biquad(ctx, "lowpass", layer === "birds_day" ? 700 : 450), gainNode(ctx, 0.08));
      return;
    }
  }
}

function birdPhrase(o: Out, t: number, rnd: () => number): number {
  const species = Math.floor(rnd() * 3);
  const pan = rnd() * 1.6 - 0.8;
  const n = 2 + Math.floor(rnd() * 5);
  const base = 2600 + rnd() * 1800;
  let tt = t;
  for (let i = 0; i < n; i++) {
    if (species === 0) {
      tone(o, { f: base, f2: base * 1.5, glide: 0.05, t: tt, dur: 0.07, a: 0.005, peak: 0.12, pan });
      tt += 0.09 + rnd() * 0.04;
    } else if (species === 1) {
      tone(o, { f: base * 1.3, f2: base * 0.8, glide: 0.1, t: tt, dur: 0.12, a: 0.01, peak: 0.1, pan });
      tt += 0.16;
    } else {
      tone(o, { f: base * 0.9, t: tt, dur: 0.18, a: 0.02, peak: 0.08, vibrato: [28, 300], pan });
      tt += 0.24;
    }
  }
  return tt - t;
}

function cricketChirp(o: Out, t: number, f: number, pan: number): void {
  for (let i = 0; i < 4; i++) tone(o, { f, t: t + i * 0.028, dur: 0.02, a: 0.003, peak: 0.07, pan });
}

class LayerVoice {
  private gain: GainNode | null = null;
  private posGain: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private rnd: () => number;
  private next = 0;
  private next2 = 0;
  private startedAt = 0;
  private fadeIn = 0.05;
  private stopping = false;
  private stopAt = Infinity;
  private released = false;

  constructor(private o: Out | null, public span: AmbienceSpan, private toCtx: (ep: number) => number) {
    this.rnd = mulberry32(Math.round(span.start * 100) + span.layer.length * 977);
  }

  start(atEp: number, fade: number): void {
    this.startedAt = atEp;
    this.fadeIn = Math.max(0.05, fade);
    this.next = atEp + 0.3 + this.rnd() * 1.5;
    this.next2 = atEp + 0.1 + this.rnd() * 0.5;
    if (this.span.layer === "thunderstorm") this.next = atEp + 2 + this.rnd() * 4;
    const o = this.o;
    if (!o) return;
    const { ctx } = o;
    const t = this.toCtx(atEp);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(LAYER_GAIN[this.span.layer], t + this.fadeIn);
    const pg = gainNode(ctx, 1);
    const pan = ctx.createStereoPanner();
    g.connect(pg).connect(pan).connect(o.dest);
    this.gain = g;
    this.posGain = pg;
    this.pan = pan;
    bed(this.out()!, this.span.layer, t);
  }

  private out(): Out | null {
    if (!this.o || !this.gain) return null;
    const o = this.o;
    return { ctx: o.ctx, dest: this.gain, track: (n) => { this.sources.push(n); o.track(n); } };
  }

  stop(atEp: number, fade: number): void {
    if (this.stopping) return;
    this.stopping = true;
    const at = Math.max(atEp, this.startedAt + this.fadeIn);
    this.stopAt = at;
    const g = this.gain;
    if (!g) return;
    const t = this.toCtx(at);
    g.gain.setValueAtTime(LAYER_GAIN[this.span.layer], t);
    g.gain.linearRampToValueAtTime(SILENT, t + Math.max(0.05, fade));
  }

  /** Free the continuous sources (after the fade-out has finished). */
  release(atEp: number): void {
    if (this.released || !this.o) return;
    this.released = true;
    const t = Math.max(this.o.ctx.currentTime, this.toCtx(atEp));
    for (const s of this.sources) {
      try {
        s.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  get done(): boolean {
    return this.released;
  }

  /** The span was extended (timeline grew): cancel a pending fade-out. */
  retarget(span: AmbienceSpan, nowEp: number): void {
    this.span = span;
    if (!this.stopping || this.released || span.end <= this.stopAt) return;
    this.stopping = false;
    this.stopAt = Infinity;
    const g = this.gain;
    if (!g || !this.o) return;
    const now = this.o.ctx.currentTime;
    g.gain.cancelScheduledValues(Math.max(now, this.toCtx(Math.max(nowEp, this.startedAt + this.fadeIn))));
    g.gain.setValueAtTime(LAYER_GAIN[span.layer], Math.max(now, this.toCtx(nowEp)));
  }

  /** Random events (chirps, droplets, thunder) with onsets in [fromEp, toEp). */
  tick(fromEp: number, toEp: number): void {
    const o = this.out();
    const r = this.rnd;
    const end = Math.min(toEp, this.span.end);
    switch (this.span.layer) {
      case "birds_day":
        while (this.next < end) {
          let len = 0.5;
          if (this.next >= fromEp && o) len = birdPhrase(o, this.toCtx(this.next), r);
          this.next += len + 0.6 + r() * 2.4;
        }
        return;
      case "night_crickets":
        while (this.next < end) {
          if (this.next >= fromEp && o) cricketChirp(o, this.toCtx(this.next), 4400, -0.4);
          this.next += 0.55 + r() * 0.1;
        }
        while (this.next2 < end) {
          if (this.next2 >= fromEp && o) cricketChirp(o, this.toCtx(this.next2), 4900, 0.5);
          this.next2 += 0.8 + r() * 0.15;
        }
        return;
      case "rain":
      case "thunderstorm":
        while (this.next2 < end) {
          if (this.next2 >= fromEp && o) {
            burst(o, { color: "white", t: this.toCtx(this.next2), dur: 0.02, filter: "bandpass", f: 2500 + r() * 3000, q: 3, peak: 0.15 + r() * 0.15, pan: r() * 1.6 - 0.8 });
          }
          this.next2 += 0.08 + r() * 0.2;
        }
        if (this.span.layer === "thunderstorm") {
          while (this.next < end) {
            if (this.next >= fromEp && o) renderSfx(o, "thunder_clap", this.toCtx(this.next), 0.5 + r() * 0.5);
            this.next += 7 + r() * 11;
          }
        }
        return;
      case "creek":
        while (this.next2 < end) {
          if (this.next2 >= fromEp && o) {
            const f = 500 + r() * 900;
            tone(o, { f, f2: f * (1.4 + r() * 0.6), glide: 0.04, t: this.toCtx(this.next2), dur: 0.05, peak: 0.06 + r() * 0.06, pan: r() - 0.5 });
          }
          this.next2 += 0.15 + r() * 0.4;
        }
        return;
      default:
        return;
    }
  }

  /** Positional layers: level + pan from the camera. */
  setPosition(gain: number, pan: number): void {
    if (!this.posGain || !this.pan || !this.o) return;
    const now = this.o.ctx.currentTime;
    this.posGain.gain.setTargetAtTime(gain, now, 0.2);
    this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), now, 0.2);
  }
}

export class AmbienceDirector {
  layersStarted = 0;
  private voices = new Map<AmbienceSpan, LayerVoice>();

  constructor(private o: Out | null, public spans: AmbienceSpan[], private toCtx: (ep: number) => number) {}

  /** Timeline changed while playing: keep layers whose span still exists (same layer + start); fade the rest. */
  retarget(spans: AmbienceSpan[], nowEp: number): void {
    const next = new Map<AmbienceSpan, LayerVoice>();
    for (const [sp, v] of this.voices) {
      const match = spans.find((n) => n.layer === sp.layer && Math.abs(n.start - sp.start) < 1e-3 && !next.has(n));
      if (match && match.end > nowEp && !v.done) {
        v.retarget(match, nowEp);
        next.set(match, v);
      } else {
        v.stop(nowEp, 0.6);
        v.release(nowEp + 0.7);
      }
    }
    this.voices = next;
    this.spans = spans;
  }

  update(fromEp: number, toEp: number, nowEp: number): void {
    for (const [sp, v] of this.voices) {
      if (!v.done && sp.end + sp.fadeOut < nowEp) v.release(nowEp);
    }
    for (const sp of this.spans) {
      const tail = sp.end + sp.fadeOut;
      if (sp.start >= toEp || tail <= fromEp) continue;
      let v = this.voices.get(sp);
      if (!v) {
        if (sp.end <= nowEp) continue;
        v = new LayerVoice(this.o, sp, this.toCtx);
        const late = sp.start < nowEp - 0.05;
        v.start(late ? nowEp : sp.start, late ? 0.5 : sp.fadeIn);
        this.voices.set(sp, v);
        this.layersStarted++;
      }
      v.tick(fromEp, toEp);
      if (sp.end < toEp) v.stop(sp.end, sp.fadeOut);
    }
  }

  /** Re-spatialize positional layers (creek, bees) from the camera position and right vector. */
  setListener(camPos: Vec3, right: Vec3): void {
    for (const [sp, v] of this.voices) {
      const p = LAYER_POS[sp.layer];
      if (!p) continue;
      const dx = p[0] - camPos[0];
      const dz = p[1] - camPos[2];
      const d = Math.hypot(dx, dz) || 1;
      v.setPosition(clamp(9 / d, 0.3, 1.4), ((dx * right[0] + dz * right[2]) / d) * 0.8);
    }
  }
}
