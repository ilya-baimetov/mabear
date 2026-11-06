# Masha asset trial — result and adversarial review

Completed 2026-11-06. **Recommendation: adopt this modeling direction, but do not replace the story player character until facial performance and clothing weights are repaired.**

## Deliverables

- Private interactive comparison: https://mabear-masha-trial.ilya-baimetov.workers.dev (existing demo password).
- Local comparison: http://127.0.0.1:5182 while `npm run trial:dev` is running.
- `trial/public/models/masha-rigged.glb`: actual textured, skinned character.
- `trial/public/models/masha-walk.glb`, `masha-run.glb`: actual character with animation embedded.
- `docs/rebuild/results/masha-comparison.mp4`: eight-second recording of the existing game's wave applied to both meshes. It is captured from the live WebGL canvases, not generated video.
- All provider output URLs: `results/meshy-01.json`.

The viewer offers the game's walk, run, idle and wave on both characters, Meshy's walk/run on both, a face test, bind pose, linked orbit, fixed viewing angles, wireframe, pause/scrub, slow motion and recording.

## Actual comparison

| Character | Mesh detail | Body animation | Facial performance | Asset cost |
|---|---|---|---|---|
| Current game Masha | 31,797 triangles; simplified face, mitten hands, soft hem detail | Existing game clips and secondary motion | Eyes, lids, brows and mouth animate | Existing procedural code |
| Meshy candidate | 61,827 triangles; shaped cheeks/nose/lips, individual fingers, cloth weave and embroidery | 24-bone skin; supplied walk/run; existing game gestures retarget successfully in the viewer | Zero morph targets; no eye, eyelid, jaw or mouth joints | 17,794,700-byte rigged GLB; $1.40 generation estimate |

The visual jump is substantial from the front and profile. The candidate remains recognizable from the back and has actual geometry rather than a camera-facing image. This does **not** establish exact production-model likeness, animation readiness across every story verb, mobile-game performance, or full-game integration.

## Adversarial findings → updates

| Finding | Action / remaining limitation |
|---|---|
| Skeleton names resemble Mixamo but the spine naming runs in the opposite order | Added an explicit mapping and world-space, rest-aware retargeting. Direct local quaternion copying would distort the rig. |
| Different limb proportions produced floating soles in the comparison | Added a viewer-only sole-contact normalization using actual skinned foot vertices. Both characters play in place. This normalizes contact and suppresses flight phases; it is **not** a full locomotion/IK integration. |
| Close-up could crop the candidate's larger scarf/head | Widened the close-up and full-body camera. Both panels retain the same camera settings. |
| Playing only Meshy's motion would obscure how the existing game behaves | Default comparison uses the existing game walk. Game run/idle/wave and Meshy's clips are separately selectable and clearly labeled. |
| Attractive stills conceal a frozen face | Added Face test. The candidate's smile and eyes stay static while current Masha speaks and blinks. No fake facial animation added. |
| Auto-rig treats the dress as leg-connected geometry | Kept visible and disclosed. Hem stretches/splits around leg motion; no cloth simulation. Requires weight painting, skirt joints or a separate cloth solution. |
| One GLB per animation would triple initial download | Runtime loads one full rigged GLB plus small armature-only animation files. Complete animated GLBs remain downloadable. |
| Recording could distort canvas aspect ratio | Corrected the recording's fit math; inspected the encoded MP4 frame. |

Residual visual issues: some hair detail is baked into texture, fingers are not individually rigged, strong leg poses stretch embroidery, and the back of the dress shows texture streaking. The smooth, fixed smile is not a substitute for Masha's expressive performance.

## Generation and budget

- Provider: fal, Meshy 7.1.
- Exact endpoint: `meshy/v7.1/image-to-3d`.
- Request: `01a1b215-cb49-7a23-999e-6387e3747948`.
- Rig task: `01a1b219-3faf-71b2-a4fd-c7dfd720b1db`.
- Returned seed: `665089369`.
- Input: full-resolution 1024×1536 JPEG derived from the previously generated Masha reference. Submitted as the endpoint's documented data URI input.
- Settings: standard mesh, 4K geometry, 60,000 target triangles, remesh, Meshy 7 textures, PBR, A-pose, auto-rig, 1 m height. No additional animation preset or second candidate.
- Published price: $1.20 textured + $0.20 rig/basic animations = **$1.40**. Source: https://fal.ai/models/meshy/v7.1/image-to-3d . This is the rate-derived total, not an invoice readback. $20 authorized ceiling; no further jobs submitted.
- Original rigged GLB URL: https://v3b.fal.media/files/b/0ab1691c/t8WvmPFZBL0q-hybiORrR_rigged_character.glb . All other outputs are retained in the result JSON.

## Verification and scope

TypeScript checks passed for the main app/worker and the comparison viewer. Trial production build passed. Actual WebGL rendering, front/profile/back, supplied walk/run, existing game walk/run/wave, facial gap, mobile layout and recording were inspected. The private Cloudflare deployment reaches the existing password screen; authenticated live rendering cannot be tested without the demo password. Local rendering uses the same source and asset files.

The original `mabear-storybook` deployment and game character code were not replaced. The trial has its own Vite build, asset folder and Worker configuration. Commands: `npm run trial:dev`, `npm run trial:build`, `npm run trial:deploy`.
