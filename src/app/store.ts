// App store + paragraph pipeline (spec §4.2, §6.5). No React imports here; components subscribe via useStore().
import { BIBLE_VERSION } from "../shared/bible/characters";
import {
  DEFAULT_REMIX,
  type BeatScript,
  type BeatScriptSource,
  type DirectorModel,
  type DirectResponse,
  type FixtureEpisode,
  type Lang,
  type LogEntry,
  type MusicMood,
  type Remix,
  type RuleHit,
  type Timeline,
  type Usage,
  type WorldState,
} from "../shared/schema";
import type { CompileResult } from "../compiler/types";
import { compileEpisode } from "../compiler/episode";
import { initialWorldState, worldStateDigest } from "../compiler/worldState";
import { parseParagraph } from "../director/offline/parser";
import { directParagraph } from "../director/client";
import { FIXTURES } from "../director/fixtures/index";

export type ParagraphStatus = "draft" | "directing" | "ready" | "adjusted" | "error";

export interface ParagraphVersion {
  version: number;
  text: string;
  lang: Lang;
  beatScript: BeatScript;
  source: BeatScriptSource;
  latencyMs: number;
  usage: Usage | null;
  model: string;
  ruleHits: RuleHit[];
  remix: Remix;
  /** served from the director cache: no API call, $0 */
  cached?: boolean;
}

export interface Paragraph {
  id: string;
  text: string;
  versions: ParagraphVersion[];
  /** index into versions of the version that plays (-1 = none yet) */
  current: number;
  status: ParagraphStatus;
  error: string | null;
  /** set while a director call for the latest version is in flight */
  pendingVersion: number | null;
  lastRemixMs: number | null;
}

export interface AppState {
  episodeId: string;
  title: string;
  lang: Lang;
  paragraphs: Paragraph[];
  selectedId: string | null;
  timeline: Timeline;
  results: CompileResult[];
  /** paragraph ids aligned with timeline.segments */
  segmentIds: string[];
  playing: boolean;
  t: number;
  volume: number;
  muted: boolean;
  pitch: boolean;
  model: DirectorModel | null;
  directorCalls: number;
  /** example currently loaded (unchanged), so the EN/RU toggle can swap it without an AI call */
  fixtureId: FixtureEpisode["id"] | null;
}

type Listener = () => void;

const LS = {
  lang: "mabear.lang",
  log: "mabear.log",
  cache: "mabear.cache",
  episode: "mabear.episode",
  volume: "mabear.volume",
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* quota or disabled */
  }
}

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

// ---------- director cache (localStorage LRU, 200 entries) ----------
const CACHE_MAX = 200;
function cacheLoad(): { k: string; v: DirectResponse }[] {
  try {
    return JSON.parse(lsGet(LS.cache) ?? "[]") as { k: string; v: DirectResponse }[];
  } catch {
    return [];
  }
}
function cacheGet(k: string): DirectResponse | null {
  const all = cacheLoad();
  const i = all.findIndex((e) => e.k === k);
  if (i < 0) return null;
  const [hit] = all.splice(i, 1);
  all.push(hit);
  lsSet(LS.cache, JSON.stringify(all));
  return hit.v;
}
function cachePut(k: string, v: DirectResponse): void {
  const all = cacheLoad().filter((e) => e.k !== k);
  all.push({ k, v });
  while (all.length > CACHE_MAX) all.shift();
  lsSet(LS.cache, JSON.stringify(all));
}

