# MaBear — Storybook edition

Live: https://mabear-storybook.ilya-baimetov.workers.dev — same demo password as the original.

A private, live 3D story playground based on the prototype in `../claude`. Write a short scene, press Play, and watch Masha, Bear and the Wolves act it out. EN/RU, editable examples, paragraph versions, local camera/light/music remixes, character reactions, and the pitch inspector are preserved.

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

`wrangler.toml` deploys **mabear-storybook**, a separate Worker with its own static build. Its service binding uses the existing **mabear** Worker for the password gate and AI director. It therefore uses the same demo password and backend, without copying any secrets. The original deployment is not modified. All app assets require authentication, and responses are marked noindex. The new edition depends on the original service remaining available.

## What changed

- Redesigned paper-and-sage editor, larger scene, cast focus, accessible timeline and full player fullscreen.
- Refined rigged characters: continuous face/muzzle sculpts, better eyes, blonde hair, fabric shading and fur fibres.
- Authored CC0 pine/birch forest, richer cabin details, undergrowth and water.
- Revised lighting, higher rendering ceiling, closer opening composition.
- Adversarial fixes for draft loss on language switch, accidental AI calls on remix, camera reset/focus, timeline bounds, fullscreen controls and van routing.

See [upgrade report](docs/upgrade/REVIEW.md), [character evidence](docs/upgrade/characters.md), [environment provenance](docs/upgrade/environment.md), and the original [technical spec](docs/SPEC.md).

These are newly recreated prototype assets, not supplied production models. Character facial animation, contacts and synthesized audio remain approximations. No production likeness approval is implied.
