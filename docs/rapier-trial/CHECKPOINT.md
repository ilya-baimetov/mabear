# Bounded Rapier trial — deployed opt-in

21 November follow-up: [Rapier continuity](../rapier-continuity/IMPLEMENTATION.md) now reconciles an eligible ball retrieval with its simulated landing and a clear approach route. It is implemented locally alongside [individual carrots](../interactive-carrots/README.md); [current evidence and checkpoint](../parallel-interactions/CHECKPOINT.md) govern this new work. **The follow-up is not deployed.**

Follow-up: [default physics and interactive door](../interactive-objects/README.md) was implemented and deployed on 9 November after explicit authorization. Release `ec664a01-3b2a-4ccc-833a-82b144469522` enables supported physics by default; see `../interactive-objects/deployment/deployment.json`. The record below describes the original trial and its separate opt-in release.

Completed 7 November 2026. The original intake is preserved in [INTAKE.md](INTAKE.md).

- Implementation: `src/engine/physics/rapierReplay.ts`, `yardColliders.ts`, `stageReplay.ts`; optional Player evaluator and explicit `?physics=rapier` activation. Three.js and existing motion/contacts remain.
- Scope: covered central yard, Masha capsule, one ball. Existing paired/support choreography bypasses root physics. No ragdolls, cloth, other characters/locations or paid services.
- Replay: fixed-step canonical trajectory with cached transforms and exact release events. Content edits invalidate it. Preview/seek/pause/replay/end-hold behavior verified.
- Evidence: [comparison player](index.html), [video](before-after.mp4), [results and limits](README.md), [ownership design](ARCHITECTURE.md), [independent review](adversarial-review.md).
- Validation: full 785-test suite before the final drop gesture refinement; 25 relevant motion/physics/Player tests and typecheck after it. Actual editor controls and replacement, source-stable native-GPU captures, media decoding and default built-player lazy-loading checks passed.
- Preserve all current modified/untracked work. The previous interior/staging changes remain present. `baseline-source.tar.gz`, its manifest and preservation check preserve provenance; do not reset or clean this checkout.

Recommendation: continue only selective integration. Broader activation requires compiler pickup/destination reconciliation and background trajectory preparation. The final accepted drop is a vertical bench-top drop; rejected edge-deflection-through-body evidence is in `iteration-1/`.

The user subsequently requested deployment. Release `fc5b10ce-429a-4022-b8e7-f1fb8913b8fb` is live at https://mabear-storybook.ilya-baimetov.workers.dev, with `/physics/` for the read-only demo and `/?physics=rapier` for editor opt-in. Default playback and authentication remain unchanged. All 785 tests passed again, alongside typecheck, production build and browser smoke checks. See `deployment/deployment.json`. No unfinished deployment work remains.
