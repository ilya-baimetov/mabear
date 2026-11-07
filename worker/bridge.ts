// A separate, private visual edition. The existing Worker retains ownership of
// authentication. This edition has its own director key and expanded character bible.
import { handleDirect } from "./direct";
import { directLimiter, rateLimitResponse } from "./rateLimit";
import { getSessionCookie } from './auth';
import {handleSpeech,type SpeechEnv} from './speech';
export {MashaSpeech} from './speech';

interface Env extends SpeechEnv {
  ANTHROPIC_API_KEY?: string;
  DIRECTOR_MODEL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  STORY_SERVICE: { fetch(request: Request): Promise<Response> };
}

function secured(response: Response): Response {
  const res = new Response(response.body, response);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return secured(Response.json({ ok: true, service: "mabear-storybook", edition: "codex" }));
    }
    if (url.pathname === "/robots.txt") {
      return secured(new Response("User-agent: *\nDisallow: /\n"));
    }
    try {
      if (url.pathname === '/login') {
        const res = secured(await env.STORY_SERVICE.fetch(request));
        // The shared login always returns to /. Remember this edition's audition
        // destination without modifying the original service or accepting arbitrary URLs.
        if (request.method === 'GET' && url.searchParams.get('next') === 'voice') {
          res.headers.append('Set-Cookie', 'mb_audition_return=1; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax');
        }
        if (request.method === 'POST' && res.status === 303 && res.headers.get('Location') === '/' && /(?:^|;\s*)mb_audition_return=1(?:;|$)/.test(request.headers.get('cookie') ?? '')) {
          res.headers.set('Location', '/voice/');
          res.headers.append('Set-Cookie', 'mb_audition_return=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
        }
        return res;
      }
      // Forward the original host and cookie: the shared service issues a host-only
      // cookie for THIS edition. Its existing auth and rate limits still apply.
      if ((url.pathname.startsWith("/api/") && url.pathname !== "/api/direct" && !url.pathname.startsWith('/api/speech')) || url.pathname === "/login" || url.pathname === "/logout") {
        return secured(await env.STORY_SERVICE.fetch(request));
      }
      // An authenticated HEAD on the original protected app is an authorization
      // probe. Fail closed on every result other than success; never proxy assets.
      const probe = await env.STORY_SERVICE.fetch(new Request(new URL("/", url), {
        method: "HEAD", headers: { cookie: request.headers.get("cookie") ?? "" }, redirect: "manual",
      }));
      if (probe.status !== 200) {
        if (probe.status === 302 || probe.status === 401 || probe.status === 403) {
          if (url.pathname.startsWith("/api/")) return secured(Response.json({ error: "unauthorized", login: "/login" }, { status: 401 }));
          return secured(new Response(null, { status: 302, headers: { location: url.pathname === '/voice/' || url.pathname === '/voice' ? '/login?next=voice' : url.searchParams.get("pitch") === "1" ? "/login?pitch=1" : "/login" } }));
        }
        return secured(new Response("The story playground is resting. Please try again shortly.", { status: 503 }));
      }
      if(url.pathname==='/api/speech'||url.pathname.startsWith('/api/speech/')){
        const origin=request.headers.get('origin');
        if(origin&&origin!==url.origin)return secured(Response.json({error:'origin_not_allowed'},{status:403}));
        return secured(await handleSpeech(request,env));
      }
      if (url.pathname === "/api/direct") {
        if (request.method !== "POST") return secured(Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } }));
        const origin=request.headers.get('origin');
        if(origin && origin!==url.origin) return secured(Response.json({error:'origin_not_allowed'},{status:403}));
        const decision = directLimiter.check(getSessionCookie(request) ?? request.headers.get("cf-connecting-ip") ?? "anonymous");
        if (!decision.ok) return secured(rateLimitResponse(decision));
        return secured(await handleDirect(request, env));
      }
      return secured(await env.ASSETS.fetch(request));
    } catch {
      return secured(new Response("The story playground is resting. Please try again shortly.", { status: 503 }));
    }
  },
};
