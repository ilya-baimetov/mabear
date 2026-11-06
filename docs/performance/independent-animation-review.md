# Independent Masha animation review — 2026-11-06

**Current judgment:** the refreshed Masha candidate is ready for the user's before/after review. The eye-specific defects are corrected, the grasp is substantially stronger, and the final renders show connected finger roots, covered wrist openings, and an extended tongue joined to the mouth. No new checkpoint blocker appeared in this bounded re-review. Residual sleeve seams, source clothing shards, and approximately 2 mm of clap-pad overlap remain. Keep the candidate isolated from other actors and the main game until the refreshed comparison is accepted.

Reviewed the live WebGL comparison in an isolated browser context at `http://127.0.0.1:5184/`, the supplied hero image, and the facial/contact/viewer code. The `review-*` screenshots capture the version **before the subsequent corrections**. The parent delegated `cutRegion`, then the eye-building loop and eye-specific helpers; those changes are recorded below. Hand rebuilding, mouth repair, and expression transitions were implemented by the parent. No browser viewport, deployment, or paid generation was changed. The existing full E2E suite was not duplicated.

## Initial findings — before the corrective passes

| Priority | Finding | Evidence and reproduction | Recommended correction |
|---|---|---|---|
| P2 — checkpoint blocker | Facial replacement still exposes cracks, hard patch boundaries, and old eyelashes above the moving lids. | **Observed renders:** Face, Front, `t=0`: magenta slit at the outer eye and angular skin patch; `t=2.4`: blonde lashes remain above the closed lids; `t=6.5`: bright vertical crack below the mouth. [Neutral](proof/review-face-neutral.png), [blink](proof/review-face-blink.png), [sad](proof/review-face-sad.png). | Close every cut boundary, eliminate overlapping/folded replacement triangles, and remove or rebind old lash fragments. Reinspect these exact times after the fix, including oblique views. The blink aperture itself closes convincingly; the surrounding surface does not. |
| P2 | The maximum “taste” pose stops short of the mouth. | **Observed renders:** Hold, `t=1.5`, both side views show air between lips/tongue and candy while the nose nearly touches the candy. [Side](proof/review-taste-side.png), [opposite side](proof/review-taste-other-side.png). Live `mouthDistance=0.0269997 m`. | Target the candy's rear surface against an actual lip/tongue point and account for head orientation. `mashaContacts.ts:79` deliberately adds `z=.027`; the candy is `.025 m` thick (`props.ts:101`). That gives approximately `.0145 m` from the authored mouth anchor to its back face, before considering the actual lip shape. The existing “hand-to-mouth contact” export caption overstates the result. |
| P2 | The grip attaches reliably but does not yet read as a closed grasp from the side. | **Observed render:** fingers curl, but the thumb remains upright away from the stick, without opposing the fingers. [Grip side](proof/review-grip-side.png). **Code:** the morph bends the hand's longitudinal region uniformly; there is no separate thumb opposition. | Add an authored thumb/pinch deformation and inspect stick clearance through the full cycle. The near-zero `gripError` only validates socket construction from the same `actualGrip` anchor (`mashaContacts.ts:83–84`); it does not measure finger/prop surface contact. |
| P2 | Expressions snap at the two-second boundaries. | **Live geometry measurement:** maximum mouth-vertex change over `3.999→4.000 s` is `0.03853 m`; `5.999→6.000 s`, `0.02066 m`; `7.999→8.000 s`, `0.01605 m`. **Code:** `viewer.ts:38` changes the emotion enum instantly, and the facial updater applies its preset immediately. | Blend the underlying mouth/lid/brow targets over a short authored interval, calculated from absolute timeline time so seeking stays deterministic. The speech-to-surprise boundary at `4 s` is the largest discontinuity. |

## Follow-up: exact topology diagnosis and scoped repair

Fresh-source reconstruction established that the reported 53- and 9-vertex “loops” at eye center `(-.053,.7449)` were **both open chains**, not separate islands. Original open hair/lash edges created degree-1/degree-3 branches in the removed-triangle edge graph. Greedy traversal split the real contour, and modulo indexing invented closing edges.

The scoped `cutRegion` repair now accepts only frontier edges shared by a removed and a retained triangle, removes small newly detached local remnants, and requires actual closed, degree-2 contours. The former 9-vertex chain is part of the recovered 61-vertex outer contour. True small retained islands bounded by 5-, 4-, and 5-vertex loops contained 15, 9, and 5 triangles; these detached local pieces were removed. The first eye similarly shed 45 detached triangles. The mouth retains its original genuinely closed 51-vertex boundary.

`npx tsc --noEmit -p tsconfig.performance.json` passes. Fresh render inspection at the original neutral/blink/sad times confirms the outer-eye magenta slit is gone: [neutral](proof/repaired-cut-neutral.png), [blink](proof/repaired-cut-blink.png), [sad](proof/repaired-cut-sad.png). The static upper lashes, angular eyelid patch shading, and sad-frame chin crack remain. Remaining old lashes are attached to source geometry outside the cut; no broad deletion was attempted. **Inference:** the mouth's radial strip may fold where its irregular source contour is non-monotonic in angle; the chin crack needs separate inspection of the mouth surface rather than further boundary traversal changes.

## Follow-up: completed eye refinement

The eye cut now extends toward each temple to include the original lash fan while retaining the forehead. Removed lash colour is replaced with clean forehead/temple skin, feathered back to the source texture along the actual boundary. The lid no longer samples the source's eye/lash ridges at every vertex; its support contour is smooth and constrained inside the cut. Averaged normals cross the sparse outer bridge and dense moving ring while preserving source boundary normals. A larger aperture and shallower eye placement retain more of the original eye proportions.

