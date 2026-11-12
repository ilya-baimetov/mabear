# Independent interior release review

Scope: the integration delta against `/tmp/mabear-interior-before-20261107/src`, with independent attention to shared layout, indoor route planning, camera selection, production geometry and stage support. Existing unrelated worktree changes are excluded. Reviewed 2026-11-07; source hashes below identify the reviewed revision. This is a source review with narrow CPU probes, not a claim that final playback was visually accepted or deployed.

**Current review status, 2026-11-07 09:51 UTC:** no open source blocker in the bounded reviewed change. The two P2 findings, armchair mount and entry-clearance correction pass independent source review. The new build independently passes packaging/source integrity checks against final fingerprint `a7d22476f0c7e15cd69d92fefac362248a00ba3dacfcf70bd2a4144b7326fe69`. The earlier packaged/deployed candidate remains archived under `pre-chair-entry/`. Final suite completion and live deployment verification remain owner gates; historical findings and hashes below preserve correction history.

## Final chair-corrected build verification

Final evidence: [release-build.json](release-build.json), checked 2026-11-07T09:51:16.512Z.

| Check | Result |
|---|---|
| Source | **149/149 files** match the validation manifest and final fingerprint `a7d22476f0c7e15cd69d92fefac362248a00ba3dacfcf70bd2a4144b7326fe69`; unchanged on a second scan. |
| Target and build | Correct `mabear-storybook` Worker, `worker/bridge.ts`, `./dist`. **177 files**, **62,040,658 bytes**, exactly app/voice HTML; **154/154** public asset hashes match. |
| Exclusions | No source maps, symlinks, excluded documentation/reference/archive/config paths, review-harness markers or recognized secret-value patterns. |
| Deployment identifiers | App `assets/studio-BNVTsQ2J.js`; stage `assets/stage-iZq6yKXD.js`; index SHA-256 `d2f9c005af94e50ed1ac42cb0bab967f6479df4538b9dc2101f7e1099c9f240e`; stage SHA-256 `033df0a75c6524df8f68a640f5bbcfbfb75a65c0790835da6688a5e257c8fb2c`. |
| Complete package | Dist fingerprint `e6d8e6480bcda22f9b5173113e258b7ac824b26378253077a49158ee9afc6c08`. Full per-file hashes/sizes, supplemental Worker/config hashes and both preserved archive hashes are recorded in `release-build.json`. The stage retains both integrated interior revision markers. |

The reviewer did not rebuild, run broad tests, record browser playback or deploy during this pass. Targeted visual proof was accepted by the owner/proof agent.

## Armchair entry follow-up

Reviewed the narrow delta against `pre-chair-entry/release-source.tar.gz` after the author marked it ready. The live smoke test had exposed the inherited standing walk into the cushion; this correction stages Masha/Bear in front, completes a planted turn, then mounts the chair. Shared timing drives pose, root travel and compiler camera height.

| Check | Independent result |
|---|---|
| Crossing pose | Focused real-GLB test `rises in front of the actual armchair`: **1 passed, 14 skipped**. It checks the standing approach outside upholstery, pelvis above the cushion when crossing its front, feet remaining forward, settled height and repeated seek. |
| Endpoints and seat semantics | Separate Masha/Bear two-scene probes show zero entry/end root discontinuity within floating-point precision, zero hips discontinuity at the settled endpoint, `posture: sit`, and `mark: house_living` preserved into the following scene. |
| Deterministic seek | Re-evaluating each actor's midpoint after seeking to the episode end produces an exactly equal serialized ActorFrame. The mount has no accumulated state. |
| Outdoor scope | New mount pose/root branches require an authored `sit` path to `house_living`; other seats retain the previous branches. Generalized `mount.target` assignment preserves the existing hammock mark. |
| Entry clearance follow-up | `clearChairEntry` applies only before lead walk/sit actions targeting `house_living`. It considers standing indoor participants whose existing track is free, checks candidate destinations and route samples against occupied actor positions, emits an actual locomotion clip and tracking-camera beat, and delays the incoming actor until that move ends. It does not relocate a seated/busy actor or teleport a root. No new source blocker found; this is a bounded staging rule, not a guarantee for every possible crowd arrangement. |
| Remaining gate | Actual rendered acceptance and the subsequent frozen build/live checks belong to the owner/proof agent. No additional source blocker found; no broad suite, browser or deployment run by this reviewer. |

