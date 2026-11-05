// Golden-path fixtures (spec §6.6): schema, canon, grammar, continuity and sound coverage.
import { describe, expect, it } from "vitest";
import {
  ACTOR_IDS, BeatScriptSchema, DEFAULT_REMIX, MARK_IDS, MAX_BEATS, MAX_DELAY_S, MAX_LINE_CHARS, MAX_SUMMARY_CHARS, PROP_IDS,
  type ActorId, type Beat, type BeatScript, type FixtureEpisode, type MarkId, type PropId, type WorldState,
} from "../../src/shared/schema";
import { GRAMMAR, LOCOMOTION_VERBS } from "../../src/shared/grammar";
import { CHARACTERS } from "../../src/shared/bible/characters";
import { MARKS } from "../../src/shared/bible/set";
import { PROPS } from "../../src/shared/bible/props";
import { BRANDS, FOREIGN_CHARACTERS, SCARY_WORDS, UNKIND_WORDS, VIOLENCE_WORDS, WEAPON_WORDS, preFilter } from "../../src/shared/rules";
import { cloneWorldState, initialWorldState } from "../../src/compiler/worldState";
import { validateBeatScript } from "../../src/compiler/validate";
import { compileEpisode } from "../../src/compiler/episode";
import { FIXTURES, FIXTURE_IDS, findFixtureParagraph, getFixture } from "../../src/director/fixtures";
import pancakeEn from "../../src/director/fixtures/pancake_morning.en.json";
import pancakeRu from "../../src/director/fixtures/pancake_morning.ru.json";
import napEn from "../../src/director/fixtures/bears_nap.en.json";
import napRu from "../../src/director/fixtures/bears_nap.ru.json";
import fishingEn from "../../src/director/fixtures/fishing_trip.en.json";
import fishingRu from "../../src/director/fixtures/fishing_trip.ru.json";

const RAW: Record<string, unknown> = {
  "pancake_morning.en": pancakeEn, "pancake_morning.ru": pancakeRu,
  "bears_nap.en": napEn, "bears_nap.ru": napRu,
  "fishing_trip.en": fishingEn, "fishing_trip.ru": fishingRu,
};
const TITLES: Record<string, string> = {
  "pancake_morning.en": "Pancake morning", "pancake_morning.ru": "Блинное утро",
  "bears_nap.en": "Bear's nap", "bears_nap.ru": "Мишкин сон",
  "fishing_trip.en": "Fishing trip", "fishing_trip.ru": "На рыбалке",
};
const BEAT_KEYS = ["actor", "verb", "target", "item", "line", "emote", "sfx", "emotion", "with_previous", "delay_s", "shot"].sort();
const SCRIPT_KEYS = ["summary", "time_of_day", "mood", "music", "ambience", "beats", "rule_hits"].sort();

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;
const isMark = (s: string | null): s is MarkId => s !== null && (MARK_IDS as readonly string[]).includes(s);
const isActor = (s: string | null): s is ActorId => s !== null && (ACTOR_IDS as readonly string[]).includes(s);
const isProp = (s: string | null): s is PropId => s !== null && (PROP_IDS as readonly string[]).includes(s);
const key = (e: FixtureEpisode) => `${e.id}.${e.lang}`;
const allBeats = (e: FixtureEpisode): Beat[] => e.paragraphs.flatMap((p) => p.beatScript.beats);

/** Quoted speech in the child's text: "…" (EN) or «…» (RU). */
function quotes(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"|«([^»]+)»/g)].map((m) => (m[1] ?? m[2]).trim());
}

/** Grammar check for one beat; returns problems (empty = valid). */
function grammarProblems(b: Beat): string[] {
  const def = GRAMMAR[b.verb];
  const out: string[] = [];
  if (!def.actors.includes(b.actor)) out.push(`${b.actor} cannot ${b.verb}`);
  const t = b.target;
  switch (def.target) {
    case "none": if (t !== null) out.push(`${b.verb} takes no target (got ${t})`); break;
    case "mark": if (!isMark(t)) out.push(`${b.verb} needs a mark target (got ${t})`); break;
    case "actor": if (!isActor(t) || t === b.actor) out.push(`${b.verb} needs another actor as target (got ${t})`); break;
    case "prop": if (!isProp(t)) out.push(`${b.verb} needs a prop target (got ${t})`); break;
    case "mark_or_actor":
      if (t !== null && !isMark(t) && !isActor(t)) out.push(`${b.verb} needs a mark/actor target (got ${t})`);
      if (t === b.actor) out.push(`${b.verb} targets self`);
      break;
  }
  if (def.needsItem && !isProp(b.item)) out.push(`${b.verb} needs an item`);
  if (!def.needsItem && b.item !== null) out.push(`${b.verb} takes no item (got ${b.item})`);
  if (b.verb === "take" && b.item !== b.target) out.push(`take: item must equal target`);
  if (b.verb === "carry" && t !== "masha") out.push(`carry must target masha`);
  return out;
}

