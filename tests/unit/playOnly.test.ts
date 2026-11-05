// v1.1 A1: no rendering while typing; ▶ directs only dirty paragraphs, ≤ 4 in parallel; prefix timeline while directing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectRequest, DirectResponse } from "../../src/shared/schema";
import { parseParagraph } from "../../src/director/offline/parser";

const pending: { req: DirectRequest; resolve: (r: DirectResponse) => void }[] = [];
vi.mock("../../src/director/client", () => ({
  directParagraph: (req: DirectRequest) =>
    new Promise<DirectResponse>((resolve) => pending.push({ req, resolve })),
}));

const { store, MAX_PARALLEL } = await import("../../src/app/store");

function answer(i = 0) {
  const [job] = pending.splice(i, 1);
  job.resolve({ beatScript: parseParagraph(job.req.paragraph, job.req.lang, job.req.worldState), source: "llm", latencyMs: 5, usage: null, model: "mock" });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Play-only rendering (store)", () => {
  beforeEach(() => {
    pending.length = 0;
    store.newStory();
  });

  it("typing never compiles or calls the director", () => {
    const id = store.addParagraph();
    const before = store.compileCount;
    for (const t of ["M", "Ma", "Masha runs", "Masha runs to the swing."]) store.editText(id, t);
    expect(store.compileCount).toBe(before);
    expect(pending).toHaveLength(0);
    expect(store.getState().paragraphs[0].status).toBe("draft");
    expect(store.getState().timeline.segments).toHaveLength(0);
  });

  it("▶ directs only dirty paragraphs, at most 4 at once, and the timeline grows as a ready prefix", async () => {
    const texts = ["Masha runs to the swing.", "Bear walks to the garden.", "Masha jumps.", "Bear sits on the bench.", "Masha waves at Bear.", "Bear naps."];
    for (const t of texts) store.editText(store.addParagraph(), t);
    expect(store.prepare(texts.length - 1)).toBe(6);
    expect(MAX_PARALLEL).toBe(4);
    expect(pending).toHaveLength(4); // the rest wait in the queue
    expect(store.getState().paragraphs.every((p) => p.status === "directing")).toBe(true);
    // paragraph 2 answers first: nothing plays yet (paragraph 1 is still directing)
    answer(1);
    await flush();
    expect(store.getState().timeline.segments).toHaveLength(0);
    answer(0); // paragraph 1 → the prefix ¶1–¶2 is playable
    await flush();
    expect(store.getState().timeline.segments).toHaveLength(2);
    while (pending.length) {
      answer(0);
      await flush();
    }
    const st = store.getState();
    expect(st.timeline.segments).toHaveLength(6);
    expect(st.paragraphs.every((p) => p.status === "ready" && p.versions.length === 1)).toBe(true);
    // nothing dirty → ▶ again makes no call
    expect(store.prepare(5)).toBe(0);
    // edit ¶3 → only ¶3 is directed on the next ▶
    store.editText(st.paragraphs[2].id, "Masha jumps and laughs.");
    expect(pending).toHaveLength(0);
    expect(store.prepare(5)).toBe(1);
    expect(pending[0].req.paragraph).toBe("Masha jumps and laughs.");
  });

  it("an edit made while directing waits for the next ▶ (paragraph stays draft)", async () => {
    const id = store.addParagraph();
    store.editText(id, "Masha runs to the swing.");
    store.prepare(0);
    store.editText(id, "Masha runs to the pond.");
    answer();
    await flush();
    const p = store.getState().paragraphs[0];
    expect(p.status).toBe("draft");
    expect(p.versions[p.current].text).toBe("Masha runs to the swing.");
  });
});
