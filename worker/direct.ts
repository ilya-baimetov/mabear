// POST /api/direct (spec §8.1–8.2): length check → pre-filter → Claude (structured output) → zod → post-validator.
// Any director failure (no key, timeout, refusal, invalid output after one repair) → offline-parser BeatScript with
// `source: "offline"` and an `error` string. Never returns a 5xx for a director failure. Never logs secrets.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  BeatScriptSchema, DIRECTOR_MODELS, DirectRequestSchema, MAX_PARAGRAPH_CHARS, MAX_PREVIOUS,
  type BeatScript, type DirectRequest, type DirectResponse, type Lang, type RuleHit, type Usage,
} from "../src/shared/schema";
import { preFilter, RULES } from "../src/shared/rules";
import { validateBeatScript } from "../src/compiler/validate";
import { parseParagraph } from "../src/director/offline/parser";
import { FIXTURES } from "../src/director/fixtures/index";
import { buildSystemPrompt, buildUserMessage } from "../src/director/prompt";

export interface DirectorEnv {
  ANTHROPIC_API_KEY?: string;
  DIRECTOR_MODEL?: string;
  MOCK_DIRECTOR?: string;
}

export interface DirectorDeps {
  /** Injected Anthropic client (tests). Default: a real client built from ANTHROPIC_API_KEY. */
  client?: Anthropic;
  /** Overall deadline for the director call(s), including the repair retry. */
  timeoutMs?: number;
}

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DIRECTOR_TIMEOUT_MS = 20_000;
export const MAX_TOKENS = 4000;
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Mock-mode usage: plausible numbers so the economics panel has something to show in tests. */
export const MOCK_USAGE: Usage = { input_tokens: 900, output_tokens: 700, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 };

/** SDK 1.5's zod→JSON-schema transform demotes `enum` to a description ("{enum: [...]}"), so ids would only be
 *  validated after the fact. Put the enums back so constrained decoding enforces verbs/marks/emotes etc. */
export function restoreEnums<T>(schema: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v);
    const m = typeof out.description === "string" ? /^\{enum: (\[.*\])\}$/s.exec(out.description) : null;
    if (m && out.type === "string") {
      try {
        const values = JSON.parse(m[1]) as unknown;
        if (Array.isArray(values) && values.every((x) => typeof x === "string")) {
          out.enum = values;
          delete out.description;
        }
      } catch {
        /* keep as description */
      }
    }
    return out;
  };
  return walk(schema) as T;
}

const SDK_FORMAT = zodOutputFormat(BeatScriptSchema);
const SDK_BETA_FORMAT = betaZodOutputFormat(BeatScriptSchema);
const ENUM_FORMAT = { ...SDK_FORMAT, schema: restoreEnums(SDK_FORMAT.schema) };
const ENUM_BETA_FORMAT = { ...SDK_BETA_FORMAT, schema: restoreEnums(SDK_BETA_FORMAT.schema) };

/** Server-side refusal fallback (§8.2) and enum-constrained schema: tried first; a 400 moves to the next request
 *  shape (see SHAPES) and the accepted shape is remembered per isolate. These flags are global kill switches. */
