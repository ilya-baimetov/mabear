// Deterministic post-validator (spec §9): hard canon/safety rules + structural clamps. Pure and idempotent
// (validating an already-validated script yields no new hits and no errors).
import { CHARACTERS } from "../shared/bible/characters";
import { MARKS } from "../shared/bible/set";
import { GRAMMAR, VERB_IMPLIED_PROP, isWolf } from "../shared/grammar";
import { RULES, canonAbsentFor, canonAbsentMessage, preFilter } from "../shared/rules";
import {
  ACTOR_IDS, AMBIENCES, EMOTES, EMOTIONS, MARK_IDS, MAX_BEATS, MAX_DELAY_S, MAX_LINE_CHARS, MAX_SUMMARY_CHARS,
  MOODS, MUSIC_MOODS, PROP_IDS, SFX_IDS, SHOTS, TIMES_OF_DAY, VERBS,
  type ActorId, type Ambience, type Beat, type BeatScript, type Emote, type Lang, type MarkId, type PropId,
  type RuleHit, type WorldState,
} from "../shared/schema";
import type { ValidateResult } from "./types";

export const isActor = (s: unknown): s is ActorId => typeof s === "string" && (ACTOR_IDS as readonly string[]).includes(s);
export const isMark = (s: unknown): s is MarkId => typeof s === "string" && (MARK_IDS as readonly string[]).includes(s);
export const isProp = (s: unknown): s is PropId => typeof s === "string" && (PROP_IDS as readonly string[]).includes(s);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** The default partner for actor-target verbs: Masha↔Bear; each Wolf's partner is the other Wolf. */
export function otherActor(a: ActorId): ActorId {
  if (a === "wolf_a") return "wolf_b";
  if (a === "wolf_b") return "wolf_a";
  return a === "masha" ? "bear" : "masha";
}

/** Synonyms for unknown targets → nearest allowed mark/prop/actor (cast_only). */
const TARGET_SYNONYMS: Record<string, string> = {
  house: "door", home: "door", cabin: "door", hut: "door", inside: "door", steps: "porch", stairs: "porch",
  yard: "clearing", lawn: "clearing", meadow: "clearing", grass: "clearing", middle: "clearing", center: "clearing",
  tree: "big_tree", pine: "big_tree", oak: "swing", lake: "pond_shore", pond: "pond_shore", water: "pond_shore", shore: "pond_shore",
  dock: "pier", jetty: "pier", river: "creek", stream: "creek", bridge: "creek", footbridge: "creek",
  forest: "path_entry", woods: "path_entry", path: "path_entry", road: "path_entry", gate: "path_entry",
  kitchen: "table", stove: "table", samovar: "teapot", hive: "beehive", hives: "beehive", bees: "beehive", vegetables: "garden",
  bed: "hammock", logs: "woodpile", firewood: "woodpile", car: "van", ambulance: "van", truck: "van", bushes: "bush", shrub: "bush",
  jam: "jam_jar", honey: "honey_pot", pancake: "pancakes", pan: "frying_pan", rod: "fishing_rod", candy: "lollipop",
  flower: "flowers", can: "watering_can", flour: "flour_bag", tea: "teapot",
  // canon names for cast members (never a cast_only hit). The Wolves are canon: never substituted.
  medved: "bear", misha: "bear", mishka: "bear",
  wolf: "wolf_a", wolves: "wolf_a", wolf_1: "wolf_a", wolf_2: "wolf_b", wolf1: "wolf_a", wolf2: "wolf_b",
  big_wolf: "wolf_a", little_wolf: "wolf_b", small_wolf: "wolf_b", "волк": "wolf_a", "волки": "wolf_a", "волков": "wolf_a",
};
/** Synonyms that name a real cast member (no cast_only hit when resolved). */
const CAST_ALIASES = new Set(["medved", "misha", "mishka", "wolf", "wolves", "wolf_1", "wolf_2", "wolf1", "wolf2", "big_wolf", "little_wolf", "small_wolf", "волк", "волки", "волков"]);

/** A canon series character that isn't in the prototype (Hare, Penguin, Panda, Tiger, Dasha, Rosie…) → stand-in id. */
export function canonAbsentTarget(raw: string | null): { sub: ActorId; message: Record<Lang, string> } | null {
  if (raw == null) return null;
  const words = raw.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  for (const w of words.reverse()) {
    const c = canonAbsentFor(w);
    if (c) return { sub: c.sub, message: { en: canonAbsentMessage(c, "en"), ru: canonAbsentMessage(c, "ru") } };
  }
  return null;
}

