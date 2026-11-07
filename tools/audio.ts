// Dev bench for the audio engine: audition every sound, and an offline self-test (renders each sound into an
// OfflineAudioContext and reports peak / RMS / NaN) exposed as window.__audioSelfTest for Playwright.
import { createAudioEngine, getAudioDebug } from "../src/engine/audio";
import { AmbienceDirector } from "../src/engine/audio/ambience";
import { renderFoley } from "../src/engine/audio/foley";
import { MusicDirector } from "../src/engine/audio/music";
import { flattenTimeline, planAmbienceSpans, planMusicSections } from "../src/engine/audio/scheduler";
import { SFX_LENGTH, renderSfx } from "../src/engine/audio/sfx";
import type { Out } from "../src/engine/audio/synth";
import { renderVocal } from "../src/engine/audio/vocals";
import {
  AMBIENCES, EMOTES, FOLEY_IDS, MUSIC_MOODS, SFX_IDS, SURFACES,
  type Ambience, type MusicMood, type Segment, type Timeline, type WorldState,
} from "../src/shared/schema";

type Render = (o: Out) => void;
interface Stat { name: string; peak: number; rms: number; nan: boolean }

const WS: WorldState = {
  timeOfDay: "day",
  actors: {
    masha: { pos: [0, 0], facing: 0, mark: "clearing", holding: null, posture: "stand" },
    bear: { pos: [-6, -2.6], facing: 0, mark: "porch", holding: null, posture: "stand" },
  },
  props: {} as WorldState["props"],
};
function seg(duration: number, over: Partial<Segment>): Segment {
  return {
    paragraphId: "x", version: 1, duration, startState: WS, endState: WS, actorClips: { masha: [], bear: [] },
    dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [], ambience: [], ducking: [], lighting: [], fx: [], ...over,
  };
}
const tl = (s: Segment): Timeline => ({ segments: [{ offset: 0, segment: s }], duration: s.duration });

async function offline(name: string, seconds: number, render: Render): Promise<Stat> {
  const ctx = new OfflineAudioContext(2, Math.ceil(48000 * seconds), 48000);
  const o: Out = { ctx, dest: ctx.destination, track: () => {} };
  render(o);
  const buf = await ctx.startRendering();
  let peak = 0, sum = 0, nan = false;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) nan = true;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
    }
  }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (buf.length * buf.numberOfChannels)).toFixed(4), nan };
}

function musicRender(mood: MusicMood, intensity: "soft" | "medium" | "full", secs: number): Render {
  return (o) => {
    const f = flattenTimeline(tl(seg(secs, { music: [{ start: 0, mood, intensity, fade: 0.1 }] })));
    const d = new MusicDirector(o, planMusicSections(f.music, secs + 10), (t) => t);
    d.update(0, secs, 0);
  };
}
function ambRender(layer: Ambience, secs: number): Render {
  return (o) => {
    const f = flattenTimeline(tl(seg(secs, { ambience: [{ start: 0, layers: [layer], fade: 0.2 }] })));
    const d = new AmbienceDirector(o, planAmbienceSpans(f.ambience, secs + 10), (t) => t);
    d.update(0, secs, 0);
  };
}

async function selfTest(): Promise<{ stats: Stat[]; engine: unknown }> {
  const stats: Stat[] = [];
  for (const id of SFX_IDS) stats.push(await offline(`sfx:${id}`, SFX_LENGTH[id] + 0.3, (o) => renderSfx(o, id, 0.05, 1)));
  for (const id of FOLEY_IDS) {
    for (const s of id.startsWith("footstep") ? SURFACES : (["grass"] as const)) {
      stats.push(await offline(`foley:${id}:${s}`, 2.4, (o) => renderFoley(o, id, s, 0.05, 1, false)));
    }
  }
  stats.push(await offline("foley:footstep:bear-heavy", 0.6, (o) => renderFoley(o, "footstep", "grass", 0.05, 1, true)));
  for (const e of EMOTES) {
    if (e === "none") continue;
    for (const a of ["masha", "bear"] as const) stats.push(await offline(`vocal:${a}:${e}`, 2.3, (o) => void renderVocal(o, a, e, 0.05, 1)));
  }
  for (const m of MUSIC_MOODS) {
    if (m === "none") continue;
    for (const i of ["soft", "medium", "full"] as const) stats.push(await offline(`music:${m}:${i}`, 4, musicRender(m, i, 4)));
  }
  for (const a of AMBIENCES) stats.push(await offline(`amb:${a}`, 4, ambRender(a, 4)));

  // live engine smoke test
  const engine = createAudioEngine();
  await engine.unlock();
  const live = tl(seg(6, {
    dialogue: [{ start: 0.3, dur: 1.4, actor: "masha", text: "Bear! It's raining!", lang: "en", visemes: [] }],
    emotes: [{ start: 0.5, dur: 0.6, actor: "bear", emote: "sigh" }, { start: 1.0, dur: 0.5, actor: "masha", emote: "giggle" }],
    foley: [0.2, 0.6, 1.0, 1.4].map((start) => ({ start, actor: "masha" as const, id: "footstep" as const, surface: "water" as const, gain: 1, pan: 0 })),
    sfx: [{ start: 0.8, id: "thunder_clap", gain: 1, pan: -0.3 }],
    music: [{ start: 0, mood: "spooky", intensity: "medium", fade: 1 }],
    ambience: [{ start: 0, layers: ["rain"], fade: 1 }],
    ducking: [{ start: 0.3, dur: 1.4, depth: 8 }],
  }));
  engine.play(live, 0, "en");
  engine.updateListener({ pos: [0, 2, 10], look: [0, 1, 0], fov: 40 }, { masha: [3, 0, 0], bear: [-4, 0, -2] });
  await new Promise((r) => setTimeout(r, 1500));
  const snap = JSON.parse(JSON.stringify(getAudioDebug()));
  engine.stop();
  engine.dispose();
  return { stats, engine: snap };
}

