import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectRequest, DirectResponse } from "../../src/shared/schema";
import { parseParagraph } from "../../src/director/offline/parser";
const pending: { req: DirectRequest; resolve: (value: DirectResponse) => void }[] = [];
vi.mock("../../src/director/client", () => ({ directParagraph: (req: DirectRequest) => new Promise<DirectResponse>(resolve => pending.push({ req, resolve })) }));
const { store } = await import("../../src/app/store");
const { playback } = await import("../../src/app/playback");
const { applyFullStory, earlierChanges, insertMoment, moveMoment, selectMoment } = await import("../../src/app/storyFlow");
const { FIXTURES } = await import("../../src/director/fixtures");
const player = { isPlaying: false, cameraOverride: null, setTimeline: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

describe("incremental moment direction", () => {
  beforeEach(() => {
    playback.pause(); pending.length = 0; vi.clearAllMocks(); store.newStory(); playback.attach(player as never, null);
    store.loadFixture(FIXTURES.find(f => f.id === "garden_party" && f.lang === "en")!);
  });
  it("storyboard editing selection never interrupts an entire-story movie or moves its playhead", () => {
    playback.playAll();
    store.setTime(2.25);
    const second = store.getState().paragraphs[1].id;
    player.pause.mockClear(); player.seek.mockClear();
    selectMoment(second);
    expect(store.getState().selectedId).toBe(second);
    expect(store.getState().previewScope).toEqual({ kind: "story" });
    expect(store.getState().t).toBe(2.25);
    expect(store.getState().playing).toBe(true);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.seek).not.toHaveBeenCalled();
  });
  it("inserts after the selected middle moment without replacing later writing", () => {
    const before = store.getState().paragraphs.map(p => ({ id: p.id, text: p.text }));
    const id = insertMoment(before[1].id);
    expect(store.getState().paragraphs.map(p => p.id)).toEqual([before[0].id, before[1].id, id, before[2].id]);
    expect(store.getState().paragraphs[3].text).toBe(before[2].text);
    expect(store.getState().selectedId).toBe(id);
    expect(player.play).not.toHaveBeenCalled(); expect(pending).toHaveLength(0);
    expect(store.getState().t).toBe(store.segmentRange(before[1].id)!.end);
    expect(player.seek).toHaveBeenLastCalledWith(store.segmentRange(before[1].id)!.end, store.segmentRange(before[1].id)!.end);
  });
  it("shows earlier changes without modifying or directing the selected later moment", () => {
    const [first, second] = store.getState().paragraphs;
    store.editText(first.id, "Masha jumps.");
    selectMoment(second.id);
    expect(earlierChanges(store.getState(), second.id)).toEqual([0]);
    expect(store.getState().paragraphs[1].text).toBe(second.text);
    expect(pending).toHaveLength(0); expect(player.play).not.toHaveBeenCalled();
    store.editText(first.id, first.versions[first.current].text);
    expect(earlierChanges(store.getState(), second.id)).toEqual([]);
  });
  it("prepares a dirty predecessor for continuity but plays only the selected moment and has an explicit end", async () => {
    const [first, second] = store.getState().paragraphs;
    store.editText(first.id, "Masha jumps.");
    playback.playParagraph(second.id);
    expect(pending).toHaveLength(1); expect(player.play).not.toHaveBeenCalled();
    const job = pending.shift()!;
    job.resolve({ beatScript: parseParagraph(job.req.paragraph, job.req.lang, job.req.worldState), source: "llm", latencyMs: 1, usage: null, model: "mock" });
    await flush();
    const range = store.segmentRange(second.id)!;
    expect(player.play).toHaveBeenCalledTimes(1); expect(player.play).toHaveBeenLastCalledWith(range.start, range.end);
    expect(range.start).toBeGreaterThan(0);
    expect(store.getState().previewScope).toEqual({ kind: "moment", id: second.id });
  });
  it("reordering preserves writing and selection while recalculating the new starting state", () => {
    const before = store.getState().paragraphs;
    const moved = before[1];
    moveMoment(moved.id, -1);
    const s = store.getState();
    expect(s.paragraphs.map(p => p.id)).toEqual([moved.id, before[0].id, before[2].id]);
    expect(s.paragraphs[0].text).toBe(moved.text);
    expect(s.selectedId).toBe(moved.id);
    expect(s.t).toBe(0);
    expect(player.seek).toHaveBeenLastCalledWith(0, store.segmentRange(moved.id)!.end);
    expect(s.results[1].segment.startState).toEqual(s.results[0].segment.endState);
    expect(player.play).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });
  it("whole-story review preserves the creator's selected moment", () => {
    const selected = store.getState().paragraphs[1].id;
    selectMoment(selected);
    playback.playAll();
    expect(store.getState().selectedId).toBe(selected);
    expect(store.getState().previewScope).toEqual({ kind: "story" });
    expect(player.play).toHaveBeenLastCalledWith(0, undefined);
  });
  it("applies full-story changes explicitly, preserving unchanged moment identities and compiled versions", () => {
    const before = store.getState().paragraphs;
    applyFullStory(`${before[0].text}\n\nMasha claps.\n\n${before[2].text}\n\nBear waves.`);
    const after = store.getState().paragraphs;
    expect(after.slice(0, 3).map(p => p.id)).toEqual(before.map(p => p.id));
    expect(after[0].versions).toBe(before[0].versions);
    expect(after[1].status).toBe("draft"); expect(after[3].text).toBe("Bear waves.");
    expect(pending).toHaveLength(0); expect(player.play).not.toHaveBeenCalled();
  });
});
