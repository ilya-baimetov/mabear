# Masha animation checkpoint, revision 3

User request: improve Masha's facial expressions and hand contacts, then show actual before/after animation before working on other characters.

## What to review

- [Actual side-by-side animation](proof/masha-before-after-v3.mp4): 24-second silent recording of the two live WebGL renderers. Expressions, grasp/taste, front clap and oblique clap.
- Interactive comparison: https://mabear-masha-performance.ilya-baimetov.workers.dev/ (same existing demo-password gate).
- Left: current game rig. Right: revised Masha candidate. Both receive the same model, acting inputs, camera and lighting.

The current game baseline is commit `7ecd9b3`. Its pre-change comparison build was frozen in `.scene-proof/masha-animation-baseline/dist` before implementation. The previous experimental candidate is retained in that frozen build for internal comparison; it is not mislabeled as the shipped game.

## Changes

| Area | Revision |
|---|---|
| Eyes and brows | Softer oval lid aperture, larger less stark irises, smile-driven lower lids, finer lashes, restrained asymmetric brows and deterministic staggered reactions. |
| Mouth | Less constant gape, warmer cavity, smoother speech-weight response, smaller tooth exposure, restrained closed-mouth expressions. |
| Hands | Shorter fuller fingers, distinct relaxed pose, opposing thumb and fingers fitted around the actual lollipop stem. |
| Clap | Palm support targets derived from geometry, outward wrist angle, cupped fingers, quicker approach, brief contact and slower release. |
| Comparison | Authored reaction beats, linked rotation, shared scrubber, pause/resume, quarter/half speed, front/oblique/side/full-body views and direct video export. |

## Adversarial review → update

The independent review found sharp mouth-corner folds in a stronger sad expression. The mouth range was tamed and rechecked from the front, oblique and side. The original cheek sculpt cannot convincingly produce a deep frown; the restrained sad pose uses the gaze, lids, brows and head.

Actual-mesh contact tests caught residual fingertip crossing and a closed-grip gap. Both were corrected. The preview's clap caption was also aligned with the real contact interval, and its framing/controls were adjusted for laptop and phone screens.

See [independent review](adversarial-review.md), [facial changes](face.md), [hand changes](hands.md), [face validation](proof/face-validation.json), [hand surface checks](hand-surface-checks.json), and [viewer checks](viewer-checks.json).

## Verification and scope

- TypeScript checks for the main application, Worker and comparison pass.
- All 654 unit tests across 46 files pass, including actual-GLB geometry/contact and recorder cleanup tests.
- Independent 363-frame sweep: finite positions/normals and deterministic seeking for both rigs. See [rig sweep](proof/review-final-rig.json).
- Comparison controls checked at 320, 390, 900, 1280 and 1440px widths; no horizontal document overflow or page errors. Pause/resume retains time.
- Main game and other characters are unchanged. The candidate remains opt-in via `mashaPerformance: true`.
- This is a silent authored animation study, not a claim of new audio-aligned lip sync or improved AI directing. The game evaluator does not yet emit the emotion-transition metadata used by the study; applying those blends to generated stories is a separate integration step after visual acceptance.
- Hand evidence covers lollipop grasp/taste and clapping, not every possible prop interaction. Surface measurements are sampled checks, not a continuous collision simulation.
- The source hair, clothing seams/cuffs and cheek topology still limit close-up fidelity. No new fal generation or credit spend was required.

The final encoded video passed independent full playback and inspection of 28 decoded frames. See [recording metadata](recording.json) and [video review telemetry](proof/video-review/review.json). The strongest demonstrated improvement is hand contact; restrained sadness and angular source geometry remain visible limits.

## Deployment

Published only the comparison Worker, version `00e52862-ecdf-4c93-89c2-ee9a3a083399`. The main studio remains on its previous release. [Deployment evidence](deployment.json) records static-asset and video hashes, a successful health response, and the expected password redirects for the page and its assets. Chrome also reached the existing password gate; authenticated live rendering was not reverified. The actual local animation, delivered MP4 and comparison controls were reviewed as described above.
