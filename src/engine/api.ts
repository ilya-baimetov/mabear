// Engine-side contracts (frozen after M1; additive changes only).
// The engine never imports React. evaluate() is pure: same (timeline, t) → identical FrameState.
import type * as THREE from "three";
import type { ActorId, CamKey, Emotion, FxId, Lang, Posture, PropId, TimeOfDay, Timeline, Vec3, Viseme } from "../shared/schema";

/** Quaternion [x, y, z, w] — LOCAL rotation of a bone. Bones absent from the map stay at rest (T-pose). */
export type Quat = [number, number, number, number];

export interface FaceParams {
  emotion: Emotion;
  /** Time-derived transition; remains deterministic when seeking. */
  emotionTransition?: { from:Emotion; progress:number; fromWeights?:Partial<Record<Emotion,number>> };
  /** 0 = eyes open, 1 = closed (blink or sleep) */
  lidClose: number;
  viseme: Viseme;
  /** 0..1 how strongly the viseme shows (0 = mouth at the emotion's rest shape) */
  visemeWeight: number;
  /** world point the eyes/head look at, or null = straight ahead */
  lookAt: Vec3 | null;
  /** -1..1 additive brow raise on top of the emotion preset */
  browRaise: number;
}

export interface ActorFrame {
  /** root world position [x, y, z] (y = 0 on the ground) */
  pos: Vec3;
  /** yaw radians; 0 = facing +z */
  yaw: number;
  /** 0..1 (offstage fade) */
  opacity: number;
  bones: Record<string, Quat>;
  /** extra Hips translation in metres (bounce, crouch, sit) */
  hipsOffset: Vec3;
  /** Blend of measured sole correction during posture transitions (default 1). */
  groundWeight?:number;
  face: FaceParams;
  holding: PropId | null;
  posture: Posture;
  /** the clip being played (debug/data view) */
  verb: string;
  /** Deterministic clip time for geometry-aware contact solving. */
  action?: { time:number; duration:number; contactEnd?:number };
  /** Authored prop release: world origin/Euler YXZ; release is normalized clip progress. */
  putDown?: {item:PropId;position:Vec3;rotation:Vec3;release:number};
  /** secondary-motion drivers 0..1 (hem sway, belly jiggle, ear wiggle) */
  secondary: { sway: number; jiggle: number; breathe: number };
}

export interface PropFrame {
  visible: boolean;
  /** world position when resting on the set; ignored when attachedTo is set */
  pos: Vec3;
  /** attached to an actor's hand ("RightHand") */
  attachedTo: ActorId | null;
}

export interface FxFrame {
  id: FxId;
  at: Vec3;
  /** 0..1 normalized age within its duration */
  k: number;
}

export interface FrameState {
  t: number;
  segmentIndex: number;
  /** segment-local time */
  localT: number;
  actors: Record<ActorId, ActorFrame>;
  /** Story participants; omitted in the empty cast-exploration scene. */
  cast?:ActorId[];
  camera: CamKey;
  /** lighting blend: from → to by k (0..1) */
  lighting: { from: TimeOfDay; to: TimeOfDay; k: number };
  props: Record<PropId, PropFrame>;
  fx: FxFrame[];
}

/** A built character (procedural stand-in or glTF). */
export interface CharacterRig {
  id: ActorId | string;
  root: THREE.Object3D;
  /** Mixamo-named bones (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, …) */
  bones: Record<string, THREE.Bone>;
  /** rest-pose local quaternions per bone (T-pose) */
  rest: Record<string, THREE.Quaternion>;
  height: number;
  /** apply a frame (pose, face, secondary motion) */
  apply(frame: ActorFrame): void;
  /** hand socket for held props */
  handSocket: THREE.Object3D;
  dispose(): void;
}

export interface StageStats {
  fps: number;
  drawCalls: number;
  triangles: number;
}

export interface StageHandle {
  render(frame: FrameState): void;
  resize(width: number, height: number): void;
  stats(): StageStats;
  /** world→screen helper for spatial audio and tap-to-react */
  camera: THREE.PerspectiveCamera;
  dispose(): void;
}

/** Audio engine (spec §7.6). Never throws; TTS failures are silent. */
export interface AudioEngine {
  /** Fetch/decode selected recorded speech before the movie starts; never plays audio. */
  prepare?(timeline: Timeline, lang: Lang, from?: number, to?: number): Promise<Readonly<Record<string, number>>>;
  readyUntil?(timeline: Timeline, lang: Lang, from: number): number;
  /** call on first user gesture */
  unlock(): Promise<void>;
  /** schedule the timeline from episode time `fromT` (real-time playback only) */
  play(timeline: Timeline, fromT: number, lang: Lang): void;
  /** Freeze the existing scheduled session and current speech utterance. */
  pause(): void;
  /** Continue the frozen session without restarting its cues. */
  resume(): void;
  /** Stop everything immediately (scrub / replay / replacement). */
  stop(): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  /** update spatialization each frame (camera + actor world positions) */
  updateListener(camera: CamKey, actors: Record<ActorId, Vec3>): void;
  dispose(): void;
}

/** Debug hook exposed as window.__mabearAudio (e2e asserts counts > 0). */
export interface AudioDebug {
  scheduled: { dialogue: number; emotes: number; foley: number; sfx: number; music: number; ambience: number };
  ttsAvailable: boolean;
  unlocked: boolean;
  recordedSpeech?: {voice:string;scheduled:{text:string;lang:Lang;offset:number;duration:number}[]};
}
