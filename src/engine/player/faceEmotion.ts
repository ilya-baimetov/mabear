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
import { clipsOf, derivedPosture, stOf } from "./kinematics";

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
const emotionCueCache = new WeakMap<Segment, Partial<Record<ActorId, { signature: string; cues: EmotionCue[] }>>>();

/** Expression intent is evaluated independently of the body's enum-switching
 * crossfade. Cache only semantic inputs; edits to a saved segment invalidate it. */
function emotionCues(seg: Segment, actor: ActorId): EmotionCue[] {
  const clips = [...clipsOf(seg, actor)].sort((a, b) => a.start - b.start);
  const signature = JSON.stringify([stOf(seg.startState, actor).posture, seg.duration, clips.map((c) => [c.start, c.dur, c.verb, c.emotion, c.params.posture])]);
  let cache = emotionCueCache.get(seg);
  if (!cache) { cache = {}; emotionCueCache.set(seg, cache); }
  if (cache[actor]?.signature === signature) return cache[actor]!.cues;
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
    const ctx: VerbCtx = { actor, style: STYLES[actor], dur: clip?.dur ?? 1, emotion: clip?.emotion ?? "neutral", t: time, dist: 0, turned: 0, speed: 0, fromPosture: from, posture: state?.posture ?? from, targetLocal: null, seat: 0 };
    const emotion = evaluatePose(clip?.verb ?? "idle", clip ? time - clip.start + 1e-8 : 0, clip?.params ?? {}, ctx).layer.face?.emotion ?? clip?.emotion ?? "neutral";
    if (!cues.length || cues[cues.length - 1].emotion !== emotion) cues.push({ time, emotion });
  }
  cache[actor] = { signature, cues };
  return cues;
}

/** Replay only expression targets, never renderer state. This keeps a reaction
 * continuous through short beats, gaps, paragraph cuts and arbitrary seeks. */
export function storyEmotion(timeline: Timeline, actor: ActorId, time: number): Pick<FaceParams, "emotion" | "emotionTransition"> {
  let target: Emotion = "neutral", source: EmotionWeights = { neutral: 1 }, start = -Infinity;
  for (const { segment, offset } of timeline.segments) {
    if (offset > time) break;
    for (const cue of emotionCues(segment, actor)) {
      const at = offset + cue.time;
      if (at > time) break;
      if (cue.emotion === target) continue;
      source = emotionWeights({ emotion: target, emotionTransition: { from: "neutral", fromWeights: source, progress: (at - start) / emotionBlendSeconds(target) } });
      target = cue.emotion;
      start = at;
    }
  }
  const progress = clamp01((time - start) / emotionBlendSeconds(target));
  if (progress >= 1) return { emotion: target };
  const from = (Object.entries(source).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "neutral") as Emotion;
  return { emotion: target, emotionTransition: { from, fromWeights: source, progress } };
}