// ---------- audition UI ----------
const engine = createAudioEngine();
const log = (s: string): void => {
  const el = document.getElementById("log");
  if (el) el.textContent = s + "\n" + el.textContent;
};
function group(title: string, items: string[], onClick: (x: string) => Timeline): void {
  const g = document.getElementById("groups")!;
  const h = document.createElement("h2");
  h.textContent = title;
  g.appendChild(h);
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = it;
    b.onclick = async () => {
      await engine.unlock();
      engine.stop();
      const timeline = onClick(it);
      await engine.prepare?.(timeline, "en", 0);
      engine.play(timeline, 0, "en");
      log(`${title}: ${it} → ${JSON.stringify(getAudioDebug()?.scheduled)}`);
    };
    g.appendChild(b);
  }
}
group("SFX", [...SFX_IDS], (id) => tl(seg(4, { sfx: [{ start: 0.05, id: id as (typeof SFX_IDS)[number], gain: 1, pan: 0 }] })));
group("Foley (steps: grass, wood, water, dirt; then Bear)", [...FOLEY_IDS], (id) => tl(seg(4, {
  foley: id.startsWith("footstep")
    ? [...SURFACES.map((s, k) => ({ start: 0.05 + k * 0.45, actor: "masha" as const, id: "footstep" as const, surface: s, gain: 1, pan: 0 })),
       ...SURFACES.map((s, k) => ({ start: 2 + k * 0.5, actor: "bear" as const, id: "footstep_heavy" as const, surface: s, gain: 1, pan: 0 }))]
    : [{ start: 0.05, actor: "masha" as const, id: id as (typeof FOLEY_IDS)[number], surface: "grass" as const, gain: 1, pan: 0 }],
})));
group("Masha emotes", EMOTES.filter((e) => e !== "none"), (e) => tl(seg(3, { emotes: [{ start: 0.05, dur: 1, actor: "masha", emote: e as (typeof EMOTES)[number] }] })));
group("Bear emotes", EMOTES.filter((e) => e !== "none"), (e) => tl(seg(3, { emotes: [{ start: 0.05, dur: 1, actor: "bear", emote: e as (typeof EMOTES)[number] }] })));
group("Music (soft → medium → full, 8 s each)", MUSIC_MOODS.filter((m) => m !== "none"), (m) => tl(seg(24, {
  music: (["soft", "medium", "full"] as const).map((intensity, k) => ({ start: k * 8, mood: m as MusicMood, intensity, fade: 1 })),
})));
group("Ambience (12 s)", [...AMBIENCES], (a) => tl(seg(12, { ambience: [{ start: 0, layers: [a as Ambience], fade: 1 }] })));
group("Dialogue", ["en", "ru"], (l) => tl(seg(4, {
  dialogue: [{ start: 0.1, dur: 2, actor: "masha", text: l === "en" ? "Bear! Let's make pancakes!" : "Мишка! Давай печь блины!", lang: l as "en" | "ru", visemes: [] }],
})));
document.getElementById("stop")!.onclick = () => engine.stop();
document.getElementById("selftest")!.onclick = async () => {
  const r = await selfTest();
  log(r.stats.map((s) => `${s.name.padEnd(32)} peak ${s.peak} rms ${s.rms}${s.nan ? " NaN!" : ""}`).join("\n"));
};
(window as unknown as { __audioSelfTest: typeof selfTest }).__audioSelfTest = selfTest;
(window as unknown as { __bench: unknown }).__bench = { createAudioEngine, getAudioDebug, engine };
