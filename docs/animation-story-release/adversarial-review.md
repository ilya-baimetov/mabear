# Independent adversarial release review

Review basis: current production changes against `8bda87e`, actual source GLBs, compiled English fixtures, final facial/contact renders and actual-story QA evidence. Reviewer did not implement the runtime. Initial review found three release-blocking animation defects despite the midpoint/contact suites passing. These are bounded quality failures, not security issues.

| Finding | Severity | Reproduction and observed defect | Required update |
|---|---|---|---|
| R1 — fishing IK switches abruptly | P2 | `fishing_trip`, Bear, `fish` start at 17.485s. Across ±0.0001s the right wrist jumps **0.660m** and rod socket **0.867m**; left wrist moves 0.00019m. At 70% of the fish clip the evaluator changes held rod to caught fish and both solvers disengage: right wrist jumps **0.522m**, left **0.444m**. | Blend both arm chains from the authored pose, and release IK before the actual prop-change event, not merely the nominal clip end. Preserve midpoint two-paw contact. Test actual boundaries. |
| R2 — Masha clapping bypasses body crossfades | P2 | `pancake_morning`, first clap at 4.4s and later clap at 41.559s. At ±0.0001s wrists jump **0.16–0.23m** on entry and approximately **0.16m** on exit. `mashaContacts` applies full two-arm IK immediately, overriding the evaluator's continuous body pose. | Add time-derived authored-pose → IK entrance and exit weights, with a full-weight contact hold. Inspect analogous candy hold/eat transitions. |
| R3 — the new set-down teleports its prop | P2 | `pancake_morning`, new reverse-`take` clip before the last clap, release at 41.159s. The held frying-pan origin is **0.846m** from the final table slot immediately before the ownership event. Reversing the generic arm pose does not reach the table, and the compiler gives it no placement target. State-only tests pass while the pan disappears from the hand and reappears on the table. | Stage the actor and hand toward the actual resting transform, transfer ownership only at that contact, and retain the released-hand pose across the event. Add a physical origin/contact boundary check. |

Numeric evidence: [initial clip boundaries](review-boundaries-before.json), [initial fishing catch boundary](review-midfish-before.json). Reproduction scripts are retained locally under `.scene-proof/review-boundaries.ts` and `.scene-proof/review-midfish.ts`; they load the real GLBs and evaluate the actual compiled fixture at both sides of each boundary. Differences are world-space measurements in meters, not pixel estimates.

## Positive verification and explicit limits

- Inspected the source-preserving face shader, geometric lids, deterministic expression-weight replay, Squirrel anatomical rebind and disposal path, source-paw calibration, seat-exit state/camera changes and their tests. No additional concrete lifecycle or deterministic-seek defect was found in that inspection.
- Reviewed final Bear, Rosie and Squirrel facial renders, repaired Squirrel jump, Hare/Bear opposed-paw contacts, Masha plate support and chair-exit images. The rendered contacts read more correctly than the earlier thumb-edge claps; the seat exit clears the cushion; the plate now sits on the palm.
- Facial quality remains constrained by the source sculpts. Squirrel's baked brows/fur are angular; Masha's rebuilt mouth patch has a visible color/geometry seam under the indoor lighting; generated animal mouths remain closed sculpts. These are disclosed asset/topology limits, not evidence of production-quality lipsync.
- The initial final-story sweep sampled seven compiled timelines and restored 15 exact rig signatures with no page errors or finite-transform failures. Those checks did **not** exercise sub-frame entry/ownership transitions and therefore did not catch R1–R3. Midpoint pose validity must not be used as proof of continuous playback.

## Update verification

Independent rerun after corrections:

