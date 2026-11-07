# Official-site studio restyle

Implemented 2026-11-06 at the user's request: apply the official site's visual style, keep the animation workflow, run an adversarial review → update round, then deploy.

## Result

- Golden yellow surroundings with an original subtle forest silhouette.
- Purple player and controls, magenta editor heading, white writing surfaces, dimensional storyboard cards and selectively shaped buttons.
- Locally hosted Nunito plus a chunky Cyrillic-capable display face, Rubik One. This adapts the official typography; it does not redistribute Phosphate.
- Revised studio identity, matching library and full-script dialogs, clearer selected/playing storyboard states.
- Current editing, preview, whole-story playback, pause/resume, seek, fullscreen, voices and animation engine remain the same.

[Reference study](official-site.md) · [font and asset provenance](assets.md) · [independent adversarial review and fixes](adversarial-review.md).

## Review → update

The independent review found hidden writing fields on laptop-height windows, conflicting tablet breakpoints, clipped Russian scope labels and crowded editor chrome. These were corrected before deployment. Short desktop windows now scroll the document instead of compressing the canvas and writing area under their controls. The storyboard retains its existing position below the movie.

The shared login screen still comes from the original Worker; this release styles the authenticated studio. [Boundary](login.md).

## Verification

- TypeScript checks passed.
- All 652 unit tests across 46 files passed.
- Initial browser regression: 20 scenarios passed, including editing, replacement/cancel, whole-story playback, pause/resume, seeking, fullscreen, selected voice audio timing and native-GPU rendering.
- Final workflow/voice rerun: six scenarios passed after the layout fixes. The additional responsive regression initially exposed insufficient writing space in later moments; compact previous-moment excerpts fixed it. The regression then passed across nine viewports (320–1440px), testing both the first and second moment, writing visibility, width overflow, canvas/transport separation and Play hit-testing. This makes 21 distinct browser scenarios passed across the runs.
- Independent responsive inspection covered 320–1440px widths, short desktops, English/Russian, dialogs, keyboard focus and fullscreen. No unresolved release blocker.
- No new image, character, environment or voice design was generated for this UI release.

## Deployment

Deployed to [mabear-storybook.ilya-baimetov.workers.dev](https://mabear-storybook.ilya-baimetov.workers.dev/) as Cloudflare version `15fa4191-b9ea-4094-9923-c58956697c0a`. The original Worker remains separate.

Live signed-in Chrome verification: new branding and both local font families render; the existing two-moment test story plays through the yard and house; pause held at 9.9836s and immediate resume retained 9.9836s, then advanced to 16.0246s before pausing again. Final screenshot is [07-live-deployed.jpg](proof/07-live-deployed.jpg). No story text was replaced during this live check.

Public checks: `/api/health` returned 200, unauthenticated `/` returned 302 to the existing login gate, unauthenticated `POST /api/speech` returned 401. These checks and the visible authenticated result confirm this deployment, rather than merely a successful local build.

## Screenshots

- [Desktop studio](proof/03-story-desktop.png)
- [Empty story](proof/01-empty-desktop.png)
- [Story library](proof/02-library-desktop.png)
- [Mobile English](proof/04-story-mobile.png)
- [Mobile Russian](proof/05-story-mobile-ru.png)
- [320px Russian](proof/06-story-small-ru.png)
- [Deployed studio, authenticated Chrome](proof/07-live-deployed.jpg)

These are actual browser captures of the application. Existing scene geometry and assets are unchanged by this UI release.
