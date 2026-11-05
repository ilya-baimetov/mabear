import { describe, expect, it } from "vitest";
import { compile } from "../../src/compiler/compile";
import { compileEpisode } from "../../src/compiler/episode";
import { EMPTY_CARRY } from "../../src/compiler/audioCues";
import { initialWorldState } from "../../src/compiler/worldState";
import { DEFAULT_REMIX, SegmentSchema, type ActorId, type Beat, type BeatScript, type Segment } from "../../src/shared/schema";
import type { CompileOptions, EpisodeParagraphInput } from "../../src/compiler/types";

const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({
  summary: "test", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null, beats, rule_hits: [], ...extra,
});
const OPTS = (o: Partial<CompileOptions> = {}): CompileOptions => ({ paragraphId: "p", version: 1, lang: "en", remix: DEFAULT_REMIX, isFirst: true, carry: EMPTY_CARRY, ...o });
const P = (id: string, bs: BeatScript): EpisodeParagraphInput => ({ paragraphId: id, version: 1, beatScript: bs, remix: DEFAULT_REMIX });

const NAP = BS([
  B({ actor: "bear", verb: "sleep", target: "hammock", emote: "snore", emotion: "sleepy" }),
  B({ actor: "masha", verb: "tiptoe_to", target: "hammock", emotion: "mischievous" }),
  B({ actor: "masha", verb: "wave", line: "Bear! Wake up! It's morning!", emotion: "excited" }),
  B({ actor: "bear", verb: "surprised", emote: "grunt", emotion: "surprised", with_previous: true }),
  B({ actor: "bear", verb: "fall_down", emotion: "surprised" }),
  B({ actor: "bear", verb: "facepalm", emote: "sigh", emotion: "annoyed" }),
  B({ actor: "masha", verb: "laugh", emotion: "happy", with_previous: true }),
]);

function mainClips(seg: Segment, a: ActorId) {
  return seg.actorClips[a].filter((c) => !c.params.ambient);
}

