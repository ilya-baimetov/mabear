import { describe, expect, it } from "vitest";
import { dialogueDuration, makeDialogueCue, visemeTokens, visemesFor, VISEME_RATE } from "../../src/compiler/dialogue";

describe("dialogue + visemes", () => {
  it("duration = max(1.2, chars/13) + 0.3", () => {
    expect(dialogueDuration("Hi!")).toBeCloseTo(1.5, 6);
    const long = "Bear! Wake up! It's morning and the pancakes are waiting!";
    expect(dialogueDuration(long)).toBeCloseTo(long.length / 13 + 0.3, 6);
  });

  it("maps EN vowels, consonant runs and punctuation", () => {
    expect(visemeTokens("Hello, Bear!", "en")).toEqual(["open_small", "e", "open_small", "o", "rest", "open_small", "e", "open_wide", "open_small", "rest"]);
    expect(visemeTokens("you", "en")).toEqual(["e", "o", "o"]);
  });

  it("maps RU vowels (а о у э и ы е ё ю я)", () => {
    expect(visemeTokens("Мишка, вставай!", "ru")).toEqual(["open_small", "e", "open_small", "open_wide", "rest", "open_small", "open_wide", "open_small", "open_wide", "open_small", "rest"]);
    expect(visemeTokens("ёжик юла", "ru")).toEqual(["o", "open_small", "e", "open_small", "o", "open_small", "open_wide"]);
  });

  it("timed visemes: monotonic, within the cue, ≤ ~12/s, ending at rest; text kept verbatim", () => {
    const text = "Мишка! Вставай скорее, блины готовы!";
    const cue = makeDialogueCue(2, "masha", text, "ru");
    expect(cue.text).toBe(text);
    const v = cue.visemes;
    for (let i = 1; i < v.length; i++) expect(v[i].t).toBeGreaterThan(v[i - 1].t);
    expect(v[v.length - 1].v).toBe("rest");
    expect(v[v.length - 1].t).toBeLessThanOrEqual(cue.dur);
    expect(v.length - 1).toBeLessThanOrEqual(Math.round((cue.dur - 0.3) * VISEME_RATE));
    expect(visemesFor("", "en")).toEqual([{ t: 0, v: "rest" }]);
  });
});
