# Wolves: geometry and motion comparison

The new wolves are procedural reconstructions, guided by Animaccord's [Sly Wolf](https://www.mashabear.com/en-us/characters/sly-wolf) and [Silly Wolf](https://www.mashabear.com/en-us/characters/silly-wolf) portraits and episode17 at300s. These are not production models. The enlarged bellies at298s are a porridge gag and were not copied into their normal anatomy.

| Model | Silhouette | Face | Motion |
| --- | --- | --- | --- |
| Original | Narrow torso, long thin legs, overlapping feather-like neck clumps | Small yellowish eyes, same head proportions on both wolves, muzzle decal | Generic ground-sit put shins through the floor |
| Rebuilt | Fuller haunches and shoulders, continuous pale abdomen, reduced neck clumps | Distinct skull/muzzle/nose shapes, white eyes, moving lower jaw with cheek folds | Calibrated feet, distinct seated haunch clearances, ground contact during sitting/rising |

## Review artifacts

Local interactive comparison: `http://127.0.0.1:5173/tools/wolf-fidelity.html` (Vite). Select either wolf, camera and action; Play/Pause continues the comparison clock.

- `proof/final-a-stand.png`, `proof/final-b-stand.png`, `proof/final-*-front.png`: matched-camera whole-body comparison.
- `proof/final-a-reference.png`, `proof/final-b-reference.png`: faces from an angle similar to the episode17 close-up.
- `proof/final-a-face.png`, `proof/final-b-face.png`: happy expression.
- `proof/final-a-profile.png`, `proof/final-b-profile.png`: actual profile geometry.
- `proof/final-*-walk.png`, `proof/final-*-seated.png`, `proof/final-*-rising.png`: actual animation samples.
- `proof/wolf-before-after.webm`: actual 3D animation, original left / rebuilt right.
- `contacts.json`: measured actual skinned mesh contacts, not only bone proxies.

The before module is a snapshot of the original procedural geometry with remapped imports. Both models use the same lights, camera and animation phase. Each uses calibrated leg dimensions; the seated comparison uses the corrected wolf pose on both meshes. Earlier `pass1-*` and `pass2-*` images are development history and contain subsequently corrected defects.

## Verification

- `npx vitest run tests/unit/characters.test.ts tests/unit/motion.test.ts`: 50 passed, including both wolves' geometry/draw-call budgets.
- `npx tsx scripts/checkWolfFidelity.ts`: actual foot vertices checked through idle, walk, run, wave, sitting, sitting down and standing up. Maximum sampled walking penetration:6.9mm. Sitting/rising penetration:under1.8mm. Seated haunch clearance:0.1mm Big Wolf /0.3mm Little Wolf; paws approximately6mm.
- `npx tsc --noEmit -p tsconfig.json`: passed.

A separate rain-footstep test exposed a routing regression: yard-only routing removed a pond-edge waypoint, making a short walk to the bench detour over the wooden porch. Cause and recommended local table bypass waypoint were sent to root; no compiler changes made by this task.

## Independent review → update

The reviewer identified an undersized head/long neck, detached jaw appearance and a white side flap in the initial fold fix. Updated the head to1.25× with a lower attachment while keeping ear-tip height, added weighted rear cheek folds, inset the eyes, softened the tooth row, and shortened/curved the folds to remove the flap. The reviewer inspected the final reference/profile/face/seated images and accepted the targeted update with no remaining blocker in those stills. Production source is frozen after these captures.

## Remaining fidelity limits

The wolves now have distinct proportions and actual articulated mouths. They still use inexpensive procedural fur and shared gesture clips. They do not yet have the show's dense groom, finely sculpted facial topology or full facial blend-shape range. The lower mouth still reads as a simple hinge/thin plate; geometric ears/paws and straighter lower legs remain visible differences in close views. Existing actor IDs are retained; the cast bible's taller-wolf-as-ringleader description should be reconciled against official Sly/Silly identity separately.
