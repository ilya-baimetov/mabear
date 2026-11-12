# Repository contents

The private repository at https://github.com/ilya-baimetov/mabear contains the game source, Cloudflare Worker, dependency lockfile, runtime assets under `public/`, tests, development tools, capture scripts, final review recordings and reports. The Storybook edition is at the repository root.

The latest deployed game is recorded in [interactive-objects/deployment/deployment.json](interactive-objects/deployment/deployment.json). Pushing to GitHub does not deploy it; deployment remains an explicit separate step.

## Local-only material

`.gitignore` excludes credentials, installed dependencies, generated build output, duplicate source archives, rejected capture iterations and full-resolution frame sweeps. These files are retained in the original working folder; they were not deleted. Some historical review links point to these local-only diagnostics. Final comparison videos and the numerical proof remain checked in.

Production secrets are configured on Cloudflare, never stored here. A fresh checkout can run the bundled examples without production credentials; see the root [README](../README.md) for installation, local Worker setup, verification and deployment.

## Evidence

- [Default physics and interactive door](interactive-objects/README.md)
- [Bounded Rapier trial](rapier-trial/README.md)
- [Revised house interior](interior-integration/README.md)
- [Camera and physical interactions](staging-interactions/README.md)

Deployment records describe what was checked at each release. The current release passed 798 local tests; its live health and authentication boundary were checked, while authenticated live playback was not repeated after the browser session signed out.
