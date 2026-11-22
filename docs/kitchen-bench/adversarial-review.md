# Independent adversarial review

Reviewer: `kitchen_bench_adversarial`, separate from the implementation owners. Reviewed `codex/kitchen-bench-continuity` against baseline commit `0a81ce43861dd3bc1a1fce2f751940d6f31dcbad`.

Final camera/contact acceptance uses runtime fingerprint **`6b059a3ed328acb504fc5d48d2729ddcbaa7ae2846857d2907ddf27599bf2fea`**. Independent camera proof is stable with **0** browser errors. Full-resolution reach, release and withdrawal frames are visually accepted: no paw/arm disappears through the pot or reappears across its wall. Small measured fur/shoulder rim contacts remain and are disclosed below; **strict zero-intersection acceptance did not pass**. Complete encoded-media review, performance and the final integrated regression run remain separately owned by the parent reviewer and recorded in their manifests. No deployment is authorized.

Complete-video review reopened the initial midpoint-only acceptance. It exposed an unprotected 250ms pre-pot turn, pre-bowl turn and sub-millisecond camera seams. A complete travel sweep then found several offscreen approaches. Once those cameras showed the whole action, previously hidden paw/forearm penetration became visible. The additional review and corrections are recorded explicitly below; clear contact midpoints alone were insufficient evidence.

## Findings → updates → verification

| Finding | Initial failure | Update | Final verification |
| --- | --- | --- | --- |
| Authored bench fallback buried the rotated sphere | Plain-text place → nudge/wait → wait produced ball bottom **−0.244243m**, persisting into the next scene. | Derive mesh origin from rotated physical centre; persist origin and quaternion. | Independent 0.021s samples: minimum bottom −2.8×10⁻¹⁷m; boundary origin difference 1.1×10⁻¹⁶m and quaternion-angle difference 3×10⁻⁸rad. Numerical noise only. |
| Ideal solver tests missed unreachable native bench release | Actual rig triggered `held ball does not reach the bench surface`; placement jumped **0.271377m**. | Correct near-side slot, stance, elevated hand target, lean and gaze; retain strict guard. | Final EN/RU stories use physics with **no fallback**, retain impulse/acquisition records and measure **4.4µm** placement and **2.2µm** final pickup discontinuities. Bench still inspected. |
| Bear snapped carrot out of bowl | Actual ownership transfer jumped **0.148784m** despite correct logical identity. | Correct stance/lean and loaded-hand reach; align carrying/resting origins. | Native bowl pickup **14.2µm**; Masha deposit **27.9µm**; updated Bear pot release **27.8µm**. Same carrot #2 persists. |
| Clear root path still intersected rendered kitchen/body | Original 0.87m aisle: tabletop intersections at **4/7** coarse samples; midpoint skin penetration about **5.4cm**. Wider routing alone still clipped forearms, belly and hip skin. | Diagnose skin weights, tuck carrying paws, shift shared table/helper/slots **0.55m** total, adjust stance/chair and centre route. | Dense loaded-skin checks at intervals ≤0.1s found **0** tabletop, visible stove-barrel or central-firebox intersections. Exact final frame/vertex counts are in the regression manifest; they change slightly with the safer pot stance. Bounded to tested rig/route. |
| Kitchen travel camera hid action behind walls/table | Initial route samples were almost entirely occluded. | Compile wide interior travel camera. | Final midpoint independently inspected: Bear, aisle and destination visible. |
| Shared layout changes exposed contract regressions | Parent's broad suite found container stances inside furniture, mismatched bench rest slot and adult pan set-down on child's helper. | Derive standing/rest marks from shared placements; restore adult floor stance relative to shifted helper. | Parent confirms **895/895 tests in 75 files**, app/Worker typecheck and production build on final source. Independent native pan probes confirm Bear root **y=0**, Masha helper root **y=0.8m**. Production-editor proof is recorded separately. |
| Final still review exposed hidden bowl contact and overlapping food props | At source `9481d226`, Bear's head hid the bowl pickup; the bowl hid Masha's pancake pickup and physically overlapped the old food slot. | Change compiled bowl camera to west-south; move food work slots 0.27m within helper support, clear of bowl/pan; update Bear's food approach and tucked elbow. | Independently inspected final native bowl pickup and both child/adult pancake pickups: hands/food visible and separate. Final six-story regression still passes. Owner's actual-mesh clearance test includes pan handle and requires >4cm separation. |
| Contact-midpoint checks missed whole-action camera failures | The pot preparatory turn cut behind a wall/pipe. Masha's garden→door and kitchen→bowl travel, Bear's doorway→bowl travel and initial bowl→pot travel were partly or wholly offscreen. | Protect the immediate pre-contact turn and join rounded cue seams; frame complete paths and track the carried-carrot house approach. | Final **389** loaded-mesh travel samples: none completely outside view and none below 25% projected-vertex coverage. All four scenes' cue boundaries inspected at ±50µs; complete travel overview at ≤0.5s and pot action at 0.1s. **245** tail frames have identical forward/reverse state. |
| Visible pot approach/withdrawal passed through solid geometry | Original paw/forearm passed visibly through pot wall and counter; native skin confirmed persistent overlaps. Later corrections left an intermediate arm penetration up to about **8mm**, still treated as a blocker. | Retreat stance 21cm; use reachable raised carry and near-side approach; retain a fixed measured palm point and retract above the rim, outward, then to idle. | Final **82** samples / **1,391,130** loaded vertices: no sampled arm/forearm/hand or counter/cabinet intersections. Remaining head-fur **≤2.094mm**, shoulder **≤0.107mm** rim contacts are visible-review accepted as slight grazing. No claim of mathematically disjoint meshes. |

