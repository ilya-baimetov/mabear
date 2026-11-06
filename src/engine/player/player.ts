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
  /** A moment preview retains earlier context but excludes later moments from rendering and audio. */
  private previewTimeline: Timeline = this.timeline;
  private previewEnd: number | null = null;
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
  /** debug/screenshot hook: skip rendering (the last frame stays on screen) so headless screenshots aren't starved */
  frozen = false;

  constructor(private opts: PlayerOptions) {
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setTimeline(tl: Timeline, lang: Lang): void {
    const wasPlaying = this.playing;
    const changed = tl !== this.timeline;
    this.timeline = tl;
    this.lang = lang;
    this.setPreviewEnd(this.previewEnd ?? undefined);
    if (this.t > tl.duration) this.t = tl.duration;
    if (changed && wasPlaying) {
      // timeline edited during playback: re-schedule from the current time (the engine keeps lines/music running)
      this.opts.audio?.play(this.previewTimeline, this.t, lang);
    }
    if (this.endT > tl.duration || !wasPlaying || this.toEnd) this.endT = this.previewTimeline.duration;
  }

  private setPreviewEnd(end?: number): void {
    this.previewEnd = end === undefined ? null : Math.max(0, Math.min(end, this.timeline.duration));
    this.previewTimeline = this.previewEnd === null ? this.timeline : {
      segments: this.timeline.segments.filter(s => s.offset < this.previewEnd!),
      duration: this.previewEnd,
    };
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
    this.setPreviewEnd(to);
    this.t = Math.max(0, Math.min(from, this.previewTimeline.duration));
    this.toEnd = to === undefined;
    this.endT = this.previewTimeline.duration;
    this.playing = true;
    this.tStart = this.t;
    this.wallStart = performance.now();
    this.opts.audio?.stop();
    this.opts.audio?.play(this.previewTimeline, this.t, this.lang);
    this.opts.onTime?.(this.t, true);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.opts.audio?.stop();
    this.opts.onTime?.(this.t, false);
  }

  seek(t: number, boundEnd?: number): void {
    if (this.playing) this.pause();
    this.setPreviewEnd(boundEnd);
    this.t = Math.max(0, Math.min(t, this.previewTimeline.duration));
    this.idleT = 0;
    this.opts.onTime?.(this.t, false);
  }

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    if (this.frozen) return;
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
    // Excluding later segments keeps an exact moment endpoint on that moment's final
    // camera/lighting/pose. A partial-clip preview holds its frame instead of running on.
    const view = this.previewTimeline;
    const last = view.segments.at(-1);
    const atSegmentEnd = last && Math.abs(last.offset + last.segment.duration - view.duration) < 1e-6;
    const atEnd = !this.playing && view.duration > 0 && this.t >= view.duration - 1e-3;
    const evalT = atEnd && atSegmentEnd ? view.duration + this.idleT : this.t;
    try {
      let frame = evaluate(view, evalT);
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
