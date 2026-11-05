import { describe, expect, it } from "vitest";
import { parseParagraph } from "../../src/director/offline/parser";
import { validateBeatScript } from "../../src/compiler/validate";
import { compile } from "../../src/compiler/compile";
import { EMPTY_CARRY } from "../../src/compiler/audioCues";
import { initialWorldState } from "../../src/compiler/worldState";
import { DEFAULT_REMIX, MAX_BEATS, type BeatScript, type Lang } from "../../src/shared/schema";

type Exp = {
  text: string;
  beats?: [string, string, string?, string?][]; // [actor, verb, target?, item?] — a subsequence of the beats
  line?: [string, string]; // [actor, verbatim line]
  noBearLine?: boolean;
  music?: [string, string]; // [mood, change]
  ambience?: string[];
  sfx?: string;
  tod?: string;
  parallel?: boolean;
};

const EN: Exp[] = [
  { text: "Masha runs to the garden.", beats: [["masha", "run_to", "garden"]] },
  { text: "Bear walks to the pier and goes fishing.", beats: [["bear", "walk_to", "pier"], ["bear", "fish"]] },
  { text: "Masha picks a carrot and eats it.", beats: [["masha", "take", "carrot", "carrot"], ["masha", "eat", undefined, "carrot"]] },
  { text: 'Masha shouts, "Bear, wake up!"', line: ["masha", "Bear, wake up!"] },
  { text: "MASHA: Where are my pancakes?", line: ["masha", "Where are my pancakes?"] },
  { text: 'Bear says "Thank you" to Masha.', noBearLine: true },
  { text: "Bear says thank you to Masha.", noBearLine: true },
  { text: "Masha says hello to Bear.", line: ["masha", "Hello"] },
  { text: "It starts to rain.", ambience: ["rain"] },
  { text: "Spooky music plays.", music: ["spooky", "start"] },
  { text: "Masha jumps. The music stops.", music: ["none", "stop"], beats: [["masha", "jump"]] },
  { text: "A thunderstorm begins and the door slams.", ambience: ["thunderstorm"], sfx: "door_slam" },
  { text: "Bear falls asleep in the hammock.", beats: [["bear", "sleep", "hammock"]] },
  { text: "Masha tiptoes to Bear and hugs him.", beats: [["masha", "tiptoe_to", "bear"], ["masha", "hug", "bear"]] },
  { text: "Masha throws the ball to Bear.", beats: [["masha", "throw", "bear", "ball"]] },
  { text: "Bear cooks pancakes while Masha dances.", beats: [["bear", "cook"], ["masha", "dance"]], parallel: true },
  { text: "Masha gives Bear the jam.", beats: [["masha", "give", "bear", "jam_jar"]] },
  { text: "Bear lifts Masha onto his shoulders.", beats: [["bear", "carry", "masha"]] },
  { text: "Masha hides behind the tree.", beats: [["masha", "hide", "big_tree"]] },
  { text: "Cheerful music plays and birds are singing.", music: ["playful", "start"], ambience: ["birds_day"] },
  { text: "At night Masha yawns.", tod: "night", beats: [["masha", "yawn_stretch"]] },
  { text: "Masha sneezes. Bear facepalms.", beats: [["masha", "sneeze"], ["bear", "facepalm"]] },
  { text: "Masha and Bear dance together.", beats: [["masha", "dance"], ["bear", "dance"]], parallel: true },
];

const RU: Exp[] = [
  { text: "Маша бежит в огород.", beats: [["masha", "run_to", "garden"]] },
  { text: "Медведь идёт на причал и ловит рыбу.", beats: [["bear", "walk_to", "pier"], ["bear", "fish"]] },
  { text: "Маша срывает морковку и ест её.", beats: [["masha", "take", "carrot", "carrot"], ["masha", "eat", undefined, "carrot"]] },
  { text: "Маша кричит: «Мишка, вставай!»", line: ["masha", "Мишка, вставай!"] },
  { text: "— Где мои блины? — спрашивает Маша.", line: ["masha", "Где мои блины?"] },
  { text: "Медведь говорит: «Спасибо, Маша!»", noBearLine: true },
  { text: "Медведь говорит Маше спасибо.", noBearLine: true },
  { text: "Начинается дождь.", ambience: ["rain"] },
  { text: "Играет весёлая музыка.", music: ["playful", "start"] },
  { text: "Маша прыгает. Музыка стихла.", music: ["none", "stop"], beats: [["masha", "jump"]] },
  { text: "Хлопнула дверь.", sfx: "door_slam" },
  { text: "Гремит гром!", sfx: "thunder_clap" },
  { text: "Медведь засыпает в гамаке.", beats: [["bear", "sleep", "hammock"]] },
  { text: "Маша подкрадывается к Мишке и обнимает его.", beats: [["masha", "tiptoe_to", "bear"], ["masha", "hug", "bear"]] },
  { text: "Маша бросает мяч Мишке.", beats: [["masha", "throw", "bear", "ball"]] },
  { text: "Мишка печёт блины, а Маша танцует.", beats: [["bear", "cook"], ["masha", "dance"]] },
  { text: "Маша дарит Мишке варенье.", beats: [["masha", "give", "bear", "jam_jar"]] },
  { text: "Мишка сажает Машу на плечи.", beats: [["bear", "carry", "masha"]] },
  { text: "Маша прячется за кустом.", beats: [["masha", "hide", "bush"]] },
  { text: "Звучит спокойная музыка, поют птицы.", music: ["calm", "start"], ambience: ["birds_day"] },
  { text: "Наступила ночь, стрекочут сверчки. Маша зевает.", tod: "night", ambience: ["night_crickets"], beats: [["masha", "yawn_stretch"]] },
  { text: "Маша чихает, а Мишка вздыхает.", beats: [["masha", "sneeze"], ["bear", "sigh"]] },
];

