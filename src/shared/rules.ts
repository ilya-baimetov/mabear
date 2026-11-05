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
