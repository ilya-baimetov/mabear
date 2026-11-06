# MaBear — Storybook edition

Live: https://mabear-storybook.ilya-baimetov.workers.dev — same demo password as the original.

A private, live 3D story playground based on the prototype in `../claude`. Write a short scene, press Play, and watch nine actors perform it: Masha, Bear, the Wolves, Lady Bear, Hare, Rosie, Squirrel, and Rival Bear. EN/RU, editable examples, paragraph versions, local camera/light/music remixes, character reactions, and the pitch inspector are preserved. Start with **Examples → Garden visitors** to see the expanded cast.

## Run locally

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5178
```

The included examples work without a backend. For custom AI scenes, Vite proxies `/api` to a local Worker on port 8787. A local mock can be started with:

```sh
npm run build
npx wrangler dev --config wrangler.test.toml --port 8787 --var MOCK_DIRECTOR:1 --var DEMO_PASSWORD:local-demo --var SESSION_SECRET:local-demo-only
```

Open `/login` on the local app and use the test-only password above. Production credentials are never needed for the automated suite.

## Verify

```sh
npm run typecheck
npm test
npm run e2e
npm run build
```

The browser suite uses installed Google Chrome with SwiftShader and its own local mock Worker. It verifies functional behavior, not target-device GPU performance. `tools/stage.html` and `tools/likeness.html` are development-only inspection pages.

## Deploy

```sh
npm run build
npm run deploy
```

`wrangler.toml` deploys **mabear-storybook**, a separate Worker with its own static build and expanded AI director. Its service binding uses the existing **mabear** Worker for the password gate, so the demo password stays the same. The new Worker has its own `ANTHROPIC_API_KEY` secret; configure it with `npx wrangler secret put ANTHROPIC_API_KEY` when setting up a new environment. The original deployment is not modified. All app assets require authentication, and responses are marked noindex. Authentication depends on the original service remaining available.

## What changed

- Redesigned paper-and-sage editor, larger scene, cast focus, accessible timeline and full player fullscreen.
- Seven textured, skeletal GLB characters, including the earlier Masha trial, with calibrated retargeting and a repaired dress.
- Generated hollow-tree house, orchard trees, beehives, carrots and daisies, integrated into the existing forest and functional yard.
- Five new story actors throughout EN/RU parsing, the AI bible, validation, motion, audio, cameras, saves and cast controls.
- Revised lighting, higher rendering ceiling, closer opening composition.
- Adversarial fixes for draft loss on language switch, accidental AI calls on remix, camera reset/focus, timeline bounds, fullscreen controls and van routing.

See the [current asset and budget ledger](docs/expansion/ASSETS.md), [adversarial review and fixes](docs/expansion/adversarial-review.md), [earlier upgrade report](docs/upgrade/REVIEW.md), and the original [technical spec](docs/SPEC.md).

These are newly recreated prototype assets, not supplied production models. Character facial animation, contacts and synthesized audio remain approximations. No production likeness approval is implied.
