// App store + paragraph pipeline (spec §4.2, §6.5). No React imports here; components subscribe via useStore().
import { BIBLE_VERSION } from "../shared/bible/characters";
import {
  ACTOR_IDS,
  DEFAULT_REMIX,
  MAX_PARAGRAPH_CHARS,
  type BeatScript,
  type DirectorModel,
  type DirectResponse,
  type FixtureEpisode,
  type Lang,
  type Remix,
  type Timeline,
  type WorldState,
} from "../shared/schema";
import type { CompileResult } from "../compiler/types";
import { compileEpisode } from "../compiler/episode";
import { compile } from "../compiler/compile";
import { EMPTY_CARRY } from "../compiler/audioCues";
import { initialWorldState, worldStateDigest } from "../compiler/worldState";
import { parseParagraph } from "../director/offline/parser";
import { directParagraph } from "../director/client";
import { FIXTURES } from "../director/fixtures/index";
import recordings from "../shared/recordedSpeech.json";
import { speechKey, type SpeechDurations, type SpeechRecording } from "../shared/speech";
import { DirectorQueue, MAX_PARALLEL } from "./store/directorQueue";
import { cloneParagraphs, HistoryStack } from "./store/history";
import {
  LS,
  appendLog,
  attachPagehideFlush,
  cacheGet,
  cachePut,
  clearLog,
  exportLog,
  flushPersistence,
  lsGet,
  lsSet,
  persistEpisode,
  restoreEpisode,
} from "./store/persistence";
import type { AppState, Listener, Paragraph, ParagraphStatus, ParagraphVersion, ToastMessage, ToastNotice } from "./store/types";

export { MAX_PARALLEL, exportLog, clearLog };
export type { AppState, Paragraph, ParagraphStatus, ParagraphVersion, ToastMessage, ToastNotice };

export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

let idCounter = 0;
export function newId(prefix = "p"): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Small stable string hash (FNV-1a, hex). */
export function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function directorCacheKey(text: string, lang: Lang, start: WorldState, model: string | null): string {
  return hashStr([normalizeText(text), lang, worldStateDigest(start), BIBLE_VERSION, model ?? "default"].join("§"));
}

/** What changes staging between paragraphs: every actor's posture and held item (not position or facing). */
export function materialDigest(ws: WorldState): string {
  return ACTOR_IDS.map((id) => `${id}:${ws.actors[id]?.posture ?? "-"}:${ws.actors[id]?.holding ?? "-"}`).join("|")+`|door:${ws.objects?.house_door??0}|cupboard:${ws.objects?.kitchen_cupboard??0}|pantry:${ws.props.pantry_honey?.at??'cupboard'}|carrots:${Object.entries(ws.props).filter(([id])=>id==='carrot'||id.startsWith('carrot_')).map(([id,p])=>`${id}:${p.at}:${!!p.planted}`).sort().join(',')}|poses:${Object.entries(ws.props).filter(([,p])=>p.position||p.rotation).map(([id,p])=>`${id}:${JSON.stringify(p.position??null)}:${JSON.stringify(p.rotation??null)}`).sort().join(',')}`;
}

function emptyTimeline(): Timeline {
  return { segments: [], duration: 0 };
}

function initialLang(): Lang {
  const saved = lsGet(LS.lang);
  if (saved === "en" || saved === "ru") return saved;
  return typeof navigator !== "undefined" && navigator.language?.startsWith("ru") ? "ru" : "en";
}

function hasPitchParam(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("pitch") === "1";
  } catch {
    return false;
  }
}

// ---------- the store ----------
class Store {
  state: AppState;
  private listeners = new Set<Listener>();
  private directorQueue = new DirectorQueue();
  private history = new HistoryStack();
  private episodeGeneration = 0;
  /** a ▶ Play session is running (set by playback): only then may a broken paragraph be re-directed */
  private runActive = false;
  private toastCounter = 0;
  /** recompile() calls so far (e2e: typing must not compile) */
  compileCount = 0;
  private speechDurations: Record<string, number> = Object.fromEntries(
    (recordings as SpeechRecording[]).map((r) => [speechKey(r.text, r.lang), r.duration]),
  );

