// Canon-but-absent characters (Hare, Dog, Goat, Rosie…): whole-word forms only, compounds excluded, the child's
// words never rewritten (review findings #2, #3, #9, #14).
import { describe, expect, it } from "vitest";
import { canonAbsentTarget, validateBeatScript } from "../../src/compiler/validate";
import { initialWorldState } from "../../src/compiler/worldState";
import { parseParagraph, substituteCanonAbsent } from "../../src/director/offline/parser";
import { canonAbsentFor, findCanonAbsent } from "../../src/shared/rules";
import type { Beat, BeatScript } from "../../src/shared/schema";

const names = (t: string) => findCanonAbsent(t).map((m) => m.def.name.en);
const B = (o: Partial<Beat> & Pick<Beat, "actor" | "verb">): Beat => ({ target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto", ...o });
const BS = (beats: Beat[]): BeatScript => ({ summary: "t", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null, beats, rule_hits: [] });

describe("canon-absent matching: no false positives", () => {
  const negatives = [
    "Маша поёт песенку.", "Маша играет в песочнице.", "Маша надевает пёструю юбку.", "Маша дарит розочки Мишке.",
    "У кепки козырёк.", "Мишка катит тачку по пандусу.", "Маша взбивает белки от яиц.", "Яичные белки в миске.",
    "Masha eats a hot dog.", "Bear holds a toy bunny.", "Masha wears bunny slippers.", "Masha looks down the rabbit hole.",
    "Bear eats goat cheese.", "Masha paints the dog house.", "A dogwood tree blooms.", "Masha has a guinea pig plush.",
    "Маша обнимает плюшевого зайчика.", "Маша ест шоколадного зайца.", "Мишка ест хот-дог.", "Маша видит морскую свинку.",
    "Мишка любит белков.", "Masha eats a hot-dog.",
  ];
  for (const t of negatives) it(`no character in: ${t}`, () => {
    expect(names(t)).toEqual([]);
    expect(parseParagraph(t, /[а-я]/i.test(t) ? "ru" : "en", initialWorldState()).rule_hits.filter((h) => h.rule === "cast_only")).toEqual([]);
  });

  it("single-word lookup is exact (no prefixes)", () => {
    for (const w of ["песенку", "песочнице", "пёструю", "розочки", "козырёк", "пандусу", "белков", "белками", "dogwood", "hotdog", "harem", "tigers'"]) expect(canonAbsentFor(w)).toBeNull();
  });
});

describe("canon-absent matching: real mentions (EN + RU)", () => {
  const positives: [string, string][] = [
    ["The dog barks.", "The Dog"], ["Two dogs run.", "The Dog"], ["A puppy plays.", "The Dog"], ["The hare hops.", "The Hare"],
    ["The bunnies dance.", "The Hare"], ["The goat eats grass.", "The Goat"], ["The panda sits.", "The Panda"], ["A tiger roars.", "The Tiger"],
    ["Dasha visits.", "Dasha"], ["Rosie the pig comes.", "Rosie the pig"], ["The squirrels jump.", "The Squirrels"], ["A penguin slides.", "The Penguin"],
    ["Пёс лает.", "The Dog"], ["Маша гладит пса.", "The Dog"], ["Маша бежит за собакой.", "The Dog"], ["Собаки лают.", "The Dog"],
    ["Заяц прыгает.", "The Hare"], ["Маша зовёт зайца.", "The Hare"], ["Маша обнимает зайку.", "The Hare"], ["Зайчик спит.", "The Hare"],
    ["Коза бодается.", "The Goat"], ["Маша доит козу.", "The Goat"], ["Козочка скачет.", "The Goat"], ["Панда ест.", "The Panda"],
    ["Маша видит панду.", "The Panda"], ["Тигр рычит.", "The Tiger"], ["Маша боится тигра.", "The Tiger"], ["Белка грызёт орех.", "The Squirrels"],
    ["Маша кормит белочку.", "The Squirrels"], ["Белки прыгают.", "The Squirrels"], ["Пришла Даша.", "Dasha"], ["Хрюша хрюкает.", "Rosie the pig"],
    ["Пингвин катается.", "The Penguin"], ["Маша играет с собакой от радости.", "The Dog"],
  ];
  for (const [t, who] of positives) it(`${who} in: ${t}`, () => expect(names(t)).toEqual([who]));

  it("Розочка is the pig only next to «свинка»/«хрюша»; a multi-word name is one mention", () => {
    expect(names("Розочка приходит.")).toEqual([]);
    expect(names("Розочка-свинка приходит.")).toEqual(["Rosie the pig"]);
    expect(findCanonAbsent("Свинка Розочка пришла.")[0].text).toBe("Свинка Розочка");
    expect(substituteCanonAbsent("Розочка-свинка приходит.", "ru", "ru").text).toBe("Маша приходит.");
    expect(substituteCanonAbsent("Rosie the pig comes to play.", "en", "en").text).toBe("Masha comes to play.");
    expect(substituteCanonAbsent("The hare and the dog run.", "en", "en").text).toBe("Masha and Masha run.");
  });

  it("a real mention in a paragraph is played by the stand-in with the honest note", () => {
    const bs = parseParagraph("Маша бежит за собакой.", "ru", initialWorldState());
    expect(bs.rule_hits.find((h) => h.rule === "cast_only")).toMatchObject({ original: "собакой", replacement: "Маша" });
    const en = parseParagraph("The dog jumps.", "en", initialWorldState());
    expect(en.rule_hits[0]).toMatchObject({ rule: "cast_only", original: "dog" });
    expect(en.beats[0]).toMatchObject({ actor: "masha", verb: "jump" });
  });
});

describe("the child's words stay verbatim (spec §4.2)", () => {
  it("RU dash dialogue: the line keeps «Зайка»", () => {
    const bs = parseParagraph("— Зайка, иди сюда! — кричит Маша.", "ru", initialWorldState());
    expect(bs.beats.find((b) => b.line)?.line).toBe("Зайка, иди сюда!");
    expect(bs.rule_hits.filter((h) => h.rule === "cast_only")).toEqual([]);
  });
  it("RU screenplay line keeps «Песенку»", () => {
    const bs = parseParagraph("МАША: Песенку хочу!", "ru", initialWorldState());
    expect(bs.beats[0].line).toBe("Песенку хочу!");
  });
  it("EN screenplay line keeps 'bunny'", () => {
    const bs = parseParagraph("MASHA: Hello bunny!", "en", initialWorldState());
    expect(bs.beats[0].line).toBe("Hello bunny!");
    expect(bs.rule_hits).toEqual([]);
  });
  it("quotes keep the word while the narration around them is substituted", () => {
    const bs = parseParagraph('The hare waves. Masha shouts, "Hi, bunny!"', "en", initialWorldState());
    expect(bs.beats.some((b) => b.line === "Hi, bunny!")).toBe(true);
    expect(bs.rule_hits.filter((h) => h.rule === "cast_only").map((h) => h.original)).toEqual(["hare"]);
    const ru = parseParagraph("— Собачка, ко мне! — зовёт Маша, и пёс бежит.", "ru", initialWorldState());
    expect(ru.beats.some((b) => b.line === "Собачка, ко мне!")).toBe(true);
    expect(ru.rule_hits.map((h) => h.original)).toEqual(["пёс"]);
  });
});

describe("validator targets: whole target or head noun only (#14)", () => {
  it("object compounds are not characters", () => {
    for (const t of ["hot_dog", "dog_house", "goat_cheese", "rabbit_hole", "toy_bunny", "bunny_slippers", "guinea_pig", "hot dog"]) expect(canonAbsentTarget(t)).toBeNull();
    const v = validateBeatScript(BS([B({ actor: "masha", verb: "look_at", target: "goat_cheese" })]), initialWorldState(), "en");
    expect(v.hits.some((h) => /isn't in this prototype/.test(h.kid_message))).toBe(false);
  });
  it("real character targets still substitute", () => {
    for (const [t, sub] of [["hare", "masha"], ["the_dog", "masha"], ["big_tiger", "bear"], ["Rosie the pig", "masha"], ["зайчик", "masha"], ["panda", "bear"]] as const) {
      expect(canonAbsentTarget(t)?.sub).toBe(sub);
    }
    const v = validateBeatScript(BS([B({ actor: "masha", verb: "hug", target: "the_dog" })]), initialWorldState(), "en");
    expect(v.beatScript.beats[0].target).toBe("bear");
    expect(v.hits[0].kid_message).toBe("The Dog isn't in this prototype yet — Masha played the part!");
  });
});

describe("Wolves pronoun binding and RU plural verbs (#9)", () => {
  it("RU: «Волки берут мёд» — a Wolf takes the honey (like EN)", () => {
    const ru = parseParagraph("Волки берут мёд.", "ru", initialWorldState());
    expect(ru.beats[0]).toMatchObject({ actor: "wolf_a", verb: "take", item: "honey_pot" });
    const en = parseParagraph("The wolves take the honey.", "en", initialWorldState());
    expect(en.beats[0]).toMatchObject({ actor: "wolf_a", verb: "take", item: "honey_pot" });
    expect(parseParagraph("Волки едят мёд.", "ru", initialWorldState()).beats[0]).toMatchObject({ actor: "wolf_a", verb: "eat", item: "honey_pot" });
  });
  const cases: [string, "en" | "ru"][] = [
    ["Волки убегают. Маша и Мишка смеются. Они танцуют.", "ru"],
    ["Волки убегают. Маша и Мишка улыбаются. Они танцуют.", "ru"], // middle sentence not fully parsed
    ["The wolves run away. Masha and Bear laugh. They dance.", "en"],
    ["The wolves run away. Masha and Bear grin. They dance.", "en"],
  ];
  for (const [t, lang] of cases) it(`"they" after another subject is not the Wolves: ${t}`, () => {
    const bs = parseParagraph(t, lang, initialWorldState());
    const dancers = bs.beats.filter((b) => b.verb === "dance").map((b) => b.actor).sort();
    expect(dancers).toEqual(["bear", "masha"]);
  });
  it("'they' right after the Wolves still means the Wolves", () => {
    const bs = parseParagraph("Волки крадутся к улью. Они танцуют.", "ru", initialWorldState());
    expect(bs.beats.filter((b) => b.verb === "dance").map((b) => b.actor)).toEqual(["wolf_a", "wolf_b"]);
  });
});
