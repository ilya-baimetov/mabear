# Moment UI regression review

Reviewed the final moment-authoring UI against the existing engine, Worker, director, audio, and generated-cast contracts. The legacy suites were migrated in place; obsolete block splitting and tap-to-react interactions were replaced with the explicitly approved moment behavior.

## Scope and retained assertions

| Area | Current regression assertion |
| --- | --- |
| Authentication | Unsigned app requests redirect to login; unsigned director requests return 401; signed-in WebGL renders a nonblank frame. |
| Explicit authoring | Typing, blur, selection, and canvas clicks do not direct or start playback. Preview and whole-story actions do. |
| Version isolation | Revising moment 2 makes exactly one director request, increments that version, and preserves every other version. |
| Playback identity | The active tile matches the engine's actual segment; editor selection remains distinct. |
| Incremental preparation | Five dirty moments direct with a maximum of four concurrent requests; playback starts before all finish, waits at the unavailable boundary, and resumes; cached replay makes no further requests. |
| Canon and audio | Bear dialogue is removed; weapons are adjusted; rain and spooky music compile; playback schedules dialogue, foley, and music. |
| Local customization | Selected-moment camera remix makes no director request. Pitch tools and Russian labels remain accessible. |
| Editing and removal | Enter and Shift+Enter remain in one textarea; keyboard preview is explicit; blank editing does not remove a moment; Keep preserves text and confirmed Remove preserves the remaining moment/version. |
| Seeking and fullscreen | Controls remain available in fullscreen; story and moment sliders have correct scope, numeric bounds, and engine positions. Expanded-cast playback also checks pointer seeking. |
| Assets and render | All seven generated character rigs and required set/prop assets load; rig mapping/calibration and Masha's baseline facial/dress assertions remain. Every generated character produces a close-up render without page errors. |
| Performance | Ten actual FPS samples average above 10; draw calls remain below 200. Thresholds are unchanged. |

## Commands and environment

```sh
npx tsc --noEmit -p tsconfig.json
git diff --check -- tests/e2e/app.spec.ts tests/e2e/expandedCast.spec.ts
E2E_PORT=8795 PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/mabear-legacy-moment-8795.json \
  npx playwright test tests/e2e/app.spec.ts tests/e2e/expandedCast.spec.ts \
  --output=.playwright-mcp/legacy-8795 --reporter=list,json

# Focused rerun after tightening the camera-frame assertion:
E2E_PORT=8795 PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/mabear-cast-camera-8795.json \
  npx playwright test tests/e2e/expandedCast.spec.ts \
  --output=.playwright-mcp/cast-camera-8795 --reporter=list,json
```

The Playwright web server builds Vite into `.e2e-dist/8795` and starts the real Worker with `wrangler.test.toml`, `MOCK_DIRECTOR=1`, and test-only authentication secrets. It does not reuse an existing server. Chrome runs headless with SwiftShader, one worker, no retries, at 1440 × 860. The UX agent closed its browser before this run to avoid concurrent GPU workloads. Test screenshots use isolated per-test output paths.

## Results

**The full pair passed 15/15, with zero failures, skips, flaky results, or retries.** TypeScript and the targeted diff check also passed.

| Check | Result | Measured duration |
| --- | --- | --- |
| Fresh-build legacy pair | 15 passed | 666.38 s / 11.1 min overall |
| Build/Worker/test-worker startup | First test began successfully | 3.58 s from Playwright's recorded start; standalone build duration was not separately instrumented |
| App suite | 14 passed | 594.58 s summed test durations |
| Expanded cast | 1 passed | 66.44 s |
| Corrected camera-frame focused rerun | 1 passed | 107.55 s overall; 103.02 s test duration |
| TypeScript / targeted whitespace diff check | Passed | Not timed |

Playwright recorded start `2026-11-06T21:58:30.595Z` and completion `2026-11-06T22:09:36.973Z`. Source was frozen before the fresh build. The command log is `/tmp/mabear-legacy-moment-8795.log`, JSON results are `/tmp/mabear-legacy-moment-8795.json`, and per-test screenshots are under `.playwright-mcp/legacy-8795/`.

The ten-sample playback measurement returned **21.7 average FPS and 93 draw calls**, satisfying the unchanged `>10 FPS` and `<200 draw calls` thresholds. This is current local evidence, not an improvement claim against a prior layout with different stage geometry.

During review, a test-harness precision issue was found: the expanded-cast loop changed the debug camera and captured pixels in the same JavaScript task. The Player applies camera overrides on its animation frame, so that sequence could capture the preceding camera. The test now waits for two animation frames, requires successive close-ups to differ, and saves all seven character renders. App source was unchanged. The corrected case **passed its focused fresh-build rerun, 1/1**; Masha, Lady Bear, and Rosie screenshots were also visually inspected and show the intended distinct characters. Artifacts are under `.playwright-mcp/cast-camera-8795/`, with log/JSON at `/tmp/mabear-cast-camera-8795.{log,json}`.

That focused run separately measured canvas CSS size **954 × 464.90625**, internal size **477 × 232**, device pixel ratio **1**, and quality `{ scale: 0.5, post: 1 }` after garden playback/seek. The internal half resolution accounts for softness in those headless captures; it is not evidence of hardware rendering quality. These values were not captured simultaneously with the earlier FPS sample and must not be treated as its exact rendering configuration.

One display-only app correction followed the full run: the Stage's whole-story label now maps the active segment ID to the actual moment number, so blank moments cannot shift the displayed number. It changes no engine or state behavior. The corrected Stage source was saved at 14:10:30 PST, after the focused rerun's 14:10:21 build, so neither browser result claims coverage of that final label change. Root confirmed `npm run typecheck` (main and Worker) and `npm run build` passed afterward, producing `index-CX5Z7XIi.js`; this reviewer also reran the main TypeScript check successfully. Root reported **547 tests across 32 unit files passed immediately before** that display-only correction; those are separate evidence from this browser run.

## Proof boundary

These checks exercise actual authentication, app state, compilation, loaded GLB assets, WebGL rendering, and browser audio scheduling. Director responses are mocked: this does not establish live model quality, latency, cost, or provider reliability. SwiftShader FPS is local regression evidence, not a hardware or mobile performance benchmark. This review does not deploy or validate a production release. The separate Masha performance preview is outside this migration's write scope; the main application's baseline rig assertions remain intact.

Reviewer assessment: no blocking regression was found in the migrated flows. Preserve the distinction between browser-tested behavior, the final display-only correction, and model/mobile behavior that these checks do not exercise.