/** Shoulder-ride contract (mirrors the compiler): what Masha may do aboard, and Bear verbs that end the ride. */
const CARRIED_OK = new Set(["idle", "wave", "clap", "point_at", "look_at", "nod", "shake_head", "shrug", "laugh", "cry", "sulk", "surprised", "sneeze", "sigh", "eat", "yawn_stretch", "peek", "scared"]);
const ENDS_CARRY = new Set(["sit", "sleep", "exit", "fall_down", "hide", "jump", "spin", "dance", "hug", "cook", "fish", "water_plants", "angry_stomp", "chase", "run_to"]);

/**
 * Minimal continuity simulator (independent of the compiler): positions by mark, holding, posture, prop locations.
 * Encodes the staging contract the fixtures promise: take before eat/give/throw, one item per paw, cook at the
 * table with the pan, fish at the pier with the rod, sleepers wake before acting, carried Masha stays aboard.
 */
function simulate(e: FixtureEpisode): { problems: string[]; startStates: WorldState[] } {
  const ws: WorldState = initialWorldState();
  const problems: string[] = [];
  const startStates: WorldState[] = [];
  let carrying = false;
  e.paragraphs.forEach((p, pi) => {
    if (p.beatScript.time_of_day) ws.timeOfDay = p.beatScript.time_of_day;
    startStates.push(cloneWorldState(ws));
    p.beatScript.beats.forEach((b, bi) => {
      const at = `${key(e)} p${pi} b${bi} ${b.actor}.${b.verb}`;
      const me = ws.actors[b.actor];
      const fail = (msg: string) => problems.push(`${at}: ${msg}`);
      if (me.posture === "sleep" && b.verb !== "wake_up" && b.verb !== "sleep") fail("acts while asleep");
      if (me.posture === "carried" && !CARRIED_OK.has(b.verb)) fail("Masha would have to hop down from Bear's shoulders");
      if (b.actor === "bear" && carrying && ENDS_CARRY.has(b.verb)) fail("ends the shoulder ride (Masha hops down)");
      const moveTo = (m: MarkId | null) => {
        me.mark = m;
        if (m) me.pos = [...MARKS[m].pos];
        if (b.actor === "bear" && carrying) { ws.actors.masha.mark = m; ws.actors.masha.pos = [...me.pos]; }
      };
      if (LOCOMOTION_VERBS.includes(b.verb)) {
        if (b.verb === "enter") moveTo("clearing");
        else if (b.verb === "exit") { moveTo("path_entry"); me.posture = "offstage"; }
        else moveTo(isMark(b.target) ? b.target : isActor(b.target) ? ws.actors[b.target].mark : me.mark);
        if (me.posture === "sit") me.posture = "stand";
      }
      switch (b.verb) {
        case "sit": moveTo(b.target as MarkId); me.posture = "sit"; break;
        case "sleep": moveTo(b.target as MarkId); me.posture = "sleep"; break;
        case "wake_up": case "stand_up": if (me.posture !== "carried") me.posture = "stand"; break;
        case "take": {
          const item = b.item as PropId;
          const loc = ws.props[item].at;
          if (me.holding) fail(`already holding ${me.holding}`);
          if (loc === "hidden") fail(`${item} is hidden`);
          if (isActor(loc) && loc !== b.actor) fail(`${item} is held by ${loc}`);
          if (isMark(loc)) moveTo(loc);
          me.holding = item;
          ws.props[item] = { at: b.actor };
          break;
        }
        case "give": {
          const to = b.target as ActorId;
          if (me.holding !== b.item) fail(`gives ${b.item} but holds ${me.holding}`);
          if (ws.actors[to].holding) fail(`${to} already holds ${ws.actors[to].holding}`);
          ws.actors[to].holding = b.item;
          ws.props[b.item as PropId] = { at: to };
          me.holding = null;
          break;
        }
        case "throw": {
          if (me.holding !== b.item) fail(`throws ${b.item} but holds ${me.holding}`);
          const dest = isMark(b.target) ? b.target : isActor(b.target) ? ws.actors[b.target].mark : me.mark;
          ws.props[b.item as PropId] = { at: dest ?? "hidden" };
          me.holding = null;
          break;
        }
        case "eat":
          if (me.holding !== b.item) fail(`eats ${b.item} but holds ${me.holding}`);
          if (!PROPS[b.item as PropId].edible) fail(`${b.item} is not edible`);
          break;
        case "cook":
          if (me.mark !== "table") fail(`cooks away from the table (at ${me.mark})`);
          if (me.holding !== "frying_pan") fail(`cooks without the frying pan (holds ${me.holding})`);
          if (ws.props.pancakes.at === "hidden") ws.props.pancakes = { at: "table" };
          break;
        case "fish":
          if (me.mark !== "pier") fail(`fishes away from the pier (at ${me.mark})`);
          if (me.holding !== "fishing_rod") fail(`fishes without the rod (holds ${me.holding})`);
          break;
        case "swing": if (me.mark !== "swing") fail("swings away from the swing"); break;
        case "carry":
          if (ws.actors.masha.mark !== me.mark) fail(`carry: Masha at ${ws.actors.masha.mark}, Bear at ${me.mark}`);
          if (ws.actors.masha.posture === "sleep") fail("carry: Masha asleep");
          ws.actors.masha.posture = "carried";
          carrying = true;
          break;
      }
    });
  });
  return { problems, startStates };
}

