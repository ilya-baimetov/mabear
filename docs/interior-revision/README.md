# Bear's house — local revision

These changes are **local and not deployed**. Deployment is a separate user-requested step.

[Synchronized before/after playback](index.html) uses the actual **Cozy evening** compiler, evaluator, characters and WebGL renderer. Both silent clips cover story time **9–24 seconds**. `story.png` is the unmodified story camera at 12.484 s; `seated.png` is the unmodified story camera at 20.822 s. `room.png` and `kitchen.png` hide actors and use explicit inspection cameras; they are geometry reviews, not default story framing.

The most diagnostic entry comparison is [before](before/entry.png) → [after](after/entry.png), both decoded from video offset 0.5 s (approximately story time 9.5 s). The original briefly shows only the ceiling; the revised camera stays inside the room.

## Reference and changes

The reference is the official [Recipe for Disaster / Маша плюс каша, episode 17](https://www.youtube.com/watch?v=qBp1rCz_yQU). An independent reviewer revisited bounded excerpts in the actual player: 0:39–0:55, 1:15, 2:20, 2:45–2:47 and 3:18. This was a targeted spatial study, not a claim to watch the complete episode. Earlier captured reference frames remain indexed in [the yard reference study](../yard-reference/README.md).

| Reference finding | Implemented revision | Proof |
|---|---|---|
| Armchair before the bookcase; fireplace and trophies beside it; sage bicycle wallpaper and circus memories | Filled upholstered chair sides, softer dusty russet fabric, visible side-wall wallpaper, illustrated circus gallery, narrower brick flue, lighter painted paneling | [Living area](after/room.png) |
| Full-height open crockery pantry immediately left of the refrigerator | Tall open shelves with floral enamel pots and dishes, then the rounded cream fridge | [Kitchen](after/kitchen.png) |
| Pans on the yellow wall above the base counter and cylindrical pot burner | Removed the generic upper cupboards and oven; added counter/kettle with spout and a separate single-pot stove | [Kitchen](after/kitchen.png) |
| Previous blank window panels and geometric tree silhouettes looked artificial | Recessed sash windows and folded curtains; a local 91 KB WebP captured from the game's existing 3D woodland | [Story](after/story.png) |

The combined playable room, dimensions, window positions and some furniture are staging adaptations. The excerpts did not establish an unequivocal living-room/kitchen doorway, so this revision does not invent a partition. The staircase and opposite entrance wall seen at 1:15 are not recreated. The room is more recognizable, but it is not an exact production-set replica.

The window image is rendered from this app's own woodland, not copied from an episode. It is a static scenic backdrop, not a live portal with camera parallax. It darkens and cools with sunset/night using absolute per-frame values. Its load participates in `assetsReady`; a procedural fallback remains if the local image fails, and disposed materials do not accept a late texture load. No paid media generation was used.

## Flicker diagnosis and review → update

Three actual defects were found, including one exposed only by reviewing moving playback:

- Upper side-wall boxes extended down to 1.13 m while the panel band extended up to 1.24 m, leaving overlapping faces on the same plane.
- The rear crown rail overlapped the ceiling joist on the same front plane. It produced a visible zipper pattern along the ceiling, including in the first revised render.
- During entry at roughly 9.3–9.6 seconds, foreground avoidance raised the story camera from 2.3 m to 5.3 m, passing through the ceiling and briefly filling the frame with wood. Indoor clearance is now capped at 3.05 m, below the lowest 3.43 m joist, including legacy cameras with inferred location. Exterior camera behavior remains unchanged. [Entry at 9.45 s](after/entry-9.45.png) and [sampled actual camera positions](after/entry-check.json) show the corrected view. Bear briefly crosses the foreground; the room remains visible.

The wall bands are now disjoint, with their join covered by a projecting rail. The ceiling joist supplies the crown trim without a second overlapping face. Regression rays test the former wall overlap and the nearest visible ceiling face. Warm-light shadow range is constrained to the room. Static chair and shell geometry are merged to avoid unnecessary repeated shadow draws.

Independent review and rendered inspection also caused these updates: moved the chimney clear of the gallery; replaced squashed duplicate poster art with separate group illustrations; removed correlated bright wallpaper dots; reduced panel-grain contrast; replaced flat vector window trees with the existing 3D forest capture; and removed a side dresser that intersected the new cylindrical stove.

Validation: frontend TypeScript passed; 15 focused tests passed across actual camera clearance, interior surfaces, time-of-day tint stability, actual English/Russian indoor stories and scene lighting. The entry regression samples the actual cleared camera at 60 Hz, retaining the focal point and checking explicit and inferred interior locations. Final proof captures contain no page errors. The final production build passed TypeScript and all 718 unit tests. The editor passed seven browser scenarios, including ten viewport sizes. Complete-app playback also passed: all three Cozy evening scenes reached the end (33.638 s), pause/resume worked at the entry and cooking shots, the woodland texture loaded successfully, and no page errors occurred. See [complete studio](after/complete-studio.png), [entry in the studio](after/complete-studio-entry.png) and [playback results](after/complete-studio-proof.json). The recorded videos and geometry checks provide bounded evidence for these cameras and this sample; they do not prove every possible authored camera is artifact-free. `stats.fps` in proof files is a submission estimate from capture and must not be presented as a rendering benchmark.

## Reproduce

Run `npx vite --port 8793 --strictPort --host 127.0.0.1`, then:

- `npx tsx scripts/captureInteriorReview.ts after` refreshes the four actual rendered views and the 15-second silent sample clip.
- `npx tsx scripts/captureInteriorWindow.ts` recreates the local woodland backdrop from the app's existing yard renderer.
- `npx vitest run tests/unit/cameraClearance.test.ts tests/unit/interiorSurfaces.test.ts tests/unit/interiorStories.test.ts tests/unit/sceneLighting.test.ts` checks the focused regressions.

The preserved `before/` files were captured before this change. Do not run the capture command with `before` against revised source and treat that as a baseline.
