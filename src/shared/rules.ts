// Canon and safety rules (spec §9). Rule metadata + word lists are FROZEN after M1 (additive changes only).
// Implementations: preFilter() and postValidate() live below/in src/compiler/validate.ts.
import type { Lang, RuleId } from "./schema";

export interface RuleDef {
  id: RuleId;
  hard: boolean; // enforced by the deterministic validator
  description: string;
  kidMessage: Record<Lang, string>;
}

export const RULES: Record<RuleId, RuleDef> = {
  bear_silent: { id: "bear_silent", hard: true, description: "Bear never speaks words (canon; verify with Animaccord). A Bear line becomes a fitting emote + gesture.", kidMessage: { en: "Bear doesn't talk in our show — he grumbled instead!", ru: "Мишка в мультике не разговаривает — он просто заурчал!" } },
  cast_only: { id: "cast_only", hard: true, description: "Only bible characters, marks and props. Other franchises' characters never appear.", kidMessage: { en: "Only Masha and Bear live in this yard, so they played it themselves!", ru: "В этом дворе живут только Маша и Мишка — они сыграли всё сами!" } },
  no_weapons: { id: "no_weapons", hard: true, description: "No weapons or real violence; soft slapstick is fine. Weapons become toys or are removed; hitting becomes a playful pillow bonk or nothing.", kidMessage: { en: "We swapped that for something safe and silly!", ru: "Мы заменили это на что-то безопасное и смешное!" } },
  no_scary: { id: "no_scary", hard: false, description: "No gore, horror, death or injury. Reframe as a gentle surprise.", kidMessage: { en: "We made it a funny surprise instead of a scary one!", ru: "Мы сделали это весёлым сюрпризом, а не страшилкой!" } },
  kind_language: { id: "kind_language", hard: false, description: "No insults or profanity; replace with a kind equivalent.", kidMessage: { en: "Masha found a kinder way to say it!", ru: "Маша сказала это по-доброму!" } },
  no_brands: { id: "no_brands", hard: false, description: "No real brands or products; use a generic noun.", kidMessage: { en: "We used a regular word instead of a brand name.", ru: "Мы заменили название бренда обычным словом." } },
  no_personal_data: { id: "no_personal_data", hard: false, description: "Strip names, addresses, phone numbers, emails the child types about themselves.", kidMessage: { en: "We left out personal details to keep you safe.", ru: "Мы убрали личные данные, чтобы было безопасно." } },
  in_character: { id: "in_character", hard: false, description: "Masha is mischievous but never cruel; Bear is never aggressive toward Masha. Restage.", kidMessage: { en: "We kept Masha and Bear true to themselves!", ru: "Маша и Мишка остались собой!" } },
};

/** Weapon words → safe replacement (EN/RU stems, lower-case). Matched as word prefixes. */
export const WEAPON_WORDS: Record<Lang, { stem: string; replacement: string }[]> = {
  en: [
    { stem: "knife", replacement: "spoon" }, { stem: "knives", replacement: "spoons" },
    { stem: "gun", replacement: "toy" }, { stem: "pistol", replacement: "toy" }, { stem: "rifle", replacement: "toy" },
    { stem: "sword", replacement: "stick" }, { stem: "axe", replacement: "broom" }, { stem: "dagger", replacement: "spoon" },
    { stem: "bomb", replacement: "balloon" }, { stem: "grenade", replacement: "ball" }, { stem: "spear", replacement: "stick" },
  ],
  ru: [
    { stem: "нож", replacement: "ложка" }, { stem: "пистолет", replacement: "игрушка" }, { stem: "ружь", replacement: "игрушка" },
    { stem: "автомат", replacement: "игрушка" }, { stem: "меч", replacement: "палочка" }, { stem: "топор", replacement: "метла" },
    { stem: "кинжал", replacement: "ложка" }, { stem: "бомб", replacement: "шарик" }, { stem: "гранат", replacement: "мячик" },
    { stem: "копь", replacement: "палочка" },
  ],
};

/** Violence verbs → softened. */
export const VIOLENCE_WORDS: Record<Lang, { stem: string; replacement: string }[]> = {
  en: [
    { stem: "kill", replacement: "tickle" }, { stem: "stab", replacement: "poke" }, { stem: "shoot", replacement: "splash" },
    { stem: "punch", replacement: "pillow-bonk" }, { stem: "hit", replacement: "pillow-bonk" }, { stem: "beat up", replacement: "tickle" },
    { stem: "murder", replacement: "surprise" }, { stem: "strangle", replacement: "hug" },
  ],
  ru: [
    { stem: "убий", replacement: "щекочет" }, { stem: "убив", replacement: "щекочет" }, { stem: "убил", replacement: "пощекотал" },
    { stem: "зарез", replacement: "напугал" }, { stem: "застрел", replacement: "обрызгал" }, { stem: "стреля", replacement: "брызгает" },
    { stem: "ударил", replacement: "легонько стукнул подушкой" }, { stem: "бьёт", replacement: "стукает подушкой" }, { stem: "избил", replacement: "защекотал" },
  ],
};

