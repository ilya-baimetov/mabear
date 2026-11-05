// MaBear Worker (spec §11–12): password gate, robots, rate limits, /api/direct, static assets.
// Never imports React or Three.js. Never logs or echoes secrets.
import { checkPassword, clearSessionCookieHeader, getSessionCookie, isAuthenticated, loginPage, sessionCookieHeader, signSession } from "./auth";
import { directLimiter, loginLimiter, rateLimitResponse, type RateLimiter } from "./rateLimit";
import { handleDirect, type DirectorDeps } from "./direct";

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
  ANTHROPIC_API_KEY?: string;
  DEMO_PASSWORD?: string;
  SESSION_SECRET?: string;
  DIRECTOR_MODEL?: string;
  MOCK_DIRECTOR?: string;
}

export interface WorkerDeps {
  director?: DirectorDeps;
  directLimiter?: RateLimiter;
  loginLimiter?: RateLimiter;
  now?: () => number;
}

const ROBOTS_TAG = "noindex, nofollow";
const NO_STORE = "no-store";

function withSecurityHeaders(res: Response): Response {
  // Asset responses can have immutable headers → copy.
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", ROBOTS_TAG);
  if (!out.headers.has("referrer-policy")) out.headers.set("Referrer-Policy", "same-origin");
  return out;
}

function jsonResponse(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": NO_STORE, ...extra } });
}

function redirect(location: string, status = 302, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { location, "cache-control": NO_STORE, ...extra } });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": NO_STORE } });
}

function clientKey(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

async function readPassword(req: Request): Promise<{ password: string; wantsJson: boolean }> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const body = (await req.json()) as { password?: unknown };
      return { password: typeof body?.password === "string" ? body.password : "", wantsJson: true };
    } catch {
      return { password: "", wantsJson: true };
    }
  }
  try {
    const form = await req.formData();
    const v = form.get("password");
    return { password: typeof v === "string" ? v : "", wantsJson: false };
  } catch {
    return { password: "", wantsJson: false };
  }
}

async function handleLoginPost(req: Request, env: Env, deps: WorkerDeps): Promise<Response> {
  const limiter = deps.loginLimiter ?? loginLimiter;
  const decision = limiter.check(clientKey(req), deps.now?.());
  if (!decision.ok) return rateLimitResponse(decision);
  const { password, wantsJson } = await readPassword(req);
  const ok = password.length > 0 && password.length <= 512 && (await checkPassword(env, password));
  const value = ok ? await signSession(env, deps.now?.()) : null;
  if (!value) {
    return wantsJson ? jsonResponse({ ok: false, error: "invalid_password" }, 401) : redirect("/login?error=1", 303);
  }
  const cookie = sessionCookieHeader(req, value);
  return wantsJson ? jsonResponse({ ok: true }, 200, { "set-cookie": cookie }) : redirect("/", 303, { "set-cookie": cookie });
}

async function route(req: Request, env: Env, deps: WorkerDeps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/health") {
    return jsonResponse({ ok: true, service: "mabear" });
  }
  if (path === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (path === "/login") {
    if (req.method === "POST") return handleLoginPost(req, env, deps);
    if (req.method === "GET" || req.method === "HEAD") {
      return htmlResponse(loginPage({ error: url.searchParams.has("error"), configured: !!env.DEMO_PASSWORD }));
    }
    return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
  }
  if (path === "/logout") {
    return redirect("/login", 303, { "set-cookie": clearSessionCookieHeader(req) });
  }

  // ---- everything below requires a valid session ----
  const authed = await isAuthenticated(req, env, deps.now?.());
  if (!authed) {
    if (path.startsWith("/api/")) return jsonResponse({ error: "unauthorized", login: "/login" }, 401);
    return redirect("/login", 302);
  }

  if (path === "/api/direct") {
    if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "POST" });
    const limiter = deps.directLimiter ?? directLimiter;
    const decision = limiter.check(getSessionCookie(req) ?? clientKey(req), deps.now?.());
    if (!decision.ok) return rateLimitResponse(decision);
    return handleDirect(req, env, deps.director);
  }
  if (path.startsWith("/api/")) return jsonResponse({ error: "not_found" }, 404);

  return env.ASSETS.fetch(req);
}

/** Builds the fetch handler (tests inject fresh limiters / a fake Anthropic client). */
export function createHandler(deps: WorkerDeps = {}) {
  return async function fetch(req: Request, env: Env): Promise<Response> {
    let res: Response;
    try {
      res = await route(req, env, deps);
    } catch {
      res = jsonResponse({ error: "internal_error" }, 500);
    }
    return withSecurityHeaders(res);
  };
}

const handler = createHandler();

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handler(req, env);
  },
};