## Earlier release package verification (superseded by chair-entry correction)

| Check | Result |
|---|---|
| Frozen source | All **149 files** match `validation-source.json`; source fingerprint `5ec70d20f9238182c82008c6d226c0ffb7638c111e31f8276bd9209c310973c4`. A second scan confirmed source stayed unchanged during verification. The owner identified the last source delta after the narrow contact review as removal of an ordinary choreography repair message. |
| Deployment target | `mabear-storybook`, entry `worker/bridge.ts`, assets `./dist`; existing URL `https://mabear-storybook.ilya-baimetov.workers.dev`. No deployment was performed by this reviewer. |
| Final build | **177 files**, **62,037,596 bytes**. Exactly `index.html` and `voice/index.html`; all **154 public assets** match their source hashes. No source maps, symlinks, review-harness markers, excluded paths or recognized secret-value patterns were found. |
| Integrated runtime | The unique `assets/stage-CbEZiPf8.js` chunk contains both `integrated-interior-v1` and `reviewed-wall-return-04`. The app entry is `assets/studio-DsvMRISm.js`; the voice entry is `assets/voice-6uAmc0bY.js`. |
| Final artifact hashes | Index SHA-256 `75cc4701f3c399e1d727bf08d418b03eaee4628627ed7db66c67a65e990c8d6b`; stage SHA-256 `b8a46ba5026771d9b4c1671daede51ce37fd2f9be1373fd9b569f5aad6578c3a`; aggregate dist fingerprint `7a96cfe11909cc431b3f038626f0bda90212c8010084d4185e3f09c3d2e5d490`. Per-file hashes, sizes and supplementary Worker/config inputs are preserved in `release-build.json`. |
| Baseline preservation | The source archive remains unchanged at SHA-256 `08881e1abf14d8ec2baeaf6c4d3ea053777fa4dea080c17d5f352ba35825c7e3`, outside public/build inputs. Its 145 baseline production file hashes were verified in the earlier preflight. |

Remaining owner checks: final suite completion, source-matched proof acceptance, deployment, and live health/authenticated-playback verification. This packaging check does not independently rerun the build, full test suite or browser playback.

## Final frozen contact and camera sanity check

The contact author explicitly confirmed the final source freeze. Independent reread covered the side/lip acquisition, reversed put-down path, lifted carry transition, upright kitchen take pose, updated adult stances and compiler-generated preparation camera beats.

| Check | Final result |
|---|---|
| Earlier underside-grip limitation | Addressed for the measured pancake/jam/flour kitchen cases: acquisition touches the exposed lip or side, lifts before transitioning to the normal underside carry, and reverses this sequence for their table put-downs. The additional child torso lean was removed. This remains authored contact, not a universal collision solver. |
| Occupied hand and floor support | Both EN/RU Cozy Evening probes have no held prop and no attached frying pan during the next pickup's pre-attachment phase. Bear's final pan put-down at local `[-3, 3.00]` and pickup at `[-2.90, .75]` both have support height **0**. |
| Focused GLB verification | Reran only the updated kitchen pickup test: **1 passed, 13 skipped**. It covers actual side/lip acquisition above the worktop, attachment continuity, Masha's face clearance, held-pan clearance and repeated seek. |
| Preparation cameras | Camera beats now explicitly cover the put-aside approach/turn and release. CPU sampling every 50 ms throughout preparation and pickup in both language fixtures found **0 non-finite camera frames**, with location consistently `house`. The proof owner is responsible for the final rendered framing judgment. |
| Bounded implementation | New side/lip selection is restricted by the preparation-table footprint and supported item types. Outdoor pickups retain the previous path. Pose/socket reset and clip-time calculation preserve seek determinism. No new source regression found in this final pass. |

