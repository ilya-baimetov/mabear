import { beforeEach, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { createHandler, type Env } from "../../worker/index";
import { signSession, verifySession, timingSafeEqualStr, SESSION_MAX_AGE_S } from "../../worker/auth";
import { RateLimiter, DIRECT_LIMITS } from "../../worker/rateLimit";
import { runDirector, setRefusalFallbackEnabled, setStrictEnums } from "../../worker/direct";
import { BeatScriptSchema, DirectResponseSchema, type BeatScript, type DirectRequest, type DirectResponse } from "../../src/shared/schema";
import { initialWorldState } from "../../src/compiler/worldState";
import { FIXTURES } from "../../src/director/fixtures/index";

const BASE = "https://mabear.test";
const SECRETS = { DEMO_PASSWORD: "open-sesame", SESSION_SECRET: "s3cret" };

function makeEnv(extra: Partial<Env> = {}): Env & { assetCalls: string[] } {
  const assetCalls: string[] = [];
  return {
    ...SECRETS,
    ASSETS: { fetch: async (req: Request) => (assetCalls.push(new URL(req.url).pathname), new Response("<html>app</html>", { headers: { "content-type": "text/html" } })) },
    assetCalls,
    ...extra,
  };
}

function directBody(over: Omit<Partial<DirectRequest>, "model"> & Record<string, unknown> = {}): string {
  const body: DirectRequest = {
    lang: "en",
    paragraph: "Masha runs to the garden and takes a carrot.",
    previous: [],
    worldState: initialWorldState(),
    episodeId: "ep",
    paragraphId: "p1",
  };
  return JSON.stringify({ ...body, ...over });
}

async function cookieFor(env = SECRETS): Promise<string> {
  return `mb_session=${await signSession(env)}`;
}

function newHandler(extra: Parameters<typeof createHandler>[0] = {}) {
  return createHandler({ directLimiter: new RateLimiter(DIRECT_LIMITS), loginLimiter: new RateLimiter(DIRECT_LIMITS), ...extra });
}

const VALID_BS: BeatScript = {
  summary: "Masha grabs a carrot and Bear sighs",
  time_of_day: null, mood: "playful",
  music: { mood: "playful", intensity: "soft", change: "start" },
  ambience: ["birds_day"],
  beats: [
    { actor: "masha", verb: "run_to", target: "garden", item: null, line: null, emote: "giggle", sfx: null, emotion: "mischievous", with_previous: false, delay_s: 0, shot: "auto" },
    { actor: "masha", verb: "take", target: "carrot", item: "carrot", line: "Yummy carrot!", emote: null, sfx: null, emotion: "happy", with_previous: false, delay_s: 0, shot: "auto" },
    { actor: "bear", verb: "sigh", target: null, item: null, line: null, emote: "sigh", sfx: null, emotion: "annoyed", with_previous: true, delay_s: 0.5, shot: "auto" },
  ],
  rule_hits: [],
};

const USAGE = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 };

type ParseImpl = (params: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<unknown>;
function fakeClient(impl: ParseImpl, betaImpl: ParseImpl = impl): Anthropic & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  const wrap = (f: ParseImpl): ParseImpl => (p, o) => (calls.push(p), f(p, o));
  return { calls, messages: { parse: wrap(impl) }, beta: { messages: { parse: wrap(betaImpl) } } } as unknown as Anthropic & { calls: Record<string, unknown>[] };
}
const okMessage = (bs: unknown = VALID_BS) => ({ stop_reason: "end_turn", stop_details: null, parsed_output: bs, usage: USAGE, model: "claude-opus-5-5" });

const REQ: DirectRequest = JSON.parse(directBody());

