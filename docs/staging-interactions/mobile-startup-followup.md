# Deferred iPhone startup issue

User report: iPhone 14 Pro Max, current iOS; Safari and Edge show the loading message, flicker/reload, then a browser crash page after roughly 10–15 seconds. User subsequently deprioritized this work. **Diagnosis only; no mobile source changes or deployment.**

The strongest current hypothesis is startup memory pressure. It is not a confirmed device crash diagnosis: no iPhone process log or Safari remote-debug trace was available. Desktop mobile emulation cannot validate iOS process limits. Local Playwright WebKit was not installed.

| Priority | Local evidence | Follow-up |
|---|---|---|
| 1 | All nine actors load concurrently, while nature loading already runs; scenery, textures, HDRI and a hidden test robot then load together. All locations are built eagerly. | A per-stage mobile profile and a bounded shared load queue, before allocation. |
| 1 | Loaded-stage inventory contained 75 referenced material textures: approximately **458 MiB** nominal RGBA storage including mipmaps if all became resident. Some were not uploaded in the single inspected frame. Generated GLBs alone expand from about 27 MB download to **305 MiB** nominal texture storage. | Mobile-only texture variants or decode/downsample limits; preserve desktop assets. |
| 1 | Every hardware renderer defaults to post tier 3 and a **4096 × 4096** shadow target. This Three.js PCF path creates both color and unsigned-int depth attachments: approximately **128 MiB** nominal storage. Adaptation waits until all assets finish plus five seconds. | Mobile shadow/buffer/post caps before first render; do not rely on later FPS adaptation to survive startup. |
| 2 | Retained geometry/morph attribute buffers measured **91.3 MiB**. Morph GPU texture arrays add approximately **42.6 MiB** before driver overhead; Three.js also creates corresponding CPU float buffers. | Later investigate actor loading and face data allocation without removing desktop animation quality. |
| 2 | Nature asset declarations refer to **176 MiB** of decoded RGBA image data but only **60 MiB** is unique by image filename. Material deduplication retains unused originals in the disposal set. Beehive and carrot GLBs also load separately for set/prop and instanced garden uses. | Release unused decoded images/geometries and share texture sources safely. Avoid disposing resources still used by clones. |
| 3 | No application `webglcontextlost` handling was found. Player renders continuously during startup and while paused. | Graceful context-loss UI and lifecycle safeguards; not a substitute for reducing initial allocations. |

These are dimensional estimates and local JavaScript buffer measurements, **not measured Safari resident memory**. They exclude parts of transient decode/canvas work, shader/driver allocations and browser overhead. The proof harness fixes a 1920 × 1080 drawing buffer, so its render-target footprint is not the actual iPhone page size; texture and geometry findings remain relevant.

Code pointers: `src/engine/stage.ts` (startup/load policy and adaptation), `src/engine/assets.ts`, `src/engine/set/nature.ts`, `src/engine/set/generatedYard.ts`, `src/engine/post/post.ts`, `src/engine/look.ts`, `src/engine/characters/generatedFace.ts`, `src/app/components/Stage.tsx`. Three.js allocation paths were checked locally in `WebGLShadowMap.js` and `WebGLMorphtargets.js`.

Recommended next implementation boundary, when resumed: root owns a pure device profile plus stage/render caps and context UI; asset work owns an explicitly passed per-stage loader context, concurrency and mobile-only texture policy. Do not introduce a global mutable quality flag or change the desktop default.
