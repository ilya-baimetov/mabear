import type { Intensity, MusicMood, Timeline } from "../../shared/schema";
import { flattenTimeline, intensityAt, planMusicSections, type MusicSection } from "./scheduler";
import type { Out } from "./synth";

/** Overlap the last/first second; the resulting loop is one second shorter. */
export function makeMusicLoop(ctx: BaseAudioContext, decoded: AudioBuffer): AudioBuffer {
  const { sampleRate, length, numberOfChannels } = decoded;
  const overlap = Math.round(sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || length <= overlap * 2 || numberOfChannels < 1 || numberOfChannels > 8) throw new Error("Invalid music recording");
  const loop = ctx.createBuffer(numberOfChannels, length - overlap, sampleRate);
  let power = 0, peak = 0;
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const input = decoded.getChannelData(channel), output = loop.getChannelData(channel);
    if (input.some(sample => !Number.isFinite(sample))) throw new Error("Invalid music samples");
    output.set(input.subarray(overlap, length - overlap));
    for (let i = 0; i < overlap; i++) {
      const angle = i / (overlap - 1) * Math.PI / 2;
      output[length - 2 * overlap + i] = input[length - overlap + i] * Math.cos(angle) + input[i] * Math.sin(angle);
    }
    for (const value of output) { power += value * value; peak = Math.max(peak, Math.abs(value)); }
  }
  const rms = Math.sqrt(power / (loop.length * numberOfChannels));
  if (!Number.isFinite(rms) || rms < 1e-6) throw new Error("Silent music recording");
  const scale = Math.min(0.1 / rms, 0.65 / peak, 4);
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const output = loop.getChannelData(channel);
    for (let i = 0; i < output.length; i++) output[i] *= scale;
  }
  return loop;
}

export class RecordedMusicBank {
  private buffers = new Map<MusicMood, AudioBuffer>();
  private pending = new Map<MusicMood, Promise<void>>();
  private controller = new AbortController();
  private disposed = false;
  constructor(private context: () => BaseAudioContext | null, private request: typeof fetch = (...args) => fetch(...args)) {}
  get(mood: MusicMood): AudioBuffer | undefined { return this.buffers.get(mood); }

