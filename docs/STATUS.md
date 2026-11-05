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
