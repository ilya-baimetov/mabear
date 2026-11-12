# Bear’s house: wall-return study 04

**Integration follow-up (7 November 2026):** the revised architecture and furniture are now used by the game. See [actual-story integration, review and release evidence](../interior-integration/README.md). This page preserves the earlier shape-study evidence; the historical standalone-review boundary below describes that stage of the work.

Open [blockout.html](blockout.html) locally; reload if the previous study is already open. The page bundles Three.js and uses saved local cartoon reference frames. No server, network or API key is required.

The new footage resolves the principal error: the broad green bulge was substantially **loose wallpaper over a flat return**, not a solid rounded pier. This revision removes the invented pier, moves the foreground timber left and forward, lengthens the receding wall, and leaves a wider rear-wall interval beside the fireplace. Kitchen fixtures/table move together; the illustrated route passes in front of the table. The fireplace now meets the rear wall rather than standing off it. Furniture remains clean and untextured.

[New reference evidence and coverage](../interior-macro-reference/wall-return-episode26.md).

## What the new evidence establishes

| Relationship | Primary source | Evidence and limit |
|---|---|---|
| Cooking wall → fireplace/gallery | [Episode 24, 1:52.8](https://www.youtube.com/watch?v=p84nSJl2iNI&t=112s) | The prep table, yellow pan wall, timber post and fireplace appear together across an open sightline. Strong local connection evidence; not measured angles or dimensions. |
| Wrapping kitchen fixtures | [Episode 17, 5:40](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=340s) | Pantry/fridge to the left, window and counters across several wall planes, stove at the living-room end. The porridge mess is not a material target. |
| Bookcase → curtain | [Episode 17, 5:45](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=345s), [Episode 24, 1:17.8](https://www.youtube.com/watch?v=p84nSJl2iNI&t=77s) | Curtain immediately follows the bookcase in the same shot. The previous placement across the room was poorly supported. Curtain destination remains unknown. |
| Raised blue outdoor entrance | [Episode 17, 4:10](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=250s), read with [1:12](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=72s) | Short log steps lead to a raised outdoor entry. The short steps are distinct from the tall flight newly visible in episode 26 at 2:18. |
| Compact reading group | [Episode 17, 1:35](https://www.youtube.com/watch?v=qBp1rCz_yQU&t=95s) | Fireplace/chair/bookcase/low table relationship. Actor proxies are for scale, not new character models. |
| Wall return and depth | [Episode 26, 2:40](https://www.youtube.com/watch?v=lzDDCCQuuVA&t=160s), [5:43](https://www.youtube.com/watch?v=lzDDCCQuuVA&t=343s) | The bare wall separates the foreground timber, receding plane and rear corner. The later shot shows the fireplace recess but includes loose wallpaper. Neither establishes measured full-house dimensions. |

[Research evidence note and inspected excerpts](../interior-macro-reference/kitchen-connection-episode24.md). The study used focused player sampling, not complete-episode viewing.

## Review controls

- **Bare wall** is the opening comparison. It uses the pre-wallpaper 2:40 shot. **Fireplace recess** shows the same model beside the later 5:43 wide shot.
- **Reference angle** approximates the source camera; **Overview** reveals the connected layout. Drag to orbit, scroll to zoom, Reset restores the selected preset.
- Kitchen connection, kitchen fixtures, reading corner, entrance and annotated plan remain available. Scale figures are optional rough size proxies.
- The fixture comparison hides the prep table/chairs. Its reference angle also hides the pot to match the source's empty stove; Overview restores it. These changes are disclosed on the page.
- The evidence strip includes the curling wallpaper and newly visible separate stair flight. The flight's full route and upper destination are not yet modeled. It must not be confused with the short door steps.

## Review boundary

The wall type and local depth relationship are now evidence-based. Exact coordinates, full-house dimensions and camera lenses remain inferred. New source frames also show a right-side door/projection and separate tall flight; those deserve their own layout pass before finishing the rest of the envelope. Previous blanket wording that the staircase was a misreading has been corrected.

No textures, porridge stains, soot, loose wallpaper, artwork or renovation damage were added. At the completion of this study it was a **separate local review model**; game source and deployment were unchanged. The integration follow-up above records the subsequent runtime work.

## Adversarial review → update

Independent source review checked the pre-wallpaper image against the later reveal, rejected further solid-pier widening, and supported the flat-wall correction. Render review checks the front timber, receding side plane, rear corner, rear-wall interval, kitchen sightline and table circulation. It also caught a gap behind the fireplace; the fireplace was moved rearward and its masonry extended to meet the wall before the final capture.

The final review requested a small additional leftward shift of the return and kitchen together. The resulting capture separates the timber, side plane and rear corner clearly, widens the rear-wall interval and preserves circulation. No material regression was found; exact framing and dimensions remain approximate.

Strict TypeScript checks and [browser verification](blockout-verification.json) cover all seven views, reference loading, finite geometry/transforms, no texture maps, camera modes, orbit/reset, scale visibility and mobile overflow. Actual screenshots come from the standalone Three.js model.

Build: `npx tsx scripts/buildInteriorBlockout.ts`

Capture/check: `node scripts/captureInteriorBlockout.mjs`

Comparison images: `shapes-*-side-by-side.png`. Earlier study03 architecture screenshots are retained in `previous-study03/`. Earlier deferred texture assets remain unused.

The separate [whole-game visual audit](../visual-priority-review/index.html) follows mise-en-scène → recognizable forms → textures. It documents observations and proposed next work, not completed game fixes.