| Finding | Initial defect | Updated measurement across the same ±0.0001s boundary | Status |
|---|---|---|---|
| R1 fishing entrance | Right wrist 660mm; rod origin 867mm | Wrists below 0.187mm; rod origin 0.149mm | Corrected |
| R1 catch handoff | Wrists 522mm and 444mm | Both below 0.013mm | Corrected |
| R2 Masha clap entrance/exit | Wrists 160–230mm | Entrance at most 1.675mm; exit below 0.083mm | Clap corrected |
| R2 candy hold entrance/exit | Eating entry wrist/candy jump 73/103mm; eating exit 160/207mm | Entry 0.043/0.050mm; exit 0.062/0.078mm | Corrected |
| R3 Masha set-down | Pan origin 846mm from destination | Pan origin gap 0.01090mm; release wrist transition below 0.001mm | Corrected |
| R3 other cast set-down | `take flowers; clap` leaves a 986–1481mm release gap across six generated animals | All six generated actors below 0.020mm | Corrected |

Evidence: [repeat clip boundaries](review-boundaries.json), [repeat catch boundary](review-midfish.json). At the catch event the socket represents a different held object, so its raw before/after origin difference is not an arm-continuity measurement.

The R2 follow-up found and then verified the correction to the same hard IK switch in candy tasting: [initial candy boundaries](review-candy-boundaries-before.json), [corrected candy boundaries](review-candy-boundaries.json). This uses actual compiler input, not isolated rig calls.

The first R3 update fixed the exact Masha fixture but not the newly introduced generic behavior. An independent compiled `take flowers; clap` story reproduces unreachable set-downs for all six generated animals: [cast release measurements](review-cast-putdown-before.json). That version only staged Masha; the correction now stages actors at reachable low/raised surfaces and supplies a target-aware crouch. The independent original six-actor reproduction now passes: [corrected cast release measurements](review-cast-putdown.json). Inspected the corrected Hare/Squirrel side-view phases at 30/50/70% in `proof/ground-release-review`: the head counterrotation avoids the rejected faceplant and no stretched arm/tail sheets appear.

## Final rendered gate and deployment recommendation

**Recommend deployment of this bounded animation release.** R1–R3 are resolved, and the corrected output was checked from the delivered MP4 rather than only fresh still renders.

- The final [actual-story MP4](proof/final/actual-story-animation.mp4) decoded through all 41.926633 seconds: 1,258 decoded frames, zero dropped frames in the QA review browser, and normal end-of-playback. [Decode evidence](proof/final/video-review/review.json).
- Independently inspected its full decoded contact sheet and individual frames around pan release (12.19/12.29s), the following clap (13.04s), fishing entry/hold/catch (23.79/24.972/26.69/26.79s), Masha clap (3.5/4.152s), Hare release/clap (37.39/37.49/38.24s) and Squirrel release/clap (39.99/40.09/40.84s). The pan stays on the bench across ownership transfer; flowers stay on the ground while the actors rise to clap; the repaired crouches retain head clearance. [Decoded sheet](proof/final/video-review/full-sequence-contact-sheet.png).
- The separately labelled [facial diagnostic MP4](proof/final/diagnostic-story-faces.mp4) decoded completely (17.163267 seconds, 496 decoded frames, zero dropped), and its decoded sheet was independently inspected across all nine actors. The final proof-only camera follows each measured eye axis for frontal inspection, with a neutral background; it preserves the actual story poses and does not change product rendering. These diagnostic views are distinct from the story camera. [Face decode evidence](proof/final/face-video-review/review.json).
- Independently ran `storyPutDownCast.test.ts`: **10/10 pass**, covering all nine actors and the actual Masha pancake release, including rotation, ownership, sub-frame continuity and seek restoration. Independent numeric reproductions still pass for fishing, clap and candy boundaries.
- The separate [performance/resource review](performance-review.md) also found and corrected shared-skeleton bone-texture disposal, with an actual-GLB lifecycle regression test. No runtime code was authored by this reviewer.

This recommendation applies to the reviewed stories and regression cases. It does not certify arbitrary prop/furniture combinations, eliminate source mesh coarseness, add full animal mouth interiors, or repair the older rod-to-caught-fish prop exchange/foreground camera occlusion. The main release owner retains the final build/E2E and authenticated live-deployment checks.
