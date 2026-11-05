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
