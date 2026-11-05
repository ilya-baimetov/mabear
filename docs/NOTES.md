# Decision log

One line per decision: date — decision — why.

- 2026-11-05 — Added `creek` and `van` to `MarkId` (spec §6.1 list omits them but §7.2 set table defines them) — keeps the set table and the contract consistent.
- 2026-11-05 — `BeatScript.beats` length (1..14) and `delay_s` range (0..6) enforced by the validator, not zod — keeps the schema strict-mode friendly for structured outputs.
- 2026-11-05 — Added additive contract types: `Remix`, `DirectRequest/Response`, `Timeline`, `FixtureEpisode`, `ActorClip.params.{target,facing,posture,ambient}`, engine `FrameState`/`CharacterRig`/`AudioEngine` (src/engine/api.ts), compiler `CompileOptions/CarryAudio` (src/compiler/types.ts) — subagents integrate against one frozen interface.
- 2026-11-05 — Segment cue times are segment-local; episode time = segment offset + local — makes per-paragraph recompile independent of position.
- 2026-11-05 — Initial world state: Masha at the clearing, Bear on the porch, daytime, props at their homes — simplest neutral start for all fixtures.
- 2026-11-05 — TypeScript 7 / Vite 8 / three 0.187 / zod 4 / SDK 1.5 (latest at install); @playwright/test pinned to 1.63.0 to match the preinstalled Chromium — never run `playwright install`.
- 2026-11-05 — Haiku cache read/write prices assumed 0.1×/1.25× input (spec gives only input/output) — labeled in pricing.ts.
