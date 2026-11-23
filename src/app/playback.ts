// The transport resumes an existing movie. Explicit preview/update actions prepare new direction.
import type { Player } from "../engine/player/player";
import type { AudioEngine } from "../engine/api";
import { store, type AppState } from "./store";

let player: Player | null = null;
let audio: AudioEngine | null = null;
type Scope = NonNullable<AppState["previewScope"]>;
type Session = ({ kind: "all" } | { kind: "one"; id: string }) & { episodeId: string };
type Bookmark = { episodeId: string; scope: Scope; time: number; awaiting: boolean };
let session: Session | null = null;
let bookmark: Bookmark | null = null;
let holdAt: number | null = null;
let unsub: (() => void) | null = null;
let startToken = 0;
let preparingSpeech = false;

export function playbackRange(s = store.getState()): { start: number; end: number; scope: Scope } {
  const scope = s.previewScope ?? { kind: "story" };
  if (scope.kind === "story") return { start: 0, end: s.timeline.duration, scope };
  const index = s.paragraphs.findIndex(p => p.id === scope.id);
  const range = store.segmentRange(scope.id);
  const previous = s.paragraphs.slice(0, Math.max(0, index)).reverse().map(p => store.segmentRange(p.id)).find(Boolean);
  return { start: range?.start ?? previous?.end ?? 0, end: range?.end ?? previous?.end ?? 0, scope };
}
function sameScope(a: Scope, b: Scope): boolean {
  return a.kind === b.kind && (a.kind === "story" || b.kind === "moment" && a.id === b.id);
}
function endSession(): void {
  startToken++;
  preparingSpeech=false;
  store.setVoiceStatus(false);
  session = null;
  store.setRunActive(false);
  holdAt = null;
  unsub?.();
  unsub = null;
  store.setWaiting(false);
}
function remember(time: number, awaiting = false): void {
  const s = store.getState();
  bookmark = { episodeId: s.episodeId, scope: s.previewScope ?? { kind: "story" }, time, awaiting };
}
function start(from: number, to?: number): void {
  if (!player) return;
  if(preparingSpeech)return;
  player.cameraOverride = null;
  player.castOverride = null;
  const s = store.getState();
  const token=++startToken, original=s.timeline;
  const anchor=[...original.segments].reverse().find(seg=>seg.offset<=from);
  const local=anchor?from-anchor.offset:from;
  const endId=to===undefined?null:original.segments.find(seg=>Math.abs(seg.offset+seg.segment.duration-to)<.01)?.segment.paragraphId;
  const finish=()=>{
    if(token!==startToken||!player)return;
    if(store.getState().episodeId!==s.episodeId){endSession();return;}
    preparingSpeech=false;
    const current=store.getState();
    // The director may have appended a paragraph while speech was prepared. Its
    // new lines need preparation too; previously fetched lines are reused.
    if(current.lang!==s.lang||current.timeline!==original&&!durationRefresh){start(from,to);return;}
    const fresh=anchor&&current.timeline.segments.find(seg=>seg.segment.paragraphId===anchor.segment.paragraphId);
    const at=fresh?fresh.offset+Math.min(local,fresh.segment.duration):from;
    const end=endId?store.segmentRange(endId)?.end:to;
    player.setTimeline(current.timeline,current.lang);
    player.play(at,to===undefined?undefined:end);
    remember(at);store.setVoiceStatus(false);store.setPlayback(true,at);store.setWaiting(false);holdAt=null;
  };
  let durationRefresh=false;
  if(!audio?.prepare){finish();return;}
  preparingSpeech=true;store.setWaiting(true);store.setVoiceStatus(true);
  void audio.prepare(original,s.lang,from,to).then(durations=>{
    if(token!==startToken)return;
    if(store.getState().episodeId!==s.episodeId){endSession();return;}
    if(store.getState().lang!==s.lang||store.getState().timeline!==original){preparingSpeech=false;start(from,to);return;}
    durationRefresh=store.setSpeechDurations(durations);
    finish();
  }).catch(error=>{
    if(token!==startToken)return;
    if(store.getState().episodeId!==s.episodeId){endSession();return;}
    endSession();store.setPlayback(false,from);store.setVoiceStatus(false,String(error?.message??'speech_unavailable'));remember(from);
  });
}
/** Only an explicit preview/update enables new director work. Resuming never prepares or redirects. */
function tick(): void {
  if (!session || !player || preparingSpeech) return;
  const s = store.getState();
  if (s.episodeId !== session.episodeId) { endSession(); bookmark = null; player.pause(); return; }
  if (session.kind === "one") {
    const id = session.id;
    if (!s.paragraphs.some(p => p.id === id)) return endSession();
    const r = store.segmentRange(id);
    const p = s.paragraphs.find(x => x.id === id)!;
    if (r && p.pendingVersion === null && !store.isRedirectQueued(id)) {
      endSession();
      start(r.start, r.end);
    } else if (!store.hasPending()) endSession();
    return;
  }
  if (s.playing) return;
  const t = holdAt ?? 0;
  if (s.timeline.duration > t + 0.001) { start(t); return; }
  if (!store.hasPending()) {
    if (s.loop && s.timeline.duration > 0 && t >= s.timeline.duration - 0.02) {
      start(0);
      return;
    }
    endSession();
  } else store.setWaiting(true);
}
function begin(next: Session, uptoIndex: number, prepare = true, from = 0): void {
  endSession();
  player?.pause();
  store.setPlayback(false);
  session = next;
  holdAt = from;
  remember(from, true);
  store.setRunActive(prepare);
  if (prepare) store.prepare(uptoIndex);
  unsub = store.subscribe(() => queueMicrotask(tick));
  tick();
  if (session && !store.getState().playing) store.setWaiting(preparingSpeech||store.hasPending());
}

