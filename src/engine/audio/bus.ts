// Audio graph (spec §7.6): one shared AudioContext, buses voice / fx (vocals+foley+SFX) / ambience / music → master.
// Bus levels are fixed here; players only get master volume + mute.
import { clamp, dbToGain } from "./synth";

/** Fixed mix (linear gains). TTS cannot be routed through WebAudio: its level is MIX.voice × master. */
export const MIX = {
  master: 0.9,
  voice: 1.0,
  fx: 1.0,
  vocals: 1.0,
  foley: 0.8,
  sfx: 0.85,
  ambience: 0.55,
  music: 0.7,
} as const;

export const DUCK = { attack: 0.15, release: 0.4 } as const;

export interface Buses {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  /** WebAudio-rendered voice (TTS fallback blips go to vocals, not here; kept for completeness) */
  voice: GainNode;
  fx: GainNode;
  ambience: GainNode;
  music: GainNode;
  /** ducking stages (automated by DuckingCues) */
  ambienceDuck: GainNode;
  musicDuck: GainNode;
}

let shared: AudioContext | null = null;

type ACtor = new (opts?: AudioContextOptions) => AudioContext;

/** The AudioContext constructor if this environment has one (null in node / workers). */
export function audioContextCtor(): ACtor | null {
  const g = globalThis as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** Lazily create the one shared AudioContext; null when unavailable. Never throws. */
export function getSharedContext(create: boolean): AudioContext | null {
  if (shared && shared.state !== "closed") return shared;
  if (!create) return null;
  const C = audioContextCtor();
  if (!C) return null;
  try {
    shared = new C({ latencyHint: "interactive" });
  } catch {
    shared = null;
  }
  return shared;
}

export function createBuses(ctx: AudioContext): Buses {
  const master = ctx.createGain();
  master.gain.value = MIX.master;
  // gentle limiter so stacked layers never clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);

  const mk = (v: number, to: AudioNode): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  };
  const voice = mk(MIX.voice, master);
  const fx = mk(MIX.fx, master);
  const ambienceDuck = mk(1, master);
  const ambience = mk(MIX.ambience, ambienceDuck);
  const musicDuck = mk(1, master);
  const music = mk(MIX.music, musicDuck);
  return { ctx, master, limiter, voice, fx, ambience, music, ambienceDuck, musicDuck };
}

export function masterLevel(volume: number, muted: boolean): number {
  return muted ? 0 : MIX.master * clamp(volume, 0, 1);
}

export function setMaster(b: Buses, volume: number, muted: boolean): void {
  const now = b.ctx.currentTime;
  b.master.gain.cancelScheduledValues(now);
  b.master.gain.setTargetAtTime(masterLevel(volume, muted), now, 0.02);
}

export interface DuckWindow {
  start: number;
  end: number;
  depth: number;
}

/** Merge overlapping ducking cues into disjoint windows (deepest cut wins). Pure. */
export function mergeDuckWindows(cues: { t: number; dur: number; depth: number }[]): DuckWindow[] {
  const sorted = cues
    .filter((c) => c.dur > 0 && c.depth > 0)
    .map((c) => ({ start: c.t, end: c.t + c.dur, depth: c.depth }))
    .sort((a, b) => a.start - b.start);
  const out: DuckWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    // windows closer than attack+release would pump: bridge them
    if (last && w.start <= last.end + DUCK.release) {
      last.end = Math.max(last.end, w.end);
      last.depth = Math.max(last.depth, w.depth);
    } else out.push({ ...w });
  }
  return out;
}

/** Schedule one duck window on the music + ambience duck stages (ctx times). */
export function scheduleDuck(b: Buses, startCtx: number, endCtx: number, depthDb: number): void {
  const g = dbToGain(-Math.abs(depthDb));
  const now = b.ctx.currentTime;
  const s = Math.max(now, startCtx);
  if (endCtx <= s) return;
  for (const node of [b.musicDuck, b.ambienceDuck]) {
    node.gain.setTargetAtTime(g, s, DUCK.attack / 3);
    node.gain.setTargetAtTime(1, endCtx, DUCK.release / 3);
  }
}

export function resetDuck(b: Buses): void {
  const now = b.ctx.currentTime;
  for (const node of [b.musicDuck, b.ambienceDuck]) {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.setTargetAtTime(1, now, 0.03);
  }
}
