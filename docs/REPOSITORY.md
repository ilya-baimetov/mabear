# Repository contents

The private repository at https://github.com/ilya-baimetov/mabear contains the game source, Cloudflare Worker, dependency lockfile, runtime assets under `public/`, tests, development tools, capture scripts, final review recordings and reports. The Storybook edition is at the repository root.

The latest deployed game is recorded in [kitchen-bench/deployment/deployment.json](kitchen-bench/deployment/deployment.json). Its release source (`884b620`) is committed on `main`; a fresh clone includes the game, runtime assets and verification evidence. Pushing to GitHub does not deploy it; deployment remains an explicit separate step.

## Local-only material

`.gitignore` excludes credentials, installed dependencies, generated build output, duplicate source archives, rejected capture iterations and full-resolution frame sweeps. These files are retained in the original working folder; they were not deleted. Some historical review links point to these local-only diagnostics. Final comparison videos and the numerical proof remain checked in.

Production secrets are configured on Cloudflare, never stored here. A fresh checkout can run the bundled examples without production credentials; see the root [README](../README.md) for installation, local Worker setup, verification and deployment.

## Evidence

- [Garden-to-kitchen continuity, bench physics and responsive preparation](kitchen-bench/REPORT.md)
- [Ball continuity and individual carrots](parallel-interactions/README.md)
- [Bear's cupboard interaction](cupboard/README.md)
- [Default physics and interactive door](interactive-objects/README.md)
- [Bounded Rapier trial](rapier-trial/README.md)
- [Revised house interior](interior-integration/README.md)
- [Camera and physical interactions](staging-interactions/README.md)

Deployment records describe what was checked at each release. The current release passed 895 tests, TypeScript checks and a fresh production build. Authenticated live bench/kitchen stories, pause/resume, seeking, replay, edits, scene deletion, reload, all 24 loaded JavaScript bundle hashes, public health and anonymous access restrictions passed. Existing interactions passed the local regression review. Live story tests used the offline director with API calls blocked; no paid generation was performed during deployment verification. The report preserves the bounded physics scope and small accepted fur/rim contacts.
