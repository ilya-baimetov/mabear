# Historical pause for app restart — 2026-11-06

**Superseded: the user explicitly resumed work, and the reviewed release is now deployed.** Selected-voice integration is verified with fresh English and Russian production generation. See `docs/voice-integration/README.md` and `docs/release-voices-locations/README.md` for current evidence and the final version. The remainder of this file preserves the earlier pause snapshot and is not an instruction to pause again.

At the time of this snapshot, the user had requested a pause for an app restart.

Workspace: `/Users/ilya.baimetov/Projects/mabear/codex`. Branch `codex/storybook-upgrade`; HEAD `de0f4daf8d9f18e3a8a75b917be21b44312f3bef`. Current changes remain saved in the working tree, uncommitted. Do not reset/revert them or touch `../claude`. `git diff --check` passed at pause. Full changed-file inventory: `docs/release-voices-locations/pause-git-status.txt`.

## User decisions to preserve

- Masha voice: **sample #2 Russian and #6 English**, both **MiniMax Speech 2.8 HD / Lively_Girl**, candidate B (`lively`). Exact choices, source files and completed request IDs: `docs/voice-audition/selected.json`; submitted recipes: `jobs.json` in the same folder. These are **not yet integrated into actual story playback**. User reports voices currently playing are bad and differ from the selected samples. Do not automatically play other candidates or silently substitute WebSpeech for the chosen voice.
- Fidelity target is close to actual cartoon references across wolves, ambulance, house/interior, garden, and pond. Generic recognizable substitutes are insufficient. Compare matching angles with episode frames. User permits substantial rebuilds.
- Ambulance clearing and fishing pond/pier are separate locations from the house. Interiors must support actual stories. Preserve normal player pause/resume and visible entire-story storyboard UX.
- Mandatory adversarial review → fixes → verification before deployment. Current visual release is held.

## Saved work and remaining defects

| Area | Saved implementation | Remaining work |
|---|---|---|
| Voice audition | Eight generated bilingual clips, real browser baseline, local `/voice/` UI, exclusive playback, per-language favorites, auth return route | Integrate the selected MiniMax voice for story lines; determine a bounded generation/cache workflow within approved funds. Selection itself does not implement runtime TTS. |
| Player / storyboard | Entire-story default, clear persistent scope, moment selection edits without playback, thumbnails, regular resume, WebAudio/WebSpeech pause handling, mobile controls | Final source-wide validation; fullscreen test was interrupted by pause. |
| Fishing / hand strands | Water-facing actor, rod-tip line/float to shared pond target, prop release; sleeve-safe skirt mask | Inspect latest clothing fix visually (below), then independent review. |
| Masha seated clothing | Positional welding across GLB seams, strict rose seed, enclosed cloth fill, seated lap morph, tights bone-weight preservation | **Final four rendered frames have NOT been captured.** Old seated proof shows obsolete white scraps. See `docs/visual-fixes/PAUSE.md`. |
| Locations / interior | Distinct yard/house/pond/wolves sets, scene-filtered actors/props, camera cuts, doorway routes, kitchen/living marks, EN/RU Cozy Evening sample | Stronger fidelity pass against references. Ambulance/pond still visibly approximate. |
| Wolves | Official normal-body references saved; baseline module snapshotted; first substantial geometry draft written to `src/engine/characters/wolf.ts` | **Unverified and not shippable.** Changed skeleton needs matching `wolfStyle` motion calibration; latest syntax correction not re-typechecked; no renders. Read `docs/wolf-fidelity/PAUSE.md`. Episode 17 swollen bellies are a porridge gag, not normal anatomy. |

Scene work: `src/engine/set/bearsYard.ts`, `nature.ts`, `houseInterior.ts`, `forestLocations.ts`, `src/engine/stage.ts`, `src/shared/bible/set.ts`. Camera/path review fixes: `src/compiler/camera.ts` and `path.ts` (absent-Masha wide camera, yard routes crossing foreign scenes, remote occlusion filtering). Latest camera framing shows seated head and both wolves, but this does not prove final asset fidelity.

Reference/evidence indexes: `docs/yard-reference/README.md`, `docs/player-storyboard/audit.md`, `docs/visual-fixes/README.md`, `docs/release-voices-locations/adversarial-review.md`, `independent-review.md`. Some older proof/readme figures are superseded; agent pause notes identify them.

