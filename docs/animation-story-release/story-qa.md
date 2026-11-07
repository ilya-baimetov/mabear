# Actual-story animation QA

The harness at `tools/animation-story-proof.html` loads the production stage and asset factory, compiles the five shipped English story fixtures through `compileEpisode`, and renders their real `evaluate(timeline,t)` frames. Four additional compiled stories exercise Masha's lollipop/expressions/postures, both Wolves beside the ambulance, and Hare/Squirrel releasing flowers before applause. No showcase pose replaces a story frame.

## Initial Masha integration gate

| Story | Duration | Samples at 0.75s intervals | Initial result |
|---|---:|---:|---|
| Garden visitors | 27.049s | 37 | Finite transforms, no reported contact reach error over 3mm |
| Pancake morning | 46.513s | 63 | Same numerical result; occupied-hand clap requires correction |
| Bear's nap | 60.600s | 81 | Same numerical result; includes carry and clapping while carried |
| Fishing trip | 39.714s | 53 | Same numerical result; includes seated Masha and pier clapping |
| Cozy evening | 34.949s | 47 | Same numerical result; seated skirt preserved; plate support remains weak |
| Masha contact story | 15.865s | 22 | Same numerical result; lollipop grip/taste and expression changes visible |

303 sampled stage frames, 31 action-specific compiled-camera captures and Masha detail captures completed without page errors. [Raw checks](proof/masha-integrated/story-checks.json), [detail sheet](proof/masha-integrated/masha-detail-sheet.png). The baseline uses the same compiler/stage harness before Masha opt-in and is retained under [baseline](proof/baseline/story-checks.json).

These are bounded checks. Finite world matrices do not prove visually valid geometry; a small IK target error does not prove finger/prop surface contact. The full-stage pictures and close-up diagnostics are reviewed separately.

## Findings sent for the correction round

1. Pancake morning keeps the frying pan attached during a subsequent clap. A two-hand clap is incompatible with this occupied-hand state. Both baseline and integrated captures expose it; it must be resolved before claiming reliable story contact.
2. Pancakes in Cozy evening have weak hand/plate support. The accepted Masha trial solved the lollipop only. Integrating that trial alone cannot be described as generalized prop contact.
3. Indoor light exposes the mouth surface's angular patch boundary. This remains a source/rebuilt topology limit, even when the animation evaluates correctly.
4. Some compiled-camera views hide Masha behind Bear or set furniture. Those are retained in the story proof rather than silently replaced by close-ups. Diagnostic images ending in `-detail.png` use an explicitly separate camera to judge rig behavior.

## Reproduction

Start `npx vite --config scripts/animation-story-proof.vite.ts --host 127.0.0.1 --port 5185 --strictPort`, then run `ANIMATION_PROOF_DIR=docs/animation-story-release/proof/final ANIMATION_PROOF_FACES=1 npx tsx scripts/captureAnimationStories.ts`. Set `ANIMATION_PROOF_RECORD=0` for still/sweep checks without recording. The main recording captures full-stage compiled-camera excerpts at their original pace. The separately labelled facial diagnostic changes camera/background, retaining actual compiled story poses. Both recordings are silent; no voice generation or fal credits are used.

`scripts/reviewAnimationStoryVideo.ts <video> <recording.json> <output-directory>` plays each delivered file to completion, records decoder metrics and extracts labelled section frames, including release/catch boundaries. Shader/material prewarming happens before the diagnostic recording clock starts.

## Corrected Masha checkpoint

After the compiler added an explicit put-down before clapping, the frying pan no longer crosses the two-hand clap. The new rig is active in the production asset factory, authored emotions blend through the actual evaluator, candy follows the authored take/give gestures, and the seated skirt morph is preserved. This is the checkpoint passed before proceeding to the cast improvements.

- [Corrected story recording](proof/masha-corrected/actual-story-animation.mp4): 18.592 seconds, 1280×784, 558 decoded frames, complete playback, zero dropped presentation frames in the review browser.
- [Decoded contact sheet](proof/masha-corrected/video-review/full-sequence-contact-sheet.png): 18 samples from the delivered recording, not replacement renders.
- [Stage/geometry checks](proof/masha-corrected/story-checks.json): 304 sampled stage frames, all finite, no page errors, no reported Masha reach error above 3mm. Ten actual rig geometry signatures restore exactly after seeking to other stories and back.
- [Capture metadata](proof/masha-corrected/recording.json): 1,116 animation callbacks, maximum interval 16.8ms. This describes this desktop capture, not every device.