  async prepare(timeline: Timeline, from = 0, to = timeline.duration): Promise<void> {
    if (this.disposed || this.controller.signal.aborted) return;
    const ctx = this.context();
    if (!ctx) return;
    const flat = flattenTimeline(timeline);
    const moods = new Set(planMusicSections(flat.music, flat.duration)
      .filter(section => section.mood !== "none" && section.end > from && section.start < to).map(section => section.mood));
    await Promise.all([...moods].map(mood => {
      if (this.disposed || this.buffers.has(mood)) return Promise.resolve();
      const pending = this.pending.get(mood);
      if (pending) return pending;
      const abort = new AbortController();
      const onDisposeAbort = () => abort.abort(this.controller.signal.reason);
      if (this.controller.signal.aborted) abort.abort(this.controller.signal.reason);
      else this.controller.signal.addEventListener("abort", onDisposeAbort, { once: true });
      const timer = setTimeout(() => abort.abort(), 10_000);
      const loading = Promise.resolve().then(async () => {
        if (this.disposed || abort.signal.aborted) return;
        const response = await this.request(`/assets/music/${mood}-v1.mp3`, { signal: abort.signal });
        if (!response.ok) throw new Error(`Music HTTP ${response.status}`);
        const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
        if (this.disposed || abort.signal.aborted) return;
        this.buffers.set(mood, makeMusicLoop(ctx, decoded));
      }).catch(() => { /* Optional score: failure remains silent and can be retried. */ })
        .finally(() => {
          clearTimeout(timer);
          this.controller.signal.removeEventListener("abort", onDisposeAbort);
          this.pending.delete(mood);
        });
      this.pending.set(mood, loading);
      return loading;
    }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.buffers.clear();
    this.pending.clear();
  }
}

const LEVEL: Record<Intensity, number> = { soft: 0.5, medium: 0.75, full: 1 };
const clamp = (n: number): number => Math.max(0, Math.min(1, n));

class RecordedVoice {
  source: AudioBufferSourceNode;
  private envelope: GainNode;
  private intensity: GainNode;
  private attackStart: number;
  private attackEnd: number;
  private attackFrom = 0;
  private releasedAt: number | null = null;
  private releasedLevel = 0;
  private releaseEnd = Infinity;
  ended = false;

  constructor(private out: Out, public section: MusicSection, private toCtx: (time: number) => number, buffer: AudioBuffer, start: number) {
    const { ctx } = out;
    this.attackStart = start;
    this.attackEnd = Math.min(section.end, start + (start > section.start + 0.05 ? 0.3 : Math.max(0.05, section.fadeIn)));
    this.envelope = ctx.createGain(); this.intensity = ctx.createGain();
    this.source = ctx.createBufferSource(); this.source.buffer = buffer; this.source.loop = true;
    this.source.connect(this.intensity).connect(this.envelope).connect(out.dest);
    this.source.addEventListener("ended", () => this.disconnect(), { once: true });
    out.track(this.source);
    try {
      this.scheduleEnvelope(start); this.scheduleIntensity(start);
      const when = Math.max(ctx.currentTime, toCtx(start));
      this.source.start(when, Math.max(0, start - section.start + when - toCtx(start)) % buffer.duration);
    } catch (error) { this.finish(); throw error; }
  }

  private at(time: number): number { return Math.max(this.out.ctx.currentTime, this.toCtx(time)); }
  private level(time: number): number {
    if (this.releasedAt !== null) return this.releasedLevel * clamp((this.releaseEnd - time) / (this.releaseEnd - this.releasedAt));
    if (time < this.attackEnd) return this.attackFrom + (1 - this.attackFrom) * clamp((time - this.attackStart) / Math.max(0.001, this.attackEnd - this.attackStart));
    return clamp((this.section.end + this.section.fadeOut - time) / Math.max(0.05, this.section.fadeOut));
  }
  private scheduleEnvelope(time: number): void {
    const gain = this.envelope.gain;
    gain.cancelScheduledValues(this.out.ctx.currentTime);
    gain.setValueAtTime(this.level(time), this.at(time));
    if (this.attackEnd > time) gain.linearRampToValueAtTime(1, this.at(this.attackEnd));
    if (this.section.end > time) gain.setValueAtTime(1, this.at(this.section.end));
    gain.linearRampToValueAtTime(0, this.at(this.section.end + this.section.fadeOut));
  }
  private scheduleIntensity(time: number): void {
    const gain = this.intensity.gain;
    gain.cancelScheduledValues(this.out.ctx.currentTime);
    gain.setTargetAtTime(LEVEL[intensityAt(this.section, time)], this.at(time), 0.12);
    for (const change of this.section.intensities) if (change.t > time) gain.setTargetAtTime(LEVEL[change.intensity], this.at(change.t), 0.12);
  }
  retarget(section: MusicSection, now: number): void {
    if (this.ended || this.releasedAt !== null) return;
    const time = Math.max(now, this.attackStart), value = this.level(time);
    this.section = section;
    if (now >= this.attackStart) { this.attackStart = now; this.attackEnd = Math.min(section.end, now + 0.15); this.attackFrom = value; }
    this.scheduleEnvelope(time); this.scheduleIntensity(time);
  }
  release(now: number): void {
    if (this.ended || this.releasedAt !== null) return;
    this.releasedLevel = this.level(now); this.releasedAt = now; this.releaseEnd = now + 0.6;
    this.envelope.gain.cancelScheduledValues(this.out.ctx.currentTime);
    this.envelope.gain.setValueAtTime(this.releasedLevel, this.at(now));
    this.envelope.gain.linearRampToValueAtTime(0, this.at(this.releaseEnd));
  }
  expired(now: number): boolean { return this.ended || now >= (this.releasedAt === null ? this.section.end + this.section.fadeOut : this.releaseEnd); }
  finish(): void { try { this.source.stop(); } catch { /* Already ended. */ } this.disconnect(); }
  private disconnect(): void {
    this.ended = true;
    for (const node of [this.source, this.intensity, this.envelope]) try { node.disconnect(); } catch { /* Detached. */ }
  }
}

/** Decoded recordings share the movie clock, ducking bus, and session source cleanup. */
export class RecordedMusicDirector {
  voicesStarted = 0;
  notesScheduled = 0; // Compatibility with the synth director's diagnostics; recordings contain no scheduled notes.
  private voices = new Map<MusicSection, RecordedVoice>();
  private retiring = new Set<RecordedVoice>();
  constructor(private out: Out | null, public sections: MusicSection[], private toCtx: (time: number) => number, private bank: RecordedMusicBank) {}

  retarget(sections: MusicSection[], now: number): void {
    const next = new Map<MusicSection, RecordedVoice>();
    for (const [section, voice] of this.voices) {
      const match = sections.find(candidate => candidate.mood === section.mood && Math.abs(candidate.start - section.start) < 0.001 && !next.has(candidate));
      try {
        if (match && match.end > now && !voice.ended) { voice.retarget(match, now); next.set(match, voice); }
        else { voice.release(now); this.retiring.add(voice); }
      } catch { voice.finish(); }
    }
    this.voices = next; this.sections = sections;
  }

  update(_from: number, to: number, now: number): void {
    for (const voice of this.retiring) if (voice.expired(now)) { voice.finish(); this.retiring.delete(voice); }
    for (const [section, voice] of this.voices) if (voice.expired(now)) { voice.finish(); this.voices.delete(section); }
    if (!this.out) return;
    for (const section of this.sections) {
      if (section.mood === "none" || section.start >= to || section.end <= now || this.voices.has(section)) continue;
      const buffer = this.bank.get(section.mood);
      if (!buffer) continue; // A late load joins at the current playhead on a subsequent tick.
      try {
        const voice = new RecordedVoice(this.out, section, this.toCtx, buffer, Math.max(now, section.start));
        this.voices.set(section, voice); this.voicesStarted++;
      } catch { /* Unsupported or interrupted audio must not interrupt the story. */ }
    }
  }
  activeMoods(now: number): MusicMood[] {
    return [...this.voices.keys()].filter(section => section.start <= now && now < section.end + section.fadeOut).map(section => section.mood);
  }
}
