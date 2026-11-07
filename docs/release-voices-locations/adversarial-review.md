# Voice, storyboard and location release review

User asked for an adversarial review followed by corrections before deployment. This release was reviewed against actual rendered frames and behavior, not only code or generation results.

| Finding | Consequence | Update / evidence |
|---|---|---|
| Pause destroyed playback scope; next action started selected moment | Whole story restarted or changed scope | Explicit persistent scope and bookmark; independent inspector; actual clock browser regression |
| Audio stop canceled an ongoing utterance | Resume skipped remaining speech | Preserve paused audio session, WebAudio clock and queued speech; native speech pause/resume |
| Broad Masha skirt repair captured sleeve highlights | Hand-to-skirt stretched triangles | Tapered skirt-only vertex mask; actual-GLB regression and before/after rendered poses |
| Fishing facing pointed away from pond | Rod cast/splash over ground | Pond-directed facing and shared water contact point; actual rod-tip-to-float geometry test |
| Held-prop replacement released previous prop too late | Two props overlapped in one hand | Event-time prop ownership; fishing rod/fish and interior serving regressions |
| All actors crowded each story | Unmentioned background cast spoiled simple shots | Cumulative introduced cast and location filtering |
| First cast implementation used future paragraphs | Editing later text changed earlier shot/foley | Retained failing incremental-compile test; cumulative per-paragraph cast fixes it |
| Hidden actors still raycastable | Clicking an empty scene could react to invisible actor | Skip hidden rigs and hidden ancestors; real geometry picking test |
| Cast inspection inherited story cast filter | Inspecting a nonparticipant could show an empty view | Temporary cast/location inspection override; regular Play restores story visibility |
| Initial room exposed outdoor sky, block shelves and rigid chair stripes | Interior read as an unfinished dollhouse | Enclosed shell, warm interior lighting, varied books, rounded surfaces, fabric stripes |
| Initial indoor seated Masha intersected chair | New interior was not visually releasable | Seat and skirt corrections require final actual-story rendering |
| Pond and ambulance were placed in the house yard | Geography contradicted episode reference | Distinct forest sets and compiler scene cuts; actual official-episode frame study |
| Current-voice cancel retained Web Speech paused state | Restart/language switch could silently queue speech | Audition cancels and resumes synthesis; new browser regression |
| Direct audition link was lost after login | User landed at studio instead of comparison | Fixed local return destination through original shared authentication |

Final independent review and render status are recorded in the release report. Native speech quality and word-accurate pause/resume depend on the installed browser voice. Mock-director browser tests are not proof of live Anthropic directing.
