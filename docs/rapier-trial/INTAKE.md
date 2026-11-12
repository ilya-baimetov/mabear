# Bounded Rapier trial — intake checkpoint

Status: **not implemented**. Intake stopped immediately because a hard goal budget counted the existing long conversation against the newly requested approximately 30,000-token planning budget. The guard reported 204,817 tokens after 17 seconds. This does not represent completed Rapier implementation work. Use a fresh chat with this file to obtain a clean planning budget; do not treat the approximate budget as an automatic hard stop.

Continuation in the same chat was stopped again by the existing automatic goal limit (210,959 counted tokens / 105 seconds). No new hard goal was created on continuation. The user explicitly clarified that 30k is a planning guide, not a cap, but the old goal setting remained. Clear that existing limit or start a genuinely new chat; **do not create a hard-budget goal for this task**.

## Authorized task

Implement a bounded Rapier trial in the existing Three.js game. Keep the renderer and animation system. Scope: the yard, Masha, and one suitable loose prop.

Demonstrate in actual stories:

1. Masha stops or slides against selected solid obstacles.
2. Reliable ground support.
3. A dropped prop falls, collides and settles convincingly.
4. Pause/resume, backward/forward seeking, replay and scene edits remain consistent.

Inspect the current implementation and reconcile ongoing work before editing. Decide and document deterministic timestamp integration (fixed steps with cached results/checkpoints, or a justified alternative). Define animation versus physics ownership explicitly. Keep collision geometry simple. Do not expand into ragdolls, cloth, other characters, all locations, or rewriting hugs/shoulder rides.

Include an obstacle-contact story, a prop-drop story, and an existing-interaction regression. Capture actual before/after recordings and tested-device performance. Run adversarial review → update. Prefer behavioral checks over implementation-mirroring tests. At completion report visible improvements, limitations/regressions, and whether broader integration is worthwhile.

**Do not deploy. Do not spend external-service credits.** Aim for approximately 30k new reasoning/output tokens; checkpoint if the work expands significantly.

## Initial observations

- Workspace: `/Users/ilya.baimetov/Projects/mabear/codex`.
- The worktree has many modified/untracked files from the preceding, completed interior/staging work. Preserve them; do not reset, clean, or assume these changes belong to this new trial.
- Current collaboration inventory lists only root; no running subagents were found. Other chats/processes have not yet been checked.
- File inventory found `README.md`, `package.json`, `PAUSE_HANDOFF.md`, and previous proof tooling in `scripts/`, `tools/`, and `docs/interior-integration/`.
- A filename search found no existing Rapier/physics-named implementation. This is not a full dependency or source audit.
- No source edits, dependency installation, simulations, captures, deployment, or paid-service calls were performed for this trial. Only this checkpoint was added.

## Current release context

The previous task completed and deployed the revised interior. Its evidence is in `docs/interior-integration/deployment.json`, `release-build.json`, `validation.json`, and `README.md`. That task reported 770 tests passing. Verify these files and the current worktree before relying on any earlier status. The new Rapier work must remain local.

## Next work

1. Read applicable repository instructions and current handoff/release records; check other active work without overwriting it.
2. Inspect `src/engine/player/`, `src/engine/stage.ts`, `src/compiler/`, shared collision/support geometry, and prop attachment/release handling. Read current official Rapier documentation and inspect available dependencies.
3. Preserve a reproducible baseline before source changes. Delegate a narrow independent architecture/behavior review and proof-fixture investigation if useful.
4. Choose a bounded deterministic integration and a suitable existing loose prop; document ownership and cache invalidation before implementation.
5. Implement, test real stories and playback controls, capture comparable videos/performance, run adversarial review/update, and report results without deploying.

## Source findings from the interrupted continuation

- `package.json` has Three.js and existing Vite/Vitest/Playwright tooling; Rapier is not listed.
- `PAUSE_HANDOFF.md` explicitly identifies itself as historical and superseded. Its old pause/release numbers must not govern this task.
- `src/engine/player/player.ts`: `Player.loop` evaluates a timeline at a timestamp, then passes the resulting frame to `stage.render`. This is a likely integration seam, but architecture has **not** been chosen.
- `Player.setTimeline` receives a new timeline on edits; `setPreviewEnd` also creates sliced preview timeline wrappers. Physics cache invalidation must distinguish actual story edits from preview changes and must not reuse stale trajectories after edits.
- Playback uses wall-clock time while playing; seeking pauses and evaluates a selected timestamp. At a completed segment, `idleT` can advance evaluation beyond the timeline's nominal duration. Decide explicitly whether physics settles beyond the end or holds the end state; pause and seek consistency must remain intact.
- `src/engine/api.ts`: `ActorFrame.pos` is a world root position, with separate animated `hipsOffset`, ground correction weight, and hand/contact metadata. `PropFrame` currently has position and attachment owner but no rotation. A falling/rolling prop will need a bounded rotation override and a clearly defined release transition.
- No Rapier docs/API audit, other-chat inventory, baseline snapshot, dependency installation, implementation, tests or new recordings were completed. The next agent should continue from these findings rather than assume the trial exists.
