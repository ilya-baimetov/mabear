# Assets and licenses

Every third-party asset used by the prototype, with source and license (spec §7.6). Each module appends its own section.

## Audio

No audio samples or third-party audio files are used: every sound is synthesized at runtime with the Web Audio API
(`src/engine/audio/`), so there is nothing to license. The 20-minute sample hunt (spec §7.6) was skipped in favour of
synthesis for speed and zero licensing risk.

| Layer | Source | License |
|---|---|---|
| Dialogue + Masha interjections | Browser Web Speech `speechSynthesis` voices (system/browser-provided TTS; stand-in for studio voices) | Provided by the user's browser/OS; not redistributed |
| Bear vocalizations, Masha fallback blips | Formant-filtered sawtooth + noise (`vocals.ts`) | Original code (project) |
| Foley (footsteps per surface, thuds, rustles, creaks, sizzle, munch, splashes, pour, clap) | Filtered noise / oscillator recipes (`foley.ts`) | Original code (project) |
| Event SFX (all 20 `SfxId`s) | Synth recipes (`sfx.ts`) | Original code (project) |
| Ambience (birds, wind, creek, rain, thunderstorm, crickets, bees, strong wind) | Noise beds + chirp generators (`ambience.ts`) | Original code (project) |
| Music (9 moods × 3 intensities) | Procedural score: Karplus-Strong "balalaika", detuned-saw accordion pad, synth percussion (`music.ts`) | Original code (project) |

`public/assets/audio/` is intentionally empty.

## Motion clips

Body motion for the stand-in rigs comes from open animation clips (spec §7.4), retargeted offline by
`scripts/bakeMotion.ts` (logic in `src/engine/motion/retarget.ts`) onto our skeleton convention (Mixamo bone names,
identity-rest T-pose, facing +z) and baked at 20 fps into `src/engine/motion/clips.generated.ts` (~125 KB). Evaluation
samples the baked keyframes as a pure function of time (no `AnimationMixer`). Faces are always procedural.

| Asset | Source URL | Author | License | Clips used → verbs |
|---|---|---|---|---|
| `RobotExpressive.glb` (stored at `public/assets/motion/RobotExpressive.glb`) | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb | Tomás Laulhé (Quaternius), modifications by Don McCurdy; distributed in the three.js examples | CC0 1.0 (public domain) | Wave → `wave`; Dance → `dance`; Idle, Yes, No, ThumbsUp baked for reuse. **Upper body only**: its legs are a long thigh plus a foot stub driven by IK, so legs, shoulders and the head stay procedural / Mixamo |
| `Xbot.glb` (not redistributed; download from the URL to re-bake: `npx tsx scripts/bakeMotion.ts public/assets/motion/RobotExpressive.glb <path>/Xbot.glb`) | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb | Adobe Mixamo (character "X Bot" and its animations), distributed in the three.js examples | Mixamo terms: royalty-free use in projects; raw files are not redistributed standalone (only retargeted, baked keyframes ship) | idle → `idle` + base of most procedural verbs; walk → `walk_to`, `enter`, `exit`, `tiptoe_to` (legs); run → `run_to`, `chase`; agree → `nod`; headShake → `shake_head`; sneak_pose → `tiptoe_to`, `hide`, `peek`; sad_pose → `cry` |

Verbs with no clip in these libraries are procedural (keyframe-free pose functions in `src/engine/motion/verbs/`):
jump, spin, sit, stand_up, fall_down, sleep, wake_up, yawn_stretch, clap, point_at, shrug, facepalm (Bear's
signature), hug, laugh, sulk, surprised, scared, angry_stomp, sneeze, sigh, take, give, eat, throw, cook, fish, swing,
carry, water_plants. `VERB_KIND` in `src/engine/motion/library.ts` labels every verb `clip`, `clip+procedural` or
`procedural` for the Behind-the-scenes data view. Quaternius' Universal Animation Library (CC0) was tried first but is
only offered through itch.io's download flow, so it was skipped (time box).

## Models

Every character, set element and prop resolves through the asset manifest (`src/engine/assets.ts`, spec §7.3).
In the prototype all of them are **procedural stand-ins built in code** (original project code, no third-party
geometry or textures): the set "Bear's yard" (`src/engine/set/bearsYard.ts`: log cabin with porch, chimney smoke and
carved windows, garden, beehive, oak with rope swing, hammock, pond + pier, creek + two footbridges, table + samovar,
bench, woodpile, big pine, bush, the Wolves' ambulance van, picket fences, flowers, rocks, an instanced
pine/birch forest, a painted ground texture and grass tufts), the props (`src/engine/props/props.ts`), the particle
effects (`src/engine/fx/fx.ts`) and the series look (`src/engine/look.ts`). All textures (wood grain, stone noise,
ground) are generated at runtime. Swapping any stand-in for an official Animaccord glTF export is a manifest change
(`source: { gltf: url }`, plus `skeletonMap` for a rig with other bone names).