Correct item IDs, ideal solver targets and clear root coordinates did not establish convincing loaded-character behavior. These fixes were accepted after native measurements and selected image inspection.

## Actual-story regression

Reproduce with `npx tsx scripts/kitchen-bench-regression.ts`, AFTER server at 8821 and immutable baseline at 8822. Loaded Three.js stage; native Chrome 157 / ANGLE Metal / Apple M1 Max; 1280×720 buffer. All `/api/` requests blocked; no credits used.

| Story | Samples | Comparison | Result |
| --- | ---: | --- | --- |
| Nap/hammock, hug and shoulder ride | 115 | Exact visible roots, authored bones, loaded head/hands/feet, object states, prop poses/owners | **0 differences** |
| Entry and door close | 36 | Same exact comparison | **0 differences** |
| Fishing | 110 | Same exact comparison | **0 differences** |
| Cupboard retrieval | 49 | Changed route; compare holding/posture and visible prop ownership sequences; inspect critical stills | Sequences match |
| Cozy evening: Bear cooking/serving | 124 | Intended layout/route changes; compare semantics and pan release | Sequences match; release **25.0µm**, baseline **24.8µm**; floor y=0 |
| Masha cooks, sets down pan, takes pancakes | 45 | Same checks plus actual helper support | Sequences match; release **16.5µm**, baseline **16.7µm**; helper y=0.8m at release and all three cooking samples |

**261 exact visible-pose samples** are unchanged. All six stories retain compressed actor holding/posture and prop ownership/visibility sequences. Comparison excludes stale contact diagnostic objects and transforms of invisible props, which retain values between unrelated stories and are not rendered state. Kitchen positions/timing intentionally differ with the shared layout changes.

Compact evidence: [regression/proof.json](regression/proof.json), whose source fingerprint and raw SHA256 identify the exact integrated run. Ignored full evidence is `iteration-regression-current/proof-full.json`. The script reproduces both and fails if source changes during capture, a strict pose differs, ownership sequence changes, kitchen skin intersects, helper support is lost, or either pan handoff exceeds 5mm/loses owner transfer/support. Independently inspected frames:

- `regression/after-kitchen-route-7-0.490.png`
- `regression/after-childCooking-1-masha-1-take.png` — pan release/support
- `regression/after-childCooking-1-masha-3-take.png` — pancake pickup
- `regression/after-cozy-1-bear-4-take.png` — adult pancake pickup
- `after-contacts/bench-0-masha-put_down-0.5.png`
- `after-contacts/kitchen-3-bear-take-0.5.png`
- `after-contacts/kitchen-3-bear-put_down-0.5.png`

Earlier contact sheets in `regression/` predate final source and are not final proof. Initial failing captures remain in ignored `iteration-regression-1/`, `iteration-route-bones/` and `iteration-1/`.

## Complete camera and pot-action acceptance

Final [camera-review/proof.json](camera-review/proof.json) records source `6b059a3e`, **174** boundary/action/overview samples, **389** projected loaded-mesh travel samples, **245** forward/reverse tail frames, zero instability/errors, raw hash and selected full-resolution pot frames. The reviewer inspected the actual rendered views, including intermediate reach and withdrawal rather than only ownership midpoint. Actor projection checks cannot detect an opaque wall in front of an in-frame actor; the rendered travel/transition sheets were therefore inspected as a separate check.

