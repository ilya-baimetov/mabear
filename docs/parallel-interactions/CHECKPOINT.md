# Rapier continuity and individual carrots

Status: **complete, reviewed, verified and deployed on 21 November 2026 after explicit authorization.** Implementation, adversarial updates, actual-editor checks, recordings and full-story performance measurements are complete. Decoded-video review found an obstructed initial ball pickup; its camera-only correction has been inspected and accepted in the final recording. No external-service credits were spent. See the [deployment record](deployment/deployment.json).

Baseline: clean repository commit `d260fe27aad4109461fc023f474d29d3eab6959b`. A runnable source snapshot was preserved at `/tmp/mabear-parallel-before-ne19gsu8`; unchanged runtime assets and installed dependencies are shared with the working checkout.

## Work ownership

| Work | Owner | Boundary |
| --- | --- | --- |
| Rapier continuity | `rapier_continuity_v2` | Physics replay, simple route planning, physical ball retrieval, behavior tests |
| Interactive carrots | `interactive_carrots` | One bed, stable carrot identities, parser/compiler/state/rendering/hand contacts, behavior tests |
| Before/after evidence | `parallel_evidence` | Shared story fixtures, native browser capture, contact and regression checks, comparison media |
| Integration and review | Root | Main editor playback/edit checks, combined validation, adversarial findings and fixes |

## Acceptance

- Masha drops a ball, the ball falls and settles, she routes around a selected solid obstacle and retrieves it at its simulated position.
- A specific carrot is removed from its bed, carried, placed, and retrieved again. Other carrots remain unchanged; no duplicate or automatic replacement appears.
- Pause/resume, reverse/forward seeking, replay, scene preview, and edits/deletion reconstruct the same object ownership and positions.
- Existing cupboard, house entrance, hugs, shoulder rides, and unsupported-story fallback retain their behavior.
- Compare the same authored stories against the baseline. Record the device, rendering performance, capture provenance, and limitations.
- Run an adversarial review, update the implementation, and verify relevant behavior again before reporting completion.

## Constraints

Keep Three.js and the animation system. Physics controls eligible Masha root motion and the released ball; animation controls rigs and held props. Carrots remain animation-owned. No ragdolls, cloth, general actor collision, new locations, external generation, deployment, or automatic publishing.

## Final implementation

- Ball continuity retains a 60 Hz cached trajectory across release, obstacle detour and retrieval at the actual settled position. Animation owns rigs and held props; Rapier owns eligible Masha root movement and the loose ball. Unsupported or unsafe chains fall back atomically before showing physical frames.
- Nine individually identified carrots replace one bed's decorative instances. Pick, carry, place and retrieve preserve the chosen identity; other carrots remain planted. Carrots remain animation-owned. Bench placement has one reserved carrot slot.
- English/Russian offline input, old saves, unavailable objects, occupied hands and occupied placement slots are covered. An independent reviewer reproduced and verified the fix for a compiler prerequisite loop.
- Native staging review moved the carrot row into the soil, adjusted the exposed stem grip, cleared the action cameras, and routed carrot-carrying approaches around the bench.

Final runtime fingerprint: `3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08` (SHA-256 of the sorted `src` file hashes). All final browser evidence must match this fingerprint.

## Verification

The baseline passed all 810 unit tests across 67 files. Local capture uses Chrome with ANGLE Metal on Apple M1 Max. Current app port: 8811; baseline port: 8814.

The final implementation passed **851 tests across 71 files**, TypeScript checks and the production build. The existing large Rapier bundle warning remains. Logs are in `validation/`.

Real main-editor checks passed for both stories: pause/resume, forward/backward seeking, replay, scene preview, content edits, carrot scene deletion and reload. A separately typed ball story passed the offline director and the same transport/edit checks. External APIs were blocked throughout. See `ui/combined-proof.json` and `ui/rapier-parsed-proof.json`.

Native loaded-rig checks passed for ownership transfers, arbitrary seeks, scene/clip boundaries and untouched carrot identities. Exact regression comparisons passed at 324 timestamps across cupboard use, house entry, cooking, hugs and shoulder rides. See `render-check/proof.json`, `regression/proof.json`, and `probes/proof.json`.

## Review and handoff

- [Evidence and comparison player](README.md)
- [Final source, media and result integrity record](verification.json)
- [Adversarial findings and updates](ADVERSARIAL-REVIEW.md)
- [Independent audit and eleven timed input probes](INDEPENDENT-AUDIT.md)
- [Physics ownership and limitations](../rapier-continuity/IMPLEMENTATION.md)
- [Carrot instructions and limitations](../interactive-carrots/README.md)

The final integrity check matched seven evidence files to the current runtime fingerprint, verified complete-story performance durations, matched both video SHA-256 hashes, and checked that both videos decoded, played to the end and sought successfully. Root inspected the final decoded contact sheet and comparison frame. The silent 1× comparisons are `continuity-before-after.mp4` and `carrots-before-after.mp4`; each is approximately 29 seconds.

Full-story playback on Apple M1 Max / Chrome 157 / 1280 × 720 averaged **59.3 fps for the ball** and **59.8 fps for carrots**. Fresh ball-cache preparation took **337 ms after assets/WASM loaded**; this synchronous preparation remains a limitation. The baseline averaged 60.0 and 59.7 fps respectively. See `performance.json` for the exact measurement boundaries.

Recommendation: extend this approach selectively to other loose props and persistent object interactions. Keep deliberate hand actions authored, retain whole-story fallback for unsupported combinations, and improve preparation responsiveness before substantially expanding the physics scope. The current limits include one eligible yard actor/ball, a 60-second continuity cap, one interactive carrot bed, one bench carrot slot, and approximate secondary-character grips.

Release source commit `f1a184807857279e285e1b640c74a46f3c5fc8aa` was pushed to `main` before deploying Worker version `258bc27c-fdfd-4feb-92e2-a7514af8094c`. Fresh production-bundle checks and authenticated live ball/carrot checks passed, including exact bundle hashes; public health and access restrictions passed. The deployment record and updated documentation are maintained on `main`. Every future deployment still requires a separate explicit request.
