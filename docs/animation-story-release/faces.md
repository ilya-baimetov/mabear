# Animal facial articulation

Implemented in `src/engine/characters/generatedFace.ts`, `face.ts` and `wolf.ts`. Production wiring is owned by the root in `generated.ts` / `assets.ts`.

| Cast | Change | Explicit limit |
|---|---|---|
| Bear, Lady Bear, Hare, Rosie, Rival Bear | Per-model measured brows, cheek/chin morphs and upper/lower eyelid geometry; complete blinks | Retains the generated sculpt and muzzle; does not create a new open oral cavity |
| Squirrel | Same articulation calibrated after the source-binding repair | Its strongly baked brow/scowl and coarse fur still limit emotional range |
| Wolves | Shared deterministic emotion transitions now drive lids, brows, lips and the separate canine jaw | Existing procedural anatomy and teeth retained |

## Rendered review → update

- Initial lid UV sampling stretched unrelated texture islands across the eyes. Replaced it with colors sampled from the adjacent source skin/fur and a curved closure crease.
- The first front-only blink passed pupil-center coverage but left some of Rosie's baked iris visible at an oblique angle. Pushing that source eye inward worsened its side projection. Removed that deformation and synchronized the original surface's eye-color coverage with the geometric lids. Final oblique renders show closed eyes without that exposed pupil.
- Root visual review found opaque lid discs and hard circular seams. Reduced lid lift, feathered their opacity, disabled lid depth writing and blended sampled skin colors on the original surface. A render caught an unconnected source-coverage uniform; fixed it and added a regression assertion for actual uniform updates. Regenerated all front/oblique frames.
- Avoided a generic human mouth/teeth overlay. Generated animal mouths retain their source silhouette, with controlled cheek/chin movement. Full animal speech-quality mouth interiors need separate muzzle retopology.
- Removed frame-history smoothing from the procedural face. Emotion blends now come from the timeline's convex `emotionWeights`, including interrupted transitions, so reverse seeks restore the same face and canine jaw.
- Identical lid-closure values reuse their geometry; hidden neutral lids are not rebuilt each frame.

## Evidence

- `tests/unit/generatedFace.test.ts`: **8 tests pass**. Six actual GLBs across all 12 emotions and three blink states (216 sampled states); finite geometry/morph attributes; geometric eye-center raycasts and source-blink uniform updates at full closure; fade policy; exact A→B→A seeking. Separate procedural Wolf seek and interrupted-jaw-blend checks pass.
- TypeScript check passes.
- [Production-factory render check](face-render-checks.json): six animals, 24 front emotion/blink frames, zero page or console errors. Shader-based source-eye coverage compiled in the actual WebGL renderer.
- Front proof: `proof/<actor>-face-{happy,sad,surprised,blink}.png`.
- Oblique proof: `proof/<actor>-face-oblique-blink.png` for all six generated animals.
- [Measured source landmarks](cast-face-anchors.json); [Squirrel landmarks after bind repair](squirrel-face-anchors.json).

The CPU ray test checks geometry and does not prove transparent pixel coverage. The front test alone is not proof of complete coverage at every angle; oblique render inspection caught the limitation and drove the fix. These close-up views complement the root's actual-story playback validation. Facial range remains restrained by the source models; the robust gains are visible blinking, coordinated brow/lid/muzzle response and deterministic story transitions.