function appendLog(e: LogEntry): void {
  try {
    const all = JSON.parse(lsGet(LS.log) ?? "[]") as LogEntry[];
    all.push(e);
    while (all.length > 500) all.shift();
    lsSet(LS.log, JSON.stringify(all));
  } catch {
    lsSet(LS.log, JSON.stringify([e]));
  }
}
export function exportLog(): string {
  return lsGet(LS.log) ?? "[]";
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
  private inflight = new Map<string, AbortController>();
  private queue: (() => void)[] = [];
  private redirected = new Set<string>();
  private active = 0;

  constructor() {
    const vol = Number(lsGet(LS.volume) ?? "0.8");
    this.state = {
      episodeId: newId("e"),
      title: "",
      lang: initialLang(),
      paragraphs: [],
      selectedId: null,
      timeline: emptyTimeline(),
      results: [],
      segmentIds: [],
      playing: false,
      t: 0,
      volume: Number.isFinite(vol) ? vol : 0.8,
      muted: false,
      pitch: hasPitchParam(),
      model: null,
      directorCalls: 0,
      fixtureId: null,
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

  private setParagraphs(paragraphs: Paragraph[], extra: Partial<AppState> = {}): void {
    this.set({ paragraphs, ...extra });
    this.persist();
  }

  private patchParagraph(id: string, patch: Partial<Paragraph>): void {
    this.setParagraphs(this.state.paragraphs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  private persist(): void {
    const s = this.state;
    lsSet(LS.episode, JSON.stringify({ episodeId: s.episodeId, title: s.title, paragraphs: s.paragraphs.map((p) => ({ ...p, pendingVersion: null, status: p.status === "directing" ? (p.current >= 0 ? "ready" : "draft") : p.status })) }));
  }

  private restore(): void {
    try {
      const raw = lsGet(LS.episode);
      if (!raw) return;
      const saved = JSON.parse(raw) as { episodeId: string; title: string; paragraphs: Paragraph[] };
      if (!Array.isArray(saved.paragraphs)) return;
      this.state = { ...this.state, episodeId: saved.episodeId, title: saved.title ?? "", paragraphs: saved.paragraphs };
      this.recompile();
    } catch {
      /* ignore corrupt state */
    }
  }

  // ---------- UI actions ----------
  setLang(lang: Lang): void {
    lsSet(LS.lang, lang);
    const fid = this.state.fixtureId;
    const untouched = fid && this.state.paragraphs.length > 0 && this.state.paragraphs.every((p) => p.versions[p.current]?.source === "fixture" && p.current === 0);
    this.set({ lang });
    if (untouched && fid) this.loadFixtureById(fid);
  }
  setTitle(title: string): void {
    this.set({ title });
    this.persist();
  }
  setVolume(volume: number): void {
    lsSet(LS.volume, String(volume));
    this.set({ volume });
  }
  setMuted(muted: boolean): void {
    this.set({ muted });
  }
  setPitch(pitch: boolean): void {
    this.set({ pitch });
  }
  setModel(model: DirectorModel | null): void {
    this.set({ model });
  }
  select(id: string | null): void {
    this.set({ selectedId: id });
  }
  setPlayback(playing: boolean, t?: number): void {
    this.set(t === undefined ? { playing } : { playing, t });
  }
  setTime(t: number): void {
    this.state = { ...this.state, t };
    for (const l of this.listeners) l();
  }

  newStory(): void {
    for (const c of this.inflight.values()) c.abort();
    this.inflight.clear();
    this.set({ episodeId: newId("e"), title: "", paragraphs: [], selectedId: null, timeline: emptyTimeline(), results: [], segmentIds: [], t: 0, playing: false, fixtureId: null });
    this.persist();
  }

  addParagraph(afterId?: string): string {
    const p: Paragraph = { id: newId(), text: "", versions: [], current: -1, status: "draft", error: null, pendingVersion: null, lastRemixMs: null };
    const list = [...this.state.paragraphs];
    const i = afterId ? list.findIndex((x) => x.id === afterId) : -1;
    if (i >= 0) list.splice(i + 1, 0, p);
    else list.push(p);
    this.setParagraphs(list, { selectedId: p.id });
    return p.id;
  }

  deleteParagraph(id: string): void {
    this.inflight.get(id)?.abort();
    this.setParagraphs(this.state.paragraphs.filter((p) => p.id !== id));
    this.recompile({ redirectBroken: true });
  }

  moveParagraph(id: string, dir: -1 | 1): void {
    const list = [...this.state.paragraphs];
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.setParagraphs(list);
    this.recompile({ redirectBroken: true });
  }

  revert(id: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.current <= 0) return;
    const prev = p.versions[p.current - 1];
    this.patchParagraph(id, { current: p.current - 1, text: prev.text, status: prev.ruleHits.length ? "adjusted" : "ready", error: null });
    this.recompile({ redirectBroken: true });
  }

  editText(id: string, text: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p) return;
    const cur = p.versions[p.current];
    const changed = !cur || normalizeText(cur.text) !== normalizeText(text);
    this.patchParagraph(id, { text, status: changed ? "draft" : p.status === "draft" ? (cur?.ruleHits.length ? "adjusted" : "ready") : p.status });
  }

  /** Render trigger (debounce / blur / Ctrl+Enter). Creates a version only when the text actually changed. */
  submit(id: string, force = false): void {
    const idx = this.state.paragraphs.findIndex((x) => x.id === id);
    const p = this.state.paragraphs[idx];
    if (!p) return;
    const text = normalizeText(p.text);
    if (!text) return;
    const cur = p.versions[p.current];
    if (!force && cur && normalizeText(cur.text) === text) return;

    const lang = this.state.lang;
    const start = this.startStateFor(idx);
    const version = (p.versions[p.versions.length - 1]?.version ?? 0) + 1;
    const remix = cur?.remix ?? { ...DEFAULT_REMIX };

    // (a) instant offline preview
    let preview: BeatScript;
    try {
      preview = parseParagraph(text, lang, start, { prevMusicMood: this.prevMusicFor(idx) });
    } catch {
      return;
    }
    const pv: ParagraphVersion = { version, text, lang, beatScript: preview, source: "offline", latencyMs: 0, usage: null, model: "offline-parser", ruleHits: preview.rule_hits, remix };
    const versions = [...p.versions, pv];
    this.patchParagraph(id, { versions, current: versions.length - 1, status: "directing", error: null, pendingVersion: version });
    this.recompile({ redirectBroken: true });

    // (b) director (cache first)
    const key = directorCacheKey(text, lang, start, this.state.model);
    const hit = cacheGet(key);
    if (hit) {
      this.applyDirectorResponse(id, version, hit, start, 0, true);
      return;
    }
    this.inflight.get(id)?.abort();
    const ctrl = new AbortController();
    this.inflight.set(id, ctrl);
    const previous = this.state.paragraphs
      .slice(Math.max(0, idx - 3), idx)
      .map((x) => normalizeText(x.text))
      .filter(Boolean);
    const run = () => {
      if (ctrl.signal.aborted) {
        this.next();
        return;
      }
      this.active += 1;
      this.set({ directorCalls: this.state.directorCalls + 1 });
      const t0 = performance.now();
      directParagraph(
        { lang, paragraph: text, previous, worldState: start, episodeId: this.state.episodeId, paragraphId: id, ...(this.state.model ? { model: this.state.model } : {}) },
        ctrl.signal,
      )
        .then((res) => {
          if (ctrl.signal.aborted) return;
          if (!res.error) cachePut(key, res);
          this.applyDirectorResponse(id, version, res, start, performance.now() - t0);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          this.markError(id, version, err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (this.inflight.get(id) === ctrl) this.inflight.delete(id);
          this.active -= 1;
          this.next();
        });
    };
    this.queue.push(run);
    this.next();
  }

  private next(): void {
    while (this.active < 2 && this.queue.length) this.queue.shift()?.();
  }

  private markError(id: string, version: number, error: string): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== version) return;
    this.patchParagraph(id, { status: "error", error, pendingVersion: null });
  }

  private applyDirectorResponse(id: string, version: number, res: DirectResponse, start: WorldState, clientMs: number, cached = false): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.pendingVersion !== version) return;
    const vi = p.versions.findIndex((v) => v.version === version);
    if (vi < 0) return;
    const old = p.versions[vi];
    const nv: ParagraphVersion = {
      ...old,
      beatScript: res.beatScript,
      source: res.source,
      latencyMs: res.latencyMs || Math.round(clientMs),
      usage: res.usage,
      model: res.model,
      ruleHits: res.beatScript.rule_hits,
      cached,
    };
    const versions = [...p.versions];
    versions[vi] = nv;
    const status: ParagraphStatus = res.error ? "error" : nv.ruleHits.length ? "adjusted" : "ready";
    this.patchParagraph(id, { versions, status, error: res.error ?? null, pendingVersion: null });
    appendLog({ episodeId: this.state.episodeId, paragraphId: id, version, text: nv.text, lang: nv.lang, beatScript: nv.beatScript, source: nv.source, latencyMs: nv.latencyMs, usage: nv.usage, ruleHits: nv.ruleHits, ts: Date.now() });
    // directed against `start`: re-directing against the same start state can't help (§6.5.4)
    this.redirected.add(`${id}:${directorCacheKey(nv.text, nv.lang, start, this.state.model)}`);
    this.recompile({ redirectBroken: true });
  }

  retry(id: string): void {
    this.submit(id, true);
  }

  setRemix(id: string, patch: Partial<Remix>): void {
    const p = this.state.paragraphs.find((x) => x.id === id);
    if (!p || p.current < 0) return;
    const t0 = performance.now();
    const versions = [...p.versions];
    versions[p.current] = { ...versions[p.current], remix: { ...versions[p.current].remix, ...patch } };
    this.state = { ...this.state, paragraphs: this.state.paragraphs.map((x) => (x.id === id ? { ...x, versions } : x)) };
    this.recompile();
    const ms = Math.max(1, Math.round(performance.now() - t0));
    this.patchParagraph(id, { lastRemixMs: ms });
  }

  loadFixture(fx: FixtureEpisode): void {
    for (const c of this.inflight.values()) c.abort();
    this.inflight.clear();
    const paragraphs: Paragraph[] = fx.paragraphs.map((fp) => {
      const v: ParagraphVersion = { version: 1, text: fp.text, lang: fx.lang, beatScript: fp.beatScript, source: "fixture", latencyMs: 0, usage: null, model: "fixture", ruleHits: fp.beatScript.rule_hits, remix: { ...DEFAULT_REMIX } };
      return { id: newId(), text: fp.text, versions: [v], current: 0, status: fp.beatScript.rule_hits.length ? "adjusted" : "ready", error: null, pendingVersion: null, lastRemixMs: null };
    });
    this.set({ episodeId: newId("e"), title: fx.title, paragraphs, selectedId: paragraphs[0]?.id ?? null, t: 0, playing: false, fixtureId: fx.id });
    this.recompile();
    this.persist();
  }

  loadFixtureById(id: FixtureEpisode["id"]): void {
    const fx = FIXTURES.find((f) => f.id === id && f.lang === this.state.lang) ?? FIXTURES.find((f) => f.id === id);
    if (fx) this.loadFixture(fx);
  }

  // ---------- compile ----------
  /** Resolved music mood at the end of the paragraph before `index` (offline parser "continue" hint). */
  private prevMusicFor(index: number): MusicMood | null {
    const prev = this.state.paragraphs
      .slice(0, index)
      .filter((p) => p.current >= 0)
      .map((p) => p.id);
    const lastId = prev[prev.length - 1];
    const si = lastId ? this.state.segmentIds.indexOf(lastId) : -1;
    return si >= 0 ? this.state.results[si].carry.music?.mood ?? null : null;
  }

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

  /** Compiler-only recompile of the whole episode (no LLM). Downstream paragraphs whose start state changed recompile here. */
  recompile(opts: { redirectBroken?: boolean } = {}): void {
    const playable = this.state.paragraphs.filter((p) => p.current >= 0 && p.versions[p.current]);
    let results: CompileResult[] = [];
    let timeline: Timeline = emptyTimeline();
    try {
      const out = compileEpisode(
        playable.map((p) => {
          const v = p.versions[p.current];
          return { paragraphId: p.id, version: v.version, beatScript: v.beatScript, remix: v.remix };
        }),
        this.state.lang,
      );
      results = out.results;
      timeline = out.timeline;
    } catch (err) {
      console.warn("compile failed", err);
    }
    const segmentIds = playable.map((p) => p.id);
    this.set({ results, timeline, segmentIds, t: Math.min(this.state.t, timeline.duration) });
    if (opts.redirectBroken) {
      results.forEach((r, i) => {
        const p = playable[i];
        const v = p.versions[p.current];
        const start = i === 0 ? initialWorldState() : results[i - 1].segment.endState;
        const key = `${p.id}:${directorCacheKey(v.text, v.lang, start, this.state.model)}`;
        if (r.errors.length && p.pendingVersion === null && p.status !== "draft" && !this.redirected.has(key)) {
          this.redirected.add(key);
          // §6.5.4: not trivially repairable against the new start state → draft + re-direct
          this.patchParagraph(p.id, { status: "draft" });
          queueMicrotask(() => this.submit(p.id, true));
        }
      });
    }
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
