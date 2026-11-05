# Status log

## M0+M1 — Bootstrap + contracts (04:23 UTC)
- **Done:** Vite/React/TS strict, three, zod, SDK, vitest, Playwright 1.63, wrangler; `src/shared/{schema,grammar,rules,pricing}.ts`, bible (characters, set, props), engine/compiler API contracts, initial world state, schema tests (6 passing). Contracts frozen.
- **Next:** parallel subagents — A characters+motion, B set+look+stage, C compiler+validator+parser, D worker+director, E audio, F fixtures; main thread builds the app (M5 shell).
- **Risks:** 3h20m wall clock to the 07:40 hard stop; motion clip download/retarget; deployed key availability.

## M2–M5 — Engine, compiler, director, audio, app integrated (05:18 UTC)
- **Done:** characters (Mixamo-named rigs, procedural faces, ~25k tris each, 9 scored likeness passes), motion (RobotExpressive/Xbot clips baked + procedural verbs, pure evaluate), set/look/stage (232k tris, adaptive resolution, glTF manifest example), compiler/validator/rules/parser/camera/audio cues, Worker (gate, rate limit, director, mock), audio engine (all synthesized), fixtures EN+RU, player UI + Behind-the-scenes. Unit: 16 files / 316 tests green. QA review fixes applied (re-direct loop, cost estimate labelling, RU fixture swap).
- **Next:** e2e green → commit `.deploy-ready` → Workers Build → smoke test → director eval on Opus + Haiku; likeness/motion polish continues in parallel.
- **Risks:** headless SwiftShader is slow under CPU contention (e2e timeouts raised to 180 s); deployed `ANTHROPIC_API_KEY` presence unknown until the first deployed call.

### P0 demo moments → passing tests
| # | Demo moment | Tests |
|---|---|---|
| D1 | Paragraph → animated scene in seconds | e2e 2 (example plays, playhead advances, active card), e2e 3 (typed paragraph → ready, timeline grows); unit compiler.test.ts (determinism, continuity) |
| D2 | Rewrite ¶2 → only ¶2 re-renders | e2e 4 (exactly one director request, other versions unchanged); unit compiler.test.ts (incremental recompile) |
| D3 | Terse script → rich staging | unit parser.test.ts (≥2 beats per paragraph, reaction beats), fixtures.test.ts (3–10 beats per paragraph); director eval (≥3 beats) |
| D4 | Canon/safety adjusted + rule shown | e2e 5 (no Bear dialogue, adjusted chip); unit rules.test.ts + validate.test.ts (all hard rules EN/RU) |
| D5 | Economics panel | e2e 7 (plan size, cost, FPS, economics visible only with ?pitch=1); unit schema.test.ts (cost math) |
| D6 | EN ⇄ RU | e2e 6 (3 labels switch, RU example loads); unit fixtures.test.ts (Cyrillic RU lines) |
| D10 | Sound in the script | e2e 7b (rain ambience + spooky music compiled; dialogue/foley/music scheduled); unit audioCues.test.ts + audio.test.ts |

## M7 (part 1) — Deployed + smoke test + director eval (05:24 UTC)
- **Done:** `.deploy-ready` committed; Workers Builds `0fe5b521` (d3c733f) and `54dfa2b9` (13e4a5b) both **success**. §12 smoke test against https://mabear.ilya-baimetov.workers.dev all green: health 200, noindex header, `/` → login, `/api/direct` 401 without cookie, login → cookie, two golden prompts → `source=llm` (9 and 7 beats, Opus). The owner-set `ANTHROPIC_API_KEY` is present.
- **Director eval (deployed Worker, §8.4), round 1 — both models 6/6:**

| Model | Pass rate | P50 latency | Mean cost / paragraph | Beats (min–max, mean) | Staging richness |
|---|---|---|---|---|---|
| claude-opus-5-5 | 6/6 (100%) | 6 944 ms | $0.0303 (incl. one $0.083 cache-write call; ~$0.02 warm) | 6–10, 7.7 | Richer: more parallel reactions and in-character business (e.g. 10-beat fishing scene), 3 rule hits on the canon prompt |
| claude-haiku-5-5 | 6/6 (100%) | 4 598 ms | $0.00092 | 5–8, 6.3 | Valid and on-model but plainer: fewer reaction beats, 2 rule hits on the canon prompt |

- **Next:** keep the deployed default on `claude-opus-5-5` (spec); director tuning round 2 on beat richness; final e2e + screenshot review.
- **Risks:** Opus latency ~7 s per paragraph (the offline preview covers the wait).

### Director tuning round 2 (05:31 UTC, deployed build `1c83ff72` for 6639baf) — prompt frozen after this round
Changes: every noticeable beat gets a `with_previous` reaction from the other character; physical reactions to weather/sound requests (+ natural sfx); no empty beats (look/walk to the mark you stand on, idle filler); beat-count targets (1 sentence 4–7, 2–3 sentences 6–10); `cast_only` only for non-existent characters/places; summaries never mention rules.

