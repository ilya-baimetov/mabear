# Default physics and the first interactive object

Implemented and deployed on **9 November 2026** after explicit deployment authorization. **No external-service credits used.** [Open the live game](https://mabear-storybook.ilya-baimetov.workers.dev).

Release `ec664a01-3b2a-4ccc-833a-82b144469522` serves 100% of traffic. The fresh production build matches the reviewed source. Live health and authentication checks passed; authenticated playback was not repeated because the available browser is signed out. Local story/UI/built-app evidence is retained below. [Deployment record](deployment/deployment.json).

Open the [before/after player](index.html) or the [comparison recording](before-after.mp4). These use the actual story compiler, Three.js renderer and loaded rigs. The before recording runs the archived pre-change source; the after recording runs the current source. Both use the same text. The shorter before clip holds its final frame while the after clip finishes. Recordings are silent and run at 1× speed.

| Behavior | Before | Now |
|---|---|---|
| Main-app physics | Explicit URL opt-in | Enabled by default for supported yard motion and ball drops; `?physics=off` remains an animation-only diagnostic control. |
| Unsupported motion, hugs, shoulder rides | Authored animation | Authored animation remains authoritative. Guest-character hugs are guarded too. |
| Dropped ball followed by a pickup | Pickup could snap to a semantic resting mark | Entire ball story stays on animation until pickup retargeting exists. |
| Bear walks to the door | Final approach could mark him offstage and fade him away | He remains visible outside. Approaching alone neither opens the door nor enters. |
| “Bear goes to the house, opens the door and comes in.” | No functional door or readable crossing | Approach → panel opens → Bear crosses the threshold → camera cuts → Bear continues inside. English and Russian are supported. |
| Door across scenes and edits | No addressable state | One logical `house_door` persists open/closed state and reconstructs opening progress from story time. Edits/deletion rebuild it. |
| Leaving the house | Short generic location transition | Door opens if needed; Bear walks up the inside steps, crosses, and continues outside. Explicit close works from either side. |

## Ownership and scope

The renderer and existing animation system remain. `src/shared/interactiveObjects.ts` is the small object contract: stable identity, exterior/interior entrance anchors, step support and state evaluation. The schema adds `open`/`close`, optional world object state and timestamped object cues. The logical door has two rendered representations, one per set. The compiler serializes doorway use and keeps subsequent actions out of its exclusive camera coverage. This prevents the Cozy evening cooking beat from happening unseen while Masha enters.

Animation owns both door panels, Bear's movement, all bones, faces, cameras and paired choreography. There is no physical hinge, new Bear controller or ragdoll. The exterior mesh is opened only at the doorway using [Three.js material clipping, including shadows](https://threejs.org/docs/pages/Material.html#clippingPlanes); a separate panel and shallow recess provide the visible opening. Materials and geometry for the rest of the generated house are preserved.

Rapier retains the trial's fixed-step canonical trajectory for supported Masha root motion and a released ball. Hugs, rides, unsupported actions/supports/travel and stories longer than 180 seconds keep authored root motion. Physics preparation runs in small background tasks, cancelled on edits/disposal; timestamp queries remain deterministic. Thumbnails now use the same evaluator as playback. If the physics module cannot load/initialize, the existing animation player remains usable.

## Verification and review

- **798 tests passed across 66 files**, plus typechecking and production build. [Final test log](work/tests-final.log), [build log](work/build-final.log).
- Exact English/Russian instructions, repeated open/close, entry after opening in an earlier scene, state deletion, arbitrary seeking, a book carried through entry, return outside, and Cozy evening camera coverage: [behavior tests](../../tests/unit/interactiveObjects.test.ts).
- Actual editor play/pause/resume, backward/forward seeking, text editing and scene deletion: [UI evidence](ui/proof.json), [editor screenshot](ui/actual-editor.png). The rendered panels are checked against the logical state. Diagnostic opt-out and a deliberately failed physics import both retain rendering.
- Actual editor ball drop with physics enabled **without a URL flag**, pause/resume/seeks and replacement by Bear's Nap: [physics UI evidence](physics-ui/proof.json). A separate [actual-editor bench approach](physics-ui/obstacle.json) confirms collision response and ground support from the normal starting state. Real WASM tests cover contact, grounding, settling, warmed/synchronous cache equivalence, later-pickup bypass and all-frame animation parity for hugs/shoulder rides.
- [Adversarial review → updates](adversarial-review.md), including the rejected first Cozy evening capture, preserved in `iteration-1/after/`. This is a self-review, not an independent reviewer claim.
- Before/after source fingerprints and frame/performance evidence: [before](before/proof.json), [after](after/proof.json). [Video decoding checks](media-check.json). The [change manifest](change-manifest.json) compares this task against its own starting archive, preserving prior uncommitted work.

## Limits and next step

- Only the **house door and passage** are interactive. Cupboards, individual carrots and other parts remain future work under [the plan](PLAN.md).
- Door operation uses a simple authored reach gesture, not precise handle contact. The panel is intentionally plain; texture refinement is deferred.
- Exterior and interior are separate sets joined by a motivated camera cut. This is not a continuously traversable building. Staging is validated with the loaded generated house; its procedural emergency fallback has a different facade.
- Physics remains limited to the trial's central yard collision geometry, Masha capsule and ball. It does not perform general navigation, update arbitrary future destinations, or collide balls with characters. Unsupported story interactions use animation.
- Background preparation reduces cold work but does not move physics to a worker. An immediate uncached forward seek can still compute synchronously. The existing Rapier payload is about **1.67 MB gzip** in this build; default initialization adds that download.
- Director/TTS requests were intercepted during browser tests. This verifies the offline EN/RU path and the updated AI contract, not fresh live AI generation or speech.

Selective object integration is worthwhile. The next useful extension is one cupboard with open/close state and one contained item, then individual carrots with explicit ownership. Add each through a visible story and replay test before claiming general object interactivity.

## Local preview

Main app: `http://127.0.0.1:8801/` while the local server is running. Type the entry instruction above, or its Russian equivalent: **«Медведь идёт к дому, открывает дверь и входит.»** Follow it with **«Медведь закрывает дверь.»**

```sh
npx vite --config scripts/staging-interactions.vite.ts --host 127.0.0.1 --port 8801 --strictPort
npx tsx scripts/interactive-objects-ui-check.ts
npx tsx scripts/physics-default-ui-check.ts
npx tsx scripts/interactive-objects-capture.ts after
python3 scripts/interactive-objects-package.py
```

The archive `baseline/source.tar.gz` contains pre-change source/configuration. `baseline/path.txt` records the temporary baseline used for the original recording. Public assets and installed dependencies were reused without modification; no assets were generated or purchased.

## Tested-device performance

MacBook Pro, Apple M1 Max, 32 GB, macOS 27.2, Chrome 156/native Metal, 1280×720. Four-second warm samples; no broad device claim. Door stories are animation-owned for Bear. Active-physics samples use the actual contact/drop story fixtures.

| Story | Mean FPS | Evaluation p95 | First uncached end query |
|---|---:|---:|---:|
| Door: entry | 60.0 | 0.50 ms | 1.5 ms |
| Door: approach | 60.0 | 0.40 ms | 0.8 ms |
| Door: roundtrip | 60.0 | 0.50 ms | 1.0 ms |
| Active physics: obstacle | 58.5 | 0.40 ms | 107.8 ms |
| Active physics: drop | 58.5 | 0.40 ms | 130.6 ms |

[Door raw evidence](after/proof.json); [active-physics raw evidence](physics-performance.json). Cache preparation was cleared before the uncached queries. Measurements are separate from video capture.
