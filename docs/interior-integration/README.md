# Bear’s revised interior in actual stories

The reviewed room is now built by the production game, through `bearsYard.ts` → `houseInterior.ts` → `interiorShapes/`. This is the connected kitchen, flat wall return, fireplace recess, reading group, bookcase/curtain and raised entrance from the shape study. The old rectangular interior has been replaced. Materials remain simple; detailed textures are a later pass.

Deployed and verified at [the live game](https://mabear-storybook.ilya-baimetov.workers.dev/) as version `cfcee0c6-3cbc-42ee-8b8e-7d6155192657`. [Deployment evidence](deployment.json) records the exact build, 770 passing tests, public checks and authenticated saved-story playback. The live story was preserved and its player restored to time zero with sound enabled.

## What was integrated

| Area | Runtime behavior |
|---|---|
| Architecture | Uses the reviewed curved footprint and kitchen connection, with the corrected flat return and fireplace depth. Foreground walls cut away according to the camera; retained rear walls stay solid. |
| Furniture and actors | Chair marks, seat heights, table surfaces and cooking supports share physical coordinates. Masha rises in front before moving onto the cushion; Bear approaches from the front and lowers into his chair-specific pose. A waiting actor steps aside before the next occupant approaches. The low table and dining chair were repositioned slightly to allow actual bodies through. |
| Kitchen work | Bear uses the stove; Masha works from a real stepped helper beside the preparation table. Portable objects occupy reachable edge slots. Actors put down an old object before taking another; table pickups use upright poses and edge/side contacts. The enamel pot stays on a spare countertop. |
| Travel | Indoor routes avoid the actual furniture. Entering/leaving the separate interior uses an editorial cut; saved stories retain semantic kitchen/living-room marks and recompile when loaded. |
| Serving and exits | Bear approaches the seated child at a usable distance and steps clear before she gets up. Shared pan ownership persists across scenes. |
| Cameras | Wide shots establish the connected room; paired and close shots account for actor visibility and support heights. |

## Evidence and review

The `before/` source is an exact match to all 145 production source files recorded for the previous deployed release. Both sides use the actual story compiler, evaluator, camera, stage and shipped character models, with the production recorded-speech duration mapping. Visual recordings are silent; no voice/director generation is invoked.

The review covers English and Russian **Cozy Evening**, an additional kitchen/reading/exit story, and targeted kitchen pickups. The regular editor is also checked for complete-story playback, pause, resume and seeking. Source fingerprints accompany final captures to prevent a mixture of revisions being presented as the release.

- [Adversarial visual review](visual-review.md)
- [Adversarial source review](code-review.md)
- [Geometry and chair review](geometry-review.md)
- [Independent release review](independent-release-review.md)

Intermediate `iteration-*`, `pickup-final/` and `pre-chair-entry/` artifacts are not the accepted result. Live smoke caught inherited cushion penetration during chair entry; final evidence includes the corrected mount and safe waiting position. Final evidence is in `after/`, `ui/`, `comparison/` and `media-check/`.

## Final evidence

| Artifact | Verified result |
|---|---|
| [Before/after player](index.html) | Six matched story actions; real 1× speed, pause/seek/replay checked, shorter excerpt holds its final frame. |
| [Before/after animation](comparison/interior-before-after.mp4) | 30.03 s montage covering room staging, Masha cooking, both actors seated, serving and chair exit. |
| [Cozy Evening](after/cozy_evening_en.mp4) / [Kitchen visit](after/kitchen_visit.mp4) | Complete silent actual-renderer recordings, 38.752/50.415 s. |
| [Actual editor](ui/studio-final.png) / [UI proof](ui/proof.json) | Built production bundle `studio-BNVTsQ2J.js`; real example selection, all-story playback, pause/resume, seek and completion. No paid API calls. |
| [Source and visual proof](after/proof.json) / [contact summary](after/contact-summary.json) | Source-stable final capture: 197 snapshots, 278 sweep samples, no browser/request errors. Upright pickup, support height, attachment, table clearance and the corrected front-of-chair mount checked. |
| [Media verification](media-check/proof.json) | Full and final-two-second FFmpeg decoding of all five MP4s; nonblank tail images. |

Final rendered source fingerprint: `a7d22476f0c7e15cd69d92fefac362248a00ba3dacfcf70bd2a4144b7326fe69`. The complete suite (770 tests across 63 files), typecheck and production build passed on this revision. The deployed entry script matches the built-editor proof; authenticated live playback reached the end, the corrected chair approach and final pose were inspected, and no console warnings or errors were reported. See the [live screenshot](live-deployed.jpg) and [deployment record](deployment.json).

## Reproduce

`npm run typecheck` and `npm test -- --maxWorkers=1` check the compiler and physical/layout regressions. `npm run build` creates the actual release bundle.

`scripts/interior-integration-capture.ts` records the real story renderer; `scripts/interior-integration-ui-check.ts` checks the regular editor (set `INTERIOR_APP_URL` to a production preview). The package/comparison scripts create an offline comparison player and video montage.

This is staged cartoon motion, not a general rigid-body/contact solver. The room dimensions and camera lenses remain inferred from episode frames; the separate upper stair destination was not invented. No phone-support work is included in this change.