describe("compiler", () => {
  it("is deterministic and schema-valid", () => {
    const a = compile(NAP, initialWorldState(), OPTS());
    const b = compile(NAP, initialWorldState(), OPTS());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(() => SegmentSchema.parse(a.segment)).not.toThrow();
    expect(a.errors).toEqual([]);
  });

  it("covers [0, duration] contiguously for every actor (ambient life)", () => {
    const { segment: s } = compile(NAP, initialWorldState(), OPTS());
    for (const a of ["masha", "bear"] as const) {
      const clips = s.actorClips[a];
      expect(clips[0].start).toBe(0);
      for (let i = 1; i < clips.length; i++) expect(clips[i].start).toBeCloseTo(clips[i - 1].start + clips[i - 1].dur, 6);
      const last = clips[clips.length - 1];
      expect(last.start + last.dur).toBeCloseTo(s.duration, 6);
    }
    // Masha has no beat at the start: ambient idle that looks at the action
    const first = s.actorClips.masha[0];
    expect(first.params.ambient).toBe(true);
    expect(first.params.lookAt).toBeDefined();
    // ends ~0.6 s after the last clip of a beat
    const lastEnd = Math.max(...(["masha", "bear"] as const).flatMap((a) => mainClips(s, a).map((c) => c.start + c.dur)));
    expect(s.duration).toBeCloseTo(lastEnd + 0.6, 2);
  });

  it("with_previous anchors to the previous beat's start; own beats never overlap", () => {
    const bs = BS([
      B({ actor: "bear", verb: "walk_to", target: "garden" }),
      B({ actor: "masha", verb: "jump", with_previous: true, delay_s: 2 }),
      B({ actor: "masha", verb: "spin", with_previous: true }),
    ]);
    const { segment: s } = compile(bs, initialWorldState(), OPTS());
    const walk = mainClips(s, "bear").find((c) => c.verb === "walk_to")!;
    const jump = mainClips(s, "masha").find((c) => c.verb === "jump")!;
    const spin = mainClips(s, "masha").find((c) => c.verb === "spin")!;
    expect(walk.start).toBe(0);
    expect(jump.start).toBeCloseTo(2, 3);
    // spin anchors to jump's start but Masha's track is busy → queued after the jump
    expect(spin.start).toBeCloseTo(jump.start + jump.dur, 3);
    for (const a of ["masha", "bear"] as const) {
      const cs = s.actorClips[a];
      for (let i = 1; i < cs.length; i++) expect(cs[i].start + 1e-6).toBeGreaterThanOrEqual(cs[i - 1].start + cs[i - 1].dur - 1e-3);
    }
  });

  it("a beat with a line lasts at least as long as the line; locomotion uses path length / speed", () => {
    const line = "Bear, Bear, look at me, I can spin around and around and around!";
    const bs = BS([B({ actor: "masha", verb: "nod", line }), B({ actor: "masha", verb: "walk_to", target: "porch" })]);
    const { segment: s } = compile(bs, initialWorldState(), OPTS());
    const d = s.dialogue[0];
    expect(d.text).toBe(line);
    expect(d.dur).toBeCloseTo(Math.max(1.2, line.length / 13) + 0.3, 3);
    const walk = mainClips(s, "masha").find((c) => c.verb === "walk_to")!;
    expect(walk.start + 1e-6).toBeGreaterThanOrEqual(d.start + d.dur - 1e-3);
    const path = walk.params.path!;
    expect(path.length).toBeGreaterThanOrEqual(2);
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    expect(len).toBeGreaterThan(4);
    expect(walk.dur).toBeCloseTo(len / 1.2, 1);
  });

  it("auto-walks to the prop and inserts `take` before eating (repair listed)", () => {
    const bs = BS([B({ actor: "masha", verb: "eat", item: "jam_jar" })]);
    const r = compile(bs, initialWorldState(), OPTS());
    expect(r.repairs.some((x) => x.includes("take"))).toBe(true);
    expect(r.beatScript.beats.map((b) => b.verb)).toEqual(["take", "eat"]);
    const verbs = mainClips(r.segment, "masha").map((c) => c.verb);
    expect(verbs.indexOf("take")).toBeLessThan(verbs.indexOf("eat"));
    expect(r.segment.endState.actors.masha.holding).toBe("jam_jar");
    expect(r.segment.endState.props.jam_jar.at).toBe("masha");
  });

  it("walks to the home mark before cooking; cooking makes pancakes appear; fishing makes a fish appear", () => {
    const bs = BS([B({ actor: "bear", verb: "cook" }), B({ actor: "bear", verb: "fish" })]);
    const r = compile(bs, initialWorldState(), OPTS());
    const verbs = mainClips(r.segment, "bear").map((c) => c.verb);
    expect(verbs[0]).toBe("walk_to");
    expect(verbs).toContain("cook");
    expect(r.segment.endState.props.pancakes.at).toBe("table");
    expect(r.segment.endState.actors.bear.holding).toBe("fish");
    expect(r.segment.endState.actors.bear.mark).toBe("pier");
    expect(r.segment.fx.some((f) => f.id === "splash")).toBe(true);
  });

  it("world state continues across paragraphs (positions, held items, posture)", () => {
    const p1 = BS([B({ actor: "masha", verb: "take", target: "ball", item: "ball" }), B({ actor: "masha", verb: "run_to", target: "swing" })]);
    const p2 = BS([B({ actor: "bear", verb: "sleep", target: "hammock" }), B({ actor: "masha", verb: "throw", item: "ball", target: "pond_shore" })]);
    const p3 = BS([B({ actor: "bear", verb: "carry", target: "masha" }), B({ actor: "bear", verb: "walk_to", target: "porch" })]);
    const { results, timeline } = compileEpisode([P("a", p1), P("b", p2), P("c", p3)], "en");
    for (let i = 1; i < results.length; i++) expect(results[i].segment.startState).toEqual(results[i - 1].segment.endState);
    const e1 = results[0].segment.endState;
    expect(e1.actors.masha.holding).toBe("ball");
    expect(e1.actors.masha.mark).toBe("swing");
    const e2 = results[1].segment.endState;
    expect(e2.actors.bear.posture).toBe("sleep");
    expect(e2.actors.masha.holding).toBe(null);
    expect(e2.props.ball.at).toBe("pond_shore");
    expect(results[1].segment.fx.some((f) => f.id === "splash")).toBe(true);
    const e3 = results[2].segment.endState;
    expect(e3.actors.bear.posture).toBe("stand"); // woke up first
    expect(e3.actors.masha.posture).toBe("carried");
    expect(e3.actors.masha.pos).toEqual(e3.actors.bear.pos);
    expect(e3.actors.bear.mark).toBe("porch");
    expect(timeline.segments[2].offset).toBeCloseTo(results[0].segment.duration + results[1].segment.duration, 6);
    expect(timeline.duration).toBeCloseTo(results.reduce((s, r) => s + r.segment.duration, 0), 6);
  });

  it("incremental recompile: editing ¶2 changes only ¶2 and downstream (no director call needed)", () => {
    const p1 = BS([B({ actor: "masha", verb: "take", target: "jam_jar", item: "jam_jar" })]);
    const p2 = BS([B({ actor: "masha", verb: "walk_to", target: "porch" })]);
    const p2b = BS([B({ actor: "masha", verb: "give", item: "jam_jar", target: "bear" })]);
    const p3 = BS([B({ actor: "masha", verb: "eat", item: "jam_jar" })]);
    const before = compileEpisode([P("1", p1), P("2", p2), P("3", p3)], "en");
    const after = compileEpisode([P("1", p1), P("2", p2b), P("3", p3)], "en");
    expect(after.results[0]).toEqual(before.results[0]);
    expect(after.results[1].segment).not.toEqual(before.results[1].segment);
    // ¶3 recompiled against the new start state: Bear now holds the jam → not trivially repairable
    expect(after.results[2].segment.startState).toEqual(after.results[1].segment.endState);
    expect(before.results[2].errors).toEqual([]);
    expect(after.results[2].errors.length).toBeGreaterThan(0);
  });

  it("downstream auto-repair inserts take when the item is no longer held", () => {
    const p1a = BS([B({ actor: "masha", verb: "take", target: "jam_jar", item: "jam_jar" })]);
    const p1b = BS([B({ actor: "masha", verb: "jump" })]);
    const p2 = BS([B({ actor: "masha", verb: "eat", item: "jam_jar" })]);
    const a = compileEpisode([P("1", p1a), P("2", p2)], "en");
    const b = compileEpisode([P("1", p1b), P("2", p2)], "en");
    expect(a.results[1].repairs.filter((r) => r.includes("take"))).toEqual([]);
    expect(b.results[1].repairs.some((r) => r.includes("take"))).toBe(true);
  });

  it("offstage characters re-enter; exit takes them offstage", () => {
    const p1 = BS([B({ actor: "bear", verb: "exit" }), B({ actor: "masha", verb: "wave", target: "bear" })]);
    const p2 = BS([B({ actor: "bear", verb: "wave", target: "masha" })]);
    const { results } = compileEpisode([P("1", p1), P("2", p2)], "en");
    expect(results[0].segment.endState.actors.bear.posture).toBe("offstage");
    expect(results[1].beatScript.beats[0].verb).toBe("enter");
    expect(results[1].segment.endState.actors.bear.posture).toBe("stand");
  });

  it("fx cues: flour sneeze, zzz, hearts, dust, tears, anger, sparkles", () => {
    const bs = BS([
      B({ actor: "masha", verb: "take", target: "flour_bag", item: "flour_bag" }),
      B({ actor: "masha", verb: "sneeze" }),
      B({ actor: "bear", verb: "fall_down" }),
      B({ actor: "masha", verb: "hug", target: "bear" }),
      B({ actor: "masha", verb: "cry" }),
      B({ actor: "bear", verb: "angry_stomp" }),
      B({ actor: "masha", verb: "spin", sfx: "magic_chime" }),
      B({ actor: "bear", verb: "sleep", target: "hammock" }),
    ]);
    const { segment: s } = compile(bs, initialWorldState(), OPTS());
    const ids = new Set(s.fx.map((f) => f.id));
    for (const id of ["flour_cloud", "zzz", "hearts", "dust", "tears", "anger_puff", "sparkles"] as const) expect(ids.has(id)).toBe(true);
  });

  it("ambient life reacts to loud beats", () => {
    const bs = BS([B({ actor: "bear", verb: "walk_to", target: "clearing" }), B({ actor: "bear", verb: "fall_down" })]);
    const { segment: s } = compile(bs, initialWorldState(), OPTS());
    const reaction = s.actorClips.masha.find((c) => c.params.ambient && c.verb === "laugh");
    expect(reaction).toBeDefined();
    expect(s.emotes.some((e) => e.actor === "masha" && e.emote === "giggle")).toBe(true);
  });

  it("remix: camera seed changes only the camera; time of day and music overrides apply", () => {
    const base = compile(NAP, initialWorldState(), OPTS());
    const seeded = compile(NAP, initialWorldState(), OPTS({ remix: { cameraSeed: 7, timeOfDay: null, musicMood: null } }));
    expect(seeded.segment.actorClips).toEqual(base.segment.actorClips);
    expect(seeded.segment.camera).not.toEqual(base.segment.camera);
    const night = compile(NAP, initialWorldState(), OPTS({ remix: { cameraSeed: 0, timeOfDay: "night", musicMood: "romantic_waltz" } }));
    expect(night.segment.lighting[0]).toMatchObject({ start: 0, timeOfDay: "night" });
    expect(night.segment.endState.timeOfDay).toBe("night");
    expect(night.segment.music[0].mood).toBe("romantic_waltz");
    expect(night.segment.ambience[0].layers).toEqual(["night_crickets"]);
  });

  it("time_of_day null keeps lighting unchanged (no cue after the first paragraph)", () => {
    const r = compile(NAP, initialWorldState(), OPTS({ isFirst: false }));
    expect(r.segment.lighting).toEqual([]);
    const r2 = compile({ ...NAP, time_of_day: "sunset" }, initialWorldState(), OPTS({ isFirst: false }));
    expect(r2.segment.lighting).toEqual([{ start: 0, timeOfDay: "sunset", transition: 2.5 }]);
  });
});

