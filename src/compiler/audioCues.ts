// Compiler-side audio cue resolution (spec §7.6). Pure.
// Foley from gait contacts and FoleyRules, effort vocals and beat emotes, event SFX, music/ambience resolution
// across paragraphs (CarryAudio), ducking under dialogue. Gains are SOURCE loudness (the engine attenuates by
// distance); pans are estimates relative to the planned camera.
import { surfaceAt } from "../shared/bible/set";
import { GRAMMAR, SPEEDS, STRIDE, STRIDE_SCALE, WALK_TO_RUN_SPEED_FACTOR, isWolf, type FoleyRule, type Gait } from "../shared/grammar";
import { ACTOR_IDS } from "../shared/schema";
import type {
  ActorClip, ActorId, Ambience, AmbienceCue, BeatScript, CameraCue, DialogueCue, DuckingCue, Emote, EmoteCue,
  FoleyCue, MusicMood, MusicTrackCue, SfxCue, SfxId, Surface, TimeOfDay, Vec2,
} from "../shared/schema";
import { panFor } from "./camera";
import { pathLength, pointAlong } from "./path";
import type { CarryAudio } from "./types";
import { allowedEmote } from "./validate";
import { clapContactTimes } from "../shared/contactTiming";

export const EMPTY_CARRY: CarryAudio = { music: null, ambience: [] };
export const DUCK_DEPTH_DB = 8;

/** Approximate durations of vocal emotes (s). */
export const EMOTE_DUR: Record<Emote, number> = {
  none: 0, giggle: 0.8, laugh: 1.4, gasp: 0.5, wheee: 1.0, hmph: 0.6, uh_oh: 0.8, yawn: 1.5, cry: 1.5, cheer: 0.9,
  scream_fun: 1.0, grunt: 0.6, sigh: 1.2, hum: 1.6, growl_soft: 0.9, chuckle: 0.9, snore: 1.8, huff: 0.5, roar_soft: 1.2, sneeze: 0.8,
  howl: 1.9, whimper: 0.9, snicker: 0.8,
};

/** Ambience layers that make the ground wet: footsteps on grass/dirt splash (B12). */
export const WET_AMBIENCE: readonly Ambience[] = ["rain", "thunderstorm"];
export function isWet(layers: readonly Ambience[]): boolean {
  return layers.some((l) => WET_AMBIENCE.includes(l));
}
/** Footstep surface: under rain, grass and dirt become splashy puddles ("water"); boards stay wood. */
export function footSurface(x: number, z: number, wet: boolean): Surface {
  const s = surfaceAt(x, z);
  return wet && (s === "grass" || s === "dirt") ? "water" : s;
}

/** Fraction of the clip at which a verb's effort vocal fires. */
const EFFORT_AT: Partial<Record<string, number>> = { jump: 0.15, fall_down: 0.3, throw: 0.4, stand_up: 0.2, carry: 0.4, spin: 0.2, swing: 0.25 };

/** Default ambience by time of day (day → birds + light wind; night → crickets). */
export function defaultAmbience(tod: TimeOfDay): Ambience[] {
  if (tod === "night") return ["night_crickets"];
  if (tod === "sunset") return ["forest_wind", "night_crickets"];
  return ["birds_day", "forest_wind"];
}

/** One per non-ambient clip produced from a beat (main clip carries emote/line/sfx; pre-clips don't). */
export interface AudioBeatEvent {
  actor: ActorId;
  verb: string;
  start: number;
  dur: number;
  emote: Emote | null;
  hasLine: boolean;
  sfx: SfxId | null;
  /** absolute time of the sfx */
  sfxAt: number;
  pos: Vec2;
  /** true for the clip that realises the beat itself (not an auto-walk / transition) */
  main: boolean;
}

