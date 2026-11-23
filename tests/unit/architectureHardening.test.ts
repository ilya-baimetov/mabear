import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";
import { MashaSpeech } from "../../worker/speech";
import bridge from "../../worker/bridge";
import trialWorker from "../../worker/trial";
import { handleDirect, runDirector, setRefusalFallbackEnabled, setStrictEnums } from "../../worker/direct";
import { resetRateLimits } from "../../worker/rateLimit";
import { initialWorldState } from "../../src/compiler/worldState";
import { restHeightAt } from "../../src/shared/yardLayout";
import { FIXTURES } from "../../src/director/fixtures/index";
import type { BeatScript, DirectRequest, DirectResponse } from "../../src/shared/schema";

const ORIGIN = "https://storybook.example";

function memoryState() {
  const data = new Map<string, unknown>();
  let tail = Promise.resolve();
  const storage = {
    async get(key: string | string[]) {
      return Array.isArray(key)
        ? new Map(key.filter((k) => data.has(k)).map((k) => [k, structuredClone(data.get(k))]))
        : structuredClone(data.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      for (const [k, v] of typeof key === "string" ? [[key, value]] : Object.entries(key)) {
        data.set(k as string, structuredClone(v));
      }
    },
  };
  const state = {
    storage,
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      const work = tail.then(fn);
      tail = work.then(
        () => undefined,
        () => undefined,
      );
      return work;
    },
  } as unknown as DurableObjectState;
  return { data, state };
}

const speechPost = (text: string, lang = "en") =>
  new Request(`${ORIGIN}/api/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ text, lang }),
  });

const VALID_BS: BeatScript = {
  summary: "Masha waves at Bear",
  time_of_day: null,
  mood: "playful",
  music: { mood: "playful", intensity: "soft", change: "start" },
  ambience: ["birds_day"],
  beats: [
    { actor: "masha", verb: "wave", target: "bear", item: null, line: null, emote: "giggle", sfx: null, emotion: "happy", with_previous: false, delay_s: 0, shot: "auto" },
    { actor: "bear", verb: "nod", target: "masha", item: null, line: null, emote: "chuckle", sfx: null, emotion: "happy", with_previous: true, delay_s: 0.3, shot: "auto" },
  ],
  rule_hits: [],
};

const REQ: DirectRequest = {
  lang: "en",
  paragraph: "Masha waves at Bear.",
  previous: [],
  worldState: initialWorldState(),
  episodeId: "ep-hardening",
  paragraphId: "p1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRateLimits();
});

describe("architecture hardening: worker/speech.ts", () => {
  it("returns 400 invalid_request instead of 500 when JSON body is null", async () => {
    const { state } = memoryState();
    const worker = new MashaSpeech(state, { FAL_KEY: "test-only" });
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/speech`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: "null",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("submits distinct lines concurrently without head-of-line blocking while deduplicating identical concurrent lines", async () => {
    const { state } = memoryState();
    let resolveSlowA!: (res: Response) => void;
    let slowAStartedResolve!: () => void;
    const slowAStarted = new Promise<void>((r) => {
      slowAStartedResolve = r;
    });
    const slowAPromise = new Promise<Response>((r) => {
      resolveSlowA = r;
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body)) as { prompt: string };
      if (parsed.prompt === "Slow line A") {
        slowAStartedResolve();
        return slowAPromise;
      }
      return Response.json({
        request_id: "req-b",
        status_url: "https://queue.fal.run/fal-ai/minimax/requests/req-b/status",
        response_url: "https://queue.fal.run/fal-ai/minimax/requests/req-b",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const worker = new MashaSpeech(state, { FAL_KEY: "test-only" });

    let aResolved = false;
    const pA1 = worker.fetch(speechPost("Slow line A")).then((r) => {
      aResolved = true;
      return r;
    });
    const pA2 = worker.fetch(speechPost("  Slow   line A "));
    await slowAStarted;

    // Line B starts while line A's upstream fetch is still pending — must complete before A resolves
    const resB = await worker.fetch(speechPost("Fast line B"));
    expect(resB.status).toBe(202);
    expect(aResolved).toBe(false);
    const bodyB = (await resB.json()) as { status: string; id: string };
    expect(bodyB.status).toBe("pending");

    // Now unblock line A and verify both identical A requests deduplicated to 1 POST
    resolveSlowA(
      Response.json({
        request_id: "req-a",
        status_url: "https://queue.fal.run/fal-ai/minimax/requests/req-a/status",
        response_url: "https://queue.fal.run/fal-ai/minimax/requests/req-a",
      }),
    );

    const [resA1, resA2] = await Promise.all([pA1, pA2]);
    expect(resA1.status).toBe(202);
    expect(resA2.status).toBe(202);
    const [bodyA1, bodyA2] = (await Promise.all([resA1.json(), resA2.json()])) as [{ id: string }, { id: string }];
    expect(bodyA1.id).toBe(bodyA2.id);

    const prompts = fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { prompt: string }).prompt);
    expect(prompts).toEqual(["Slow line A", "Fast line B"]);
  });
});

