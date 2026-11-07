# Voices, player and locations release — 2026-11-06

Live studio: https://mabear-storybook.ilya-baimetov.workers.dev

Final Cloudflare version: `ab0c90e5-8928-47c0-96ac-e2c3d7055e8a`. [Deployment record](deployment.json).

This is the reviewed preview release. The original `mabear` service and `../claude` source remain separate. The historical app-restart pause has ended.

| Area | Shipped behavior | Evidence |
|---|---|---|
| Masha voice | Exact selected Russian #2 / English #6, MiniMax Lively_Girl; 66 prepared clips plus authenticated, durably cached new dialogue | [Voice integration](../voice-integration/README.md), [fresh live EN/RU results](../voice-integration/live-verification.json) |
| Player | Play resumes the current scope/playhead; explicit replay/update; actual recording offset on seek; pause suspends audio and animation together | `tests/e2e/selectedVoice.spec.ts`, `tests/e2e/momentStudio.spec.ts`, authenticated Chrome observation |
| Whole story | Persistent entire-story scope, visible storyboard, moment selection edits independently of playback, mobile controls; thumbnails show settled action instead of incoming yard | [Storyboard audit](../player-storyboard/audit.md), [final thumbnail proof](../player-storyboard/thumbnail-fix.md) |
| Locations | Separate yard, indoor kitchen/living room, fishing pond/pier and wolves' ambulance clearing; location-aware camera/cast/navigation | [Scene evidence and sources](../scene-fidelity/README.md) |
| Visual defects | Fishing over water; small water droplets; no hand-to-skirt strands in reviewed poses; intact seated tights/shoes; corrected wolf seated/rising ground contact | [Clothing proof](../visual-fixes/README.md), [wolf comparison](../wolf-fidelity/README.md) |

## Adversarial review → updates

Independent reviews and the release owner's inspections caused concrete fixes before accepting the release:

- Wolf proportions, mouth-side flap and ground contacts; water reflection sharpness, oversized splash and raised rug; indoor cumulative dimming; shared irregular pond/navigation boundary.
- Voice preparation cancellation, stale language/story races, transient provider recovery and conservative spending reservations.
- Authenticated production testing found Cloudflare rejects `redirect: 'error'` before network I/O. The fixed provider/CDN requests use `manual` and reject redirects. Four native-workerd regressions now exercise the actual source rather than relying solely on Node mocks.
- Live indoor playback exposed the misleading initial-yard storyboard thumbnail. A representative-action selector and actual-browser proof corrected it without moving the paused playhead.

Reviews: [visual verdict](final-visual-review.md), [voice review](../voice-integration/adversarial-review.md), [earlier functional review](independent-review.md). The final visual verdict accepts the inspected fixes for a preview; it explicitly does not claim production-cartoon likeness.

## Verification

| Check | Result and scope |
|---|---|
| Final unit/native-runtime suite | **652 tests / 46 files passed** on the final source, including five real-compiler thumbnail cases and four native-workerd speech cases |
| Frontend + Worker TypeScript, build, whitespace check | Passed. Build retains the existing GLTFLoader static/dynamic-import advisory; no build error |
| Browser regression | **21 unique scenarios passed** across the broad run and targeted rerun: app/auth, generated cast, moment authoring/transport/mobile, selected recorded speech |
| Browser rerun explanation | First run passed 17; remaining tests exposed an unbaked line in the no-provider test Worker, use of pre-decode duration, and repeated test logins exhausting the real 20-attempt limit. Tests now use a prepared line, current decoded duration and one cached test-only login per worker; all four affected cases pass. Production auth/rate limits were not relaxed |
| Thumbnail browser proof | Actual built fixture, three correct-location images, playhead stayed zero, no autoplay, no page errors |
| Authenticated production | User-signed-in Chrome: live LLM directing, fresh English and Russian fal speech, audio HTTP 200, actual playback, durable reuse after reload, pause 5.0092s → resume 5.1508s |
| Public/protected routes | Health 200; anonymous app/assets redirect to login; anonymous speech generation/media 401; private/no-store and noindex headers. [Results](live-public-checks.json) |
| Rendering | Short GPU-drained M1 Max desktop pond test reached about 60 FPS at 1280×720 with reflection. Mobile and weak GPUs are unmeasured. [Exact measurement and limits](../scene-fidelity/README.md) |

The broad browser suite uses a mock director and built-in recordings; authenticated live checks separately establish real LLM/fal behavior. A passing test is not evidence of production-level acting or likeness.

## Budget and remaining quality work

No new paid 3D/image generation was used in this release pass. Known voice generation is estimated at **$0.21727**, including the audition, 66 production lines and two fresh live lines. The persistent runtime reservation cap is 10,000 characters (about $1 at the checked rate); total known preparation plus the full cap is $1.21057, below the approved $2 voice allowance. These are published-rate estimates, not verified invoice debits. See the voice evidence for receipts and the source rate.

Faces, fur/materials, some hand contacts and the procedural vehicle/vegetation still differ substantially from the show. The raw character atlases themselves contain coarse cloth/fur detail; unverified shader changes were not presented as an asset-quality solution. Seated dress morph normals are a concrete follow-up. The current pass does not enable the separate experimental facial-performance candidate or claim that every possible generated pose has been visually reviewed. Music remains the existing implementation.

My next art priority is sculpted facial/limb anatomy and coherent material treatment, ahead of more small props. The completed functional and voice improvements make that remaining gap clearer.
