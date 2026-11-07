# Sample-story visual fixes — 2026-11-06

The captures use the main generated assets, real fixtures, compiler, evaluator and stage. The rebuilt facial/contact candidate remains opt-in. No generated asset was replaced and no paid generation was used for these fixes.

| Observed defect | Root cause and correction | Evidence |
|---|---|---|
| Masha's hand-to-body strands during wave and clap | A broad magenta skin-weight mask caught sleeve highlights and pinned them to the pelvis. The main rig now restricts skirt repair to the tapered body silhouette. | `proof/before-garden-wave.png` → `proof/after-garden-wave.png`; `before-pancake-clap.png` → `after-pancake-clap.png` |
| Fishing toward dry land | The pier facing pointed away from the pond. Facing now points into the water; the float, line endpoint and splash share one water target. | `proof/before-fishing-cast.png` → `proof/after-fishing-cast.png`; exact fixture times in `before-frames.json` and `after-frames.json` |
| Suspended fishing float | The old line was a short rigid piece attached to the rod. A deterministic line now joins the actual rod tip to the water float during seated/fishing use. | `tests/unit/fishingContact.test.ts` checks real prop geometry and both language fixtures. |
| Rod + fish / pan + pancakes attached simultaneously | Prop transfers updated the new prop before releasing the old one. Transfer events now set the old prop down at that action's location. Implied cooking/fishing/watering tools also appear at action start. | Fishing catch and indoor pickup regressions. |
| Indoor actions returned to the outdoor table | There were no usable indoor marks. Added kitchen/living-room marks, bilingual parser aliases, director instructions, doorway routing, indoor cooking/food placement, seat heights, and a bilingual `cozy_evening` fixture. | `tests/unit/interiorStories.test.ts`; final room proof under `../yard-reference/after/`. |
| Masha sank into the reading chair; one foot disappeared into its front | The cushion top is `.47 m`. Masha uses `.11 m` pelvis clearance and `.40 m` forward offset so both dangling feet clear the cushion. A seated root stays aligned with the chair instead of rotating its offset through the cushion toward speakers. | Actual-GLB contact checks across five eating times; `proof/final-seated-contact.png` and `proof/final-seated-contact-front.png` show both legs and shoes at different moments/angles. |
| Seated hem split into white wedges and torn tights | The old repair missed the patterned hem down to `.08 m`, while pale and saturated rose pixels on hidden leg faces entered the skirt mask. The repair now welds UV/normal seams, fills enclosed cloth patterns, protects the measured inner leg volume, and bends only cloth over the seated lap. | 6,747 cloth vertices. Actual-GLB tests protect eight independently inspected leg landmarks, all measured outer-hem edges and the complete lower-leg mesh against severe triangle stretching. Updated contact images show the result. |
| Indoor close-up cropped the head | The camera's seated head estimate omitted the physical seat height. Motion and camera now share the seat-height registry. | Updated kitchen/eating frames under `../yard-reference/after/`. |
| Long travel and unrelated cast crowding | Outdoor locations now use short deterministic scene handoffs; cameras carry location metadata. Cast membership is cumulative through the current paragraph, so future edits cannot change earlier shots. Stage filtering is implemented by the yard pass. | `tests/unit/locationCuts.test.ts`; the existing incremental-edit compiler regression. |

## Review and verification

- The parent independently caught future-cast leakage into earlier paragraphs; the cast was changed to cumulative introduction, and the existing incremental-edit regression passes.
- The independent release reviewer owns the follow-up camera fix for explicit wide shots with a single remote actor. See the release review rather than treating this document as its verification.
- After independent review rejected the first seated proof, the final repair addressed both hidden magenta leg faces and chair-front occlusion. The revised contact views show a coherent skirt with both tights and shoes visible. Earlier mask-only checks did not establish this.
- Root independently accepted the revised side/front contact images. The final early-interaction capture also shows both feet remaining in front of the cushion while Masha looks toward Bear; the latest standing wave preserves the sleeves and hands.
- Latest bounded verification: **15/15 passed** across `mashaPerformance.test.ts` and `interiorStories.test.ts`, including six shipped-GLB tests, deterministic seated-to-standing restoration, lower-leg triangle integrity, and both feet clearing the actual chair throughout the eating sample.
- Main and Worker TypeScript both passed after the final chair-orientation/contact change. Parent-owned full-suite results are reported in the release record.
- `scripts/captureVisualFixes.ts` creates the fixed sample captures from `tools/visual-fixes.html`; no continuous playback loop or app-state mutation is required. After cross-location travel was shortened, the fishing capture selects the corresponding fish action rather than assuming the old absolute time.

The initial `after-interior-*` and `docs/yard-reference/after/cozy-seated-contact.png` files preserve earlier rejected iterations. Use the final proof files below for the completed clothing/contact repair. `final-seated-cooking.png` and `final-seated-eating.png` preserve the earlier room/head-framing review; their first-batch metadata is in `final-clothing-frames.json`.

| Current proof | Check |
|---|---|
| `proof/final-seated-contact.png` | Side view, repaired hem/tights, both shoes clear the chair |
| `proof/final-seated-contact-front.png` | Front view one second later, both complete legs visible |
| `proof/final-seated-contact-early.png` | Early interaction, head turns toward Bear while seated root remains on the chair |
| `proof/final-standing-wave.png` | Latest source, no hand-to-body strands |

Exact current frames and the 6,747-vertex build count are in `final-clothing-detail-frames.json`. The clothing uses deterministic skinning and a seated drape morph, not cloth simulation. The new facial reconstruction remains a separate candidate.