function check(e: Exp, lang: Lang) {
  const ws = initialWorldState();
  const bs: BeatScript = parseParagraph(e.text, lang, ws);
  const v = validateBeatScript(bs, ws, lang);
  expect(v.errors).toEqual([]);
  expect(bs.beats.length).toBeGreaterThanOrEqual(2);
  expect(bs.beats.length).toBeLessThanOrEqual(MAX_BEATS);
  expect(bs.summary.length).toBeGreaterThan(0);
  expect(bs.summary.length).toBeLessThanOrEqual(140);
  if (e.beats) {
    let from = 0;
    for (const [actor, verb, target, item] of e.beats) {
      const i = bs.beats.findIndex((b, k) => k >= from && b.actor === actor && b.verb === verb && (target === undefined || b.target === target) && (item === undefined || b.item === item));
      expect(i, `${e.text}: expected ${actor} ${verb} ${target ?? ""} ${item ?? ""} in ${JSON.stringify(bs.beats.map((b) => [b.actor, b.verb, b.target, b.item]))}`).toBeGreaterThanOrEqual(0);
      from = i + 1;
    }
  }
  if (e.line) expect(bs.beats.some((b) => b.actor === e.line![0] && b.line === e.line![1])).toBe(true);
  if (e.noBearLine) {
    expect(bs.beats.every((b) => b.actor !== "bear" || b.line === null)).toBe(true);
    expect(bs.rule_hits.some((h) => h.rule === "bear_silent")).toBe(true);
    expect(bs.beats.some((b) => b.actor === "bear" && b.emote !== null)).toBe(true);
  }
  if (e.music) expect([bs.music.mood, bs.music.change]).toEqual(e.music);
  if (e.ambience) for (const a of e.ambience) expect(bs.ambience).toContain(a);
  if (e.sfx) expect(bs.beats.some((b) => b.sfx === e.sfx)).toBe(true);
  if (e.tod) expect(bs.time_of_day).toBe(e.tod);
  if (e.parallel) expect(bs.beats.some((b, i) => i > 0 && b.with_previous)).toBe(true);
  // the parsed script always compiles cleanly
  const r = compile(bs, ws, { paragraphId: "p", version: 1, lang, remix: DEFAULT_REMIX, isFirst: true, carry: EMPTY_CARRY });
  expect(r.errors).toEqual([]);
  return bs;
}

describe("offline parser — EN", () => {
  for (const e of EN) it(e.text, () => { check(e, "en"); });
});
describe("offline parser — RU", () => {
  for (const e of RU) it(e.text, () => { check(e, "ru"); });
});

describe("offline parser — paragraphs", () => {
  it("≥ 1 beat per sentence, deterministic, safety pre-filter applied", () => {
    const text = "Masha wakes up. She runs to the porch. A loud crash! Bear takes a knife and sighs.";
    const a = parseParagraph(text, "en", initialWorldState());
    expect(parseParagraph(text, "en", initialWorldState())).toEqual(a);
    expect(a.beats.length).toBeGreaterThanOrEqual(4);
    expect(a.beats.some((b) => b.sfx === "crash")).toBe(true);
    expect(a.rule_hits.some((h) => h.rule === "no_weapons")).toBe(true);
    expect(a.summary).not.toMatch(/knife/);
  });

  it("summary is written in the UI language", () => {
    const bs = parseParagraph("Маша бежит в огород.", "en", initialWorldState());
    expect(bs.summary).toMatch(/Masha/);
    expect(bs.summary).not.toMatch(/[а-я]/i);
    const ru = parseParagraph("Masha runs to the garden.", "ru", initialWorldState());
    expect(ru.summary).toMatch(/Маша/);
  });

  it("continues the previous music mood when no music is written", () => {
    const bs = parseParagraph("Masha jumps.", "en", initialWorldState(), { prevMusicMood: "calm" });
    expect(bs.music).toEqual({ mood: "calm", intensity: "soft", change: "continue" });
  });

  it("long quotes are trimmed to 120 characters", () => {
    const long = "la ".repeat(70).trim();
    const bs = parseParagraph(`Masha sings "${long}"`, "en", initialWorldState());
    const line = bs.beats.find((b) => b.line)!.line!;
    expect(line.length).toBeLessThanOrEqual(120);
    expect(long.startsWith(line.replace(/…$/, ""))).toBe(true);
  });
});
