# Camera visibility and physical interactions

**Deployed** to [the live game](https://mabear-storybook.ilya-baimetov.workers.dev). See [deployment verification](deployment.json). The [before/after player](index.html) contains the reviewed local sample-story recordings.

| Area | Change |
|---|---|
| Cameras | Score moving actors throughout each shot, share the actual forest placements with obstruction checks, account for tabletop/samovar and low hammock branches, and frame paired actions together. Keep useful subject size instead of retreating indefinitely. |
| Hammock | Approach from the side, turn while planted, then use a brief hop and supported settling pose. Swivel on the cloth before a short hop to clear ground, with landing compression. Later approaches route around the cloth. |
| Hug | Move the pair clear of furniture, face one another before contact, fit both hands to the shipped character surfaces, and release cleanly. On the pier Bear puts down the fish and remains seated for the embrace. |
| Cooking | Give Masha a real two-step helper beside the adult table. Approach and leave by its steps; keep face, hands and pan above the work surface. Bear's ordinary approach stays on the ground. |
| Shoulder ride | Fit Masha's seat to Bear's moving nape, bend her dress over her lap, and place her legs astride the shoulders. Fit Bear's supporting paws to her ankles; preserve her independent gestures. |

## Evidence

The frozen before source is commit `28732e033ebcb085bd7bc99d829c19205793386f`. Both recordings use the real fixtures, compiler, evaluator, stage and shipped assets, with the same `recordedSpeech.json` duration mapping used by `AppStore`. Videos are silent visual proofs; no paid voice or asset generation was needed.

The player aligns the relevant actions using each build's clip starts. Timing changes are intentional: walking around furniture and mounting a support take time. Both sides play at normal speed; a shorter excerpt holds its last frame. Full story recordings remain available for context.

Source hashes, native-renderer identification, asset status and recording cadence are stored with each capture. The exporter rejects a source change during an after recording. Videos are encoded at 30 fps; renderer cadence is reported separately.

## Adversarial review → update

| Finding during this pass | Correction |
|---|---|
| A clear hammock exit endpoint still crossed Masha en route. | Check the swept exit and choose the empty side. |
| Raising Bear removed cloth penetration but left him floating. | Resize the cloth and calibrate back/seat support using the rendered mesh. |
| The new hug was still hidden behind furniture. | Move the interaction onto clear ground before contact. |
| Camera clearance made cooking too distant. | Preserve a readable subject size and allow a non-blocking partial foreground actor. |
| The helper was approached from its tall side. | Route mounting and departure through the rear steps. |
| After descending the helper, navigation crossed back over it. | Add its real footprint and rear corners to the walking graph; verify the complete departure. |
| Camera planning used linear root travel and stale posture heights. | Share the physical travel phases and use measured transition/head-height estimates. |
| The first moving take showed Bear crouching and making contact while still facing away from Masha. | Rejected that take; require facing to complete before the embrace. |
| The fishing story's seated receiver still faced away and retained the caught fish. | Put down the fish, turn before contact, preserve Bear's seated support, and delay his following nod until the embrace ends. |
| A later put-down changed where the earlier catch appeared. | Store the catch ownership on the compiled action; the fish stays in Bear's paw until the visible release. |
| A penetration-only cloth check accepted an unsupported horizontal glide during mounting and dismounting. | Rejected that movement; require visible anticipation, a brief flight and landing rather than treating clearance as support. |
| Simultaneous dialogue cut away from Bear's hammock entry behind a large foreground branch. | Keep the physical action and its partner in a shared shot through the mounting sequence. |
| Masha's old shoulder ride used a fixed height above Bear rather than contact with his body. | Follow his posed spine and fit the final seat to the visible nape surface. |
| Removing the gap initially produced a piggyback silhouette, with the knees hidden inside Bear's shoulders. | Include the seated dress deformation, find the actual nape surface, and fit the bent legs onto opposite shoulder sides. |
| A vertical supporting paw forced Bear's elbow into an extreme fold and distorted the arm silhouette. | Change the grip angle so the wrist has room and the elbow can bend forward while retaining ankle contact. |
| The first walking shot still crossed a branch despite camera adjustments. A full angle review showed the walking route itself passed through the hammock area. | Route ordinary departures around the cloth and trunks; a shoulder rider first moves out from under the low branches before rounding the end. |
| The camera then followed the estimated path while Bear turned along the actual detour. | Carry tracking follows his evaluated position; use a stable open-side view for departure from the hammock. |

This remains authored cartoon motion, not a cloth or full-body physics simulation. The paired gesture is adapted to the characters' very different sizes. Sample-story evidence does not prove every arbitrary generated interaction or every device.

The measured resting back is about 7 mm above the cloth. The seated swivel has a 3–7.5 cm surface gap; it is an approximate fitted pose, not exact deforming cloth contact. The revised entry/exit uses short explicit flight intervals instead of the rejected extended hover.

The shoulder ride is fitted to the shipped generated meshes. The native carry review measured a 5 mm seat gap during the hold and at most 5.2 cm paw-target error during the transfer. See [the carry review](carry-revision/README.md) for decoded video frames and measurements. Brief back/profile views, coarse underarm fur folds and a brief foreground branch crossing remain; this pass targets a readable, supported performance rather than complete physical simulation.

## Reproducing the checks

- `npm run typecheck`
- `npm test -- --maxWorkers=1` (run separately from native video capture)
- `npm run build`
- `npx tsx scripts/checkCookingStaging.ts` with the proof server on port 8797
- Capture and export scripts: `scripts/staging-interactions*.ts`

## Final verification

| Check | Result |
|---|---|
| Frontend and Worker TypeScript | Passed |
| Unit/regression suite, one worker | 752 tests passed across 61 files |
| Production build | Passed |
| Actual app, native Chrome with local test Worker | 2 tests passed: whole-story playback/active scene and pause-resume/selection/replay |
| Native cooking sweep through approach, cooking, reactions and departure | 275 sampled frames; no pan/table overlaps; minimum cooking pan bottom 0.829 m above ground, versus 0.78 m tabletop |
| Physical interaction tests | 21 passed, including recorded-speech timing, standing/seated hugs, fish ownership/release, carried seat/ankle/paw contacts, lift/seek/dismount continuity, English/Russian hammock departures and 61-phase cloth sweeps |
| Focused camera tests | 34 passed, including carried-pair tracking on the actual bent route and deterministic follow-camera behavior |
| Final complete-story capture | Four native GPU recordings; stable production source, no browser/request errors, finite sampled transforms; renderer near 60 fps (95th-percentile frame gaps at most 17.5 ms) |
| Local comparison player | All 11 cases load from disk with embedded metadata; synchronized play/pause, seek and restart passed |
| Exported comparisons | All 11 paired clips and the 65-second montage decode and play; final montage segment verified by seeking to its tail |

The full suite was run separately from recording. Earlier parallel runs exhausted the five-second timeout of the all-fixtures expression test under host load; the final serial suite passed without changing the timeout. The native capture records its measured cadence separately from the encoded 30 fps video.

The source changes are independent of the separate interior blockout. No new textures or character models were introduced.
