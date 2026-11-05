import { describe, expect, it } from "vitest";
import { RULES, detectLang, preFilter } from "../../src/shared/rules";

describe("pre-filter (canon + safety word lists)", () => {
  it("detects the language by script", () => {
    expect(detectLang("Masha runs")).toBe("en");
    expect(detectLang("Маша бежит")).toBe("ru");
  });

  const cases: { lang: "en" | "ru"; text: string; rule: string; gone: RegExp }[] = [
    { lang: "en", text: "Masha takes a knife.", rule: "no_weapons", gone: /knife/i },
    { lang: "en", text: "Bear punches the tree and shoots.", rule: "no_weapons", gone: /punch|shoot/i },
    { lang: "en", text: "There is blood and a zombie.", rule: "no_scary", gone: /blood|zombie/i },
    { lang: "en", text: "Masha says Bear is stupid. Shut up!", rule: "kind_language", gone: /stupid|shut up/i },
    { lang: "en", text: "Elsa comes to play.", rule: "cast_only", gone: /elsa/i },
    { lang: "en", text: "They drink Coca-Cola and play Lego.", rule: "no_brands", gone: /coca|lego/i },
    { lang: "en", text: "My name is Tim, call 555-123-4567 or tim@mail.com", rule: "no_personal_data", gone: /tim|555|@/i },
    { lang: "ru", text: "Маша взяла нож и топор.", rule: "no_weapons", gone: /нож|топор/i },
    { lang: "ru", text: "Медведь застрелил и убил комара.", rule: "no_weapons", gone: /застрел|убил/i },
    { lang: "ru", text: "Там кровь и зомби.", rule: "no_scary", gone: /кров|зомби/i },
    { lang: "ru", text: "Маша сказала: дурак, заткнись!", rule: "kind_language", gone: /дурак|заткнись/i },
    { lang: "ru", text: "Пришёл Шрек.", rule: "cast_only", gone: /шрек/i },
    { lang: "ru", text: "Маша ест нутеллу из Макдональдса.", rule: "no_brands", gone: /нутелл|макдональдс/i },
    { lang: "ru", text: "Меня зовут Петя, мой телефон +7 999 123 45 67", rule: "no_personal_data", gone: /петя|999/i },
  ];
  for (const c of cases) {
    it(`${c.lang} ${c.rule}: ${c.text}`, () => {
      const r = preFilter(c.text, "auto");
      expect(r.text).not.toMatch(c.gone);
      const hit = r.hits.find((h) => h.rule === c.rule);
      expect(hit).toBeDefined();
      expect(hit!.kid_message).toBe(RULES[hit!.rule as keyof typeof RULES].kidMessage[c.lang]);
    });
  }

  it("keeps harmless words that merely start like a blocked stem", () => {
    for (const t of ["Masha is on a diet.", "Маша мечтает о кровати.", "Bear's skill is great.", "Маленькая ножка."]) {
      const r = preFilter(t, "auto");
      expect(r.hits).toEqual([]);
      expect(r.text).toBe(t);
    }
  });

  it("uses the UI language for kid messages and keeps clean text untouched", () => {
    const r = preFilter("Masha has a sword", "en", "ru");
    expect(r.text).toBe("Masha has a stick");
    expect(r.hits[0].kid_message).toBe(RULES.no_weapons.kidMessage.ru);
    expect(preFilter("Masha runs to the garden.", "auto")).toEqual({ text: "Masha runs to the garden.", hits: [] });
  });
});