[pot-contact-review/proof.json](pot-contact-review/proof.json) preserves all sampled intersections, depths and bone attribution. Full-action reach measurements replace endpoint-only checks: an earlier 20cm guide lift overextended the arm between otherwise good endpoint poses. Final source `6b059a3e` distinguishes solver/prop alignment from the empty-paw idle blend:

| Measurement | Final value | Interpretation |
| --- | ---: | --- |
| Maximum solver `reachError` | **0.0369mm** at 53.05s | Reach solution before the final authored idle blend |
| Maximum prop-origin `targetError` | **0.0561mm** at 53.05s | Actual alignment during the approach |
| Actual carrot ownership handoff | **0.0278mm** at 53.451s | Loaded world-position discontinuity across release; owner changes Bear → none |
| Maximum final palm-to-guide distance | **36.6mm** at 54.35s | Empty-paw `potWithdraw` at progress 0.899, blending solved pose into authored idle; carrot was released about 0.899s earlier |

The 36.6mm distance is the hand's deviation from an intermediate guide after the final joint blend. It is not a carrot jump or an ownership discontinuity: the carrot has its independent resting/falling state, and the inspected empty-paw return remains clear of the pot/counter. There is no zero-intersection claim for the accepted final pose. Small head-fur/shoulder grazing reads as rim contact in the inspected frames; the earlier arm crossing and paw reappearance do not remain. The final action is authored staging, not collision-resolved kitchen physics.

Reproduce camera coverage with `npx tsx scripts/kitchen-bench-camera-review.ts`; it fails on unstable source, browser/seek errors or an entirely offscreen active traveller. Run `npx tsx scripts/kitchen-bench-pot-skin.ts` for the unfiltered physical measurements. Its optional `--assert-clear` intentionally fails while any sampled fur/rim intersection remains; it is stricter than this explicitly documented visual acceptance. Neither script changes runtime behavior or calls paid APIs. Initial failed sweep/skin evidence is retained in ignored `iteration-camera-review-before/` and `iteration-pot-skin-before/`.

## Other checks and boundaries

- Read parser/validator/compiler, shared schema/placement, contact code, replay/eligibility/events, cache reader, worker protocol/facade, Player readiness/audio clock and Stage readiness/thumbnail changes. Independently compiled two single-paragraph English variations and one Russian garden → kitchen → bowl → Bear → pot chain: pronouns/state transitions retained carrot #2. Single-paragraph bench placement/nudge/wait/retrieval retained verbs and final ownership.
- Reviewed cancellation, atomic fallback, exact-frame pose keys, retained Player time/picture/audio and latest-intent coverage. Behavioral tests exercise unavailable workers, timeout, stale replies, edits while pending, queued seeks and play cancellation. No additional blocker identified; parent owns final production-bundle/native transport evidence.
- Clearance samples every eighth loaded vertex at ≤0.1s intervals. Tabletop uses its interior; stove uses rendered lathe profile with a 3mm inner margin plus central firebox. This is bounded route evidence, not continuous all-triangle collision detection or every furnishing.
- Existing first garden-harvest attachment residual remains **15.8mm**, also present in initial native proof. Do not describe every contact as submillimetre.
- The late composition defects were fixed and their replacement stills independently inspected; final complete recordings remain the parent's acceptance step. No claim is made that every possible generated camera/interaction is now unobstructed.
- Pot sampling checks every eighth skin vertex at 50ms and exact action/release boundaries against the scaled lathe annulus/base, worktop polygon/thickness and inset cabinet-part boxes. Pot handles and continuous all-triangle collisions are outside that check. Maximum measured depth is retained for every intersecting sampled vertex; microscopic grazing is disclosed, not hidden by changing the test.
- Bowl supports deposit/retrieval; pot is **deposit-only**, with a capability message for unsupported retrieval. Kitchen remains authored animation, including the short above-rim release/fall, rather than newly simulated kitchen physics.
- Six saved live director responses came from the **previous deployed contract**. Replay proves compatibility and spectator-physics correction; it does not prove production AI already understands new bowl/pot/nudge vocabulary. This review made no new paid API calls.

Recommendation: reviewed behavior/regressions are ready for the parent's final recordings and performance assessment. Keep the strict native-contact guard and explicit authored/physics boundary. Carry these staging/contact checks into future object coverage; more logical verbs without readable staging would repeat the failure this review exposed.
