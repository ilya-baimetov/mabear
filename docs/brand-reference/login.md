# Password gate boundary

Reviewed 2026-11-06 during the official-site visual restyle.

The deployed `mabear-storybook` entry point is `worker/bridge.ts`. Its `/login` handler forwards the request to the existing `mabear` Worker through `STORY_SERVICE`, including the response HTML. The renderer in this checkout's `worker/auth.ts` is used by the standalone/local test Worker, not by the production storybook login page.

No login markup, styling, authentication, form fields, cookies, redirects or request handling were changed. Editing the local renderer alone would produce a misleading local-only restyle; changing the original Worker would exceed this edition's ownership boundary.

Verified by reading `wrangler.toml`, `worker/bridge.ts` and `worker/auth.ts`. The studio theme can be deployed independently while the existing shared password gate remains as it is.
