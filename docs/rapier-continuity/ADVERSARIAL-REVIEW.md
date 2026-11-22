# Independent review → update

Reviewed locally during the parallel carrot/physics implementation. No deployment.

| Finding | Evidence | Update |
|---|---|---|
| A rotated ball's mesh base is not its ground contact. A support-height check on that base rejects reachable rolling balls. | Root review of `ballApproach`; tilted-release behavioral test. | Derive sphere centre and physical bottom from its quaternion. Preserve exact base/quaternion for rendering and grasp. |
| A simple initial take → drop chain was unnecessarily excluded from physics when no later pickup existed. | Carrot agent's independent constructor review. | Restrict suppression to unsupported later retrieval chains. Added real-WASM initial pickup/drop/settle regression. |
| A continuity request could stay enabled even when another actor's ball action disabled free-ball simulation. | Root's independent ownership review. | Reject that whole chain before root/prop takeover; added mixed-participation test. |
| The character controller could sink below the broad flat ground at a stationary zero position. | Native actual-story sweep and cached samples. | Clamp to the matching bounded yard ground plane;60 Hz story sweep checks support. |
| Bottom-centre acquisition of a resting ground ball was unreachable and visibly jumped on attachment. | Native rig measured approximately25cm initial and27cm retrieval discontinuities. | Acquire exposed upper surface, lift, then regrip into existing carry. Final native transfer gaps: initial0.012mm, release0.108mm, retrieval1.40mm (`../parallel-interactions/render-check/proof.json`). |
| The safe retrieval route exceeded the compiler's original movement duration. | Real-story route preparation. | Use necessary time from the preceding idle without moving pickup or scene boundaries; reject insufficient time. Added impossible-duration fallback test. |
| The nominal4ms background warming budget did not bound atomic continuity validation. | Carrot agent's independent timing review. | Document synchronous cold preparation explicitly and cap continuity chains at60s; longer chains fall back before takeover. A Web Worker remains deferred. |
| A slowly moving ball could drift after its pickup contact was planned. | Carrot agent's independent acquisition-time review. | Require the physical body to be sleeping both at the retrieval approach and acquisition start; otherwise fall back before any frame. Added early-moving pickup rejection. |
| Background preparation kept scheduling work after a failed atomic chain stopped before the endpoint. | Carrot agent's final independent failure-path review. | Treat failed preparation as terminal and stop on any nonadvancing frontier. A fake-timer behavior test verifies no callbacks remain or resume while fallback playback is paused. |

Tests also exercise arbitrary backward/forward seek order, previews, end holds,
actual content edits, every clip/scene boundary, stable path clearance and
unchanged authored hug/shoulder-ride/cupboard stories. Final source-stable
native media and performance measurements are in `../parallel-interactions/`.
