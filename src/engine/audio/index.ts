// Audio engine (spec §7.6): implements AudioEngine from src/engine/api.ts.
// One shared AudioContext (lazy, unlocked on the first gesture); buses voice / fx / ambience / music → master.
// play() runs a look-ahead scheduler: every TICK_MS it schedules the cues of the next LOOKAHEAD_S seconds with
// AudioContext time (segment offset + cue start). Without a running AudioContext (node, headless before unlock) it
// runs "dry": the same scheduling walk on the wall clock that only counts cues. Never throws.
import type { AudioDebug, AudioEngine } from "../api";
import type { ActorId, CamKey, Lang, Timeline, Vec3 } from "../../shared/schema";
import { AmbienceDirector } from "./ambience";
import { MIX, createBuses, getSharedContext, masterLevel, mergeDuckWindows, resetDuck, scheduleDuck, setMaster, type Buses, type DuckWindow } from "./bus";
import { renderFoley } from "./foley";
import { MusicDirector } from "./music";
import {
  LOOKAHEAD_S, TICK_MS, flattenTimeline, inWindow, planAmbienceSpans, planMusicSections, startLoop, stateAt,
  type FlatTimeline, type LookaheadLoop,
} from "./scheduler";
import { renderSfx } from "./sfx";
import { clamp, gainNode, type Out } from "./synth";
import { Tts, interjection, profileFor } from "./tts";
import { renderVocal } from "./vocals";

export { MIX } from "./bus";
export { LOOKAHEAD_S, TICK_MS } from "./scheduler";

export interface AudioEngineOptions {
  /** look-ahead window (s); default LOOKAHEAD_S */
  lookahead?: number;
  /** timer period (ms); default TICK_MS */
  tickMs?: number;
  /** never create an AudioContext (tests / dry runs) */
  noContext?: boolean;
}

/** Dialogue cues already in progress by more than this at play() are not spoken (can't start TTS mid-word). */
export const DIALOGUE_LATE_S = 0.3;
/** Safety latency between scheduling and the first sound (s). */
const START_LATENCY = 0.06;
const ACTORS: ActorId[] = ["masha", "bear"];

type Track = keyof AudioDebug["scheduled"];

interface SessionOuts {
  sfx: GainNode;
  music: GainNode;
  ambience: GainNode;
  foley: Record<ActorId, GainNode>;
  vocals: Record<ActorId, GainNode>;
}

interface Session {
  tl: Timeline;
  flat: FlatTimeline;
  lang: Lang;
  fromT: number;
  real: boolean;
  anchorCtx: number;
  anchorWall: number;
  scheduledUntil: number;
  firstTick: boolean;
  loop: LookaheadLoop | null;
  counted: Set<string>;
  music: MusicDirector;
  amb: AmbienceDirector;
  duck: DuckWindow[];
  duckDone: Set<number>;
  outs: SessionOuts | null;
  sources: Set<AudioScheduledSourceNode>;
  timers: Set<ReturnType<typeof setTimeout>>;
}

interface ActorChannel {
  input: GainNode;
  pan: StereoPannerNode;
  dist: GainNode;
  lastPan: number;
  lastGain: number;
}

const emptyCounts = (): AudioDebug["scheduled"] => ({ dialogue: 0, emotes: 0, foley: 0, sfx: 0, music: 0, ambience: 0 });

let lastDebug: AudioDebug | null = null;

/** The debug object of the most recently created engine (also at window.__mabearAudio). */
export function getAudioDebug(): AudioDebug | null {
  return lastDebug;
}

function wallNow(): number {
  try {
    return globalThis.performance?.now() ?? Date.now();
  } catch {
    return Date.now();
  }
}

/** Camera basis on the ground plane: forward and right unit vectors. Pure. */
export function cameraBasis(cam: CamKey): { fwd: Vec3; right: Vec3 } {
  let fx = cam.look[0] - cam.pos[0];
  let fz = cam.look[2] - cam.pos[2];
  const l = Math.hypot(fx, fz) || 1;
  fx /= l;
  fz /= l;
  return { fwd: [fx, 0, fz], right: [-fz, 0, fx] };
}

/** Stereo pan (-1..1) and distance gain (0.15..1) of a world point relative to a camera. Pure. */
export function spatialize(cam: CamKey, p: Vec3): { pan: number; gain: number } {
  const { fwd, right } = cameraBasis(cam);
  const dx = p[0] - cam.pos[0];
  const dz = p[2] - cam.pos[2];
  const d = Math.hypot(dx, p[1] - cam.pos[1], dz) || 1e-6;
  const flat = Math.hypot(dx, dz) || 1e-6;
  const pan = clamp(((dx * right[0] + dz * right[2]) / flat) * 0.9, -1, 1);
  const REF = 5;
  let gain = clamp(REF / Math.max(REF, d), 0.15, 1);
  if (dx * fwd[0] + dz * fwd[2] < 0) gain *= 0.7; // behind the camera
  return { pan, gain };
}

