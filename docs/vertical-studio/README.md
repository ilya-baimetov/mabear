# Compact scene editor (local, not deployed)

The desktop workspace has a wider left column containing the viewer and short storyboard, and a full-height right scene editor. Scene navigation, deletion, preview, adding a scene, status and contextual tools stay above a single non-resizable textarea. Only the textarea's content scrolls inside the writing pane. On smaller screens, the viewer, storyboard and bounded editor stack vertically.

Characters (all nine) and locations (all nineteen) are available from labeled toolbar pickers. Context, scene ordering/version restore, fine-tuning and starting ideas open in mutually exclusive panels. Escape/close returns focus to the toggle; insertion closes the panel and restores the text cursor without scrolling the page.

## Review → update

- Removed the large lower action area and collapsed always-visible context into an on-demand panel.
- Fixed insertion at the text limit: the complete name must fit; existing trailing text is never truncated.
- Lowered the desktop height floor to 620 px and allowed the canvas to shrink so 650 px-high windows retain all controls.
- Preserved the full image inside short storyboard thumbnails; portrait crops could hide the action.
- Prevented delayed insertion focus from jumping into a different scene after selection changes.

## Verification

`E2E_GPU=hardware npx playwright test tests/e2e/momentStudio.spec.ts` passed all five story-workflow scenarios. The focused final run of `responsiveStudio.spec.ts` and `sceneDeletion.spec.ts` passed both scenarios, including ten viewport sizes from 320–1440 px, a 650 px-high desktop, English/Russian controls, deletion/cancel/last-scene reset, all picker entries, textarea scrolling, unchanged toolbar bounds, safe insertion at the limit, focus restoration and reordering.

`npx vitest run tests/unit/storyFlow.test.ts tests/unit/playback.test.ts tests/unit/storyboardTime.test.ts` passed 28 tests.

[Final Russian desktop](desktop-ru.png) shows the final layout. [English desktop](desktop-en.png) and [mobile](mobile-ru.png) were captured during the workflow checks; the English frame predates the final thumbnail aspect-ratio fix. No Cloudflare deployment was performed.
