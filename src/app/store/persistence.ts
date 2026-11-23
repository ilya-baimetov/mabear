import {
  FIXTURE_IDS,
  type DirectResponse,
  type FixtureId,
  type LogEntry,
} from "../../shared/schema";
import type {
  AppState,
  CacheEntry,
  Paragraph,
  ParagraphStatus,
  ParagraphVersion,
  PersistedEpisode,
} from "./types";

export const LS = {
  lang: "mabear.lang",
  log: "mabear.log",
  cache: "mabear.cache",
  episode: "mabear.episode",
  volume: "mabear.volume",
  captions: "mabear.captions",
} as const;

const CACHE_MAX = 200;
const LOG_MAX = 500;
const DEBOUNCE_MS = 300;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, v: string): boolean {
  try {
    localStorage.setItem(key, v);
    return true;
  } catch {
    /* quota or disabled */
    return false;
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* disabled */
  }
}

function isImmediatePersistence(): boolean {
  return (
    typeof window === "undefined" ||
    (typeof import.meta !== "undefined" && (import.meta as { env?: { MODE?: string } }).env?.MODE === "test")
  );
}

function isCacheEntry(x: unknown): x is CacheEntry {
  if (!x || typeof x !== "object") return false;
  const entry = x as Record<string, unknown>;
  return typeof entry.k === "string" && Boolean(entry.v && typeof entry.v === "object");
}

function isLogEntry(x: unknown): x is LogEntry {
  if (!x || typeof x !== "object") return false;
  const entry = x as Record<string, unknown>;
  return (
    typeof entry.episodeId === "string" &&
    typeof entry.paragraphId === "string" &&
    Boolean(entry.beatScript && typeof entry.beatScript === "object")
  );
}

function isValidVersion(v: unknown): v is ParagraphVersion {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.version === "number" &&
    typeof x.text === "string" &&
    (x.lang === "en" || x.lang === "ru") &&
    Boolean(x.beatScript && typeof x.beatScript === "object") &&
    Boolean(x.remix && typeof x.remix === "object")
  );
}

function isValidParagraph(p: unknown): p is Paragraph {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.text === "string" &&
    Array.isArray(x.versions) &&
    x.versions.every(isValidVersion) &&
    (x.pendingRemix === undefined || Boolean(x.pendingRemix && typeof x.pendingRemix === "object"))
  );
}

function normalizeParagraph(p: Paragraph): Paragraph {
  const status: ParagraphStatus =
    p.status === "ready" || p.status === "adjusted" || p.status === "error" || p.status === "draft"
      ? p.status
      : "draft";
  const current =
    typeof p.current === "number" && Number.isInteger(p.current) && p.current >= -1 && p.current < p.versions.length
      ? p.current
      : -1;
  return {
    ...p,
    current,
    status,
    error: typeof p.error === "string" ? p.error : null,
    pendingVersion: null,
    lastRemixMs: typeof p.lastRemixMs === "number" ? p.lastRemixMs : null,
  };
}

// ---------- in-memory mirrors & debounced flush ----------
let cacheMirror: CacheEntry[] | null = null;
let cacheRawSeen: string | null = null;
let cacheDirty = false;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

let logMirror: LogEntry[] | null = null;
let logRawSeen: string | null = null;
let logDirty = false;
let logTimer: ReturnType<typeof setTimeout> | null = null;

let episodePending: string | null = null;
let episodeStatusCb: ((ok: boolean) => void) | null = null;
let episodeTimer: ReturnType<typeof setTimeout> | null = null;

/** Parse and validate `mabear.cache` safely. Never throws on corrupted or non-array JSON. */
export function cacheLoad(): CacheEntry[] {
  try {
    const raw = lsGet(LS.cache);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCacheEntry);
  } catch {
    return [];
  }
}

function ensureCache(): CacheEntry[] {
  if (!hasLocalStorage()) {
    cacheMirror = [];
    cacheRawSeen = null;
    cacheDirty = false;
    return cacheMirror;
  }
  const raw = lsGet(LS.cache);
  if (cacheMirror === null || (isImmediatePersistence() && !cacheDirty && raw !== cacheRawSeen)) {
    cacheMirror = cacheLoad();
    cacheRawSeen = raw;
  }
  return cacheMirror;
}

function flushCache(): void {
  if (cacheTimer !== null) {
    clearTimeout(cacheTimer);
    cacheTimer = null;
  }
  if (!cacheDirty || cacheMirror === null) return;
  cacheDirty = false;
  if (!hasLocalStorage()) return;
  const serialized = JSON.stringify(cacheMirror);
  if (lsSet(LS.cache, serialized)) {
    cacheRawSeen = serialized;
  }
}

function scheduleCacheFlush(): void {
  cacheDirty = true;
  if (isImmediatePersistence()) {
    flushCache();
    return;
  }
  if (cacheTimer !== null) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(flushCache, DEBOUNCE_MS);
}