  constructor() {
    attachPagehideFlush();
    const vol = Number(lsGet(LS.volume) ?? "0.8");
    const captions = lsGet(LS.captions) !== "0";
    this.state = {
      stageReady: false,
      previewScope: null,
      episodeId: newId("e"),
      title: "",
      lang: initialLang(),
      paragraphs: [],
      selectedId: null,
      timeline: emptyTimeline(),
      timelineRevision: 1,
      results: [],
      segmentIds: [],
      playing: false,
      t: 0,
      volume: Number.isFinite(vol) ? vol : 0.8,
      muted: false,
      captions,
      loop: false,
      canUndo: false,
      canRedo: false,
      saveError: false,
      toast: null,
      pitch: hasPitchParam(),
      model: null,
      directorCalls: 0,
      fixtureId: null,
      waiting: false,
    };
    this.restore();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = (): AppState => this.state;

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private setParagraphs(paragraphs: Paragraph[], extra: Partial<AppState> = {}, immediatePersist = true): void {
    this.set({ paragraphs, ...extra });
    this.persist(immediatePersist);
  }

  private patchParagraph(id: string, patch: Partial<Paragraph>, immediatePersist = true): void {
    this.setParagraphs(
      this.state.paragraphs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      {},
      immediatePersist,
    );
  }

  private syncHistoryFlags(): void {
    const canUndo = this.history.canUndo;
    const canRedo = this.history.canRedo;
    if (this.state.canUndo !== canUndo || this.state.canRedo !== canRedo) {
      this.set({ canUndo, canRedo });
    }
  }

  private pushHistory(coalesceKey?: string): void {
    if (this.history.push(this.state, coalesceKey)) {
      this.syncHistoryFlags();
    }
  }

  runHistoryBatch<T>(fn: () => T): T {
    if (!this.history.inBatch) this.pushHistory();
    this.history.enterBatch();
    try {
      return fn();
    } finally {
      this.history.exitBatch();
      if (!this.history.inBatch) this.persist(true);
    }
  }

  clearHistory(): void {
    this.history.clear();
    this.syncHistoryFlags();
  }

  undo(): boolean {
    const prev = this.history.undo(this.state);
    if (!prev) return false;
    this.directorQueue.clearAbortableQueues();
    const paragraphs = cloneParagraphs(prev.paragraphs);
    const selectedId =
      prev.selectedId && paragraphs.some((p) => p.id === prev.selectedId) ? prev.selectedId : (paragraphs[0]?.id ?? null);
    this.set({
      title: prev.title,
      paragraphs,
      selectedId,
      fixtureId: prev.fixtureId,
      waiting: false,
      playing: false,
      toast: null,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.recompile({ redirectBroken: "mark" });
    this.persist(true);
    return true;
  }

  redo(): boolean {
    const next = this.history.redo(this.state);
    if (!next) return false;
    this.directorQueue.clearAbortableQueues();
    const paragraphs = cloneParagraphs(next.paragraphs);
    const selectedId =
      next.selectedId && paragraphs.some((p) => p.id === next.selectedId) ? next.selectedId : (paragraphs[0]?.id ?? null);
    this.set({
      title: next.title,
      paragraphs,
      selectedId,
      fixtureId: next.fixtureId,
      waiting: false,
      playing: false,
      toast: null,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.recompile({ redirectBroken: "mark" });
    this.persist(true);
    return true;
  }

  private persist(immediate = true): void {
    persistEpisode(this.state, immediate, (ok) => {
      if (!ok && !this.state.saveError) this.set({ saveError: true });
      else if (ok && this.state.saveError) this.set({ saveError: false });
    });
  }

  flushPersistence(): void {
    flushPersistence();
  }

  private restore(): void {
    const saved = restoreEpisode();
    if (!saved) return;
    this.state = {
      ...this.state,
      episodeId: saved.episodeId,
      title: saved.title,
      fixtureId: saved.fixtureId,
      selectedId: saved.selectedId,
      paragraphs: saved.paragraphs,
    };
    this.recompile();
  }

  // ---------- UI actions ----------
  setLang(lang: Lang): void {
    lsSet(LS.lang, lang);
    const fid = this.state.fixtureId;
    const fixture = FIXTURES.find((f) => f.id === fid && f.lang === this.state.lang);
    // A language switch may translate a pristine example, but must never replace local edits,
    // cleared/deleted blocks, a new title, pending work, or remixes that have not made a new version.
    const untouched =
      fixture &&
      this.state.title === fixture.title &&
      this.state.paragraphs.length === fixture.paragraphs.length &&
      this.state.paragraphs.every((p, i) => {
        const v = p.versions[p.current];
        return (
          p.current === 0 &&
          v?.source === "fixture" &&
          p.pendingVersion === null &&
          normalizeText(p.text) === normalizeText(fixture.paragraphs[i].text) &&
          v.remix.cameraSeed === DEFAULT_REMIX.cameraSeed &&
          v.remix.timeOfDay === DEFAULT_REMIX.timeOfDay &&
          v.remix.musicMood === DEFAULT_REMIX.musicMood
        );
      });
    this.set({ lang });
    if (untouched && fid) this.loadFixtureById(fid, false);
  }
  setTitle(title: string): void {
    if (title === this.state.title) return;
    if (this.state.paragraphs.length) this.pushHistory("__title__");
    this.set({ title });
    this.persist(false);
  }
  setVolume(volume: number): void {
    lsSet(LS.volume, String(volume));
    this.set({ volume });
  }
  setMuted(muted: boolean): void {
    this.set({ muted });
  }
  setCaptions(captions: boolean): void {
    lsSet(LS.captions, captions ? "1" : "0");
    this.set({ captions });
  }
  setLoop(loop: boolean): void {
    this.set({ loop });
  }
  showToast(message: { en: string; ru: string }, undoable = false): void {
    this.toastCounter += 1;
    this.set({ toast: { id: this.toastCounter, message, undoable } });
  }
  clearToast(): void {
    if (this.state.toast) this.set({ toast: null });
  }
  dismissVoiceError(): void {
    if (this.state.voiceError) this.set({ voiceError: null });
  }
  setPitch(pitch: boolean): void {
    this.set({ pitch });
  }
  setModel(model: DirectorModel | null): void {
    this.set({ model });
  }
  setPreviewScope(previewScope: AppState["previewScope"]): void {
    this.set({ previewScope });
  }
  setStageReady(stageReady: boolean): void {
    if (this.state.stageReady !== stageReady) this.set({ stageReady });
  }
  select(id: string | null): void {
    this.set({ selectedId: id });
  }
  setPlayback(playing: boolean, t?: number): void {
    this.set(t === undefined ? { playing } : { playing, t });
  }
  setWaiting(waiting: boolean): void {
    if (this.state.waiting !== waiting) this.set({ waiting });
  }
  setVoiceStatus(preparingVoice: boolean, voiceError: string | null = null): void {
    this.set({ preparingVoice, voiceError });
  }
  setSpeechDurations(durations: SpeechDurations): boolean {
    const changed = Object.entries(durations).some(([key, dur]) => dur > 0 && this.speechDurations[key] !== dur);
    if (!changed) return false;
    Object.assign(this.speechDurations, durations);
    this.recompile();
    return true;
  }
  setTime(t: number): void {
    this.state = { ...this.state, t };
    for (const l of this.listeners) l();
  }

  newStory(recordHistory = true): void {
    const hasContent = Boolean(this.state.title.trim() || this.state.paragraphs.some((p) => p.text.trim() || p.current >= 0));
    if (recordHistory && hasContent) this.pushHistory();
    else if (!hasContent) this.history.clear();
    this.episodeGeneration += 1;
    this.directorQueue.clearAll();
    this.set({
      episodeId: newId("e"),
      title: "",
      paragraphs: [],
      selectedId: null,
      previewScope: null,
      timeline: emptyTimeline(),
      results: [],
      segmentIds: [],
      t: 0,
      playing: false,
      fixtureId: null,
      waiting: false,
      toast: null,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.persist(true);
  }

  addParagraph(afterId?: string): string {
    if (this.state.paragraphs.length > 0) this.pushHistory();
    const p: Paragraph = { id: newId(), text: "", versions: [], current: -1, status: "draft", error: null, pendingVersion: null, lastRemixMs: null };
    const list = [...this.state.paragraphs];
    const i = afterId ? list.findIndex((x) => x.id === afterId) : -1;
    if (i >= 0) list.splice(i + 1, 0, p);
    else list.push(p);
    this.setParagraphs(list, { selectedId: p.id }, true);
    return p.id;
  }

  duplicateParagraph(id: string): string | null {
    const idx = this.state.paragraphs.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    this.pushHistory();
    const orig = this.state.paragraphs[idx];
    const curRemix = orig.versions[orig.current]?.remix ?? orig.pendingRemix;
    const isCustomRemix =
      curRemix &&
      (curRemix.cameraSeed !== DEFAULT_REMIX.cameraSeed ||
        curRemix.timeOfDay !== DEFAULT_REMIX.timeOfDay ||
        curRemix.musicMood !== DEFAULT_REMIX.musicMood);
    const clone: Paragraph = {
      id: newId(),
      text: orig.text,
      versions: [],
      current: -1,
      status: "draft",
      error: null,
      pendingVersion: null,
      lastRemixMs: null,
      ...(isCustomRemix ? { pendingRemix: { ...curRemix } } : {}),
    };
    const list = [...this.state.paragraphs];
    list.splice(idx + 1, 0, clone);
    this.setParagraphs(list, { selectedId: clone.id }, true);
    this.recompile({ redirectBroken: "mark" });
    return clone.id;
  }

  deleteParagraph(id: string): void {
    this.pushHistory();
    this.directorQueue.remove(id);
    this.setParagraphs(this.state.paragraphs.filter((p) => p.id !== id), {}, true);
    this.recompile({ redirectBroken: "mark" });
  }

  moveParagraph(id: string, dir: -1 | 1): void {
    const list = [...this.state.paragraphs];
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    this.pushHistory();
    [list[i], list[j]] = [list[j], list[i]];
    this.setParagraphs(list, {}, true);
    this.recompile({ redirectBroken: "mark" });
  }

  revert(id: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.current <= 0 || p.pendingVersion !== null) return;
    this.pushHistory();
    const prev = p.versions[p.current - 1];
    this.patchParagraph(id, { current: p.current - 1, text: prev.text, status: prev.ruleHits.length ? "adjusted" : "ready", error: null }, true);
    this.recompile({ redirectBroken: "mark" });
  }

  discardDraft(id: string): boolean {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== null || p.status !== "draft" || p.current < 0) return false;
    const cur = p.versions[p.current];
    if (!cur) return false;
    this.pushHistory();
    this.patchParagraph(id, { text: cur.text, status: cur.ruleHits.length ? "adjusted" : "ready", error: null }, true);
    this.recompile({ redirectBroken: "mark" });
    return true;
  }

  editText(id: string, text: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.text === text) return;
    this.pushHistory(id);
    const cur = p.versions[p.current];
    const changed = !cur || normalizeText(cur.text) !== normalizeText(text);
    if (p.pendingVersion !== null) {
      this.patchParagraph(id, { text }, false);
      return;
    }
    this.patchParagraph(
      id,
      { text, status: changed ? "draft" : p.status === "draft" ? (cur?.ruleHits.length ? "adjusted" : "ready") : p.status },
      false,
    );
  }

  /** A paragraph needs the director before it can play: it has text and was edited (or never rendered). */
  isDirty(p: Paragraph): boolean {
    return p.pendingVersion === null && p.status === "draft" && normalizeText(p.text).length > 0;
  }

  /** Any director work in flight or queued (the player may be holding with "getting ready…"). */
  hasPending(): boolean {
    return this.directorQueue.hasQueuedRedirects() || this.state.paragraphs.some((p) => p.pendingVersion !== null);
  }

  isRedirectQueued(id: string): boolean {
    return this.directorQueue.isRedirectQueued(id);
  }

  /** playback marks its ▶ session; outside one, nothing is ever sent to the director */
  setRunActive(on: boolean): void {
    this.runActive = on;
  }

  /** Version number for a new render of `p`: the same number when the text didn't change (re-direct / retry). */
  private nextVersion(p: Paragraph, text: string): number {
    const cur = p.versions[p.current];
    if (cur && normalizeText(cur.text) === text) return cur.version;
    return (p.versions[p.versions.length - 1]?.version ?? 0) + 1;
  }

  /**
   * Render on ▶ Play only (no compiles or director calls while typing). Directs every dirty paragraph up to and
   * including `uptoIndex` (cache hits are free), up to MAX_PARALLEL calls in parallel. Start states for dirty
   * paragraphs that follow other dirty paragraphs are estimated from the offline parser's end state (internal, never
   * shown); a result that doesn't fit its real start state is repaired or re-directed by recompile().
   * Returns the number of paragraphs sent to the director (cache misses).
   */
  prepare(uptoIndex: number): number {
    const lang = this.state.lang;
    const paras = this.state.paragraphs;
    let state = initialWorldState();
    let carry = EMPTY_CARRY;
    let first = true;
    let sent = 0;
    const jobs: { id: string; text: string; start: WorldState; version: number; previous: string[] }[] = [];
    for (let i = 0; i <= Math.min(uptoIndex, paras.length - 1); i++) {
      const p = paras[i];
      const text = normalizeText(p.text).slice(0, MAX_PARAGRAPH_CHARS);
      let bs: BeatScript | null = null;
      let remix: Remix = p.versions[p.current]?.remix ?? p.pendingRemix ?? { ...DEFAULT_REMIX };
      if (this.isDirty(p)) {
        const version = this.nextVersion(p, text);
        const previous = paras
          .slice(Math.max(0, i - 3), i)
          .map((x) => normalizeText(x.text))
          .filter(Boolean);
        jobs.push({ id: p.id, text, start: state, version, previous });
        try {
          bs = parseParagraph(text, lang, state, { prevMusicMood: carry.music?.mood ?? null });
        } catch {
          bs = null;
        }
      } else if (p.pendingVersion === null && p.current >= 0 && p.versions[p.current]) {
        bs = p.versions[p.current].beatScript;
        remix = p.versions[p.current].remix;
      }
      if (!bs) continue;
      try {
        const r = compile(bs, state, { paragraphId: p.id, version: 0, lang, remix, isFirst: first, carry });
        state = r.segment.endState;
        carry = r.carry;
        first = false;
      } catch {
        /* keep the previous estimate */
      }
    }
    if (!jobs.length) {
      this.recompile(); // e.g. a cleared paragraph leaves the timeline
      return 0;
    }
    const pending = new Map(jobs.map((j) => [j.id, j.version]));
    this.setParagraphs(
      this.state.paragraphs.map((p) => (pending.has(p.id) ? { ...p, status: "directing", error: null, pendingVersion: pending.get(p.id)! } : p)),
      {},
      true,
    );
    this.recompile();
    for (const j of jobs) if (this.direct(j.id, j.text, lang, j.start, j.version, j.previous)) sent += 1;
    return sent;
  }

  /** One director call for a pending paragraph version. Returns false on a cache hit (applied synchronously, $0). */
  private direct(id: string, text: string, lang: Lang, start: WorldState, version: number, previous: string[]): boolean {
    const key = directorCacheKey(text, lang, start, this.state.model);
    const hit = cacheGet(key);
    if (hit) {
      this.applyDirectorResponse(id, version, text, lang, hit, start, 0, true);
      return false;
    }
    const gen = this.episodeGeneration;
    const ctrl = this.directorQueue.startInflight(id);
    const run = (token: symbol) => {
      if (ctrl.signal.aborted || this.episodeGeneration !== gen) {
        this.directorQueue.finishJob(id, ctrl, token);
        return;
      }
      this.set({ directorCalls: this.state.directorCalls + 1 });
      const t0 = performance.now();
      directParagraph(
        {
          lang,
          paragraph: text,
          previous,
          worldState: start,
          episodeId: this.state.episodeId,
          paragraphId: id,
          ...(this.state.model ? { model: this.state.model } : {}),
        },
        ctrl.signal,
      )
        .then((res) => {
          if (ctrl.signal.aborted || this.episodeGeneration !== gen) return;
          if (!res.error) cachePut(key, res);
          this.applyDirectorResponse(id, version, text, lang, res, start, performance.now() - t0);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted || this.episodeGeneration !== gen) return;
          // network failure: fall back to the offline parser so the paragraph still plays (status error + Retry)
          let beatScript: BeatScript | null = null;
          try {
            beatScript = parseParagraph(text, lang, start);
          } catch {
            beatScript = null;
          }
          const msg = err instanceof Error ? err.message : String(err);
          if (beatScript) {
            this.applyDirectorResponse(
              id,
              version,
              text,
              lang,
              { beatScript, source: "offline", latencyMs: 0, usage: null, model: "offline-parser", error: msg },
              start,
              performance.now() - t0,
            );
          } else {
            this.markError(id, version, msg);
          }
        })
        .finally(() => {
          this.directorQueue.finishJob(id, ctrl, token);
        });
    };
    this.directorQueue.enqueue(id, run);
    return true;
  }

  private markError(id: string, version: number, error: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== version) return;
    this.patchParagraph(id, { status: p.current >= 0 ? "error" : "draft", error, pendingVersion: null }, true);
    this.recompile({ redirectBroken: "direct" });
  }

  private applyDirectorResponse(
    id: string,
    version: number,
    text: string,
    lang: Lang,
    res: DirectResponse,
    start: WorldState,
    clientMs: number,
    cached = false,
  ): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== version) return;
    const nv: ParagraphVersion = {
      version,
      text,
      lang,
      beatScript: res.beatScript,
      source: res.source,
      latencyMs: res.latencyMs || Math.round(clientMs),
      usage: res.usage,
      model: res.model,
      ruleHits: res.beatScript.rule_hits,
      remix: p.pendingRemix ?? p.versions[p.current]?.remix ?? { ...DEFAULT_REMIX },
      cached,
      startKey: materialDigest(start),
    };
    // same version number = a re-direct / retry of unchanged text: replace it (the counter only moves on real edits)
    const versions = [...p.versions];
    const same = versions.findIndex((v) => v.version === version);
    if (same >= 0) versions[same] = nv;
    else versions.push(nv);
    const nvIndex = same >= 0 ? same : versions.length - 1;
    // edited again (or reverted) while the director was working → keep it as a version, but it doesn't become
    // current; the paragraph waits for the next ▶ Play
    const stale = normalizeText(p.text) !== text;
    const status: ParagraphStatus = stale ? "draft" : res.error ? "error" : nv.ruleHits.length ? "adjusted" : "ready";
    this.patchParagraph(
      id,
      { versions, current: stale ? p.current : nvIndex, status, error: res.error ?? null, pendingVersion: null, pendingRemix: undefined },
      true,
    );
    appendLog({
      episodeId: this.state.episodeId,
      paragraphId: id,
      version,
      text: nv.text,
      lang: nv.lang,
      beatScript: nv.beatScript,
      source: nv.source,
      latencyMs: nv.latencyMs,
      usage: nv.usage,
      ruleHits: nv.ruleHits,
      ts: Date.now(),
    });
    // directed against `start`: re-directing against the same start state can't help (§6.5.4)
    this.directorQueue.markRedirected(`${id}:${directorCacheKey(nv.text, nv.lang, start, this.state.model)}`);
    this.recompile({ redirectBroken: "direct" });
  }