Final narrow-review SHA-256: `compile.ts` = `a6445cd7bbddf19ee1a8a919419fb50b65f3213cf495639ef86bc07a47e99565`; `camera.ts` = `bffbe404a461fb83b919dd57e3adf092329e28b4d49214e6e8b95be2c8bb8e5d`; `motion/verbs/objects.ts` = `4271011aa630f4adf234a84dff81f1603588b7a3b30724a76ad4a0ed7917bf3e`; `mashaContacts.ts` = `394a1e7bf1d885de17f8c49033c628bd0125b39abff6e5756183e02ca268ea49`; `sourceContacts.ts` = `8ad1f1344e65b5a0abf2033731a6bf84bfb2b4ea64ca84d64ee8c8a9fe49a717`. Shared layout and placement hashes remain `5adcd6a304ec368ce400cfc15c6aee09415e9addae2efb5f397615b01ca8d271` and `ce69b280901a4eec189a494d55c779a8cec2a4dda5a563749b643f2422b0b0ed` respectively. The final production proof must still fingerprint all source inputs.

## Finding and resolution

| Priority | Finding and reproducible trigger | Evidence | Required disposition |
|---|---|---|---|
| P2 | Bear's ordinary pancake pickup is staged on the edge of Masha's helper. | `src/compiler/compile.ts:260–262` assigns every non-Masha kitchen pickup to local `[-2.60, 1.40]`. `HOUSE_COOKING_HELPER` occupies this point; `cookingSupportHeightAt` returns **0.364583333333 m** there. `src/engine/stage.ts:273–282` applies that lift to Bear's entire rig. Compiling the English Cozy Evening fixture reproduces this in paragraph 2's `take pancakes` clip; the iteration-03 recorded-timing proof places it at **12.247–13.247 s**, world `[-10.6, -11.6]`. Only Masha receives the helper entry route in `locomote`, so Bear also approaches its tall side directly. | Put the adult pickup stance on the room floor beside a reachable table edge, and verify Bear's pickup/feet in the actual story. The numerical lift is verified; the final take-frame image still needs inspection before judging the visible severity. This needs a local staging correction, not a new collision system. |

**Resolved at source level, independently verified 2026-11-07 08:58 UTC.** The adult stance is now local `[-2.60, .75]` / world `[-10.6, -12.25]`. Recompiling both English and Russian Cozy Evening produces this exact pickup position, support height **0**, and `pickUpAt: 'house_kitchen'`. The focused `interiorContinuity.test.ts` run passes **8/8 tests**, including the new floor-height assertion. The owner reports that targeted pickup playback separately exposed an attachment jump and an under-table pan; the corresponding hand-contact implementation is still in progress and is outside this resolved floor-lift finding.

## Checks without additional findings

| Area | Evidence / result |
|---|---|
| Actual runtime port | `bearsYard.ts` directly builds and adds `buildHouseInterior`; the stage selects that group for `location: 'house'`. Production living/kitchen shape builders match the reviewed standalone shape builders apart from labels/comments. Architecture differs only by the expected wall-section grouping and returned cutaway metadata. Root-builder adjustments account for the moved reading table, dining chair, permanently parked pot and real helper. |
| Route reachability | A CPU probe tested all **56 ordered pairs** among stove, armchair, helper entry, child cooking position, pancake pickup, jam pickup, serving position and cleared-server position. Every planned route reached its requested endpoint. This tests those concrete marks, not arbitrary generated interactions or body-wide collision avoidance. |
| Separate stage transitions | `planPath` returns a cross-stage handoff; `locomote` marks it as a scene cut. Camera planning rebuilds each side at its own location and determines `cutAt`. Interior shots carry explicit `location: 'house'`, avoiding dependence on an exterior-looking camera target. |
| View and seek state | Wall visibility and ceiling visibility are assigned from the current camera each render. Window tint derives from the stored base color. Stage gaze targets subtract the support lift before the complete rig receives that lift. These paths do not accumulate state across seeks. |
| Geometry batching | Batching stays within existing fixture/cutaway groups and transforms each sibling mesh into that group's coordinates. Wall-section visibility and helper/table anchors remain attached to their original groups. |
| Current camera revision | The new chair-exit camera follows the evaluated actor; the paired reading camera uses the actual reading participants. These branches were reread after the camera file changed during review. Final actual-story captures remain the visual gate, particularly the serving/eating shot and feet during chair exit. |

## Review boundary

