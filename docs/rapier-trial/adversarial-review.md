# Independent adversarial review

Reviewed the in-progress trial independently of its implementer. No production files were edited by the reviewer. The reproducible probes in this directory use the actual compiler, evaluator and Rapier runtime; their ball socket callback is a controlled transform, so they do not establish rendered hand continuity or GPU performance.

## Findings requiring correction

| Priority | Finding | Reproduction/evidence | Required correction |
|---|---|---|---|
| P1 | Physics ownership changes when selecting a moment preview. | `review-probe.ts`: append the first existing Bear's Nap scene to the obstacle scene. At t≈4.4 s the full view places Masha at `[.000255,0,.001977]`, but the first-moment preview puts her at `[.107486,.000051,.202893]`: 0.228 m apart. Full ownership was declined for later `peek`; the prefix independently enabled it. | Derive ownership from the canonical full timeline for every view. Changing preview scope must not change the same prefix's physics. Use the canonical duration for the trial limit too. |
| P2 | The enabled root domain includes elevated supports with no matching colliders. | `review-probe.ts`: a standing yard story at creek `[12,9]` receives `physicsRoot=true`, root y≈0, while the existing stage supplies a 0.25 m footbridge lift there. The new flag suppresses that lift and sinks Masha into the bridge. | Limit physics eligibility to the central supported yard area, or provide the missing support shapes. This is a scope leak; adding all yard colliders is unnecessary for the bounded trial. |
| P2 | Non-grid preview endpoints alter the physics integration history. | `review-extra-probe.ts`: at drop time 2.14731 s the full view has ball y=.8921517408, a preview ending there y=.8923822403, a 0.2305 mm difference. Each preview runs a new shortened last step instead of reading the canonical interpolation. | Share a canonical trajectory or keep identical step/event schedules across preview endpoints. Preserve the existing previous-scene endpoint rendering behavior separately. |

The implementer was notified of these findings before final verification.

## Other checks and bounded limitations

- Rewind through an actual compiler-generated two-drop/retake story matched the forward trajectory except for ≈1e-15 differences at exact grid boundaries. Clamping the interpolation coefficient to `[0,1]` removes the negative-epsilon case. These tiny differences are not visible failures.
- Preview cache eviction and rebuilding produced an identical full FrameState in the independent probe.
- A Hare-initiated hug generates a reciprocal Masha hug and correctly declines root physics; the conservative choreography bypass is intentional, not a missing collision feature.
- The drop sampler reapplies the actual rig from its rest transforms before reading the socket. No obvious last-render feedback is present in that path. Actual browser release continuity still needs visual/geometry verification.
- Reacquiring a simulated ball is intentionally not retargeted to its physical rest point; the compiled semantic pickup can teleport it to the hand. This blocks a broad rollout even if the bounded drop demonstration passes.
- Only the central furniture/ground are modeled; actor-to-actor collision, collision-aware camera/path replanning and universal supports are outside this trial.

## Follow-up verification

The implementer changed ownership to use the canonical timeline, narrowed the covered domain to x ∈ [-3,5], z ∈ [-1,6], and replaced preview-specific worlds with one canonical trajectory. An independent rerun of both reproduction probes confirms:

| Original finding | Rerun result |
|---|---|
| Preview scope changes Masha's root | Maximum difference over the original first-scene sweep is now **zero**. |
| Missing bridge support is overridden | Creek `[12,9]` now declines physics; `physicsRoot` is absent and the existing 0.25 m support lift remains available. |
| Non-grid endpoint integration differs | Full and preview ball transforms now match exactly at 2.01731, 2.14731 and 2.26731 s. |

No remaining blocker was found in those corrected paths. Exact-grid repeated reads still had ≈1e-15 positive-epsilon interpolation differences in a separate two-drop/retake probe; these are visually immaterial, and snapping interpolation to zero within the existing grid epsilon was recommended.

A separate maximum-length supported-idle cold seek took **1,464 ms** in Node on this machine (10,800 steps; 1,397 ms simulation computation). This is a worst-case local latency probe, not browser FPS or a GPU benchmark. Long uncached seeks remain a reason to consider precomputation/worker execution before broader use.

