# Shoulder carry correction — local source, not deployed

The former evaluator placed Masha at a fixed 2.28 m root height behind Bear's floor root. It did not follow his leaning neck or fit her pelvis to his visible body. At the sampled hold, her hip joint was 2.33 m high while Bear's neck joint was 1.87 m high; walking widened the mismatch.

| Area | Final physical correction | Evidence |
|---|---|---|
| Seat | Follow Bear's posed spine; fit the rider's anatomical seat to the actual lower-head/nape surface. Head-weighted nape vertices are included; excluding them incorrectly forced a high-piggyback pose. | `trial-side.png`, `trial-rear.png`; final native recordings below |
| Legs and clothing | Fit both bent leg chains around the neck to shoulder-side ankle targets; allow the existing seated skirt morph during riding. | `neutral-lift-sheet.png`, `neutral-ride-sheet.png` |
| Support | Fit Bear's measured paws to the pickup/waist grip and then ankles; angle fingers to allow a forward, lowered elbow. This avoids the former extreme backward fold. | `carry-neutral.mp4` |
| Lift | Deeper planted squat, supported overhead transfer, settle onto the nape. Retain independent clapping/laughing and share lift-height estimates with the camera. | `carry-production.mp4`, `production-lift-sheet.png` |
| Continuity | Recompute contacts from each evaluated pose, including walking/turns; normal rig reset makes seeking independent of history. | Shipped-GLB tests and native per-frame JSON |

The continuous takes run from carry −0.3 s through +8.5 s using the actual English sample and recorded-speech durations. The carry action begins at **39.487 s**. `carry-production.mp4` uses the production scene/camera; `carry-neutral.mp4` uses a diagnostic three-quarter view with scenery hidden. Contact sheets are decoded from those MP4 files, not separately posed screenshots. Their native render loops produced 529/530 samples, with maximum time step below 18 ms.

Measured final take: held anatomical seat-to-surface spacing is **5 mm** throughout; largest pickup-to-settle paw target miss is **5.2 cm**. The full transfer remains visibly supported; this is an approximate authored interaction, not a rigid-body solver. The imported Bear underarm mesh still has coarse fur folds, and Masha's skirt uses a seated morph rather than cloth simulation. These limitations are not hidden by the geometry checks.

Validation: `tests/unit/physicalInteractions.test.ts` **19/19 passed**, including the existing hammock/hug/fishing checks plus shipped-rig carry seat, ankles, paws, gesture preservation, walking/turning, reverse seeking, a dense lift sweep, and the explicit carry-to-walk-away first-frame seam (under 4 cm across ±1 ms). TypeScript passed. Camera tests are owned by the separate camera review.

The independent moving review accepted the corrected seat and lift but flagged a branch-obscured first-walk shot at carry +5.5 s. An angle sweep showed that Bear's path itself crossed the hammock area. The final route goes around the cloth and end trees, with added headroom for the rider. Tracking now follows the evaluated carrier position; a stable open-side departure view avoids the former orbit into the house limb. Final native samples are in `camera-route-final/`. Brief back/profile views and foreground branch silhouettes remain acceptable limits of this visual cleanup.

The earlier local production diagnostics above precede the final route and framing changes; the parent comparison player and complete-story recordings are the final evidence. The final full suite passes **752/752 tests across 61 files**, including 21 physical-interaction and 34 focused camera tests. TypeScript and the production build pass. No deployment.