No full test suite or additional browser recording was run concurrently with the owner's final validation. The owner is running those checks. Known prior findings (pan ownership, pot popping, child prop reach, supported gaze and chair fit) were not counted again. No paid assets, production edits or deployment actions were performed by this reviewer.

## Release packaging preflight

Read-only checks completed at 2026-11-07 08:58 UTC. No build or deployment was invoked; current `dist/` is an earlier bundle, so its inventory does not certify the pending release build.

| Check | Result |
|---|---|
| Correct deployment target | `wrangler.toml` names `mabear-storybook`, entry `worker/bridge.ts`, and assets directory `./dist`. Its `STORY_SERVICE = mabear` binding is the existing authentication/service dependency, not the deployment target. The previous deployment record uses the same Worker and URL. A live GET to `https://mabear-storybook.ilya-baimetov.workers.dev/api/health` returned HTTP **200** and `{ok:true, service:'mabear-storybook', edition:'codex'}`. No director/speech endpoint was invoked. |
| App and voice build inputs | `vite.config.ts` lists only `index.html` and `voice/index.html`; source maps are disabled. Those pages enter `src/app/main.tsx` and `voice/main.ts`. Neither source tree imports `docs/`, `tools/`, `scripts/`, `refs/`, `worker/` or local environment files. |
| Public asset boundary | `public/` contains **154 files**, no symlinks, no HTML pages, no docs/reference-frame/archive/config/secret paths, and no matches for the recognized private-key/API-key value patterns checked. Image paths are runtime textures/nature assets and the interior window asset. This is a bounded static scan, not an assurance against every possible secret format. |
| Existing build inventory | Current `dist/` contains **176 files** and exactly two HTML files: `index.html` and `voice/index.html`. It contains no source maps, symlinks, documentation/reference-frame paths, archives or recognized secret-value matches. Recheck this inventory after the final frozen build. |
| Preserved source baseline | `/tmp/mabear-interior-before-20261107/src` and `docs/interior-integration/before-source.tar.gz` each match **all 145** production source hashes in `before/proof.json`, with **0 mismatches**. Archive SHA-256: `08881e1abf14d8ec2baeaf6c4d3ea053777fa4dea080c17d5f352ba35825c7e3`. The archive is outside the build/public input paths. |

Pending release checks: accept the final pickup visual proof; rerun the appropriate type/unit checks; produce final source-matched actual-story/regular-editor evidence; build from that frozen source; recheck the resulting asset inventory and fingerprint; then deploy and verify the existing authenticated app plus public health/auth boundary. The owner reports main-story camera acceptance in iteration 04; this reviewer did not independently replay that capture.

## Frozen pickup contact follow-up

Reviewed after the contact author announced source freeze, 2026-11-07 09:15 UTC. The initial pass found no blocker in unoccupied-hand pickups; a subsequent occupied-hand check identified the concrete case below. This pass covered only `pickUpAt`/`pickup` plumbing, the two new contact branches, the prep-table clearance helper and shared pickup/resting positions.

| Priority | Late finding | Evidence / disposition |
|---|---|---|
| P2 | The new pickup solver overrides the socket of an object still held before the next pickup attaches. | Actual Cozy Evening Bear `take pancakes` evaluation at 10%, 40% and 49% has `holding: frying_pan`, `props.frying_pan.attachedTo: bear`, and `pickup.item: pancakes`. Both new contact branches prioritize `frame.pickup` and set the shared right-hand socket/orientation for the pancakes. The old pan consequently follows the new object's contact pose until 50%, when evaluator auto-drop relocates it to its resting slot. The contact author suggested this check and the independent reviewer reproduced it from current source. Reported to the owner; a bounded visible put-down before an occupied-hand interior pickup is an appropriate correction. No source change made by this reviewer. |

**Compiler resolution verified 2026-11-07 09:23 UTC.** `putAsideBeforeInteriorPickup` now emits a separate visible put-down before an occupied-hand interior pickup. Both EN/RU Cozy Evening probes release the pan at segment-local **6.315 s**, finish that clip at **6.815 s**, and start the pancake pickup at **11.066 s**. The focused regression run passes **2/2 tests**. Sampling the two adult routes every 3 cm found no position outside the house and maximum helper support height **0**. A seated-actor probe emits `stand_up` before this helper; an ordinary outdoor-source pickup emits no new put-down or `pickUpAt`; outside-to-kitchen travel uses the existing explicit scene cut. No remaining compiler blocker was found. Final physical put-down/pickup contact review remains pending while the contact author updates the solver.

