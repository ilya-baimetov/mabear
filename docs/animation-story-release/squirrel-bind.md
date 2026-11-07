# Squirrel anatomical binding repair

The existing GLB's automatic skeleton assigned most of the tail to the left arm/hand and had no dominant right-hand vertices. Ordinary waving/clapping therefore moved the tail across the head. The source surface itself was usable.

## Repair

- Rebound the same textured mesh to measured head, spine, paw and leg landmarks. The corrected shoulder/head frame establishes anatomical facing; the root is centered on the pelvis instead of the tail-inclusive bounding box.
- Added a separate pelvis-parented tail bone. Tail geometry no longer follows either arm or the head.
- Preserved triangle topology, UV coordinates and material/texture objects. Rest positions differ by at most 0.0261mm after baking source skin transforms. Normals are preserved in float attributes to avoid a second quantization loss.
- Classified arm versus torso influences using relative distances to their anatomical chains. The full chain includes palm/fingertips, preventing fingertips from being attached to the belly.
- Smoothed weights over the actual surface adjacency graph, joining coincident UV seams for the solve. This corrected the first pass's triangular arm sheets and stretched tail-root strips during jumping.
- Updated deterministic motion proportions from the repaired rig. The calibrated hip-height mismatch is below 0.001mm.

[Final measurements](squirrel-repaired-measurements.json) record 303 left-paw and 239 right-paw vertices above .7 weight, versus the original missing right-paw group. [Source diagnosis](squirrel-skin-diagnosis.json) and [measured landmarks](squirrel-landmarks.json) document the input.

## Checks

All three actual-GLB tests in `tests/unit/squirrelBind.test.ts` pass:

1. Bind positions/normals, triangle indices, UVs and material preservation.
2. Usable bilateral paw weights; tail vertices remain unchanged when only the arm chains rotate.
3. Compiled `garden_party` action samples, including jump/clap, remain finite, respect the geometric edge-stretch bounds, and restore identical geometry after reverse seeking.

Rendered proof: [front bind](proof/squirrel-repaired-bind-front.png), [wave](proof/squirrel-repaired-wave.png), [clap](proof/squirrel-repaired-clap.png), [jump](proof/squirrel-repaired-jump.png), [jump side](proof/squirrel-repaired-jump-side.png). These close-up pose checks support the independent full-stage story review; they do not replace it.

## Limits

The source remains angular at elbows and fingers, with dense textured fur cards in the tail. This repairs binding and enables reliable paw/contact calibration; it does not create separately articulated squirrel fingers or replace the mesh with production topology. Tail movement currently follows the pelvis, independent of the arms.

The discarded source skeleton and geometry were only inspected on the CPU before any render upload. They become unreachable after `loadCharacter` returns and can be collected. Materials and texture/image objects are deliberately shared with the repaired mesh and remain owned by the normal generated-rig disposal path; disposing those during rebinding would invalidate the repaired character.
