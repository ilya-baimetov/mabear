# Animation performance and resource review

Independent focused review of the current `generated.ts`, `generatedFace.ts`, `sourceContacts.ts`, `squirrelBind.ts`, asset factory and stage teardown. No GPU/browser capture was used, avoiding contention with the actual-story recording.

## Finding and update

| Finding | Evidence | Resolution |
|---|---|---|
| Generated skeletons were not disposed during stage teardown | `generatedRig.dispose()` released geometry/materials/textures but omitted the skeleton; `Skeleton.computeBoneTexture()` creates a separate texture resource. The new Squirrel bind also uses this disposal path. | Added a deduplicated skeleton disposal pass. `generatedLifecycle.test.ts` loads the actual Bear GLB, adds a second mesh sharing its skeleton, allocates its bone texture and verifies one skeleton/texture disposal and a cleared bone-texture reference. Test passes. |

The repaired Squirrel's discarded source geometry/skeleton is never rendered/uploaded and has no live owner after factory construction. Materials and textures retained by the repaired mesh stay owned by the returned rig; they must not be disposed during rebinding. The new facial lid geometry/material and blink shader hook have explicit teardown.

## CPU measurements

[Raw benchmark](performance-benchmark.json). Five batches of 60 precomputed frames after 60 warmup frames, using actual GLBs/procedural wolves and the production rig/face/contact functions on this host. Values below are median milliseconds per actor update. This is a Node CPU microbenchmark, not a browser FPS measurement, and does not include WebGL rendering, UI work or slower devices.

| Actor | Authored clap pose | Clap with surface contact | Idle with continuously changing blink | Holding flowers with changing blink |
|---|---:|---:|---:|---:|
| Bear | 0.093 | 1.860 | 0.706 | 0.840 |
| Lady Bear | 0.090 | 2.408 | 0.708 | 0.878 |
| Hare | 0.089 | 1.673 | 0.705 | 0.778 |
| Rosie | 0.084 | 2.651 | 0.683 | 0.842 |
| Squirrel | 0.090 | 0.629 | 0.707 | 0.721 |
| Rival Bear | 0.084 | 2.685 | 0.711 | 0.888 |
| Wolf A | 0.120 | 1.268 | 0.130 | 0.180 |
| Wolf B | 0.123 | 1.287 | 0.131 | 0.183 |

All eight simultaneous claps sum to approximately 14.46ms of CPU rig work before rendering in this synthetic case. Source-surface fitting is the expensive path; it skins 536–3,736 selected hand vertices repeatedly for support/refitting and diagnostics. This is a concrete optimization target for large ensemble scenes, but the benchmark alone does not demonstrate a playback failure in the shipped stories. Actual browser capture telemetry remains the release evidence for those stories.

A future optimization should reuse evaluated post-solve hand positions for the contact-plane/pad-overlap diagnostics and recycle scratch vectors. It must preserve whole-hand extrema and the current contact tests; indiscriminate vertex decimation could reintroduce claw/palm interpenetration. No contact-sampling change was made during this review.

Eyelid geometry skips rebuilding when closure is unchanged. The deliberately changing-blink benchmark is therefore higher than ordinary idle time. Squirrel construction measured approximately 595ms including local GLB parsing and the anatomical rebind; it runs once per stage, not per animation frame. Baking that repair into a versioned asset would reduce future startup work, but was not required to validate this release.

## Verification

- The new actual-GLB shared-skeleton lifecycle test passes.
- Main/Worker TypeScript validation and a final full-suite run are performed by the release owner after all review fixes.
- No paid services, generated assets or external account state were used/changed by this review.

## Additional contact correction requested during review

Implemented a narrow `sourceContacts` put-down path while the release owner fixed the Masha counterpart and QA implemented reachable story staging. It derives the right-paw target from the real resting prop origin, rotation and grip point, fits the actual skinned palm, and eases from/to the authored arm pose. The same target persists after attachment clears, so ownership changes do not snap the empty paw away. Four surface-refit iterations keep the tested release origin within 1mm, including Rival Bear's mixed wrist/forearm skin weights. Stage owns elevated-ground coordinate conversion.

Eight actual-cast regression cases in `sourceContacts.test.ts` cover a **synthetic reachable target** relative to each measured right shoulder: less than 1mm release gap, matching prop rotation, exact geometry across the ownership switch, continuity across ±100μs around release, and exact authored entrance/exit. These tests establish the contact solver, not the compiler's reachability policy. The complete source-contact suite currently passes 18 tests, including the release owner's fishing boundary test; TypeScript passes. Actual compiled-story target reachability remains part of QA/review before deployment.

[Measured arm geometry](arm-reach-measurements.json) records each of the nine production skeletons' neutral-idle right shoulder, elbow and wrist positions, upper/lower lengths and character height. It was supplied to QA because a shared chest-center target is not reachable for every character: short arms and wide shoulders require actor-specific placement. The benchmark earlier in this document predates the short put-down path and does not quantify its additional solve cost.

### Final compiled-story gate

The compiler's actor-specific approach and low-target crouch/hand-orientation corrections have now been tested through the actual story evaluator and production rigs. `storyPutDownCast.test.ts` passes **10 tests**: each of the nine actors takes flowers and claps, plus Masha's actual pancake-story frying pan release. All release origins are within **1mm** of the prop renderer's independent `restPlacement` transform, with matching rotation and an observed attached→resting ownership change. The tests also check the right paw/socket across ±100μs around release, the authored put-down entrance/exit, and exact seek restoration. Stage support-height conversion is included. The combined compiled-cast and Masha-performance run passes **23 tests**; main/Worker TypeScript and diff checks pass.

This closes the numerical reachability gate noted above. Actual story renders remain necessary for body/furniture intersections and the appearance of the crouch; these numerical tests do not replace QA's visual recording.
