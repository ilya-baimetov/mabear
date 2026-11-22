# Adversarial review — continuity and carrots

Status: **review → updates → final verification complete.** The two implementation agents reviewed each other's changes, while root reviewed integration and the evidence agent measured loaded rigs in actual stories. A separate independent reviewer reproduced and verified the compiler-loop fix and audited the evidence methods; see [their audit](INDEPENDENT-AUDIT.md).

## Review questions

| Risk | Required evidence |
| --- | --- |
| A successful demo depends on a custom initial state | Run the same fixture from regular app defaults through the editor and capture harness |
| The ball snaps to a semantic mark during retrieval | Measure rendered world transforms immediately around attachment and compare pickup target to simulated landing |
| Detouring causes teleportation or skating | Sweep root positions, obstacle clearance, support height and route duration |
| Unreachable or moving ball produces a false pickup | Refuse unsupported continuity coherently; do not partially switch ownership mid-story |
| Seeking or thumbnails alter future physics | Compare shuffled seeks, scene previews, pause/resume, replay and edited timelines |
| Carrot harvesting leaves a duplicate in the bed | Remove the corresponding static instance; verify selected identity is the sole moving object |
| A consumed or held carrot reappears | Exercise repeated pickup, other-actor ownership, consumption and same-ID retrieval |
| Legacy saves gain invalid prop states | Normalize missing carrot identities and preserve existing held/hidden states |
| Parser/compiler support only the test fixture | Exercise natural English/Russian text, explicit numbering, generic selection and placement |
| New state leaks through edits/deletion | Use the actual scene editor and transport, then reload saved story |
| Existing interactions regress | Render cupboard, house entry, cooking, hug and shoulder ride stories |
| Performance appears good only after hidden preparation | Measure initial preparation separately from warmed playback at the same resolution |

## Early findings

1. The original ball-plus-pickup story disables physical ball simulation. This is the primary behavior to replace, not a passing baseline.
2. The default ball slot overlaps the outdoor cooking helper. Resolve the setup or bound the claim explicitly; the end-to-end story must not depend on an impossible initial grab.
3. Legacy `carrot` records can omit the new planted state. Preserve old ownership while mapping initial garden state into the addressable bed.
4. Comparison clips must use the same fixture and ordinary initial world state. A custom initially-held ball is useful as a probe but cannot substitute for the main app story.

## Findings and updates