Remaining real-story observations carried into the final review: armchair stand-up sinking, weak pancake support, some foreground occlusion, and awkward Bear/Masha body contact in the carry excerpt. Cast work and subsequent corrections are not represented by this intermediate Masha checkpoint recording.

## Furniture correction

Actual story renders showed that the first grounding correction preserved the starting seated pose but still lowered Masha through the cushion halfway through standing. The compiler now authors a forward furniture-exit path for explicit and automatic `stand_up`, stores the cleared position for the following action/paragraph, and the evaluator advances this path before the pelvis lowers. Ground sitting does not gain an invented furniture step. The same real-story test also exposed an indoor-to-outdoor camera cue whose initial framing was outside the retained side wall; that cue now starts in a valid indoor composition before its existing location cut.

[Six sampled transition phases](proof/seat-exit/checks.json) and their compiled-camera/detail captures verify the corrected chair exit. [Actual middle frame](proof/seat-exit/stand-0.5.png) shows Masha in front of the chair instead of inside its cushion. `storySeatExit.test.ts` covers the real Cozy evening path/camera, automatic bench exit with next-paragraph continuity, and ground sitting. The targeted evaluator/camera/hand/seat suite passed 35 tests; TypeScript passed.

This correction is authored movement around known furniture, not general mesh collision simulation. It does not claim to repair every possible chair/actor placement.

## Final review corrections and evidence

The boundary review found discontinuous Masha clap entry/exit, Bear's fishing grip entry/catch transition, and a pan that changed ownership before reaching its resting location. The correction now blends contact solving at action boundaries, authors a walk to a reachable surface, aligns the hand/object to the exact resting transform, and releases ownership while retaining that contact. Small actors place props on the ground with a supported squat; Masha/Rosie use the bench and taller actors use the table. Their shoulder offsets and arm lengths come from the shipped rigs. Counter-rotating the head during deep squats corrected an initially rejected face-down pose.

| Final gate | Observed result |
|---|---|
| Actual stage sweep | 9 compiled stories, 357 frames at 0.75s intervals; all world transforms finite |
| Geometry seek restoration | 18 sampled actor/scene signatures restore exactly after unrelated seeks |
| Contact holds | No reported reach residual above 3mm at full solving strength |
| Real rendered release boundary | Pan origin jumps 0.0109mm; Hare flowers 0.0063mm; Squirrel flowers 0.000067mm across ±100µs |
| Browser errors | None |
| Main recording clock | 2,516 animation callbacks; maximum interval 16.8ms on this desktop |
| Facial diagnostic clock | 1,014 animation callbacks; maximum interval 33.4ms |

[Final stage checks](proof/final/story-checks.json) include asset load status, contact measurements, prop/world-space boundary samples and hashes. One unconstrained target residual remains during Bear's intentional fishing-grip fade (strength 0.081); it is separately logged as a transition residual, not counted as a full-strength contact hold. Finite matrices and target measurements are supplemented by the visual review.

The actual-camera recording includes Masha's entire bench approach, pan release and following clap; fishing entry, catch and exit; the house chair exit; the expanded cast; both Wolves; and the corrected small-character ground releases. Low side-camera stills separately expose the squat silhouettes and tail/arm surfaces. The independent `storyPutDownCast.test.ts` gate checks actual compiler-to-GLB release origins, rotations, ownership, hands and seeking for all nine characters plus the real Pancake story.

[Final story animation](proof/final/actual-story-animation.mp4) is 41.926633 seconds at 1280×784. The delivered file decoded all 1,258 frames, reached its end and dropped zero presentation frames in the review browser. Its [52 extracted frames](proof/final/video-review/full-sequence-contact-sheet.png) include before/after ownership release and fishing catch boundaries; [decode metadata](proof/final/video-review/review.json) records their times.

The [facial diagnostic](proof/final/diagnostic-story-faces.mp4) keeps the actual compiled poses/expressions, follows each head's measured eye axis and isolates the set/sky so every face can be judged. This is explicitly a different camera/background, not evidence of the normal story composition. Its final 17.163267-second file decoded 496 frames, reached the end and dropped zero presentation frames. The [decoded contact sheet](proof/final/face-video-review/full-sequence-contact-sheet.png) and [decode metadata](proof/final/face-video-review/review.json) cover all nine actors.

Remaining boundaries: silent QA does not establish audio-aligned performance; diagnostic backgrounds/cameras differ from story cameras; generated source fur and mesh folds remain coarse; some story views contain foreground occlusion; Bear/Masha shoulder-carry body contact remains a separate legacy limitation. Reachable-surface routing can introduce an authored walk or an existing scene-transition cut before applause. This is authored choreography, not general collision simulation.