  /** Retry a paragraph whose director call failed: mark it dirty; the caller plays it (which directs it). */
  retry(id: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== null) return;
    this.patchParagraph(id, { status: "draft", error: null }, true);
  }

  setRemix(id: string, patch: Partial<Remix>): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.current < 0) return;
    this.pushHistory();
    const t0 = performance.now();
    const versions = [...p.versions];
    versions[p.current] = { ...versions[p.current], remix: { ...versions[p.current].remix, ...patch } };
    this.state = { ...this.state, paragraphs: this.state.paragraphs.map((x) => (x.id === id ? { ...x, versions } : x)) };
    this.recompile();
    const ms = Math.max(1, Math.round(performance.now() - t0));
    this.patchParagraph(id, { lastRemixMs: ms }, true);
  }

  loadFixture(fx: FixtureEpisode, recordHistory = true): void {
    const hasContent = Boolean(this.state.title.trim() || this.state.paragraphs.some((p) => p.text.trim() || p.current >= 0));
    if (recordHistory && hasContent) this.pushHistory();
    this.episodeGeneration += 1;
    this.directorQueue.clearAll();
    const paragraphs: Paragraph[] = fx.paragraphs.map((fp) => {
      const v: ParagraphVersion = {
        version: 1,
        text: fp.text,
        lang: fx.lang,
        beatScript: fp.beatScript,
        source: "fixture",
        latencyMs: 0,
        usage: null,
        model: "fixture",
        ruleHits: fp.beatScript.rule_hits,
        remix: { ...DEFAULT_REMIX },
      };
      return {
        id: newId(),
        text: fp.text,
        versions: [v],
        current: 0,
        status: fp.beatScript.rule_hits.length ? "adjusted" : "ready",
        error: null,
        pendingVersion: null,
        lastRemixMs: null,
      };
    });
    this.set({
      episodeId: newId("e"),
      title: fx.title,
      paragraphs,
      selectedId: paragraphs[0]?.id ?? null,
      previewScope: null,
      t: 0,
      playing: false,
      fixtureId: fx.id,
      waiting: false,
      toast: null,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.recompile();
    this.persist(true);
  }

  /** true when the story has user authoring/customization beyond a blank draft or untouched example */
  hasOwnWriting(): boolean {
    const fid = this.state.fixtureId;
    if (fid) {
      const fx = FIXTURES.find((f) => f.id === fid && f.lang === this.state.lang) ?? FIXTURES.find((f) => f.id === fid);
      if (fx) {
        if (this.state.title !== fx.title || this.state.paragraphs.length !== fx.paragraphs.length) return true;
        return this.state.paragraphs.some((p, i) => {
          const v = p.versions[p.current];
          const orig = fx.paragraphs[i];
          return (
            !v ||
            v.source !== "fixture" ||
            normalizeText(p.text) !== normalizeText(orig.text) ||
            v.remix.cameraSeed !== DEFAULT_REMIX.cameraSeed ||
            v.remix.timeOfDay !== DEFAULT_REMIX.timeOfDay ||
            v.remix.musicMood !== DEFAULT_REMIX.musicMood
          );
        });
      }
    }
    return (
      this.state.title.trim().length > 0 ||
      this.state.paragraphs.some(
        (p) => p.text.trim() && (p.versions[p.current]?.source !== "fixture" || normalizeText(p.text) !== normalizeText(p.versions[p.current]?.text ?? "")),
      )
    );
  }

  loadFixtureById(id: FixtureEpisode["id"], recordHistory = true): void {
    const fx = FIXTURES.find((f) => f.id === id && f.lang === this.state.lang) ?? FIXTURES.find((f) => f.id === id);
    if (fx) this.loadFixture(fx, recordHistory);
  }

  // ---------- compile ----------
  startStateFor(index: number): WorldState {
    if (index <= 0) return initialWorldState();
    const ids = this.state.segmentIds;
    const prevPlayable = this.state.paragraphs
      .slice(0, index)
      .filter((p) => p.current >= 0)
      .map((p) => p.id);
    const lastId = prevPlayable[prevPlayable.length - 1];
    if (!lastId) return initialWorldState();
    const si = ids.indexOf(lastId);
    return si >= 0 ? this.state.results[si].segment.endState : initialWorldState();
  }

  /**
   * Compiler-only recompile (no LLM). Plays the prefix of rendered paragraphs up to the first one the director is
   * still working on. Downstream paragraphs whose start state changed recompile here; one that no longer fits its new
   * start state is re-directed during a ▶ Play run (`redirectBroken: "direct"`) or just marked ✏️ for the next Play
   * (`"mark"`, e.g. after delete/move/revert) — never while the player is typing.
   */
  recompile(opts: { redirectBroken?: "direct" | "mark" } = {}): void {
    this.compileCount += 1;
    const playable: Paragraph[] = [];
    for (const p of this.state.paragraphs) {
      if (p.pendingVersion !== null || this.directorQueue.isRedirectQueued(p.id)) break;
      if (!normalizeText(p.text)) continue; // a cleared block never plays its old scene
      if (p.current >= 0 && p.versions[p.current]) playable.push(p);
    }
    let results: CompileResult[] = [];
    let timeline: Timeline = emptyTimeline();
    try {
      const out = compileEpisode(
        playable.map((p) => {
          const v = p.versions[p.current];
          return { paragraphId: p.id, version: v.version, beatScript: v.beatScript, remix: v.remix };
        }),
        this.state.lang,
        undefined,
        this.speechDurations,
      );
      results = out.results;
      timeline = out.timeline;
    } catch (err) {
      console.warn("compile failed", err);
    }
    const segmentIds = playable.map((p) => p.id);
    this.set({
      results,
      timeline,
      segmentIds,
      t: Math.min(this.state.t, timeline.duration),
      timelineRevision: this.state.timelineRevision + 1,
    });
    if (!opts.redirectBroken) return;
    // outside a ▶ session nothing goes to the director: only mark ✏️ for the next Play
    const mode = opts.redirectBroken === "direct" && this.runActive ? "direct" : "mark";
    const gen = this.episodeGeneration;
    let queued = false;
    results.forEach((r, i) => {
      const p = playable[i];
      const v = p.versions[p.current];
      const start = i === 0 ? initialWorldState() : results[i - 1].segment.endState;
      const key = `${p.id}:${directorCacheKey(v.text, v.lang, start, this.state.model)}`;
      // §6.5.4 + review #7: not repairable against the real start state, or directed against an estimated start
      // whose postures / held items differ from the real one → draft (+ one re-direct per real start inside a run)
      const drifted = v.startKey !== undefined && v.startKey !== materialDigest(start);
      if ((!r.errors.length && !drifted) || p.status === "draft" || this.directorQueue.hasRedirected(key)) return;
      if (queued) return; // later paragraphs are re-checked once this one is re-directed
      this.patchParagraph(p.id, { status: "draft" }, true);
      if (mode === "mark") return;
      this.directorQueue.markRedirected(key);
      this.directorQueue.queueRedirect(p.id);
      queued = true;
      queueMicrotask(() => {
        if (this.episodeGeneration !== gen) return;
        this.directorQueue.dequeueRedirect(p.id);
        this.directOne(p.id);
      });
    });
    if (queued) this.recompile(); // the timeline stops before the paragraph going back to the director
  }

  /** Re-direct one paragraph against its real start state (inside a ▶ run; nothing else is sent). */
  private directOne(id: string): void {
    const idx = this.state.paragraphs.findIndex((x) => x.id === id);
    const p = this.state.paragraphs[idx];
    if (!p || p.pendingVersion !== null || !this.runActive) {
      this.recompile();
      return;
    }
    const text = normalizeText(p.text).slice(0, MAX_PARAGRAPH_CHARS);
    if (!text) {
      this.recompile();
      return;
    }
    const lang = this.state.lang;
    const start = this.startStateFor(idx);
    const version = this.nextVersion(p, text);
    const previous = this.state.paragraphs
      .slice(Math.max(0, idx - 3), idx)
      .map((x) => normalizeText(x.text))
      .filter(Boolean);
    this.patchParagraph(id, { status: "directing", error: null, pendingVersion: version }, true);
    this.recompile();
    this.direct(id, text, lang, start, version, previous);
  }

  /** Episode time range of a paragraph's segment. */
  segmentRange(id: string): { start: number; end: number } | null {
    const i = this.state.segmentIds.indexOf(id);
    if (i < 0) return null;
    const s = this.state.timeline.segments[i];
    return { start: s.offset, end: s.offset + s.segment.duration };
  }
}

export const store = new Store();
export type { Store };