export function cacheGet(k: string): DirectResponse | null {
  const all = ensureCache();
  const i = all.findIndex((e) => e.k === k);
  if (i < 0) return null;
  const [hit] = all.splice(i, 1);
  all.push(hit);
  scheduleCacheFlush();
  return hit.v;
}

export function cachePut(k: string, v: DirectResponse): void {
  const all = ensureCache().filter((e) => e.k !== k);
  all.push({ k, v });
  while (all.length > CACHE_MAX) all.shift();
  cacheMirror = all;
  scheduleCacheFlush();
}

function logLoad(): LogEntry[] {
  try {
    const raw = lsGet(LS.log);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLogEntry);
  } catch {
    return [];
  }
}

function ensureLog(): LogEntry[] {
  if (!hasLocalStorage()) {
    logMirror = [];
    logRawSeen = null;
    logDirty = false;
    return logMirror;
  }
  const raw = lsGet(LS.log);
  if (logMirror === null || (isImmediatePersistence() && !logDirty && raw !== logRawSeen)) {
    logMirror = logLoad();
    logRawSeen = raw;
  }
  return logMirror;
}

function flushLog(): void {
  if (logTimer !== null) {
    clearTimeout(logTimer);
    logTimer = null;
  }
  if (!logDirty || logMirror === null) return;
  logDirty = false;
  if (!hasLocalStorage()) return;
  const serialized = JSON.stringify(logMirror);
  if (lsSet(LS.log, serialized)) {
    logRawSeen = serialized;
  }
}

function scheduleLogFlush(): void {
  logDirty = true;
  if (isImmediatePersistence()) {
    flushLog();
    return;
  }
  if (logTimer !== null) clearTimeout(logTimer);
  logTimer = setTimeout(flushLog, DEBOUNCE_MS);
}

export function appendLog(e: LogEntry): void {
  const all = ensureLog();
  all.push(e);
  while (all.length > LOG_MAX) all.shift();
  scheduleLogFlush();
}

export function exportLog(): string {
  return JSON.stringify(ensureLog());
}

export function clearLog(): void {
  if (logTimer !== null) {
    clearTimeout(logTimer);
    logTimer = null;
  }
  logMirror = [];
  logDirty = false;
  lsRemove(LS.log);
  logRawSeen = lsGet(LS.log);
}

function flushEpisode(): void {
  if (episodeTimer !== null) {
    clearTimeout(episodeTimer);
    episodeTimer = null;
  }
  if (episodePending === null) return;
  const payload = episodePending;
  const cb = episodeStatusCb;
  episodePending = null;
  const ok = lsSet(LS.episode, payload);
  cb?.(ok);
}

export function persistEpisode(
  state: AppState,
  immediate: boolean,
  onStatus: (ok: boolean) => void,
): void {
  const payload = JSON.stringify({
    episodeId: state.episodeId,
    title: state.title,
    fixtureId: state.fixtureId,
    selectedId: state.selectedId,
    paragraphs: state.paragraphs.map((p) => ({
      ...p,
      pendingVersion: null,
      status: p.status === "directing" ? "draft" : p.status,
    })),
  });
  episodePending = payload;
  episodeStatusCb = onStatus;
  if (immediate || isImmediatePersistence()) {
    flushEpisode();
    return;
  }
  if (episodeTimer !== null) clearTimeout(episodeTimer);
  episodeTimer = setTimeout(flushEpisode, DEBOUNCE_MS);
}

export function restoreEpisode(): PersistedEpisode | null {
  try {
    const raw = lsGet(LS.episode);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const rec = saved as Record<string, unknown>;
    if (typeof rec.episodeId !== "string" || !rec.episodeId) return null;
    if (!Array.isArray(rec.paragraphs)) return null;
    const valid = rec.paragraphs.filter(isValidParagraph).map(normalizeParagraph);
    if (rec.paragraphs.length > 0 && valid.length === 0) return null;
    const rawFid = rec.fixtureId;
    const fixtureId: FixtureId | null =
      typeof rawFid === "string" && (FIXTURE_IDS as readonly string[]).includes(rawFid)
        ? (rawFid as FixtureId)
        : null;
    const rawSelected = typeof rec.selectedId === "string" ? rec.selectedId : null;
    const selectedId =
      rawSelected && valid.some((p) => p.id === rawSelected) ? rawSelected : (valid[0]?.id ?? null);
    return {
      episodeId: rec.episodeId,
      title: typeof rec.title === "string" ? rec.title : "",
      fixtureId,
      selectedId,
      paragraphs: valid,
    };
  } catch {
    return null;
  }
}

export function flushPersistence(): void {
  flushCache();
  flushLog();
  flushEpisode();
}

let pagehideAttached = false;
export function attachPagehideFlush(): void {
  if (pagehideAttached || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  pagehideAttached = true;
  window.addEventListener("pagehide", () => {
    flushPersistence();
  });
}