| Asset | Source URL | Author | License | Use |
|---|---|---|---|---|
| `public/assets/models/RobotExpressive.glb` | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb | Tomás Laulhé (Quaternius), modifications by Don McCurdy; distributed in the three.js examples | CC0 1.0 (public domain) | Manifest entry `robot_test`: a hidden glTF test character that proves the glTF path (loaded with `GLTFLoader`, bones exposed under Mixamo names through `ROBOT_SKELETON_MAP`). Shown only on `tools/stage.html?robot=1` |

## Environment: HDRI and PBR textures (A5 look pass)

Stand-ins for the series' set dressing, loaded asynchronously after the stage first renders (the procedural look stays
if any file fails). All CC0 1.0 (public domain), downloaded from the original sites; the texture maps were resized to
512 px and the colour maps normalised offline to a neutral mean (sRGB ≈ 0.85, contrast kept) so the set's baked
vertex colours still carry the palette — the photo texture only adds grain, fibre and relief. Total ≈ 2.2 MB.

| File (`public/assets/…`) | Source URL | Author | License | Use | Size |
|---|---|---|---|---|---|
| `hdri/meadow_2_1k.hdr` | https://polyhaven.com/a/meadow_2 (file: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/meadow_2_1k.hdr) | Sergej Majboroda (Poly Haven) | CC0 1.0 | Image-based lighting: tinted per time of day, rotated to the key light, prefiltered with PMREM (`look.ts`). Not shown as the background (the stylised sky gradient stays) | 1.55 MB |
| `textures/grass_detail.jpg`, `textures/grass_normal.jpg` | https://ambientcg.com/view?id=Grass004 (1K-JPG: Color, NormalGL) | ambientCG (Lennart Demes) | CC0 1.0 | Ground detail + normal (grass), tiled every 2.4 m over the painted layout (`bearsYard.ts` ground shader) | 142 KB + 93 KB |
| `textures/dirt_detail.jpg`, `textures/dirt_normal.jpg` | https://ambientcg.com/view?id=Ground103 (1K-JPG: Color, NormalGL) | ambientCG (Lennart Demes) | CC0 1.0 | Ground detail + normal on the dirt path, worn patches and shores | 107 KB + 80 KB |
| `textures/wood_detail.jpg`, `textures/wood_normal.jpg` | https://ambientcg.com/view?id=Wood058 (1K-JPG: Color, NormalGL) | ambientCG (Lennart Demes) | CC0 1.0 | Shared `wood` material: cabin logs, roof planks, porch, fences, bridges, props (metric UVs, grain along each log/board) | 76 KB + 24 KB |
| `textures/bark_detail.jpg`, `textures/bark_normal.jpg` | https://ambientcg.com/view?id=Bark014 (1K-JPG: Color, NormalGL) | ambientCG (Lennart Demes) | CC0 1.0 | Shared `bark` material: pine, birch and oak trunks (set + instanced forest) | 107 KB + 49 KB |

Everything else in the environment remains original procedural code: the improved pines (layered jagged tiers,
tapered trunks with root flare) and birches (layered canopy clumps), per-tree colour variation, foliage clump noise,
instanced grass tufts with vertex-shader wind, distant forest silhouettes fading into the fog, sky clouds, and the
post-processing stack (`src/engine/post/post.ts`: three.js GTAO + SMAA passes, own dual-filter bloom and ACES + warm
grade composite). Kenney's and Quaternius' CC0 nature packs were considered but not used: their faceted low-poly trees
do not match the soft series look, and Quaternius' packs are offered through itch.io's download flow.

## Fonts
| Asset | Source | Author | License | Use |
|---|---|---|---|---|
| Nunito (weights 400–900) | https://fonts.google.com/specimen/Nunito (loaded from Google Fonts at runtime, not bundled) | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 | Player UI and login page type |

## Likeness references (not shipped)
Three reference images (2019 Russian postage stamps featuring Masha and the Bear, from Wikimedia Commons) were viewed locally in the git-ignored `refs/` folder to measure proportions and sample colours (`docs/LIKENESS.md`). They are Animaccord IP, are **not** committed, and are absent from `public/` and `dist/`. The characters themselves are Animaccord IP; the in-code stand-ins exist only to demonstrate the system to Animaccord and its funders.

## Storybook edition vegetation

The new forest uses eleven locally bundled CC0 Quaternius models and their textures. Full sources, unchanged licenses, local modifications and load-failure behavior are documented in [the environment revision](upgrade/environment.md).