/** Word-prefix match of the rule lists (so fixtures never trip the deterministic validator). */
function ruleWordHits(text: string, lang: "en" | "ru"): string[] {
  const lower = text.toLowerCase();
  const stems = [WEAPON_WORDS, VIOLENCE_WORDS, SCARY_WORDS, UNKIND_WORDS].flatMap((l) => l[lang].map((w) => w.stem));
  const hits = stems.filter((s) => new RegExp(`(^|[^\\p{L}])${s}`, "u").test(lower));
  for (const s of [...BRANDS, ...FOREIGN_CHARACTERS]) if (lower.includes(s)) hits.push(s);
  return hits;
}

describe("fixture files", () => {
  it("has exactly the six id × lang files, with the spec titles", () => {
    expect(FIXTURES.map(key).sort()).toEqual(Object.keys(RAW).sort());
    expect(new Set(FIXTURES.map((e) => e.id))).toEqual(new Set(FIXTURE_IDS));
    for (const e of FIXTURES) expect(e.title).toBe(TITLES[key(e)]);
  });

  for (const [name, raw] of Object.entries(RAW)) {
    describe(name, () => {
      const ep = raw as FixtureEpisode;

      it("every BeatScript parses with BeatScriptSchema and lists every field explicitly", () => {
        expect(ep.paragraphs.length).toBeGreaterThanOrEqual(3);
        expect(ep.paragraphs.length).toBeLessThanOrEqual(4);
        for (const p of ep.paragraphs) {
          expect(typeof p.text).toBe("string");
          const parsed = BeatScriptSchema.safeParse(p.beatScript);
          expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
          expect(Object.keys(p.beatScript).sort()).toEqual(SCRIPT_KEYS);
          for (const b of p.beatScript.beats) expect(Object.keys(b).sort()).toEqual(BEAT_KEYS);
          expect(p.beatScript.rule_hits).toEqual([]);
        }
      });
    });
  }
});

