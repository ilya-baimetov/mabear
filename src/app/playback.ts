// Bridges UI buttons to the engine Player (created by the Stage component). No engine imports at module load.
// Rendering happens only here, on ▶ Play (spec §4.3, §6.5): Play directs the dirty paragraphs it needs, starts as
// soon as the first one is ready, and holds with "getting ready…" when the playhead catches up with the director.
import type { Player } from "../engine/player/player";
import type { AudioEngine } from "../engine/api";
import { store } from "./store";

let player: Player | null = null;
let audio: AudioEngine | null = null;

/** The current ▶ Play request: the whole story, or one paragraph. */
type Session = ({ kind: "all" } | { kind: "one"; id: string }) & { episodeId: string };
let session: Session | null = null;
/** episode time where the player is holding for the next paragraph */
let holdAt: number | null = null;
let unsub: (() => void) | null = null;

function endSession(): void {
  session = null;
  store.setRunActive(false);
  holdAt = null;
  unsub?.();
  unsub = null;
  store.setWaiting(false);
}

function start(from: number, to?: number): void {
  if (!player) return;
  player.cameraOverride = null;
  const s = store.getState();
  player.setTimeline(s.timeline, s.lang);
  player.play(from, to);
  store.setPlayback(true, from);
  store.setWaiting(false);
  holdAt = null;
}

/** Drive the session from store changes: start when ready, hold when the playhead reaches unfinished work, resume. */
function tick(): void {
  if (!session || !player) return;
  const s = store.getState();
  // a new story / example replaced the one this ▶ was for: never start playing it by itself
  if (s.episodeId !== session.episodeId) return endSession();
  if (session.kind === "one") {
    const id = session.id;
    if (!s.paragraphs.some((p) => p.id === id)) return endSession();
    const r = store.segmentRange(id);
    const p = s.paragraphs.find((x) => x.id === id)!;
    if (r && p.pendingVersion === null && !store.isRedirectQueued(id)) {
      endSession();
      start(r.start, r.end);
    } else if (!store.hasPending()) endSession(); // nothing left to wait for (e.g. empty text)
    return;
  }
  // "all"
  if (s.playing) return;
  const t = holdAt ?? 0;
  if (s.timeline.duration > t + 0.05) {
    start(t);
    return;
  }
  if (!store.hasPending()) endSession();
  else store.setWaiting(true);
}

function begin(next: Session, uptoIndex: number): void {
  endSession();
  // A new preview owns the stage immediately, even while its direction is being prepared.
  player?.pause();
  store.setPlayback(false);
  session = next;
  store.setRunActive(true);
  store.prepare(uptoIndex);
  unsub = store.subscribe(() => queueMicrotask(tick));
  tick();
  if (session && !store.getState().playing) store.setWaiting(store.hasPending());
}

export const playback = {
  attach(p: Player | null, a: AudioEngine | null) {
    player = p;
    audio = a;
  },
  get player() {
    return player;
  },
  get audio() {
    return audio;
  },
  /** ▶ Play all: render what's dirty (≤ 4 calls in parallel), play from the start as soon as paragraph 1 is ready. */
  playAll() {
    if (!player) return; // stage still loading
    void audio?.unlock();
    const s = store.getState();
    store.setPreviewScope({ kind: "story" });
    if (!s.selectedId && s.paragraphs[0]) store.select(s.paragraphs[0].id);
    holdAt = 0;
    begin({ kind: "all", episodeId: s.episodeId }, s.paragraphs.length - 1);
  },
  /** ▶ on a card: render that paragraph (and any dirty one before it, for continuity), then play only its segment. */
  playParagraph(id: string) {
    if (!player) return;
    void audio?.unlock();
    const idx = store.getState().paragraphs.findIndex((p) => p.id === id);
    if (idx < 0) return;
    store.setPreviewScope({ kind: "moment", id });
    store.select(id);
    begin({ kind: "one", id, episodeId: store.getState().episodeId }, idx);
  },
  /** Replays compiled work without asking the director, even when an earlier paragraph is dirty. */
  replaySegment(id: string) {
    if (!player) return;
    const range = store.segmentRange(id);
    if (!range) return;
    void audio?.unlock();
    endSession();
    store.setPreviewScope({ kind: "moment", id });
    store.select(id);
    start(range.start, range.end);
  },
  canReact(): boolean {
    return session === null && !store.getState().waiting;
  },
  /** Called by the Stage when the player stops on its own at the end of what's rendered. */
  onPlayerStopped(t: number) {
    if (session?.kind !== "all") return;
    holdAt = t;
    queueMicrotask(tick);
  },
  pause() {
    endSession();
    player?.pause();
    store.setPlayback(false);
  },
  seek(t: number) {
    endSession();
    const s = store.getState();
    const time = Number.isNaN(t) ? 0 : Math.max(0, Math.min(s.timeline.duration, t));
    const momentId = s.previewScope?.kind === "moment" ? s.previewScope.id : s.selectedId;
    const index = s.paragraphs.findIndex(p => p.id === momentId);
    const range = momentId ? store.segmentRange(momentId) : null;
    const previous = s.paragraphs.slice(0, Math.max(0, index)).reverse().map(p => store.segmentRange(p.id)).find(Boolean);
    const boundEnd = s.previewScope?.kind === "story" ? undefined : range?.end ?? previous?.end;
    player?.setTimeline(s.timeline, s.lang);
    player?.seek(time, boundEnd);
    store.setPlayback(false, time);
  },
};
