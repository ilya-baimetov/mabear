# Decision log

One line per decision: date — decision — why.

- 2026-11-05 — Added `creek` and `van` to `MarkId` (spec §6.1 list omits them but §7.2 set table defines them) — keeps the set table and the contract consistent.
- 2026-11-05 — `BeatScript.beats` length (1..14) and `delay_s` range (0..6) enforced by the validator, not zod — keeps the schema strict-mode friendly for structured outputs.
- 2026-11-05 — Added additive contract types: `Remix`, `DirectRequest/Response`, `Timeline`, `FixtureEpisode`, `ActorClip.params.{target,facing,posture,ambient}`, engine `FrameState`/`CharacterRig`/`AudioEngine` (src/engine/api.ts), compiler `CompileOptions/CarryAudio` (src/compiler/types.ts) — subagents integrate against one frozen interface.
- 2026-11-05 — Segment cue times are segment-local; episode time = segment offset + local — makes per-paragraph recompile independent of position.
- 2026-11-05 — Initial world state: Masha at the clearing, Bear on the porch, daytime, props at their homes — simplest neutral start for all fixtures.
- 2026-11-05 — TypeScript 7 / Vite 8 / three 0.187 / zod 4 / SDK 1.5 (latest at install); @playwright/test pinned to 1.63.0 to match the preinstalled Chromium — never run `playwright install`.
- 2026-11-05 — Haiku cache read/write prices assumed 0.1×/1.25× input (spec gives only input/output) — labeled in pricing.ts.
- 2026-11-05 — Video price verified on the Vertex AI pricing page (Veo 3.1 video+audio 720p/1080p "$0.40 / 1 count", read as per generated second; Lite 720p $0.05, 4k $0.60) — replaces the unverified pitch-deck range.
- 2026-11-05 — E2E runs against `wrangler dev` (the real Worker incl. password gate) with MOCK_DIRECTOR=1 and a test-only password instead of plain `vite preview` — exercises auth + /api/direct end to end with no key.
- 2026-11-05 — App state uses a tiny custom store (useSyncExternalStore), no state library — fewer deps, the pipeline stays testable without React.
- 2026-11-05 — A director response without `error` counts as success (ready/adjusted) whatever its `source`; with `error` → status `error` while the offline version keeps playing — matches §4.2 lifecycle and lets mock mode reach `ready`.
- 2026-11-05 — Changing the EN/RU toggle does not re-direct existing paragraphs (only new renders use the new language) — avoids surprise API calls; examples load in the current language.
- 2026-11-05 — Close-up screenshots use a debug camera override (`window.__mabear.closeup`) rather than hunting for a compiled close shot — deterministic screenshots for the likeness review.
- 2026-11-05 — Mock director (MOCK_DIRECTOR=1) answers `source:"offline"`, `model:"mock"`, fake usage, no `error` — the UI derives status from `error`, so mock paragraphs reach `ready`.
- 2026-11-05 — Session cookie = `ts.HMAC(SESSION_SECRET or SHA-256(DEMO_PASSWORD)-derived key, "v1.ts.DEMO_PASSWORD")`, 7 days; `Secure` omitted only on http://localhost for local e2e — spec §11 with a working local test path.
- 2026-11-05 — Login attempts rate-limited to 20 per 10 min per IP (not in spec) — cheap brute-force protection for a public URL.
- 2026-11-05 — SDK 1.5's zod→JSON-schema transform drops enums into descriptions; the worker re-inserts the enums, falling back to the SDK schema on a 400 — keeps verbs/ids constrained.
- 2026-11-05 — Refusal fallback beta sent on non-Haiku models; a 400 switches to the next request shape (remembered per isolate) — spec §8.2's 15-minute box, no live verification possible without a key here.
- 2026-11-05 — Validator errors surviving a second pass count as invalid output → one repair retry → offline — spec §8.1.
- 2026-11-05 — Audio is 100% synthesized (no samples) — faster than the 20-min sample hunt, zero licensing risk; ASSETS.md records "no samples".
- 2026-11-05 — Audio before unlock / without AudioContext does a "dry" pass that only counts cues, switching to real playback once the context runs — headless e2e can assert scheduled counts.
- 2026-11-05 — A dialogue line > 0.3 s in progress at play() is not spoken (TTS can't start mid-word); `speaks:false` characters never get TTS even if a line slips through — canon guard in the engine too.
- 2026-11-05 — Fixtures: grasshoppers/crickets → `night_crickets` even by day; `take` sets both target and item; `cook`/`fish` always preceded by an explicit take; `fish` always lands a catch (rod→fish) — matches the compiler's state rules so fixtures need 0 repairs.
- 2026-11-05 — Likeness references: only 3 images (2019 Russian stamps, Wikimedia Commons) obtainable — Wikimedia rate-limited (429), Fandom 403; not circumvented. Colours sampled from them (Masha's sleeves pale lilac #CFCDE8, not spec pink) — spec says replace defaults with sampled values.
- 2026-11-05 — Character modules export `buildMasha()`/`buildBear()` (not `build()`); the asset manifest maps to them.
- 2026-11-05 — Bear fur = soft geometric noise (shell fur, P1, deferred).