/** Map an arbitrary target string to an allowed id, or null when nothing fits. */
export function resolveTargetId(raw: string | null): string | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isActor(s) || isMark(s) || isProp(s)) return s;
  if (TARGET_SYNONYMS[s]) return TARGET_SYNONYMS[s];
  const absent = canonAbsentTarget(s);
  if (absent) return absent.sub;
  const words = s.split("_");
  for (const w of [...words].reverse()) {
    if (isActor(w) || isMark(w) || isProp(w)) return w;
    if (TARGET_SYNONYMS[w]) return TARGET_SYNONYMS[w];
  }
  for (const id of [...MARK_IDS, ...PROP_IDS]) if (id.startsWith(s) || s.startsWith(id)) return id;
  return null;
}

function WOLF_EMOTE_FALLBACK(): Partial<Record<Emote, Emote>> {
  return {
    giggle: "snicker", chuckle: "snicker", laugh: "snicker", hum: "snicker", wheee: "howl", cheer: "howl", roar_soft: "howl", scream_fun: "howl",
    growl_soft: "snicker", cry: "whimper", uh_oh: "whimper",
  };
}
/** The emote a silent Wolf makes instead of a spoken line (wolves_silent). */
export function wolfLineEmote(emotion: string): Emote {
  if (["sad", "scared", "surprised"].includes(emotion)) return "whimper";
  if (["happy", "excited", "proud"].includes(emotion)) return "howl";
  return "snicker";
}

/** Per-character emote fallbacks (an emote outside the bible list → the nearest one the character can make). */
const EMOTE_FALLBACK: Record<ActorId, Partial<Record<Emote, Emote>>> = {
  masha: { grunt: "hmph", huff: "hmph", snore: "yawn", growl_soft: "hmph", chuckle: "giggle", roar_soft: "scream_fun", howl: "wheee", whimper: "cry", snicker: "giggle" },
  bear: { giggle: "chuckle", wheee: "hum", uh_oh: "grunt", cry: "sigh", cheer: "hum", scream_fun: "roar_soft", howl: "roar_soft", whimper: "sigh", snicker: "chuckle" },
  wolf_a: WOLF_EMOTE_FALLBACK(),
  wolf_b: WOLF_EMOTE_FALLBACK(),
};
export function allowedEmote(actor: ActorId, emote: Emote | null): Emote | null {
  if (emote == null || emote === "none") return null;
  const list = CHARACTERS[actor].emotes;
  if (list.includes(emote)) return emote;
  const f = EMOTE_FALLBACK[actor][emote];
  return f && list.includes(f) ? f : null;
}

function clampText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, "") + "…";
}

function defaultMarkFor(verb: string, actor: ActorId, ws: WorldState): MarkId | null {
  if (verb === "sleep") return actor === "bear" ? "hammock" : isWolf(actor) ? "van" : ws.actors[actor].mark ?? "hammock";
  if (verb === "hide") return isWolf(actor) ? "van" : "bush";
  if (verb === "sit") return ws.actors[actor].mark ?? "bench";
  return ws.actors[actor].mark;
}

/** Default food per character when `eat` names nothing. */
const DEFAULT_FOOD: Record<ActorId, PropId> = { masha: "jam_jar", bear: "honey_pot", wolf_a: "honey_pot", wolf_b: "pancakes" };

