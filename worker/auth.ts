// Password gate (spec §11). WebCrypto only; no secrets are ever logged or echoed.
//
// Cookie `mb_session` = `<timestamp>.<hex HMAC-SHA256>` where the HMAC is computed over
// `v1.<timestamp>.<DEMO_PASSWORD>` with SESSION_SECRET as the key (or, when SESSION_SECRET is unset, a key
// derived from DEMO_PASSWORD). Changing either secret invalidates every session.

export const SESSION_COOKIE = "mb_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
/** Tolerated clock skew for timestamps slightly in the future. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface AuthEnv {
  DEMO_PASSWORD?: string;
  SESSION_SECRET?: string;
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(data: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmacHex(keyMaterial: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

async function signingKey(env: AuthEnv): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!env.DEMO_PASSWORD) return null;
  if (env.SESSION_SECRET) return new Uint8Array(enc.encode(env.SESSION_SECRET));
  return sha256(`mabear-session-key:${env.DEMO_PASSWORD}`);
}

/** Constant-time string equality (compares fixed-length SHA-256 digests, so length doesn't leak either). */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

/** Checks a submitted password. Fails closed when DEMO_PASSWORD is not configured. */
export async function checkPassword(env: AuthEnv, submitted: string): Promise<boolean> {
  if (!env.DEMO_PASSWORD) return false;
  return timingSafeEqualStr(submitted, env.DEMO_PASSWORD);
}

/** Creates a session cookie value for `nowMs`. Returns null when the gate isn't configured. */
export async function signSession(env: AuthEnv, nowMs: number = Date.now()): Promise<string | null> {
  const key = await signingKey(env);
  if (!key || !env.DEMO_PASSWORD) return null;
  const ts = String(Math.floor(nowMs));
  return `${ts}.${await hmacHex(key, `v1.${ts}.${env.DEMO_PASSWORD}`)}`;
}

/** Verifies a session cookie value: well-formed, unexpired (7 days), and correctly signed. */
export async function verifySession(env: AuthEnv, value: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  if (!value || !env.DEMO_PASSWORD) return false;
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts)) return false;
  if (nowMs - ts > SESSION_MAX_AGE_S * 1000) return false;
  if (ts - nowMs > FUTURE_SKEW_MS) return false;
  const key = await signingKey(env);
  if (!key) return false;
  const expected = await hmacHex(key, `v1.${m[1]}.${env.DEMO_PASSWORD}`);
  return timingSafeEqualStr(expected, m[2]);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

export function getSessionCookie(req: Request): string | null {
  return parseCookies(req.headers.get("cookie"))[SESSION_COOKIE] ?? null;
}

/** `Secure` is dropped only for plain-http localhost (wrangler dev), where curl would otherwise refuse it. */
function isLocalHttp(req: Request): boolean {
  const u = new URL(req.url);
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
}

export function sessionCookieHeader(req: Request, value: string): string {
  const secure = isLocalHttp(req) ? "" : "; Secure";
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_MAX_AGE_S}; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

export function clearSessionCookieHeader(req: Request): string {
  const secure = isLocalHttp(req) ? "" : "; Secure";
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

export async function isAuthenticated(req: Request, env: AuthEnv, nowMs: number = Date.now()): Promise<boolean> {
  return verifySession(env, getSessionCookie(req), nowMs);
}

// ---------- /login page (minimal, branded, EN/RU, no JS) ----------

export function loginPage(opts: { error: boolean; configured: boolean; pitch?: boolean }): string {
  const msg = !opts.configured
    ? `<p class="err" role="alert">The password gate is not configured yet. · Вход пока не настроен.</p>`
    : opts.error
      ? `<p class="err" role="alert">Oops, that's not the password. Try again! · Ой, пароль не тот. Попробуй ещё раз!</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MaBear · Sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  :root { --forest: #2f6b3a; --leaf: #7fb069; --honey: #f6c445; --cream: #fff8e7; --magenta: #d6246e; --ink: #2b2a28; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: "Nunito", system-ui, sans-serif;
         color: var(--ink); background: radial-gradient(circle at 30% 20%, #fdf1c7 0, var(--cream) 40%, #e3f0d6 100%); }
  main { width: min(420px, calc(100vw - 32px)); background: #fff; border-radius: 28px; padding: 36px 32px 28px;
         box-shadow: 0 18px 40px rgba(47, 107, 58, .18); border: 4px solid var(--honey); text-align: center; }
  h1 { margin: 0; font-size: 44px; font-weight: 900; color: var(--forest); letter-spacing: .5px; }
  h1 span { color: var(--magenta); }
  .sub { margin: 6px 0 22px; font-size: 16px; color: #5b5a55; }
  label { display: block; text-align: left; font-weight: 700; margin-bottom: 8px; }
  input { width: 100%; font: inherit; font-size: 18px; padding: 14px 16px; border-radius: 16px; border: 3px solid var(--leaf); outline: none; }
  input:focus { border-color: var(--forest); }
  button { margin-top: 16px; width: 100%; font: inherit; font-size: 20px; font-weight: 900; padding: 14px; border: 0; border-radius: 18px;
           background: var(--magenta); color: #fff; cursor: pointer; box-shadow: 0 6px 0 #9e1450; }
  button:active { transform: translateY(3px); box-shadow: 0 3px 0 #9e1450; }
  .err { background: #ffe3ec; color: #9e1450; border-radius: 14px; padding: 10px 12px; font-weight: 700; }
  .fine { margin-top: 18px; font-size: 12px; color: #8a877f; }
</style>
</head>
<body>
<main>
  <h1>Ma<span>Bear</span></h1>
  <p class="sub">Write a story, watch it come alive! · Напиши сказку — и она оживёт!</p>
  ${msg}
  <form method="post" action="/login${opts.pitch ? "?pitch=1" : ""}">
    <label for="password">Password · Пароль</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Let's play! · Играть!</button>
  </form>
  <p class="fine">Private prototype — confidential. · Закрытый прототип — конфиденциально.</p>
</main>
</body>
</html>`;
}
