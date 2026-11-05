// Playback clock: playback = evaluate(clock), scrubbing = evaluate(scrubT) (spec §4.3, §7.4). No React.
import type { ActorId, CamKey, Lang, Timeline, Vec3 } from "../../shared/schema";
import type { AudioEngine, FrameState, StageHandle } from "../api";
import { evaluate } from "./evaluate";

export interface PlayerOptions {
  stage: StageHandle;
  audio: AudioEngine | null;
  onTime?: (t: number, playing: boolean) => void;
  onFrame?: (frame: FrameState) => void;
}

export class Player {
  private timeline: Timeline = { segments: [], duration: 0 };
  private lang: Lang = "en";
  private t = 0;
  private playing = false;
  private endT = 0;
  private wallStart = 0;
  private tStart = 0;
  private raf = 0;
  private lastFrame: FrameState | null = null;
  /** idle clock after the end (final frame holds with idle motion) */
  private idleT = 0;
  /** play() was asked to run to the end of the timeline (extend endT when the timeline grows) */
  private toEnd = false;
  private lastNow = 0;
  /** debug/screenshot hook: replaces the compiled camera (e.g. a character close-up) */
  cameraOverride: ((frame: FrameState) => CamKey) | null = null;

  constructor(private opts: PlayerOptions) {
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setTimeline(tl: Timeline, lang: Lang): void {
    const wasPlaying = this.playing;
    const changed = tl !== this.timeline;
    this.timeline = tl;
    this.lang = lang;
    if (this.t > tl.duration) this.t = tl.duration;
    if (changed && wasPlaying) {
      // timeline edited during playback: re-schedule from the current time (the engine keeps lines/music running)
      this.opts.audio?.play(tl, this.t, lang);
    }
    if (this.endT > tl.duration || !wasPlaying || this.toEnd) this.endT = tl.duration;
  }

  get time(): number {
    return this.t;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
  get frame(): FrameState | null {
    return this.lastFrame;
  }

  play(from: number, to?: number): void {
    this.t = Math.max(0, Math.min(from, this.timeline.duration));
    this.toEnd = to === undefined;
    this.endT = Math.min(to ?? this.timeline.duration, this.timeline.duration);
    this.playing = true;
    this.tStart = this.t;
    this.wallStart = performance.now();
    this.opts.audio?.stop();
    this.opts.audio?.play(this.timeline, this.t, this.lang);
    this.opts.onTime?.(this.t, true);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.opts.audio?.stop();
    this.opts.onTime?.(this.t, false);
  }

  seek(t: number): void {
    if (this.playing) this.pause();
    this.t = Math.max(0, Math.min(t, this.timeline.duration));
    this.idleT = 0;
    this.opts.onTime?.(this.t, false);
  }

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastNow ? Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000)) : 1 / 60;
    this.lastNow = now;
    if (this.playing) {
      this.t = this.tStart + (now - this.wallStart) / 1000;
      if (this.t >= this.endT) {
        this.t = this.endT;
        this.playing = false;
        this.opts.audio?.stop();
        this.idleT = 0;
        this.opts.onTime?.(this.t, false);
      } else {
        this.opts.onTime?.(this.t, true);
      }
    } else {
      this.idleT += dt;
    }
    // After the end, hold the final frame with idle motion: evaluate slightly past the end (evaluate clamps + idles).
    const atEnd = !this.playing && this.timeline.duration > 0 && this.t >= this.timeline.duration - 1e-3;
    const evalT = atEnd ? this.timeline.duration + this.idleT : this.t;
    try {
      let frame = evaluate(this.timeline, evalT);
      if (this.cameraOverride) frame = { ...frame, camera: this.cameraOverride(frame) };
      this.lastFrame = frame;
      this.opts.stage.render(frame);
      if (this.playing && this.opts.audio) {
        const pos = {} as Record<ActorId, Vec3>;
        for (const id of Object.keys(frame.actors) as ActorId[]) pos[id] = frame.actors[id].pos;
        this.opts.audio.updateListener(frame.camera, pos);
      }
      this.opts.onFrame?.(frame);
    } catch (err) {
      console.warn("frame failed", err);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.opts.audio?.stop();
  }
}
