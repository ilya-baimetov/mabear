// Audio engine (spec §7.6) — node, no AudioContext: dry-run scheduling, pure helpers.
import { afterEach, describe, expect, it } from "vitest";
import type { AudioDebug } from "../../src/engine/api";
import { createAudioEngine, getAudioDebug, spatialize } from "../../src/engine/audio";
import { mergeDuckWindows } from "../../src/engine/audio/bus";
import { MOOD_SPECS, MusicDirector, SCALES, barSeconds, chordTones, composeBar, karplusStrong } from "../../src/engine/audio/music";
import {
  flattenTimeline, inWindow, planAmbienceSpans, planMusicSections, stateAt,
} from "../../src/engine/audio/scheduler";
import { pickVoice, interjection } from "../../src/engine/audio/tts";
import { BEAR_VOCALS, vocalFor } from "../../src/engine/audio/vocals";
import { MUSIC_MOODS, type MusicMood, type Segment, type Timeline, type WorldState } from "../../src/shared/schema";
import type { AudioEngine } from "../../src/engine/api";

const WS: WorldState = {
  timeOfDay: "day",
  actors: {
    masha: { pos: [0, 0], facing: 0, mark: "clearing", holding: null, posture: "stand" },
    bear: { pos: [-6, -2.6], facing: 0, mark: "porch", holding: null, posture: "stand" },
  },
  props: {} as WorldState["props"],
};

function seg(id: string, duration: number, over: Partial<Segment> = {}): Segment {
  return {
    paragraphId: id, version: 1, duration, startState: WS, endState: WS,
    actorClips: { masha: [], bear: [] }, dialogue: [], emotes: [], foley: [], camera: [], sfx: [],
    music: [], ambience: [], ducking: [], lighting: [], fx: [], ...over,
  };
}

function timeline(...segs: Segment[]): Timeline {
  let off = 0;
  const segments = segs.map((segment) => {
    const s = { offset: off, segment };
    off += segment.duration;
    return s;
  });
  return { segments, duration: off };
}

const music = (start: number, mood: MusicMood, intensity: "soft" | "medium" | "full" = "medium", fade = 1) => ({ start, mood, intensity, fade });

const TL = timeline(
  seg("p1", 6, {
    dialogue: [{ start: 0.2, dur: 1.5, actor: "masha", text: "Bear!", lang: "en", visemes: [] }],
    emotes: [{ start: 0.4, dur: 0.5, actor: "bear", emote: "sigh" }],
    foley: [
      { start: 0.1, actor: "masha", id: "footstep", surface: "grass", gain: 1, pan: 0 },
      { start: 0.5, actor: "bear", id: "footstep_heavy", surface: "wood", gain: 1, pan: 0.2 },
      { start: 3.0, actor: "masha", id: "footstep", surface: "dirt", gain: 1, pan: 0 },
    ],
    sfx: [{ start: 0.3, id: "door_slam", gain: 1, pan: 0 }],
    music: [music(0, "playful")],
    ambience: [{ start: 0, layers: ["birds_day", "forest_wind"], fade: 1 }],
    ducking: [{ start: 0.2, dur: 1.5, depth: 8 }],
  }),
  seg("p2", 5, { music: [music(0, "playful", "full")], ambience: [{ start: 0, layers: ["rain", "forest_wind"], fade: 2 }] }),
  seg("p3", 5, { music: [music(0, "spooky", "soft", 2)] }),
);

let engines: AudioEngine[] = [];
afterEach(() => {
  engines.forEach((e) => e.dispose());
  engines = [];
});
const make = (o: Parameters<typeof createAudioEngine>[0] = {}): AudioEngine => {
  const e = createAudioEngine(o);
  engines.push(e);
  return e;
};

