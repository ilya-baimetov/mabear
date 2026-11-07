import { describe, expect, it, vi } from "vitest";
import { makeMusicLoop, RecordedMusicBank, RecordedMusicDirector } from "../../src/engine/audio/recordedMusic";
import type { MusicSection } from "../../src/engine/audio/scheduler";
import type { Out } from "../../src/engine/audio/synth";
import type { Segment, Timeline } from "../../src/shared/schema";

function buffer(seconds = 4, sampleRate = 8000): AudioBuffer {
  const samples = new Float32Array(seconds * sampleRate);
  return { length: samples.length, sampleRate, numberOfChannels: 1, duration: seconds, getChannelData: () => samples } as unknown as AudioBuffer;
}
function recording(): AudioBuffer {
  const result = buffer(), samples = result.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 + i / samples.length * 0.1;
  return result;
}
function audio() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; loop: boolean; buffer: AudioBuffer | null }[] = [];
  const gains: { gain: { setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> } }[] = [];
  const context = {
    currentTime: 0,
    createBuffer: (_channels: number, length: number, sampleRate: number) => buffer(length / sampleRate, sampleRate),
    decodeAudioData: vi.fn(async () => recording()),
    createGain() {
      const node = { connect: vi.fn((next: unknown) => next), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() } };
      gains.push(node); return node;
    },
    createBufferSource() {
      const source = { buffer: null, loop: false, connect: vi.fn((next: unknown) => next), disconnect: vi.fn(), addEventListener: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(source); return source;
    },
  };
  const ctx = context as unknown as AudioContext;
  const out: Out = { ctx, dest: {} as AudioNode, track: vi.fn() };
  return { ctx, context, out, sources, gains };
}
const timeline = (music: Segment["music"], duration = 20): Timeline => ({ duration, segments: [{ offset: 0, segment: { music, duration } as Segment }] });
const section = (extra: Partial<MusicSection> = {}): MusicSection => ({ mood: "calm", start: 0, end: 20, fadeIn: 0.5, fadeOut: 1, intensities: [{ t: 0, intensity: "full" }], cues: [0], ...extra });

describe("recorded music", () => {
  it("overlaps one second into a continuous conservative-level loop and rejects invalid recordings", () => {
    const { ctx } = audio(), input = recording(), loop = makeMusicLoop(ctx, input), values = loop.getChannelData(0);
    expect(loop.duration).toBe(3);
    expect(Math.abs(values[0] - values.at(-1)!)).toBeLessThan(0.00001);
    expect(Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)).toBeCloseTo(0.1, 5);
    expect(Math.max(...values)).toBeLessThanOrEqual(0.65);
    input.getChannelData(0)[100] = NaN;
    expect(() => makeMusicLoop(ctx, input)).toThrow("Invalid music samples");
    expect(() => makeMusicLoop(ctx, buffer())).toThrow("Silent music recording");
    expect(() => makeMusicLoop(ctx, buffer(2))).toThrow("Invalid music recording");
  });

  it("prepares only intersecting moods, deduplicates concurrent loads, and retries failures", async () => {
    const { ctx, context } = audio();
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const bank = new RecordedMusicBank(() => ctx, request);
    const story = timeline([{ start: 0, mood: "playful", intensity: "soft", fade: 1 }, { start: 10, mood: "calm", intensity: "full", fade: 1 }]);
    await Promise.all([bank.prepare(story, 12, 15), bank.prepare(story, 12, 15)]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(bank.get("calm")).toBeUndefined();
    await Promise.all([bank.prepare(story, 12, 15), bank.prepare(story, 12, 15)]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("/assets/music/calm-v1.mp3");
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(bank.get("calm")?.duration).toBe(3);
    expect(bank.get("playful")).toBeUndefined();
    await bank.prepare(story, 12, 15);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("joins a late recording at the current loop phase and retains its source when the timeline grows", () => {
    const { out, context, sources, gains } = audio();
    const get = vi.fn<RecordedMusicBank["get"]>().mockReturnValue(undefined);
    const bank = { get } as unknown as RecordedMusicBank;
    const director = new RecordedMusicDirector(out, [section({ end: 6 })], time => time + 100, bank);
    context.currentTime = 104;
    director.update(4, 5.5, 4);
    expect(sources).toHaveLength(0);
    get.mockReturnValue(buffer(3));
    context.currentTime = 105;
    director.update(5.5, 6.5, 5);
    expect(sources[0].start).toHaveBeenCalledWith(105, 2);
    expect(out.track).toHaveBeenCalledWith(sources[0]);
    director.retarget([section({ end: 20, intensities: [{ t: 0, intensity: "soft" }, { t: 10, intensity: "full" }] })], 5.5);
    director.update(6.5, 8, 6.5);
    expect(sources).toHaveLength(1);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(director.voicesStarted).toBe(1);
    expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 105.5, 0.12);
    expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(1, 110, 0.12);
    director.update(21, 22, 21);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).toHaveBeenCalled();
  });

  it("retires removed voices once, seeks with section-relative offsets, and never starts none", () => {
    const { out, context, sources } = audio();
    const bank = { get: () => buffer(3) } as unknown as RecordedMusicBank;
    const director = new RecordedMusicDirector(out, [section({ start: 5, end: 12.2, fadeOut: 0.1 })], time => time, bank);
    context.currentTime = 12;
    director.update(12, 13.5, 12);
    expect(sources[0].start).toHaveBeenCalledWith(12, 1);
    director.retarget([section({ mood: "none" })], 12.1);
    director.update(13, 13.5, 12.4);
    expect(sources[0].stop).not.toHaveBeenCalled(); // The new retirement fade supersedes the old 12.3s endpoint.
    director.update(13.5, 14, 12.8);
    director.update(14, 15, 13.8);
    expect(sources).toHaveLength(1);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(director.activeMoods(13)).toEqual([]);
  });
});
