# Adversarial review → update

Scope: generated models in the real WebGL scene, story actors, old saved stories, animation, camera, loading/disposal, and the separate Worker. Review performed before deployment; no claim of an independent human review.

| Finding | Update | Evidence |
|---|---|---|
| Rosie was visibly furry, unlike the intended pig | Rejected that surface treatment; smooth-skin reference and one replacement generation within the budget cap | `results/rosie-smooth-job.json`; final smooth-skinned GLB inspected in the running game |
| Masha's dark skirt vertices followed the thighs and split the skirt | Reweighted all magenta skirt vertices, including dark seams, to the pelvis | Actual GLB close-up; generated-rig E2E checks repaired vertices |
| Imported skeleton centimetres caused face framing to crop Masha's hood | Added face anchors measured in world metres and converted into the source bone frame | Actual close-ups of Masha and the added cast |
| Asset loading mutated shared motion dimensions, changing replay depending on timing | Moved measured proportions into a fixed source module shared by compiler and renderer | Deterministic seek tests across the garden episode |
| New bodies changed shoulder-ride clearance | Recalibrated the seat height and raised the carried close-up | Ray-occlusion regression passes |
| A foreground guest could fill the lens during another actor's shot | Moved initial guest positions out of the main foreground; added smooth camera clearance above intervening actors | Clearance unit tests and runtime review |
| Former cabin porch height extended over bare grass at the tree-house | Replaced the broad platform height with the measured small doorstep | Downward GLB raycasts: doorstep ~0.22 m at z=-4.2; grass at z=-3.6 and forward |
| Repeated detailed plant meshes spent excessive triangles | Simplified carrots and daisies; instance shared geometry/materials | Real scene at ~60 FPS locally; final full browser suite 35.6 FPS averaged in headless playback (92 draw calls) |
| New actors could resolve as generic Bear, or pronouns could silently switch actor | Longest-name matching, gender-aware subject carry, EN/RU aliases and compound exclusions | Added actor/parser/old-save tests |
| Old AI backend only understood four actors | New Worker authenticates through original service, directs locally with expanded bible and its own secret | Real Anthropic smoke returned all five new actor IDs; no animal speech |
| Changing unrelated cookies could bypass the new per-session rate limiter | Key limiter by the parsed session cookie; reject cross-origin paid calls | Bridge routing/auth/rate-limit tests |
| Late GLB responses and set disposal could leak textures/materials | Added imported-resource ownership and cleanup, including late-response guards | Type check and runtime asset-loading test |
| The UI and examples still implied only the old cast | Added all nine cast buttons and an EN/RU Garden visitors episode | Browser test loads and plays every new actor |
| Deferred editor focus could move the caret after fast typing started | Preserve the caret when the newly created block is already focused | Targeted editor E2E passes |
| Play was enabled during loading but silently ignored the click | Disable playback until the stage is ready, while still allowing writing | Mobile loading-state inspection |
| New actor auto-shots could fall through to the original leads or a Wolf partner | Dedicated guest framing, appropriate close-shot scale, and guest-inclusive establishing shots | Camera plan and expanded-cast regression tests |
| Hare's carrot close-up showed his back because the camera assumed he faced Masha | Frame guest portraits from their actual heading; score occlusion for the subject actually in frame | Opposite-heading regression and inspected in-game carrot interaction |

Remaining limitations: generated approximations, not studio production assets. Masha has subtle blink/lip deformation; the added animals have skeletal gestures and fixed facial meshes, not production facial rigs. Wolves and several secondary props retain the earlier procedural models. No additional $25 was used or assumed authorized.

## Verification

- TypeScript application and Worker checks passed.
- 527 unit tests in 27 files passed, including guest heading, old-save compatibility, EN/RU names, deterministic motion, camera clearance and Worker routing.
- Full browser suite: 15/15 passed (8.5 minutes), including actual generated GLBs, editor behavior, playback, fullscreen and expanded cast.
- After the final guest-facing camera correction: full unit suite and targeted expanded-cast browser test passed again (1/1, 46.3 seconds).
- Actual Anthropic call: HTTP 200, `source: llm`, all five new actor IDs, animal dialogue absent (`director-smoke.json`). This exercised the exact handler locally using the production key; it is not a claim of an authenticated deployed browser AI test.
- Interactive WebGL review: desktop, 390px mobile, close-ups and 27-second garden episode; no browser errors. Saved actual render screenshots and silent gameplay recording in `proof/`.
- Published-price estimate $15.80; conservative reservations $23.20; actual invoiced fal charges not independently retrieved.

Deployment: `ea262fcb-2e71-4637-b972-d9781f078511` at https://mabear-storybook.ilya-baimetov.workers.dev. Live health and sign-in returned 200; app/model requests without a session redirected to login; unauthenticated director returned 401. Production browser sign-in page inspected. Authenticated production playback/AI remains unverified because the existing demo password was not available in the session. See `release.json`.