Official episode reference: https://www.youtube.com/watch?v=qBp1rCz_yQU (episode 17). Frames under `docs/yard-reference/frames/`: yard 117–135s, living room 45/95s, kitchen 170–202s, pond 208/212s, ambulance/wolves 298/300s. Viewed excerpts, not a claimed full uninterrupted watch. The observed pond frame has a plank/log bench; the playable pier is an adaptation. Official wolf references: https://www.mashabear.com/en-us/characters/sly-wolf and https://www.mashabear.com/en-us/characters/silly-wolf.

## Validation and deployment

- Last complete broad unit run: **602 tests / 37 files passed**, before the final camera/path/clothing additions. Do not treat this as a final-current-tree run.
- Latest actual-GLB clothing run: **5/5 passed**, with tights and seated-to-standing restore regressions. Typecheck passed before last test-only additions. Visual proof pending.
- Voice browser suite: **2/2 passed** (all eight files decode/play; language/selection isolation; volume-zero baseline correction). Bridge unit tests **6/6 passed**. Indoor tests **9/9 passed**. Independent review focused tests **51 passed**; yard focused tests **39 passed**.
- Latest app/cast browser batch: `E2E_PORT=8799 npx playwright test tests/e2e/app.spec.ts tests/e2e/expandedCast.spec.ts`; **13 passed, 1 interrupted, 1 did not run**. SIGINT was sent for user pause, exit130. Interrupted test: fullscreen/keyboard seeks (`app.spec.ts:357`); expanded-cast test did not run. Session **78311 is finished**, not live. Performance sample 26.7 FPS /76 draw calls under headless SwiftShader. This suite's built snapshot predates final cloth changes.
- Build/typecheck passed earlier; **rebuild and recheck latest tree before release**.
- **No current-pass deployment.** Production remains https://mabear-storybook.ilya-baimetov.workers.dev, last recorded version `f41e45cf-e639-4f97-a2bc-871fe88b4b07`. Separate prior facial trial: https://mabear-masha-performance.ilya-baimetov.workers.dev. Facial candidate remains opt-in/off in main.
- Wrangler auth was verified earlier without revealing credentials. Main Worker has Anthropic secret and original auth service binding. Local tests use mock AI and are not proof of live Anthropic behavior.

## Processes, agents, and budget

- Root closed the Chrome audition tab **936291589** after observing all controls stopped. No more candidate playback initiated.
- Stopped project Vite PIDs **14103**, **18847**, **24485** and app/cast Playwright **53944**; its Wrangler/workerd children exited. Read-only process check found no project Vite, test-runner, or Wrangler servers remaining. Local ports/URLs must be restarted on resume. Shared connector runtimes were left alone.
- `/root/visual_glitches`, `/root/cloth_diagnosis`, and `/root/fidelity_wolves` all confirmed quiescent with no own processes/captures. Wolf draft needs motion calibration and validation, as documented above. No automatic continuation is intended.
- Original fal asset cap **$23.20 fully reserved** (`docs/expansion/budget.json`). Do not infer available funds from unverified actual charges. New credits added did not specify a new spending cap.
- Additional Masha audition cap **$2 approved**. Eight jobs completed, no retries, estimated **$0.10647** at published spoken-character rates; actual debit unavailable. All completed results/request IDs are in `docs/voice-audition/results.json` and `jobs.json`. **No fal job remains in flight; never resubmit these completed jobs.**
- New Meshy wolf/ambulance trial was only investigated, not submitted or approved under a new cap. Endpoint `meshy/v7.1/image-to-3d` supports one image per job; root's discovery query mistakenly bundled three identity images and got a capacity mismatch. This is a planning input error, not evidence the endpoint is unusable. No imagegen job was started.

## Resume sequence (only after user resumes)

1. Read this handoff, agent pause notes, and git status. Coordinate shared file/GPU ownership before parallel work.
2. Address the selected MiniMax voice integration with exact recipe fidelity and no autoplay; don't retest unwanted voices audibly.
3. Restart Vite on5173; run bounded `npx tsx scripts/captureFinalClothing.ts`; inspect four real renders. Do not accept CPU mask tests as visual proof.
4. Rebuild wolves/ambulance and improve pond/interior/yard from matched-angle official references. Normal wolves are lean but rounded; don't bake porridge-swollen bellies into their base design.
5. Independent adversarial review, fix findings, complete relevant tests/build, then deploy and verify live behavior. Any extra paid generation needs a concrete cap beyond existing authorizations.
