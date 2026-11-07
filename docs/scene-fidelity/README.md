# Scene fidelity — final reviewed pass

Final frames are in `after/`; they supersede the scene images in `docs/yard-reference/after/`. Captured on 2026-11-06 from a frozen build of the real compiler, evaluator and WebGL stage. No paid generation was used.

The source study uses [the official episode 17](https://www.youtube.com/watch?v=qBp1rCz_yQU) and locally captured frames indexed in [the reference study](../yard-reference/README.md). The reviewed images include 208/212 s for the pond, 298 s for the ambulance, 45/95 s for the living room and 170/180/202 s for the kitchen. This pass inspected those pixels; it does not claim another complete episode viewing.

| Area | Previous result | Final implementation and evidence | Fidelity boundary |
|---|---|---|---|
| Pond | Small regular basin, sparse shore, flat water | Larger irregular wooded basin, dark green depth base, actual softened scene reflections, cattails, leafy banks, sand access and log bench. [Story](after/pond-story.png), [shore view](after/pond-reference.png), [overview](after/pond-overview.png), [previous story](before/pond-story.png) | The observed episode has a shore bench. The pier is retained for gameplay; it is not an exact episode feature. Nature-kit foliage remains stylized. |
| Ambulance | Thick raised red stripe, clean toy proportions, weak rear detail | Flatter roof, finer shell edges, flush faded paint stripe, worn white enamel, larger windows, split rear doors, finer seams and lower wheels. Unreferenced blue beacon removed. [Rear view](after/ambulance-reference.png), [story with wolves](after/wolves-story.png), [previous story](before/wolves-story.png) | Procedural interpretation with simplified cab and running gear; not a production asset or exact vehicle reconstruction. |
| House | Simplified room and sparse furniture | Bicycle wallpaper, narrower russet chair stripes, varied bookshelf, white fireplace and trophy mantel, enamel fridge/breadbox, preserves shelf, turned table legs and thin floor rug. [Story](after/interior-story.png), [room view](after/interior-reference.png), [previous story](before/interior-story.png) | Combined kitchen/living-room stage; dimensions, room arrangement and many small objects are staging choices. |
| Yard | Planting pass already present | Retains grouped planting, garden beds and separate locations. [Actual garden story](after/yard-story.png) | Existing generated treehouse and asset detail remain the visual ceiling of this pass. |

## Review → update

An independent reviewer inspected all eight final views against the official frames and accepted the v4 update with no remaining release-blocking scene issue. [Final independent verdict](../release-voices-locations/final-visual-review.md). The review and root inspection caused these concrete updates:

| Finding | Update | Final evidence |
|---|---|---|
| Water read as a hard pixelated mirror | Five-tap soft sampling; weaker reflection over a murky green base; 512 px hardware reflection target | `pond-reference.png`, `pond-overview.png` |
| Ground detail was noisy | Reduced texture contrast while retaining small-scale normal detail | Pond and ambulance views |
| Rug looked like a raised octagonal dais | 6 mm thickness, 96 segments and matching elliptical border | Interior views |
| Pond splash looked like white soap bubbles | Root reduced count, size and ballistic height, subdued color and hid drops below water | `pond-story.png` |
| Repeated indoor frames compounded light attenuation | Absolute scene light intensities on every frame, with indoor→yard→indoor regression | `tests/unit/sceneLighting.test.ts` |
| New water could disagree with the old circular navigation collider | Shared irregular shoreline for renderer, path clearance, destination clamping, scene classification and surface sounds; legal pier corridor preserved | `tests/unit/pondNavigation.test.ts` |

The final images use the Apple M1 Max Metal renderer, include the current wolf and clothing repairs, and have no page/console errors. `proof.json` records camera, timeline time and draw diagnostics. Its per-shot `stats.fps` is a CPU submission estimate and **must not be reported as measured rendering performance**.

## Performance evidence

`performance.json` uses `gl.finish()` after every frame and waits for the next animation frame. The desktop pair measures 48 frames each on the same actual fishing timeline. These are bounded local measurements, not a mobile-device or long-duration performance guarantee.

| Renderer / buffer / shadow | Reflection | Frames | GPU-drained FPS | Average draw calls |
|---|---:|---:|---:|---:|
| Apple M1 Max Metal, 1280×720, 4096 px | Off | 48 | 60.01 | 55.75 |
| Apple M1 Max Metal, 1280×720, 4096 px | On | 48 | 60.06 | 85.13 |
| SwiftShader CPU rasterizer, 640×360, 2048 px | Off | 8 | 0.89 | 47.00 |
| SwiftShader CPU rasterizer, 640×360, 2048 px | On, cached 256 px | 8 | 1.55 | 51.63 |

The short desktop pair reached its 60 Hz pacing limit in both modes. It demonstrates no observed frame-rate loss on this machine, not zero reflection cost: reflection adds about 29 draw calls. The software figures are dominated by the CPU rasterizer and warm-up/order effects; the faster second run does not mean reflection improves performance. Phones and weak integrated GPUs remain unmeasured.

## Reproduce

Build the isolated harness using `npx vite build --config scripts/scene-fidelity.vite.ts`; link the entries in `public/assets/` into `.scene-proof/assets/`, then serve it with Vite preview on port 5184. The generated directory is ignored by Git.

- `SCENE_PROOF_URL=http://127.0.0.1:5184 npx tsx scripts/captureSceneFidelity.ts` captures all eight views using the hardware backend. Set `SCENE_PROOF_BACKEND=software` only for a deliberate software comparison.
- `npx tsx scripts/benchmarkSceneFidelity.ts` writes the paired software/hardware timings. `SCENE_BENCH_BACKEND=default` updates only the hardware measurements.
- Story views use actual compiled actors/actions. `*-reference` and the pond overview explicitly override the camera and hide actors/props to inspect geometry; they are not presented as default story framing.

Validation before handoff: frontend TypeScript passed; 183 focused tests across scene lighting, pond navigation, local routes, fixtures, locations, assets, fishing contacts, interior stories and location cuts passed. An additional exhaustive check sampled 182 directed routes between yard marks and found no location escape or failed destination. The parent agent owns the whole-app/browser suite and deployment.