export function createAudioEngine(opts: AudioEngineOptions = {}): AudioEngine {
  const lookahead = opts.lookahead ?? LOOKAHEAD_S;
  const tickMs = opts.tickMs ?? TICK_MS;
  const debug: AudioDebug = { scheduled: emptyCounts(), ttsAvailable: false, unlocked: false };
  lastDebug = debug;
  try {
    (globalThis as unknown as { __mabearAudio?: AudioDebug }).__mabearAudio = debug;
  } catch {
    /* ignore */
  }

  let tts: Tts | null = null;
  try {
    tts = new Tts();
    debug.ttsAvailable = tts.available;
    tts.onChange(() => (debug.ttsAvailable = !!tts?.available));
  } catch {
    tts = null;
  }

  let ctx: AudioContext | null = null;
  let buses: Buses | null = null;
  const channels: Partial<Record<ActorId, ActorChannel>> = {};
  let volume = 1;
  let muted = false;
  let session: Session | null = null;
  let listener: { cam: CamKey; right: Vec3 } | null = null;
  let disposed = false;

  const ensureAudio = (create: boolean): void => {
    if (opts.noContext || disposed) return;
    if (!ctx) {
      ctx = getSharedContext(create);
      if (!ctx) return;
      try {
        ctx.addEventListener("statechange", onStateChange);
      } catch {
        /* ignore */
      }
    }
    if (!buses && ctx) {
      buses = createBuses(ctx);
      setMaster(buses, volume, muted);
      for (const a of ACTORS) {
        const input = gainNode(ctx, 1);
        const pan = ctx.createStereoPanner();
        const dist = gainNode(ctx, 1);
        input.connect(pan).connect(dist).connect(buses.fx);
        channels[a] = { input, pan, dist, lastPan: 0, lastGain: 1 };
      }
    }
    debug.unlocked = ctx?.state === "running";
  };

  function onStateChange(): void {
    try {
      debug.unlocked = ctx?.state === "running";
      if (ctx?.state === "running" && session && !session.real) restartReal();
    } catch {
      /* never throw */
    }
  }

  const nowEp = (s: Session): number =>
    s.real && ctx ? s.fromT + (ctx.currentTime - s.anchorCtx) : s.fromT + (wallNow() - s.anchorWall) / 1000;

  const count = (s: Session, track: Track, i: number): void => {
    const k = `${track}:${i}`;
    if (s.counted.has(k)) return;
    s.counted.add(k);
    debug.scheduled[track]++;
  };

  const voiceVolume = (): number => MIX.voice * masterLevel(volume, muted);

  function startSession(tl: Timeline, fromT: number, lang: Lang, counted: Set<string>): void {
    ensureAudio(true);
    const real = !!(ctx && buses && ctx.state === "running");
    if (ctx && ctx.state === "suspended") {
      try {
        void ctx.resume().catch(() => {});
      } catch {
        /* ignore */
      }
    }
    const flat = flattenTimeline(tl);
    const t0 = Number.isFinite(fromT) ? Math.max(0, fromT) : 0;
    const anchorCtx = real && ctx ? ctx.currentTime + START_LATENCY : 0;
    const toCtx = (ep: number): number => anchorCtx + (ep - t0);
    const sources = new Set<AudioScheduledSourceNode>();
    let outs: SessionOuts | null = null;
    let musicOut: Out | null = null;
    let ambOut: Out | null = null;
    if (real && ctx && buses) {
      const c = ctx;
      const mk = (v: number, to: AudioNode): GainNode => {
        const g = gainNode(c, v);
        g.connect(to);
        return g;
      };
      outs = {
        sfx: mk(MIX.sfx, buses.fx),
        music: mk(1, buses.music),
        ambience: mk(1, buses.ambience),
        foley: { masha: mk(MIX.foley, channels.masha!.input), bear: mk(MIX.foley, channels.bear!.input) },
        vocals: { masha: mk(MIX.vocals, channels.masha!.input), bear: mk(MIX.vocals, channels.bear!.input) },
      };
      const track = (n: AudioScheduledSourceNode): void => {
        sources.add(n);
        n.onended = () => sources.delete(n);
      };
      musicOut = { ctx: c, dest: outs.music, track };
      ambOut = { ctx: c, dest: outs.ambience, track };
    }
    const s: Session = {
      tl, flat, lang, fromT: t0, real, anchorCtx, anchorWall: wallNow(),
      scheduledUntil: t0 - 0.03, firstTick: true, loop: null, counted,
      music: new MusicDirector(musicOut, planMusicSections(flat.music, flat.duration), toCtx),
      amb: new AmbienceDirector(ambOut, planAmbienceSpans(flat.ambience, flat.duration), toCtx),
      duck: mergeDuckWindows(flat.ducking), duckDone: new Set(), outs, sources, timers: new Set(),
    };
    session = s;
    if (listener) s.amb.setListener(listener.cam.pos, listener.right);
    s.loop = startLoop(() => tick(s), tickMs);
  }

  function later(s: Session, delayS: number, fn: () => void): void {
    const id = setTimeout(() => {
      s.timers.delete(id);
      if (session !== s) return;
      try {
        fn();
      } catch {
        /* never throw */
      }
    }, Math.max(0, delayS * 1000));
    s.timers.add(id);
  }

  function tick(s: Session): void {
    if (session !== s) return;
    const now = nowEp(s);
    const from = s.scheduledUntil;
    const to = now + lookahead;
    if (to <= from) return;
    s.scheduledUntil = to;
    const first = s.firstTick;
    s.firstTick = false;
    const toCtx = (ep: number): number => s.anchorCtx + (ep - s.fromT);
    const at = (ep: number): number => (ctx ? Math.max(ctx.currentTime + 0.005, toCtx(ep)) : 0);
    const o = s.outs;

    // state tracks: count the cue active at the start, then every cue entering the window
    if (first) {
      const m = stateAt(s.flat.music, s.fromT);
      if (m) count(s, "music", m.i);
      const a = stateAt(s.flat.ambience, s.fromT);
      if (a) count(s, "ambience", a.i);
    }
    for (const c of inWindow(s.flat.music, from, to)) count(s, "music", c.i);
    for (const c of inWindow(s.flat.ambience, from, to)) count(s, "ambience", c.i);
    s.music.update(from, to, now);
    s.amb.update(from, to, now);

    // ducking windows
    if (s.real && buses) {
      s.duck.forEach((w, k) => {
        if (s.duckDone.has(k) || w.start >= to || w.end <= now) return;
        s.duckDone.add(k);
        scheduleDuck(buses!, toCtx(w.start), toCtx(w.end), w.depth);
      });
    }

    // dialogue (TTS fires at the cue start; can't be sample-scheduled)
    for (const c of inWindow(s.flat.dialogue, first ? s.fromT - DIALOGUE_LATE_S : from, to)) {
      count(s, "dialogue", c.i);
      if (!tts || muted) continue;
      const prof = profileFor(c.actor);
      const lang = c.lang ?? s.lang;
      const bcp = prof.lang[lang] ?? prof.lang.en;
      later(s, c.t - now, () => tts?.speak(c.text, bcp, prof.pitch, prof.rate, voiceVolume()));
    }

    // vocal emotes
    for (const c of inWindow(s.flat.emotes, from, to)) {
      count(s, "emotes", c.i);
      const vo: Out | null = o && ctx ? { ctx, dest: o.vocals[c.actor] ?? o.vocals.masha, track: trackFor(s) } : null;
      const text = c.actor === "masha" ? interjection("masha", c.emote, s.lang) : null;
      if (text && tts && tts.available) {
        const prof = profileFor("masha");
        const bcp = prof.lang[s.lang] ?? prof.lang.en;
        later(s, c.t - now, () => {
          const spoke = !muted && !tts!.speaking && tts!.speak(text, bcp, Math.min(2, prof.pitch + 0.3), prof.rate + 0.05, voiceVolume());
          if (!spoke && vo && ctx) renderVocal(vo, c.actor, c.emote, ctx.currentTime + 0.01);
        });
      } else if (vo) {
        if (!listener && channels[c.actor]) channels[c.actor]!.pan.pan.setValueAtTime(0, at(c.t));
        renderVocal(vo, c.actor, c.emote, at(c.t));
      }
    }

    // foley (re-spatialized per actor channel)
    for (const c of inWindow(s.flat.foley, from, to)) {
      count(s, "foley", c.i);
      if (!o || !ctx) continue;
      if (!listener && channels[c.actor] && Number.isFinite(c.pan)) channels[c.actor]!.pan.pan.setValueAtTime(clamp(c.pan, -1, 1), at(c.t));
      renderFoley({ ctx, dest: o.foley[c.actor] ?? o.foley.masha, track: trackFor(s) }, c.id, c.surface, at(c.t), c.gain, c.actor === "bear");
    }

    // event SFX (cue pan)
    for (const c of inWindow(s.flat.sfx, from, to)) {
      count(s, "sfx", c.i);
      if (!o || !ctx) continue;
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(Number.isFinite(c.pan) ? c.pan : 0, -1, 1);
      p.connect(o.sfx);
      renderSfx({ ctx, dest: p, track: trackFor(s) }, c.id, at(c.t), c.gain);
    }

    // past the end: stop looking ahead (scheduled tails finish on their own)
    if (now > s.flat.duration + 4) {
      s.loop?.stop();
      s.loop = null;
    }
  }

  const trackers = new WeakMap<Session, (n: AudioScheduledSourceNode) => void>();
  function trackFor(s: Session): (n: AudioScheduledSourceNode) => void {
    let t = trackers.get(s);
    if (!t) {
      t = (n) => {
        s.sources.add(n);
        n.onended = () => s.sources.delete(n);
      };
      trackers.set(s, t);
    }
    return t;
  }

  function endSession(): Session | null {
    const s = session;
    if (!s) return null;
    session = null;
    s.loop?.stop();
    s.loop = null;
    s.timers.forEach((id) => clearTimeout(id));
    s.timers.clear();
    if (ctx && s.outs) {
      const now = ctx.currentTime;
      const o = s.outs;
      const gains = [o.sfx, o.music, o.ambience, o.foley.masha, o.foley.bear, o.vocals.masha, o.vocals.bear];
      for (const g of gains) {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + 0.02);
        } catch {
          /* ignore */
        }
      }
      s.sources.forEach((n) => {
        try {
          n.stop(now + 0.03);
        } catch {
          /* already stopped */
        }
      });
      s.sources.clear();
      setTimeout(() => gains.forEach((g) => { try { g.disconnect(); } catch { /* ignore */ } }), 120);
    }
    if (buses) {
      try {
        resetDuck(buses);
      } catch {
        /* ignore */
      }
    }
    return s;
  }

  function restartReal(): void {
    const s = session;
    if (!s) return;
    const t = nowEp(s);
    endSession();
    startSession(s.tl, t, s.lang, s.counted);
  }

  const engine: AudioEngine = {
    async unlock(): Promise<void> {
      try {
        ensureAudio(true);
        tts?.prime();
        if (ctx && ctx.state !== "running") {
          await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
        }
        debug.unlocked = ctx?.state === "running";
        if (tts) debug.ttsAvailable = tts.available;
        if (debug.unlocked && session && !session.real) restartReal();
      } catch {
        /* never throw */
      }
    },

    play(timeline: Timeline, fromT: number, lang: Lang): void {
      try {
        endSession();
        tts?.cancel();
        Object.assign(debug.scheduled, emptyCounts());
        if (tts) debug.ttsAvailable = tts.available;
        startSession(timeline, fromT, lang, new Set());
      } catch {
        /* never throw */
      }
    },

    stop(): void {
      try {
        endSession();
        tts?.cancel();
      } catch {
        /* never throw */
      }
    },

    setVolume(v: number): void {
      try {
        volume = clamp(Number.isFinite(v) ? v : 1, 0, 1);
        if (buses) setMaster(buses, volume, muted);
      } catch {
        /* never throw */
      }
    },

    setMuted(m: boolean): void {
      try {
        muted = !!m;
        if (buses) setMaster(buses, volume, muted);
        if (muted) tts?.cancel();
      } catch {
        /* never throw */
      }
    },

    updateListener(camera: CamKey, actors: Record<ActorId, Vec3>): void {
      try {
        if (!camera || !Array.isArray(camera.pos) || !Array.isArray(camera.look)) return;
        const { right } = cameraBasis(camera);
        listener = { cam: camera, right };
        if (!ctx) return;
        const now = ctx.currentTime;
        for (const a of ACTORS) {
          const ch = channels[a];
          const p = actors?.[a];
          if (!ch || !p) continue;
          const { pan, gain } = spatialize(camera, p);
          if (Math.abs(pan - ch.lastPan) > 0.01) {
            ch.pan.pan.cancelScheduledValues(now);
            ch.pan.pan.setTargetAtTime(pan, now, 0.05);
            ch.lastPan = pan;
          }
          if (Math.abs(gain - ch.lastGain) > 0.01) {
            ch.dist.gain.cancelScheduledValues(now);
            ch.dist.gain.setTargetAtTime(gain, now, 0.05);
            ch.lastGain = gain;
          }
        }
        session?.amb.setListener(camera.pos, right);
      } catch {
        /* never throw */
      }
    },

    dispose(): void {
      try {
        endSession();
        tts?.cancel();
        disposed = true;
        if (ctx) ctx.removeEventListener("statechange", onStateChange);
        if (buses) buses.master.disconnect();
        buses = null;
      } catch {
        /* never throw */
      }
    },
  };
  return engine;
}