describe("architecture hardening: worker bridge, rateLimit & trial", () => {
  it("adds security headers to trial /api/health, omits Secure cookie over http, returns JSON 503 on /api/ error, and limits POST /api/speech", async () => {
    const health = await trialWorker.fetch(new Request("https://trial.example/api/health"), {
      ASSETS: { fetch: vi.fn() },
      STORY_SERVICE: { fetch: vi.fn() },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(health.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(health.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(health.headers.get("Cache-Control")).toBe("private, no-store");

    const httpLogin = await bridge.fetch(new Request("http://localhost:8787/login?next=voice"), {
      ASSETS: { fetch: vi.fn() },
      STORY_SERVICE: { fetch: async () => new Response("login") },
    });
    expect(httpLogin.headers.get("set-cookie")).toContain("mb_audition_return=1");
    expect(httpLogin.headers.get("set-cookie")).not.toContain("Secure");

    const apiFail = await bridge.fetch(new Request(`${ORIGIN}/api/speech`), {
      ASSETS: { fetch: vi.fn() },
      STORY_SERVICE: {
        fetch: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(apiFail.status).toBe(503);
    expect(await apiFail.json()).toEqual({ error: "service_unavailable" });

    const stub = vi.fn(async () => Response.json({ status: "pending", id: "a".repeat(64) }));
    const ns = { idFromName: () => ({}), get: () => ({ fetch: stub }) } as unknown as DurableObjectNamespace;
    const env = {
      ASSETS: { fetch: vi.fn() },
      STORY_SERVICE: { fetch: async () => new Response(null, { status: 200 }) },
      MASHA_SPEECH: ns,
    };
    for (let i = 0; i < 60; i++) {
      const ok = await bridge.fetch(
        new Request(`${ORIGIN}/api/speech`, {
          method: "POST",
          headers: { origin: ORIGIN, cookie: "mb_session=speech-cap-test" },
          body: JSON.stringify({ text: `Line ${i}`, lang: "en" }),
        }),
        env,
      );
      expect(ok.status).toBe(200);
    }
    const limited = await bridge.fetch(
      new Request(`${ORIGIN}/api/speech`, {
        method: "POST",
        headers: { origin: ORIGIN, cookie: "mb_session=speech-cap-test" },
        body: JSON.stringify({ text: "Line 61", lang: "en" }),
      }),
      env,
    );
    expect(limited.status).toBe(429);

    // GET /api/speech/status/:id is NOT subject to POST speechLimiter
    const statusOk = await bridge.fetch(
      new Request(`${ORIGIN}/api/speech/status/${"a".repeat(64)}`, {
        method: "GET",
        headers: { cookie: "mb_session=speech-cap-test" },
      }),
      env,
    );
    expect(statusOk.status).toBe(200);
  });
});

describe("architecture hardening: worker/direct.ts", () => {
  it("tracks preferred request shape per model so claude-haiku does not alter claude-opus trying fallback: true first", async () => {
    setRefusalFallbackEnabled(true);
    setStrictEnums(true);

    const calls: { beta: boolean; model: unknown; fallbacks?: unknown }[] = [];
    const client = {
      messages: {
        parse: async (p: Record<string, unknown>) => {
          calls.push({ beta: false, model: p.model });
          return {
            stop_reason: "end_turn",
            stop_details: null,
            parsed_output: VALID_BS,
            usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            model: String(p.model),
          };
        },
      },
      beta: {
        messages: {
          parse: async (p: Record<string, unknown>) => {
            calls.push({ beta: true, model: p.model, fallbacks: p.fallbacks });
            return {
              stop_reason: "end_turn",
              stop_details: null,
              parsed_output: VALID_BS,
              usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
              model: String(p.model),
            };
          },
        },
      },
    } as unknown as Anthropic;

    const haikuRes = await runDirector({ ...REQ, model: "claude-haiku-5-5" }, {}, { client });
    expect(haikuRes.source).toBe("llm");
    expect(calls[0]).toEqual({ beta: false, model: "claude-haiku-5-5" });

    const opusRes = await runDirector({ ...REQ, model: "claude-opus-5-5" }, {}, { client });
    expect(opusRes.source).toBe("llm");
    expect(calls[1]).toEqual({ beta: true, model: "claude-opus-5-5", fallbacks: "default" });
  });

  it("rejects oversized Content-Length before buffering body and formats dynamic timeout messages", async () => {
    const textSpy = vi.fn(async () => "{}");
    const req = {
      method: "POST",
      headers: new Headers({ "content-length": String(200_000 * 4 + 1) }),
      text: textSpy,
    } as unknown as Request;
    const oversize = await handleDirect(req, {});
    expect(oversize.status).toBe(400);
    expect((await oversize.json()).error).toBe("body_too_large");
    expect(textSpy).not.toHaveBeenCalled();

    const slowClient = {
      messages: { parse: () => new Promise(() => {}) },
      beta: {
        messages: {
          parse: (_p: unknown, opts?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts?.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
            }),
        },
      },
    } as unknown as Anthropic;
    const timedOut = await runDirector(REQ, {}, { client: slowClient, timeoutMs: 25 });
    expect(timedOut.source).toBe("offline");
    expect(timedOut.error).toContain("25 ms");
  });
});

describe("architecture hardening: src/shared/yardLayout.ts", () => {
  it("computes restHeightAt accurately for the beehive stump and symmetric opposite point", () => {
    expect(restHeightAt(10.2, -9.1)).toBe(0.5);
    expect(restHeightAt(10.2, 9.1)).toBe(0);
  });
});

describe("architecture hardening: src/app/store.ts", () => {
  it("recovers cleanly from corrupted localStorage ('null' cache and invalid episode) and increments timelineRevision monotonically", async () => {
    const lsMap = new Map<string, string>([
      ["mabear.cache", "null"],
      ["mabear.episode", "{not valid json"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => lsMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsMap.set(k, v);
      },
      removeItem: (k: string) => {
        lsMap.delete(k);
      },
    });

    vi.resetModules();
    const persistence = await import("../../src/app/store/persistence");
    expect(persistence.cacheLoad()).toEqual([]);
    expect(persistence.cacheGet("missing")).toBeNull();
    expect(persistence.restoreEpisode()).toBeNull();

    const { store } = await import("../../src/app/store");
    expect(store.getState().paragraphs).toEqual([]);
    expect(store.getState().timelineRevision).toBe(1);

    // Invalid shape (non-array paragraphs / wrong types) also recovers cleanly
    lsMap.set("mabear.episode", JSON.stringify({ episodeId: 123, paragraphs: "bad" }));
    expect(persistence.restoreEpisode()).toBeNull();

    const sampleDirect: DirectResponse = {
      beatScript: VALID_BS,
      source: "llm",
      latencyMs: 12,
      usage: null,
      model: "claude-opus-5-5",
    };
    expect(() => persistence.cachePut("k1", sampleDirect)).not.toThrow();
    expect(persistence.cacheGet("k1")).toEqual(sampleDirect);

    const revisions: number[] = [store.getState().timelineRevision];
    store.loadFixture(FIXTURES[0]);
    revisions.push(store.getState().timelineRevision);

    const firstId = store.getState().paragraphs[0].id;
    store.deleteParagraph(firstId);
    revisions.push(store.getState().timelineRevision);

    store.undo();
    revisions.push(store.getState().timelineRevision);

    store.redo();
    revisions.push(store.getState().timelineRevision);

    store.recompile();
    revisions.push(store.getState().timelineRevision);

    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i]).toBeGreaterThan(revisions[i - 1]);
    }
  });
});
