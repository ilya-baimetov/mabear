# Running the build as a `/goal`

## Before you start

- Deploys go through Cloudflare Workers Builds: every push to **`claude/keen-pascal-xwbndk`** builds and deploys once
  `.deploy-ready` is committed (spec §12). Cloudflare can't watch wildcard branches, so the run works on that branch.
- The Worker `mabear` exists (placeholder) at https://mabear.ilya-baimetov.workers.dev, with `ANTHROPIC_API_KEY`,
  `DEMO_PASSWORD` and `SESSION_SECRET` already set as Worker secrets.
- **One manual step:** in the cloud environment's settings, add the environment variable `DEMO_PASSWORD` (the demo
  password) so the new session can log in for the smoke test.
- Start a **new** cloud session on `ilya-baimetov/mabear` in **auto** permission mode and paste the goal below.

## The goal (paste as-is into a new session)

```
/goal Build the MaBear prototype exactly as specified in docs/SPEC.md and satisfy every item of its §14 Definition of Done. Step 0: run `git fetch origin claude/keen-pascal-xwbndk && git checkout -B claude/keen-pascal-xwbndk FETCH_HEAD`; work on and push to that branch only (I explicitly permit this instead of your designated branch: Cloudflare deploys from it). Then read docs/SPEC.md fully; it is the source of truth. Read DEMO_PASSWORD from the environment; never print it. Work autonomously: never ask me questions; when the spec is silent, choose the simplest option that keeps §14 achievable and log it in docs/NOTES.md. Follow the §15 milestone order and time boxes, P0 before P1 before P2; after the M1 contracts are frozen, run M2/M3/M4 and the audio engine (§15 Subagent E) as parallel subagents launched in one message. Commit and push after every milestone and update docs/STATUS.md each time. The goal is met only when the transcript shows, from the final state of the code: (1) the output of `npm run typecheck`, `npm test` and `npm run e2e`, each exiting 0; (2) `npm run build` succeeding and `grep -r "sk-ant" dist/` printing nothing; (3) every docs/screenshots/ file listed in §13 opened with the Read tool and reviewed, with Masha and Bear judged recognizable against §7.3 and docs/LIKENESS.md showing at least three scored likeness passes; (4) passing `npm run eval:director` output against the deployed Worker, or docs/STATUS.md explaining why it could not run; (5) the latest Workers Build for the pushed head reported as success via the Cloudflare MCP connector, plus the §12 curl smoke-test output against https://mabear.ilya-baimetov.workers.dev; (6) docs/DEMO_SCRIPT.md written, `git status` clean, and origin/claude/keen-pascal-xwbndk equal to local HEAD. The goal is impossible only if npm package installs stay blocked for more than 30 minutes. Hard stop: once `date -u` shows 07:40 UTC or later, or after 150 turns, commit, push, print the final docs/STATUS.md and treat the goal as met with the open items listed.
```

## Watching it

- `/goal` with no arguments shows the elapsed time, turn count, spend, and the evaluator's latest reason.
- `/goal clear` stops it.
- Progress lands in `docs/STATUS.md` and in commits on the branch.