export function validateBeatScript(bs: BeatScript, startState: WorldState, lang: Lang): ValidateResult {
  const hits: RuleHit[] = [];
  const errors: string[] = [];
  const hit = (rule: RuleHit["rule"], original: string, replacement: string) =>
    hits.push({ rule, original, replacement, kid_message: RULES[rule].kidMessage[lang] });

  // ---- summary ----
  let summary = typeof bs.summary === "string" ? bs.summary.trim() : "";
  const fs = preFilter(summary, "auto", lang);
  hits.push(...fs.hits);
  summary = fs.text;
  if (summary.length > MAX_SUMMARY_CHARS) { summary = clampText(summary, MAX_SUMMARY_CHARS); errors.push("summary clamped to 140 chars"); }
  if (!summary) { summary = lang === "ru" ? "Маша и Мишка во дворе." : "Masha and Bear in the yard."; errors.push("empty summary replaced"); }

  // ---- paragraph-level fields ----
  const time_of_day = bs.time_of_day == null || inList(TIMES_OF_DAY, bs.time_of_day) ? bs.time_of_day : null;
  const mood = inList(MOODS, bs.mood) ? bs.mood : "playful";
  const music = {
    mood: inList(MUSIC_MOODS, bs.music?.mood) ? bs.music.mood : "playful",
    intensity: inList(["soft", "medium", "full"] as const, bs.music?.intensity) ? bs.music.intensity : "soft",
    change: inList(["continue", "start", "stop"] as const, bs.music?.change) ? bs.music.change : "continue",
  } as BeatScript["music"];
  let ambience: Ambience[] | null = null;
  if (Array.isArray(bs.ambience)) {
    ambience = [];
    for (const a of bs.ambience) if (inList(AMBIENCES, a) && !ambience.includes(a)) ambience.push(a);
  }

  // ---- beats ----
  let beats = Array.isArray(bs.beats) ? bs.beats.slice() : [];
  if (beats.length > MAX_BEATS) { errors.push(`too many beats (${beats.length}); kept ${MAX_BEATS}`); beats = beats.slice(0, MAX_BEATS); }

  // light holding simulation so missing items can be filled in
  const holding = Object.fromEntries(ACTOR_IDS.map((id) => [id, startState.actors[id]?.holding ?? null])) as Record<ActorId, PropId | null>;
  const out: Beat[] = [];
  beats.forEach((raw, i) => {
    const tag = `beat ${i + 1}`;
    if (!isActor(raw.actor)) {
      hit("cast_only", String(raw.actor), "");
      errors.push(`${tag}: unknown actor dropped`);
      return;
    }
    const b: Beat = { ...raw };
    let actor = b.actor;
    if (!inList(VERBS, b.verb)) { errors.push(`${tag}: unknown verb → idle`); b.verb = "idle"; }

    // Masha-only / Bear-only verbs
    if (!GRAMMAR[b.verb].actors.includes(actor)) {
      if (b.verb === "carry" && !isWolf(actor)) {
        errors.push(`${tag}: only Bear carries — Bear lifts Masha`);
        actor = "bear";
        b.actor = "bear";
        b.target = "masha";
      } else {
        errors.push(`${tag}: ${actor} can't ${b.verb} → look_at`);
        b.target = b.verb === "swing" ? "swing" : null;
        b.verb = "look_at";
      }
    }
    const def = GRAMMAR[b.verb];

    // ---- target vs verb.target ----
    const rawTarget = b.target;
    let target = resolveTargetId(rawTarget);
    const rawNorm = rawTarget == null ? "" : rawTarget.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const absent = isActor(target) && !isActor(rawNorm) && !CAST_ALIASES.has(rawNorm) ? canonAbsentTarget(rawTarget) : null;
    if (rawTarget != null && rawTarget.trim() !== "" && target == null) {
      hit("cast_only", rawTarget, "");
      errors.push(`${tag}: unknown target "${rawTarget}" dropped`);
    } else if (rawTarget != null && target != null && target !== rawTarget) {
      if (absent) hits.push({ rule: "cast_only", original: rawTarget, replacement: String(target), kid_message: absent.message[lang] });
      else if (isActor(target) && !isActor(rawNorm) && !CAST_ALIASES.has(rawNorm)) hit("cast_only", rawTarget, target);
      errors.push(`${tag}: target "${rawTarget}" → ${target}`);
    }
    // a prop named as target of a needsItem verb (other than take) is really the item
    if (def.needsItem && b.verb !== "take" && isProp(target) && b.item == null) { b.item = target; target = null; }
    if (b.item != null && !isProp(b.item)) { hit("cast_only", String(b.item), ""); b.item = null; }

    switch (def.target) {
      case "none":
        if (target != null && !(isProp(target) && def.needsItem)) target = null;
        if (isProp(target)) target = null;
        break;
      case "actor":
        if (!isActor(target) || target === actor) {
          if (target != null && target !== actor && !isActor(target)) errors.push(`${tag}: ${b.verb} needs a character → ${otherActor(actor)}`);
          target = otherActor(actor);
        }
        break;
      case "prop":
        if (!isProp(target)) target = isProp(b.item) ? b.item : null;
        if (!isProp(target)) { errors.push(`${tag}: take without a prop → idle`); b.verb = "idle"; target = null; }
        else b.item = target;
        break;
      case "mark":
        if (isActor(target)) target = target === actor ? null : startState.actors[target].mark;
        else if (isProp(target)) { const at = startState.props[target]?.at; target = isMark(at) ? at : null; }
        if (!isMark(target)) target = defaultMarkFor(b.verb, actor, startState);
        break;
      case "mark_or_actor":
        if (target === actor) target = null;
        if (target == null && ["walk_to", "run_to", "tiptoe_to"].includes(b.verb)) { errors.push(`${tag}: ${b.verb} without a destination → clearing`); target = "clearing"; }
        break;
    }
    b.target = b.verb === "idle" && def.target === "none" ? null : target;
    if (GRAMMAR[b.verb].target === "none") b.target = null;

    // ---- items ----
    const vdef = GRAMMAR[b.verb];
    if (vdef.needsItem) {
      if (b.item == null) {
        const held = holding[actor];
        if (held) b.item = held;
        else if (b.verb === "eat") { b.item = DEFAULT_FOOD[actor]; errors.push(`${tag}: eat without food → ${b.item}`); }
        else if (b.verb === "throw") { b.item = "ball"; errors.push(`${tag}: throw without an item → ball`); }
        else if (b.verb === "give") { errors.push(`${tag}: give without an item → wave`); b.verb = "wave"; }
      }
    } else if (b.item != null && VERB_IMPLIED_PROP[b.verb] !== b.item) {
      b.item = null;
    }
    // simulate holding
    if (b.verb === "take" && b.item) holding[actor] = b.item;
    if (b.verb === "give" && b.item && isActor(b.target)) { holding[actor] = null; holding[b.target] = b.item; }
    if (b.verb === "throw") holding[actor] = null;

    // ---- emote / line (bear_silent) ----
    let emote = allowedEmote(actor, b.emote ?? null);
    if (b.emote != null && b.emote !== "none" && emote == null) errors.push(`${tag}: ${actor} can't make "${b.emote}"`);
    let line = typeof b.line === "string" ? b.line.trim() : null;
    if (line === "") line = null;
    if (line != null && !CHARACTERS[actor].speaks) {
      const wolf = isWolf(actor);
      const replacement: Emote = wolf ? wolfLineEmote(b.emotion) : ["happy", "proud", "excited"].includes(b.emotion) ? "hum" : "grunt";
      hit(wolf ? "wolves_silent" : "bear_silent", line, replacement);
      line = null;
      if (emote == null) emote = replacement;
      if (b.verb === "idle") b.verb = "nod"; // a fitting gesture instead of words
    }
    if (line != null) {
      const f = preFilter(line, "auto", lang);
      hits.push(...f.hits);
      line = f.text;
      if (line.length > MAX_LINE_CHARS) { line = clampText(line, MAX_LINE_CHARS); errors.push(`${tag}: line clamped to 120 chars`); }
      if (!line) line = null;
    }
    b.line = line;
    b.emote = emote;

    // ---- enums / numbers ----
    if (b.sfx != null && !inList(SFX_IDS, b.sfx)) b.sfx = null;
    if (!inList(EMOTIONS, b.emotion)) b.emotion = "neutral";
    if (!inList(SHOTS, b.shot)) b.shot = "auto";
    b.with_previous = b.with_previous === true;
    let delay = typeof b.delay_s === "number" && Number.isFinite(b.delay_s) ? b.delay_s : 0;
    if (delay < 0 || delay > MAX_DELAY_S) { errors.push(`${tag}: delay_s clamped`); delay = Math.max(0, Math.min(MAX_DELAY_S, delay)); }
    b.delay_s = delay;
    out.push(b);
  });

  if (out.length === 0) {
    errors.push("no beats → one idle beat");
    out.push({ actor: "masha", verb: "idle", target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto" });
  }

  const existing = Array.isArray(bs.rule_hits) ? bs.rule_hits : [];
  const merged = [...existing];
  for (const h of hits) if (!merged.some((m) => m.rule === h.rule && m.original === h.original)) merged.push(h);

  return {
    beatScript: { summary, time_of_day, mood, music, ambience, beats: out, rule_hits: merged },
    hits,
    errors,
  };
}

/** Marks used as hiding spots (for parser and compiler). */
export const HIDING_MARKS: MarkId[] = ["big_tree", "bush", "van", "woodpile"];
export const EMOTE_IDS = EMOTES;
export { MARKS };