describe("createAudioEngine (node, no AudioContext)", () => {
  it("constructs and every method is a safe no-op", async () => {
    const e = make();
    await e.unlock();
    e.setVolume(0.5);
    e.setMuted(true);
    e.setMuted(false);
    e.updateListener({ pos: [0, 2, 10], look: [0, 1, 0], fov: 40 }, { masha: [1, 0, 0], bear: [-3, 0, 0] });
    e.stop();
    expect(() => e.play(null as unknown as Timeline, 0, "en")).not.toThrow();
    expect(() => e.play({ segments: [], duration: 0 }, 0, "ru")).not.toThrow();
    e.dispose();
    const d = getAudioDebug() as AudioDebug;
    expect(d.unlocked).toBe(false);
    expect(d.ttsAvailable).toBe(false);
  });

  it("play() counts cues in the look-ahead window and exposes globalThis.__mabearAudio", () => {
    const e = make({ lookahead: 1.5 });
    e.play(TL, 0, "en");
    const d = (globalThis as unknown as { __mabearAudio: AudioDebug }).__mabearAudio;
    expect(d).toBe(getAudioDebug());
    expect(d.scheduled.dialogue).toBe(1);
    expect(d.scheduled.emotes).toBe(1);
    expect(d.scheduled.foley).toBe(2); // the step at 3.0 s is outside the first window
    expect(d.scheduled.sfx).toBe(1);
    expect(d.scheduled.music).toBe(1);
    expect(d.scheduled.ambience).toBe(1);
    e.stop();
    // stop keeps counts; the next play resets them
    expect(d.scheduled.foley).toBe(2);
    e.play(TL, 10.5, "en");
    expect(d.scheduled.dialogue).toBe(0);
    expect(d.scheduled.music).toBe(2); // p2 playful cue active at 10.5 + spooky entering the window at 11
    e.stop();
  });

  it("starting mid-timeline counts the active music/ambience cues but not past one-shots", () => {
    const e = make({ lookahead: 0.5 });
    e.play(TL, 2.0, "en");
    const d = getAudioDebug()!;
    expect(d.scheduled.dialogue).toBe(0); // 0.2 s line already 1.8 s in → not spoken
    expect(d.scheduled.foley).toBe(0);
    expect(d.scheduled.music).toBe(1);
    expect(d.scheduled.ambience).toBe(1);
    e.stop();
  });

  it("long one-shots still sounding at play() are joined mid-way; short ones that are over are skipped", () => {
    const tl = timeline(seg("x", 6, {
      sfx: [{ start: 0.2, id: "thunder_clap", gain: 1, pan: 0 }, { start: 0.9, id: "pop", gain: 1, pan: 0 }],
      foley: [{ start: 0.5, actor: "bear", id: "sizzle_loop", surface: "wood", gain: 1, pan: 0 }],
      emotes: [{ start: 0.6, dur: 2, actor: "bear", emote: "snore" }, { start: 0.6, dur: 0.5, actor: "masha", emote: "giggle" }],
    }));
    const e = make({ lookahead: 0.5 });
    e.play(tl, 1.0, "en");
    const d = getAudioDebug()!;
    expect(d.scheduled.sfx).toBe(1); // thunder (3.2 s) yes, pop (0.12 s) no
    expect(d.scheduled.foley).toBe(1);
    expect(d.scheduled.emotes).toBe(1); // snore yes, giggle over
    e.stop();
  });

  it("a whole look-ahead window covering the episode counts every cue", () => {
    const e = make({ lookahead: 100 });
    e.play(TL, 0, "ru");
    const d = getAudioDebug()!;
    expect(d.scheduled).toEqual({ dialogue: 1, emotes: 1, foley: 3, sfx: 1, music: 3, ambience: 2 });
    e.stop();
  });
});

describe("scheduler helpers", () => {
  it("flattens segments to absolute time (offset + cue start), sorted", () => {
    const f = flattenTimeline(TL);
    expect(f.duration).toBe(16);
    expect(f.music.map((c) => c.t)).toEqual([0, 6, 11]);
    expect(f.foley.map((c) => c.t)).toEqual([0.1, 0.5, 3.0]);
    expect(f.music.map((c) => c.i)).toEqual([0, 1, 2]);
  });

  it("windows cues by start time [from, to) and finds the active state cue", () => {
    const f = flattenTimeline(TL);
    expect(inWindow(f.foley, 0, 0.5).length).toBe(1);
    expect(inWindow(f.foley, 0, 0.51).length).toBe(2);
    expect(inWindow(f.foley, 0.5, 3).length).toBe(1);
    expect(stateAt(f.music, 7)?.t).toBe(6);
    expect(stateAt(f.music, 11)?.mood).toBe("spooky");
    expect(stateAt(f.music, -1)).toBeNull();
  });

  it("merges same-mood music cues into one section; mood change crossfades with the new cue's fade", () => {
    const f = flattenTimeline(TL);
    const secs = planMusicSections(f.music, f.duration);
    expect(secs.length).toBe(2);
    expect(secs[0]).toMatchObject({ mood: "playful", start: 0, end: 11, fadeOut: 2 });
    expect(secs[0].intensities).toEqual([{ t: 0, intensity: "medium" }, { t: 6, intensity: "full" }]);
    expect(secs[1]).toMatchObject({ mood: "spooky", start: 11, end: 16, fadeIn: 2 });
  });

  it("ambience layers present in consecutive cues keep one span", () => {
    const f = flattenTimeline(TL);
    const spans = planAmbienceSpans(f.ambience, f.duration);
    const wind = spans.filter((s) => s.layer === "forest_wind");
    expect(wind).toEqual([{ layer: "forest_wind", start: 0, end: 16, fadeIn: 1, fadeOut: 1.5 }]);
    expect(spans.find((s) => s.layer === "birds_day")).toMatchObject({ start: 0, end: 6, fadeOut: 2 });
    expect(spans.find((s) => s.layer === "rain")).toMatchObject({ start: 6, end: 16, fadeIn: 2 });
  });

  it("merges overlapping ducking cues (deepest wins)", () => {
    const w = mergeDuckWindows([
      { t: 1, dur: 1, depth: 6 },
      { t: 1.5, dur: 1, depth: 8 },
      { t: 10, dur: 1, depth: 8 },
    ]);
    expect(w).toEqual([{ start: 1, end: 2.5, depth: 8 }, { start: 10, end: 11, depth: 8 }]);
  });
});

