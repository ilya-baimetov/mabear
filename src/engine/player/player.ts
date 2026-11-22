// Playback clock: playback = evaluate(clock), scrubbing = evaluate(scrubT) (spec §4.3, §7.4). No React.
import type { ActorId, CamKey, Lang, Timeline, Vec3 } from "../../shared/schema";
import type { AudioEngine, FrameState, StageHandle } from "../api";
import { evaluate } from "./evaluate";
import type { PlaybackEvaluator } from "../physics/rapierReplay";

export interface PlayerOptions {
  stage: StageHandle;
  audio: AudioEngine | null;
  onTime?: (t: number, playing: boolean) => void;
  onFrame?: (frame: FrameState) => void;
  /** Optional deterministic physics trajectory; unsupported stories retain animation. */
  evaluator?: PlaybackEvaluator & {readonly ready?:boolean};
  /** Preparation holds the existing picture and requested timestamp, including audio. */
  onPreparing?: (preparing:boolean)=>void;
}

export class Player {
  /** Thumbnails use the same canonical trajectory and ownership as playback. */
  evaluateFrame(view: Timeline, t: number): FrameState {
    return this.opts.evaluator?.evaluate(view, t) ?? evaluate(view, t);
  }
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
  private resumableAudio = false;
  private preparationHeld = false;
  private preparingReported = false;
  private deferredAudio = false;
  /** debug/screenshot hook: replaces the compiled camera (e.g. a character close-up) */
  cameraOverride: ((frame: FrameState) => CamKey) | null = null;
  /** Cast inspection may show an actor who is absent from the current story. */
  castOverride: ActorId[] | null = null;
  /** debug/screenshot hook: skip rendering (the last frame stays on screen) so headless screenshots aren't starved */
  frozen = false;

  constructor(private opts: PlayerOptions) {
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setTimeline(tl: Timeline, lang: Lang): void {
    this.opts.evaluator?.setTimeline(tl);
    const wasPlaying = this.playing;
    const changed = tl !== this.timeline || lang !== this.lang;
    if (changed && this.resumableAudio) { this.opts.audio?.stop(); this.resumableAudio = false; }
    this.timeline = tl;
    this.lang = lang;
    this.setPreviewEnd(this.previewEnd ?? undefined);
    if (this.t > tl.duration) this.t = tl.duration;
    if (wasPlaying && (changed || this.isPreparing)) {
      if(this.isPreparing){this.opts.audio?.stop();this.deferredAudio=true;}
      else {this.deferredAudio=false;this.opts.audio?.play(this.previewTimeline, this.t, lang);}
      this.tStart=this.t;this.wallStart=performance.now();
    }
    if (this.endT > tl.duration || !wasPlaying || this.toEnd) this.endT = this.previewTimeline.duration;
    // Stop at an unvoiced new paragraph; the app prepares it before resuming.
    if(wasPlaying&&this.opts.audio?.readyUntil)this.endT=Math.min(this.endT,Math.max(this.t,this.opts.audio.readyUntil(this.previewTimeline,lang,this.t)));
    if(this.isPreparing)this.preparationHeld=true;
    this.reportPreparing();
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
  get isPreparing():boolean{return this.opts.evaluator?.ready===false;}
  private reportPreparing(){const value=this.isPreparing;if(value!==this.preparingReported){this.preparingReported=value;this.opts.onPreparing?.(value);}}
  get frame(): FrameState | null {
    return this.lastFrame;
  }

  play(from: number, to?: number): void {
    this.castOverride = null;
    const resume = this.resumableAudio && !this.playing && Math.abs(from - this.t) < 1e-6 && (to ?? null) === this.previewEnd;
    this.resumableAudio = false;
    this.setPreviewEnd(to);
    this.t = Math.max(0, Math.min(from, this.previewTimeline.duration));
    this.toEnd = to === undefined;
    this.endT = this.previewTimeline.duration;
    this.playing = true;
    this.tStart = this.t;
    this.wallStart = performance.now();
    if(this.isPreparing){
      this.preparationHeld=true;this.deferredAudio=true;this.opts.audio?.stop();
    }else if (resume && this.opts.audio?.resume) this.opts.audio.resume();
    else { this.opts.audio?.stop(); this.opts.audio?.play(this.previewTimeline, this.t, this.lang); }
    if(!this.isPreparing){this.preparationHeld=false;this.deferredAudio=false;}
    this.reportPreparing();
    this.opts.onTime?.(this.t, true);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.resumableAudio = !this.deferredAudio && !!this.opts.audio?.pause;
    if(this.deferredAudio){this.deferredAudio=false;this.opts.audio?.stop();}
    else if (this.opts.audio?.pause) this.opts.audio.pause(); else this.opts.audio?.stop();
    this.opts.onTime?.(this.t, false);
  }

  seek(t: number, boundEnd?: number): void {
    if (this.playing) this.pause();
    if (this.resumableAudio) this.opts.audio?.stop();
    this.resumableAudio = false;
    this.setPreviewEnd(boundEnd);
    this.t = Math.max(0, Math.min(t, this.previewTimeline.duration));
    this.idleT = 0;
    this.opts.onTime?.(this.t, false);
  }

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    if (this.frozen) return;
    this.reportPreparing();
    if(this.isPreparing){this.preparationHeld=true;this.lastNow=now;return;}
    if(this.preparationHeld){
      this.preparationHeld=false;this.tStart=this.t;this.wallStart=now;this.lastNow=now;
      if(this.deferredAudio&&this.playing)this.opts.audio?.play(this.previewTimeline,this.t,this.lang);
      this.deferredAudio=false;
    }
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
      let frame = this.opts.evaluator ? this.opts.evaluator.evaluate(view, evalT) : evaluate(view, evalT);
      if (this.cameraOverride) frame = { ...frame, camera: this.cameraOverride(frame) };
      if (this.castOverride) frame = { ...frame, cast: this.castOverride };
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
    this.opts.evaluator?.dispose();
  }
}
