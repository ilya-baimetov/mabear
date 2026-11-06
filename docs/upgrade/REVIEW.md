# Storybook edition — implementation and adversarial review

Private prototype upgrade, 2026-11-05/06. Source: original `claude` prototype at commit `7dfaaa1`. Original deployment remains unchanged. The final working project lives directly in `codex/`; superseded local source is retained under `../.archive/codex-before-storybook-2026-11-05` and its reproducible dependency/build folders were removed.

## Product decision

Preserve the strongest part of the original: editable stories compile into deterministic live animation, with local camera, time and music remixes. Rebuild the presentation and improve the actual 3D assets rather than substitute still images for the working stage. The interface uses quiet cream, sage and plum so the animation remains prominent.

| Area | Change | Evidence / limitation |
|---|---|---|
| Characters | Re-sculpted faces, integrated Bear muzzle, refined Masha eyes/hair/scarf, cotton detail, skinned fur fibres | Actual front, three-quarter, close-up and motion captures; [character report](characters.md). Recreated approximations, not production files |
| Environment | Authored pine/birch forest, shrubs/ferns, cabin detail, water normals | Eleven CC0 local models; [provenance](environment.md) |
| Presentation | Responsive editor, cast focus, timeline keyboard controls, fullscreen with playback and mute | Desktop 1440×900 and mobile 390×844 inspected; mobile document width equals viewport |
| Cinematography | Duo staged together initially, closer/lower establishing shots, softer daylight and restrained grading | First wide revision was rejected because characters were too small; revised shot inspected |
| Deployment | Separate Worker and asset build; shared existing password/director service | Authentication remains required for every app asset; no secrets copied |

## Adversarial review → updates

An independent source/behavior review produced concrete reproductions. A separate rendered review rejected visual changes that passed tests.

| Finding | Update | Verification |
|---|---|---|
| Changing language erased unplayed edits to examples | Translate only a pristine fixture, preserving text, cleared/deleted/added paragraphs, title and remixes | Store regression cases |
| Remix could direct earlier dirty paragraphs and incur AI calls | Replay the existing compiled segment directly | Regression asserts zero director calls and preserved dirty text |
| Cast close-up remained active during paragraph/remix playback | Reset camera override centrally when playback starts | Playback regression |
| Left arrow at zero stored negative time | Clamp seek before updating Player and store | Bounds test and browser keyboard check |
| Fullscreen hid all transport controls | Fullscreen the complete player; keep playback, scrub and mute | Automated and interactive fullscreen playback |
| Cast focus ignored carried/sleeping pose | Derive focus from the rendered head transform | Pose tests; visual carry review found an additional occlusion issue, fixed with eye-bone targeting and rider clearance |
| Van route could cross van body through unchecked fallback | Validate graph edges, add van perimeter and southwest pond waypoint, hold actual location when no safe route exists | Every named-mark pair plus 1,000 deterministic arbitrary routes |
| Asset download failure removed forest groups | Per-model procedural fallback at original anchors | Blocked all eleven model requests: scene rendered; restored network: eleven loaded, zero failures |
| First forest revision still looked like stacked blobs | Replace it with authored branched/leaf-card models | Rejected and accepted captures retained locally |
| Enlarged Bear head could occlude carried Masha | Raised/rearward rider contact and elevated camera; actual eye-bone focus | Raycasts to both eyes against posed Bear geometry plus final rendered capture: Masha clearly visible |

## Evidence

Screenshots are retained in `docs/upgrade/screenshots/` and excluded from the runtime bundle. Primary captures: `desktop-final.png`, `opening-final.png`, `yard-final.png`, `masha-final-face.png`, `masha-final-front.png`, `masha-final-three.png`, `masha-motion.png`, `wolves-final.png`, `mobile-final.png`, `fullscreen-final.png`, and `carried-focus-final.png`. Iteration captures are deliberately retained so review decisions can be audited.

The main browser reported approximately 60 fps during the local 1440×900 scene check, with roughly 1.54 million rendered triangles and 110 draw calls in the final opening sample (full resolution, highest post tier). This is one machine/view, not a cross-device performance guarantee. Headless SwiftShader results are functional checks only.

## Remaining limits

- Character likeness is improved but still visibly approximate; facial nuance, hands, cloth deformation and some physical contacts remain prototype quality.
- Browser speech and synthesized effects/music are retained; these are not the show's production voices or score.
- User stories are constrained by the existing character/action bible; unsupported actions may be adjusted or use offline fallback.
- The new deployment relies on the original `mabear` service for authentication and AI. Its availability, model configuration and usage limits are shared.
- Direct authenticated production AI validation requires the existing demo password; local mock-director and real auth implementation are independently tested.

## Final verification

- `npm run typecheck`: passed.
- `npm test`: 475 tests passed across 24 files.
- `npm run e2e`: 14 tests passed against the built app and real local Worker with a mock director, in 5.7 minutes.
- `npm run build`: passed. Bundler notes that the GLTF loader is shared between static/dynamic imports; this is an informational chunking warning.
- Cloudflare deployment dry-run: passed, 64 asset files, expected service and asset bindings only.
- `git diff --check`: passed; no credential patterns found in the built app, public assets or source changes.
- Manual browser review: desktop, mobile without horizontal overflow, fullscreen play/pause, actual character poses, eleven-model load failure/recovery, and final carried-Masha framing. Final local desktop sample: about 60 fps, no console warnings/errors.

Live URL: [MaBear Storybook](https://mabear-storybook.ilya-baimetov.workers.dev).

Cloudflare version: `08505e20-1aa3-455c-8712-2a14afb0b3f9`. Deployment succeeded, with 64 bundled asset files. Live HTTP checks confirmed health 200, login 200, unauthenticated app/code/model requests redirected to login, director 401, invalid-cookie model request rejected, and noindex/private-no-store headers. Original service health remains 200. The live browser was opened at the password gate and retained for the user. Exact results: [deployment.json](deployment.json).

The same existing demo password applies. Production AI execution behind the gate was not attempted without that password; its shared service binding, real auth implementation and local mock-director flow were verified. This is the remaining validation boundary.
