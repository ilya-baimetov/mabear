# Bear's home and woodland locations

**Follow-up:** [the final scene-fidelity pass](../scene-fidelity/README.md) supersedes the scene screenshots and remaining-limit notes below. It adds the irregular reflected pond, revised ambulance, interior detail and absolute lighting fix, with final proof and measured hardware performance.

The visual baseline is the official **Masha and the Bear — Recipe for Disaster (Маша плюс каша), episode 17**: [official YouTube episode](https://www.youtube.com/watch?v=qBp1rCz_yQU).

I played and visually inspected outdoor and indoor excerpts in the actual YouTube player, then captured the frames below. These are observations from rendered video, not search-result descriptions. Filenames are the requested seek time; capture occurred approximately 0.6–0.8 seconds later. This is a representative scene study, not a claim to have watched every second continuously.

| Area | Observed source | Concrete visual evidence | Adaptation in this app |
|---|---|---|---|
| Yard paths | [1:57](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=117s), [frame](frames/episode17-117s.jpg) | Pale sandy path with soft, irregular grass edges; leafy low borders | Lighter, narrower main path; worn route connects the kitchen garden and hives; concentrated flower drifts |
| Tree house | [2:00](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=120s), [frame](frames/episode17-120s.jpg); [5:30](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=330s), [frame](frames/episode17-330s.jpg) | Gnarled living trunk, warm vertical timber, simple doors, white daisies in a window box | Existing generated treehouse retained; smaller neighbouring pine lets its canopy read; planting groups around the facade |
| Kitchen garden | [2:05](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=125s), [frame](frames/episode17-125s.jpg); [2:15](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=135s), [frame](frames/episode17-135s.jpg) | Dark soil, orderly carrots, modest timber box hives beyond the beds | Lower weathered bed edges, darker soil, larger cabbage foliage, row markers and a sparse timber rear fence |
| Living room | [0:45](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=45s), [frame](frames/episode17-45s.jpg); [1:35](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=95s), [frame](frames/episode17-95s.jpg) | Rust striped armchair, green wood wainscot, crowded bookcase, warm wood and personal mementos | Playable chair mark, rounded striped upholstery, bookcase, rug, reading lamp, clock and framed mementos |
| Kitchen | [2:50](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=170s), [frame](frames/episode17-170s.jpg); [3:00](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=180s), [frame](frames/episode17-180s.jpg); [3:22](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=202s), [frame](frames/episode17-202s.jpg) | Cream wall, hanging dark pans, enamel cookware, timber cabinets, substantial wooden table and refrigerator | Working kitchen mark and preparation table; cream enamel stove/fridge, rounded cabinet fronts, hanging pans, kettle, jars and plates |
| Pond clearing | [3:28](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=208s), [frame](frames/episode17-208s.jpg); [3:32](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=212s), [frame](frames/episode17-212s.jpg) | Separate wooded water edge, birches, dense low shrubs, cattails and rough plank bench approached along a sandy path | Separate pond scene with its own ground, deciduous grove, shore bench, reeds and fishing pier |
| Wolves' ambulance | [4:58](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=298s), [frame](frames/episode17-298s.jpg) | Separate open grassy slope with sparse conifers; worn white ambulance with a faded red belt | Separate conifer clearing, rolling backdrop, ambulance, faint wheel tracks and modest repair-yard dressing |

The room arrangement, dimensions, shelf contents, crates, row labels and wheel tracks are staging choices. The **pier is retained as an existing playable fishing affordance**; the observed episode shots show a shore bench, and do not establish this pier as an exact episode feature. No official production model or exact geography is claimed.

## Scene architecture

| Story location | Visible scenery | Story behavior |
|---|---|---|
| Yard | Treehouse, garden, hives, outdoor furniture and forest | Existing yard marks and local paths retained; pond/pier and ambulance hidden |
| House | Enclosed kitchen/living room with a camera-facing cutaway | Interior marks are on the same world floor; camera frames the actors from the south; exterior scenery is hidden |
| Pond | Independent wooded shore, water, bench and pier | Fishing contact remains aligned with the existing pier/shore marks |
| Wolves | Independent conifer clearing and ambulance | The vehicle no longer appears beside Bear's house |

`camera.location` controls the scene, with coordinate classification as the compatibility fallback. Actors, carried/resting props and effects are filtered to that scene. Named pond/pier/van geometry stays outside the globally merged yard meshes. Scene selection is reversible on every rendered frame, including scrub and replay. The compiler owns cross-location scene cuts and interior doorway routing.

No paid asset generation was used. The implementation reuses the existing generated treehouse, hives/plants and licensed nature kit; new room and landscape geometry is procedural.

## Review and proof

- The first interior review caught outdoor sky around a dollhouse-like room, repeated block books, overly rigid chair stripes, and an invalid preview containing a foreground yard actor. Those images are development passes, not final story proof.
- The revised room has full-height side walls, a ceiling, extended camera-side floor, warm local lights, varied book spines, rounded cabinet/enamel edges and stripe colors on curved upholstery.
- The first ambulance pass was an overly generic box. Its revised body has a rounded cab/roof, split raked windscreens, inset seals, cab/rear door seams, mirrors, wheel arches and steel hubs, recessed grille/lights, faded paint and restrained rust. Window depth was corrected after a rendered review caught body overlap.
- The first wolves story shot hid one wolf behind the other. The van mark now provides an approach outside the vehicle footprint. Group cameras view its open west side; hidden yard obstacles no longer distort the remote scene's camera choice.

| Evidence | View | What it demonstrates |
|---|---|---|
| [Before yard](before/yard.png) → [revised yard](after/yard-final.png) | Same local WebGL set review | Denser grouped planting, lighter path, softer garden framing and clearer treehouse composition |
| [Garden](after/garden-final.png) | Local WebGL set review | Soil, low bed edging, cabbage foliage and hives integrated with the planting |
| [Cooking inside](after/cozy-cooking.png) | Actual Cozy evening timeline, 12.484 s | Bear cooks at the preparation table while Masha sits in the living area; room shell surrounds the shot |
| [Eating inside](after/cozy-eating.png) | Actual Cozy evening timeline, 20.822 s | Character/prop contact and the stripe upholstery at story framing |
| [Seated contact](after/cozy-seated-contact.png) | Same timeline/time; explicit diagnostic camera | Full body and cushion contact; no claim that a cropped face view proves the garment deformation |
| [Pond story](after/pond-story.png) | Actual fishing timeline, 19.285 s | Independent birch/reed shore, pier, fishing action, no visible house or ambulance |
| [Wolves story](after/wolves-story.png) | Compiled two-wolf action, 2.120 s | Both wolves visible beside the rounded ambulance in its own conifer clearing |
| [Standing wave](after/standing-wave.png) | Actual garden timeline, 2.2964 s | Yard and standing character after the seated garment changes |

The story images use the normal compiler, evaluator, assets and WebGL stage via `tools/visual-fixes.html`; the seated-contact image alone overrides the camera to inspect the full body. Its camera is position `[-7.1,1,-3.05]`, look `[-7.8,.65,-5.5]`, vertical FOV 35. The wolves example compiles `wolf_a walk_to van`, concurrent `wolf_b wave wolf_a`, then `wolf_a laugh` with a wide shot and concurrent `wolf_b nod wolf_a`. Final story captures were refreshed after a full page reload on 2026-11-06. Earlier files `interior-pass1.png`, `interior.png`, `yard.png`, `garden.png`, `pond-location.png` and `wolves-location.png` in `after/` are development passes, **not final proof**; the last includes raw preview rigs.

Validation: TypeScript checks passed. The final focused run passed 39 tests across camera framing/location, asset placements, scene isolation and location cuts. The scene-isolation test visits yard → house → pond → wolves → yard and verifies remote geometry is excluded from global yard merging. The van test checks an actor-sized approach clearance and facing, rather than incorrectly requiring the interaction mark to be the vehicle centre.

Remaining visual limits: these are stylized adaptations, not production-equivalent replicas. The pond still has a compact, rounded silhouette; the ambulance intentionally keeps simplified geometry. The close seated garment review exposed small inner-leg/white-cloth artifacts, owned by the separate character pass. Still images and unit tests are not a frame-rate benchmark or a proof of every possible story/camera combination.
