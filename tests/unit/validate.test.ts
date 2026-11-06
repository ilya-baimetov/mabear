import { describe, expect, it } from "vitest";
import { validateBeatScript } from "../../src/compiler/validate";
import { initialWorldState } from "../../src/compiler/worldState";
import { RULES } from "../../src/shared/rules";
import type { Beat, BeatScript } from "../../src/shared/schema";

const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[], extra: Partial<BeatScript> = {}): BeatScript => ({
  summary: "Masha wakes Bear.", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "start" }, ambience: ["birds_day"], beats, rule_hits: [], ...extra,
});
const ws = initialWorldState();

describe("validator (hard rules + structural clamps)", () => {
  it("a clean script yields 0 errors and 0 hits, unchanged", () => {
    const bs = BS([
      B({ actor: "bear", verb: "sleep", target: "hammock", emote: "snore", emotion: "sleepy" }),
      B({ actor: "masha", verb: "tiptoe_to", target: "hammock", emotion: "mischievous" }),
      B({ actor: "masha", verb: "wave", target: "bear", line: "Bear! Wake up!", emotion: "excited" }),
      B({ actor: "masha", verb: "take", target: "jam_jar", item: "jam_jar" }),
      B({ actor: "masha", verb: "give", target: "bear", item: "jam_jar" }),
    ]);
    const r = validateBeatScript(bs, ws, "en");
    expect(r.errors).toEqual([]);
    expect(r.hits).toEqual([]);
    expect(r.beatScript).toEqual(bs);
  });

  for (const lang of ["en", "ru"] as const) {
    it(`bear_silent (${lang}): a Bear line is removed, replaced by an emote, hit recorded`, () => {
      const line = lang === "en" ? "Thank you, Masha!" : "Спасибо, Маша!";
      const r = validateBeatScript(BS([B({ actor: "bear", verb: "nod", line, emotion: "neutral" })]), ws, lang);
      const b = r.beatScript.beats[0];
      expect(b.line).toBeNull();
      expect(["grunt", "hum"]).toContain(b.emote);
      expect(r.hits).toHaveLength(1);
      expect(r.hits[0]).toMatchObject({ rule: "bear_silent", original: line, kid_message: RULES.bear_silent.kidMessage[lang] });
      expect(r.beatScript.rule_hits).toHaveLength(1);
      expect(r.errors).toEqual([]);
    });

    it(`no_weapons (${lang}): weapon / violence words in lines and the summary are replaced`, () => {
      const line = lang === "en" ? "I will hit you with a sword!" : "У меня есть меч и нож!";
      const summary = lang === "en" ? "Masha finds a gun." : "Маша нашла пистолет.";
      const r = validateBeatScript(BS([B({ actor: "masha", verb: "wave", line })], { summary }), ws, lang);
      const out = r.beatScript.beats[0].line!;
      expect(out).not.toMatch(/sword|hit|меч|нож/i);
      expect(r.beatScript.summary).not.toMatch(/gun|пистолет/i);
      expect(r.hits.filter((h) => h.rule === "no_weapons").length).toBeGreaterThanOrEqual(2);
      expect(r.hits[0].kid_message).toBe(RULES[r.hits[0].rule].kidMessage[lang]);
    });

    it(`cast_only (${lang}): unknown or foreign targets map to the cast or are dropped`, () => {
      const r = validateBeatScript(BS([
        B({ actor: "masha", verb: "hug", target: "Elsa" }),
        B({ actor: "masha", verb: "walk_to", target: "spaceship" }),
        B({ actor: "bear", verb: "point_at", target: "rabbit" }),
        B({ actor: "masha", verb: "wave", line: lang === "en" ? "Hi Pikachu!" : "Привет, Пикачу!" }),
      ]), ws, lang);
      const [hug, walk, point, wave] = r.beatScript.beats;
      expect(hug.target).toBe("bear");
      expect(walk.target).toBe("clearing");
      expect(point.target).toBe("masha");
      expect(wave.line).not.toMatch(/pikachu|пикачу/i);
      expect(r.hits.filter((h) => h.rule === "cast_only").length).toBeGreaterThanOrEqual(3);
    });
  }

  it("structural clamps: beats 1..14, delay 0..6, line ≤ 120, summary ≤ 140", () => {
    const many = Array.from({ length: 20 }, () => B({ actor: "masha", verb: "jump", delay_s: 9 }));
    many[0].line = "la ".repeat(80);
    const r = validateBeatScript(BS(many, { summary: "x".repeat(300) }), ws, "en");
    expect(r.beatScript.beats).toHaveLength(14);
    expect(r.beatScript.beats.every((b) => b.delay_s >= 0 && b.delay_s <= 6)).toBe(true);
    expect(r.beatScript.beats[0].line!.length).toBeLessThanOrEqual(120);
    expect(r.beatScript.summary.length).toBeLessThanOrEqual(140);
    expect(r.errors.length).toBeGreaterThan(0);
    const empty = validateBeatScript(BS([]), ws, "en");
    expect(empty.beatScript.beats).toHaveLength(1);
  });

  it("verb actors, target kinds, items and emotes are enforced", () => {
    const r = validateBeatScript(BS([
      B({ actor: "bear", verb: "swing" }),
      B({ actor: "masha", verb: "carry", target: "bear" }),
      B({ actor: "masha", verb: "hug", target: "garden" }),
      B({ actor: "masha", verb: "sit", target: "bear" }),
      B({ actor: "masha", verb: "jump", target: "porch" }),
      B({ actor: "bear", verb: "laugh", emote: "giggle" }),
      B({ actor: "masha", verb: "eat" }),
      B({ actor: "masha", verb: "dance", item: "ball" }),
    ]), ws, "en");
    const [swing, carry, hug, sit, jump, laugh, eat, dance] = r.beatScript.beats;
    expect(swing.verb).toBe("look_at");
    expect(swing.target).toBe("swing");
    expect(carry).toMatchObject({ actor: "bear", verb: "carry", target: "masha" });
    expect(hug.target).toBe("bear");
    expect(sit.target).toBe(ws.actors.bear.mark); // where Bear is
    expect(jump.target).toBeNull();
    expect(laugh.emote).toBe("chuckle");
    expect(eat.item).toBe("jam_jar");
    expect(dance.item).toBeNull();
  });

  it("is idempotent", () => {
    const messy = BS([B({ actor: "bear", verb: "wave", line: "Hello", target: "Shrek" }), B({ actor: "masha", verb: "walk_to" })], { summary: "Masha kills a zombie with a knife" });
    const once = validateBeatScript(messy, ws, "en");
    const twice = validateBeatScript(once.beatScript, ws, "en");
    expect(twice.errors).toEqual([]);
    expect(twice.hits).toEqual([]);
    expect(twice.beatScript).toEqual(once.beatScript);
  });
});