let fallbackEnabled = true;
let strictEnums = true;
/** Test/ops hooks. */
export function setRefusalFallbackEnabled(on: boolean): void {
  fallbackEnabled = on;
  preferredShape = null;
}
export function setStrictEnums(on: boolean): void {
  strictEnums = on;
  preferredShape = null;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function badRequest(error: string, message: string): Response {
  return json({ error, message }, 400);
}

export function resolveModel(req: Pick<DirectRequest, "model">, env: DirectorEnv): string {
  return req.model ?? (env.DIRECTOR_MODEL?.trim() || DEFAULT_MODEL);
}

// ---------- helpers ----------

function emptyUsage(): Usage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function addUsage(acc: Usage | null, u: ApiUsage | null | undefined): Usage | null {
  if (!u) return acc;
  const a = acc ?? emptyUsage();
  return {
    input_tokens: a.input_tokens + (u.input_tokens ?? 0),
    output_tokens: a.output_tokens + (u.output_tokens ?? 0),
    cache_read_input_tokens: a.cache_read_input_tokens + (u.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: a.cache_creation_input_tokens + (u.cache_creation_input_tokens ?? 0),
  };
}

function mergeHits(...lists: RuleHit[][]): RuleHit[] {
  const seen = new Set<string>();
  const out: RuleHit[] = [];
  for (const list of lists) {
    for (const h of list) {
      const k = `${h.rule}\u0000${h.original}\u0000${h.replacement}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(h);
    }
  }
  return out;
}

function short(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function safePreFilter(text: string, lang: Lang): { text: string; hits: RuleHit[] } {
  try {
    const r = preFilter(text, "auto", lang);
    return { text: typeof r?.text === "string" ? r.text : text, hits: Array.isArray(r?.hits) ? r.hits : [] };
  } catch {
    return { text, hits: [] };
  }
}

interface Validated {
  beatScript: BeatScript;
  /** problems that persist after the validator's own fixes */
  errors: string[];
}

/** Post-validator; an error that survives a second pass over the fixed output counts as persistent. */
function validate(bs: BeatScript, req: DirectRequest, preHits: RuleHit[]): Validated {
  const v1 = validateBeatScript(bs, req.worldState, req.lang);
  const fixed = v1.beatScript ?? bs;
  const v2 = v1.errors.length ? validateBeatScript(fixed, req.worldState, req.lang) : v1;
  return {
    beatScript: { ...fixed, rule_hits: mergeHits(preHits, fixed.rule_hits ?? [], v1.hits ?? []) },
    errors: v2.errors ?? [],
  };
}

function emergencyBeatScript(lang: Lang): BeatScript {
  return {
    summary: lang === "ru" ? "Маша гуляет во дворе" : "Masha plays in the yard",
    time_of_day: null, mood: "playful",
    music: { mood: "playful", intensity: "soft", change: "continue" },
    ambience: null,
    beats: [
      { actor: "masha", verb: "idle", target: null, item: null, line: null, emote: "hum", sfx: null, emotion: "happy", with_previous: false, delay_s: 0, shot: "auto" },
      { actor: "bear", verb: "wave", target: "masha", item: null, line: null, emote: "chuckle", sfx: null, emotion: "happy", with_previous: true, delay_s: 0.5, shot: "auto" },
    ],
    rule_hits: [],
  };
}

/** Offline-parser BeatScript (validated, pre-filter hits merged). Never throws. */
export function offlineBeatScript(req: DirectRequest, filtered: string, preHits: RuleHit[], extraHits: RuleHit[] = []): BeatScript {
  let bs: BeatScript;
  try {
    bs = parseParagraph(filtered, req.lang, req.worldState);
  } catch {
    bs = emergencyBeatScript(req.lang);
  }
  try {
    const v = validate(bs, req, preHits);
    return { ...v.beatScript, rule_hits: mergeHits(v.beatScript.rule_hits, extraHits) };
  } catch {
    return { ...bs, rule_hits: mergeHits(preHits, bs.rule_hits ?? [], extraHits) };
  }
}

const norm = (s: string) => s.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export function findFixtureBeatScript(text: string): BeatScript | null {
  const needle = norm(text);
  if (!needle) return null;
  for (const ep of FIXTURES) for (const p of ep.paragraphs) if (norm(p.text) === needle) return p.beatScript;
  return null;
}

// ---------- Claude call ----------

type CallOutcome =
  | { kind: "ok"; beatScript: BeatScript; model: string }
  | { kind: "refusal"; category: string | null }
  | { kind: "invalid"; note: string };

/** Request shape: server-side refusal fallback on/off × enum-constrained schema on/off. */
interface Shape { fallback: boolean; enums: boolean }
const SHAPES: Shape[] = [
  { fallback: true, enums: true },
  { fallback: false, enums: true },
  { fallback: true, enums: false },
  { fallback: false, enums: false },
];
/** The first shape the API accepted in this isolate (tried first next time). */
let preferredShape: Shape | null = null;

function shapesFor(model: string): Shape[] {
  // Haiku has no server-side fallback; other models get the fallback beta (§8.2) and drop it if the API rejects it.
  const supportsFallback = !model.startsWith("claude-haiku");
  const allowed = SHAPES.filter((s) => (supportsFallback ? true : !s.fallback) && (fallbackEnabled || !s.fallback) && (strictEnums || !s.enums));
  if (preferredShape) {
    const p = allowed.find((s) => s.fallback === preferredShape!.fallback && s.enums === preferredShape!.enums);
    if (p) return [p, ...allowed.filter((s) => s !== p)];
  }
  return allowed;
}

interface RawResult { stop_reason: string | null; stop_details?: { category?: string | null } | null; parsed_output: unknown; usage: ApiUsage; model: string }

async function send(client: Anthropic, shape: Shape, model: string, userText: string, signal: AbortSignal): Promise<RawResult> {
  const system = [{ type: "text" as const, text: buildSystemPrompt(), cache_control: { type: "ephemeral" as const } }];
  const messages = [{ role: "user" as const, content: userText }];
  if (shape.fallback) {
    return (await client.beta.messages.parse(
      { model, max_tokens: MAX_TOKENS, system, messages, betas: [FALLBACK_BETA], fallbacks: "default", output_config: { effort: "low", format: shape.enums ? ENUM_BETA_FORMAT : SDK_BETA_FORMAT } },
      { signal },
    )) as unknown as RawResult;
  }
  return (await client.messages.parse(
    { model, max_tokens: MAX_TOKENS, system, messages, output_config: { effort: "low", format: shape.enums ? ENUM_FORMAT : SDK_FORMAT } },
    { signal },
  )) as unknown as RawResult;
}

async function callOnce(client: Anthropic, model: string, userText: string, signal: AbortSignal, usageRef: { usage: Usage | null }): Promise<CallOutcome> {
  try {
    let r: RawResult | null = null;
    let lastBadRequest: unknown = null;
    for (const shape of shapesFor(model)) {
      try {
        r = await send(client, shape, model, userText, signal);
        preferredShape = shape;
        break;
      } catch (e) {
        // 400 → this request shape isn't accepted (e.g. fallback beta + structured outputs); try the next shape.
        if (e instanceof Anthropic.BadRequestError) {
          lastBadRequest = e;
          continue;
        }
        throw e;
      }
    }
    if (!r) throw lastBadRequest ?? new Error("no request shape available");
    usageRef.usage = addUsage(usageRef.usage, r.usage);
    const stopReason = r.stop_reason;
    if (stopReason === "refusal") return { kind: "refusal", category: r.stop_details?.category ?? null };
    const parsed = r.parsed_output;
    if (!parsed) return { kind: "invalid", note: `no structured output (stop_reason: ${stopReason})` };
    const check = BeatScriptSchema.safeParse(parsed);
    if (!check.success) return { kind: "invalid", note: short(check.error.message, 600) };
    return { kind: "ok", beatScript: check.data, model: r.model || model };
  } catch (e) {
    // The SDK's structured-output parser throws a plain AnthropicError on bad JSON / schema mismatch → repair.
    if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError) && /structured output/i.test(e.message)) {
      return { kind: "invalid", note: short(e.message, 600) };
    }
    throw e;
  }
}

function describeError(e: unknown, timedOut: boolean): string {
  if (timedOut) return "timeout: the director took longer than 20 s";
  if (e instanceof Anthropic.APIError) return short(`api_error ${e.status ?? ""}: ${e.message}`);
  if (e instanceof Error) return short(`director_error: ${e.message}`);
  return "director_error";
}

/** The whole director for one validated request. Never throws. */
export async function runDirector(req: DirectRequest, env: DirectorEnv, deps: DirectorDeps = {}): Promise<DirectResponse> {
  const started = Date.now();
  const model = resolveModel(req, env);
  const pre = safePreFilter(req.paragraph, req.lang);
  const filteredReq: DirectRequest = { ...req, previous: req.previous.slice(-MAX_PREVIOUS).map((p) => safePreFilter(p.slice(0, MAX_PARAGRAPH_CHARS), req.lang).text) };

  const offline = (error: string | undefined, usage: Usage | null, extraHits: RuleHit[] = []): DirectResponse => {
    const res: DirectResponse = {
      beatScript: offlineBeatScript(req, pre.text, pre.hits, extraHits),
      source: "offline",
      latencyMs: Date.now() - started,
      usage,
      model: usage ? model : "offline-parser",
    };
    if (error) res.error = error;
    return res;
  };

  // Mock mode (§11): a fixture when the paragraph matches one exactly, else the offline parser; no error → `ready`.
  if (env.MOCK_DIRECTOR === "1" || env.MOCK_DIRECTOR === "true") {
    const fx = findFixtureBeatScript(req.paragraph);
    let beatScript: BeatScript;
    if (fx) {
      try {
        beatScript = validate(fx, req, pre.hits).beatScript;
      } catch {
        beatScript = fx;
      }
    } else {
      beatScript = offlineBeatScript(req, pre.text, pre.hits);
    }
    return { beatScript, source: "offline", latencyMs: Date.now() - started, usage: { ...MOCK_USAGE }, model: "mock" };
  }

  if (!deps.client && !env.ANTHROPIC_API_KEY) return offline("no_api_key: the director is not configured, offline staging used", null);

  const timeoutMs = deps.timeoutMs ?? DIRECTOR_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const usageRef: { usage: Usage | null } = { usage: null };
  try {
    const client = deps.client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: timeoutMs, maxRetries: 1 });
    const baseText = buildUserMessage(filteredReq, pre.text);
    let userText = baseText;
    let lastNote = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await callOnce(client, model, userText, controller.signal, usageRef);
      if (out.kind === "refusal") {
        const hit: RuleHit = {
          rule: "in_character",
          original: short(req.paragraph, 80),
          replacement: req.lang === "ru" ? "простая постановка без ИИ" : "a simple offline staging",
          kid_message: RULES.in_character.kidMessage[req.lang],
        };
        return offline(`refusal${out.category ? ` (${out.category})` : ""}: offline staging used`, usageRef.usage, [hit]);
      }
      if (out.kind === "ok") {
        const v = validate(out.beatScript, req, pre.hits);
        if (v.errors.length === 0) {
          return { beatScript: v.beatScript, source: "llm", latencyMs: Date.now() - started, usage: usageRef.usage, model: out.model };
        }
        lastNote = `post-validator errors: ${v.errors.slice(0, 8).join("; ")}`;
      } else {
        lastNote = out.note;
      }
      userText = `${baseText}\n\nYour previous BeatScript for this paragraph was rejected:\n${lastNote}\nReturn a corrected BeatScript that fixes these problems.`;
    }
    return offline(short(`invalid_output after one repair: ${lastNote}`), usageRef.usage);
  } catch (e) {
    return offline(describeError(e, controller.signal.aborted), usageRef.usage);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- HTTP handler ----------

const MAX_BODY_CHARS = 200_000;

/** Validates the HTTP request (400 on bad input) and runs the director. Never 5xx for director failures. */
export async function handleDirect(request: Request, env: DirectorEnv, deps: DirectorDeps = {}): Promise<Response> {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...JSON_HEADERS, allow: "POST" } });
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return badRequest("invalid_body", "Could not read the request body.");
  }
  if (raw.length > MAX_BODY_CHARS) return badRequest("body_too_large", "Request body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("invalid_json", "Request body must be JSON.");
  }
  if (body && typeof body === "object" && "model" in body) {
    const m = (body as { model?: unknown }).model;
    if (m !== undefined && !(DIRECTOR_MODELS as readonly unknown[]).includes(m)) {
      return badRequest("model_not_allowed", `model must be one of: ${DIRECTOR_MODELS.join(", ")}`);
    }
  }
  const parsed = DirectRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return badRequest("invalid_request", short(issues));
  }
  const req = parsed.data;
  if (req.paragraph.length > MAX_PARAGRAPH_CHARS) return badRequest("paragraph_too_long", `paragraph must be at most ${MAX_PARAGRAPH_CHARS} characters`);
  if (!req.paragraph.trim()) return badRequest("empty_paragraph", "paragraph is empty");
  if (req.previous.length > MAX_PREVIOUS) return badRequest("too_many_previous", `previous must hold at most ${MAX_PREVIOUS} paragraphs`);

  try {
    return json(await runDirector(req, env, deps));
  } catch (e) {
    // runDirector never throws by design; belt and braces so the endpoint never 5xxs.
    const pre = safePreFilter(req.paragraph, req.lang);
    const res: DirectResponse = {
      beatScript: offlineBeatScript(req, pre.text, pre.hits),
      source: "offline", latencyMs: 0, usage: null, model: "offline-parser",
      error: describeError(e, false),
    };
    return json(res);
  }
}
