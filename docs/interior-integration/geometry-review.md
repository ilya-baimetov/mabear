# Interior integration: geometry and staging review

The production builder now uses the reviewed wall-return study geometry. The standalone review model remains unchanged. The runtime set identifies itself as `integrated-interior-v1` / `reviewed-wall-return-04`.

## Integration adjustments

| Element | Runtime change | Reason |
|---|---|---|
| Room shell, fireplace return and wrapping kitchen | Ported reviewed shapes and proportions into production | Replace the old rectangular room rather than leave the work in a preview |
| Reading table | Position follows `HOUSE_READING_TABLE` | Open the chair's approach/exit lane without altering table proportions |
| Right dining chair | Moved to the preparation table's south-west side at local `[-5.05, 2.82]`, facing its table | Clear Bear's stove approach |
| Child cooking helper | Real three-tread support at the prep table, driven by the shared support constants | Match Masha's feet to visible geometry |
| Stove pot | Permanently parked on the left counter under the window | Keep the burner free without a disappearing/reappearing prop |
| Perimeter walls | Only foreground sections cut away when the camera is outside | Preserve the rear wall and flat fireplace return |
| Materials | Warm, continuous colors; textures still deferred | Keep shape/staging review legible; no pink surface patches |

## Iteration 01 adversarial findings

Inspected actual game renders: Cozy Evening English cooking, eating, giving and standing; Kitchen Visit sitting, child cooking and adult sitting/standing. The production house builder has changed since this capture, so these are review findings, not proof of final behavior.

| Finding | Evidence | Follow-up |
|---|---|---|
| A large near dining-chair back hides the child cooking action | `iteration-01/kitchen_visit-04-masha-cook.png` | Chair relocated; verify the new pose and production camera in iteration 02 |
| Bear crowds the helper during the same cooking shot | `iteration-01/kitchen_visit-04-masha-cook.png` | Root is checking actor staging; physical helper exists at the shared support position |
| Masha's seated torso is hidden by the low table and she sometimes appears very low in the cushion | `iteration-01/kitchen_visit-01-masha-sit.png`, `cozy_evening_en-04-bear-give.png` | Table shifted; root is checking seat animation and camera visibility |
| Bear's cooking is photographed predominantly from behind | `iteration-01/cozy_evening_en-02-bear-cook.png` | Camera revision in progress |
| Masha's feet leave the bottom of the frame during chair exit | `iteration-01/cozy_evening_en-05-masha-stand_up.png` | Camera revision in progress |
| Held pancake stack hides much of Masha's hands/body | `iteration-01/cozy_evening_en-03-masha-eat.png` | Root is checking prop pose/height |

The captured room reads as a connected kitchen and living area; the flat return and fireplace/reading-chair/bookcase relationship remain visible. The inspected frames show coherent warm materials and no pink patches. Still images cannot establish absence of temporal wall flicker.

## Geometry verification

`tests/unit/interiorSurfaces.test.ts`: 4 tests pass. Checks cover actual ray intersections across upper/lower wall joins, distinct trim depth, chair/helper support heights, retained fireplace-return geometry during cutaways, fixed countertop pot support, and non-compounding day/night window tint. Runtime batching reduces the port to 85 mesh draws and approximately 197,600 triangles before actors and other stages; actual playback performance must be measured separately.


## Iteration 02 → 03 updates

| Finding | Update | Observed result / remaining boundary |
|---|---|---|
| Near dining-chair back still masked Masha after the first move | Moved it further left along the preparation table's south edge; camera changed to see the working side | `iteration-03/kitchen_visit-04-masha-cook.png` shows hands, pan and helper clearly |
| Bear's lower body and feet passed through the armchair cushion | Added an armchair-only pose profile, pelvis clearance/forward fit and matched thigh/knee flexion; did not resize the chair | `iteration-03/kitchen_visit-detail-2-bear-sit-end.png` shows dangling legs and feet in front of the cushion; this is pose calibration, not soft-body collision simulation |
| Existing Masha seat tests used old room coordinates | Derived the front clearance plane from the actual production chair and advanced her seated fit 3 cm | Strict original feet-in-front/hips-behind checks and facial/skirt checks pass with the new room |
| Stove pot would pop away during cooking | Parked it permanently on the window counter at 1.32 m | Real mesh base support verified; a final stable capture must include this change |
| Helper-supported head gaze used floor-level head height | Added the shared physical helper lift to own and partner gaze-height estimates | Source fixed; final visual pass must include stage eye-target coordinate conversion |
| Seated eating close-up turned behind Masha's hood with Bear in the foreground | Reported to camera/staging owners | Still a visible failure in iteration 03; not approved as final |

The full-room production establishing view in iteration 02 reveals the pantry/fridge, wrapping kitchen, living-room group and entrance together. Iteration 03 confirms the child cooking view and Bear's settled chair pose improved. Final source-stable story playback and revised eating close-up remain the release gate.

