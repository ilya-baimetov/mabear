# Masha facial refinement

Scope: `src/engine/characters/mashaPerformance.ts`, the opt-in Masha candidate only. The shipped generated Masha and other actors are unchanged. The previous comparison bundle was frozen by the parent at commit `7ecd9b3` before this work.

## Changes

| Area | Previous candidate | Updated candidate |
|---|---|---|
| Eyes | Uniformly round openings and symmetric lid compression read as inset discs. | An upper lid that drapes and a lower lid that lifts with a smile; slightly larger, softer green irises; finer lashes. Full blinks close to a common seam. |
| Brows | High, conspicuous arcs, often crossing the painted fringe. | Lower, quieter brow shapes. During a transition, lids react first and brows settle slightly later. |
| Emotional mouth | Shared broad presets left a listening smile conspicuously open. | Masha-specific emotional rest openings; narrower jaw drop and warmer cavity. Surprise remains a distinct O; sadness uses a restrained downturn; mischief retains asymmetric corner lift. |
| Speech articulation | The `visemeWeight > .05` branch abruptly changed aperture scale. | Continuous smoothstep articulation with no threshold branch. |
| Teeth | Small rooted incisors, following the prior user correction. | Retained that form; slightly less exposure and deeper placement behind the upper lip. No return to rounded detached teeth. |
| Contact contract | Three-second cosine taste phase and animated tongue target. | Timing and callback contract retained. The hand solver receives the updated tongue target rather than a fixed mouth coordinate. |

The expression changes are deterministic functions of the input frame. They do not use prior-frame smoothing, random noise or hidden elapsed time.

## Verification

- `npm run performance:build` passed after the first refinement.
- `npx vitest run tests/unit/mashaPerformance.test.ts`: eight actual-GLB tests passed on the final rerun.
- Live browser geometry checks: all 12 emotions × lid closure 0/.5/1 produce finite positions and normals; applying other expressions and seeking back restores the exact facial geometry.
- Across speech weight .0499 → .0501, maximum mouth vertex movement was approximately 0.000001073m (1.07µm); the old binary threshold is gone. This is a geometric continuity check, not an audio-aligned lip-sync claim.
- Actual rendered review covered rest, delight, complete blink, surprise and settled sadness in the shared comparison. Diagnostic captures are `proof/refined-face-*.png`; root's final synchronized video is the comparison deliverable.
- Raw bounded measurements: [face-validation.json](proof/face-validation.json).

A stronger sad-mouth corner drop was tried, then rejected in adversarial review because it exposed diagonal folds against the source cheek dimples. The final closed-mouth range stays wider and the curve is restrained; lids, brows and the shared head acting carry the sadness. Front, three-quarter and side inspections at8.5s are saved as `proof/face-final-sad-*.png`.

## Remaining limits

The source fringe and cheek texture remain coarse. The generated cheek dimples still carry a smiling bias, which limits a fully convincing sad face. The stitched mouth annulus retains small projected corner reversals (0–12 triangles depending on expression); no new visible crack was seen in the sampled views. This is an improved articulated preview, not production-quality head retopology. The older `previous-candidate-*` captures are diagnostic history from the prior acting timeline and camera, not the final fair before/after comparison.
