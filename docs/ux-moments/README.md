# MaBear — incremental animation studio

Live studio: https://mabear-storybook.ilya-baimetov.workers.dev (existing demo password). Cloudflare version `f41e45cf-e639-4f97-a2bc-871fe88b4b07`.

This is the authoritative UX evidence folder. The older `docs/ux-studio` captures document an abandoned layout direction.

The creator's primary loop is **describe one moment → preview only that moment → revise → decide what happens next**. The full story is a sequence of moments, rather than a document the creator must prepare before seeing any animation.

| Creator job | Implemented interaction | Important behavior |
| --- | --- | --- |
| Establish the action | One immediately editable direction, a real starting-context card, optional names/places, and short seeds | Name/place controls insert writing; they do not play an unrelated actor reaction. |
| See the result | Preview this moment | Dirty predecessors prepare for context, but only the selected moment plays. |
| Refine | Edit the direction and preview again | Typing performs no director calls. Failed preparation preserves writing and exposes retry. |
| Polish | Optional Fine-tune in the persistent footer | Choose time and music directly; the camera offers an honestly labeled variation. Only the selected moment replays. |
| Continue | What happens next? | Inserts directly after the selected moment. The insertion position is explicit when later writing exists. |
| Reorder | Move earlier / Move later under Moment options | Identity, writing, and selection remain intact. Playback pauses; starting context recompiles and the UI asks the creator to check the transition. |
| Review | Whole story | Plays the sequence in order without moving the editor selection; a separate highlight identifies the moment on stage. |
| Use a complete script | Secondary Full script dialog | Blank lines separate moments. Changes apply only after Use this story. |
| Remove or replace | In-app confirmation | Keep cancels without changing writing. No native JavaScript confirmation dialog. |

## State and continuity

- **Empty:** one editable moment, a starting scene, example directions, and disabled preview until there is writing.
- **Draft / changed:** the new direction stays editable; explicit preview is required.
- **Working:** preparation state and Stop preview remain visible; editing is retained.
- **Ready:** replay, Fine-tune, and What happens next are available in the persistent footer.
- **Simplified / failed:** the UI distinguishes an available simpler result from preparation failure and offers retry.
- **Earlier changes:** later writing remains editable. The context is explicitly labeled as the last preview until earlier changes are prepared.
- **Selected:** the composer and starting scene follow the selected moment; selection alone never plays it.

The scrubber, clock, and play controls share the same scope. A moment preview has moment-local time and bounded seeking; whole-story review spans the sequence. The engine's selected-preview boundary fix also holds the selected final frame rather than evaluating the next scene at the exact endpoint.

## Evidence

| Capture | What it demonstrates |
| --- | --- |
| [01-empty-desktop.png](01-empty-desktop.png) | A ready 3D world and a first-moment writing surface. |
| [02-ready-desktop.png](02-ready-desktop.png) | A selected, completed second moment after deliberate sunset/music choices; scope-local scrubber and persistent refinement/continuation controls. |
| [03-mobile-continuity.png](03-mobile-continuity.png) | 390 px layout, dirty-predecessor explanation, future-writing preservation, and a fixed playback dock. |
| [04-mobile-russian.png](04-mobile-russian.png) | Russian interface with authored English text preserved when switching interface language. |
| [05-failure-desktop.png](05-failure-desktop.png) | A failed director response produces an honestly labeled simpler result while retaining writing. |

Mobile captures are full-page screenshots. The fixed playback dock therefore appears at the bottom of the original 844 px viewport, rather than at the bottom of the entire tall document.

## Verification

- Final full unit run: **547 tests / 32 files pass**. Main and Worker TypeScript, production build, and deployment packaging pass.
- Production health, login, protected HTML/assets, and unauthorized-director responses pass; see `release.json` and `deployment-checks.json`. Authenticated production rendering and live AI quality were not exercised after deployment.

- Three moment-flow browser scenarios passed against a built Worker with its mock director. They cover the complete add → bounded preview → revise → append → whole-story loop; scoped scrub boundaries; explicit time/music choices without director calls; middle insertion; cast text insertion without playback; continuity warnings; 390 px layout; English/Russian; full-script import; failure handling; and fullscreen controls.
- A separate focused browser scenario passed for Replace/Keep and Escape cancellation, middle reordering with intact ids/text/selection, and protected Remove/Keep. No native JavaScript dialogs fired.
- **31 focused unit checks passed** across story flow, playback, play-only preparation, and saved-story review. These include moment end bounds, insertion identity/order, reordered starting-state continuity, retained editor selection during whole-story review, and immediate interruption of old playback while a new dirty preview prepares.
- The separately maintained [regression-review.md](regression-review.md) records the migrated legacy browser suite and its final result.
- Main/Worker typecheck and `git diff --check` pass. Each browser run builds an isolated client snapshot before starting its Worker; these checks are separate from browser behavior checks.

## Limits

The browser tests use the mock director. They do not establish live AI endpoint quality, latency, or reliability. Headless desktop Chrome at a narrow viewport verifies responsive layout, not a physical phone keyboard or mobile GPU. Screenshots verify UI states; they are not proof of natural motion quality. The product still keeps one story on this device and has no production export/share workflow. Cast portraits are small derivatives of existing local reference artwork; the live stage is the source of truth for rendered appearance.
