# Story animation release

This release integrates the accepted Masha v3 face/hands into the production game and improves the remaining eight actors. It preserves the current animation-authoring workflow and official-site visual style. No external asset-generation jobs were submitted.

| Area | Production change | Remaining limit |
|---|---|---|
| Masha | Articulated face/hands, smooth story emotions, candy and generic prop support, continuous clap/taste transitions | Existing rebuilt/source face boundary can still show under hard indoor light |
| Six generated animals | Model-specific eyelids, brow/cheek/chin response, surface-fitted paw/hoof contacts | Source fur and muzzle topology remains coarse; this is not a new articulated mouth interior or finger rig |
| Wolves | Deterministic blended expressions/jaw and paw contacts | Existing procedural anatomy retained |
| Squirrel | Repaired anatomical skeleton and skin binding; tail no longer belongs to an arm | Source sculpt and baked brow shape remain unchanged |
| Story choreography | Free hands before clapping; approach reachable furniture or crouch to ground; release prop at its actual resting transform; leave chair footprint before standing | Known-set staging, not general mesh collision simulation; carry/hug contacts and some camera occlusion remain outside this pass |
| Playback | Expressions, props and contacts restore on backward seeks; clap foley follows actual contact timing | Final story recordings are silent animation studies; production voices/music remain enabled |

## Review and verification

- [Independent adversarial review](adversarial-review.md): fishing, clapping/tasting and set-down transition findings, before/after world-space evidence, and final disposition.
- [Actual-story QA](story-qa.md): compiled timelines and production factory/stage, not replacement showcase poses. Actual camera views and isolated facial diagnostics are labelled separately.
- [Facial work](faces.md), [Masha integration](masha-integration.md), [Squirrel binding](squirrel-bind.md), [resource/performance review](performance-review.md).
- Full unit suite: **711 tests passed in 56 files** after review corrections. This includes actual-GLB contact and lifecycle tests, all-nine-actor compiled release checks, boundary continuity, source mesh deformation, exact seeking, compiler fixtures and transport.
- Built Worker/browser suite: **24 passed**. Authentication, movie transport, authoring, expanded cast, responsive controls and selected voice playback were exercised. The measured ten-second desktop loop ran at **59.8 ticks/s with 151 draw calls**; this is a local observation, not a guarantee for other devices.
- Main/Worker TypeScript, production build and compatibility build of the separate Masha comparison pass. The final three browser checks also pass on the frozen runtime: actual Pancake playback, expanded-cast loading/seek and movie pause/resume scope.

## Reproduce the rendered evidence

Start `npx vite --config scripts/animation-story-proof.vite.ts --port 5185 --strictPort`, then run:

```sh
ANIMATION_PROOF_DIR=docs/animation-story-release/proof/final npx tsx scripts/captureAnimationStories.ts
```

The harness compiles the shipped English samples and additional focused stories through `compileEpisode`, evaluates the real timeline and loads production character factories. Recording preserves actual story cameras and pace. The separately labelled facial diagnostic changes camera/background visibility only. Decoder verification uses `scripts/reviewAnimationStoryVideo.ts` against the delivered MP4.

Large intermediate PNG captures remain local under `proof/` and are ignored in Git. Final MP4s, compact checks, selected reviewed stills and decoded review contact sheets are retained. Intermediate documentation links refer to those local captures; the scripts reproduce them.

## Deployment and final videos

Deployed to [the main game](https://mabear-storybook.ilya-baimetov.workers.dev), version `e6df8d1e-04ea-4da0-bf80-c8719e111518`, runtime commit `7c80d37`. [Deployment record](deployment.json).

The authenticated Chrome tab was reloaded and served the expected `studio-B9iKQ6tN.js` bundle. The existing two-moment story was preserved; both yard and house rendered; playback advanced through the story. Seeking to 1s and resuming advanced to 5.323s before pause. Public health returned 200, unauthenticated app/assets remained behind the 302 login redirect, and the director endpoint remained protected with 401. This live check used the existing story; fresh AI directing was covered by the built Worker tests with its mock director, not by a new paid live request.

- [Actual compiled-story animation](proof/final/actual-story-animation.mp4): 41.93 seconds, including the corrected action boundaries. Full decode verified.
- [Facial close-up diagnostic](proof/final/diagnostic-story-faces.mp4): 17.16 seconds; actual story expressions with a labelled camera/background change. Full decode verified.

Both recordings are silent animation studies. The production game retains its selected voices and music.
