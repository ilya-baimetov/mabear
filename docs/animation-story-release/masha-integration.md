# Masha in actual stories

The accepted articulated Masha face and contact rig is now enabled by the production asset loader. It is no longer exclusive to the performance comparison.

## Integration changes

- The production evaluator now emits deterministic expression transitions independently of the body's discrete facial-enum crossfade. Interruptions retain the currently displayed expression mixture, including short clips, gaps and paragraph boundaries. Source mixtures are consumed by the shared `emotionWeights` helper. Production eyelids and brows share that continuous timing; the comparison's single-source stagger remains available.
- Semantic expression cues are derived from the real motion implementations and held postures. A signature invalidates cached cues when clips are edited in place.
- Preserved the seated skirt morph when the articulated face is enabled. Previously the skirt bend was accidentally bundled into the baseline face path, so simply enabling the candidate would regress sitting scenes.
- Preserved authored arm motion for taking, giving and gesturing with candy. The candy socket follows the opposing finger grip; idle/tasting retain the accepted precise hold IK.
- Disabled the empty-hand clap contact solver when an object is held. The compiler's new set-down-before-clap path releases the object midway through a reversed take pose; the evaluator understands that event and time reversal.
- Uses shared clap contact timing so animation and sound can be aligned by the compiler.

## Verification

Targeted evaluator, contact and actual-GLB tests passed before the final compiled hand-availability check. Tests compile all ten English/Russian example stories, verify normalized finite expression mixtures, reverse-seek determinism, interrupted emotion continuity, in-place edit cache invalidation, seated `cozy_evening` skirt/feet, and candy grips through authored take/give/wave/clap inputs.

The first independent actual-stage sweep covered 303 samples across the five English fixtures and a custom compiled interaction story. It reported finite frames, no JavaScript errors, and no Masha reach error above 3mm. Full-stage capture/review evidence is owned by the story-animation QA agent; this document does not substitute geometric tests for that visual gate.

## Limits

The precise custom finger cylinder remains specific to the lollipop. Generic prop grip coverage is being handled in the cast contact pass. Strong sadness remains limited by the source cheek sculpt. Expression blending is now integrated into actual story evaluation; this does not constitute a new speech-alignment model.
