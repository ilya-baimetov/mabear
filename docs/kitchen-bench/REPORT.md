# Kitchen and bench continuity

Validated local build; **not deployed, committed or pushed**. Branch: `codex/kitchen-bench-continuity`. Runtime fingerprint: `6b059a3ed328acb504fc5d48d2729ddcbaa7ae2846857d2907ddf27599bf2fea`. Baseline: previously deployed source `0a81ce43861dd3bc1a1fce2f751940d6f31dcbad` (runtime `3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08`).

## Visible changes

| Story | Result | Control |
|---|---|---|
| Garden → kitchen | Masha harvests carrot #2, carries it through the doorway and places it in the bowl. Bear takes that same carrot and releases it into the pot. The other eight carrots stay unchanged. | Authored navigation, measured hand contacts and persistent object ownership. |
| Bench → ground | Masha sets the ball on the seat, nudges it, walks away and retrieves it at its actual settled location. | Authored hands and acting; Rapier owns supported root movement and the free ball. |
| Preparation | The player retains its picture/time while preparing; queued play, pause and seeks follow the latest intent. | Worker prepares one deterministic 60 Hz trajectory; the main app reads cached frames. |

The kitchen now has a passable adult aisle, a tucked carrying pose, a pot that clears its sill, readable contact/travel cameras and separate bowl/food slots. The pot receives an above-rim hand release and short authored fall. The renderer and existing animation system are retained.

## Actual before/after

- [Synchronized review player](index.html)
- [Kitchen comparison](kitchen-before-after.mp4) — [before](before/kitchen.mp4), [after](after/kitchen.mp4)
- [Bench comparison](bench-before-after.mp4) — [before](before/bench.mp4), [after](after/bench.mp4)

Identical plain-text scenes and capture harnesses run against baseline/current source. These comparisons demonstrate newly supported actions as well as visual continuity; the older compiler cannot perform the full new sequence. Clips are silent, captured at 1× wall-clock speed. Each side holds at its scene endpoint while the longer side finishes. Capture hashes and compiled timelines are in the before/after `proof.json` files; decoded playback checks are in [media-playback.json](media-playback.json).

Both final MP4s decoded, played to completion and sought successfully. Decoded camera/action frames and the dense final pot sequence were visually inspected after encoding. [Final source, validation and media manifest](validation/summary.json) verifies all nine source-bound proofs and both video hashes.

## Validation and adversarial updates

- **895 tests in 75 files passed**, plus application/Cloudflare Worker TypeScript and production build. [Test log](validation/tests.log), [typecheck](validation/typecheck.log), [build](validation/build.log).
- The **production bundle**, entered through the ordinary full-story textbox, passed pause/resume, backward/forward seek, replay, edit, scene deletion and reload. It loaded the separate worker bundle; no failed assets or page errors. Paid endpoints were blocked. [Production proof](production/proof.json).
- Ten native cases cover both EN/RU new stories and all six saved live-director responses. In the canonical new story chains, sampled handoff displacements around the new container/bench transfers are below 0.04 mm; nudge palm residual is about 4.7 mm. These use loaded rigs, separately from ideal-release solver tests, and do not establish complete approach/withdrawal collision clearance. The probe explicitly rejects handoff displacement above 5 mm, wrong ownership, unintended physics fallback or a missing final carrot/ball. One older pickup in a saved live plan measures 1.58 mm. [Contact proof](after-contacts/proof.json).
- Independent regression preserved **261 exact loaded-pose samples** for hammock/hug/shoulder ride, door and fishing; all six checked ownership sequences match. Kitchen/cupboard travel timing intentionally changes with furniture spacing. No sampled skin vertices entered the tested stove/tabletop volumes over **66 walking frames / 1,119,690 sampled vertices** (every eighth loaded vertex). Adult/child pan releases retain correct floor/helper support. [Regression proof](regression/proof.json).
- Review → update fixed unreachable hands, head/prop occlusion, a floor-penetrating authored ball fallback, narrow-aisle body clipping, pot-rim/sill intersections, bowl/food overlap, generic resting-position disagreement and a shifted pan put-aside stance. [Independent review](adversarial-review.md).
- Decoded-video review additionally caught brief wall-camera gaps, four off-screen travel intervals and pot approach/withdrawal crossings. The final camera sweep covers **389 travel samples, 174 rendered boundary/action samples and 245 forward/reverse tail frames** without lost travellers or seek differences. Continuous loaded-skin inspection plus full-resolution visual review accepted the revised pot action; microscopic fur/shoulder grazing remains explicitly recorded below. [Camera proof](camera-review/proof.json), [pot contact proof](pot-contact-review/proof.json).

