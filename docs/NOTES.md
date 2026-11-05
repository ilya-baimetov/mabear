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
