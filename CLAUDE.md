# MaBear — working conventions

Confidential prototype built under contract for Animaccord (Masha and the Bear). Not for public release.
The product is a fan-fiction game for kids and fans, not a studio production tool: no studio/editing UI.

- **Source of truth:** `docs/SPEC.md`. Its §14 is the Definition of Done; its §15 is the execution order.
- **Never ask the user questions mid-run.** If the spec is silent, choose the simplest option that keeps §14
  achievable and log the decision (one line: date, decision, why) in `docs/NOTES.md`.
- **Progress log:** after every milestone, append done / next / risks to `docs/STATUS.md`, then commit and push to the
  session's designated branch.
- **Contracts first:** `src/shared/schema.ts` and the bible are frozen after M1; later changes must be additive.
- **Honesty:** never present a stand-in or placeholder layer as real (spec §2). Labels stay visible in the Behind-the-scenes overlay.
- **Secrets:** only in env vars and Worker secrets. Never commit, print, or log them; never ask for them in chat.
- **Stack:** Vite + React + TypeScript (strict), Three.js, zod, `@anthropic-ai/sdk` (Worker only), vitest, Playwright
  (Chromium at `/opt/pw-browsers`; never run `playwright install`), Cloudflare Workers with static assets.
- **Model:** the director uses `claude-opus-5-5` (`DIRECTOR_MODEL` env overrides). Do not send `temperature` and do not
  disable thinking.
- **Style:** small pure modules; the engine never imports React; the worker never imports React or Three.js.
- Commit messages: imperative, scoped (`engine: add Bear rig`, `director: prompt caching`).