describe("music", () => {
  it("keeps one continuous voice across same-mood cues (dry director)", () => {
    const f = flattenTimeline(TL);
    const dir = new MusicDirector(null, planMusicSections(f.music, f.duration), (t) => t);
    for (let t = 0; t < 16; t += 0.5) dir.update(t, t + 0.5, t);
    expect(dir.voicesStarted).toBe(2); // playful (p1+p2 merged) + spooky
    expect(dir.notesScheduled).toBeGreaterThan(20);
  });

  it("starting mid-section joins the running voice (one voice, no restart)", () => {
    const f = flattenTimeline(TL);
    const dir = new MusicDirector(null, planMusicSections(f.music, f.duration), (t) => t);
    for (let t = 7; t < 10; t += 0.25) dir.update(t, t + 0.25, t);
    expect(dir.voicesStarted).toBe(1);
    expect(dir.activeMoods(8)).toEqual(["playful"]);
  });

  it("timeline growth while playing keeps the same voice (retarget cancels the pending fade-out)", () => {
    const short = flattenTimeline(timeline(TL.segments[0].segment));
    const dir = new MusicDirector(null, planMusicSections(short.music, short.duration), (t) => t);
    for (let t = 0; t < 5.5; t += 0.5) dir.update(t, t + 1.5, t); // window reached the end: fade-out scheduled
    const long = flattenTimeline(TL);
    dir.retarget(planMusicSections(long.music, long.duration), 5.5);
    for (let t = 5.5; t < 8.5; t += 0.5) dir.update(t + 1.5, t + 2, t); // stays before the spooky cue at 11
    expect(dir.voicesStarted).toBe(1);
    expect(dir.activeMoods(8)).toEqual(["playful"]);
  });

  it("engine: play() at the current playhead is a timeline update (counts continue, no reset)", () => {
    const e = make({ lookahead: 1.5 });
    e.play(timeline(TL.segments[0].segment), 0, "en");
    const d = getAudioDebug()!;
    expect(d.scheduled.foley).toBe(2);
    e.play(TL, 0.05, "en");
    expect(d.scheduled.foley).toBe(2);
    expect(d.scheduled.dialogue).toBe(1);
    e.play(TL, 5, "en"); // a jump → real restart
    expect(d.scheduled.dialogue).toBe(0);
    e.stop();
  });

  it("'none' mood is silence", () => {
    const tl = timeline(seg("a", 4, { music: [music(0, "none")] }));
    const f = flattenTimeline(tl);
    const dir = new MusicDirector(null, planMusicSections(f.music, f.duration), (t) => t);
    dir.update(0, 4, 0);
    expect(dir.voicesStarted).toBe(0);
  });

  it("has a tempo/key/feel table for every playable mood", () => {
    for (const m of MUSIC_MOODS) {
      if (m === "none") continue;
      const spec = MOOD_SPECS[m];
      expect(spec.bpm).toBeGreaterThan(40);
      expect(spec.bpm).toBeLessThan(200);
      expect(SCALES[spec.scale].length).toBe(7);
      expect(spec.progression.length).toBeGreaterThan(0);
      expect(barSeconds(spec)).toBeCloseTo((60 / spec.bpm) * spec.beatsPerBar);
    }
    expect(MOOD_SPECS.romantic_waltz.beatsPerBar).toBe(3);
    expect(MOOD_SPECS.chase.bpm).toBeGreaterThan(MOOD_SPECS.calm.bpm);
    expect(MOOD_SPECS.sleepy.bpm).toBeLessThan(MOOD_SPECS.playful.bpm);
    expect(chordTones(MOOD_SPECS.playful, 0)).toEqual([62, 66, 69]); // D major triad
    expect(chordTones(MOOD_SPECS.sad, 0)).toEqual([57, 60, 64]); // A minor triad
  });

  it("composeBar is deterministic, in-bar, and denser at higher intensity", () => {
    for (const m of MUSIC_MOODS) {
      if (m === "none") continue;
      const a = composeBar(m, "medium", 3, 42);
      expect(composeBar(m, "medium", 3, 42)).toEqual(a);
      for (const n of a) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(MOOD_SPECS[m].beatsPerBar);
        expect(n.vel).toBeGreaterThan(0);
        expect(Number.isFinite(n.midi)).toBe(true);
      }
      const soft = [0, 1, 2, 3].reduce((s, b) => s + composeBar(m, "soft", b, 7).length, 0);
      const full = [0, 1, 2, 3].reduce((s, b) => s + composeBar(m, "full", b, 7).length, 0);
      expect(full).toBeGreaterThan(soft);
    }
    expect(composeBar("playful", "full", 0, 1).some((n) => n.inst === "kick")).toBe(true);
    expect(composeBar("sad", "full", 0, 1).some((n) => n.inst === "kick")).toBe(false);
  });

  it("Karplus-Strong buffer: right length, normalized, decaying, deterministic", () => {
    const sr = 44100;
    const buf = karplusStrong(220, sr, 1, { t60: 0.8, seed: 3 });
    expect(buf.length).toBe(sr);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / (b - a));
    };
    expect(rms(0, sr / 10)).toBeGreaterThan(rms(sr * 0.8, sr * 0.9) * 10);
    expect(karplusStrong(220, sr, 1, { t60: 0.8, seed: 3 })).toEqual(buf);
    // periodic at ~sr/f samples
    const n = Math.round(sr / 220);
    let corr = 0, norm = 0;
    for (let i = 1000; i < 3000; i++) { corr += buf[i] * buf[i + n]; norm += buf[i] * buf[i]; }
    expect(corr / norm).toBeGreaterThan(0.8);
    expect(karplusStrong(0, sr, 0.1).every((v) => v === 0)).toBe(true);
  });
});

