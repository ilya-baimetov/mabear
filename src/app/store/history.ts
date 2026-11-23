import type { AppState, HistoryEntry, Paragraph } from "./types";

const HISTORY_LIMIT = 40;
const EDIT_COALESCE_MS = 900;

export function cloneParagraphs(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.map((p) => ({
    ...p,
    pendingVersion: null,
    status: p.status === "directing" ? "draft" : p.status,
    versions: [...p.versions],
  }));
}

export function makeHistorySnapshot(state: AppState): HistoryEntry {
  return {
    title: state.title,
    paragraphs: cloneParagraphs(state.paragraphs),
    selectedId: state.selectedId,
    fixtureId: state.fixtureId,
  };
}

export class HistoryStack {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private batchDepth = 0;
  private lastEditId: string | null = null;
  private lastEditAt = 0;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get inBatch(): boolean {
    return this.batchDepth > 0;
  }

  push(state: AppState, coalesceKey?: string): boolean {
    if (this.batchDepth > 0) return false;
    const now = Date.now();
    if (coalesceKey && coalesceKey === this.lastEditId && now - this.lastEditAt < EDIT_COALESCE_MS) {
      this.lastEditAt = now;
      if (this.future.length) {
        this.future = [];
        return true;
      }
      return false;
    }
    this.past.push(makeHistorySnapshot(state));
    while (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.lastEditId = coalesceKey ?? null;
    this.lastEditAt = coalesceKey ? now : 0;
    return true;
  }

  enterBatch(): void {
    this.batchDepth += 1;
  }

  exitBatch(): void {
    this.batchDepth -= 1;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastEditId = null;
    this.lastEditAt = 0;
  }

  undo(currentState: AppState): HistoryEntry | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(makeHistorySnapshot(currentState));
    this.lastEditId = null;
    this.lastEditAt = 0;
    return prev;
  }

  redo(currentState: AppState): HistoryEntry | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(makeHistorySnapshot(currentState));
    this.lastEditId = null;
    this.lastEditAt = 0;
    return next;
  }
}
