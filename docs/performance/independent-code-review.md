# Independent code review — Masha performance checkpoint

Reviewed 2026-11-06 against the working tree. Scope: candidate facial reconstruction, contacts, frame compatibility, recording, and private-preview routing. The main application still uses the baseline rig unless `mashaPerformance` is explicitly enabled. No deployment, paid generation, or full end-to-end suite was run by this reviewer.

## Findings and disposition

| Priority | Finding | Reproduction / proof | Disposition |
|---|---|---|---|
| P2 | Reconstructed face ignored actor fades. The body became translucent while replacement lips, eyes, lashes, brows and mouth stayed opaque. | Loaded the actual shipped GLB; applied opacity 0.5. Replacement material opacity was 1. | Fixed by parent: all owned facial materials now follow opacity and depth-write policy. Regression covers 0.5 → 0 → 1. |
| P2 | Root-fixed contact targets became unreachable in seated, sleeping and carried poses. | Actual GLB, six sampled times per verb. Before correction, maximum lollipop wrist errors were 193 mm sitting, 190 mm sleeping and 140 mm carried; clap separation errors were 85, 115 and 73 mm. These are numerical checks at the normalized one-metre scale, not surface-collision measurements. | Fixed by parent: measured shoulder-relative goals and torso-relative orientation. The retained regression now passes a 1 mm tolerance for idle/eat/clap in stand/sit/sleep/carried. |
| P2 | Recording leaked its canvas stream and failed to restore renderer dimensions if encoder construction/start failed. Exceptions in a later animation frame could leave the recording promise pending. | Injected encoder construction/start errors: stream track `stop()` was never called. Original initialization and first tick ran before the cleanup `try/finally`. Later ticks had no rejection path. | Fixed in `performance/capture.ts`: acquisition is covered by cleanup; tick exceptions reject; outstanding animation frames are canceled; active encoder and tracks are stopped; renderer size, pixel ratio and camera aspect are restored. |

## Verification

Commands completed successfully:

```sh
npx vitest run tests/unit/mashaPerformanceCapture.test.ts tests/unit/mashaPerformance.test.ts tests/unit/mashaContacts.test.ts tests/unit/bridge.test.ts
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.performance.json
```

The targeted run passed 15 tests across four files. New tests use the actual `public/assets/generated/masha.glb`, decoded by GLTFLoader and sharp; a pixel-only canvas shim supports the real facial texture bake. They do not render WebGL and do not establish visual quality.

| Concern | Evidence | Boundary |
|---|---|---|
| History dependence | Neutral idle after eat → clap → hold → idle exactly matches its initial object world matrices, position buffers and morph influences. | This is a sampled scene-history sequence, not every possible episode. |
| Posture contacts | Idle/eat/clap at 0, 0.3, 0.7, 1.5, 2.3 and 3 seconds pass the 1 mm contact tolerance in four postures. | Wrist/palm targets do not prove absent hand/body penetration, finger contact or visual likeness. |
| Unreachable / degenerate IK | Existing focused tests preserve bone lengths and finite transforms for a far target, shoulder target and collinear pole. | Non-finite targets and malformed ActorFrames are outside those tests. |
| Recorder failures | Constructor, start, later render-tick and encoder-event failures release resources; the latter cancels a queued RAF. | Browser-specific codec availability still requires the actual browser smoke test. |
| Recorder success | Mock recorder returns its Blob through the unchanged API, traverses face → hold → clap, and restores the viewer after the final frame. | The mock proves control flow and cleanup, not the contents or encoding quality of a browser video. |
| Facial resource ownership | Source inspection finds stable geometry buffers during updates; owned meshes, deduplicated materials, and both baked textures are disposed. | No GPU heap profile was performed. Failed partial initialization and the existing loader's ImageBitmap/skeleton lifetime were not broadened into this checkpoint. |
| Privacy | Preview delegates authorization to the existing bridge, uses `run_worker_first = true`, and inherits private/no-store and noindex headers. Five bridge tests cover denied assets, service failure, valid session, login and logout. | The subagent did not verify a deployed hostname or Cloudflare binding. Public health/robots responses intentionally expose no asset content. |

## Remaining constraints

- The facial reconstruction is authored for the shipped Masha asset at height 1. Hardcoded facial regions, indexed geometry, UVs, skinning and named bones are prerequisites; this is not a generic retopology adapter.
- The animation API trusts valid ActorFrames. `NaN` times, non-finite look targets, invalid emotions and malformed source geometry are not sanitized here. Do not describe the current tests as malformed-input hardening.
- The preview's original `browser-checks.json` predates the fixes above. Regenerate browser evidence after the final geometry changes; prior passing numbers do not validate the new teeth, seams, contacts or render appearance.
- Unit tests and authorization review support a private comparison checkpoint. They do not establish production facial quality, every gameplay posture/transition, zero mesh penetration, speech synchronization or mobile performance.

Reviewer judgment: the three reproduced code defects have targeted regression coverage and pass after correction. The remaining release decision depends on the actual rendered comparison and fresh browser evidence. Keep the candidate opt-in until that review is complete.
