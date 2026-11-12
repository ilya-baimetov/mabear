# Bear retrieves a jar from the cupboard

**Deployed 11 November 2026 after the user's explicit request. No external-service credits spent.** [Live game](https://mabear-storybook.ilya-baimetov.workers.dev) · [Deployment record](deployment/deployment.json). Release source: `f5ad600ccb1cc8def99d24c171bddc1730f49283`; Worker version: `47cf2f59-4418-4594-a5e3-91c95117a5fe`.

[Open the video comparison](index.html) · [Before/after scene](before-after.mp4) · [Eight-second action](cupboard-action.mp4) · [Full after story](after/cupboard.mp4)

The same three-scene text runs through the actual offline director, compiler, player, Three.js stage and loaded character rigs:

> Bear walks to the kitchen.
>
> Bear opens the cupboard, takes a jar of honey out and closes the cupboard.
>
> Bear walks to the living room. Bear waves.

| Behavior | Before | After |
|---|---|---|
| Cupboard request | Unsupported fallback; fixed cupboard remains closed | Bear approaches the pantry and visibly opens its upper left door |
| Contents | No retrievable item in that cupboard | One honey jar rests on its shelf and transfers to Bear's right paw |
| Closing | No cupboard action | Left paw closes the door while the right keeps the jar |
| Continuation | No cupboard jar to carry | Bear carries the same jar into the living room and can wave |
| Story time | Existing player controls | Panel and ownership reconstruct correctly on pause, seek, replay and edits |

The comparison starts both recordings at scene 2 and plays each at normal speed. The shorter before scene holds its last frame after it finishes. Full uncut stories are available separately: [before](before/cupboard.mp4), [after](after/cupboard.mp4). These are silent browser recordings, not generated video or offline render sequences.

## What is addressable

| Identity | Supported state and actions | Transform owner |
|---|---|---|
| `kitchen_cupboard` / story mark `cupboard` | Closed/open, timed open/close, Bear approach, shelf and handle anchors | Authored animation evaluated from story time |
| `pantry_honey` | One jar, initially on the cupboard shelf; taken, then carried | Shelf placement before attachment; measured right-paw socket after attachment |
| `house_door` | Existing entrance state and actions | Existing timeline animation, independent of the cupboard |

This extends the working object contract without a universal object hierarchy or simulated hinge. The yard physics remains enabled in the main app; cupboard/Bear choreography uses the animation fallback. Rapier does not control this panel, jar or Bear.

The compiler opens the cupboard automatically before retrieving its contents if needed. A repeated request does not generate another jar; an unavailable jar does not refill. English and Russian instructions are supported, including `takes something out of the cupboard`, `closes it`, and `открывает шкаф, достаёт банку мёда и закрывает шкаф`.

## Validation

- **810 tests across 67 files passed** with `npx vitest run --maxWorkers=4`: [test log](tests-final.log). One earlier run competing with browser/build work timed out on the pre-existing expression sweep; the bounded-worker run passed without weakening its timeout.
- Type checking and production build passed: [typecheck](typecheck.log), [build](build-final.log). The existing large-bundle advisory remains.
- **Real editor controls:** pause during door motion, resume at the same time, seek forward/backward, replay, edit the source scene, delete it and reload the saved result: [proof](ui/proof.json), [screenshot](ui/actual-editor.png). Network calls were blocked; no paid voice or director requests ran.
- **Rendered contacts:** sampled the complete cupboard scene at 30 timestamps per second and repeated out-of-order seeks. Jar position discontinuity was below 0.02 mm at pickup-to-carry transition; the measured paw-to-handle gap during full-strength contact peaked at 2.6 cm, averaging 2.5 mm. These are geometric checks of the loaded rig, not a claim of perfect fingers: [proof](render-check/proof.json).
- **Actual regression stories:** Cozy evening cooking and seating; Bear's nap hammock sleep, hug and shoulder ride. Sampled actor frames, props, contact metrics and cameras match the before version exactly: [proof and paired screenshots](render-check/).
- Russian, implicit opening, and reopening an empty cupboard were also rendered. The jar remained the same owned item. A subsequent wave was checked to ensure the stable carry pose did not suppress it.
- Final media are decoded in full and at the tail, and checked in a browser player: [media checks](media-check.json), [browser playback](video-playback.json).

Performance evidence is in [before capture](before/proof.json) and [after capture](after/proof.json). On this Mac's Apple M1 Max using Chrome 157's native Metal renderer at a 1280×720 stage, the measured before and after playback remained approximately 60 fps. The after capture includes a separate measurement of the actual cupboard action; this is not an iPhone or cross-device performance claim.

## Review and boundaries

[Adversarial review and updates](ADVERSARIAL-REVIEW.md).

One upper cupboard, one honey jar and Bear's reach are implemented. Other doors/drawers, arbitrary cupboard contents, restocking and child access are not included. The existing generated Bear mesh, broad paws and tight kitchen aisle limit anatomical precision; this is authored contact choreography rather than full body/furniture collision. The camera favors seeing the shelf, jar and paw movement over a frontal facial close-up. The kitchen remains in the previously agreed shape/color stage; this change adds no texture pass.

The paid AI director's vocabulary was updated but live paid generation was not invoked. Tested story interpretation used the offline path and the same compiler/rendering used by the main app.

My recommendation: use this pattern for a few story-relevant objects, validating each visible action. Do not decompose the entire world into parts before those actions need them.

## Reproduce locally

1. Start `npx vite --config scripts/staging-interactions.vite.ts --host 127.0.0.1 --port 8801 --strictPort`.
2. Open the regular app at `http://127.0.0.1:8801/` and enter the text above, or inspect the same compiled stories at `/tools/cupboard.html`.
3. Run `npx tsx scripts/cupboard-ui-check.ts` for actual editor controls.
4. For paired regression/capture work, use the preserved pre-change checkout described in [CHECKPOINT.md](CHECKPOINT.md) at port 8804; run `scripts/cupboard-render-check.ts` and `scripts/cupboard-capture.ts before|after` with `npx tsx`.
5. Run `scripts/cupboard-package.py` with a local Python environment containing `imageio-ffmpeg` to package the recordings. It does not generate animation or retime playback.