A heavily contended run hit unchanged five-second test timeouts while multiple native browser checks ran. The final complete suite passed with two workers and no competing browser work; no timeout or assertion was weakened.

## Measured performance

Apple M1 Max, native Chrome 157 / ANGLE Metal, 1280 × 720 rendering, adaptive quality disabled. Full compiled stories played at 1× with one automated measurement browser at a time. These are local desktop observations, not mobile or cross-device guarantees. [Full measurement](performance.json).

| Source | Story | Mean FPS | Evaluate p95 | Render CPU p95 |
|---|---|---:|---:|---:|
| Before | Bench | 59.9 | 0.5 ms | 6.2 ms |
| Before | Kitchen | 59.7 | 0.5 ms | 9.4 ms |
| After | Bench | 60.0 | 0.6 ms | 6.2 ms |
| After | Kitchen | 59.9 | 0.6 ms | 7.4 ms |

Preparation uses the same loaded-rig 28.689-second continuity story for both implementations. Rendering is frozen for this separate responsiveness measurement; UI gaps are measured by a four-millisecond timer. [Preparation proof](preparation/proof.json).

| Operation | Total elapsed | Largest main-thread timer gap |
|---|---:|---:|
| Synchronous reference | 442.5 ms | 442.8 ms |
| First worker preparation | 635.9 ms | 6.6 ms |
| Edited story, reused worker | 428.1 ms | 5.6 ms |
| Unchanged story and cached frame | 0.5 ms | 4.6 ms |

First worker preparation takes longer overall, while removing the large synchronous UI stall. Frame/ownership parity, cancellation and queued transport intent passed on the real browser worker. The unchanged-story timer gap is baseline scheduling cadence, not the cached evaluation's execution time.

## Live director and spending

Six bounded live requests (EN/RU carrot, ball, cupboard) returned HTTP 200 and real LLM plans. Their recorded plans retain the expected identities; harmless spectator reactions no longer disable ball physics. The live server still uses the **previous deployed contract**. New bowl/pot/nudge language is locally verified, not claimed as deployed live behavior. [Requests, responses and provider token usage](director/summary.json).

No Fal/media-generation calls or asset purchases. All checks after those six requests replay saved responses or block APIs.

## Remaining boundaries and recommendation

- One carrot per container; bowl supports placement/retrieval, pot supports deposit only. Unsupported pot retrieval preserves its contents. No cutting, mixing, liquids or general inventory system.
- Physics remains bounded to supported yard Masha/ball stories, the existing bench, a leftward nudge and ground retrieval. Other actors' transfers, hugs, rides and unsupported stories retain authored fallback. No actor/ball body collisions, ragdolls or kitchen physics.
- Existing garden-harvest contact residual remains about 1.6–2.0 cm, depending on the story; the new transfer measurements do not imply every older animation is exact.
- Pot rim: sampled head-front/fur overlap reaches 2.094 mm and shoulder grazing reaches 0.107 mm. These read as contact in the inspected full-resolution sequence; no sampled arm/paw, counter or cabinet intersection remains. This is visual acceptance with recorded residuals, not a strict zero-intersection pass.
- New contact/camera checks cover these story chains and selected regressions, not every possible natural-language combination or every piece of furniture.

**Recommendation:** this is worth extending through similarly bounded story chains. Explicit object identity, measured reach and correct staging remain essential alongside physics; each additional interaction should earn acceptance through actual loaded-character playback.

## Reproduce locally

Use the normal app build and a local preview; deployment is a separate manual action. Final source checks: `npm test -- --maxWorkers=2`, `npm run typecheck`, `npm run build`. The local after/baseline development servers use ports 8821/8822; production verification uses 8823.

Scripts: `kitchen-bench-probe.ts`, `kitchen-bench-regression.ts`, `kitchen-bench-camera-review.ts`, `kitchen-bench-pot-skin.ts`, `kitchen-bench-ui-check.ts` (set `PRODUCTION=1 APP_URL=http://127.0.0.1:8823/`), `physics-preparation-check.ts`, `kitchen-bench-performance.ts`, `kitchen-bench-capture.ts`, `kitchen-bench-package.ts`, `kitchen-bench-media-check.ts` under `scripts/`. The optional pot-skin `--assert-clear` deliberately fails on the documented small fur/rim residuals; default mode retains all measurements for visual review. Run browser measurements/captures sequentially. To recreate baseline, archive the baseline commit into a separate folder and copy the four capture-harness/fixture files listed in `before/proof.json`; use baseline runtime assets. This batch shared unchanged public assets and dependencies with the immutable source snapshot. Dense intermediate captures stay ignored; final media, proof and reproduction scripts remain in the workspace.
