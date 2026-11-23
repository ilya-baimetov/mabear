// Emotion cues/transitions, eye look-at, blink, visemes, and talking body layers.
import type { ActorFrame, FaceParams } from "../api";
import { cookingSupportHeightAt } from "../../shared/cookingStation";
import { LOCOMOTION_VERBS } from "../../shared/grammar";
import { clamp, clamp01, smooth, window01 } from "../../shared/math";
import { ACTOR_IDS, type ActorClip, type ActorId, type Emotion, type Posture, type Segment, type Timeline, type Vec3, type Viseme } from "../../shared/schema";
import { applyLookAt, lookAtPose, qaxis, qmul, qrot } from "../motion/blend";
import { emotionBlendSeconds, emotionWeights, type EmotionWeights } from "../motion/emotion";
import { evaluatePose, STYLES, type VerbCtx } from "../motion/library";
import { byPersona, hash1 } from "../motion/verbs/common";
import { clipsOf, derivedPosture, hashNum, hashStr, stOf } from "./kinematics";

/** Seconds to blend a viseme in ahead of its audio. */
const VISEME_LEAD = 0.06;
const BLINK_BUCKET = 3.5;
const BLINK_LEN = 0.16;

/** Verbs calm enough to carry a talking layer. */
export const CALM_VERBS = new Set<ActorClip["verb"]>(["idle", "look_at", "point_at", "wave", "sit", "hide", "peek", "sulk", "give", "take", "cook", "fish", "water_plants", "swing", "hug", "shrug"]);

export function blink(actor: ActorId, t: number): number {
  const seed = ACTOR_IDS.indexOf(actor) + 1;
  const b = Math.floor(t / BLINK_BUCKET);
  const start = b * BLINK_BUCKET + 0.3 + hash1(b * 13.37 + seed * 101.1) * 1.4;
  const x = (t - start) / BLINK_LEN;
  return x > 0 && x < 1 ? 1 - Math.abs(2 * x - 1) : 0;
}

export function visemeAt(seg: Segment, actor: ActorId, lt: number): { v: Viseme; w: number } | null {
  for (const d of seg.dialogue) {
    if (d.actor !== actor) continue;
    const u = lt - d.start + VISEME_LEAD;
    if (u < 0 || u > d.dur + 0.1) continue;
    let v: Viseme = "rest";
    for (const k of d.visemes) {
      if (k.t <= u) v = k.v;
      else break;
    }
    const w = Math.min(smooth(u / 0.08), smooth((d.dur + 0.1 - u) / 0.12));
    return { v, w };
  }
  return null;
}

/** Slow-ramped "is talking" weight for body gestures (visemes use a fast ramp). */
export function talkWeight(seg: Segment, actor: ActorId, lt: number): number {
  let w = 0;
  for (const d of seg.dialogue) {
    if (d.actor !== actor) continue;
    w = Math.max(w, Math.min(smooth((lt - d.start + 0.1) / 0.45), smooth((d.start + d.dur + 0.3 - lt) / 0.45)));
  }
  return w;
}

/** Who is speaking (or vocalizing) around lt, with a smooth attention weight so heads turn, not snap. */
export function speakerAt(seg: Segment, lt: number): { actor: ActorId; w: number } | null {
  let best: { actor: ActorId; w: number } | null = null;
  const consider = (actor: ActorId, start: number, dur: number) => {
    const w = Math.min(smooth((lt - start + 0.25) / 0.35), smooth((start + dur + 0.5 - lt) / 0.35));
    if (w > 0 && (!best || w > best.w)) best = { actor, w };
  };
  for (const d of seg.dialogue) consider(d.actor, d.start, d.dur);
  for (const e of seg.emotes) if (e.emote !== "snore" && e.emote !== "none") consider(e.actor, e.start, e.dur);
  return best;
}

/** Head freedom for look-at during a verb at progress u (continuous at clip boundaries). */
export function lookFreedom(verb: ActorClip["verb"], from: Posture, u: number): number {
  if (from === "sleep") {
    if (verb === "wake_up" || verb === "stand_up" || verb === "surprised" || verb === "scared") return smooth((u - 0.55) / 0.45);
    return 0;
  }
  if (LOCOMOTION_VERBS.includes(verb)) return 0.5;
  switch (verb) {
    case "nod": case "shake_head": return 0.3;
    case "sleep": return 1 - smooth(u / 0.3);
    case "spin": case "fall_down": return 1 - window01(u, 0, 1, 0.15);
    case "facepalm": case "cry": case "sneeze": return 1 - 0.7 * window01(u, 0, 1, 0.2);
    default: return 1;
  }
}

