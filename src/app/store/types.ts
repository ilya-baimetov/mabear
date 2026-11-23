import type { CompileResult } from "../../compiler/types";
import type {
  BeatScript,
  BeatScriptSource,
  DirectResponse,
  DirectorModel,
  FixtureEpisode,
  Lang,
  Remix,
  RuleHit,
  Timeline,
  Usage,
} from "../../shared/schema";

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
  /** material digest (postures + held items) of the start state this version was directed against */
  startKey?: string;
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
  /** carried remix preset when duplicating a remixed scene as a fresh draft */
  pendingRemix?: Remix;
}

export interface ToastMessage {
  id: number;
  message: { en: string; ru: string };
  undoable?: boolean;
}

export type ToastNotice = ToastMessage;

export interface AppState {
  stageReady: boolean;
  /** The user-facing scope of the latest explicit preview. */
  previewScope: { kind: "moment"; id: string } | { kind: "story" } | null;
  episodeId: string;
  title: string;
  lang: Lang;
  paragraphs: Paragraph[];
  selectedId: string | null;
  timeline: Timeline;
  /** Monotonic counter incremented on every recompile(). */
  timelineRevision: number;
  results: CompileResult[];
  /** paragraph ids aligned with timeline.segments */
  segmentIds: string[];
  playing: boolean;
  t: number;
  volume: number;
  muted: boolean;
  captions: boolean;
  loop: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saveError: boolean;
  toast: ToastMessage | null;
  pitch: boolean;
  model: DirectorModel | null;
  directorCalls: number;
  /** example currently loaded (unchanged), so the EN/RU toggle can swap it without an AI call */
  fixtureId: FixtureEpisode["id"] | null;
  /** ▶ Play is holding for the director ("getting ready…") */
  waiting: boolean;
  voiceError?: string | null;
  preparingVoice?: boolean;
}

export type Listener = () => void;

export interface HistoryEntry {
  title: string;
  paragraphs: Paragraph[];
  selectedId: string | null;
  fixtureId: FixtureEpisode["id"] | null;
}

export interface CacheEntry {
  k: string;
  v: DirectResponse;
}

export interface PersistedEpisode {
  episodeId: string;
  title: string;
  fixtureId: FixtureEpisode["id"] | null;
  selectedId: string | null;
  paragraphs: Paragraph[];
}
