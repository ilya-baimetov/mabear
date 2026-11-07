# Independent Masha animation review — v3

Review scope: Masha's face and hand contacts. Main-game baseline is the shipped generated rig; the updated candidate remains opt-in. No other character is included in this review.

## Initial rendered findings

Inspected the initial paired WebGL captures and the previous performance review. The prior experimental candidate articulates more than the shipped baseline, but that alone does not establish convincing acting.

| Priority | Initial finding | Evidence | Required update |
|---|---|---|---|
| P2 | Eyes read as round inset discs with limited emotional lid shaping. | [Face at 2.95s](proof/initial-face-2.95.png). | Shape upper/lower lids and brows as coordinated expressions while preserving Masha's identity and full blink closure. |
| P2 | Happy/speech mouth is dominated by a dark wedge and angular corners. | [Face at 2.95s](proof/initial-face-2.95.png). | Contain the rest opening, soften the cavity/edge relationship, and retain modest teeth rooted behind the lip. |
| P2 | Relaxed fingers are long, separated and claw-like. | [Hold at 1.5s](proof/initial-hold-1.5.png), especially the left hand. | Improve childlike proportions and author a relaxed shape separately from the grasp. |
| P2 | Clap meets its targets but reads as straight prayer hands. | [Clap at .3s](proof/initial-clap-0.3.png). | Inspect anticipation, approach, surface contact and release, including a slightly cupped/asymmetric silhouette. |

The earlier review's known approximately 2mm palm-pad overlap must be evaluated against actual surface geometry, not treated as solved because socket/contact target error is small.

## Corrective round and rendered re-review

| Area | Final rendered observation | Evidence / limit |
|---|---|---|
| Eyes and blinks | Upper/lower lid shapes and larger softer irises read less like inset discs. Full closure at .70s is clean; lashes follow the lid. | Live front, oblique and closed-blink inspection. The original hair and cheek faceting remain. |
| Mouth | Contained neutral/listening mouth and a smaller rounded surprise opening replace the permanently open dark wedge. Teeth remain modest and rooted behind the upper lip. | Neutral, delight, surprise and oblique sampled renders. This is facial articulation, not verified audio-aligned lip sync. |
| Sadness | An attempted stronger downturn created sharp diagonal wedges at the mouth corners. The corrective pass restrained that deformation and restored a stable surface in front/oblique/side views. | [Final front](proof/face-final-sad-front.png), [oblique](proof/face-final-sad-three.png), [side](proof/face-final-sad-side.png). Sadness remains subtle and relies on gaze, lids, brows and head; the baked smile dimples limit deep frowns. |
| Grasp | Shorter fingers and a separate relaxed pose remove the claw-like free-hand silhouette. The thumb opposes the curled fingers around the stick. | [Side grasp](proof/review-final-hold-0-side.png). The hand agent's transformed vertex/triangle-center tests measure sub-millimetre stem proximity for all five digits. |
| Taste | The candy comes to the mouth while the hand retains its grasp; no gross stick or hand penetration is visible in the reviewed side view. | [Side taste](proof/review-final-hold-1.5-side.png). A bounded visual check plus contact-target metrics, not full soft-tissue collision simulation. |
| Clap | Cupped fingers and angled wrists keep the cuffs apart; palm approach/contact/release reads more naturally. | [Contact side](proof/review-final-clap-0.3-side.png), [release](proof/review-final-clap-0.43-three.png). The new test checks a separating plane against every rebuilt hand vertex, including fingers, thumbs and cuffs. |
| Presentation | The viewport/header was compacted and camera pulled back so the hood and lower camera/record controls fit. | Re-inspected in the live preview after the root's update. |

I also found the clap caption still labelled a broader interval as contact after the contact timing changed. The root was asked to align the label with the actual .27–.33s hold.

## Comparison integrity and integration boundary

Both renderers use the same source GLB, body-motion inputs, time, camera and lighting. Only the right renderer enables the Masha facial/contact candidate. The authored acting sequence is intentionally shared. Baseline production factory behaviour and other actors are unchanged.

`emotionTransition` is currently emitted by the comparison's `performance/acting.ts`; the production evaluator does not emit it. Therefore this checkpoint demonstrates real rig behaviour under authored inputs. It does **not** establish that blended emotional acting has already been integrated into arbitrary generated stories. That is a subsequent Masha integration step after the user's visual judgment.

## Final encoded-video review

Reviewed the final [24-second comparison](proof/masha-before-after-v3.mp4), including full browser playback to the ended event and visual inspection of [28 decoded frames across the complete sequence](proof/video-review/full-sequence-contact-sheet.png). Enlarged checks covered full blink closure, speaking smile/teeth, surprise, subdued sadness, peak taste contact, and front/oblique palm contact. These are frames extracted from the delivered MP4, not substitute still renders.

| Sequence | Encoded result | Remaining limit |
|---|---|---|
| Face, 0–12s | Expression changes are visible against the largely fixed baseline face. Complete closure hides both eyeballs; modest teeth sit behind the upper lip. The corrected mouth corners remain intact in the sampled surprise/sad/smile frames. | Closed-lid creases and source cheek/hair faceting remain angular. Sadness reads more weakly than surprise or delight. This is an improvement candidate, not show-quality facial animation. |
| Grasp/taste, 12–18s | Candidate fingers retain the stem while the candy moves toward and away from the mouth. The baseline's floating stick/hand mismatch is plainly visible, making the functional difference reviewable. | This demonstrates one specific prop and authored path; it does not prove all story props or mouth shapes. |
| Front clap, 18–21s | Palms approach, meet and release. Rebuilt hands remain visually joined to the cuffs; the reviewed contact frame does not show the previous cuff/hand crossing. | The nearly symmetric pose can still read formally; the improvement is strongest in contact reliability. |
| Oblique clap, 21–24s | The alternative angle exposes the cupped fingers and wrist separation. The full sequence retains both labels and the shared-input disclosure. | Sampled surface tests bound the demonstrated motion, not arbitrary continuous collision behavior. |

[Playback telemetry](proof/video-review/review.json): duration 23.988s, 1920×850, 720 decoded frames, playback ended successfully. This review's isolated headless browser dropped 28 presentation frames and reported a largest callback media-time gap of about 69ms; that is distinct from missing encoded frames. The root's capture telemetry reports 1,443 animation callbacks, a maximum 33.3ms interval and no interval over 67ms. Neither statistic alone establishes smoothness on every viewer's device.

Additional independent checks: [363 finite/deterministic rig samples](proof/review-final-rig.json), [transition-boundary checks](proof/review-transition-continuity.json), and the hand agent's [actual transformed-surface measurements](hand-surface-checks.json). The latter measured a minimum whole-hand separating gap of approximately 0.402mm across 61 clap samples and per-digit stem proximity of approximately 0.014–0.160mm across 16 grasp samples, without sampled stem penetration.

## Review status

**Ready to show the user the Masha-only comparison.** The corrective round addressed the consequential rendered findings, including the stronger-sad-mouth artifact, hand proportions, grip fit and clap surface crossing. No remaining issue in this bounded review requires withholding the preview. My recommendation is to let the user judge the facial art direction next, then integrate the accepted behavior into generated-story evaluation and broaden prop coverage. Do not describe this checkpoint as completed production story integration or as a completed upgrade of the other cast.
