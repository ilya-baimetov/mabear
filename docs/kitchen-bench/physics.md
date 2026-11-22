# Bench physics

The existing 60 Hz canonical Rapier cache now supports one further continuous story: Masha places the ball on the yard bench, deliberately nudges it, watches it roll off and settle, then retrieves its actual landing position. Three.js and the current skeletal/contact animation remain responsible for rendering and acting.

| Phase | Owner | Handoff / validation |
| --- | --- | --- |
| Held ball and placement | Animation | Exact loaded-rig pose at placement midpoint; seat support and reach must agree. |
| Resting bench ball | Rapier | Seat collider top is 0.47m. No initial velocity or scripted drift. |
| Deliberate nudge | Animation hand; Rapier ball | Hand reaches the settled mesh pose; one impulse at clip midpoint. No attachment. |
| Roll, fall, rebound, settle | Rapier | Gravity and existing simple seat/ground colliders. Grass damping starts only after solver-confirmed ground contact. |
| Approach and acquisition | Rapier-corrected route; existing animation | Capsule stays outside furniture. Ground ball must sleep and be within reach; pickup targets the actual rotated mesh origin. |
| After acquisition | Animation | Physical body removed at the existing attachment midpoint. |

The fixed bench placement is `[1.90, 0.47, 3.075]`, away from the book and close enough to the front for a child's near-side grasp. The default nudge applies `[-0.82, 0, 0]` N·s at the sphere centre plus `[0.075, 0.025, 0.127]`, matching the visible palm contact and rolling left along the seat. This is a bounded contact action, not arbitrary kicking or throwing. Optional leftward impulses between −0.4 and −1.2 N·s are validated; an insufficient impulse may coherently fall back if the later ground pickup cannot be fulfilled.

On wood the existing damping is retained. After a positive ground-contact impulse, linear/angular damping become 2/3 to approximate grass rolling resistance; every position, rebound and resting point still comes from the solver. A 3mm collision skin reduces transient impact penetration. Other drops retain their previous material behavior.

## Canonical playback and preparation

Placement, nudge, scene boundaries and attachment times are exact simulation event boundaries. The entire supported continuity chain is validated before any physical frame is exposed. An unreachable action, unsupported transfer, incompatible choreography or excessive duration keeps the whole story authored, including earlier seeks.

`RapierReplay.preparedData()` exports a serializable source timeline, corrected timeline, samples, diagnostics and impulse records. The worker can request exact loaded-rig release samples and restart the deterministic prefix. The main-thread reader applies the same interpolation and preview-boundary ownership as synchronous replay. No live world state or rig crosses the worker boundary.

## Checks and adversarial updates

- Ordinary English and Russian three-scene stories exercise the normal parser/compiler, physical seat support, falling, resting, approach and acquisition.
- Recorded live AI EN/RU plans from `director/batch-2.json` are replayed without another service call. Spectator gaze and gestures are allowed; another actor taking, nudging or throwing the loose ball rejects physics coherently.
- Real Rapier samples verify ground support, bench/table capsule clearance, airborne motion off the seat, and acquisition at the actual landing rather than the authored fallback point.
- Reverse seeking, repeated paused reads, replay, scene-preview endpoints and structured-clone worker reader parity retain exactly the same frames.
- Editing nudge strength invalidates the cache and changes the measured landing and pickup contact; a fresh replay matches the edited result.
- Unit release samplers intentionally use exact contact targets; native loaded-rig checks separately verify mesh/palm reach and handoff continuity.

Two issues found during this round were corrected: live director spectator gaze formerly caused unnecessary physics fallback; and a stopped capsule a fraction of a millimetre inside the planner's inflated boundary could prevent its next route. Navigation now accepts 1mm numerical variation within its additional planning clearance (80mm around tall obstacles, 30mm around the bench). Existing hug, shoulder ride, indoor cupboard and ordinary drop/retrieval regressions remain authored or physical as before.

Native loaded-rig checks then exposed unreachable placement/nudge poses despite valid solver behavior. The contact owner changed the excessive bend/top grasp to a near-side grasp and modest lean; the supported bench stance moved to z=3.46. The ball's bottom contact, not its full horizontal radius, must fit on the flat seat. At z=3.075 it remains safely inside the rendered seat's flat top (the full bench front is z=3.19). The runtime now rejects a release whose actual loaded-hand sphere centre misses the intended placement by more than12mm, even if it would happen to land on the seat. A semantic walk to the bench retains its open-front approach, preventing the narrower planning clearance from redirecting old ball-drop stories behind the bench and under the table.

The affected four-file test run passed **48/48** after the native-contact corrections (`rapierBench`, `rapierContinuity`, `rapierReplay`, `responsiveReplay`). An independent reciprocal review with the worker-preparation agent found no blocking event-order, ownership, boundary-interpolation or contact-resistance issue. The supported-direction limit was retained explicitly.

Native Chrome 157 on Apple M1 Max confirmed the complete physical story with no fallback in `kitchen-native-confirm/proof.json` (source `b8ca39542df8576344164a8b11ad2735584219c9b9f8f3d00dbb6fc4e92c7a6d`, stable capture, no browser errors). Placement handoff displacement was 4.4µm and the final physical-ground pickup handoff 2.2µm; the revised nudge's hand-contact residual was 4.73mm. These results followed the adversarial review and contact update, rather than relying on the earlier geometry-only tests. The parent review record provides final integrated tests, before/after recordings and rendering/preparation performance; the bench implementation itself is complete.

## Limits

This covers Masha, the existing ball, the existing yard bench and ground retrieval. It does not add general surface pickup, arbitrary initial resting-ball physics, other characters' physical transfers, collision meshes, ragdolls, or simulation in the kitchen. Taking the ball directly from the bench without the roll/fall, or nudging it without a preceding known physical release, remains authored. The 60-second atomic continuity and 180-second simple-trial limits remain. Native visual evidence, preparation latency and tested-device rendering performance are reported in the parent kitchen/bench review record.
