# Story continuity and individual carrots

**Deployed on 21 November 2026 after explicit authorization.** Release source `f1a1848` was pushed to `main` before publication; see the [deployment and live verification record](deployment/deployment.json). No paid generation or external-service credits were used.

Reviewed runtime source fingerprint: `3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08`. Final project validation: 851 tests across 71 files, TypeScript checks and production build passed; see the review record for the exact checks.

Open [the comparison player](index.html). Both recordings use the same authored story on the preserved deployed source and the updated source. Playback is 1×; the shorter version holds at each scene boundary. The ball comparison uses identical BeatScripts to isolate rendering/physics behavior. A separate plain-text ball story was tested through the real editor's offline director. The carrot story uses ordinary numbered-carrot text.

| Story | Visible result | Ownership |
|---|---|---|
| Ball | Masha drops a ball, it falls and settles, she travels around the bench and retrieves it at the actual landing point | Rapier: eligible yard root/collision and released ball. Animation: pose, grasp, held ball and camera |
| Carrot number 2 | Pick from the front bed, carry, place on bench, leave, retrieve the same object; eight other carrots remain planted | Animation and object-state tracks; each of nine carrots has its own identity |

## Evidence

- [Ball before/after](continuity-before-after.mp4) and [carrots before/after](carrots-before-after.mp4).
- [Before provenance and full timelines](before/proof.json): runtime source fingerprint `72324214eb4c98e1e6d64a1255b12fc04428b5a0610898c90849ff0152e00c77`, from deployed source contained in commit `d260fe27aad4109461fc023f474d29d3eab6959b`.
- [After capture provenance](after/proof.json): source fingerprint, stability check, native renderer, exact compiled timelines, frame timings and errors.
- [Rendered behavior checks](render-check/proof.json): transfer continuity, reverse seek, scene/clip boundaries, and untouched-carrot identity.
- [Real editor controls](ui/combined-proof.json) and [typed-text ball story](ui/rapier-parsed-proof.json): pause/resume, forward/backward seeking, replay, scene preview and content edits through the main application.
- [Existing interaction regression comparison](regression/proof.json): 324 sampled timestamps, comparing actor poses, rendered roots/right hands, door/cupboard state and jar ownership against the deployed source.
- [Native rig/staging probes](probes/proof.json): alternate-actor carrots, readable action cameras and Fishing Trip still fishing from the pier into the pond.
- [Adversarial review → updates](ADVERSARIAL-REVIEW.md).

The recordings sample compiled timelines at wall-clock time through the game's actual evaluator and Three.js stage. Native Player controls are verified separately in the real editor; this is not a standalone physics scene. API requests are blocked during verification. Audio is muted in recordings to make the visible changes easier to judge.

## Measured behavior

The final ball pickup handoff moves the rendered ball origin about **1.4 mm** across the ±1 ms attachment interval; its initial pickup and drop are below 0.2 mm. The first planted carrot pickup is about **15.8 mm**; bench placement and retrieval are below 1 mm. These are measured geometry transitions, not visual perfection claims. Every untouched carrot preserved its position, rotation and visibility in the sampled story.

Bear and Hare were also checked on planted carrot number 3: their measured transfer gaps were about 0.03 mm and 33.6 mm. Hare retains a small visible handoff gap; his contact needs further tuning. This is a targeted scale check, not a claim that all characters and all surfaces have been polished.

## Performance

The dedicated [performance.json](performance.json) is the sole performance authority: each measurement covers the entire compiled story, including the final retrieval. Cold preparation measures a fresh replay cache after assets and WASM are loaded; it is not application startup. The short five-second benchmarks embedded in capture proof are diagnostic only. Device: Apple M1 Max, native ANGLE Metal renderer, Chrome 157, 1280 × 720 drawing buffer. The measurement uses one headed browser process; its source fingerprint and stability flag identify the tested build. Frame gaps are browser animation-frame intervals; render timing is CPU/driver submission, not GPU execution time. Recording/compositor frame counts count animation callbacks; browser playback frame counters and container durations are in [media-playback.json](media-playback.json).

| Story/version | Full story measured | Mean frame rate | Fresh cache preparation | Frame gap p95 |
|---|---:|---:|---:|---:|
| Ball — before | 24.82 s | 60.0 fps | 3.1 ms | 17.5 ms |
| Carrots — before | 22.21 s | 59.7 fps | 2.4 ms | 17.4 ms |
| Ball — after | 28.55 s | 59.3 fps | 337.0 ms | 17.5 ms |
| Carrots — after | 28.41 s | 59.8 fps | 3.3 ms | 17.6 ms |

Warmed evaluator p95 was at most 0.6 ms; CPU/driver render submission p95 was at most 6.4 ms. The material cost is the ball story’s 337 ms fresh-cache preparation. Broader integration should remain selective until longer-story preparation is improved.

## Limits

- Physics remains bounded to eligible central-yard Masha/ball stories and simple selected obstacles. Hugs, shoulder rides, other actors and unsupported stories retain animation ownership.
- Ball continuity preflights its canonical trajectory before showing frames; a chain that cannot settle/reach safely falls back coherently. Continuity preparation is limited to stories up to 60 seconds. Cold preparation remains synchronous; warmed playback uses cached results.
- Carrots cover nine identified objects in one front bed. They do not provide arbitrary vegetable simulation, soil physics or universal object affordances.
- Hare's planted-carrot pickup has a remaining approximately 3.4 cm handoff gap. Masha is the primary verified interaction; Bear was also verified. Other character/surface combinations remain approximate.
- Existing asset, face and general camera quality outside the specific action shots is unchanged. No phone compatibility claim is made.

## Reproduction

From the project root, run the local Vite server on port 8811 using `scripts/staging-interactions.vite.ts`. Preserve commit `d260fe2`'s `src`, `scripts`, `tools` and build configuration in a temporary baseline folder, sharing the unchanged `public` assets and `node_modules`; serve that folder on port 8814. Copy only `parallel-interactions-fixtures.ts` and the new harness files into the baseline, never the changed runtime source. Store its path in the ignored `baseline-path.txt`.

```sh
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-capture.ts before
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-capture.ts after
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-render-check.ts
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-regression.ts
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-probe.ts
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-performance.ts
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-package.ts
node node_modules/tsx/dist/cli.mjs scripts/parallel-interactions-media-check.ts
```

The compositor uses native browser video playback and MediaRecorder, without generated footage, retiming, remote services or additional packages. Run performance measurements after other browser tests/builds have stopped.
