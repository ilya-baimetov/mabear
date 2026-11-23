import {numberedCarrot,isCarrot} from '../../shared/gardenCarrots';
import {CARROT_IDS} from '../../shared/schema';
// Offline deterministic EN/RU parser (spec §10): paragraph → BeatScript. Pure.
// Powers the instant preview, the no-key fallback and the tests. The child's quoted words are kept verbatim
// (only trimmed to 120 chars and passed through the safety pre-filter). The result always passes
// validateBeatScript with 0 errors.
import { PROPS } from "../../shared/bible/props";
import {isInteriorMark} from '../../shared/bible/set';
import { canonAbsentMessage, detectLang, findCanonAbsent, isCanonAbsentCompound, preFilter } from "../../shared/rules";
import { isWolf } from "../../shared/grammar";
import {
  ACTOR_IDS, MAX_BEATS, MAX_LINE_CHARS, MAX_PARAGRAPH_CHARS, MAX_SUMMARY_CHARS,
  type ActorId, type Ambience, type Beat, type BeatScript, type Emote, type Emotion, type Lang, type MarkId,
  type Mood, type MusicCue, type RuleHit, type MusicMood, type PropId, type SfxId, type TimeOfDay, type Verb, type WorldState,
} from "../../shared/schema";
import { allowedEmote, otherActor, validateBeatScript } from "../../compiler/validate";
import type { Lexicon } from "./lexiconTypes";
export type { Lexicon } from "./lexiconTypes";
import { LEXICON_EN } from "./lexicon.en";
import { LEXICON_RU } from "./lexicon.ru";

export const LEXICONS: Record<Lang, Lexicon> = { en: LEXICON_EN, ru: LEXICON_RU };

export interface ParseOptions {
  /** music mood playing at the end of the previous paragraph: with no music words, the paragraph continues it */
  prevMusicMood?: MusicMood | null;
}

/** Default emotion per verb. */
const VERB_EMOTION: Partial<Record<Verb, Emotion>> = {
  run_to: "excited", tiptoe_to: "mischievous", chase: "excited", jump: "happy", spin: "happy", dance: "happy",
  fall_down: "surprised", sleep: "sleepy", wake_up: "sleepy", yawn_stretch: "sleepy", hide: "mischievous", peek: "mischievous",
  wave: "happy", clap: "happy", laugh: "happy", cry: "sad", sulk: "sad", surprised: "surprised", scared: "scared",
  angry_stomp: "angry", sneeze: "surprised", sigh: "annoyed", facepalm: "annoyed", hug: "happy", eat: "happy",
  cook: "happy", swing: "excited", carry: "happy", water_plants: "happy", give: "happy", throw: "mischievous",
  take: "curious", look_at: "curious", point_at: "curious", nod: "happy", shrug: "curious",
};
/** Verb for a clause that only states an emotion ("Masha is happy"). */
const EMOTION_VERB: Record<Emotion, Verb> = {
  neutral: "idle", happy: "clap", excited: "jump", mischievous: "peek", curious: "look_at", surprised: "surprised",
  sad: "sulk", angry: "angry_stomp", scared: "scared", sleepy: "yawn_stretch", proud: "nod", annoyed: "sigh",
};
const LOCO: Verb[] = ["walk_to", "run_to", "tiptoe_to"];

interface Match<T> { index: number; len: number; value: T }
function firstMatch<T>(s: string, list: { re: RegExp; v: T }[]): Match<T> | null {
  let best: Match<T> | null = null;
  for (const { re, v } of list) {
    const m = re.exec(s);
    if (!m) continue;
    if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.len)) best = { index: m.index, len: m[0].length, value: v };
  }
  return best;
}
function allMatches<T>(s: string, list: { re: RegExp; v: T }[]): T[] {
  const out: { i: number; v: T }[] = [];
  for (const { re, v } of list) {
    const m = re.exec(s);
    if (m && !out.some((o) => o.v === v)) out.push({ i: m.index, v });
  }
  return out.sort((a, b) => a.i - b.i).map((o) => o.v);
}

function clampText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, "") + "…";
}

const QUOTE_RE = /"([^"]+)"|“([^”]+)”|«([^»]+)»|„([^“”]+)[“”]/g;
const SCREENPLAY_RE = /^\s*(masha|bear|mishka|lady bear|she-bear|rival bear|himalayan bear|hare|rabbit|rosie|pig|squirrel|маша|медведь|мишка|миша|медведица|медведь-спортсмен|гималайский медведь|заяц|зайчик|свинка|розочка|белка|белочка)\s*:\s*(.+)$/i;

function actorFromName(name: string): ActorId {
  const n = name.trim().toLowerCase();
  for (const lex of Object.values(LEXICONS)) {
    const hit = lex.actors.find(a => a.re.test(n));
    if (hit) return hit.id;
  }
  return "masha";
}