describe.each(FIXTURES.map((e) => [key(e), e] as const))("%s", (_name, ep) => {
  const lines = allBeats(ep).filter((b) => b.line !== null);

  it("structure: 3–10 beats per paragraph, delays and lengths in range, first beat sequential", () => {
    for (const p of ep.paragraphs) {
      const bs: BeatScript = p.beatScript;
      expect(bs.beats.length).toBeGreaterThanOrEqual(3);
      expect(bs.beats.length).toBeLessThanOrEqual(Math.min(10, MAX_BEATS));
      expect(bs.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
      expect(bs.beats[0].with_previous).toBe(false);
      for (const b of bs.beats) {
        expect(b.delay_s).toBeGreaterThanOrEqual(0);
        expect(b.delay_s).toBeLessThanOrEqual(MAX_DELAY_S);
        if (b.line !== null) expect(b.line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
      }
      expect(p.text.length).toBeLessThanOrEqual(600);
    }
  });

  it("canon: Bear never has a line; only speaking characters talk", () => {
    for (const b of allBeats(ep)) {
      if (b.actor === "bear") expect(b.line).toBeNull();
      if (b.line !== null) expect(CHARACTERS[b.actor].speaks).toBe(true);
    }
  });

  it("emotes come only from each character's bible list", () => {
    for (const b of allBeats(ep)) {
      if (b.emote !== null && b.emote !== "none") expect(CHARACTERS[b.actor].emotes, `${b.actor} ${b.emote}`).toContain(b.emote);
    }
  });

  it("language: lines, summaries, texts and title are in the episode language", () => {
    const check = (s: string) => {
      if (ep.lang === "ru") {
        expect(s, s).toMatch(CYRILLIC);
        expect(s, s).not.toMatch(LATIN);
      } else {
        expect(s, s).toMatch(LATIN);
        expect(s, s).not.toMatch(CYRILLIC);
      }
    };
    check(ep.title);
    for (const p of ep.paragraphs) {
      check(p.text);
      check(p.beatScript.summary);
    }
    for (const b of lines) check(b.line as string);
  });

  it("the child's quoted words are kept verbatim as Masha's lines", () => {
    for (const p of ep.paragraphs) {
      const q = quotes(p.text);
      expect(q.length, p.text).toBeGreaterThan(0);
      const mashaLines = p.beatScript.beats.filter((b) => b.actor === "masha" && b.line !== null).map((b) => b.line);
      for (const quote of q) expect(mashaLines).toContain(quote);
    }
  });

  it("every verb/actor/target/item combination is valid per the grammar", () => {
    const problems = allBeats(ep).flatMap(grammarProblems);
    expect(problems).toEqual([]);
  });

  it("continuity holds across paragraphs from the initial world state", () => {
    expect(simulate(ep).problems).toEqual([]);
  });

  it("shows off sound: at least one line, music start, ambience and event sfx", () => {
    const scripts = ep.paragraphs.map((p) => p.beatScript);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(scripts.some((s) => s.music.change === "start" && s.music.mood !== "none")).toBe(true);
    expect(scripts.some((s) => s.ambience !== null && s.ambience.length > 0)).toBe(true);
    expect(allBeats(ep).some((b) => b.sfx !== null)).toBe(true);
    // the first paragraph establishes the soundscape explicitly
    expect(scripts[0].music.change).toBe("start");
    expect(scripts[0].ambience).not.toBeNull();
  });

  it("uses rich staging: parallel reactions and plenty of emotes", () => {
    const beats = allBeats(ep);
    expect(beats.filter((b) => b.with_previous).length).toBeGreaterThanOrEqual(ep.paragraphs.length);
    expect(beats.filter((b) => b.emote !== null).length).toBeGreaterThanOrEqual(ep.paragraphs.length * 2);
    for (const p of ep.paragraphs) {
      const actors = new Set(p.beatScript.beats.map((b) => b.actor));
      expect(actors.size, p.text).toBe(2);
    }
  });

  it("never trips the safety word lists", () => {
    for (const p of ep.paragraphs) {
      expect(ruleWordHits(p.text, ep.lang), p.text).toEqual([]);
      expect(ruleWordHits(p.beatScript.summary, ep.lang)).toEqual([]);
      // the real pre-filter (run before any director call) must leave the child's text untouched
      for (const lang of ["auto", ep.lang] as const) {
        const f = preFilter(p.text, lang, ep.lang);
        expect(f.hits, p.text).toEqual([]);
        expect(f.text).toBe(p.text);
      }
    }
  });

  it("EN and RU versions mirror the same staging", () => {
    const other = getFixture(ep.id, ep.lang === "en" ? "ru" : "en");
    expect(other).not.toBeNull();
    const shape = (e: FixtureEpisode) =>
      e.paragraphs.map((p) => ({
        tod: p.beatScript.time_of_day, mood: p.beatScript.mood, music: p.beatScript.music, ambience: p.beatScript.ambience,
        beats: p.beatScript.beats.map((b) => ({ ...b, line: b.line === null ? null : "LINE" })),
      }));
    expect(shape(ep)).toEqual(shape(other as FixtureEpisode));
  });
});

describe("lookup helpers", () => {
  it("findFixtureParagraph matches exactly after whitespace normalization", () => {
    for (const e of FIXTURES) {
      e.paragraphs.forEach((p, i) => {
        const hit = findFixtureParagraph(`  ${p.text.replace(/ /g, "  \n")}  `);
        expect(hit?.episode.id).toBe(e.id);
        expect(hit?.episode.lang).toBe(e.lang);
        expect(hit?.index).toBe(i);
      });
    }
    expect(findFixtureParagraph("")).toBeNull();
    expect(findFixtureParagraph("Masha runs to the table.")).toBeNull();
    expect(findFixtureParagraph(FIXTURES[0].paragraphs[0].text + " And more.")).toBeNull();
  });

  it("getFixture returns the episode for id × lang", () => {
    expect(getFixture("bears_nap", "ru")?.title).toBe("Мишкин сон");
    expect(getFixture("fishing_trip", "en")?.paragraphs.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------- Integration with the compiler + post-validator (when they are implemented) ----------
const PROBE: BeatScript = {
  summary: "probe", time_of_day: null, mood: "playful", music: { mood: "playful", intensity: "soft", change: "continue" },
  ambience: null, rule_hits: [],
  beats: [
    { actor: "masha", verb: "run_to", target: "table", item: null, line: null, emote: null, sfx: null, emotion: "happy", with_previous: false, delay_s: 0, shot: "auto" },
    { actor: "bear", verb: "wave", target: "masha", item: null, line: "Hello!", emote: null, sfx: null, emotion: "happy", with_previous: false, delay_s: 0, shot: "auto" },
  ],
};
function detect(): { validator: boolean; compiler: boolean } {
  let validator = false;
  let compiler = false;
  try {
    const v = validateBeatScript(PROBE, initialWorldState(), "en");
    validator = v.hits.length > 0 || v.errors.length > 0 || v.beatScript.beats.some((b, i) => b.line !== PROBE.beats[i]?.line);
  } catch { validator = false; }
  try {
    const r = compileEpisode([{ paragraphId: "probe", version: 1, beatScript: PROBE, remix: DEFAULT_REMIX }], "en");
    compiler = r.results[0].segment.actorClips.masha.length > 0;
  } catch { compiler = false; }
  return { validator, compiler };
}
const IMPL = detect();

describe("fixtures through the real pipeline", () => {
  const vReason = IMPL.validator ? "" : "(SKIPPED: src/compiler/validate.ts validateBeatScript is still a stub)";
  const cReason = IMPL.compiler ? "" : "(SKIPPED: src/compiler compileEpisode is still a stub)";

  for (const e of FIXTURES) {
    (vReason ? it.skip : it)(`${key(e)}: post-validator reports 0 errors and 0 rule hits and changes nothing ${vReason}`.trim(), () => {
      // chain start states through the real compiler when it exists, else through the continuity simulator
      const starts = IMPL.compiler
        ? compileEpisode(e.paragraphs.map((p, i) => ({ paragraphId: `${e.id}-${i}`, version: 1, beatScript: p.beatScript, remix: DEFAULT_REMIX })), e.lang)
          .results.map((r) => r.segment.startState)
        : simulate(e).startStates;
      e.paragraphs.forEach((p, i) => {
        const v = validateBeatScript(p.beatScript, starts[i], e.lang);
        expect(v.errors, `p${i} validator errors`).toEqual([]);
        expect(v.hits, `p${i} rule hits`).toEqual([]);
        expect(v.beatScript, `p${i} unchanged by the validator`).toEqual(p.beatScript);
      });
    });

    (cReason ? it.skip : it)(`${key(e)}: compiles chained through world states with 0 errors and 0 repairs ${cReason}`.trim(), () => {
      const { results, timeline } = compileEpisode(
        e.paragraphs.map((p, i) => ({ paragraphId: `${e.id}-${i}`, version: 1, beatScript: p.beatScript, remix: DEFAULT_REMIX })),
        e.lang,
      );
      expect(results.length).toBe(e.paragraphs.length);
      results.forEach((r, i) => {
        expect(r.errors, `p${i} compile errors`).toEqual([]);
        expect(r.repairs, `p${i} compile repairs`).toEqual([]);
        expect(r.segment.duration).toBeGreaterThan(0);
        expect(r.segment.dialogue.length, `p${i} dialogue`).toBe(e.paragraphs[i].beatScript.beats.filter((b) => b.line).length);
        if (i > 0) expect(r.segment.startState).toEqual(results[i - 1].segment.endState);
      });
      expect(timeline.duration).toBeGreaterThan(0);
    });
  }
});
