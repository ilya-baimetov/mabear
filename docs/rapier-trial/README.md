# Bounded Rapier trial — deployed opt-in

Deployed on 7 November 2026 after the user explicitly requested deployment. Open the [live physics demo](https://mabear-storybook.ilya-baimetov.workers.dev/physics/) or [editor with physics](https://mabear-storybook.ilya-baimetov.workers.dev/?physics=rapier). Standard playback remains unchanged; sign-in remains required. The demo uses the reviewed fixtures and does not call generation or speech services. [Release evidence](deployment/deployment.json).

The [comparison player](index.html) and [before/after recording](before-after.mp4) retain the original local trial evidence. Existing modified/untracked work was preserved; the exact pre-trial source/assets are archived.

| Case | Baseline/control | Rapier result |
|---|---|---|
| Masha approaches the bench, waits, then walks to the clearing | Torso passes through the bench | Capsule stops in front of the seat and slides around the end; gait reduces when blocked. Root retains ground support. |
| Masha holds out and drops the ball | New drop cue snaps the ball to a semantic resting mark | Exact loaded-hand release, gravity-driven fall, collision with the bench top, rebound and sleep. The actual editor separately verifies a drop onto the yard floor. |
| Existing Bear’s Nap interaction sequence | Existing hugs, lift and shoulder ride | Animation-owned; sampled actor/contact/camera state and rendered comparisons preserve the original behavior. |

The contact stories are compiled fixtures with matching authored camera tracks. The regression is the existing complete 68-second Bear’s Nap timeline; its recording covers the hug, lift and subsequent walking. The new `drop` cue did not exist in the previous release, so its left-hand recording is explicitly labelled **animation-only control**, not presented as historic behavior. [Baseline parity](baseline-parity.json) confirms old/new compilers produce identical obstacle and regression timelines, and every captured baseline source file matches its archived hash.

## Playback and ownership

[Architecture](ARCHITECTURE.md) documents the contract. A canonical timeline owns one fixed-step Rapier trajectory; cached transforms make frame pacing, pause, rewind, forward seek and replay independent of the simulation history. Arbitrary partial preview endpoints read the same trajectory. Scene edits—including in-place timeline changes passed to `setTimeline`—invalidate it. Physics holds at the selected endpoint while existing idle fidgets may continue.

Animation retains all bones, faces, cameras, other characters and props. It retains Masha’s root for timelines containing unsupported travel, pickups or paired/support choreography. The trial simulates only uncomplicated motion in the covered central yard (x −3…5, z −1…6), with simple table, bench, helper and floor colliders. The ball’s physical position and quaternion bypass semantic prop snapping after release.

## Verification

- Deployment build: [full suite passed again](deployment/tests.log), with typecheck and production build also passing. Authenticated browser checks verified the deployed demo and editor opt-in; default playback loads no Rapier bundle. [Deployment record](deployment/deployment.json).
- Full suite: [**785 tests passed across 65 files**](checks/full-suite-before-gesture.txt) before the final visual release-gesture refinement. After that refinement, [**25 relevant motion/physics/Player tests passed**](checks/final-targeted-tests.txt), and typechecking passed again. Tests cover obstacle stopping/sliding, support, fall/rebound/sleep, arbitrary seek order, non-grid preview endpoints, replay, paused/playing edits, scene-boundary handoffs, unsupported spawns, long-story bypass and existing paired interactions.
- [Actual editor controls](ui/proof.json): native UI play/pause/resume, backward/forward seeking and scene replacement, with requests to external APIs intercepted. [Default built player](ui/default-player.json): no Rapier module requests and no active physics when the flag is absent.
- [Independent adversarial review](adversarial-review.md): reproduced preview ownership mismatch, uncovered bridge support and endpoint-dependent integration; fixes independently rechecked. Visual review rejected a bench-edge drop through Masha’s skirt. The accepted gesture extends the ball clear of her body before dropping it vertically onto the bench. Rejected evidence is retained in `iteration-1/`.
- [Media verification](media-check.json): full and final-two-second decoding of all final recordings/comparisons. [Native video controls](media-ui-check.json) passed play, pause, seek and reset for all four comparison players. Captures record source fingerprints and browser/request errors; final captures have no errors.
- [Preservation check](preservation-check.json): unrelated archived source and every public asset remained unchanged.

## Tested-device performance

MacBook Pro, Apple M1 Max, 32 GB, macOS 27.2, Chrome 156 using native Metal; 1280×720 and fixed rendering quality. Each warm measurement covers six seconds. These are observed local samples, not a statistically established FPS cost or a mobile/device matrix. [Raw measurements and source fingerprint](after/proof.json).

| Story | Baseline/control mean FPS | Rapier mean FPS | Rapier evaluation p95 | First uncached end seek |
|---|---:|---:|---:|---:|
| obstacle | 60.0 | 59.3 | 0.50 ms | 88.7 ms |
| drop | 60.0 | 59.2 | 0.50 ms | 117.0 ms |
| regression | 60.0 | 60.0 | 0.80 ms | 2.2 ms |

The optional physics module initialized in 75.8 ms in this local capture. Warm frame p95 remained approximately 16.8–16.9 ms. The cold seek cost is why this trial should not yet be enabled for long timelines. Final source fingerprint: `2f464091f07fd8aa364ac68a4b7c2528a26708e4e13e7193d905a2d2a5380b11`.

## Remaining limits and recommendation

**Selective integration is worthwhile; broad activation is premature.** Static obstacle contact and a free prop visibly improve. The experiment does not establish general physical story coherence.

- A blocked route ends at a different position. Subsequent actions and cameras are not replanned from that result. The fixture ends about 0.46 m from the authored clearing destination; it demonstrates collision response, not successful navigation.
- A later pickup still targets the compiler’s semantic resting mark, not the ball’s simulated position. Retargeting that interaction is required before enabling arbitrary prop stories.
- Actor/ball and actor/actor collisions, trees, detailed mesh geometry, bridges, other locations and other props are excluded. Nominal furniture collision shapes simplify small bevels and feet; they are not full mesh matches.
- The first uncached forward seek simulates its missing prefix synchronously. Long stories need background preparation or chunked work before wider use. The trial falls back to animation beyond 180 seconds.
- Rapier adds an approximately 4.34 MB JavaScript chunk / 1.67 MB gzip, loaded by the demo or explicit editor flag. This cost is material for a feature that currently covers only one character and prop.
- Reproducibility is verified on the tested device/browser. Rapier’s deterministic solver does not make the existing trigonometric animation code bit-identical on every platform. Audio impact/footstep cues remain authored; the recordings are silent and collision-triggered audio is not implemented.

Next useful step: connect the settled prop transform and blocked destination back into the compiler’s interaction planning, then move trajectory preparation off the render thread. Continue preserving animation ownership for hugs and rides.

## Reproduce locally

From the project root:

```sh
npm ci
npx tsx scripts/rapier-trial-stories.ts
npx vite --config scripts/staging-interactions.vite.ts --host 127.0.0.1 --port 8801 --strictPort
```

- Trial fixture player: `http://127.0.0.1:8801/tools/rapier-trial.html`
- Actual editor with physics: `http://127.0.0.1:8801/?physics=rapier`
- Animation-only fixture control: add `?mode=control` to the fixture player.
- `npm run typecheck`, `npm test -- --maxWorkers=1`, `npm run build`.
- `npx tsx scripts/rapier-trial-capture.ts control`, then `after`; `scripts/rapier-trial-ui-check.ts` checks the editor.

`python3 docs/rapier-trial/reproduce-baseline.py /new/empty/directory` restores and hash-verifies the exact baseline. Install its lockfile with `npm ci`. The baseline capture script expects `/tmp/mabear-rapier-baseline` served on port 8802; copy the current `tools/rapier-trial.{html,ts}` and `docs/rapier-trial/stories.json` into that snapshot as an explicitly separate evidence harness. `?mode=baseline` loads no physics code. Keep the baseline source untouched.

`scripts/rapier-trial-package.py` builds the local comparison page and video montage and decodes all final media. It uses the already installed FFmpeg binary from the local media-check environment; no generation service is involved.