describe("voices, vocals and spatialization", () => {
  it("picks Google voices first, then exact language, then same base language", () => {
    const voices = [
      { name: "Microsoft Irina", lang: "ru-RU" },
      { name: "Google русский", lang: "ru-RU" },
      { name: "Samantha", lang: "en-US" },
      { name: "Daniel", lang: "en_GB" },
      { name: "Google UK English Female", lang: "en-GB" },
    ];
    expect(pickVoice(voices, "ru-RU")?.name).toBe("Google русский");
    expect(pickVoice(voices, "en-US")?.name).toBe("Samantha");
    expect(pickVoice(voices.slice(3), "en-US")?.name).toBe("Google UK English Female");
    expect(pickVoice([], "en-US")).toBeNull();
  });

  it("Masha interjections come from the bible; Bear has synthesized vocals for every emote", () => {
    expect(interjection("masha", "giggle", "ru")).toBe("Хи-хи!");
    expect(interjection("bear", "giggle", "en")).toBeNull();
    for (const e of ["grunt", "sigh", "hum", "chuckle", "snore", "huff", "growl_soft", "roar_soft", "yawn", "laugh", "gasp", "sneeze", "hmph"] as const) {
      expect(BEAR_VOCALS[e]?.length).toBeGreaterThan(0);
    }
    expect(vocalFor("bear", "giggle")).not.toBeNull(); // alias → chuckle
    expect(vocalFor("masha", "wheee")!.syl[0].f0[0]).toBeGreaterThan(300); // high child voice
    expect(vocalFor("bear", "none")).toBeNull();
  });

  it("pans by the camera's right vector and attenuates with distance", () => {
    const cam = { pos: [0, 2, 10] as [number, number, number], look: [0, 1, 0] as [number, number, number], fov: 40 };
    const right = spatialize(cam, [5, 0, 5]);
    const left = spatialize(cam, [-5, 0, 5]);
    const centre = spatialize(cam, [0, 0, 6]);
    const far = spatialize(cam, [0, 0, -20]);
    expect(right.pan).toBeGreaterThan(0.3);
    expect(left.pan).toBeLessThan(-0.3);
    expect(Math.abs(centre.pan)).toBeLessThan(0.01);
    expect(centre.gain).toBeCloseTo(1);
    expect(far.gain).toBeLessThan(0.25);
  });
});
