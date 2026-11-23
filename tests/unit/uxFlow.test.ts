import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectRequest, DirectResponse } from "../../src/shared/schema";
import { parseParagraph } from "../../src/director/offline/parser";

const pending: { req: DirectRequest; resolve: (value: DirectResponse) => void; reject: (err: Error) => void }[] = [];
vi.mock("../../src/director/client", () => ({
  directParagraph: (req: DirectRequest) =>
    new Promise<DirectResponse>((resolve, reject) => pending.push({ req, resolve, reject })),
}));

const { store } = await import("../../src/app/store");
const { playback } = await import("../../src/app/playback");
const {
  applyFullStory,
  deleteMomentWithUndo,
  discardMomentDraft,
  duplicateMoment,
  redoStory,
  revertMoment,
  selectMoment,
  undoStory,
} = await import("../../src/app/storyFlow");
const { FIXTURES } = await import("../../src/director/fixtures/index");

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

function resolveNext(textOverride?: string) {
  const job = pending.shift();
  expect(job).toBeDefined();
  const text = textOverride ?? job!.req.paragraph;
  job!.resolve({
    beatScript: parseParagraph(text, job!.req.lang, job!.req.worldState),
    source: "llm",
    latencyMs: 5,
    usage: null,
    model: "mock",
  });
}

const plays: { from: number; to?: number }[] = [];
const fakePlayer = {
  isPlaying: false,
  cameraOverride: null as null | (() => unknown),
  castOverride: null as null | string[],
  setTimeline: vi.fn(),
  play(from: number, to?: number) {
    plays.push({ from, to });
    this.isPlaying = true;
  },
  pause: vi.fn(function (this: { isPlaying: boolean }) {
    this.isPlaying = false;
  }),
  seek: vi.fn(),
};

const lsData = new Map<string, string>();
const quotaFailKeys = new Set<string>();
let originalLocalStorage: PropertyDescriptor | undefined;

const fakeLocalStorage: Storage = {
  get length() {
    return lsData.size;
  },
  clear() {
    lsData.clear();
  },
  getItem(key: string) {
    return lsData.get(key) ?? null;
  },
  key(index: number) {
    return Array.from(lsData.keys())[index] ?? null;
  },
  removeItem(key: string) {
    lsData.delete(key);
  },
  setItem(key: string, value: string) {
    if (quotaFailKeys.has(key)) {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    }
    lsData.set(key, value);
  },
};