/** Scary / gore words → gentle reframe. */
export const SCARY_WORDS: Record<Lang, { stem: string; replacement: string }[]> = {
  en: [
    { stem: "blood", replacement: "jam" }, { stem: "dead", replacement: "sleepy" }, { stem: "die", replacement: "nap" },
    { stem: "corpse", replacement: "scarecrow" }, { stem: "zombie", replacement: "sleepyhead" }, { stem: "monster", replacement: "funny shadow" },
  ],
  ru: [
    { stem: "кров", replacement: "варенье" }, { stem: "мёртв", replacement: "сонный" }, { stem: "мертв", replacement: "сонный" },
    { stem: "умер", replacement: "уснул" }, { stem: "труп", replacement: "пугало" }, { stem: "зомби", replacement: "соня" }, { stem: "монстр", replacement: "смешная тень" },
  ],
};

/** Insults/profanity → kind equivalent. (Mild list; the LLM handles the rest.) */
export const UNKIND_WORDS: Record<Lang, { stem: string; replacement: string }[]> = {
  en: [
    { stem: "stupid", replacement: "silly" }, { stem: "idiot", replacement: "silly-billy" }, { stem: "dumb", replacement: "silly" },
    { stem: "shut up", replacement: "shh, please" }, { stem: "hate", replacement: "don't like" }, { stem: "ugly", replacement: "funny-looking" },
    { stem: "fool", replacement: "silly goose" }, { stem: "damn", replacement: "oh my" },
  ],
  ru: [
    { stem: "дура", replacement: "глупышка" }, { stem: "дурак", replacement: "глупыш" }, { stem: "идиот", replacement: "чудак" },
    { stem: "заткнись", replacement: "тише, пожалуйста" }, { stem: "ненавижу", replacement: "не люблю" }, { stem: "тупой", replacement: "смешной" },
    { stem: "урод", replacement: "чудик" },
  ],
};

/** Characters from other franchises (cast_only) — matched case-insensitively. */
export const FOREIGN_CHARACTERS = [
  "mickey", "minnie", "elsa", "spider-man", "spiderman", "batman", "superman", "pikachu", "shrek", "peppa", "sonic", "mario",
  "микки", "эльза", "человек-паук", "бэтмен", "супермен", "пикачу", "шрек", "пеппа", "соник", "марио",
];

/** Real brands (no_brands) — small list; the LLM handles the rest. */
export const BRANDS = ["coca-cola", "coke", "pepsi", "mcdonald", "nutella", "lego", "nike", "adidas", "iphone", "kinder", "кока-кола", "пепси", "макдональдс", "нутелла", "лего", "айфон", "киндер"];

/** Personal data regexes (no_personal_data). */
export const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // emails
  /(?:\+?\d[\s-]?){7,}/g, // phone-like digit runs (7+ digits)
];

// ---------- Implementations (additive) ----------
import type { RuleHit } from "./schema";

/** Generic nouns for brand names (no_brands). */
export const BRAND_GENERIC: Record<string, Record<Lang, string>> = {
  "coca-cola": { en: "lemonade", ru: "лимонад" }, coke: { en: "lemonade", ru: "лимонад" }, pepsi: { en: "lemonade", ru: "лимонад" },
  "кока-кола": { en: "lemonade", ru: "лимонад" }, "пепси": { en: "lemonade", ru: "лимонад" },
  mcdonald: { en: "café", ru: "кафе" }, "макдональдс": { en: "café", ru: "кафе" },
  nutella: { en: "chocolate spread", ru: "шоколадная паста" }, "нутелла": { en: "chocolate spread", ru: "шоколадная паста" },
  lego: { en: "blocks", ru: "кубики" }, "лего": { en: "blocks", ru: "кубики" },
  nike: { en: "sneakers", ru: "кроссовки" }, adidas: { en: "sneakers", ru: "кроссовки" },
  iphone: { en: "phone", ru: "телефон" }, "айфон": { en: "phone", ru: "телефон" },
  kinder: { en: "chocolate egg", ru: "шоколадное яйцо" }, "киндер": { en: "chocolate egg", ru: "шоколадное яйцо" },
};

/** Whole words that start with a blocked stem but are harmless (prefix false positives). */
export const SAFE_WORD_PREFIXES = [
  "diet", "diesel", "hitch", "dumbbell", "gunny", "foolproof", "deadline", "skill",
  "мечт", "кроват", "ножк", "трупп", "умерен", "гранатов", "копыт",
];

