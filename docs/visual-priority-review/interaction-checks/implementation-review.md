# Hammock and paired-hug correction

Local source only; no deployment. The PNGs in this directory are an earlier diagnostic checkpoint. **The first moving review rejected its unsupported hammock glide and its turning-into-contact hug.** Do not treat those older `-final.png` names as current acceptance evidence.

Current short native recordings are in `docs/staging-interactions/interaction-revision/`. The parent’s final full-story capture uses production cameras and the same recorded-speech timing as AppStore.

| Interaction | Current correction | Evidence |
|---|---|---|
| Hammock entry | Walk to clear ground beside the fabric; finish a planted turn; crouch, hop onto the cloth in .62 s, absorb the landing, then recline along its actual .8-radian axis. | `interaction-revision/mount.mp4` |
| Hammock exit | Sit up and swivel while supported; lean into a .48 s hop; extend feet on descent, land with knee compression, and preserve the clear root endpoint. | `interaction-revision/wake.mp4` |
| Later approach | Route Masha around the cloth and end trunks. | Compiled four-point approach; route sweep. |
| Hug | Move the partner clear of the table; turn toward the arrival point before approach; settle both actors’ facing before the embrace; crouch the taller actor and fit measured palms/paws to the partner’s actual surfaces. | `interaction-revision/pancake-hug.mp4`, `nap-hug.mp4`, `hug-facing.json` |
| Seated fishing hug | Keep Bear seated on the pier; visibly put the caught fish down, turn toward Masha, leave room for the knees, and lean forward into reciprocal contact. | `interaction-revision/fishing-catch.mp4`, `fishing-hug.mp4`, `fishing-hug-facing.json` |

The physical-interaction test now uses recorded-speech durations, loads the shipped GLBs and checks all three sample-story hug entrances, holds and deterministic release/seeking. It checks busy-partner sequencing and already-seated hammock sleep, stationary supported takeoff/landing positions, bounded flight duration, constant horizontal flight speed, and Bear-versus-cloth clearance at **61 phases per transition**. The denser sweep caught an 18 cm toe crossing that the original ten-phase test missed; earlier leg tuck and the mount’s gravitational arc corrected it. Cloth tolerance remains 18 mm, not a general collision guarantee.

The seated fishing case was found in the later full-story review: the original standing-only pairing left Bear facing away while holding a fish. The added English/Russian regressions preserve the sequence of catch → held fish → visible put-down → empty-handed hug. The compiler records whether the fishing action catches a fish, so a later put-down cannot retroactively move the catch to the pier. The shipped-rig release check requires a paw-to-resting-prop gap below 3 cm. Final focused result: 16 tests passed; TypeScript passed.

The cloth is 3.6 × 1.1 m to fit Bear; ropes and pillow follow the new support. Camera and renderer share the flight timing helper. Paired contact updates only participating rigs, retaining deterministic pose resets while avoiding unnecessary work for the other actors.

Measured fit limitation: during the seated swivel, the closest sampled Bear surface sits approximately 3–7.5 cm above the cloth (resting back clearance is about 7 mm). The production framing review judged this gap unobtrusive; it is not exact seat contact. Current clearance was retained to avoid reintroducing penetration during the sit-up.

These are authored cartoon hops and contacts, not a cloth or full-body physics simulation. Native moving review remains the acceptance criterion; geometry checks alone do not establish natural acting. Production capture and camera review may further refine the final evidence.