describe("auth: session cookie", () => {
  it("signs and verifies", async () => {
    const v = await signSession(SECRETS);
    expect(v).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifySession(SECRETS, v)).toBe(true);
  });

  it("rejects tampered, expired, foreign and malformed cookies", async () => {
    const now = Date.now();
    const v = (await signSession(SECRETS, now))!;
    const flipped = v.slice(0, -1) + (v.endsWith("0") ? "1" : "0");
    expect(await verifySession(SECRETS, flipped, now)).toBe(false);
    expect(await verifySession(SECRETS, v, now + (SESSION_MAX_AGE_S + 60) * 1000)).toBe(false);
    expect(await verifySession({ ...SECRETS, SESSION_SECRET: "other" }, v, now)).toBe(false);
    expect(await verifySession({ ...SECRETS, DEMO_PASSWORD: "changed" }, v, now)).toBe(false);
    expect(await verifySession(SECRETS, "garbage", now)).toBe(false);
    expect(await verifySession(SECRETS, `${now + 1000}.${v.split(".")[1]}`, now)).toBe(false);
  });

  it("derives a key from DEMO_PASSWORD when SESSION_SECRET is unset; fails closed without a password", async () => {
    const env = { DEMO_PASSWORD: "pw" };
    const v = await signSession(env);
    expect(await verifySession(env, v)).toBe(true);
    expect(await signSession({})).toBeNull();
    expect(await verifySession({}, v)).toBe(false);
  });

  it("constant-time compare works for unequal lengths", async () => {
    expect(await timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(await timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});

describe("worker: gate and routes", () => {
  it("serves /api/health and /robots.txt without auth, with X-Robots-Tag", async () => {
    const h = newHandler();
    const env = makeEnv();
    const health = await h(new Request(`${BASE}/api/health`), env);
    expect(health.status).toBe(200);
    expect(health.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const robots = await h(new Request(`${BASE}/robots.txt`), env);
    expect(await robots.text()).toContain("Disallow: /");
    expect(robots.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("redirects HTML to /login and answers 401 for the API without a valid cookie", async () => {
    const h = newHandler();
    const env = makeEnv();
    const page = await h(new Request(`${BASE}/`), env);
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/login");
    expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const api = await h(new Request(`${BASE}/api/direct`, { method: "POST", body: directBody(), headers: { cookie: "mb_session=123.abc" } }), env);
    expect(api.status).toBe(401);
    expect(api.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(env.assetCalls).toEqual([]);
  });

  it("login page is served (EN/RU) with X-Robots-Tag", async () => {
    const res = await newHandler()(new Request(`${BASE}/login`), makeEnv());
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('name="password"');
    expect(html).toContain("Пароль");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("form login sets a 7-day HttpOnly Secure SameSite=Lax cookie and redirects to /", async () => {
    const h = newHandler();
    const env = makeEnv();
    const res = await h(new Request(`${BASE}/login`, { method: "POST", body: new URLSearchParams({ password: "open-sesame" }) }), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^mb_session=\d+\.[0-9a-f]{64};/);
    for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=604800", "Path=/"]) expect(cookie).toContain(attr);
    const value = cookie.split(";")[0];
    const app = await h(new Request(`${BASE}/`, { headers: { cookie: value } }), env);
    expect(app.status).toBe(200);
    expect(await app.text()).toContain("app");
    expect(app.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(env.assetCalls).toEqual(["/"]);
  });

  it("rejects a wrong password (form → back to /login?error=1, JSON → 401) without a cookie", async () => {
    const h = newHandler();
    const env = makeEnv();
    const form = await h(new Request(`${BASE}/login`, { method: "POST", body: new URLSearchParams({ password: "nope" }) }), env);
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe("/login?error=1");
    expect(form.headers.get("set-cookie")).toBeNull();
    const js = await h(new Request(`${BASE}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "nope" }) }), env);
    expect(js.status).toBe(401);
    const ok = await h(new Request(`${BASE}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "open-sesame" }) }), env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("mb_session=");
  });
});

describe("worker: rate limits", () => {
  it("limiter: 30 per 10 minutes per key, then recovers", () => {
    const l = new RateLimiter(DIRECT_LIMITS);
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(l.check("a", t0 + i).ok).toBe(true);
    const d = l.check("a", t0 + 31);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.scope).toBe("session");
    expect(l.check("b", t0 + 32).ok).toBe(true);
    expect(l.check("a", t0 + 10 * 60 * 1000 + 1).ok).toBe(true);
  });

  it("limiter: 200 per hour globally", () => {
    const l = new RateLimiter(DIRECT_LIMITS);
    for (let i = 0; i < 200; i++) expect(l.check(`k${i % 20}`, 1000 + i).ok).toBe(true);
    const d = l.check("fresh", 2000);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.scope).toBe("global");
  });

  it("handler: the 31st /api/direct within 10 minutes → 429 JSON with X-Robots-Tag", async () => {
    const h = newHandler();
    const env = makeEnv({ MOCK_DIRECTOR: "1" });
    const cookie = await cookieFor();
    let last: Response | null = null;
    for (let i = 0; i < 31; i++) last = await h(new Request(`${BASE}/api/direct`, { method: "POST", body: directBody(), headers: { cookie } }), env);
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    expect(last!.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await last!.json()).error).toBe("rate_limited");
  });
});

describe("worker: /api/direct request validation", () => {
  let h: ReturnType<typeof newHandler>;
  let cookie: string;
  beforeEach(async () => {
    h = newHandler();
    cookie = await cookieFor();
  });
  const post = (body: string) => h(new Request(`${BASE}/api/direct`, { method: "POST", body, headers: { cookie, "content-type": "application/json" } }), makeEnv());

  it("model outside the allow-list → 400", async () => {
    const res = await post(directBody({ model: "gpt-4o" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("model_not_allowed");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("paragraph > 600 chars → 400; previous > 3 → 400; bad JSON / shape → 400", async () => {
    expect((await post(directBody({ paragraph: "a".repeat(601) }))).status).toBe(400);
    expect((await post(directBody({ previous: ["a", "b", "c", "d"] }))).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ lang: "fr", paragraph: "x" }))).status).toBe(400);
    expect((await post(directBody({ paragraph: "   " }))).status).toBe(400);
  });

  it("an allow-listed model and exactly 600 chars / 3 previous are accepted", async () => {
    const res = await post(directBody({ model: "claude-haiku-5-5", paragraph: "a".repeat(600), previous: ["a", "b", "c"] }));
    expect(res.status).toBe(200);
  });

  it("no ANTHROPIC_API_KEY → 200 with the offline BeatScript and an error string", async () => {
    const res = await post(directBody());
    expect(res.status).toBe(200);
    const body = DirectResponseSchema.parse(await res.json());
    expect(body.source).toBe("offline");
    expect(body.error).toMatch(/no_api_key/);
    expect(body.usage).toBeNull();
    expect(BeatScriptSchema.safeParse(body.beatScript).success).toBe(true);
    expect(body.beatScript.beats.length).toBeGreaterThan(0);
  });

  it("MOCK_DIRECTOR=1 → fake usage, no error (UI shows ready), fixture on exact match", async () => {
    const env = makeEnv({ MOCK_DIRECTOR: "1" });
    const res = await h(new Request(`${BASE}/api/direct`, { method: "POST", body: directBody(), headers: { cookie } }), env);
    const body = DirectResponseSchema.parse(await res.json());
    expect(body.source).toBe("offline");
    expect(body.error).toBeUndefined();
    expect(body.usage).not.toBeNull();
    expect(body.model).toBe("mock");
    const fx = FIXTURES[0]?.paragraphs[0];
    if (fx) {
      const r2 = await h(new Request(`${BASE}/api/direct`, { method: "POST", body: directBody({ paragraph: fx.text, lang: FIXTURES[0].lang }), headers: { cookie } }), env);
      const b2 = DirectResponseSchema.parse(await r2.json());
      expect(b2.beatScript.beats.length).toBe(fx.beatScript.beats.length);
      expect(b2.beatScript.summary).toBe(fx.beatScript.summary);
    }
  });
});

describe("director: Claude call pipeline (fake client)", () => {
  beforeEach(() => {
    setRefusalFallbackEnabled(true);
    setStrictEnums(true);
  });

  it("valid structured output → source llm with usage; request shape per §8.2", async () => {
    const client = fakeClient(async () => okMessage());
    const res: DirectResponse = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("llm");
    expect(res.error).toBeUndefined();
    expect(res.usage).toEqual(USAGE);
    expect(res.beatScript.beats.length).toBeGreaterThanOrEqual(3);
    const p = client.calls[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.max_tokens).toBe(4000);
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("top_p");
    expect(p).not.toHaveProperty("top_k");
    expect(p).not.toHaveProperty("thinking");
    expect((p.output_config as { effort: string }).effort).toBe("low");
    const sys = p.system as { type: string; text: string; cache_control: unknown }[];
    expect(sys[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
  });

  it("body.model and DIRECTOR_MODEL pick the model (no fallbacks on Haiku)", async () => {
    const client = fakeClient(async () => ({ ...okMessage(), model: "claude-haiku-5-5" }));
    const res = await runDirector({ ...REQ, model: "claude-haiku-5-5" }, { DIRECTOR_MODEL: "claude-opus-5-5" }, { client });
    expect(res.model).toBe("claude-haiku-5-5");
    expect(client.calls[0].model).toBe("claude-haiku-5-5");
    expect(client.calls[0]).not.toHaveProperty("fallbacks");
  });

  it("refusal → offline with an error and a rule hit", async () => {
    const client = fakeClient(async () => ({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null }, parsed_output: null, usage: USAGE, model: "claude-opus-5-5" }));
    const res = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("offline");
    expect(res.error).toMatch(/refusal/);
    expect(res.beatScript.rule_hits.some((h) => h.rule === "in_character")).toBe(true);
  });

  it("invalid output → one repair retry with the error appended → llm", async () => {
    let n = 0;
    const client = fakeClient(async () => {
      n++;
      if (n === 1) throw new Anthropic.AnthropicError("Failed to parse structured output: beats.0.verb invalid");
      return okMessage();
    });
    const res = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("llm");
    expect(n).toBe(2);
    const second = (client.calls[1].messages as { content: string }[])[0].content;
    expect(second).toContain("rejected");
    expect(second).toContain("beats.0.verb invalid");
  });

  it("invalid twice → offline fallback", async () => {
    const client = fakeClient(async () => ({ ...okMessage(), parsed_output: null, stop_reason: "max_tokens" }));
    const res = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("offline");
    expect(res.error).toMatch(/invalid_output/);
    expect(client.calls.length).toBe(2);
  });

  it("timeout → offline fallback", async () => {
    const client = fakeClient((_p, o) => new Promise((_res, rej) => o?.signal?.addEventListener("abort", () => rej(new Anthropic.APIUserAbortError()))));
    const res = await runDirector(REQ, {}, { client, timeoutMs: 30 });
    expect(res.source).toBe("offline");
    expect(res.error).toMatch(/timeout/);
  });

  it("API error → offline fallback, never throws", async () => {
    const client = fakeClient(async () => {
      throw new Anthropic.InternalServerError(500, { type: "error" }, "boom", new Headers());
    });
    const res = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("offline");
    expect(res.error).toMatch(/api_error/);
  });

  it("if the fallback beta is rejected (400), the plain structured call is used", async () => {
    const client = fakeClient(
      async () => okMessage(),
      async () => {
        throw new Anthropic.BadRequestError(400, { type: "error" }, "fallbacks not supported with output_config", new Headers());
      },
    );
    const res = await runDirector(REQ, {}, { client });
    expect(res.source).toBe("llm");
    expect(client.calls[0].fallbacks).toBe("default");
    expect(client.calls[1]).not.toHaveProperty("fallbacks");
  });

  it("the structured-output schema enforces enums (verbs etc.); a 400 on it falls back to the SDK schema", async () => {
    let n = 0;
    const client = fakeClient(async (p) => {
      n++;
      const schema = JSON.stringify((p.output_config as { format: { schema: unknown } }).format.schema);
      if (schema.includes('"enum":["walk_to"')) throw new Anthropic.BadRequestError(400, { type: "error" }, "enum unsupported", new Headers());
      return okMessage();
    });
    const res = await runDirector({ ...REQ, model: "claude-haiku-5-5" }, {}, { client });
    expect(res.source).toBe("llm");
    expect(n).toBe(2);
    expect(JSON.stringify(client.calls[0].output_config)).toContain('"enum":["walk_to"');
    expect(JSON.stringify(client.calls[1].output_config)).not.toContain('"enum":["walk_to"');
  });

  it("pre-filter hits are merged into rule_hits", async () => {
    const client = fakeClient(async () => okMessage());
    const res = await runDirector({ ...REQ, paragraph: "Masha grabs a knife." }, {}, { client });
    const sent = (client.calls[0].messages as { content: string }[])[0].content;
    expect(sent).not.toMatch(/knife/i);
    expect(res.beatScript.rule_hits.some((h) => h.rule === "no_weapons")).toBe(true);
  });
});