const LETTER = "\\p{L}";
const EN_SUFFIX = "(?:s|es|ed|d|ing|ings|er|ers|ted|ting|ped|ping|ies|y|ly)?";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function matchCase(original: string, replacement: string): string {
  const first = original.charAt(0);
  if (first && first !== first.toLowerCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Carry an English inflection (s / ed / ing) from the matched word onto a one-word replacement. */
function inflectLike(suffix: string, replacement: string): string {
  if (!suffix || /[\s]/.test(replacement)) return replacement;
  if (suffix === "s" || suffix === "es") return replacement + "s";
  const base = /^[^aeiou]*[aeiou][bdgklmnprtvz]$/.test(replacement) ? replacement + replacement.slice(-1) : replacement;
  if (/^(ed|d|ted|ped)$/.test(suffix)) return replacement.endsWith("e") ? replacement + "d" : base + "ed";
  if (/^(ing|ting|ping)$/.test(suffix)) return replacement.endsWith("e") ? replacement.slice(0, -1) + "ing" : base + "ing";
  return replacement;
}

/** Name pattern that tolerates Russian case endings (нутелла → нутеллу). */
function namePattern(name: string): string {
  const stem = /[\u0400-\u04FF][аяоеуыи]$/i.test(name) ? name.slice(0, -1) : name;
  return `(?<![${LETTER}\\d])${escapeRe(stem)}${LETTER}{0,3}(?![${LETTER}\\d])`;
}

/** Detect a text's language by script (Cyrillic → ru, else en). */
export function detectLang(text: string): Lang {
  return /[Ѐ-ӿ]/.test(text) ? "ru" : "en";
}

interface WordRule { rule: RuleId; lang: Lang; stem: string; replacement: string }

function wordRules(): WordRule[] {
  const out: WordRule[] = [];
  const add = (rule: RuleId, lists: Record<Lang, { stem: string; replacement: string }[]>) => {
    for (const lang of ["en", "ru"] as Lang[]) for (const w of lists[lang]) out.push({ rule, lang, ...w });
  };
  add("no_weapons", WEAPON_WORDS);
  add("no_weapons", VIOLENCE_WORDS);
  add("no_scary", SCARY_WORDS);
  add("kind_language", UNKIND_WORDS);
  // longer stems first so "beat up" wins over shorter overlaps
  return out.sort((a, b) => b.stem.length - a.stem.length);
}
const WORD_RULES = wordRules();

/** Pre-filter (runs before the LLM, on parsed text and on every line/summary in the validator):
 *  replaces weapon, violence, scary, unkind words, other franchises' characters, brands; strips personal data.
 *  Both languages' lists always apply (scripts don't collide). `lang` ("auto" = by script) picks the
 *  replacement language for brands/characters; `uiLang` picks the kid_message language (defaults to `lang`). */
export function preFilter(text: string, lang: Lang | "auto", uiLang?: Lang): { text: string; hits: RuleHit[] } {
  const textLang: Lang = lang === "auto" ? detectLang(text) : lang;
  const msgLang: Lang = uiLang ?? textLang;
  const hits: RuleHit[] = [];
  const hit = (rule: RuleId, original: string, replacement: string) =>
    hits.push({ rule, original, replacement, kid_message: RULES[rule].kidMessage[msgLang] });
  let out = text;

  // personal data first (digits/emails), then "my name is X"
  for (const re of PERSONAL_DATA_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), (m) => {
      hit("no_personal_data", m.trim(), "");
      return " ";
    });
  }
  out = out.replace(/\b(my name is|i am called|i live (?:at|on|in))\s+[\p{L}\d-]+/giu, (m, intro: string) => {
    hit("no_personal_data", m, "");
    return intro.toLowerCase().startsWith("my name") ? "" : "";
  });
  out = out.replace(/(меня зовут|моё имя|мое имя|я живу (?:на|в))\s+[\p{L}\d-]+/giu, (m) => {
    hit("no_personal_data", m, "");
    return "";
  });

  // weapons / violence / scary / unkind word lists (word-prefix match)
  for (const w of WORD_RULES) {
    const suffix = w.lang === "en" ? (w.stem.includes(" ") ? "" : EN_SUFFIX) : `${LETTER}*`;
    const re = new RegExp(`(?<![${LETTER}\\d])${escapeRe(w.stem)}${suffix}(?![${LETTER}\\d])`, "giu");
    out = out.replace(re, (m) => {
      const low = m.toLowerCase();
      if (SAFE_WORD_PREFIXES.some((p) => low.startsWith(p))) return m;
      const rep = matchCase(m, w.lang === "en" ? inflectLike(low.slice(w.stem.length), w.replacement) : w.replacement);
      hit(w.rule, m, rep);
      return rep;
    });
  }

  // other franchises' characters (cast_only)
  for (const name of FOREIGN_CHARACTERS) {
    const re = new RegExp(namePattern(name), "giu");
    out = out.replace(re, (m) => {
      const mentionsMasha = /masha|маш/i.test(out);
      const rep = mentionsMasha ? (textLang === "ru" ? "Мишка" : "Bear") : textLang === "ru" ? "Маша" : "Masha";
      hit("cast_only", m, rep);
      return rep;
    });
  }

  // brands (no_brands)
  for (const brand of BRANDS) {
    const re = new RegExp(namePattern(brand), "giu");
    out = out.replace(re, (m) => {
      const generic = BRAND_GENERIC[brand]?.[textLang] ?? (textLang === "ru" ? "игрушка" : "toy");
      hit("no_brands", m, generic);
      return generic;
    });
  }

  out = out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  return { text: out, hits };
}

/** True if the text would be changed by the pre-filter. */
export function hasBlockedContent(text: string): boolean {
  return preFilter(text, "auto").hits.length > 0;
}
