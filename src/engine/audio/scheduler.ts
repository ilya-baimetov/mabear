// Look-ahead scheduling helpers (spec §7.6). Pure functions (flatten, windowing, section planning) plus a tiny
// timer-driven scheduler whose timing comes from a clock (AudioContext time), never from setTimeout precision.
import type {
  Ambience, AmbienceCue, DialogueCue, DuckingCue, EmoteCue, FoleyCue, Intensity, MusicMood, MusicTrackCue, SfxCue, Timeline,
} from "../../shared/schema";

/** Seconds of audio scheduled ahead of the playhead on every tick. */
export const LOOKAHEAD_S = 1.5;
/** Timer tick period (ms). Only decides how often we look ahead; never the timing of a sound. */
export const TICK_MS = 100;

export type Abs<T> = T & { t: number; i: number };

export interface FlatTimeline {
  dialogue: Abs<DialogueCue>[];
  emotes: Abs<EmoteCue>[];
  foley: Abs<FoleyCue>[];
  sfx: Abs<SfxCue>[];
  music: Abs<MusicTrackCue>[];
  ambience: Abs<AmbienceCue>[];
  ducking: Abs<DuckingCue>[];
  duration: number;
}

function abs<T extends { start: number }>(out: Abs<T>[], cues: T[] | undefined, offset: number): void {
  if (!Array.isArray(cues)) return;
  for (const c of cues) {
    if (!c || !Number.isFinite(c.start)) continue;
    out.push({ ...c, t: offset + c.start, i: 0 });
  }
}

function finish<T extends { t: number; i: number }>(list: T[]): T[] {
  list.sort((a, b) => a.t - b.t);
  list.forEach((c, i) => (c.i = i));
  return list;
}

/** Concatenate every segment's audio cues into absolute episode time (segment offset + cue start), sorted. */
export function flattenTimeline(tl: Timeline | null | undefined): FlatTimeline {
  const f: FlatTimeline = { dialogue: [], emotes: [], foley: [], sfx: [], music: [], ambience: [], ducking: [], duration: 0 };
  if (!tl || !Array.isArray(tl.segments)) return f;
  for (const s of tl.segments) {
    const seg = s?.segment;
    if (!seg) continue;
    const off = Number.isFinite(s.offset) ? s.offset : 0;
    abs(f.dialogue, seg.dialogue, off);
    abs(f.emotes, seg.emotes, off);
    abs(f.foley, seg.foley, off);
    abs(f.sfx, seg.sfx, off);
    abs(f.music, seg.music, off);
    abs(f.ambience, seg.ambience, off);
    abs(f.ducking, seg.ducking, off);
  }
  finish(f.dialogue); finish(f.emotes); finish(f.foley); finish(f.sfx);
  finish(f.music); finish(f.ambience); finish(f.ducking);
  const last = tl.segments[tl.segments.length - 1];
  f.duration = Number.isFinite(tl.duration) && tl.duration > 0
    ? tl.duration
    : last ? last.offset + (last.segment?.duration ?? 0) : 0;
  return f;
}

/** Cues whose start lies in [from, to). Lists are sorted by t. */
export function inWindow<T extends { t: number }>(list: T[], from: number, to: number): T[] {
  const out: T[] = [];
  for (const c of list) {
    if (c.t >= to) break;
    if (c.t >= from) out.push(c);
  }
  return out;
}

/** The last cue starting at or before t (state tracks: music, ambience), or null. */
export function stateAt<T extends { t: number }>(list: T[], t: number): T | null {
  let hit: T | null = null;
  for (const c of list) {
    if (c.t <= t + 1e-9) hit = c;
    else break;
  }
  return hit;
}

// ---------- Music sections: consecutive cues with the same mood are ONE continuous voice ----------

export interface MusicSection {
  mood: MusicMood;
  start: number;
  /** end of the section (next mood change or the timeline end) */
  end: number;
  fadeIn: number;
  fadeOut: number;
  /** intensity changes inside the section (first entry at start) */
  intensities: { t: number; intensity: Intensity }[];
  /** indices of the music cues merged into this section */
  cues: number[];
}

export function planMusicSections(cues: Abs<MusicTrackCue>[], endT: number): MusicSection[] {
  const out: MusicSection[] = [];
  for (const c of cues) {
    const cur = out[out.length - 1];
    if (cur && cur.mood === c.mood) {
      const lastI = cur.intensities[cur.intensities.length - 1];
      if (!lastI || lastI.intensity !== c.intensity) cur.intensities.push({ t: c.t, intensity: c.intensity });
      cur.cues.push(c.i);
      continue;
    }
    if (cur) {
      cur.end = c.t;
      cur.fadeOut = Math.max(0.05, c.fade);
    }
    out.push({
      mood: c.mood, start: c.t, end: Math.max(c.t, endT), fadeIn: Math.max(0.05, c.fade), fadeOut: 1.5,
      intensities: [{ t: c.t, intensity: c.intensity }], cues: [c.i],
    });
  }
  return out;
}

export function intensityAt(sec: MusicSection, t: number): Intensity {
  return stateAt(sec.intensities, t)?.intensity ?? sec.intensities[0]?.intensity ?? "medium";
}

// ---------- Ambience spans: a layer present in consecutive cues keeps playing (no restart) ----------

export interface AmbienceSpan {
  layer: Ambience;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
}

export function planAmbienceSpans(cues: Abs<AmbienceCue>[], endT: number): AmbienceSpan[] {
  const open = new Map<Ambience, AmbienceSpan>();
  const out: AmbienceSpan[] = [];
  for (const c of cues) {
    const layers = new Set(Array.isArray(c.layers) ? c.layers : []);
    for (const [layer, span] of open) {
      if (!layers.has(layer)) {
        span.end = c.t;
        span.fadeOut = Math.max(0.05, c.fade);
        open.delete(layer);
      }
    }
    for (const layer of layers) {
      if (open.has(layer)) continue;
      const span: AmbienceSpan = { layer, start: c.t, end: Math.max(c.t, endT), fadeIn: Math.max(0.05, c.fade), fadeOut: 1.5 };
      open.set(layer, span);
      out.push(span);
    }
  }
  return out;
}

// ---------- Timer-driven look-ahead loop ----------

export interface LookaheadLoop {
  stop(): void;
}

/** Calls `tick()` now and every TICK_MS until stopped. The timer only paces look-ahead; never sound timing. */
export function startLoop(tick: () => void, periodMs = TICK_MS): LookaheadLoop {
  const safe = (): void => {
    try {
      tick();
    } catch {
      /* audio must never throw */
    }
  };
  safe();
  const id = setInterval(safe, periodMs) as unknown as { unref?: () => void };
  if (id && typeof id.unref === "function") id.unref();
  return {
    stop: () => clearInterval(id as unknown as ReturnType<typeof setInterval>),
  };
}
