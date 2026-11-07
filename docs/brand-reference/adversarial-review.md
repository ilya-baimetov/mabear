# Independent visual and responsive review

Reviewed 2026-11-06 using a separate Playwright Chrome process with native GPU against `http://127.0.0.1:5173/`. Read `brand.css`, `styles.css`, `TopBar.tsx`; inspected actual desktop/mobile captures. Review does not change production data or generate paid voice samples.

## Findings and update round

| Priority | Finding | Evidence | Update status |
|---|---|---|---|
| P1 | Short desktop layouts hide the writing field and let the movie overlap the transport. | At 1280×720 after the first compact-style update, the editor exposes 0px of its 130px textarea. Canvas occupies y156–406, transport starts at y324, and hit-testing the Play button center does not reach Play. [Before](proof/adversarial/before-short-desktop.png). | Fixed with desktop minimum app/row heights and document scrolling. At 1280×720, 118px of the text field is visible, the canvas ends exactly where transport begins, and Play hit-testing succeeds. [After](proof/adversarial/after-short-desktop.png). |
| P1 | The 801–900px breakpoint mixes desktop grid with mobile chrome, clipping the editor and main playback buttons. | At 900×844 before correction, the editor scrolling area was 30px tall; no textarea was visible and Play/replay/time were clipped. [Capture](proof/adversarial/before-tablet-900.png). | Fixed by aligning the responsive breakpoint at 900px. Rechecked 900 and 801px: full 130px text field available in the scrolling document, transport hit-test reaches Play. |
| P2 | Narrow player scope is clipped in both languages, worse in Russian. | At 320px, the Russian scope ended at x328 within a stage ending at x311. | Fixed by removing the redundant movie label at the narrow breakpoint. Rechecked 320px Russian: scope fits and both scope actions remain available. |
| P2 | Initial branded desktop header and footer consumed the editor's writing area. | Initial 1440×860 proof showed the input wholly below the editor scrolling viewport. | Compact desktop chrome plus minimum-height update restore 118px of the 130px field at 1440×860 and 1440×800. The remaining field and helper controls are reachable by scrolling the editor. |

## Other observations

- Golden forest surroundings, purple movie frame, magenta editor heading, chunky display type and dimensional cards are a substantial visual shift toward the official site. Nunito keeps story text legible; the alternate display face supports Cyrillic.
- English/Russian library and full-script dialogs remain usable at 320px. The script dialog's controls fit; no horizontal overflow detected in its children.
- A keyboard Tab from the writing field reaches Names & places with a visible 3px purple focus outline. No page JavaScript errors observed.
- At 390px, Play remains reachable after scrolling down to edit. The final local playback check paused at 1.0598s and resumed at 1.0744s, rather than restarting.
- Measured document widths equal viewport widths at 320, 390, 801, 900, 1024, 1280 and 1440px. Storyboard overflow stays inside its horizontal strip.
- This review checks visual application, responsive usability and one playback continuity path. It does not certify all directing/audio behavior or improve the underlying 3D asset fidelity.

## Final verification

| Viewport | Text field available without internal scrolling | Play center hit-test | Canvas/transport overlap |
|---|---:|---|---|
| 1440×860 | 118px / 130px | Pass | None |
| 1440×800 | 118px / 130px | Pass | None |
| 1280×720 | 118px / 130px | Pass | None |
| 1024×768 | 110px / 130px | Pass | None |
| 900×844 | 130px / 130px, document scroll | Pass | None |
| 801×844 | 130px / 130px, document scroll | Pass | None |
| 390×844 | 130px / 130px, document scroll | Pass | None |
| 320×740 | 130px / 130px, document scroll | Pass | None |

Fullscreen independently checked at 1280, 900, 390 and 320px widths: Play and Entire story are reachable, canvas and transport do not overlap. [Final measurements](proof/adversarial/final-measurements.json), [fullscreen measurements](proof/adversarial/fullscreen-measurements.json).

No unresolved release-blocking finding remains in this review. Recommend deployment after the separate regression suite passes. Short desktop windows intentionally scroll to reveal the lower storyboard; the writing field and player controls retain usable space.

## Subsequent regression update

The root agent added `tests/e2e/responsiveStudio.spec.ts` to exercise both the first and later moments at nine viewport sizes. It found only 70px of visible writing when the previous-moment excerpt was present at 1440×860. A single-line excerpt on compact desktops restored writing space without changing story content or editing behavior. The regression passed after this update: no horizontal overflow, at least 75px of writing available without inner scrolling, no canvas/transport overlap, Play receives clicks, and the 320px Russian scope fits. Existing workflow/voice scenarios also passed their final rerun.
