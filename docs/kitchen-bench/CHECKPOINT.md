# Kitchen and bench continuity

Status: **complete and deployed after explicit authorization**, including independent review → updates, final recordings and authenticated live verification. Release source `884b6201cf59421a25dfe87108ebf6bc5cc224f2` was pushed to `main` before deployment. Worker version: `eba1d7c0-5b93-46df-8e07-84fa2b22178d`. See [deployment/deployment.json](deployment/deployment.json). No paid generation calls were made during deployment verification.

## Source and ownership

- Release branch: `main` (developed in `codex/kitchen-bench-continuity`).
- Baseline release: `0a81ce43861dd3bc1a1fce2f751940d6f31dcbad`, runtime fingerprint `3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08`.
- Frozen final runtime: **`6b059a3ed328acb504fc5d48d2729ddcbaa7ae2846857d2907ddf27599bf2fea`**.
- Implementation owners `kitchen_objects`, `bench_physics` and `physics_preparation` finished. Independent reviewer `kitchen_bench_adversarial` finished and handed back the browser. Root completed final evidence/media/report. No required work remains for this batch.
- Immutable baseline directory is recorded in ignored `baseline-path.txt`. Only unchanged public assets/dependencies are shared; source is a separate archive. Four capture-harness/fixture hashes match before and after.

## Delivered behavior

| Track | Result | Boundary |
|---|---|---|
| Garden → kitchen | Masha harvests carrot #2, carries it through the doorway, deposits it in a bowl; Bear takes the same carrot and releases it into the pot. | Authored animation and persistent ownership; one carrot per container. Pot deposit only. |
| Bench → ground | Masha places the ball on the seat, nudges it off, walks away and retrieves it at its actual landing. | Existing bounded Rapier Masha/ball/yard support; unsupported stories, other-actor transfers, hugs and rides remain authored. |
| Responsive preparation | Worker prepares the deterministic 60 Hz trajectory while Player retains its last picture/time and latest transport intent. | Main thread retains renderer, loaded-rig sampling, animation and audio. Atomic fallback; no partial trajectory playback. |
| Director compatibility | Six bounded real EN/RU requests, all HTTP 200 and LLM plans, saved and replayed locally. | Previous deployed contract only; new bowl/pot/nudge contract is verified locally. No Fal calls or asset purchases. |

## Validation completed on frozen source

- **895 tests / 75 files**, app and Cloudflare Worker TypeScript, production build.
- Actual production editor textbox: pause/resume, backward/forward seek, replay, edits, scene deletion, reload and object identity. Built Worker loads; APIs blocked; no page/asset errors.
- Ten native EN/RU and recorded-director stories. Probe asserts new handoff displacement under 5 mm, correct ownership, expected physics and final carrot/ball possession. Canonical new handoffs measure under 0.04 mm; older garden pickup residual remains about 1.6–2.0 cm.
- Six existing interaction regressions: 261 exact pose/visible-state samples unchanged for hammock/hug/ride, entry and fishing; cupboard and adult/child cooking ownership/support retained. Final kitchen route: 66 frames / 1,119,690 sampled vertices, no tested stove/tabletop intersections.
- Complete kitchen camera review: 389 travel samples, 174 rendered boundary/action/overview samples, 245 forward/reverse tail frames. No lost travellers, seek differences or browser errors.
- Pot: 82 samples / 1,391,130 sampled vertices; no sampled arm/paw, counter or cabinet intersection. Head-front/fur grazing ≤2.094 mm and shoulder ≤0.107 mm remain and are visually accepted as rim contact. **Strict zero-intersection did not pass**; do not erase or misrepresent the residuals. The optional strict skin flag intentionally rejects them.
- Pot approach reach residual ≤0.0369 mm; target residual ≤0.0561 mm. Carrot handoff 27.8 µm. A 36.6 mm guide deviation during the empty-hand return to idle occurs after release and is not a prop snap.
- Worker/native transport parity, cancellation and fallback pass. Final preparation: synchronous 442.5 ms total / 442.8 ms max UI timer gap; cold Worker 635.9 / 6.6 ms; edited reused Worker 428.1 / 5.6 ms. First preparation is slower overall, substantially more responsive.

## Review → update history

Real loaded-rig and actual-video review fixed unreachable bench placement, bowl pickup snapping, authored rolling-ball floor penetration, narrow kitchen body clearance, hidden hand contacts, bowl/food overlap, pan support regression, brief wall-camera gaps and four offscreen travel intervals. Full pot-action review then fixed approach overextension, unstable palm contact and paw/counter withdrawal crossings. Tiny fur contacts are retained honestly. See `adversarial-review.md` and final proof manifests; ignored iteration captures are diagnostic history, not final acceptance.

## Final evidence and next action

Root's sequential validation pipeline completed with exit 0; `validation/current-step.txt` says `complete`. All nine final source-bound manifests match the frozen fingerprint and have `stable:true`. `validation/summary.json` verifies those manifests, identical before/after capture harnesses, tests and final MP4 hashes.

The two synchronized comparisons decode, play to completion and seek successfully. Root inspected decoded camera/action frames and the dense final pot sequence; the earlier wall/visibility and arm-crossing defects are resolved within the documented scope. Both raw after recordings are from the final runtime. Comparison durations are about 65 seconds (kitchen) and 26 seconds (bench); scene-boundary holds align the two versions without accelerating either side.

Final native M1 Max / Chrome 157 performance at 1280×720: bench 60.0 FPS and kitchen 59.9 FPS. Exact timing tables and limitations are in `REPORT.md`. Temporary pipeline script `/tmp/mabear-kitchen-final-validation.sh` is retained for convenience; project reproduction scripts are listed in the report. No automated validation process remains running.

Local after dev: `http://127.0.0.1:8821/`; immutable before: port 8822; production preview: `http://127.0.0.1:8823/`. Review player: `http://127.0.0.1:8821/docs/kitchen-bench/`. Final files: `kitchen-before-after.mp4`, `bench-before-after.mp4`, raw `before/` and `after/`, `media-check.json`, `media-playback.json`, `performance.json`, and the proof directories linked from `REPORT.md`.

Deployment remains a separate user instruction. Any later authorized deployment must validate, commit/push release source/assets/tests/docs to the private repo before deployment, then commit/push its deployment record.