/** Talking layer: head bobs on syllables, Masha's free hand gestures (additive, weight w). */
export function talkPose(actor: ActorId, t: number, w: number): Record<string, [number, number, number, number]> {
  const bob = Math.sin(t * 9.0) * 0.5 + Math.sin(t * 5.3) * 0.5;
  const gest = Math.max(0, Math.sin(t * 2.1));
  const k = byPersona(actor, 1, 0.6, 0.8, 0.85);
  return {
    Head: qmul(qaxis([1, 0, 0], 0.05 * bob * w * k), qaxis([0, 0, 1], 0.06 * Math.sin(t * 1.7) * w * k)),
    Spine1: qaxis([0, 1, 0], 0.05 * Math.sin(t * 1.3) * w * k),
    LeftForeArm: qaxis([0, 1, 0], -0.5 * gest * w * k),
    LeftArm: qaxis([0, 0, 1], 0.15 * gest * w * k),
  };
}

/** Apply a look-at to an actor frame (head/neck bones + face.lookAt), faded by `weight`. */
export function applyLook(frame: ActorFrame, actor: ActorId, target: Vec3 | null, weight: number): void {
  if (!target || weight <= 0) return;
  const style = STYLES[actor];
  // The stage lifts the complete rig after pose evaluation. Include that same
  // support here so a child on the helper looks down toward the work surface.
  const support = cookingSupportHeightAt(frame.pos[0], frame.pos[2]);
  const head: Vec3 = [frame.pos[0], frame.pos[1] + support + style.height * 0.82, frame.pos[2]];
  const d: Vec3 = [target[0] - head[0], target[1] - head[1], target[2] - head[2]];
  const local = qrot(qaxis([0, 1, 0], -frame.yaw), d);
  const L = applyLookAt({ bones: frame.bones, hipsOffset: frame.hipsOffset }, lookAtPose(local, clamp01(weight)));
  frame.bones = L.bones;
  frame.face = { ...frame.face, lookAt: weight > 0.25 ? target : null };
}

interface EmotionCue { time: number; emotion: Emotion }
const EMPTY_CUES: EmotionCue[] = [];
const IDLE_NEUTRAL_CUES: EmotionCue[] = [{ time: 0, emotion: "neutral" }];
const IDLE_SLEEPY_CUES: EmotionCue[] = [{ time: 0, emotion: "sleepy" }];
const emotionCueCache = new WeakMap<Segment, Partial<Record<ActorId, { stamp: number; cues: EmotionCue[] }>>>();

function emotionCueStamp(seg: Segment, actor: ActorId, rawClips: ActorClip[]): number {
  let h = (seg.duration * 1024) | 0;
  for (let i = 0; i < rawClips.length; i++) {
    const c = rawClips[i];
    h = (Math.imul(h, 31) + c.emotion.charCodeAt(0) + (c.verb.charCodeAt(0) << 8) + ((c.start * 1024) | 0)) | 0;
  }
  return h;
}

/** Expression intent is evaluated independently of the body's enum-switching
 * crossfade. Cache only semantic inputs; edits to a saved segment invalidate it. */
function emotionCues(seg: Segment, actor: ActorId): EmotionCue[] {
  const rawClips = clipsOf(seg, actor);
  if (rawClips.length === 0) {
    if (seg.duration <= 0) return EMPTY_CUES;
    return stOf(seg.startState, actor).posture === "sleep" ? IDLE_SLEEPY_CUES : IDLE_NEUTRAL_CUES;
  }
  const stamp = emotionCueStamp(seg, actor, rawClips);
  let cache = emotionCueCache.get(seg);
  if (!cache) { cache = {}; emotionCueCache.set(seg, cache); }
  const hit = cache[actor];
  if (hit && hit.stamp === stamp) return hit.cues;
  const clips = rawClips.length > 1 ? [...rawClips].sort((a, b) => a.start - b.start) : rawClips;
  let posture = stOf(seg.startState, actor).posture;
  const states = clips.map((clip) => { const from = posture; posture = derivedPosture(clip, from); return { clip, from, posture }; });
  const breaks = new Set([0]);
  for (const { clip, from } of states) {
    breaks.add(clip.start);
    breaks.add(clip.start + clip.dur);
    if (clip.verb === "stand_up" && from === "sleep") breaks.add(clip.start + clip.dur * 0.5);
  }
  const cues: EmotionCue[] = [];
  for (const time of [...breaks].sort((a, b) => a - b)) {
    if (time < 0 || time >= seg.duration) continue;
    let state: (typeof states)[number] | undefined;
    for (const s of states) if (s.clip.start <= time) state = s;
    const active = state && time < state.clip.start + state.clip.dur, clip = active ? state!.clip : null;
    const from = active ? state!.from : state?.posture ?? stOf(seg.startState, actor).posture;
    let emotion: Emotion;
    if (!clip) {
      emotion = from === "sleep" ? "sleepy" : "neutral";
    } else {
      const ctx: VerbCtx = { actor, style: STYLES[actor], dur: clip.dur, emotion: clip.emotion, t: time, dist: 0, turned: 0, speed: 0, fromPosture: from, posture: state?.posture ?? from, targetLocal: null, seat: 0 };
      emotion = evaluatePose(clip.verb, time - clip.start + 1e-8, clip.params, ctx).layer.face?.emotion ?? clip.emotion;
    }
    if (!cues.length || cues[cues.length - 1].emotion !== emotion) cues.push({ time, emotion });
  }
  cache[actor] = { stamp, cues };
  return cues;
}