describe("UX flow: history, scene actions, playback loop, voice retry, and storage fallback", () => {
  beforeAll(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });

  beforeEach(async () => {
    playback.pause();
    pending.length = 0;
    plays.length = 0;
    fakePlayer.isPlaying = false;
    fakePlayer.cameraOverride = null;
    fakePlayer.castOverride = null;
    fakePlayer.pause.mockClear();
    fakePlayer.seek.mockClear();
    fakePlayer.setTimeline.mockClear();
    lsData.clear();
    quotaFailKeys.clear();
    store.setLang("en");
    store.setLoop(false);
    store.setCaptions(true);
    store.dismissVoiceError();
    store.newStory(false);
    store.clearHistory();
    playback.attach(fakePlayer as never, null);
    await flush();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("store.undo() and store.redo()", () => {
    it("coalesces rapid typing within 900ms into one undo point and splits edits past 900ms", () => {
      let now = 10_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);

      const id = store.addParagraph();
      store.clearHistory();

      store.editText(id, "M");
      now += 200;
      store.editText(id, "Ma");
      now += 350;
      store.editText(id, "Masha");
      now += 300;
      store.editText(id, "Masha waves.");

      expect(store.getState().canUndo).toBe(true);
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs[0].text).toBe("");
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().canRedo).toBe(true);

      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs[0].text).toBe("Masha waves.");

      now += 950;
      store.editText(id, "Masha waves to Bear.");
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs[0].text).toBe("Masha waves.");

      // A new edit after undo clears redo history.
      store.editText(id, "Masha jumps.");
      expect(store.getState().canRedo).toBe(false);
    });

    it("tracks distinct undo/redo points across addParagraph, moveParagraph, deleteParagraph, setRemix, loadFixtureById, and newStory", () => {
      store.loadFixtureById("garden_party", false);
      store.clearHistory();
      const [p0, p1, p2] = store.getState().paragraphs;

      // addParagraph
      const addedId = store.addParagraph(p0.id);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, addedId, p1.id, p2.id]);
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p1.id, p2.id]);
      expect(store.getState().selectedId).toBe(p0.id);
      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, addedId, p1.id, p2.id]);
      expect(store.undo()).toBe(true);

      // moveParagraph
      store.moveParagraph(p1.id, -1);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p1.id, p0.id, p2.id]);
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p1.id, p2.id]);
      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p1.id, p0.id, p2.id]);
      expect(store.undo()).toBe(true);

      // deleteParagraph
      store.deleteParagraph(p1.id);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p2.id]);
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p1.id, p2.id]);
      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p2.id]);
      expect(store.undo()).toBe(true);

      // setRemix
      store.setRemix(p0.id, { timeOfDay: "night", musicMood: "spooky", cameraSeed: 2 });
      const remixed = store.getState().paragraphs[0].versions[0].remix;
      expect(remixed).toEqual({ timeOfDay: "night", musicMood: "spooky", cameraSeed: 2 });
      expect(store.undo()).toBe(true);
      expect(store.getState().paragraphs[0].versions[0].remix).toEqual({ timeOfDay: null, musicMood: null, cameraSeed: 0 });
      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs[0].versions[0].remix).toEqual({ timeOfDay: "night", musicMood: "spooky", cameraSeed: 2 });

      // loadFixtureById
      store.loadFixtureById("bears_nap");
      expect(store.getState().fixtureId).toBe("bears_nap");
      expect(store.undo()).toBe(true);
      expect(store.getState().fixtureId).toBe("garden_party");
      expect(store.redo()).toBe(true);
      expect(store.getState().fixtureId).toBe("bears_nap");

      // newStory
      store.newStory();
      expect(store.getState().paragraphs).toHaveLength(0);
      expect(store.undo()).toBe(true);
      expect(store.getState().fixtureId).toBe("bears_nap");
      expect(store.redo()).toBe(true);
      expect(store.getState().paragraphs).toHaveLength(0);
    });

    it("undoes and redoes applyFullStory as a single atomic batch", () => {
      store.loadFixtureById("garden_party", false);
      store.clearHistory();
      const origTitle = store.getState().title;
      const origIds = store.getState().paragraphs.map((p) => p.id);
      const origTexts = store.getState().paragraphs.map((p) => p.text);

      applyFullStory(`${origTexts[0]}\n\nMasha claps happily.\n\nBear dances.\n\nWolves peek.`);
      expect(store.getState().paragraphs).toHaveLength(4);
      expect(store.getState().paragraphs[0].id).toBe(origIds[0]);

      expect(undoStory()).toBe(true);
      expect(store.getState().title).toBe(origTitle);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual(origIds);
      expect(store.getState().paragraphs.map((p) => p.text)).toEqual(origTexts);

      expect(redoStory()).toBe(true);
      expect(store.getState().paragraphs).toHaveLength(4);
      expect(store.getState().paragraphs[1].text).toBe("Masha claps happily.");
      expect(store.getState().paragraphs[3].text).toBe("Wolves peek.");
    });
  });

  describe("duplicateMoment", () => {
    it("clones the scene right below the original, selects it, and carries pendingRemix into compile/direct", async () => {
      store.loadFixtureById("garden_party", false);
      const orig = store.getState().paragraphs[0];
      store.setRemix(orig.id, { timeOfDay: "sunset", musicMood: "calm", cameraSeed: 3 });

      const cloneId = duplicateMoment(orig.id);
      expect(cloneId).not.toBeNull();
      const paras = store.getState().paragraphs;
      expect(paras).toHaveLength(4);
      expect(paras[1].id).toBe(cloneId);
      expect(paras[1].text).toBe(orig.text);
      expect(paras[1].status).toBe("draft");
      expect(paras[1].current).toBe(-1);
      expect(paras[1].versions).toEqual([]);
      expect(paras[1].pendingRemix).toEqual({ timeOfDay: "sunset", musicMood: "calm", cameraSeed: 3 });
      expect(store.getState().selectedId).toBe(cloneId);

      // Even if the original scene resets to default, the clone keeps its carried pendingRemix.
      store.setRemix(orig.id, { timeOfDay: null, musicMood: null, cameraSeed: 0 });

      playback.playParagraph(cloneId!);
      expect(pending).toHaveLength(1);
      resolveNext();
      await flush();

      const updatedClone = store.getState().paragraphs.find((p) => p.id === cloneId)!;
      expect(updatedClone.status).toBe("ready");
      expect(updatedClone.pendingRemix).toBeUndefined();
      expect(updatedClone.versions[0].remix).toEqual({ timeOfDay: "sunset", musicMood: "calm", cameraSeed: 3 });
      const segIdx = store.getState().segmentIds.indexOf(cloneId!);
      expect(segIdx).toBe(1);
      expect(store.getState().results[segIdx].segment.lighting[0].timeOfDay).toBe("sunset");
      expect(store.getState().results[segIdx].segment.endState.timeOfDay).toBe("sunset");
      expect(store.getState().results[segIdx].segment.music[0].mood).toBe("calm");
    });
  });

  describe("discardMomentDraft and revertMoment", () => {
    it("pauses playback and restores the compiled version cleanly", async () => {
      const id = store.addParagraph();
      store.editText(id, "Masha waves to Bear.");
      playback.playParagraph(id);
      resolveNext();
      await flush();

      store.editText(id, "Masha jumps.");
      playback.playParagraph(id);
      resolveNext();
      await flush();
      expect(store.getState().paragraphs[0].versions).toHaveLength(2);
      expect(store.getState().paragraphs[0].current).toBe(1);

      // Edit into draft and start playback before discarding draft.
      store.editText(id, "Masha spins in circles.");
      store.setPlayback(true, 0.4);
      fakePlayer.isPlaying = true;
      fakePlayer.pause.mockClear();

      discardMomentDraft(id);
      expect(fakePlayer.pause).toHaveBeenCalledTimes(1);
      expect(store.getState().playing).toBe(false);
      expect(store.getState().paragraphs[0].text).toBe("Masha jumps.");
      expect(store.getState().paragraphs[0].status).toBe("ready");
      expect(store.getState().paragraphs[0].current).toBe(1);
      // Already clean -> discardDraft returns false
      expect(store.discardDraft(id)).toBe(false);

      // Revert to v1 while playing
      store.setPlayback(true, 0.2);
      fakePlayer.isPlaying = true;
      fakePlayer.pause.mockClear();

      revertMoment(id);
      expect(fakePlayer.pause).toHaveBeenCalledTimes(1);
      expect(store.getState().playing).toBe(false);
      expect(store.getState().paragraphs[0].current).toBe(0);
      expect(store.getState().paragraphs[0].text).toBe("Masha waves to Bear.");
      expect(store.getState().paragraphs[0].status).toBe("ready");
      expect(store.getState().timeline.segments).toHaveLength(1);
    });
  });

  describe("deleteMomentWithUndo and undoStory", () => {
    it("emits an undo toast and restores the deleted scene text, position, and versions", () => {
      store.loadFixtureById("garden_party", false);
      const [p0, p1, p2] = store.getState().paragraphs;
      selectMoment(p1.id);
      playback.playAll();
      expect(store.getState().playing).toBe(true);

      deleteMomentWithUndo(p1.id);

      expect(store.getState().playing).toBe(false);
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p2.id]);
      expect(store.getState().selectedId).toBe(p0.id);
      expect(store.getState().toast?.undoable).toBe(true);
      expect(store.getState().toast?.message.en).toContain("Scene 2");
      expect(store.getState().toast?.message.ru).toContain("Сцена 2");

      expect(undoStory()).toBe(true);
      expect(store.getState().toast).toBeNull();
      expect(store.getState().paragraphs.map((p) => p.id)).toEqual([p0.id, p1.id, p2.id]);
      expect(store.getState().paragraphs[1].text).toBe(p1.text);
      expect(store.getState().paragraphs[1].versions).toEqual(p1.versions);
      expect(store.getState().segmentIds).toEqual([p0.id, p1.id, p2.id]);
    });

    it("replaces a deleted single scene with an empty scene and omits toast when deleting an empty blank scene", () => {
      const id = store.addParagraph();
      deleteMomentWithUndo(id);
      expect(store.getState().paragraphs).toHaveLength(1);
      expect(store.getState().paragraphs[0].text).toBe("");
      expect(store.getState().toast).toBeNull();

      const onlyId = store.getState().paragraphs[0].id;
      store.editText(onlyId, "Masha waves.");
      deleteMomentWithUndo(onlyId);
      expect(store.getState().paragraphs).toHaveLength(1);
      expect(store.getState().paragraphs[0].text).toBe("");
      expect(store.getState().toast?.undoable).toBe(true);

      expect(undoStory()).toBe(true);
      expect(store.getState().paragraphs).toHaveLength(1);
      expect(store.getState().paragraphs[0].text).toBe("Masha waves.");
    });
  });

  describe("store.hasOwnWriting()", () => {
    it("distinguishes untouched fixtures and blank drafts from customized stories", () => {
      const blankId = store.addParagraph();
      expect(store.hasOwnWriting()).toBe(false);
      store.editText(blankId, "   \n  ");
      expect(store.hasOwnWriting()).toBe(false);

      store.loadFixtureById("garden_party", false);
      expect(store.hasOwnWriting()).toBe(false);
      store.setLang("ru");
      expect(store.hasOwnWriting()).toBe(false);
      store.setLang("en");
      expect(store.hasOwnWriting()).toBe(false);

      // Custom title
      store.setTitle("My Forest Adventure");
      expect(store.hasOwnWriting()).toBe(true);
      store.undo();
      expect(store.hasOwnWriting()).toBe(false);

      // Deleted scene
      const [p0, p1] = store.getState().paragraphs;
      store.deleteParagraph(p1.id);
      expect(store.hasOwnWriting()).toBe(true);
      store.undo();
      expect(store.hasOwnWriting()).toBe(false);

      // Reordered scene
      store.moveParagraph(p0.id, 1);
      expect(store.hasOwnWriting()).toBe(true);
      store.undo();
      expect(store.hasOwnWriting()).toBe(false);

      // Remix change
      store.setRemix(p0.id, { cameraSeed: 1 });
      expect(store.hasOwnWriting()).toBe(true);
      store.undo();
      expect(store.hasOwnWriting()).toBe(false);

      // Added scene
      store.addParagraph(p0.id);
      expect(store.hasOwnWriting()).toBe(true);
    });
  });

  describe("captions, loop wrap, retryVoice, and saveError fallback", () => {
    it("toggles captions and persists preference in localStorage", () => {
      expect(store.getState().captions).toBe(true);
      store.setCaptions(false);
      expect(store.getState().captions).toBe(false);
      expect(lsData.get("mabear.captions")).toBe("0");

      store.setCaptions(true);
      expect(store.getState().captions).toBe(true);
      expect(lsData.get("mabear.captions")).toBe("1");
    });

    it("loops playback in playback.onPlayerStopped for both story and moment scopes when loop is enabled", async () => {
      store.loadFixtureById("garden_party", false);
      store.setLoop(true);

      // Story scope wrap
      playback.playAll();
      await flush();
      expect(plays.at(-1)).toEqual({ from: 0, to: undefined });

      const dur = store.getState().timeline.duration;
      fakePlayer.isPlaying = false;
      store.setPlayback(false, dur);
      playback.onPlayerStopped(dur);
      await flush();
      expect(plays).toHaveLength(2);
      expect(plays[1]).toEqual({ from: 0, to: undefined });

      // Moment scope wrap
      playback.pause();
      plays.length = 0;
      const p1 = store.getState().paragraphs[1];
      const range = store.segmentRange(p1.id)!;
      playback.playParagraph(p1.id);
      await flush();
      expect(plays).toEqual([{ from: range.start, to: range.end }]);

      fakePlayer.isPlaying = false;
      store.setPlayback(false, range.end);
      playback.onPlayerStopped(range.end);
      await flush();
      expect(plays).toHaveLength(2);
      expect(plays[1]).toEqual({ from: range.start, to: range.end });

      // No wrap when paused before end or when loop is off
      store.setLoop(false);
      fakePlayer.isPlaying = false;
      store.setPlayback(false, range.end);
      playback.onPlayerStopped(range.end);
      await flush();
      expect(plays).toHaveLength(2);
    });

    it("recovers from voice preparation failure on playback.retryVoice()", async () => {
      store.loadFixtureById("garden_party", false);
      const prepare = vi
        .fn()
        .mockRejectedValueOnce(new Error("speech_unavailable"))
        .mockResolvedValueOnce({});
      playback.attach(fakePlayer as never, { prepare, unlock: async () => {} } as never);

      playback.playAll();
      await flush();
      expect(store.getState().voiceError).toBe("speech_unavailable");
      expect(plays).toHaveLength(0);

      playback.retryVoice();
      await flush();
      expect(store.getState().voiceError).toBeNull();
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(plays).toHaveLength(1);
    });

    it("flags saveError on localStorage quota failure without losing edits and clears it when saving succeeds", () => {
      const id = store.addParagraph();
      expect(store.getState().saveError).toBe(false);

      quotaFailKeys.add("mabear.episode");
      store.editText(id, "Masha bakes pancakes.");
      expect(store.getState().saveError).toBe(true);
      expect(store.getState().paragraphs[0].text).toBe("Masha bakes pancakes.");

      quotaFailKeys.delete("mabear.episode");
      store.editText(id, "Masha bakes pancakes for Bear.");
      expect(store.getState().saveError).toBe(false);
      expect(lsData.get("mabear.episode")).toContain("Masha bakes pancakes for Bear.");
    });
  });
});
