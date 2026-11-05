import { describe, expect, it } from "vitest";
import { BeatScriptSchema, SegmentSchema, VERBS, WorldStateSchema, type BeatScript } from "../../src/shared/schema";
import { GRAMMAR } from "../../src/shared/grammar";
import { initialWorldState, worldStateDigest } from "../../src/compiler/worldState";
import { costUsd } from "../../src/shared/pricing";

const sample: BeatScript = {
  summary: "Masha wakes Bear.",
  time_of_day: null,
  mood: "playful",
  music: { mood: "playful", intensity: "soft", change: "start" },
  ambience: ["birds_day"],
  beats: [
    { actor: "bear", verb: "sleep", target: "hammock", item: null, line: null, emote: "snore", sfx: null, emotion: "sleepy", with_previous: false, delay_s: 0, shot: "auto" },
    { actor: "masha", verb: "tiptoe_to", target: "hammock", item: null, line: "Bear! Wake up!", emote: null, sfx: null, emotion: "mischievous", with_previous: false, delay_s: 0, shot: "auto" },
  ],
  rule_hits: [],
};

describe("schema", () => {
  it("BeatScript round-trips through JSON", () => {
    const back = BeatScriptSchema.parse(JSON.parse(JSON.stringify(sample)));
    expect(back).toEqual(sample);
  });
  it("rejects unknown verbs and missing fields", () => {
    expect(BeatScriptSchema.safeParse({ ...sample, beats: [{ ...sample.beats[0], verb: "teleport" }] }).success).toBe(false);
    const { mood: _m, ...noMood } = sample;
    expect(BeatScriptSchema.safeParse(noMood).success).toBe(false);
  });
  it("initial world state is valid and digest is stable", () => {
    const ws = initialWorldState();
    expect(WorldStateSchema.parse(ws)).toEqual(ws);
    expect(worldStateDigest(ws)).toBe(worldStateDigest(initialWorldState()));
  });
  it("grammar covers every verb", () => {
    for (const v of VERBS) expect(GRAMMAR[v]?.id).toBe(v);
  });
  it("Segment schema accepts an empty segment", () => {
    const ws = initialWorldState();
    const seg = { paragraphId: "p1", version: 1, duration: 0, startState: ws, endState: ws, actorClips: { masha: [], bear: [] }, dialogue: [], emotes: [], foley: [], camera: [], sfx: [], music: [], ambience: [], ducking: [], lighting: [], fx: [] };
    expect(SegmentSchema.safeParse(seg).success).toBe(true);
  });
  it("cost math", () => {
    expect(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeCloseTo(4);
    expect(costUsd("claude-opus-5-5", { input_tokens: 0, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 })).toBeCloseTo(20.2);
    expect(costUsd("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeCloseTo(0.6);
    expect(costUsd("unknown", null)).toBe(0);
  });
});