interface TimelineEmotionEpisode {
  at: number;
  target: Emotion;
  from: Emotion;
  source: EmotionWeights;
  blendDur: number;
}

const timelineEmotionCache = new WeakMap<Timeline, Partial<Record<ActorId, { stamp: number; episodes: TimelineEmotionEpisode[] }>>>();

function getTimelineEmotionEpisodes(timeline: Timeline, actor: ActorId): TimelineEmotionEpisode[] {
  const segs = timeline.segments;
  let stamp = hashNum(0x811c9dc5 | 0, segs.length);
  for (let i = 0; i < segs.length; i++) {
    const { offset, segment } = segs[i];
    const rawClips = clipsOf(segment, actor);
    stamp = hashNum(stamp, offset);
    if (rawClips.length === 0) {
      stamp = hashStr(stamp, stOf(segment.startState, actor).posture);
    } else {
      stamp = hashNum(stamp, emotionCueStamp(segment, actor, rawClips));
    }
  }
  let actorMap = timelineEmotionCache.get(timeline);
  if (!actorMap) {
    actorMap = {};
    timelineEmotionCache.set(timeline, actorMap);
  }
  const hit = actorMap[actor];
  if (hit && hit.stamp === stamp) return hit.episodes;

  const episodes: TimelineEmotionEpisode[] = [];
  let target: Emotion = "neutral";
  let source: EmotionWeights = { neutral: 1 };
  let start = -Infinity;
  for (let i = 0; i < segs.length; i++) {
    const { segment, offset } = segs[i];
    const cues = emotionCues(segment, actor);
    for (let j = 0; j < cues.length; j++) {
      const cue = cues[j];
      const at = offset + cue.time;
      if (cue.emotion === target) continue;
      source = emotionWeights({
        emotion: target,
        emotionTransition: { from: "neutral", fromWeights: source, progress: (at - start) / emotionBlendSeconds(target) },
      });
      target = cue.emotion;
      start = at;
      let bestKey: Emotion = "neutral";
      let bestVal = -Infinity;
      for (const k in source) {
        const v = source[k as Emotion] ?? 0;
        if (v > bestVal) {
          bestVal = v;
          bestKey = k as Emotion;
        }
      }
      episodes.push({
        at,
        target,
        from: bestKey,
        source,
        blendDur: emotionBlendSeconds(target),
      });
    }
  }
  actorMap[actor] = { stamp, episodes };
  return episodes;
}

/** Replay only expression targets, never renderer state. This keeps a reaction
 * continuous through short beats, gaps, paragraph cuts and arbitrary seeks. */
export function storyEmotion(timeline: Timeline, actor: ActorId, time: number): Pick<FaceParams, "emotion" | "emotionTransition"> {
  const episodes = getTimelineEmotionEpisodes(timeline, actor);
  let active: TimelineEmotionEpisode | null = null;
  for (let i = 0; i < episodes.length; i++) {
    if (episodes[i].at <= time) active = episodes[i];
    else break;
  }
  if (!active) return { emotion: "neutral" };
  const progress = clamp01((time - active.at) / active.blendDur);
  if (progress >= 1) return { emotion: active.target };
  return { emotion: active.target, emotionTransition: { from: active.from, fromWeights: active.source, progress } };
}
