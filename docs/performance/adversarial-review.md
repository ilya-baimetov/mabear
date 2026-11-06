# Masha performance checkpoint — 2026-11-06

Scope: Masha only, in a separately deployed authenticated comparison. The candidate is opt-in and is not enabled in the main game. The user reviews this actual animation before the method is extended to other actors.

## Review → update

| Finding | Final correction | Evidence / limit |
|---|---|---|
| Skirt recolouring also attached sleeve highlights to the pelvis, producing severe arm spikes. | Restrict candidate skin-weight repair to the actual skirt silhouette. | Front/oblique hold and clap comparisons. Residual generated clothing cracks are not a completed clothing pass. |
| Baked eyes could not close, look, or change expression; initial replacement left old lashes and open edges. | Recover truly closed source contours, remove detached local fragments and lash fans, reproject clean skin, smooth the eye transition, and animate lids, lashes, brows and gaze. | Independent front/blink/sad/oblique proofs. Painted hair and extreme close-up skin shading remain limitations. |
| Mouth radial deformation folded below the chin. | Stitch three source-contour ears statically and deform an ordered 48-column mouth annulus. | Independent sad case: 55 reversed triangles to zero; wide-open case zero. Small neutral/smile corner reversals remain; this is not production retopology. |
| User rejected rounded, bright, dangling teeth. | Smaller, flatter matte ivory upper incisors, rooted behind the upper lip. | Updated actual recording `proof/masha-before-after-v2.mp4`. |
| Expression changes snapped every two seconds. | Blend emotion targets over an absolute-time transition; fade speech before the next expression. | Recorded face sequence and deterministic seeking. Silent study; no speech-alignment claim. |
| Original generated hands could not form a convincing grip. | Replace fused hands with four tapered articulated fingers, an opposing thumb and a shaped palm; embed roots and cover the source wrist cut with a rolled cuff. | Front/side grasp and clap inspection. A small palm-pad overlap of about 2 mm is retained; target agreement does not imply zero surface penetration. |
| Tongue appeared detached in the taste pose. | Keep its rear anchored inside the mouth while extending the tip to the candy surface. | Updated oblique/side taste inspection and actual tongue-target contact. |
| Contact targets failed in seated/carried poses. | Solve measured arm lengths against shoulder-relative goals and torso-relative orientation. | Actual shipped GLB tests cover stand/sit/sleep/carried. Hardcoded facial geometry remains specific to the one-metre Masha asset. |
| Lollipop followed an approximate wrist offset and missed the mouth. | Author a grip transform, align the prop exactly, and target its rear surface against the animated tongue tip. | Final sweep maximum grip error is numerical noise; taste-surface gap about 0.0073 mm. These are geometric anchors, not a collision simulation. |
| Rebuilt face ignored fades. | All owned facial and hand materials follow actor opacity and depth-write policy. | Actual-GLB regression checks 0.5 → 0 → 1 opacity. |
| Recorder errors leaked tracks or hung. | Cleanup covers construction/start/frame/encoder failures, restores renderer state, cancels RAF, and stops tracks. | Five recorder success/failure tests plus a real 24.002-second browser capture. |
| Review controls fell below laptop screens. | Fit shared timeline, scene controls, linked orbit, camera presets, slow playback and video save around the two renderers. | Laptop and narrow-screen browser checks. |

## Verification

- Main application, Worker and comparison TypeScript pass.
- Full unit run: **541 tests across 31 files pass**, including new actual-GLB contact/facial and recorder regressions.
- Final browser sweep: **363 frames**, all geometry finite, deterministic seeking, maximum palm-target error **0.0109 mm**, maximum reach error **0.0350 mm**. Results in `browser-checks.json`.
- Initial main-game E2E baseline passed 15 scenarios. The redesigned UI has its own updated regression run; see the UX release evidence rather than treating the old selectors as proof of the new UI.
- Recorded output is the two real WebGL canvases, 1920 × 850, 24.002 seconds, silent.
- Deployment verification and version are recorded in `release.json`.

## Judgment

The candidate adds real articulation, a closed grasp, visible palm contact and more expressive faces. The source hair, clothing and remaining facial patch transitions are below show-production quality. This is a concrete comparison for judging the improvement, not a claim that all character work is finished.

No new fal generation or credit spend.
