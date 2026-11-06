// A separate, private visual edition. The existing Worker retains ownership of
// authentication and the AI key; no credentials are copied into this deployment.
interface Env {
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
      // Forward the original host and cookie: the shared service issues a host-only
      // cookie for THIS edition. Its existing auth and rate limits still apply.
      if (url.pathname.startsWith("/api/") || url.pathname === "/login" || url.pathname === "/logout") {
        return secured(await env.STORY_SERVICE.fetch(request));
      }
      // An authenticated HEAD on the original protected app is an authorization
      // probe. Fail closed on every result other than success; never proxy assets.
      const probe = await env.STORY_SERVICE.fetch(new Request(new URL("/", url), {
        method: "HEAD", headers: { cookie: request.headers.get("cookie") ?? "" }, redirect: "manual",
      }));
      if (probe.status !== 200) {
        if (probe.status === 302 || probe.status === 401 || probe.status === 403) {
          return secured(new Response(null, { status: 302, headers: { location: url.searchParams.get("pitch") === "1" ? "/login?pitch=1" : "/login" } }));
        }
        return secured(new Response("The story playground is resting. Please try again shortly.", { status: 503 }));
      }
      return secured(await env.ASSETS.fetch(request));
    } catch {
      return secured(new Response("The story playground is resting. Please try again shortly.", { status: 503 }));
    }
  },
};
