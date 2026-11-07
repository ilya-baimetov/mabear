# Cast facial and contact reconnaissance

Read-only inspection before the Masha integration gate. No paid asset generation.

## Confirmed runtime gaps

`generatedRig` currently creates facial updates only for Masha. Bear, Lady Bear, Hare, Rosie, Squirrel and Rival Bear retain their baked facial expressions while moving their bodies. Wolves use the procedural face rig with eyelids, brows and a separate moving canine jaw, but their emotion selection is discrete.

Generic held props use the wrist location plus a single per-prop `PROP_VISUALS.grip` offset, without measuring each imported paw/hoof. Applying a human finger replacement to every actor would change their anatomy and is not appropriate.

| Actor | Current source | Facial priority | Contact priority |
|---|---|---|---|
| Bear | Generated textured mesh, small baked eyes and broad muzzle | Complete blinks, coordinated heavy brows and restrained muzzle/chin motion | Rod and frying-pan support; surface-aware clap |
| Lady Bear | Generated textured mesh, distinct long muzzle | Soft asymmetric brows/lids and cheek response | Flowers and clap, keeping paw proportions |
| Hare | Generated textured mesh, large sclera and long ears | Eyelid closure and readable surprise/listening | Actual carrot grasp/eat path with small paws |
| Rosie | Generated smooth pig, tiny eyes and large snout | Lids and cheek/chin response; preserve pig snout | Hoof-based support; no invented human fingers |
| Squirrel | Generated mesh with incorrect tail/arm assignment | Repair source binding before reliable calibration | Do not run generic arm IK against a tail |
| Rival Bear | Generated textured mesh with heavy brows | Brow tilt and narrowed/widened lids | Heavy paws, measured support and clap |
| Wolves | Existing procedural eyes/brows/canine jaws | Blend new story transitions, maintain jaw/face agreement | Source-preserving paw targets; check muzzle/profile |

## Measured source evidence

[Normalized bind measurements](cast-raw-measurements.json), [canonical-rest measurements](cast-measurements.json), and [surface-hit facial anchors](cast-face-anchors.json) were captured from the actual GLBs. The raycast anchors are normalized bind-space metres, with head-local equivalents and UVs; they are calibration data, not assertions that the landmarks are already animated.

The six current face renders are in `proof/baseline/*-before-front.png`; raw bind-pose views are in `proof/*-raw-front.png`.

### Squirrel defect

[Squirrel skin diagnosis](squirrel-skin-diagnosis.json) distinguishes a masking issue from a true binding defect:

- `Head` has no vertices above .5 weight, but its descendants `head_end` and `headfront` own 4,369 and 631 respectively. Facial masks must include descendants.
- `LeftArm` owns 44,168 dominant vertices concentrated in the rear tail volume. `LeftHand` owns 29,529 dominant vertices near the tail tip. `RightHand` owns no dominant vertices.
- The raw model is side-facing relative to the shoulder-derived canonical facing. Canonical arm motion moves the tail across the head.

A bone-name permutation alone cannot recover a missing symmetric arm rig. The source-preserving option is a tailored bind/weight correction: establish facing from actual face/leg symmetry, remove tail vertices from the arm chain, bind the tail to its own motion or pelvis, then calibrate genuine paw chains. Generic paw/contact deformation must remain disabled until that calibration is reliable.

## Implementation seams

| Owner | Files | Contract |
|---|---|---|
| Masha integration agent | `evaluate.ts`, `api.ts`, `motion/emotion.ts`, asset enable flag | Deterministic `emotionTransition`, optional interrupted `fromWeights`; shared `emotionWeights` |
| Face agent | New `generatedFace.ts`, `face.ts`, `wolf.ts` | `createGeneratedFace(id, meshes, bones, root)` returning `update(frame)` and `dispose()` |
| Root/contact agent | New generated contacts, prop support metadata, squirrel binding repair | Geometry-derived per-actor support and fixed prop-origin transforms; preserve anatomy |
| Root | `generated.ts` wiring, story fixture playback/capture, final release | Apply facial/contacts after skeletal retargeting, shared opacity and disposal |

## Validation requirements

1. Actual compiled stories, including transitions and reverse seeking, not only an isolated animation study.
2. Render neutral, happy, surprise, sadness, blink and speech from front/oblique/profile for each modified face.
3. Verify finite positions/normals, complete blink coverage, no detached eyelid/muzzle surface, bounded geometric displacement and deterministic seeking.
4. Check contact against actual paw/hoof surfaces and the actual prop transform, separately from wrist-socket target error.
5. Show representative continuous video with story camera/lighting, including Bear fishing/cooking, Hare/carrot, group clapping and indoor dialogue.
6. Run independent adversarial review of rendered artifacts, correct consequential defects, then deploy.

## Opinion

The biggest safe improvement is to animate the baked animal faces without replacing their species-specific anatomy. Full speech-quality animal mouths require dedicated muzzle retopology; a generic human mouth pasted over each muzzle would regress likeness. Squirrel's binding needs correction before claims about broader cast contact quality are credible.
