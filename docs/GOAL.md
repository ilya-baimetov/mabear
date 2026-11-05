# Running the build as a `/goal`

## Before you start (5 minutes, done by a human)

1. In the cloud environment's settings (environment menu in the session title bar → Edit), add these as
   environment variables or network secrets. A **new** session picks them up; an already-running one does not.

   | Variable | Used for | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Director eval (§8.4) + set as a Worker secret on deploy | A key from the Anthropic Console that Animaccord's prototype may use |
   | `CLOUDFLARE_API_TOKEN` | `wrangler deploy` | Token with **Workers Scripts: Edit** (plus Account: Read) |
   | `CLOUDFLARE_ACCOUNT_ID` | `wrangler deploy` | From the Cloudflare dashboard sidebar |
   | `DEMO_PASSWORD` | Password gate on the deployed site | Share it only with Animaccord |

   Missing variables don't stop the run: the build finishes, and `docs/STATUS.md` lists what's left to do.

2. Start a **new** cloud session on `ilya-baimetov/mabear`, in **auto** permission mode (so goal turns don't stop for
   approvals).
3. Paste the goal below as the first message.

## The goal (paste as-is)

```
/goal Build the MaBear prototype exactly as specified in docs/SPEC.md and satisfy every item of its §14 Definition of Done. First, if docs/SPEC.md is missing from your checkout, run `git fetch origin claude/keen-pascal-xwbndk && git checkout origin/claude/keen-pascal-xwbndk -- docs CLAUDE.md`, then read SPEC.md fully; it is the source of truth. Work autonomously: never ask the user questions; when the spec is silent, choose the simplest option that keeps §14 achievable and log it in docs/NOTES.md. Follow the §15 milestone order and time boxes, P0 before P1 before P2; after the M1 contracts are frozen, run M2/M3/M4 as parallel subagents launched in one message. Commit and push to this session's designated branch after every milestone and update docs/STATUS.md each time. The goal is met only when the transcript shows, from the final state of the code: (1) the output of `npm run typecheck`, `npm test` and `npm run e2e`, each exiting 0; (2) `npm run build` succeeding and `grep -r "sk-ant" dist/` printing nothing; (3) every docs/screenshots/ file listed in §13 opened with the Read tool and reviewed, with Masha and Bear judged recognizable against §7.3 after at least two likeness passes; (4) either passing `npm run eval:director` output, or docs/STATUS.md stating "director eval not run: key absent"; (5) either the deployed Cloudflare URL with the §12 curl smoke-test output, or docs/STATUS.md naming the missing Cloudflare variables and the one command that finishes the deploy; (6) docs/DEMO_SCRIPT.md written, `git status` clean, and the pushed branch head equal to local HEAD. The goal is impossible only if npm package installs stay blocked for more than 30 minutes. Hard stop: once `date -u` shows 07:40 UTC or later, or after 150 turns, commit, push, print the final docs/STATUS.md and treat the goal as met with the open items listed.
```

## Watching it

- `/goal` with no arguments shows the elapsed time, turn count, spend, and the evaluator's latest reason.
- `/goal clear` stops it.
- Progress lands in `docs/STATUS.md` and in commits on the branch.
