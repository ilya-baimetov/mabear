# Responsive physics preparation

The main editor now prepares its canonical Rapier trajectory in a dedicated Worker. Three.js rendering, animation evaluation, loaded rigs and existing audio remain in the main app. This changes preparation scheduling, not the physical result or timestamps.

The worker cannot use the loaded Masha rig. When simulation reaches a release with an unknown hand pose, it asks the main thread for that exact frame, caches the resulting ball transform, and rebuilds the deterministic prefix from the beginning. It publishes the corrected timeline and all 60 Hz samples only after the complete story succeeds. Resuming a half-applied world step would be incorrect, hence the bounded restart approach.

The main thread owns animation/rig sampling; Rapier owns supported Masha roots and released ball trajectories. The completed reader combines those samples with ordinary timestamp animation. No authored frame is shown temporarily and then replaced by physics during playback.

| State or action | Behavior |
|---|---|
| New supported story | Hold the last picture and requested time; show “Preparing movement…” |
| Play while preparing | Retain play intent; start clock and audio together after readiness |
| Seek while preparing | Latest requested timestamp wins; remain paused |
| Pause while preparing | Cancel queued play; preparation can still finish for thumbnails/seeking |
| Edit while preparing | Terminate the old worker; ignore stale replies and errors |
| Unchanged source / replay | Reuse completed samples immediately |
| Clear or dispose | Cancel active work and resolve readiness waiters |
| Unsupported kitchen, cupboard, hug or ride | Conservative immediate authored fallback when provable; otherwise full eligibility check in worker |
| Worker failure or timeout | Use authored animation for the entire story; expose reason and `preparation.error` in debug data |

Only one trajectory is retained. Each preparation is limited to 32 loaded-pose requests, 33 deterministic passes and 15 seconds total. Existing 60-second continuity and 180-second simple-story bounds still apply. Main-thread pose work occurs only at release events. It changes CPU-side rig transforms, while the renderer retains its last complete picture; storyboard capture waits for readiness.

The editor uses `createResponsiveStageReplay(stage)`. `createStageReplay(stage)` remains the synchronous diagnostic reference. Debug APIs: `window.__mabear.preparing()` and `window.__mabear.physics()`; the latter includes revision, reason, readiness and preparation wall/worker/pose timings. Tests and captures can await `evaluator.whenReady()` before reading frames. Readiness follows the latest edit, not a stale job.

## Verification and tradeoff

`scripts/physics-preparation-check.ts` runs a native Chrome Worker with the game's loaded Masha rig and the actual compiled 28.689-second drop → obstacle → retrieval story. It blocks external APIs. Final isolated local measurements on Apple M1 Max / Chrome 157 are recorded in [preparation/proof.json](preparation/proof.json); the source was frozen and other automated browser checks were stopped.

| Operation | Total elapsed | Largest main-thread timer gap |
|---|---:|---:|
| Synchronous reference | 442.5 ms | 442.8 ms |
| First worker preparation | 635.9 ms | 6.6 ms |
| Edited story, reused worker | 428.1 ms | 5.6 ms |
| Unchanged story and cached frame | 0.5 ms | 4.6 ms |

The first worker preparation is slower overall because it initializes its own runtime and repeats a prefix. It removes the long UI stall. These measurements freeze rendering to isolate preparation; they do not claim full-game frame rate. Only one loaded pose was requested in this story (3.4 ms total main-thread rig work). Cupboard and paired-interaction fallback returned immediately in 0.5–1.1 ms.

The same browser probe verifies exact synchronous/worker frame parity at non-grid and reverse seeks, rapid edit cancellation, real Player queued play without early audio, latest queued seek (7 → 3.337), and pause/edit/seek leaving playback stopped. Unit checks cover stale result/error callbacks, disposal, timeout, missing Worker support, corrected routes, preview endpoints and ball ownership boundaries. Bench tests also compare serialized readers at placement, nudge and pickup boundaries.

Adversarial review found and fixed two issues: a stale worker error could affect a replacement job, and replacing pending physics with immediate authored playback could schedule audio twice. The existing cupboard fixture also exposed a missed fast-path case (Masha waving to Bear), now covered. Independent physics review found the reader's interpolation and ownership semantics match synchronous playback. No broader engine change or deployment is included.
