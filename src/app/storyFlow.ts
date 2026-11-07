import { store, type AppState, type Paragraph } from "./store";
import { playback } from "./playback";

export function selectedMoment(s: AppState): Paragraph | undefined {
  return s.paragraphs.find(p => p.id === s.selectedId) ?? s.paragraphs[0];
}

export function earlierChanges(s: AppState, id: string): number[] {
  const index = s.paragraphs.findIndex(p => p.id === id);
  return s.paragraphs.slice(0, index).flatMap((p, i) => p.text.trim() && (p.status === "draft" || p.pendingVersion !== null) ? [i] : []);
}

/** Editing selection is independent of whole-story playback. Only the selected-moment monitor follows it. */
export function selectMoment(id: string): void {
  const s = store.getState();
  if (!s.paragraphs.some(p => p.id === id)) return;
  store.select(id);
  if (s.previewScope?.kind === "moment") {
    playback.setScope({ kind: "moment", id });
    if (typeof window !== "undefined") window.__mabear?.closeup(null);
  }
}

/** Insert immediately after the selected moment; future writing keeps its identity and order. */
export function insertMoment(afterId: string): string {
  playback.pause();
  const id = store.addParagraph(afterId);
  selectMoment(id);
  playback.setScope({ kind: "moment", id });
  return id;
}

/** Reorder an existing moment without changing its identity, writing, or selection. */
export function moveMoment(id: string, direction: -1 | 1): void {
  playback.pause();
  store.moveParagraph(id, direction);
  selectMoment(id);
  store.setPreviewScope({ kind: "moment", id });
  playback.seek(store.segmentRange(id)?.start ?? 0);
}

/** Whole-story input is explicit; typing in the dialog never directs or mutates the live story. */
export function applyFullStory(text: string): void {
  playback.pause();
  const parts = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  const original = [...store.getState().paragraphs];
  parts.forEach((part, i) => {
    const id = original[i]?.id ?? store.addParagraph();
    store.editText(id, part);
  });
  original.slice(parts.length).forEach(p => store.deleteParagraph(p.id));
  if (!store.getState().paragraphs.length) store.addParagraph();
  selectMoment(store.getState().paragraphs[0].id);
}