describe("compiler — doors and carrying", () => {
  it("walking to the door as the last beat goes inside (offstage); knocking does not", () => {
    const inside = compile(BS([B({ actor: "bear", verb: "walk_to", target: "door" })]), initialWorldState(), OPTS());
    expect(inside.segment.endState.actors.bear.posture).toBe("offstage");
    const knock = compile(BS([B({ actor: "masha", verb: "walk_to", target: "door", sfx: "knock" })]), initialWorldState(), OPTS());
    expect(knock.segment.endState.actors.masha.posture).toBe("stand");
    expect(knock.segment.sfx.map((x) => x.id)).toEqual(["knock"]);
  });

  it("a carried Masha rides along and hops down before acting on the ground", () => {
    const r = compile(BS([
      B({ actor: "bear", verb: "carry", target: "masha" }),
      B({ actor: "bear", verb: "walk_to", target: "garden" }),
      B({ actor: "masha", verb: "take", target: "carrot", item: "carrot" }),
    ]), initialWorldState(), OPTS());
    const s = r.segment;
    const walk = s.actorClips.bear.find((c) => c.verb === "walk_to" && c.params.to && Math.hypot(c.params.to[0] - 5, c.params.to[1] + 5) < 3)!;
    const riding = s.actorClips.masha.filter((c) => c.params.posture === "carried" && c.start >= walk.start - 1e-6 && c.start < walk.start + walk.dur);
    expect(riding.length).toBeGreaterThan(0);
    expect(r.repairs.some((x) => x.includes("hops down"))).toBe(true);
    expect(s.endState.actors.masha.posture).toBe("stand");
    expect(s.endState.actors.masha.holding).toBe("carrot");
  });
});

