/** Director calls in flight at once during a ▶ Play run. */
export const MAX_PARALLEL = 4;

interface QueuedDirectorJob {
  id: string;
  run: (token: symbol) => void;
}

export class DirectorQueue {
  private inflight = new Map<string, AbortController>();
  private queue: QueuedDirectorJob[] = [];
  private activeTokens = new Set<symbol>();
  private activeById = new Map<string, symbol>();
  private redirected = new Set<string>();
  private redirectQueue = new Set<string>();

  startInflight(id: string): AbortController {
    this.abortInflight(id);
    this.queue = this.queue.filter((job) => job.id !== id);
    const ctrl = new AbortController();
    this.inflight.set(id, ctrl);
    return ctrl;
  }

  isCurrentInflight(id: string, ctrl: AbortController): boolean {
    return this.inflight.get(id) === ctrl;
  }

  enqueue(id: string, run: (token: symbol) => void): void {
    this.queue.push({ id, run });
    this.pump();
  }

  pump(): void {
    while (this.activeTokens.size < MAX_PARALLEL && this.queue.length) {
      const job = this.queue.shift();
      if (!job) break;
      const token = Symbol(job.id);
      this.activeTokens.add(token);
      this.activeById.set(job.id, token);
      job.run(token);
    }
  }

  finishJob(id: string, ctrl: AbortController, token: symbol): void {
    if (this.inflight.get(id) === ctrl) this.inflight.delete(id);
    if (this.activeById.get(id) === token) this.activeById.delete(id);
    this.activeTokens.delete(token);
    this.pump();
  }

  abortInflight(id: string): void {
    const prev = this.inflight.get(id);
    if (prev) {
      prev.abort();
      this.inflight.delete(id);
    }
    const token = this.activeById.get(id);
    if (token) {
      this.activeById.delete(id);
      this.activeTokens.delete(token);
    }
  }

  /** Remove a deleted paragraph from inflight requests, pending queue, and redirect queue. */
  remove(id: string): void {
    this.abortInflight(id);
    this.queue = this.queue.filter((job) => job.id !== id);
    this.redirectQueue.delete(id);
  }

  /** Abort all inflight calls and clear queued/redirected state when switching episodes. */
  clearAll(): void {
    for (const c of this.inflight.values()) c.abort();
    this.inflight.clear();
    this.queue.length = 0;
    this.activeById.clear();
    this.activeTokens.clear();
    this.redirectQueue.clear();
    this.redirected.clear();
  }

  clearAbortableQueues(): void {
    for (const c of this.inflight.values()) c.abort();
    this.inflight.clear();
    this.queue.length = 0;
    this.activeById.clear();
    this.activeTokens.clear();
    this.redirectQueue.clear();
  }

  hasRedirected(key: string): boolean {
    return this.redirected.has(key);
  }

  markRedirected(key: string): void {
    this.redirected.add(key);
  }

  queueRedirect(id: string): void {
    this.redirectQueue.add(id);
  }

  dequeueRedirect(id: string): void {
    this.redirectQueue.delete(id);
  }

  isRedirectQueued(id: string): boolean {
    return this.redirectQueue.has(id);
  }

  hasQueuedRedirects(): boolean {
    return this.redirectQueue.size > 0;
  }
}