Rendered before/after evidence, loaded-rig hand continuity, ordinary browser Player controls, full tests/build and device GPU performance remain part of the parent task's verification, not conclusions established by these Node probes.

Independent targeted suite: `npx vitest run tests/unit/rapierReplay.test.ts tests/unit/playerPreview.test.ts --maxWorkers=1` — **15 tests passed across 2 files** after the above fixes. This includes the existing real Player preview checks and the new real-WASM behavior checks.

## Rendered evidence review — first capture

Reviewed the actual 1280×720 browser snapshots and capture/UI proof, without launching another browser or load test during capture. The rejected first drop captures are preserved in `iteration-1/after/` and `iteration-1/control/`; the current `after/` and `control/` directories contain the corrected final evidence.

| Evidence | Finding |
|---|---|
| Obstacle at 2.00 s, baseline versus Rapier | Clear improvement: the original frame puts Masha's torso through the bench seat; the Rapier frame keeps her on the near side. |
| Drop control versus Rapier at 2.12/2.30/3.00/4.00 s | Rapier falls and settles while the animation-only control snaps to the semantic resting slot. However, the first Rapier staging deflects the ball off the bench edge through Masha's torso at about 2.3–2.5 s. This is a visible flaw in the chosen demonstration even though actor/ball collision is intentionally excluded. The implementer was asked to extend the new drop gesture clear of the body rather than add general character collision. |
| Existing hug/lift/ride at 36.50/41.00/47.00 s | No visible regression. Camera and pose/contact fields match; only bounding-box floating-point noise up to 5.2×10⁻¹¹ m differed. |
| Ordinary-editor UI proof | Paused and held physical transforms match; forward/rewind/forward settled transforms match; editing increments the revision and clears old samples. No captured browser errors or intercepted service requests. |

The final first-capture ball centre was y=.149931 m for a .15 m radius: supported on the floor within the solver's small tolerance. A negative minimum from a rotated mesh bounding box is not evidence of sphere penetration; the transformed AABB is conservative.

The first capture reports Apple M1 Max through ANGLE Metal, loaded glTF Masha/Bear, no failed requests and no source change during recording. Its warm playback was approximately 60 FPS. The ≈1 FPS mean difference must not be treated as a statistically established physics cost: a cold simulation before the first animation callback can enter the first interval. The reviewer recommended starting the warm benchmark clock inside the first callback.

A replacement capture is required to close the drop-through-body finding. The rejected first capture should be retained separately when the final evidence is replaced.

### Drop-gesture correction

The follow-up working frames (`working/drop-2.png`, `working/drop-3.png`) clear the visible flaw. Masha extends the ball to her side above the bench using the existing procedural arm layer. It then rests beside her rather than deflecting through her torso. The loaded-rig release centre is approximately `[2.0245,.8046,2.8459]`; the bench rest centre is y≈.61993 m, matching the .47 m seat plus .15 m ball radius. This is an appropriate bounded bench-drop demonstration. General ball/actor collisions remain excluded.

The reviewer approved this staging for a matched final recapture. The accepted final recapture is verified below.


## Final visual acceptance

The corrected final `after/drop-2.12.png`, `after/drop-2.30.png`, `after/drop-3.00.png` and `after/drop-4.00.png` show the ball descending beside Masha and settling on the bench, with no visible torso pass-through. The matched animation-only control uses the same extended-arm gesture and camera. The physical ball centre moves vertically from y=.804624 m at release to y=.619932 m at rest; x/z remain stable, and the body reports sleeping by 3 s and stays identical at 4 and 8 s. This closes the visual finding for the bounded bench-drop scenario. The separate ordinary-editor evidence demonstrates a ground drop.

Final `after/proof.json` and `control/proof.json` share source fingerprint `2f464091f07fd8aa364ac68a4b7c2528a26708e4e13e7193d905a2d2a5380b11`. An independent hash check of every recorded source file found **no drift**. Both proofs report **no browser errors and no failed requests**. The final obstacle and unchanged interaction captures remain consistent with the earlier visual review.

Accept the local trial evidence within its stated boundaries. The concrete improvements are obstacle separation and a continuous physical release/fall/contact/settle. It is not evidence for general actor collision, dynamic pickup retargeting, or broad production readiness. No additional heavy tests or browser sessions were launched during performance capture.