describe("compiler — robustness (seeded fuzz over the whole grammar)", () => {
  it("never throws; output is schema-valid, contiguous, with shots of 1.2–6 s", async () => {
    const { VERBS, MARK_IDS, PROP_IDS, EMOTES, SFX_IDS, EMOTIONS, SHOTS } = await import("../../src/shared/schema");
    const { mulberry32 } = await import("../../src/compiler/camera");
    const rnd = mulberry32(42);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const targets = [...MARK_IDS, ...PROP_IDS, "masha", "bear", "elsa", "spaceship", null] as const;
    let ws = initialWorldState();
    for (let n = 0; n < 60; n++) {
      const beats: Beat[] = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => B({
        actor: pick(["masha", "bear"] as const), verb: pick(VERBS), target: pick(targets), item: rnd() < 0.4 ? pick(PROP_IDS) : null,
        line: rnd() < 0.25 ? "Hello there, how are you today?" : null, emote: rnd() < 0.3 ? pick(EMOTES) : null, sfx: rnd() < 0.15 ? pick(SFX_IDS) : null,
        emotion: pick(EMOTIONS), with_previous: rnd() < 0.3, delay_s: rnd() < 0.2 ? rnd() * 8 : 0, shot: rnd() < 0.15 ? pick(SHOTS) : "auto",
      }));
      const r = compile(BS(beats, { time_of_day: rnd() < 0.2 ? "night" : null }), ws, OPTS({ isFirst: n === 0, remix: { cameraSeed: n, timeOfDay: null, musicMood: null } }));
      const s = r.segment;
      expect(() => SegmentSchema.parse(s)).not.toThrow();
      for (const a of ["masha", "bear"] as const) {
        const cs = s.actorClips[a];
        expect(cs[0].start).toBe(0);
        for (let i = 1; i < cs.length; i++) expect(Math.abs(cs[i].start - (cs[i - 1].start + cs[i - 1].dur))).toBeLessThan(1e-6);
        expect(Math.abs(cs[cs.length - 1].start + cs[cs.length - 1].dur - s.duration)).toBeLessThan(1e-6);
        for (const c of cs) expect(c.dur).toBeGreaterThan(0);
      }
      for (const c of s.camera) {
        if (s.duration >= 1.2) expect(c.dur).toBeGreaterThanOrEqual(1.2 - 1e-6);
        expect(c.dur).toBeLessThanOrEqual(6 + 1e-6);
      }
      expect(Number.isFinite(s.duration)).toBe(true);
      ws = s.endState;
    }
  });
});

describe("compiler — golden fixtures", () => {
  it("every fixture paragraph validates with 0 errors and compiles without errors", async () => {
    const { FIXTURES } = await import("../../src/director/fixtures/index");
    const { validateBeatScript } = await import("../../src/compiler/validate");
    expect(FIXTURES.length).toBeGreaterThan(0);
    for (const ep of FIXTURES) {
      const { results } = compileEpisode(ep.paragraphs.map((p, i) => P(`${ep.id}-${i}`, p.beatScript)), ep.lang);
      results.forEach((r, i) => {
        const v = validateBeatScript(ep.paragraphs[i].beatScript, r.segment.startState, ep.lang);
        expect(v.errors, `${ep.id}/${ep.lang} ¶${i + 1}`).toEqual([]);
        expect(r.errors, `${ep.id}/${ep.lang} ¶${i + 1}`).toEqual([]);
        expect(r.segment.dialogue.length + r.segment.emotes.length).toBeGreaterThan(0);
        expect(r.segment.foley.length).toBeGreaterThan(0);
      });
    }
  });
});
