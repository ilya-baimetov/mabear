# Running the build as a `/goal`

## Before you start (done)

- Secrets live in `.secrets.env` (repo root, git-ignored, mode 600): Cloudflare account ID, demo password, session
  secret. `CLOUDFLARE_API_TOKEN` is filled once the Cloudflare connector has the token-minting scope (or the run
  mints it via the connector).
- The Worker `mabear` already exists as a placeholder at https://mabear.ilya-baimetov.workers.dev.
- The owner adds `ANTHROPIC_API_KEY` directly as a Worker secret in the Cloudflare dashboard. It never enters this
  environment or the chat.
- Run the goal **in this same session** (the secrets file lives in this container), in **auto** permission mode.

## The goal (paste as-is)

```
/goal Build the MaBear prototype exactly as specified in docs/SPEC.md and satisfy every item of its §14 Definition of Done. First read docs/SPEC.md fully (it is the source of truth) and load secrets with `set -a; . ./.secrets.env; set +a` whenever a command needs them; never print them. Work autonomously: never ask the user questions; when the spec is silent, choose the simplest option that keeps §14 achievable and log it in docs/NOTES.md. Follow the §15 milestone order and time boxes, P0 before P1 before P2; after the M1 contracts are frozen, run M2/M3/M4 and the audio engine (§15 Subagent E) as parallel subagents launched in one message. Commit and push to this session's designated branch after every milestone and update docs/STATUS.md each time. The goal is met only when the transcript shows, from the final state of the code: (1) the output of `npm run typecheck`, `npm test` and `npm run e2e`, each exiting 0; (2) `npm run build` succeeding and `grep -r "sk-ant" dist/` printing nothing; (3) every docs/screenshots/ file listed in §13 opened with the Read tool and reviewed, with Masha and Bear judged recognizable against §7.3 and docs/LIKENESS.md showing at least three scored likeness passes; (4) either passing `npm run eval:director` output, or docs/STATUS.md stating "director eval not run: key absent"; (5) either the deployed Cloudflare URL with the §12 curl smoke-test output, or docs/STATUS.md naming the missing Cloudflare variables and the one command that finishes the deploy; (6) docs/DEMO_SCRIPT.md written, `git status` clean, and the pushed branch head equal to local HEAD. The goal is impossible only if npm package installs stay blocked for more than 30 minutes. Hard stop: once `date -u` shows 07:40 UTC or later, or after 150 turns, commit, push, print the final docs/STATUS.md and treat the goal as met with the open items listed.
```

## Watching it

- `/goal` with no arguments shows the elapsed time, turn count, spend, and the evaluator's latest reason.
- `/goal clear` stops it.
- Progress lands in `docs/STATUS.md` and in commits on the branch.