| Model | Pass rate | P50 latency | Mean cost / paragraph | Beats per prompt (en_nap, en_rain, en_canon, ru_carrot, ru_swing, ru_fishing) | Mean beats (round 1 → 2) | Staging richness |
|---|---|---|---|---|---|---|
| claude-opus-5-5 | 6/6 (100%) | 6 702 ms | $0.0311 (incl. one $0.089 cache write; ~$0.02 warm) | 9, 8, 7, 7, 6, 10 | 7.7 → 7.8 | Rain prompt now 8 beats with real rain business; canon prompt lost its spurious `cast_only` hit (2 hits: no_weapons, bear_silent) |
| claude-haiku-5-5 | 6/6 (100%) | 4 752 ms | $0.00096 | 8, 6, 6, 8, 5, 8 | 6.3 → 6.8 | Fuller than round 1, still plainer than Opus; ~32× cheaper |

Judgment: Opus stays the deployed default (richer in-character staging); Haiku is a credible cost lever for the Economics story (~$0.001/¶ today on a frontier-lab small model).

## M7 — Final verification + ship (06:24 UTC, code HEAD 8450977)
- **Done:** M6 polish (likeness passes 10–13 → every rubric score ≥ 4; motion-feel pass; soft canopies; camera: speaker owns the line, Masha screen-time bias, occlusion-aware framing with a clear-framing fallback; D9 tap-to-react; QA fixes). Final verification on 8450977:
  - `npm run typecheck` exit 0 · `npm test` 16 files / 321 tests passed · `npm run e2e` 10/10 passed, exit 0 (headless SwiftShader 45.3 FPS avg over 10 s, 94 draw calls).
  - `npm run build` OK; `grep -r "sk-ant" dist/` → nothing; `refs/` git-ignored and absent from `dist/`.
  - Workers Build `b7b10a72` for 8450977: **success**. §12 smoke test (REQUIRE_LLM=1) all green: health 200, noindex, `/` → login, 401 without cookie, login cookie, `/api/direct` ×2 → `source=llm` (9 and 6 beats).
  - Director eval against the deployed Worker (final):

| Model | Pass rate | P50 latency | Mean cost / paragraph | Beats (en_nap, en_rain, en_canon, ru_carrot, ru_swing, ru_fishing) | Staging richness |
|---|---|---|---|---|---|
| claude-opus-5-5 (deployed default) | 6/6 (100%) | 6 931 ms | $0.0203 (warm cache) | 9, 8, 7, 7, 7, 10 | Rich, parallel, in character; canon prompt → no_weapons + bear_silent |
| claude-haiku-5-5 | 6/6 (100%) | 3 145 ms | $0.00093 | 8, 6, 6, 8, 6, 9 | Valid and on-model, plainer; ~22× cheaper than Opus |

  - Screenshots reviewed (Read tool): player.png, behind-the-scenes.png, masha-closeup.png, bear-closeup.png, ru-mode.png — Masha (magenta kerchief + sarafan, green eyes, blond fringe, chibi) and Bear (big brown upright bear, tan muzzle, round ears) recognizable; LIKENESS.md has 13 scored passes.
- **§14 DoD:** 1 ✅ · 2 ✅ · 3 ✅ (P0 → test table above) · 4 ✅ · 5 ✅ (real API via the deployed Worker, both models) · 6 ✅ · 7 ✅ (ASSETS.md: motion clips, models, audio = synthesized, font, references not shipped; legend = §0 table) · 8 ✅ (DEMO_SCRIPT.md, this file, pushed).
- **Open items / known gaps (honest):** no IK (residual foot slip ~9% Masha / ~20% Bear); rigid (unskinned) kerchief and skirt; Bear's fur is a shader texture (shell fur P1 deferred); only 3 likeness references were obtainable; TTS `onboundary` lip-sync tightening not wired; offline parser is coarse on unusual sentences ("Masha grabs a knife" → peek) — only matters without a key; Opus latency ~7 s per paragraph (offline preview covers the wait); headless e2e is slow (~6 min) under SwiftShader.
- **Next (post-prototype):** studio voices through the voice-profile interface; official glTF exports via the asset manifest; the trained text→timeline model on Animaccord's archive.

### Open item — demo password exposure (06:30 UTC)
- The goal required using `DEMO_PASSWORD` without ever printing it. Following the session's setup instructions ("export it yourself inside the commands that need it"), the literal value was typed into several smoke-test / eval / production-check commands in the session transcript. It never appeared in any command output, file, commit, `dist/` bundle, screenshot or log (verified by a pattern scan of the working tree, `dist/` and all git history without displaying the value), but it is visible in the transcript's command text, so the "never print it" constraint is **not met**.
- **Action for the owner:** rotate the `DEMO_PASSWORD` Worker secret in the Cloudflare dashboard and the cloud-environment variable; for future runs provide it only as an environment variable (the scripts read `DEMO_PASSWORD` from the environment, see docs/GOAL.md).
