import { describe, expect, it } from "vitest";
import { BUILTIN_EXAMPLES, buildSystemPrompt, buildUserMessage, pickFewShots } from "../../src/director/prompt";
import { ACTOR_IDS, BeatScriptSchema, EMOTES, MARK_IDS, PROP_IDS, RULE_IDS, SFX_IDS, VERBS, type DirectRequest } from "../../src/shared/schema";
import { initialWorldState } from "../../src/compiler/worldState";
import { CHARACTERS } from "../../src/shared/bible/characters";
import { validateBeatScript } from "../../src/compiler/validate";
import golden from "../golden/prompts.json";

describe("director system prompt", () => {
  const prompt = buildSystemPrompt();

  it("names every verb id", () => {
    for (const v of VERBS) expect(prompt, v).toContain(`- ${v} [`);
  });

  it("names every mark id", () => {
    for (const m of MARK_IDS) expect(prompt, m).toContain(`- ${m}: `);
  });

  it("names every prop, emote, sfx, rule and actor id", () => {
    for (const id of [...PROP_IDS, ...EMOTES, ...SFX_IDS, ...RULE_IDS, ...ACTOR_IDS]) expect(prompt, id).toContain(id);
  });

  it("includes the character bible and the canon rules", () => {
    expect(prompt).toContain("You are the director of a Masha and the Bear cartoon");
    expect(prompt).toContain(CHARACTERS.masha.personality);
    expect(prompt).toContain(CHARACTERS.bear.personality);
    expect(prompt).toMatch(/NEVER SPEAKS WORDS/);
    expect(prompt).toMatch(/NEVER refuse/);
  });

  it("has no timestamps, dates or per-request ids and is deterministic", () => {
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(prompt).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(buildSystemPrompt()).toBe(prompt);
  });

  it("carries 3–5 few-shot examples covering EN and RU", () => {
    const n = (prompt.match(/### Example \d/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
    expect(prompt).toContain("requested language: en");
    expect(prompt).toContain("requested language: ru");
  });

  it("built-in examples are valid BeatScripts that pass the post-validator with 0 errors", () => {
    for (const ex of Object.values(BUILTIN_EXAMPLES)) {
      expect(BeatScriptSchema.safeParse(ex.beatScript).success).toBe(true);
      expect(validateBeatScript(ex.beatScript, initialWorldState(), ex.lang).errors).toEqual([]);
    }
    expect(pickFewShots([]).length).toBeGreaterThanOrEqual(2);
  });

  it("few-shots cover §8.3.7: EN+RU, dialogue, explicit sound, terse expansion, music continue, a Bear quote", () => {
    const shots = pickFewShots();
    expect(shots.length).toBe(5);
    expect(new Set(shots.map((s) => s.lang))).toEqual(new Set(["en", "ru"]));
    expect(shots.some((s) => s.beatScript.beats.some((b) => b.line) && /["«“]/.test(s.text))).toBe(true);
    expect(shots.some((s) => s.beatScript.ambience !== null && /music|музык|колыбельн/i.test(s.text))).toBe(true);
    expect(shots.some((s) => s.beatScript.music.change === "continue")).toBe(true);
    expect(shots.some((s) => s.text.length < 70 && s.beatScript.beats.length >= 7)).toBe(true);
    expect(shots.some((s) => s.beatScript.rule_hits.some((h) => h.rule === "bear_silent"))).toBe(true);
    expect(shots.every((s) => !s.beatScript.beats.some((b) => b.actor === "bear" && b.line))).toBe(true);
  });

  it("does not contain the golden eval paragraphs", () => {
    for (const g of golden as { paragraph: string }[]) expect(prompt).not.toContain(g.paragraph);
  });
});

describe("director user message", () => {
  const req: DirectRequest = {
    lang: "ru",
    paragraph: "Маша бежит в огород.",
    previous: ["Bear naps.", "Masha wakes him."],
    worldState: initialWorldState(),
    episodeId: "ep-1",
    paragraphId: "p-7",
  };
  const msg = buildUserMessage(req, "Маша бежит в огород.");

  it("carries the language, world state, previous paragraphs and the paragraph", () => {
    expect(msg).toContain("ru — Russian");
    expect(msg).toContain('"masha":{"mark":"clearing"');
    expect(msg).toContain("1. Bear naps.");
    expect(msg).toContain("2. Masha wakes him.");
    expect(msg).toContain("<paragraph>\nМаша бежит в огород.\n</paragraph>");
  });

  it("does not leak ids into the prompt", () => {
    expect(msg).not.toContain("ep-1");
    expect(msg).not.toContain("p-7");
  });
});
