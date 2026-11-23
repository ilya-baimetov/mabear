// Best-effort in-memory rate limits (spec §11): per isolate, reset when the isolate is recycled.
// /api/direct: 30 requests / 10 min per session cookie, 200 / hour globally per isolate.

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitConfig {
  perKey: RateLimitRule;
  global: RateLimitRule;
}

export const DIRECT_LIMITS: RateLimitConfig = {
  perKey: { limit: 30, windowMs: 10 * 60 * 1000 },
  global: { limit: 200, windowMs: 60 * 60 * 1000 },
};

/** Login attempts per client IP (brute-force damping; not in the spec, cheap insurance). */
export const LOGIN_LIMITS: RateLimitConfig = {
  perKey: { limit: 20, windowMs: 10 * 60 * 1000 },
  global: { limit: 500, windowMs: 60 * 60 * 1000 },
};

/** Speech generation submissions (POST /api/speech) per session/IP and globally per isolate. */
export const SPEECH_LIMITS: RateLimitConfig = {
  perKey: { limit: 60, windowMs: 60_000 },
  global: { limit: 600, windowMs: 60 * 60 * 1000 },
};

export type RateLimitDecision = { ok: true } | { ok: false; scope: "session" | "global"; retryAfterS: number };

const MAX_KEYS = 5000;

export class RateLimiter {
  private readonly perKey = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly cfg: RateLimitConfig) {}

  /** Records a hit for `key` at `nowMs` if allowed; rejected requests are not counted. */
  check(key: string, nowMs: number = Date.now()): RateLimitDecision {
    const { perKey, global } = this.cfg;
    this.global = this.global.filter((t) => nowMs - t < global.windowMs);
    const hits = (this.perKey.get(key) ?? []).filter((t) => nowMs - t < perKey.windowMs);

    if (hits.length >= perKey.limit) {
      this.perKey.set(key, hits);
      return { ok: false, scope: "session", retryAfterS: Math.max(1, Math.ceil((hits[0] + perKey.windowMs - nowMs) / 1000)) };
    }
    if (this.global.length >= global.limit) {
      return { ok: false, scope: "global", retryAfterS: Math.max(1, Math.ceil((this.global[0] + global.windowMs - nowMs) / 1000)) };
    }
    hits.push(nowMs);
    this.global.push(nowMs);
    this.perKey.set(key, hits);
    if (this.perKey.size > MAX_KEYS) this.prune(nowMs);
    return { ok: true };
  }

  reset(): void {
    this.perKey.clear();
    this.global = [];
  }

  private prune(nowMs: number): void {
    for (const [k, v] of this.perKey) {
      if (!v.some((t) => nowMs - t < this.cfg.perKey.windowMs)) this.perKey.delete(k);
    }
  }
}

export const directLimiter = new RateLimiter(DIRECT_LIMITS);
export const loginLimiter = new RateLimiter(LOGIN_LIMITS);
export const speechLimiter = new RateLimiter(SPEECH_LIMITS);

/** Test hook: clears the module-level limiters. */
export function resetRateLimits(): void {
  directLimiter.reset();
  loginLimiter.reset();
  speechLimiter.reset();
}

export function rateLimitResponse(d: Extract<RateLimitDecision, { ok: false }>): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", scope: d.scope, retryAfterS: d.retryAfterS, message: "Too many stories at once — take a breath and try again soon." }),
    { status: 429, headers: { "content-type": "application/json; charset=utf-8", "retry-after": String(d.retryAfterS), "cache-control": "no-store" } },
  );
}