**Observed:** old stationary lashes and the dark lower-eye crease are absent in the new neutral, blink, sad, and oblique renders. New lashes follow the eyelid. Full closure hides the eyes in front and three-quarter views. Some surrounding source cheek/hair faceting and a faint eyelid-to-cheek tonal change remain at extreme close-up; this is not a fully retopologized head.

- [Neutral, 1.7 s](proof/eye-refined-neutral.png) and [blink, 2.4 s](proof/eye-refined-blink.png).
- [Sad, 6.5 s](proof/eye-refined-sad.png), [three-quarter](proof/eye-refined-three-quarter.png), and [three-quarter blink](proof/eye-refined-blink-three-quarter.png).
- TypeScript passes. Positions and normals remain finite for all 12 emotion presets at lid closure `0`, `.5`, and `1` (36 states). Full-blink rendered-pixel hashes match after seeking through other states (`3099530886` twice). Normal smoothing reuses buffers; it adds no per-vertex vector allocations or undisposed textures.

## Follow-up: independent review of the rebuilt hands — before final join repairs

| Area | Observed result | Remaining action |
|---|---|---|
| Grasp | Four fingers wrap the stick and the thumb opposes them. No gross prop penetration was visible in sampled hold/taste poses. [Hold](proof/hand-rebuilt-review-hold.png). | The resting left hand exposes a sawtooth source-mesh edge at the cuff; extend the concealment or repair that boundary. |
| Finger/palm junction | Smoother fingers replace the original fused geometry. [Clap side](proof/hand-rebuilt-review-clap-side.png). | Flat tube starts remain visible at finger bases. Embed/blend the roots into the palm. |
| Clap | The rebuilt palm pads meet. [Front](proof/hand-rebuilt-review-clap.png), [three-quarter](proof/hand-rebuilt-review-clap-three.png). | At `.3 s`, measured center separation is `.022 m` against two `.012 m` semi-thicknesses: approximately `.002 m` pad overlap. Visually small, but the old anchor's positive `.002 m` separation is not a zero-penetration metric for the new mesh. |
| Taste | The tongue tip now reaches the candy surface. [Side](proof/hand-rebuilt-review-taste-side.png). | The extended tongue appears as a detached oval outside the mouth. Its base should remain visibly connected inside the mouth while the tip extends. |

## Final bounded re-review: repaired joins

Reloaded the latest local build in the independent browser context and inspected four new paired renders. Only this report and the proof screenshots were changed during this final review; no engine changes or full test rerun were made.

| Area | Final observed result | Residual limit |
|---|---|---|
| Wrist | The rolled cuff covers the former exposed hand cut in hold at `0 s`. [Wrist join](proof/final-review-wrist-join.png). | The resting left sleeve retains a jagged patterned edge over the new cuff. The added plain cuff is visibly distinct from the source sleeve. This is a remaining cloth seam, not the prior open skin boundary. |
| Finger roots | Finger and thumb roots are embedded in the palm; the previous flat tube starts no longer show in the inspected side and oblique clap views at `.3 s`. [Side](proof/final-review-finger-roots.png), [oblique](proof/final-review-clap-contact.png). | The hands remain stylized procedural geometry. These views do not establish anatomical accuracy or a fully blended production hand mesh. |
| Extended tongue | In the side taste view at `1.5 s`, the base is visibly continuous with the mouth and the tip reaches the candy. The earlier detached oval appearance is corrected. [Tongue contact](proof/final-review-tongue-contact.png). | This is visual confirmation at maximum extension, not a new surface-distance sweep. |
| Clap | Both palm pads visibly meet in side and oblique views. No gross hand crossing is visible in these samples. | Retain the earlier independently measured approximately `.002 m` pad overlap; the unchanged palm dimensions still do not support a zero-penetration claim. |
| Clothing | Severe baseline wrist spikes are removed. | Underarm shards, dress cracks, and sleeve-edge artifacts remain visible, especially from the side. Clothing is not finished. |

## What passed and what remains unproven

| Area | Independent result | Limit |
|---|---|---|
| Clap | Final side and oblique renders show palm contact at `t=.3`; see the final re-review above. | Approximately 2 mm of previously measured pad overlap remains. Anchor separation does not establish mesh separation. |
| Sleeve repair | The candidate removes the baseline's severe arm/wrist spikes in the inspected hold and clap poses. | Dress cracks and some torso/underarm artifacts remain visible; these are not a completed clothing pass. |
| Facial controls | Real opening, rounded mouth shapes, moving gaze, and closed blinks are observable improvements. Final clap renders show smaller incisors replacing the earlier pill-shaped teeth. | Added articulation alone does not establish polished acting. The faint lid-to-cheek tonal change and surrounding source faceting remain close-up limits. |
| Seeking | Complete rendered-pixel hashes match exactly after switching `face 2.4 → hold 1.5 → clap .3` and repeating all three states, for both renderers. | A bounded independent spot check, not a replacement for the existing 363-frame sweep. |
| Comparison integrity | Both renderers receive the same frame and camera inputs; the candidate is opt-in. Capture code draws those live WebGL canvases. | No audio/lip-sync claim is supported. This review used live still-frame inspection and code; it does not certify the saved MP4's complete temporal playback or frame pacing. |

The parent reports a fresh 363-frame finite/deterministic sweep and 541 passing unit tests. Those checks were not independently rerun here. The supplied final recording is [masha-before-after-v2.mp4](proof/masha-before-after-v2.mp4); this review does not claim to have watched its complete playback.

**Advice:** show the refreshed Masha comparison for user judgment now. Keep clothing cleanup and the small clap overlap explicit, and review the complete recording before propagating this implementation to the rest of the cast.