export const playback = {
  attach(p: Player | null, a: AudioEngine | null) {
    if (!p) { endSession(); bookmark = null; }
    player = p;
    audio = a;
  },
  get player() { return player; },
  get audio() { return audio; },
  reset() {
    endSession();
    player?.pause();
    const s = store.getState();
    player?.setTimeline(s.timeline, s.lang);
    player?.seek(0);
    bookmark = null;
    store.setPlayback(false, 0);
  },
  /** Regular video-player Play: resume the paused scope and time, including a paused preparation. */
  play() {
    if (!player) return;
    void audio?.unlock();
    const s = store.getState(), range = playbackRange(s);
    const saved = bookmark?.episodeId === s.episodeId && sameScope(bookmark.scope, range.scope) && (range.end > range.start || bookmark.awaiting) ? bookmark : null;
    if (saved) {
      const from = saved.time >= range.end && range.end > range.start && !saved.awaiting ? range.start : Math.max(range.start, Math.min(saved.time, range.end));
      if (range.scope.kind === "story") begin({ kind: "all", episodeId: s.episodeId }, -1, false, from);
      else if (saved.awaiting) begin({ kind: "one", id: range.scope.id, episodeId: s.episodeId }, -1, false);
      else if (range.end > range.start) { endSession(); start(from, range.end); }
      return;
    }
    if (range.scope.kind === "story") this.playAll();
    else this.playParagraph(range.scope.id);
  },
  /** Explicit update / start-over: prepare the entire story, then play it from the beginning. */
  playAll() {
    if (!player) return;
    void audio?.unlock();
    const s = store.getState();
    store.setPreviewScope({ kind: "story" });
    if (!s.selectedId && s.paragraphs[0]) store.select(s.paragraphs[0].id);
    begin({ kind: "all", episodeId: s.episodeId }, s.paragraphs.length - 1);
  },
  /** Explicit preview: refresh earlier context, then play only this moment. */
  playParagraph(id: string) {
    if (!player) return;
    void audio?.unlock();
    const s = store.getState(), idx = s.paragraphs.findIndex(p => p.id === id);
    if (idx < 0) return;
    store.setPreviewScope({ kind: "moment", id });
    store.select(id);
    begin({ kind: "one", id, episodeId: s.episodeId }, idx);
  },
  /** Switching the monitor scope is explicit and never directs or starts playback. */
  setScope(scope: Scope) {
    const current = playbackRange().scope;
    if (sameScope(current, scope)) return;
    this.pause();
    store.setPreviewScope(scope);
    this.seek(playbackRange().start);
    bookmark = null; // the next Play is a fresh preview of the chosen scope
  },
  /** Replay the current compiled scope from its start, without asking the director. */
  replay() {
    const { start: from, end, scope } = playbackRange();
    if (!player || end <= from) return;
    void audio?.unlock();
    endSession();
    start(from, scope.kind === "story" ? undefined : end);
  },
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
  canReact(): boolean { return session === null && !store.getState().waiting; },
  retryVoice() {
    store.dismissVoiceError();
    this.play();
  },
  onPlayerStopped(t: number) {
    remember(t);
    const s = store.getState();
    if (session?.kind === "all") {
      holdAt = t;
      queueMicrotask(tick);
      return;
    }
    const range = playbackRange(s);
    if (s.loop && range.end > range.start && t >= range.end - 0.02 && !store.hasPending()) {
      queueMicrotask(() => {
        const cur = store.getState();
        if (!cur.loop || cur.playing || cur.waiting || cur.episodeId !== s.episodeId) return;
        const r = playbackRange(cur);
        if (r.end > r.start) start(r.start, r.scope.kind === "story" ? undefined : r.end);
      });
    }
  },
  pause() {
    const s = store.getState();
    const time = player?.time ?? s.t;
    const awaiting = s.waiting;
    endSession(); // detach before Player emits its paused callback
    player?.pause();
    remember(time, awaiting);
    store.setPlayback(false, time);
  },
  seek(t: number) {
    endSession();
    const s = store.getState(), range = playbackRange(s);
    const time = Number.isNaN(t) ? range.start : Math.max(range.start, Math.min(range.end, t));
    player?.setTimeline(s.timeline, s.lang);
    player?.seek(time, range.scope.kind === "story" ? undefined : range.end);
    remember(time);
    store.setPlayback(false, time);
  },
};