## Final pickup contact review → update

Evidence: `pickup-contact-probes/proof.json` samples the production compiler, evaluator, stage, shipped character rigs and props. The nine contact clips include Bear's pan placement and pancake pickup, Masha's pan placement and pancake pickup, and the jar/flour/pan replacement sequence. `pickup-iteration-02/` adds independent side views, which caught physical defects that a small target-error metric alone had missed. `pickup-accepted/` contains the accepted final Bear release/pickup frames and camera.

| Observed defect | Update | Result / evidence boundary |
|---|---|---|
| Ownership changed before a hand reached the resting object | Measured two-bone IK and actual palm/paw-surface contact; lift before carrying inward | Maximum attachment/release target error at exactly 50% is under 0.032 mm in the nine actual-rig contact samples; objects are not translated to disguise missed arm targets |
| Masha's head entered the pancake stack and Bear's paw approached through the table apron | Kitchen pickups use an upright body pose. Acquire the plate at its exposed top lip and jar/flour at their outer sides; move underneath only after lifting. Reverse the same contact for tabletop putdowns | Independent side images accepted the head/food and paw/apron separation; Masha's feet remain on the visible helper. The earlier additional torso lean was removed |
| Deep slots and adult standing positions exceeded real arm reach | Support-prop slots use local X=-3.40; child stance X=-3.22. Adult pickup uses [-2.90,.75], pan placement [-3,3.00], both on the floor | Jar/flour have full support; pancake plate has approximately 5 mm overhang. Pan retains its east-facing handle. Adult final pickup error is 0.0001 mm; pan release error 0.0249 mm |
| Carried props sank into the worktop during the next clip's arm blend | Raise the actual arm while the carried prop overlaps the prep table, allowing for hand thickness and the flour mesh base offset; fade after leaving the table | Pan underside remains at least 1.218 m over the 1.20 m worktop; supported carries also leave room for the palm/paw |
| Bear still held a pan while the same hand acquired pancakes | Compile a visible placement before approaching a different indoor prop; retain old ownership until the placement release | English/Russian regressions verify old pan release, empty-hand approach and new-item attachment. Outdoor replacement behavior is unchanged |
| Newly inserted preparation happened while the camera watched idle Masha | Add actor tracking during the preparation approach/turn, followed by a medium shot of the actual placement | Camera regression verifies that the explicit medium shot covers release; accepted final production frames show the placement and subsequent pickup clearly |
| Exact-origin tests missed visibly invalid body/hand contact | Real-GLB regression now also checks acquisition above the worktop at an exposed side/lip, Masha's face above the pancake stack, carry clearance and deterministic seeking | 42 focused contact/interior tests passed; the final camera-specific rerun passed 10/10. Root owns the final full-suite/build/release checks |

The final contact paths are deterministic and operate on the shipped skeletons and surfaces. They remain authored animation contacts, not a general rigid-body or finger-wrap simulation. The focused preparation-camera capture is accepted. Root owns final full-suite/build checks and stable story playback before release.

## Live seat-entry finding → bounded correction

The live smoke test revealed Masha standing inside the cushion before reaching the accepted seated pose. Read-only comparison of the archived source and the before/after story movies confirmed an inherited cause: the compiler walked to the seat center at floor height, then blended the stand and sit poses in place. The revised chair made this much more conspicuous. Evidence is in `seat-entry-triage/`, including the old and new movies at matching early sit fractions.

| Condition | Correction | Verification |
|---|---|---|
| Standing body entered solid upholstery before sitting | Masha and Bear stop in front of the house armchair, turn while planted, then follow an explicit mounting path | Real-GLB regression checks the pre-sit approach remains outside the actual chair bounds |
| Masha's short standing pelvis was below the cushion | She rises in front before moving back; root travel, pose and camera share one timing function | Throughout the mount, pelvis clearance precedes crossing the cushion front and both feet remain outside it. The accepted final 0.64 m pelvis height is unchanged |
| A former occupant could remain too close to Bear's mounting corridor | Only a free standing participant in that corridor walks to a clear waiting area before Bear approaches | A two-actor regression checks continuous clearance; candidate and route checks include the incoming actor's current position |
| Seeking or changing paragraphs could lose support/mark state | Mount remains a deterministic `sit` path ending at the original semantic seat center | Independent source review confirmed endpoint continuity, retained house mark and repeat-seek equality; 26 focused tests and application typecheck pass |

`seat-entry-check/` shows the corrected early/middle Masha phases. Other furniture postures and the accepted settled armchair poses remain unchanged. Final two-actor midpoint was accepted with Masha 2.368 m away at the safe waiting point and no projection overlap. Root owns final playback/build/release validation.