function beat(actor: ActorId, verb: Verb, extra: Partial<Beat> = {}): Beat {
  return {
    actor, verb, target: null, item: null, line: null, emote: null, sfx: null,
    emotion: VERB_EMOTION[verb] ?? "neutral", with_previous: false, delay_s: 0, shot: "auto", ...extra,
  };
}

export function parseParagraph(text: string, lang: Lang, startState: WorldState, options: ParseOptions = {}): BeatScript {
  const lex = LEXICONS[detectLang(text)];
  const pf = preFilter(text.slice(0, MAX_PARAGRAPH_CHARS), lex.lang, lang);
  const src = pf.text;
  // canon characters not in the prototype (Hare, Penguin, Dasha…) are played by Masha/Bear, with an honest note —
  // in the narration only, after the child's words (quotes, dash and screenplay lines) were taken out verbatim (§4.2)
  const caHits: RuleHit[] = [];
  const narration = (t: string): string => {
    const ca = substituteCanonAbsent(t, lex.lang, lang);
    for (const h of ca.hits) if (!caHits.some((x) => x.original.toLowerCase() === h.original.toLowerCase())) caHits.push(h);
    return ca.text;
  };

  const quotes: string[] = [];
  const holding = Object.fromEntries(ACTOR_IDS.map((id) => [id, startState.actors[id]?.holding ?? null])) as Record<ActorId, PropId | null>;
  /** the last subject was "the wolves" (so "they" means the Wolves) */
  let lastWolvesPlural = false;
  const beats: Beat[] = [];
  const ambience: Ambience[] = [];
  let music: MusicCue | null = null;
  let tod: TimeOfDay | null = null;
  let lastActor: ActorId | null = null;
  const carrotLocations=Object.fromEntries(CARROT_IDS.map(id=>[id,startState.props[id]?.at??'garden']));
  const carrotPlanted=Object.fromEntries(CARROT_IDS.map(id=>[id,startState.props[id]?.planted??startState.props[id]?.at==='garden']));
  let lastProp: PropId | null = null;
  let lastOpenable:'door'|'cupboard'|null=null;

  // --- 1. lines: screenplay "NAME: text" and RU dash dialogue become explicit sentences ---
  const sentences: { text: string; speaker?: ActorId; line?: string }[] = [];
  for (const rawLine of src.split(/\n+/)) {
    const ln = rawLine.trim();
    if (!ln) continue;
    const sp = SCREENPLAY_RE.exec(ln);
    if (sp) { sentences.push({ text: "", speaker: actorFromName(sp[1]), line: sp[2].trim() }); continue; }
    const dash = /^[—–-]\s*(.+?)\s*(?:[—–]\s*(.+))?$/.exec(ln);
    let body = ln;
    if (dash) {
      // "— Мишка, вставай! — кричит Маша."  → quote + narration
      body = dash[2] ? `«${dash[1]}» ${dash[2]}` : `«${dash[1]}»`;
    }
    const original = body;
    body = body.replace(QUOTE_RE, (_m, a, b, c, d, offset: number) => {
      const q = String(a ?? b ?? c ?? d).trim();
      quotes.push(q);
      // `Masha shouts, "Wake up!" Bear jumps.` — a quote that ends a sentence after narration closes that sentence;
      // a quote that opens a sentence (`"Wake up!" Masha shouts.`) keeps its attribution that follows.
      const lead = original.slice(0, offset).split(/[.!?…](?=\s)/).pop() ?? "";
      const closes = /[.!?…]$/.test(q) && /\p{L}/u.test(lead.replace(QUOTE_RE, ""));
      return ` ⟦${quotes.length - 1}⟧${closes ? " \u0001" : " "}`;
    });
    for (const s of body.split(/(?<=[.!?…])\s+|\u0001/)) if (s.trim()) sentences.push({ text: narration(s.trim()) });
  }
  pf.hits.push(...caHits);

  // --- 2. per sentence ---
  for (const sen of sentences) {
    const before = beats.length;
    if (sen.speaker && sen.line != null) {
      const ln = sen.line;
      const verb: Verb = /!/.test(ln) ? "wave" : /\?/.test(ln) ? "shrug" : "idle";
      const target = verb === "wave" ? otherActor(sen.speaker) : null;
      beats.push(beat(sen.speaker, verb, { line: clampText(ln, MAX_LINE_CHARS), target, emotion: /!/.test(ln) ? "excited" : /\?/.test(ln) ? "curious" : "neutral" }));
      lastActor = sen.speaker;
      continue;
    }
    const lower = sen.text.toLowerCase();
    const noQuotes = lower.replace(/⟦\d+⟧/g, " ");

    // sounds and time of day (whole sentence, outside quotes)
    const sentenceSfx: SfxId[] = allMatches(noQuotes, lex.sfx.map((x) => ({ re: x.re, v: x.id })));
    for (const a of allMatches(noQuotes, lex.ambience.map((x) => ({ re: x.re, v: x.id })))) if (!ambience.includes(a)) ambience.push(a);
    if (ambience.includes("thunderstorm") && ambience.includes("rain")) ambience.splice(ambience.indexOf("rain"), 1);
    let musicHere: MusicMood | null = null;
    if (lex.musicWord.test(noQuotes)) {
      const intensity: MusicCue["intensity"] = /\b(loud|big|full)\b|громк/.test(noQuotes) ? "full" : /\b(soft|quiet|gentle)\b|тих/.test(noQuotes) ? "soft" : "medium";
      if (lex.musicStop.test(noQuotes)) music = { mood: "none", intensity: "soft", change: "stop" };
      else {
        musicHere = lex.musicMoods.find((x) => x.re.test(noQuotes))?.mood ?? "playful";
        music = { mood: musicHere, intensity, change: "start" };
      }
    }
    const todHere = firstMatch(noQuotes, lex.timeOfDay.map((x) => ({ re: x.re, v: x.tod })))?.value ?? null;
    if (todHere) tod = todHere;

    // clauses
    const bothToken = lex.lang === "ru" ? " маша⁂ " : " masha⁂ ";
    // after "the wolves …", a "they" refers to the Wolves, not to Masha and Bear
    const lowerT: string = lastWolvesPlural ? lower.replace(lex.lang === "ru" ? /(?<!\p{L})они(?!\p{L})/gu : /\bthey\b/g, lex.lang === "ru" ? "волки" : "the wolves") : lower;
    const prepared = lowerT
      .replace(new RegExp(lex.both.source, "gu"), bothToken)
      .replace(/\s+(while|as|пока)\s+/g, ", meanwhile ")
      .replace(/^(meanwhile|тем временем)[,\s]+/, "meanwhile ");
    const clauses = prepared.split(lex.clauseSplit).map((c) => c.trim()).filter(Boolean);
    let sfxUsed = false;
    let subjectCarry: ActorId | null = lastActor;
    for (const clause0 of clauses) {
      let clause = clause0;
      const qIdx = [...clause.matchAll(/⟦(\d+)⟧/g)].map((m) => Number(m[1]));
      const plain = clause.replace(/⟦\d+⟧/g, " ").replace(/\s+/g, " ").trim();
      const simultaneous = lex.simultaneous.test(plain) || /\bmeanwhile\b/.test(plain);
      clause = plain;

      // --- actors ---
      const both = clause.includes("⁂");
      const mentions0: { i: number; len: number; id: ActorId; nominative: boolean; obj: boolean; plural: boolean }[] = [];
      for (const a of lex.actors) {
        const re = new RegExp(a.re.source, "gu");
        for (const m of clause.matchAll(re)) {
          const pre = clause.slice(Math.max(0, m.index - 12), m.index);
          const lastWord = pre.trim().split(/\s+/).pop() ?? "";
          const following = clause.slice(m.index + m[0].length).trim().split(/[^\p{L}]+/u)[0];
          if (["hare", "rosie", "squirrel"].includes(a.id) && isCanonAbsentCompound(lastWord, m[0], following)) continue;
          if (a.id === "rosie" && /^розочк[иеу]/u.test(m[0]) && !/(свин|хрюш|порос)/u.test(clause)) continue;
          const possessive = /^['’]s\b/.test(clause.slice(m.index + m[0].length));
          mentions0.push({ i: m.index, len: m[0].length, id: a.id, nominative: a.nominative, plural: !!a.plural, obj: possessive || (lex.objectPrepositions.test(lastWord) && new RegExp(`^(?:${lex.objectPrepositions.source})$`, "u").test(lastWord)) });
        }
      }
      // "the little wolf" also contains "wolf": keep only the longest of overlapping mentions
      const mentions = mentions0.filter((m) => !mentions0.some((o) => o !== m && o.len > m.len && o.i <= m.i && o.i + o.len >= m.i + m.len));
      mentions.sort((x, y) => x.i - y.i);
      let subject: ActorId | null = null;
      const subjMention = (lex.lang === "ru" ? mentions.find((m) => m.nominative && !m.obj) : null) ?? mentions.find((m) => !m.obj);
      if (subjMention) subject = subjMention.id;
      else {
        const sp = firstMatch(clause, lex.pronouns.filter((p) => p.subject).map((p) => ({ re: p.re, v: p.id })));
        if (sp && sp.index < 3) {
          const previous=subjectCarry??lastActor;
          const feminine=(id:ActorId)=>['masha','lady_bear','rosie','squirrel'].includes(id);
          subject=previous && feminine(previous)===feminine(sp.value) ? previous : sp.value;
        }
      }
      const wolvesPlural: boolean = subjMention ? subjMention.plural : subject == null && lastWolvesPlural && (subjectCarry ?? lastActor) === "wolf_a";
      const subjectExplicit = subject != null;
      // a sentence that names someone else ("Masha and Bear laugh") ends "they" = the Wolves, parsed or not
      if ((subjMention && !subjMention.plural) || both || (subjectExplicit && !isWolf(subject!))) lastWolvesPlural = false;
      if (!subject) subject = subjectCarry ?? lastActor ?? "masha";
      let object: ActorId | null = mentions.find((m) => m.id !== subject && !(wolvesPlural && isWolf(m.id)))?.id ?? null;
      if (!object) {
        const op = firstMatch(clause, lex.pronouns.filter((p) => !p.subject && p.id !== subject).map((p) => ({ re: p.re, v: p.id })));
        if (op) object = op.value;
      }

      // --- verb ---
      const vm = firstMatch(clause, lex.verbs.map((x) => ({ re: x.re, v: x.verb })));
      let verb: Verb | null = vm?.value ?? null;
      const speechHit = lex.speech.test(clause);
      const emoteHit = firstMatch(clause, lex.emotes.map((x) => ({ re: x.re, v: x.emote })))?.value ?? null;
      const emotionHit = firstMatch(clause, lex.emotions.map((x) => ({ re: x.re, v: x.emotion })))?.value ?? null;
      let line = qIdx.length ? clampText(qIdx.map((i) => quotes[i]).join(" "), MAX_LINE_CHARS) : null;
      if (!line && speechHit && !vm) line = unquotedSpeech(clause, lex);
      let emotion: Emotion | null = emotionHit;
      const prevInSentence = beats.length > before ? beats[beats.length - 1] : null;
      if (!verb && line && !speechHit && !subjectExplicit && prevInSentence && prevInSentence.line == null && prevInSentence.actor === subject) {
        // `Masha shouts, "Bear, wake up!"` → the quote belongs to the speech beat before the comma
        prevInSentence.line = line;
        if (!emotionHit && /!/.test(line) && prevInSentence.emotion === "neutral") prevInSentence.emotion = "excited";
        continue;
      }
      if (!verb && (speechHit || line)) {
        const sv = firstMatch(clause, lex.speechVerb.map((x) => ({ re: x.re, v: x })))?.value;
        verb = sv?.verb ?? (line && /!/.test(line) ? "wave" : line && /\?/.test(line) ? "shrug" : "idle");
        emotion = emotion ?? sv?.emotion ?? (line && /!/.test(line) ? "excited" : line && /\?/.test(line) ? "curious" : null);
      }
      if (!verb && emoteHit) verb = "idle";
      if (!verb && emotionHit && subjectExplicit) verb = EMOTION_VERB[emotionHit];
      if (!verb) {
        // a clause with only a place/prop refines the previous beat of this sentence
        const prev = beats.length > before ? beats[beats.length - 1] : null;
        const mk = firstMatch(clause, lex.marks.map((x) => ({ re: x.re, v: x.id })))?.value;
        if (prev && mk && prev.target == null && (LOCO.includes(prev.verb) || prev.verb === "sit" || prev.verb === "hide")) prev.target = mk;
        if (subjectExplicit) { subjectCarry = subject; lastActor = subject; }
        continue;
      }
      // a clause whose subject is a thing ("the sun goes down", «мяч падает») makes no beat
      if (vm && !subjectExplicit) {
        const th = lex.things.exec(clause);
        if (th && (th.index < vm.index || (lex.lang === "ru" && lex.weather.test(clause)))) continue;
      }

      // --- targets ---
      const cupboardMention=/\b(?:cupboard|cabinet|pantry)\b|шкаф|буфет/iu.test(clause);
      const containerMention=/\b(?:bowl)\b|миск/iu.test(clause)?'kitchen_bowl':/\b(?:(?:cooking|kitchen|enamel|soup) )?pot\b|кастрюл|кот[её]л/iu.test(clause)&&!/(?:honey pot|pot of honey)/iu.test(clause)?'kitchen_pot':null;
      const mark = containerMention??(cupboardMention?'cupboard':firstMatch(clause, lex.marks.map((x) => ({ re: x.re, v: x.id })))?.value ?? null);
      if(mark==='cupboard'||mark==='door')lastOpenable=mark;
      let prop = firstMatch(clause, lex.props.map((x) => ({ re: x.re, v: x.id })))?.value ?? null;
      const invalidCarrotNumber=/(?:carrot(?:s)?|морков\p{L}*)\s*(?:number|no\.?|#|номер|№)?\s*(\d+)/iu.exec(clause);
      if(invalidCarrotNumber&&(Number(invalidCarrotNumber[1])<1||Number(invalidCarrotNumber[1])>9)){verb='shrug';}
      const numbered=numberedCarrot(clause);
      if(prop==='carrot'&&!numbered){
        const held=holding[subject];
        const candidates=CARROT_IDS.filter(id=>carrotLocations[id]&&!['hidden',...ACTOR_IDS].includes(carrotLocations[id])&&(!mark||carrotLocations[id]===mark));
        const selected=candidates.find(id=>carrotPlanted[id])??candidates[0];
        if(verb!=='take'&&held&&isCarrot(held))prop=held;
        else if(selected)prop=selected;
        else if(verb==='take'){verb='shrug';prop=null;}
      }
      prop=numbered??prop;
      if (!prop && lex.itPronoun.test(clause) && lastProp) prop = lastProp;
      if (prop) lastProp = prop;

      const made: Beat[] = [];
      const a = subject;
      const o = otherActor(a);
      const mkBeat = (actor: ActorId, v: Verb, extra: Partial<Beat> = {}) => {
        const b = beat(actor, v, extra);
        if (emotion && !extra.emotion) b.emotion = emotion;
        made.push(b);
        return b;
      };

      switch (verb) {
        case 'open': case 'close':
          {const previous:'door'|'cupboard'|null=lastOpenable??(startState.actors[a].mark==='cupboard'?'cupboard':startState.actors[a].mark==='door'?'door':null);
          const target:'door'|'cupboard'|null=mark==='door'||mark==='cupboard'?mark:lex.itPronoun.test(clause)?previous:null;
          if(target){mkBeat(a,verb,{target});lastOpenable=target;}}
          break;
        case "walk_to": case "run_to": case "tiptoe_to": {
          // the Wolves go for the food first ("sneak up to steal Bear's honey" → the honey pot)
          let target: string | null = isWolf(a) ? mark ?? prop ?? object : mark ?? object ?? prop;
          // Going TO the house is an approach. Going INSIDE is a threshold crossing.
          if(target==='house_living'&&/\b(?:to|towards?)\s+(?:the\s+)?(?:house|cabin|hut)\b|к\s+дому|к\s+домик/iu.test(clause))target='door';
          // a Wolf running off with nowhere named scampers back to the van
          if (!target && isWolf(a) && verb === "run_to") target = "van";
          if (!target) target = startState.actors[a].mark === "clearing" ? "table" : "clearing";
          mkBeat(a, verb, { target });
          break;
        }
        case "chase": case "hug": mkBeat(a, verb, { target: object ?? o }); break;
        case "exit":
          if (isWolf(a)) mkBeat(a, "run_to", { target: "van", emotion: emotion ?? "scared" }); // the Wolves flee to their van
          else if(isInteriorMark(mark))mkBeat(a,'walk_to',{target:'clearing'});
          else mkBeat(a, verb);
          break;
        case "enter":
          if(/\breturn(?:s|ed)?\b|возвращ|вернул/iu.test(clause)&&startState.actors[a].posture!=='offstage'){
            mkBeat(a,mark?'walk_to':'look_at',{target:mark??prop??lastProp??'bench'});break;
          }
          if(isInteriorMark(mark))mkBeat(a,'walk_to',{target:mark});
          else if(mark==='door'||beats.some(b=>b.actor===a&&b.target==='door')||startState.actors[a].mark==='door')mkBeat(a,'walk_to',{target:'house_living'});
          else mkBeat(a,verb);
          break;
        case "carry":
          if(prop&&mark){
            if(holding[a]!==prop){mkBeat(a,'take',{target:prop,item:prop});holding[a]=prop;if(isCarrot(prop)){carrotLocations[prop]=a;carrotPlanted[prop]=false;}}
            mkBeat(a,'walk_to',{target:mark});break;
          }
          if (isWolf(a)) { // Wolves don't carry Masha: they grab the thing, or just eye it
            if (prop) { mkBeat(a, "take", { target: prop, item: prop }); holding[a] = prop; }
            else mkBeat(a, "look_at", { target: mark ?? object ?? null });
            break;
          }
          mkBeat("bear", "carry", { target: "masha", emotion: a === "masha" ? "happy" : emotion ?? "happy" });
          if (mark) mkBeat("bear", "walk_to", { target: mark, emotion: "happy" });
          break;
        case "wake_up":
          if (object && object !== a) {
            mkBeat(a, "wave", { target: object, emotion: emotion ?? "excited" });
            mkBeat(object, "wake_up", { emotion: "sleepy" });
          } else mkBeat(a, "wake_up");
          break;
        case "scared":
          if (object && object !== a && subjectExplicit) {
            mkBeat(a, "jump", { emotion: "mischievous" });
            mkBeat(object, "scared", { emotion: "scared" });
          } else mkBeat(a, "scared");
          break;
        case "swing":
          if (a !== "masha") mkBeat(a, "look_at", { target: "swing" });
          else mkBeat(a, "swing");
          break;
        case "take": {
          const fromCupboard:boolean=mark==='cupboard'||!mark&&(lastOpenable==='cupboard'||startState.actors[a].mark==='cupboard');
          const pantryItem:boolean=fromCupboard&&(!prop||prop==='honey_pot'||/honey|м[её]д/iu.test(clause));
          const fromContainer:boolean=mark==='kitchen_bowl'||mark==='kitchen_pot';
          const contained:PropId|undefined=fromContainer?CARROT_IDS.find(id=>carrotLocations[id]===mark):undefined;
          const p: PropId | null = pantryItem?'pantry_honey':prop ?? contained ?? (mark === "garden" ? "carrot" : mark === "beehive" ? "honey_pot" : null);
          if(fromContainer&&(!p||carrotLocations[p]!==mark)){mkBeat(a,'look_at',{target:mark});break;}
          if (p) { mkBeat(a, "take", { target: p, item: p }); holding[a] = p; lastProp = p;if(isCarrot(p)){carrotLocations[p]=a;carrotPlanted[p]=false;} }
          else mkBeat(a, "peek", { target: mark ?? null });
          break;
        }
        case "nudge": {
          const item:PropId=prop??"ball";mkBeat(a,"nudge",{item,target:mark??"bench"});lastProp=item;break;
        }
        case "put_down": {
          const item:PropId|null=prop??holding[a];
          if(item){mkBeat(a,"put_down",{item,target:mark??startState.actors[a].mark??"clearing"});holding[a]=null;lastProp=item;if(isCarrot(item)){carrotLocations[item]=mark??"clearing";carrotPlanted[item]=false;}}
          break;
        }
        case "give": {
          const item = prop ?? holding[a];
          if (item) { mkBeat(a, "give", { target: object ?? o, item }); holding[a] = null; holding[object ?? o] = item;if(isCarrot(item))carrotLocations[item]=object??o; }
          else mkBeat(a, "wave", { target: object ?? o });
          break;
        }
        case "eat": {
          const held = holding[a];
          const item = prop ?? (held && PROPS[held].edible ? held : a === "masha" ? "jam_jar" : a === "wolf_b" ? "pancakes" : "honey_pot");
          mkBeat(a, "eat", { item });if(isCarrot(item))carrotLocations[item]="hidden";
          if (isCarrot(item)||["pancakes", "fish", "cake", "lollipop"].includes(item)) holding[a] = null; else holding[a] = item;
          break;
        }
        case "drop": {
          const item:PropId=prop??holding[a]??'ball';
          mkBeat(a,'drop',{item});
          if(isCarrot(item)){carrotLocations[item]=mark??startState.actors[a].mark??'clearing';carrotPlanted[item]=false;}
          holding[a]=null;lastProp=item;break;
        }
        case "throw": {
          const item = prop ?? holding[a] ?? "ball";
          const target: MarkId | ActorId | null = mark ?? object ?? null;
          mkBeat(a, "throw", { item, target });
          holding[a] = null;if(isCarrot(item)){carrotLocations[item]=target??"clearing";carrotPlanted[item]=false;}
          break;
        }
        case "sit": case "sleep": case "hide": case "cook": mkBeat(a, verb, { target: mark }); break;
        case "look_at": case "point_at": case "wave": case "peek":
          mkBeat(a, verb, { target: mark ?? object ?? prop ?? null });
          break;
        default:
          mkBeat(a, verb);
      }
      if (!made.length) continue;

      // line, emote, sfx, timing
      const speakerBeat = made.find((b) => b.actor === a) ?? made[0];
      if (line) {
        speakerBeat.line = line;
        if (!emotionHit && /!/.test(line) && speakerBeat.emotion === "neutral") speakerBeat.emotion = "excited";
      }
      if (emoteHit) speakerBeat.emote = allowedEmote(speakerBeat.actor, emoteHit);
      const clauseSfx = firstMatch(clause, lex.sfx.map((x) => ({ re: x.re, v: x.id })))?.value ?? null;
      if (clauseSfx && !sfxUsed) { speakerBeat.sfx = clauseSfx; sfxUsed = true; }
      if (simultaneous && beats.length > 0) made[0].with_previous = true;
      // "the wolves sneak…" → both Wolves do it, side by side and in parallel
      if (wolvesPlural && made.length === 1 && isWolf(made[0].actor) && !NO_TWIN.has(made[0].verb)) {
        const twin: Beat = { ...made[0], actor: "wolf_b", line: null, sfx: null, with_previous: true, delay_s: 0.2 };
        if (twin.target === "wolf_b") twin.target = "wolf_a";
        made.push(twin);
      }
      // "Masha and Bear dance" → both do it, in parallel
      if (both && made.length === 1 && GRAMMAR_BOTH.has(made[0].verb)) {
        const twin = { ...made[0], actor: otherActor(made[0].actor), line: null, emote: null, sfx: null, with_previous: true };
        if (twin.target === twin.actor) twin.target = made[0].actor;
        made.push(twin);
      }
      for (const b of made) {
        const prev = beats.length > before ? beats[beats.length - 1] : null;
        if (prev && prev.actor === b.actor && prev.verb === b.verb && !(prev.line && b.line)) {
          // "lies down in the hammock and starts to snore" → one sleep beat
          prev.target = prev.target ?? b.target;
          prev.item = prev.item ?? b.item;
          prev.line = prev.line ?? b.line;
          prev.emote = prev.emote ?? b.emote;
          prev.sfx = prev.sfx ?? b.sfx;
        } else beats.push(b);
      }
      lastActor = a;
      subjectCarry = a;
      lastWolvesPlural = wolvesPlural && isWolf(a);
    }

    // ≥ 1 beat per sentence: sound-only / unparsed sentences get a reaction beat
    if (beats.length === before) {
      const who: ActorId = lastActor ?? "masha";
      const sfx = sentenceSfx[0] ?? null;
      let b: Beat;
      if (sfx) b = beat(who, ["thunder_clap", "crash", "door_slam", "van_horn", "pot_clang"].includes(sfx) ? "surprised" : "look_at", { sfx });
      else if (musicHere) {
        const v: Verb = musicHere === "spooky" || musicHere === "tense" ? "peek" : musicHere === "sleepy" ? "yawn_stretch" : musicHere === "sad" ? "sigh" : musicHere === "calm" ? "look_at" : musicHere === "chase" ? "jump" : "dance";
        b = beat(who, v);
      } else if (music?.change === "stop") b = beat(who, "shrug");
      else if (todHere === "night") b = beat(who, "yawn_stretch");
      else if (allMatches(noQuotes, lex.ambience.map((x) => ({ re: x.re, v: x.id }))).length) b = beat(who, "look_at", { emotion: "curious" });
      else b = beat(who, "look_at", { target: otherActor(who) });
      if (sentenceSfx.length && !sfx) b.sfx = sentenceSfx[0];
      beats.push(b);
    }
  }

  // --- 3. ≥ 2 beats per paragraph: a reaction from the other character ---
  if (beats.length === 0) beats.push(beat("masha", "look_at", { target: "bear" }));
  if (beats.length < 2) {
    const first = beats[0];
    const reactor = isWolf(first.actor) ? "masha" : otherActor(first.actor);
    if (startState.actors[reactor].posture !== "offstage") beats.push(reactionBeat(reactor, first));
    else beats.push(beat(first.actor, first.actor === "masha" ? "laugh" : "nod"));
  }

  // --- 4. paragraph-level fields ---
  const finalMusic: MusicCue = music ?? { mood: options.prevMusicMood && options.prevMusicMood !== "none" ? options.prevMusicMood : "playful", intensity: "soft", change: "continue" };
  const mood: Mood = moodFor(finalMusic.mood, beats);
  const summary = makeSummary(substituteCanonAbsent(src, lex.lang, lang).text, quotes, beats, lang);
  const bs: BeatScript = {
    summary,
    time_of_day: tod,
    mood,
    music: finalMusic,
    ambience: ambience.length ? ambience : null,
    beats: beats.slice(0, MAX_BEATS),
    rule_hits: pf.hits,
  };
  return validateBeatScript(bs, startState, lang).beatScript;
}

/** Replace canon-but-absent characters in the narration with their stand-in's name. The child's words stay verbatim:
 *  quotes, the speech of a dash-dialogue line («— Зайка, иди сюда! — кричит Маша.») and screenplay lines ("MASHA: …"). */
export function substituteCanonAbsent(text: string, textLang: Lang, uiLang: Lang): { text: string; hits: RuleHit[] } {
  const hits: RuleHit[] = [];
  const subNarration = (part: string): string => {
    let out = "";
    let at = 0;
    for (const m of findCanonAbsent(part)) {
      const rep = m.def.sub === "masha" ? (textLang === "ru" ? "Маша" : "Masha") : textLang === "ru" ? "Мишка" : "Bear";
      const word = part.slice(m.index, m.index + m.length);
      if (!hits.some((h) => h.original.toLowerCase() === word.toLowerCase())) hits.push({ rule: "cast_only", original: word, replacement: rep, kid_message: canonAbsentMessage(m.def, uiLang) });
      // drop a leading English article ("the hare" → "Masha")
      const head = part.slice(at, m.index).replace(/(?<![\p{L}])(?:the|a|an)\s+$/iu, "");
      out += head + rep;
      at = m.index + m.length;
    }
    return out + part.slice(at);
  };
  const subLine = (line: string): string => {
    if (SCREENPLAY_RE.test(line.trim())) return line; // "MASHA: …" is all the child's line
    const dash = /^(\s*[—–-]\s*)(.+?)(\s*[—–]\s*)(.+)$/.exec(line);
    if (dash) return dash[1] + dash[2] + dash[3] + subQuoted(dash[4]); // «— line — narration»
    if (/^\s*[—–-]/.test(line)) return line; // «— line» with no narration
    return subQuoted(line);
  };
  const subQuoted = (t: string): string =>
    t.split(/("[^"]*"|“[^”]*”|«[^»]*»|„[^“”]*[“”])/u).map((part, i) => (i % 2 === 1 ? part : subNarration(part))).join("");
  return { text: text.split(/(\n+)/).map((ln, i) => (i % 2 === 1 ? ln : subLine(ln))).join(""), hits };
}

/** Unquoted speech: "Bear says thank you to Masha" → "Thank you". Returns null when nothing is left to say. */
function unquotedSpeech(clause: string, lex: Lexicon): string | null {
  const m = new RegExp(lex.speech.source, "u").exec(clause);
  if (!m) return null;
  let rest = clause.slice(m.index + m[0].length).replace(/^\p{L}*/u, "");
  if (/^\s*(?:that|что|about|про|о|об)\b/u.test(rest) || /^\s*(?:that|что|about|про|о|об)(?![\p{L}])/u.test(rest)) return null; // indirect speech
  for (const a of lex.actors) rest = rest.replace(new RegExp(`(?:(?:${lex.objectPrepositions.source})\\s+)?${a.re.source}`, "gu"), " ");
  for (const p of lex.pronouns) rest = rest.replace(new RegExp(p.re.source, "gu"), " ");
  rest = rest.replace(/⁂/g, " ").replace(/^\s*(?:loudly|quietly|softly|громко|тихо|тихонько)(?![\p{L}])/u, " ").replace(/[\s,.:;—–-]+/g, " ").trim();
  if (!/\p{L}/u.test(rest) || rest.length > 60 || rest.split(" ").length > 8) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Verbs a "the wolves" clause does NOT duplicate for the second Wolf (one object, or the verb already involves both). */
const NO_TWIN = new Set<Verb>(["take", "give", "eat", "throw", "hug", "carry", "cook", "fish", "swing", "water_plants"]);
const GRAMMAR_BOTH = new Set<Verb>(["dance", "jump", "spin", "laugh", "clap", "walk_to", "run_to", "tiptoe_to", "sit", "wave", "look_at", "cry", "sigh", "eat", "hide", "sleep", "yawn_stretch", "surprised", "scared"]);

function reactionBeat(reactor: ActorId, first: Beat): Beat {
  const v = first.verb;
  if (isWolf(first.actor)) {
    // Masha watches the Wolves' antics (and laughs at their slapstick)
    if (v === "fall_down" || v === "sneeze" || v === "scared") return beat(reactor, "laugh");
    return beat(reactor, "point_at", { target: first.actor, emotion: "curious" });
  }
  if (reactor === "bear") {
    if (v === "fall_down" || v === "sneeze") return beat("bear", "surprised", { emote: "gasp" });
    if (["dance", "spin", "swing", "jump", "clap"].includes(v)) return beat("bear", "nod", { emotion: "happy", emote: "chuckle" });
    if (["take", "eat", "throw", "run_to", "chase"].includes(v)) return beat("bear", "facepalm", { emote: "sigh" });
    return beat("bear", "look_at", { target: "masha", emotion: "curious" });
  }
  if (v === "fall_down" || v === "sneeze") return beat("masha", "laugh");
  if (["dance", "cook", "fish", "water_plants", "carry"].includes(v)) return beat("masha", "clap");
  if (v === "sleep") return beat("masha", "peek", { target: "bear" });
  return beat("masha", "wave", { target: "bear" });
}

function moodFor(m: MusicMood, beats: Beat[]): Mood {
  if (m === "spooky" || m === "tense" || m === "chase") return "tense";
  if (m === "sleepy") return "sleepy";
  if (m === "sad") return "sad";
  if (m === "triumphant") return "triumphant";
  if (m === "calm" || m === "romantic_waltz") return "calm";
  if (beats.some((b) => b.verb === "sleep") && !beats.some((b) => b.verb === "wake_up")) return "sleepy";
  if (beats.filter((b) => b.emotion === "sad").length > beats.length / 2) return "sad";
  return "playful";
}

function makeSummary(src: string, quotes: string[], beats: Beat[], lang: Lang): string {
  const textLang = detectLang(src);
  if (textLang === lang) {
    const first = src.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).slice(0, 2).join(" ");
    const s = first.length > MAX_SUMMARY_CHARS ? first.split(/(?<=[.!?…])\s+/)[0] : first;
    if (s.trim()) return clampText(s.trim(), MAX_SUMMARY_CHARS);
  }
  void quotes;
  const lx = LEXICONS[lang];
  const parts: string[] = [];
  for (const b of beats.slice(0, 3)) parts.push(`${lx.names[b.actor]} ${lx.verbLabels[b.verb]}`);
  const s = parts.join(", ");
  return clampText(s.charAt(0).toUpperCase() + s.slice(1) + ".", MAX_SUMMARY_CHARS);
}
