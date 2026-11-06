# First-principles UX: adversarial review → update

Reviewed 2026-11-06. The task was to redesign around incrementally creating animation. A stage-first reskin was rejected as insufficient; the final workflow uses one selected moment and a growing sequence.

| Finding | Correction made before release | Evidence |
| --- | --- | --- |
| The interface still asked the creator to manage a paragraph document or switch Create/Watch modes. | One direction composer, immediate moment preview, revision, and an explicit next-moment action. Full-script input is secondary. | Four new browser scenarios; desktop and mobile captures. |
| The moment-local clock sat above a whole-story scrubber that changed the editor selection. | Clock, scrubber, seek bounds, label and preview use the same scope. Sequence tiles navigate; whole-story review preserves the selected editor. | Browser and unit checks cover local/global bounds and selected identity. |
| The context card defaulted to Masha/Bear even when another actor was relevant. | Selected compiled cast plus preceding actors; actual starting state, overflow count, and an explicit last-preview warning when earlier work changes. | Garden fixture and mobile continuity proof. |
| Music and lighting cycled through hidden choices; Camera was an unexplained random change. | Explicit current-value menus for music/time, and an honest Try another angle action. | Chosen sunset/music values compile without a director call and replay only the selected moment. |
| Preview status and refinement controls disappeared below the composer fold. | Persistent footer keeps state, Fine-tune, Preview, and What happens next visible. | Laptop screenshot; narrow layout proof. |
| Inserting from the middle could be mistaken for appending. | Explain the insertion position and retain later writing/IDs. Add Move earlier/later without recreating moments. | Identity/order and continuity tests, protected-removal browser case. |
| Native story replacement confirmation stalled the in-app browser. | In-app Replace/Keep dialog; explicit confirmation also protects removing a written moment. | Cancel preserves writing; confirmation replaces/removes only the intended content. |
| A stopped preview evaluated the next moment at the exact endpoint. | The real Player renders and schedules audio against the selected timeline prefix. Its final camera/pose holds correctly; full-story mode clears the bound. | Three real Player tests reproduce the previous jump and verify final-frame, audio, seek and partial-clip behavior. |
| Starting a dirty moment preview during whole-story playback left the old story playing while the director worked. | Stop the old Player before preparing the next preview. | Pending-director regression proves immediate pause and subsequent bounded start. |
| The old regression suite exercised removed controls and could no longer protect engine behavior. | Migrate its 15 scenarios to the actual workflow, preserving director-count/concurrency, canon, audio, asset, FPS and access assertions. | `regression-review.md` records the fresh built-Worker result. |

The separate UX author implemented and checked the workflow; the parent reviewed source and rendered states, requested the corrections above and fixed the engine endpoint; an independent reviewer migrated and ran broader regressions. No review is presented as proof of live AI quality or physical-device performance.

The current product still stores one local story and does not provide a production export/share flow. The next UX investment should be direct performance/timing refinement on a selected moment, once animation and voice quality justify it. Adding more panels before that would increase authoring effort without improving the result.