| Concern | Independent result |
|---|---|
| Activation scope | The compiler supplies `pickUpAt` only for an explicit `take` whose item is resting at an interior mark. Ordinary outdoor pickups retain their existing path. The ongoing clearance correction checks only four kitchen props and fades outside the preparation-table footprint. |
| Attachment and coordinate space | The evaluator changes ownership at 50% of the clip, matching `pickup.release`. Stage converts the resting target into pre-helper-lift coordinates once; the complete rig then receives the normal support lift. The contact branch derives the socket from the actual solved palm/paw. |
| Seek safety | Generated rigs restore rest transforms before applying each evaluated pose; each contact updater resets the socket and metrics. The extra torso lean and arm solve are calculated from clip time. Repeated seeks therefore do not accumulate lean or IK offsets. |
| Withdrawal and end of take | The item first lifts from the surface, then approaches the ordinary held orientation/origin. The extra child lean fades out before the take ends. The table correction moves the real arm/paw, preserving the connection between object and hand. |
| Focused independent validation | Ran only `mashaPerformance.test.ts -t 'meets real kitchen props'`: **1 test passed, 13 skipped**. It checks four real-GLB Masha pickup contacts, ownership-boundary continuity, held-pan clearance and repeat seeking. No browser recording or full suite was run by this reviewer during final proof capture. |
| Honest visual boundary | Existing support-style grips approach the underside of plates/jars/bags. At the exact tabletop contact, the palm can lie within the table's solid volume. The prop continuity test does not prove collision-free fingers/forearms. Final actual-story proof should determine whether this brief intersection is visibly distracting; this review does not require a general physics or grip-system rewrite. |

Contact source SHA-256 at the 09:15 review, before the subsequent occupied-hand/upright-pose corrections: `mashaContacts.ts` = `b1b7b29c21672d00621736ec384c4d33edd94c715bdab5dd8ceaa6dfb146e69c`; `sourceContacts.ts` = `557babb6f3be7a42f2131537a64eb934c444ce16982165c3e81042175b3935b0`; `houseLayout.ts` = `5adcd6a304ec368ce400cfc15c6aee09415e9addae2efb5f397615b01ca8d271`; `propPlacement.ts` = `ce69b280901a4eec189a494d55c779a8cec2a4dda5a563749b643f2422b0b0ed`. These hashes are historical review evidence, not the final release fingerprint.

## Initial reviewed source fingerprints

These identify the initial review, before the later adult-stance and pickup-contact corrections. Final release evidence must carry the final source fingerprint rather than reuse this table.

| File | SHA-256 |
|---|---|
| `src/shared/houseLayout.ts` | `091224e10f8ee6d0789476b1d8e649f36a79c452b705af07c70a158809776308` |
| `src/compiler/path.ts` | `51949754416cc90da179d578c124e632a24a184e62c13f260c46d2f6be85f771` |
| `src/compiler/camera.ts` | `bffbe404a461fb83b919dd57e3adf092329e28b4d49214e6e8b95be2c8bb8e5d` |
| `src/compiler/compile.ts` | `affdf7711f0771ea740fdc5b17d91abf4c19b35b01d373b8a50a7682e77bd364` |
| `src/engine/set/houseInterior.ts` | `85153dfc85cd9938994154777d8141dcbe1f9cc8608db90cf4286869ef7d1561` |
| `src/engine/set/interiorShapes/architecture.ts` | `3b1dbc577ef0bf97756eec08542497a3de8bf5a3eec3b3d9130cdf0047fedf81` |
| `src/engine/set/interiorShapes/living.ts` | `8666ceba45cdcf93bc621f66efe3d1be52fc657876a2e11a6d284a5acd9ca625` |
| `src/engine/set/interiorShapes/kitchen.ts` | `fb05e0a7df537600db6bdd94c99b0841a23784cc3ab1df87e9821d2aa8bf83ad` |
| `src/engine/stage.ts` | `56d1c994081f2f23821d945d11ba16e444a63030f37e69e1c537fb5f88b2006f` |
