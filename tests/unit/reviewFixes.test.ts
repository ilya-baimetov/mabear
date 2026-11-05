// Regression tests for the independent review findings (B3, B7, B8).
import { describe, expect, it } from "vitest";
import { preFilter } from "../../src/shared/rules";

describe("review fixes: safety word lists", () => {
  it("B3: the brand 'лего' does not match ordinary words starting with 'лег'", () => {
    for (const s of ["Маша легла спать.", "Мишка лег на траву.", "Это было легко!"]) {
      const r = preFilter(s, "ru");
      expect(r.hits, s).toHaveLength(0);
      expect(r.text).toBe(s);
    }
    expect(preFilter("Маша строит из лего.", "ru").hits.map((h) => h.rule)).toContain("no_brands");
  });
  it("B7: RU violence stems убью / убить / бьёт are softened", () => {
    for (const s of ["Я тебя убью!", "Он хочет убить муху.", "Маша бьёт Мишку.", "Маша бьет Мишку."]) {
      expect(preFilter(s, "ru").hits.length, s).toBeGreaterThan(0);
    }
  });
  it("B8: safe prefixes are left alone", () => {
    for (const s of ["Маша дурачится.", "Мишка ударился о дверь.", "Маша берёт ножницы.", "Masha is fooling around."]) {
      expect(preFilter(s, "auto").hits, s).toHaveLength(0);
    }
  });
});