| Finding | Update and behavior checked |
| --- | --- |
| The initial ball overlapped the cooking helper | Moved its resting slot to clear ground and added a measured initial pickup approach |
| A ground-ball pickup tried to reach under the ball and snapped into the hand | Grasp the exposed top, lift, then transition into the existing carry pose; retain the physical sphere orientation |
| A rotating sphere's mesh origin is not its ground-support point | Navigation and reach use its physical center/support; contact retains the original transform |
| A slow-moving ball could drift between reaching and attaching | Retrieval requires the physical body to be asleep at approach and contact |
| An obstacle detour could exceed the available walking time | Borrow bounded time from the preceding idle without moving the pickup or scene end; fall back coherently when time or reach is insufficient |
| A late invalid pickup could make earlier playback depend on seek order | Validate the complete eligible chain before exposing physical frames; unsupported ownership and paired interactions retain authored playback |
| New continuity eligibility accidentally suppressed ordinary take-then-drop physics | Restored simple drop simulation and added a separate regression case |
| Atomic preparation bypasses the old short background task budget | Explicit 60-second limit for continuity chains; report cold preparation separately. Worker-based preparation remains future work |
| A selected carrot still had decorative geometry at its original position | Replace one bed's decorative instances with independently owned props; check all eight untouched carrots during playback |
| Legacy carrot #1 could regrow after release/throw | Preserve harvested state across all placement paths and legacy-state normalization |
| Generic garden harvesting could retrieve a previously placed bench carrot | Respect the requested source and prioritize the remaining planted crop |
| Literal drop and wait text lacked complete offline support | Added English/Russian recognition and ownership updates; root verified a freshly edited ball story through the offline director |
| Rejected prerequisite pickup could loop indefinitely | Refuse impossible cupboard use before reinserting a pickup; cover eat/give/throw/drop cases |
| An occupied hand could make an inserted carrot pickup fail and retry forever | Refuse the impossible prerequisite while retaining both object identities; add state-keyed retry protection. A separate reviewer reproduced the hang and verified eleven timed direct-text cases after the fix |
| Several carrots could overlap in the bench's limited space | One bench carrot slot; refuse an occupied placement while retaining ownership. Carrot auto-placement obeys the same capacity rule |
| Carrot placement intersected the bench and ground | Calibrated the resting transform to the loaded mesh, including its leaves |
| Readable reach staging put the planted row on the wooden rim | Moved the row into the soil and rechecked exposed grasp contact with the feet outside the raised bed. Root inspected and accepted the native frame; Masha's planted acquisition correction is about 15.8 mm |
| Carrot-carrying walking targeted the bench center and cut its corner on departure | Added bounded front-side approach/departure staging for carrot bench actions; sampled the actual compiled story against the seat footprint |
| Tables and Masha's body obscured the hand action | Use an unobstructed side view for the actual compiler's pickup/placement shots; follow the corrected actor position for ball actions |
| Decoded-video review still found the initial ground-ball pickup behind the table and samovar | Changed only that clearing pickup to a west-side camera. A new actual-story framing/occlusion test catches the old view; root accepted the corrected native frame |
| Splitting an extended camera cue could restart a moving shot | Interpolate each chunk's endpoints and check continuity through the evaluator |
| Nine objects could decode nine copies of one model | Share one loaded static geometry/material/texture while preserving independent nodes; lifecycle tests and native resource inspection pass |
| A failed continuity preparation could keep its background timer running | Stop terminal or nonadvancing preparation. A fake-timer test runs a real failed WASM chain and checks zero pending callbacks and no additional simulation while paused |
| The first performance script measured only the opening eight seconds, excluding the later placement and retrieval | Changed the dedicated measurement to each full compiled story, with cold preparation reported separately; recordings and native correctness checks remain separate evidence |

## Verification boundaries

- Main-editor checks cover default physics, pause/resume, reverse/forward seeking, replay, scene preview, text edits, carrot scene deletion and reload. External API requests are blocked.
- Native checks measure the actual imported rigs and rendered prop transforms at ownership changes. Pose-only unit tests were insufficient: the native sweep found the original hand-contact jumps.
- Final regression comparison passed at 324 sampled timestamps across cupboard use, house entry, cooking, hugs and shoulder rides. Actor poses, hand transforms and relevant object state matched the deployed baseline.
- The initial fishing camera test used fixed timestamps. Improved initial ball pickup changed arrival time; the test now locates the actual pond transition and later reaction, then independently checks visibility throughout those windows.
- Primary ball comparison uses matched authored story scripts through the normal compiler and Player. Separate typed-text verification exercises the editor/director path. Carrot comparison uses parsed English text. No paid director or generation calls are made.
- Final source fingerprints, playback performance, media decoding checks and accepted visual tolerances are recorded with the final evidence. This document does not claim deployment.
- Final combined validation passed 851 tests in 71 files, both TypeScript projects and the production build. Real-editor checks cover both stories, plus the freshly typed ball story. Runtime source fingerprint: `3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08`.
- A separate read-only evidence audit confirmed that the baseline/current fixtures are identical, recordings use wall-clock evaluation, and real Player controls are tested separately. The dedicated `performance.json` is the performance authority; short opening-window benchmarks embedded in capture proofs are incidental diagnostics.
- Cold timing means rebuilding the replay cache after assets and WASM have loaded, not application startup. Render timing measures synchronous CPU/driver submission, not GPU execution. Capture callback counts are not encoded video frame counts; `media-playback.json` records actual decoded media dimensions and duration.
- Final acceptance is recorded in [verification.json](verification.json): seven source-stable proof files, both verified media hashes, full-story performance coverage, successful end playback/seeking, and root's visual inspection of the final decoded frames. No deployment occurred. The ball story's measured 337 ms fresh-cache preparation and Hare's approximately 3.4 cm harvest correction remain explicit limits.
