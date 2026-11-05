import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/compile";
import { compileEpisode } from "../../src/compiler/episode";
import { EMPTY_CARRY, DUCK_DEPTH_DB } from "../../src/compiler/audioCues";
import { initialWorldState } from "../../src/compiler/worldState";
import { parseParagraph } from "../../src/director/offline/parser";
import { DEFAULT_REMIX, type Beat, type BeatScript, type WorldState } from "../../src/shared/schema";
import type { CompileOptions } from "../../src/compiler/types";

const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({ summary: "t", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null, beats, rule_hits: [], ...extra });
const OPTS = (o: Partial<CompileOptions> = {}): CompileOptions => ({ paragraphId: "p", version: 1, lang: "en", remix: DEFAULT_REMIX, isFirst: true, carry: EMPTY_CARRY, ...o });
const at = (x: number, z: number, who: "masha" | "bear" = "masha"): WorldState => {
  const ws = initialWorldState();
  ws.actors[who].pos = [x, z];
  ws.actors[who].mark = null;
  return ws;
};

describe("audio cues", () => {
  it("footstep count is proportional to distance walked", () => {
    const steps = (x: number) => {
      const ws = at(x, 3);
      const s = compile(BS([B({ actor: "masha", verb: "walk_to", target: "bench" })]), ws, OPTS()).segment;
      return s.foley.filter((f) => f.actor === "masha" && f.id === "footstep").length;
    };
    // bench stands at (2, 3): walk 4 m vs 8 m
    const n4 = steps(-2);
    const n8 = steps(-6);
    expect(n4).toBeGreaterThan(5);
    expect(n8 / n4).toBeGreaterThan(1.7);
    expect(n8 / n4).toBeLessThan(2.3);
  });

  it("surface switches to wood on the porch and the pier", () => {
    const s1 = compile(BS([B({ actor: "masha", verb: "walk_to", target: "porch" })]), initialWorldState(), OPTS()).segment;
    const m1 = s1.foley.filter((f) => f.actor === "masha" && f.id === "footstep");
    expect(m1[0].surface).toBe("grass");
    expect(m1[m1.length - 1].surface).toBe("wood");
    const s2 = compile(BS([B({ actor: "masha", verb: "walk_to", target: "pier" })]), initialWorldState(), OPTS()).segment;
    const m2 = s2.foley.filter((f) => f.actor === "masha" && f.id === "footstep");
    expect(m2[m2.length - 1].surface).toBe("wood");
    expect(m2.some((f) => f.surface === "grass")).toBe(true);
  });

  it("Bear's steps are heavy (lower) and louder, with ground thumps", () => {
    const s = compile(BS([B({ actor: "bear", verb: "walk_to", target: "garden" }), B({ actor: "masha", verb: "walk_to", target: "swing", with_previous: true })]), initialWorldState(), OPTS()).segment;
    const bear = s.foley.filter((f) => f.actor === "bear");
    const masha = s.foley.filter((f) => f.actor === "masha" && f.id === "footstep");
    expect(bear.some((f) => f.id === "footstep_heavy")).toBe(true);
    expect(bear.some((f) => f.id === "ground_thump")).toBe(true);
    expect(bear.some((f) => f.id === "footstep")).toBe(false);
    const g = (xs: { gain: number }[]) => xs.reduce((a, f) => a + f.gain, 0) / xs.length;
    expect(g(bear.filter((f) => f.id === "footstep_heavy"))).toBeGreaterThan(g(masha));
    for (const f of s.foley) expect(f.pan).toBeGreaterThanOrEqual(-1), expect(f.pan).toBeLessThanOrEqual(1);
  });

  it("effort vocals on jump and fall; grammar foley on landing and body fall", () => {
    const s = compile(BS([B({ actor: "masha", verb: "jump" }), B({ actor: "bear", verb: "fall_down" })]), initialWorldState(), OPTS()).segment;
    expect(s.emotes.some((e) => e.actor === "masha" && e.emote === "wheee")).toBe(true);
    expect(s.emotes.some((e) => e.actor === "bear")).toBe(true);
    expect(s.foley.some((f) => f.id === "landing_thud" && f.actor === "masha")).toBe(true);
    expect(s.foley.some((f) => f.id === "body_fall" && f.actor === "bear")).toBe(true);
  });

  it("music continues across same-mood paragraphs and crossfades on change; stop", () => {
    const m = (mood: BeatScript["music"]["mood"], change: BeatScript["music"]["change"]) => BS([B({ actor: "masha", verb: "jump" })], { music: { mood, intensity: "soft", change } });
    const ep = compileEpisode([
      { paragraphId: "1", version: 1, beatScript: m("playful", "start"), remix: DEFAULT_REMIX },
      { paragraphId: "2", version: 1, beatScript: m("playful", "continue"), remix: DEFAULT_REMIX },
      { paragraphId: "3", version: 1, beatScript: m("calm", "continue"), remix: DEFAULT_REMIX },
      { paragraphId: "4", version: 1, beatScript: m("calm", "stop"), remix: DEFAULT_REMIX },
    ], "en");
    const [s1, s2, s3, s4] = ep.results.map((r) => r.segment);
    expect(s1.music).toHaveLength(1);
    expect(s1.music[0].mood).toBe("playful");
    expect(s2.music).toEqual([]);
    expect(s3.music).toHaveLength(1);
    expect(s3.music[0]).toMatchObject({ start: 0, mood: "calm" });
    expect(s3.music[0].fade).toBeGreaterThanOrEqual(1.5);
    expect(s4.music).toEqual([{ start: 0, mood: "none", intensity: "soft", fade: 1.5 }]);
    expect(ep.results[3].carry.music).toBeNull();
  });

  it("ambience: defaults by time of day, null carries, [] is silence", () => {
    const a = (amb: BeatScript["ambience"], tod: BeatScript["time_of_day"] = null) => BS([B({ actor: "masha", verb: "jump" })], { ambience: amb, time_of_day: tod });
    const ep = compileEpisode([
      { paragraphId: "1", version: 1, beatScript: a(null), remix: DEFAULT_REMIX },
      { paragraphId: "2", version: 1, beatScript: a(null), remix: DEFAULT_REMIX },
      { paragraphId: "3", version: 1, beatScript: a(["rain"]), remix: DEFAULT_REMIX },
      { paragraphId: "4", version: 1, beatScript: a([]), remix: DEFAULT_REMIX },
    ], "en");
    const s = ep.results.map((r) => r.segment);
    expect(s[0].ambience).toEqual([{ start: 0, layers: ["birds_day", "forest_wind"], fade: 0.5 }]);
    expect(s[1].ambience).toEqual([]);
    expect(s[2].ambience[0].layers).toEqual(["rain"]);
    expect(s[3].ambience[0].layers).toEqual([]);
    const night = compileEpisode([
      { paragraphId: "1", version: 1, beatScript: a(null), remix: DEFAULT_REMIX },
      { paragraphId: "2", version: 1, beatScript: a(null, "night"), remix: DEFAULT_REMIX },
    ], "en");
    expect(night.results[1].segment.ambience[0].layers).toEqual(["night_crickets"]);
  });

  it("ducking windows match dialogue; quoted words verbatim; Bear quote → no dialogue + one emote", () => {
    const ws = initialWorldState();
    const bs = parseParagraph('Masha shouts, "Bear, wake up! The pancakes are ready!" Then she says "Hurry up, sleepyhead!"', "en", ws);
    const s = compile(bs, ws, OPTS()).segment;
    expect(s.dialogue.map((d) => d.text)).toEqual(["Bear, wake up! The pancakes are ready!", "Hurry up, sleepyhead!"]);
    expect(s.ducking).toEqual(s.dialogue.map((d) => ({ start: d.start, dur: d.dur, depth: DUCK_DEPTH_DB })));

    for (const [text, lang] of [['Bear says "thank you" to Masha.', "en"], ["Медведь говорит: «Спасибо, Маша!»", "ru"]] as const) {
      const b2 = parseParagraph(text, lang, ws);
      const r = compile(b2, ws, OPTS({ lang }));
      expect(r.segment.dialogue.filter((d) => d.actor === "bear")).toEqual([]);
      expect(r.segment.emotes.filter((e) => e.actor === "bear")).toHaveLength(1);
      expect(r.beatScript.rule_hits.some((h) => h.rule === "bear_silent")).toBe(true);
    }
  });

  it("event sfx from beats and inferred splashes", () => {
    const s = compile(BS([B({ actor: "masha", verb: "take", target: "ball", item: "ball" }), B({ actor: "masha", verb: "throw", item: "ball", target: "pond_shore", sfx: "boing" })]), initialWorldState(), OPTS()).segment;
    expect(s.sfx.map((x) => x.id).sort()).toEqual(["boing", "splash"]);
  });
});
