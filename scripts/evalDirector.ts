// Director eval (spec §8.4): `npm run eval:director [-- --model claude-haiku-5-5]`.
//   ANTHROPIC_API_KEY set → runs the Worker's director logic in-process (real API).
//   else EVAL_TARGET set  → logs in at $EVAL_TARGET/login with $DEMO_PASSWORD and POSTs /api/direct.
//   --offline             → dry run of the pipeline with the offline parser (no API, no source check).
//   --print-body <id>     → prints one golden request body as JSON (used by scripts/smoke.sh) and exits.
// Checks: parses, post-validator 0 errors, ≥ 3 beats, no Bear line, every line in the requested language, and
// source === "llm" (except --offline). Exit 0 = all pass, 1 = any failure, 2 = not run (no key / no target).
// The password is never printed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BeatScriptSchema, DIRECTOR_MODELS, DirectResponseSchema, type DirectRequest, type DirectResponse, type Lang } from "../src/shared/schema";
import { initialWorldState } from "../src/compiler/worldState";
import { validateBeatScript } from "../src/compiler/validate";
import { costUsd } from "../src/shared/pricing";

interface GoldenPrompt {
  id: string;
  lang: Lang;
  paragraph: string;
  previous: string[];
  canonViolating: boolean;
  note?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS: GoldenPrompt[] = JSON.parse(readFileSync(path.join(here, "..", "tests", "golden", "prompts.json"), "utf8"));

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(name);

const model = argValue("--model") ?? process.env.EVAL_MODEL ?? "claude-opus-5-5";
const allowListed = (DIRECTOR_MODELS as readonly string[]).includes(model);

function requestFor(p: GoldenPrompt): DirectRequest {
  const req: DirectRequest = {
    lang: p.lang,
    paragraph: p.paragraph,
    previous: p.previous,
    worldState: initialWorldState(),
    episodeId: "eval",
    paragraphId: `eval-${p.id}`,
  };
  if (allowListed) req.model = model as DirectRequest["model"];
  return req;
}

// ---------- checks ----------

const CYR = /[Ѐ-ӿ]/g;
const LAT = /[A-Za-z]/g;

function lineInLanguage(line: string, lang: Lang): boolean {
  const cyr = (line.match(CYR) ?? []).length;
  const lat = (line.match(LAT) ?? []).length;
  if (lang === "en") return cyr === 0;
  return cyr > 0 && cyr / (cyr + lat) >= 0.8;
}

interface Row {
  id: string;
  lang: Lang;
  pass: boolean;
  beats: number;
  hits: number;
  source: string;
  latencyMs: number;
  cost: number;
  problems: string[];
}

function check(p: GoldenPrompt, resp: unknown, requireLlm: boolean): Row {
  const problems: string[] = [];
  const parsed = DirectResponseSchema.safeParse(resp);
  if (!parsed.success) {
    const o = (resp ?? {}) as { httpStatus?: number; body?: string; transportError?: string };
    const why = o.transportError ? `transport error: ${o.transportError}` : o.httpStatus ? `HTTP ${o.httpStatus}: ${o.body ?? ""}` : `response does not parse: ${parsed.error.issues[0]?.message ?? "?"}`;
    return { id: p.id, lang: p.lang, pass: false, beats: 0, hits: 0, source: "-", latencyMs: 0, cost: 0, problems: [why] };
  }
  const r: DirectResponse = parsed.data;
  const bs = r.beatScript;
  if (!BeatScriptSchema.safeParse(bs).success) problems.push("beatScript does not parse");
  const v = validateBeatScript(bs, initialWorldState(), p.lang);
  if (v.errors.length) problems.push(`validator: ${v.errors.slice(0, 3).join("; ")}`);
  if (bs.beats.length < 3) problems.push(`only ${bs.beats.length} beats`);
  if (bs.beats.some((b) => b.actor === "bear" && b.line && b.line.trim())) problems.push("Bear has a line");
  const badLines = bs.beats.filter((b) => b.line && !lineInLanguage(b.line, p.lang)).map((b) => b.line);
  if (badLines.length) problems.push(`line not in ${p.lang}: ${JSON.stringify(badLines[0])}`);
  if (requireLlm && r.source !== "llm") problems.push(`source=${r.source}${r.error ? ` (${r.error.slice(0, 120)})` : ""}`);
  return {
    id: p.id, lang: p.lang, pass: problems.length === 0, beats: bs.beats.length, hits: bs.rule_hits.length,
    source: r.source, latencyMs: r.latencyMs, cost: costUsd(r.model, r.usage), problems,
  };
}

// ---------- transports ----------

type Transport = (req: DirectRequest) => Promise<unknown>;

async function directTransport(offline: boolean): Promise<Transport> {
  const { runDirector } = await import("../worker/direct");
  const env = offline
    ? {}
    : { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, DIRECTOR_MODEL: model };
  return (req) => runDirector(req, env);
}

async function deployedTransport(target: string): Promise<Transport> {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("EVAL_TARGET is set but DEMO_PASSWORD is not");
  const login = await fetch(`${target}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
  });
  const cookies = login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") ?? ""];
  const session = cookies.map((c) => /mb_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!session) throw new Error(`login failed (HTTP ${login.status})`);
  return async (req) => {
    const res = await fetch(`${target}/api/direct`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `mb_session=${session}` },
      body: JSON.stringify(req),
    });
    const text = await res.text();
    if (!res.ok) return { httpStatus: res.status, body: text.slice(0, 300) };
    return JSON.parse(text);
  };
}

// ---------- output ----------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main(): Promise<number> {
  const bodyId = argValue("--print-body");
  if (bodyId) {
    const p = PROMPTS.find((x) => x.id === bodyId);
    if (!p) {
      console.error(`unknown golden prompt id: ${bodyId} (have: ${PROMPTS.map((x) => x.id).join(", ")})`);
      return 1;
    }
    process.stdout.write(JSON.stringify(requestFor(p)));
    return 0;
  }

  const offline = hasFlag("--offline");
  const target = process.env.EVAL_TARGET?.replace(/\/+$/, "");
  let transport: Transport;
  let mode: string;
  if (offline) {
    transport = await directTransport(true);
    mode = "offline dry run (no API)";
  } else if (process.env.ANTHROPIC_API_KEY) {
    transport = await directTransport(false);
    mode = `direct API, model ${model}`;
  } else if (target) {
    transport = await deployedTransport(target);
    mode = `deployed ${target}, model ${allowListed ? model : "(worker default)"}`;
  } else {
    console.log("director eval not run: no ANTHROPIC_API_KEY and no EVAL_TARGET (key absent)");
    return 2;
  }

  const only = argValue("--only");
  const prompts = only ? PROMPTS.filter((p) => p.id === only) : PROMPTS;
  console.log(`MaBear director eval — ${mode} — ${prompts.length} golden prompts`);
  const rows: Row[] = [];
  for (const p of prompts) {
    let resp: unknown;
    try {
      resp = await transport(requestFor(p));
    } catch (e) {
      resp = { transportError: e instanceof Error ? e.message : String(e) };
    }
    rows.push(check(p, resp, !offline));
  }

  console.log("");
  console.log(`${pad("prompt", 12)}${pad("lang", 6)}${pad("pass", 6)}${pad("beats", 7)}${pad("hits", 6)}${pad("source", 9)}${pad("latency", 10)}${pad("cost $", 11)}problems`);
  for (const r of rows) {
    console.log(
      `${pad(r.id, 12)}${pad(r.lang, 6)}${pad(r.pass ? "PASS" : "FAIL", 6)}${pad(String(r.beats), 7)}${pad(String(r.hits), 6)}${pad(r.source, 9)}${pad(`${r.latencyMs} ms`, 10)}${pad(r.cost.toFixed(5), 11)}${r.problems.join(" | ")}`,
    );
  }
  const passed = rows.filter((r) => r.pass).length;
  const p50 = median(rows.map((r) => r.latencyMs));
  const meanCost = rows.length ? rows.reduce((a, r) => a + r.cost, 0) / rows.length : 0;
  console.log("");
  console.log(`pass rate ${passed}/${rows.length} (${Math.round((100 * passed) / Math.max(1, rows.length))}%) · P50 latency ${Math.round(p50)} ms · mean cost $${meanCost.toFixed(5)} per paragraph · model ${model}`);
  return passed === rows.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`eval failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
