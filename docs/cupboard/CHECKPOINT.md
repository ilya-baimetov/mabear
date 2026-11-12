# Cupboard feature checkpoint

**Task:** Bear opens a cupboard, takes something out and closes it; test actual stories and show before/after. The user subsequently requested deployment. No paid services were used.

## State

- Local feature implemented in `/Users/ilya.baimetov/Projects/mabear/codex` on branch `codex/storybook-upgrade`.
- Starting repository commit: `002d705c5a9a53c5f2a33473113a6633f254e4e1` (deployment/GitHub rules). Feature source, tests, scripts and review documents remain uncommitted local changes.
- Private remote: `https://github.com/ilya-baimetov/mabear`.
- Current user rule: deploy only on explicit request; every deployment must first commit/push release code and then commit/push the deployment record. No deployment or remote change in this task.
- Last deployed version remains `ec664a01-3b2a-4ccc-833a-82b144469522`; this feature is not on that URL.

Final captured source fingerprint: `72324214eb4c98e1e6d64a1255b12fc04428b5a0610898c90849ff0152e00c77`. Capture remained stable and reported no page errors. All four packaged videos passed full/tail decoding and native browser play/seek/end checks.

## Implemented contract

- `kitchen_cupboard`: upper left pantry panel, scene-time open fraction, approach/shelf/handle anchors.
- `pantry_honey`: one independent jar, initially on the shelf; distinct from outdoor `honey_pot`.
- Bear approaches and turns, opens with the left paw, retrieves with the right, withdraws clear of the shelf, lowers to a carry pose, closes with the free left paw and retains the jar.
- Automatic opening prerequisite; no duplicate jar, no consumed-jar refill, no stealing from another actor. An already-held item is put on the preparation table first.
- Old saves normalize additively. Cupboard state and jar location participate in editor cache invalidation.
- Main app retains default yard physics and authored animation fallback. Cupboard/Bear/jar are animation-owned; no Rapier expansion.
- Final camera holds on the cupboard through the scene tail, avoiding the refrigerator obstruction found in video review.

## Evidence and reproduction

- `docs/cupboard/index.html`: local review viewer.
- `before-after.mp4`: matched scene 2 at 1x; shorter before side holds its final frame.
- `cupboard-action.mp4`: short final action.
- `before/cupboard.mp4`, `after/cupboard.mp4`: full actual stories. Their `proof.json` files hold source hashes, native renderer, timings and capture errors; final after hash must match the current `src` fingerprint.
- `ui/proof.json`: regular editor pause/resume, seeking, replay, source edits, deletion, save/reload.
- `render-check/proof.json`: full-scene contact sweep, repeat-seek determinism, Russian/implicit/empty cases and baseline regressions.
- `ADVERSARIAL-REVIEW.md`: findings, fixes and accepted limits.
- Full suite: 810 tests/67 files passed. Targeted cupboard/door tests, typecheck and build passed after the camera-tail fix. See logs.

Local Vite app/harness uses port 8801 with `scripts/staging-interactions.vite.ts`. The before source was copied into a temporary directory recorded in the ignored `baseline-path.txt`, served on port 8804 during comparison. To reconstruct it if the temporary directory is gone, restore commit `002d705`'s source/config/scripts into a temporary folder, share this checkout's unchanged runtime `public` assets and `node_modules`, and copy only the cupboard fixture/harness into it. Do not copy the new `src` into the before checkout.

Commands are documented in `README.md`. Packaging uses a temporary Python environment `/tmp/mabear-cupboard-media` with `imageio-ffmpeg`; no runtime dependency was added to the game.

## Limits / next action

One cupboard and one honey jar; only Bear reaches the upper compartment. No arbitrary contents, restocking, other cupboard doors, physical hinges or all-body collision. Existing general traversal cameras still have occasional furniture/rack foreground occlusion outside the dedicated action. No texture or animal-face rebuild.

Deployment is now explicitly authorized; release verification and GitHub check-in are in progress. See the deployment record once complete. Do not expand the feature scope.
