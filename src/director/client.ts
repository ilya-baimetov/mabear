// Browser client for POST /api/direct (spec §8.1). Never throws for HTTP errors: a non-2xx or malformed reply
// becomes an offline-parser DirectResponse with an `error` string. A network failure or abort DOES throw, so the
// caller keeps its offline preview (and can tell a cancelled call apart).
import { DirectResponseSchema, type DirectRequest, type DirectResponse } from "../shared/schema";
import { parseParagraph } from "./offline/parser";

export const DIRECT_ENDPOINT = "/api/direct";

/** True when the reply means the session expired / is missing (the UI may send the player to /login). */
export function isUnauthorized(res: DirectResponse): boolean {
  return typeof res.error === "string" && res.error.startsWith("http_401");
}

function offlineReply(req: DirectRequest, error: string, startedMs: number): DirectResponse {
  let beatScript: DirectResponse["beatScript"];
  try {
    beatScript = parseParagraph(req.paragraph, req.lang, req.worldState);
  } catch {
    beatScript = {
      summary: req.paragraph.slice(0, 140), time_of_day: null, mood: "playful",
      music: { mood: "playful", intensity: "soft", change: "continue" }, ambience: null,
      beats: [{ actor: "masha", verb: "idle", target: null, item: null, line: null, emote: null, sfx: null, emotion: "neutral", with_previous: false, delay_s: 0, shot: "auto" }],
      rule_hits: [],
    };
  }
  return { beatScript, source: "offline", latencyMs: Math.round(Date.now() - startedMs), usage: null, model: "offline-parser", error };
}

export async function directParagraph(req: DirectRequest, signal?: AbortSignal): Promise<DirectResponse> {
  const started = Date.now();
  // fetch() rejects on network failure / abort → propagate (caller falls back to the offline preview).
  const res = await fetch(DIRECT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    credentials: "same-origin",
    signal,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    body = null;
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : res.statusText;
    return offlineReply(req, `http_${res.status}: ${msg}`, started);
  }
  const parsed = DirectResponseSchema.safeParse(body);
  if (!parsed.success) return offlineReply(req, "bad_response: the director reply did not match the contract", started);
  return parsed.data;
}
