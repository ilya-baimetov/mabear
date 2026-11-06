// Review fixes #1, #4–#8, #11, #12: ▶ session / hold / resume and re-direct behaviour, with a fake Player.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectRequest, DirectResponse } from "../../src/shared/schema";
import { parseParagraph } from "../../src/director/offline/parser";

const pending: { req: DirectRequest; resolve: (r: DirectResponse) => void }[] = [];
vi.mock("../../src/director/client", () => ({
  directParagraph: (req: DirectRequest) => new Promise<DirectResponse>((resolve) => pending.push({ req, resolve })),
}));

const { store } = await import("../../src/app/store");
const { playback } = await import("../../src/app/playback");
const { FIXTURES } = await import("../../src/director/fixtures/index");

/** Answer the oldest call for `text` (default: the first queued), optionally staging another sentence instead. */
function answer(match?: string, stageAs?: string) {
  const i = match ? pending.findIndex((j) => j.req.paragraph.startsWith(match)) : 0;
  expect(i).toBeGreaterThanOrEqual(0);
  const [job] = pending.splice(i, 1);
  const text = stageAs ?? job.req.paragraph;
  job.resolve({ beatScript: parseParagraph(text, job.req.lang, job.req.worldState), source: "llm", latencyMs: 5, usage: null, model: "mock" });
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

const plays: { from: number; to?: number }[] = [];
const fakePlayer = {
  isPlaying: false,
  cameraOverride: null as null | (() => unknown),
  setTimeline: () => undefined,
  play(from: number, to?: number) {
    plays.push({ from, to });
    this.isPlaying = true;
  },
  pause() {
    this.isPlaying = false;
  },
  seek: vi.fn(),
};

function para(text: string): string {
  const id = store.addParagraph();
  store.editText(id, text);
  return id;
}
/** The player reaches the end of what is rendered and stops by itself. */
function playerStops() {
  fakePlayer.isPlaying = false;
  const t = store.getState().timeline.duration;
  store.setPlayback(false, t);
  playback.onPlayerStopped(t);
}

describe("▶ sessions (playback.ts)", () => {
  beforeEach(async () => {
    playback.pause();
    pending.length = 0;
    plays.length = 0;
    fakePlayer.isPlaying = false;
    fakePlayer.cameraOverride = null;
    fakePlayer.seek.mockClear();
    store.newStory();
    playback.attach(fakePlayer as never, null);
    await flush();
  });

  it("clamps keyboard seeks before synchronizing the player and store", () => {
    store.loadFixture(FIXTURES.find(f => f.id === "pancake_morning" && f.lang === "en")!);
    const duration = store.getState().timeline.duration;
    store.setPreviewScope({ kind: "story" });
    for (const [input, expected] of [[-1, 0], [duration + 1, duration], [Infinity, duration], [NaN, 0], [1.25, 1.25]]) {
      playback.seek(input);
      expect(store.getState().t).toBe(expected);
      expect(fakePlayer.seek).toHaveBeenLastCalledWith(expected, undefined);
    }
    store.newStory();
    playback.seek(1);
    expect(store.getState().t).toBe(0);
  });

  it("stops a whole-story player while a dirty selected moment prepares", async () => {
    store.loadFixture(FIXTURES.find(f => f.id === "pancake_morning" && f.lang === "en")!);
    playback.playAll();
    expect(fakePlayer.isPlaying).toBe(true);
    const target = store.getState().paragraphs[1];
    store.editText(target.id, "Masha jumps. Bear claps.");
    const before = plays.length;
    playback.playParagraph(target.id);
    expect(pending).toHaveLength(1);
    expect(fakePlayer.isPlaying).toBe(false);
    expect(store.getState().playing).toBe(false);
    expect(store.getState().waiting).toBe(true);
    expect(store.getState().previewScope).toEqual({ kind: "moment", id: target.id });
    expect(plays).toHaveLength(before);
    answer();
    await flush();
    const range = store.segmentRange(target.id)!;
    expect(plays.at(-1)).toEqual({ from: range.start, to: range.end });
    expect(fakePlayer.isPlaying).toBe(true);
  });

  it("local remixes replay without directing an earlier unplayed edit", async () => {
    store.loadFixture(FIXTURES.find(f => f.id === "pancake_morning" && f.lang === "en")!);
    const [first,,third] = store.getState().paragraphs;
    store.editText(first.id, "Masha dances around Bear.");
    store.setRemix(third.id, {cameraSeed: 2});
    fakePlayer.cameraOverride = () => ({ character: "wolf_b" });
    playback.replaySegment(third.id);
    await flush();
    expect(pending).toHaveLength(0);
    expect(store.getState().waiting).toBe(false);
    expect(plays).toHaveLength(1);
    expect(fakePlayer.cameraOverride).toBeNull();
    expect(plays[0].from).toBe(store.segmentRange(third.id)!.start);
    expect(store.getState().paragraphs[0].status).toBe("draft");
  });

  it("holds with 'getting ready…' when the playhead catches up, blocks taps meanwhile, then resumes (#1)", async () => {
    para("Masha runs to the swing.");
    para("Bear walks to the garden.");
    playback.playAll();
    expect(store.getState().waiting).toBe(true);
    answer("Masha runs");
    await flush();
    expect(plays).toHaveLength(1);
    expect(plays[0].from).toBe(0);
    const end1 = store.getState().timeline.duration;
    playerStops();
    await flush();
    expect(store.getState().waiting).toBe(true);
    expect(playback.canReact()).toBe(false); // a tap now would corrupt the resume point
    answer("Bear walks");
    await flush();
    expect(plays).toHaveLength(2);
    expect(plays[1].from).toBeCloseTo(end1, 5); // resumes exactly where it held
    expect(store.getState().waiting).toBe(false);
  });

  it("loading an example during a hold ends the session; the example never plays by itself (#4)", async () => {
    para("Masha runs to the swing.");
    playback.playAll();
    expect(store.getState().waiting).toBe(true);
    store.loadFixture(FIXTURES.find((f) => f.id === "pancake_morning" && f.lang === "en")!);
    await flush();
    expect(plays).toHaveLength(0);
    expect(store.getState().waiting).toBe(false);
    expect(playback.canReact()).toBe(true);
  });

  it("a reply that arrives after a revert is kept but does not become current (#5)", async () => {
    const id = para("Masha runs to the swing.");
    playback.playAll();
    answer();
    await flush();
    playback.pause();
    store.editText(id, "Masha jumps.");
    playback.playAll();
    answer();
    await flush();
    playback.pause();
    store.editText(id, "Masha waves at Bear.");
    playback.playAll(); // v3 directing
    store.revert(id); // revert is refused while the director is working…
    let p = store.getState().paragraphs[0];
    expect(p.pendingVersion).not.toBeNull();
    // …and if the text is changed back meanwhile, the late reply never becomes current
    store.editText(id, "Masha jumps.");
    answer();
    await flush();
    p = store.getState().paragraphs[0];
    expect(p.versions[p.current].text).toBe("Masha jumps.");
    expect(p.versions.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it("re-directs a chained paragraph when postures/held items drift; card ▶ waits for it; the counter stays (#6 #7 #12)", async () => {
    para("Masha runs to the swing.");
    const id2 = para("Masha waves at Bear.");
    playback.playParagraph(id2);
    expect(pending).toHaveLength(2);
    // ¶2 answers first (directed against the offline estimate: Masha standing)
    answer("Masha waves");
    await flush();
    // ¶1's real staging differs materially: Masha ends up sitting on the bench
    answer("Masha runs", "Masha sits on the bench.");
    await flush();
    expect(plays).toHaveLength(0); // the stale ¶2 never plays
    expect(pending).toHaveLength(1); // ¶2 went back to the director against the real start
    expect(pending[0].req.paragraph).toBe("Masha waves at Bear.");
    expect(pending[0].req.worldState.actors.masha.posture).toBe("sit");
    answer();
    await flush();
    expect(plays).toHaveLength(1);
    const p2 = store.getState().paragraphs.find((p) => p.id === id2)!;
    expect(p2.versions.map((v) => v.version)).toEqual([1]); // same text → same version number
    expect(store.getState().paragraphs.every((p) => p.status === "ready" || p.status === "adjusted")).toBe(true);
  });

  it("a cleared block leaves the timeline on the next ▶ (#8)", async () => {
    const id = para("Masha runs to the swing.");
    para("Bear walks to the garden.");
    playback.playAll();
    answer();
    answer();
    await flush();
    expect(store.getState().timeline.segments).toHaveLength(2);
    playback.pause();
    store.editText(id, "");
    playback.playAll();
    await flush();
    expect(store.getState().timeline.segments).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  it("after Pause, late replies never send anything else to the director (#11)", async () => {
    para("Masha runs to the swing.");
    para("Masha waves at Bear.");
    playback.playAll();
    playback.pause();
    answer("Masha waves");
    answer("Masha runs", "Masha sits on the bench."); // would drift ¶2 inside a run
    await flush();
    expect(pending).toHaveLength(0); // no re-direct outside a ▶ session…
    expect(store.getState().paragraphs[1].status).toBe("draft"); // …only marked for the next ▶
  });
});