export interface AudioCueInput {
  bs: BeatScript;
  actorClips: Record<ActorId, ActorClip[]>;
  events: AudioBeatEvent[];
  /** extra event sounds the compiler infers (e.g. splash when something lands in the pond) */
  extraSfx: { t: number; id: SfxId; pos: Vec2 }[];
  dialogue: DialogueCue[];
  camera: CameraCue[];
  timeOfDay: TimeOfDay;
  /** time of day changed in this paragraph (for default-ambience switching) */
  prevTimeOfDay: TimeOfDay;
  carry: CarryAudio;
  isFirst: boolean;
  duration: number;
  musicMoodOverride: MusicMood | null;
}

export interface AudioCueOutput {
  foley: FoleyCue[];
  emotes: EmoteCue[];
  sfx: SfxCue[];
  music: MusicTrackCue[];
  ambience: AmbienceCue[];
  ducking: DuckingCue[];
  carry: CarryAudio;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function clipPosAt(c: ActorClip, t: number): Vec2 {
  const p = c.params;
  if (p.path && p.path.length > 1) {
    const k = Math.max(0, Math.min(1, (t - c.start) / Math.max(1e-6, c.dur)));
    return pointAlong(p.path, k * pathLength(p.path));
  }
  return p.from ?? p.to ?? [0, 0];
}

/** Gait of a locomotion clip (matches the engine's leg cycle): run_to/chase run, tiptoe_to tiptoes, the rest walk —
 *  but a walk hurried past 1.7× the natural walk speed becomes a run. */
export function gaitFor(actor: ActorId, verb: string, speed: number): Gait {
  if (verb === "run_to" || verb === "chase") return "run";
  if (verb === "tiptoe_to") return "tiptoe";
  return speed > SPEEDS[actor].walk_to * WALK_TO_RUN_SPEED_FACTOR ? "run" : "walk";
}

/** Footsteps / foley for one clip from its verb's FoleyRules. `wet` = rain/thunderstorm ambience is on (B12). */
export function foleyForClip(actor: ActorId, c: ActorClip, camera: CameraCue[], wet = false): FoleyCue[] {
  if (c.params.ambient || c.params.posture === "carried" || c.params.posture === "offstage") return [];
  const out: FoleyCue[] = [];
  const heavy = actor === "bear";
  // Wolves are light-footed: softer steps than Masha's
  const light = isWolf(actor) ? 0.75 : 1;
  const push = (t: number, id: FoleyCue["id"], gain: number, pos: Vec2) => {
    const surface = id === "footstep" || id === "footstep_heavy" || id === "landing_thud" || id === "ground_thump" ? footSurface(pos[0], pos[1], wet) : surfaceAt(pos[0], pos[1]);
    const gl = id === "footstep" ? gain * light : gain;
    out.push({ start: r3(t), actor, id, surface, gain: Math.round(gl * 100) / 100, pan: panFor(camera, pos, t) });
  };
  if(c.params.putDown){
    push(c.start+c.dur*.5,'prop_putdown',.8,clipPosAt(c,c.start+c.dur*.5));
    return out;
  }
  if(c.verb==='clap'){
    for(const t of clapContactTimes(c.dur))push(c.start+t,'clap',1,clipPosAt(c,c.start+t));
    return out;
  }
  for (const rule of GRAMMAR[c.verb].foley as FoleyRule[]) {
    const g = rule.gain ?? 1;
    if (rule.when === "contacts") {
      const path = c.params.path;
      if (path && path.length > 1) {
        const len = pathLength(path);
        const stride = STRIDE[actor] * STRIDE_SCALE[gaitFor(actor, c.verb, len / Math.max(1e-6, c.dur))];
        const steps = Math.max(1, Math.round(len / stride));
        for (let k = 0; k < steps; k++) {
          const f = (k + 0.5) / steps;
          const pos = pointAlong(path, f * len);
          const t = c.start + f * c.dur;
          if (rule.id === "footstep") {
            push(t, heavy ? "footstep_heavy" : "footstep", g * (heavy ? 1.0 : 0.6), pos);
            if (heavy && k % 2 === 1) push(t, "ground_thump", g * 0.45, pos);
          } else push(t, rule.id, g, pos);
        }
      } else {
        // in-place stepping (dance): one contact every 0.5 s
        for (let t = c.start + 0.25; t < c.start + c.dur; t += 0.5) {
          const pos = clipPosAt(c, t);
          push(t, rule.id === "footstep" && heavy ? "footstep_heavy" : rule.id, g * (heavy ? 0.9 : 0.5), pos);
        }
      }
      continue;
    }
    const scale = heavy && (rule.id === "body_fall" || rule.id === "landing_thud" || rule.id === "ground_thump") ? 1.3 : 1;
    const times: number[] =
      rule.when === "start" ? [c.start]
      : rule.when === "end" ? [c.start + c.dur]
      : rule.when === "at" ? [c.start + (rule.t ?? 0.5) * c.dur]
      : (() => { const ts: number[] = []; for (let t = c.start; t < c.start + c.dur - 0.05; t += rule.every ?? 1) ts.push(t); return ts; })();
    for (const t of times) push(t, rule.id, Math.min(1.5, g * scale), clipPosAt(c, t));
  }
  return out;
}

export function buildAudioCues(input: AudioCueInput): AudioCueOutput {
  const { camera, events } = input;
  const layers = resolveAmbienceLayers(input);

  // ---- foley ---- (splashy footsteps while it rains)
  const wet = isWet(layers);
  const foley: FoleyCue[] = [];
  for (const actor of ACTOR_IDS) for (const c of input.actorClips[actor] ?? []) foley.push(...foleyForClip(actor, c, camera, wet));
  foley.sort((a, b) => a.start - b.start || a.actor.localeCompare(b.actor));

  // ---- emotes: beat emotes, effort vocals, ambient reactions, snoring ----
  const emotes: EmoteCue[] = [];
  const addEmote = (t: number, actor: ActorId, e: Emote | null) => {
    const em = allowedEmote(actor, e);
    if (!em) return;
    emotes.push({ start: r3(t), dur: EMOTE_DUR[em], actor, emote: em });
  };
  for (const ev of events) {
    const def = GRAMMAR[ev.verb as keyof typeof GRAMMAR];
    if (ev.main && ev.emote) {
      if (ev.emote === "snore" && ev.verb === "sleep") for (let t = ev.start + 0.4; t < ev.start + ev.dur - 0.5; t += 3.5) addEmote(t, ev.actor, "snore");
      else addEmote(ev.start + Math.min(0.2, ev.dur * 0.1), ev.actor, ev.emote);
    } else if (!ev.hasLine && !(ev.main && ev.emote) && def?.effortVocal) {
      if (def.effortVocal === "snore") for (let t = ev.start + 0.4; t < ev.start + ev.dur - 0.5; t += 3.5) addEmote(t, ev.actor, "snore");
      else if (def.effortVocal === "grunt" && ev.actor === "masha") { /* Masha doesn't grunt */ }
      else {
        const effort: Emote = ev.actor === "masha" && def.effortVocal === "huff" ? (ev.verb === "jump" ? "wheee" : "hmph")
          : isWolf(ev.actor) ? wolfEffort(ev.verb, def.effortVocal) : def.effortVocal;
        addEmote(ev.start + (EFFORT_AT[ev.verb] ?? 0) * ev.dur, ev.actor, effort);
      }
    }
    // Bear huffs after a long run
    if (ev.actor === "bear" && (ev.verb === "run_to" || ev.verb === "chase") && ev.dur > 2 && !ev.emote) addEmote(ev.start + ev.dur - 0.2, "bear", "huff");
    // a Wolf scampering away (scared run) yelps a whimper
    if (isWolf(ev.actor) && ev.main && ev.verb === "run_to" && !ev.emote && !ev.hasLine && ev.dur > 1.2) addEmote(ev.start + 0.15, ev.actor, "whimper");
  }
  for (const actor of ACTOR_IDS) {
    for (const c of input.actorClips[actor] ?? []) {
      if (!c.params.ambient) continue;
      if (actor === "masha" && c.verb === "laugh") addEmote(c.start + 0.1, "masha", "giggle");
      if (actor === "bear" && c.verb === "sleep") for (let t = c.start + 0.6; t < c.start + c.dur - 1.0; t += 4) addEmote(t, "bear", "snore");
      // the Wolves cower with a whimper when Bear is loud (only one Wolf whimpers per moment, to keep it light)
      if (isWolf(actor) && c.verb === "scared" && (actor === "wolf_a" || !emotes.some((e) => e.actor === "wolf_a" && Math.abs(e.start - c.start - 0.1) < 0.3))) addEmote(c.start + 0.1, actor, "whimper");
    }
  }
  emotes.sort((a, b) => a.start - b.start || a.actor.localeCompare(b.actor));

  // ---- event sfx ----
  const sfx: SfxCue[] = [];
  for (const ev of events) if (ev.main && ev.sfx) sfx.push({ start: r3(ev.sfxAt), id: ev.sfx, gain: 1, pan: ev.sfx === "thunder_clap" ? 0 : panFor(camera, ev.pos, ev.sfxAt) });
  for (const x of input.extraSfx) sfx.push({ start: r3(x.t), id: x.id, gain: 0.8, pan: panFor(camera, x.pos, x.t) });
  sfx.sort((a, b) => a.start - b.start);

  // ---- music ----
  const music: MusicTrackCue[] = [];
  const bm = input.bs.music;
  const mood: MusicMood = input.musicMoodOverride ?? bm.mood;
  let carryMusic = input.carry.music;
  if (bm.change === "stop" || mood === "none") {
    if (carryMusic) music.push({ start: 0, mood: "none", intensity: bm.intensity, fade: 1.5 });
    carryMusic = null;
  } else if (bm.change === "start") {
    music.push({ start: 0, mood, intensity: bm.intensity, fade: carryMusic ? 2.0 : 0.8 });
    carryMusic = { mood, intensity: bm.intensity };
  } else {
    // continue: keep playing if the mood (and intensity) is unchanged; otherwise crossfade
    if (!carryMusic) {
      music.push({ start: 0, mood, intensity: bm.intensity, fade: 1.0 });
    } else if (carryMusic.mood !== mood || carryMusic.intensity !== bm.intensity) {
      music.push({ start: 0, mood, intensity: bm.intensity, fade: 2.0 });
    }
    carryMusic = { mood, intensity: bm.intensity };
  }

  // ---- ambience ----
  const ambience: AmbienceCue[] = [];
  if (input.isFirst || !sameSet(layers, input.carry.ambience)) ambience.push({ start: 0, layers, fade: input.isFirst ? 0.5 : 2.0 });

  // ---- ducking: one window per dialogue cue ----
  const ducking: DuckingCue[] = input.dialogue.map((d) => ({ start: d.start, dur: d.dur, depth: DUCK_DEPTH_DB }));

  return { foley, emotes, sfx, music, ambience, ducking, carry: { music: carryMusic, ambience: layers } };
}

/** The ambience layers active in this paragraph (explicit, carried over, or the time-of-day default). */
export function resolveAmbienceLayers(input: Pick<AudioCueInput, "bs" | "carry" | "isFirst" | "timeOfDay" | "prevTimeOfDay">): Ambience[] {
  if (input.bs.ambience !== null) return [...input.bs.ambience];
  const carried = input.carry.ambience;
  const wasDefault = sameSet(carried, defaultAmbience(input.prevTimeOfDay));
  if (input.isFirst && carried.length === 0) return defaultAmbience(input.timeOfDay);
  if (input.timeOfDay !== input.prevTimeOfDay && wasDefault) return defaultAmbience(input.timeOfDay);
  return carried;
}

/** A Wolf's version of a verb's effort vocal (they whimper and snicker rather than grunt and gasp). */
function wolfEffort(verb: string, e: Emote): Emote {
  if (verb === "scared" || verb === "fall_down" || verb === "cry") return "whimper";
  if (verb === "laugh" || verb === "sulk") return "snicker";
  if (e === "wheee") return "howl";
  return e;
}

function sameSet(a: Ambience[], b: Ambience[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
